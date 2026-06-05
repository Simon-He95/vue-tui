import { recordTerminalGraphicTrace } from "./terminal-graphics-trace.js";

export type TerminalGraphicRenderQueueMetric =
  | Readonly<{ type: "cache-hit"; key: string }>
  | Readonly<{ type: "cache-store"; key: string; bytes: number }>
  | Readonly<{ type: "evict"; key: string; bytes: number }>
  | Readonly<{ type: "queue-wait"; key: string; waitMs: number }>;

export type TerminalGraphicRenderQueueOptions = Readonly<{
  maxConcurrency?: number;
  maxEntries?: number;
  maxBytes?: number;
  ttlMs?: number;
  /**
   * Share in-flight renders for equal cache keys.
   *
   * Keep this disabled when render work observes a caller AbortSignal. This is
   * the safe default for viewport-bound graphics in virtual scrollers: an
   * offscreen row may abort while another still-visible row with the same cache
   * key is still valid. Duplicate queued renders are still cheap because each
   * task re-checks the cache after acquiring a concurrency slot, so a render
   * completed by an earlier row is reused instead of rendering again.
   */
  dedupeInflight?: boolean;
  onMetric?: (metric: TerminalGraphicRenderQueueMetric) => void;
}>;

export type TerminalGraphicRenderQueue = Readonly<{
  cached: <T>(
    key: string,
    signal: AbortSignal | undefined,
    render: () => Promise<T>,
    estimateBytes?: (value: T) => number,
    options?: Readonly<{ dedupeInflight?: boolean }>,
  ) => Promise<T>;
  clear: () => void;
  stats: () => Readonly<{
    active: number;
    waiting: number;
    cacheEntries: number;
    cacheBytes: number;
  }>;
}>;

type CacheEntry<T> = Readonly<{
  value: T;
  bytes: number;
  expiresAt: number;
}>;

type Waiter = Readonly<{
  start: () => void;
  reject: (error: Error) => void;
}>;

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function createAbortError(): Error {
  const error = new Error("Terminal graphic render aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function createTerminalGraphicRenderQueue(
  options: TerminalGraphicRenderQueueOptions = {},
): TerminalGraphicRenderQueue {
  const maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency ?? 2));
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 128));
  const maxBytes = Math.max(1, Math.floor(options.maxBytes ?? 32 * 1024 * 1024));
  const ttlMs = Math.max(1, Math.floor(options.ttlMs ?? 5 * 60_000));
  const dedupeInflight = options.dedupeInflight ?? false;

  let active = 0;
  let cacheBytes = 0;
  let generation = 0;

  const waiters: Waiter[] = [];
  const cache = new Map<string, CacheEntry<unknown>>();
  const inflight = new Map<string, Promise<unknown>>();

  function evictUntilBudget(): void {
    while (cache.size > maxEntries || cacheBytes > maxBytes) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) break;

      const entry = cache.get(oldestKey);
      cache.delete(oldestKey);

      if (entry) {
        cacheBytes -= entry.bytes;
        options.onMetric?.({ type: "evict", key: oldestKey, bytes: entry.bytes });
      }
    }
  }

  function setCache<T>(key: string, value: T, bytes: number): void {
    if (bytes > maxBytes) return;

    const prev = cache.get(key);
    if (prev) cacheBytes -= prev.bytes;

    cache.delete(key);
    cache.set(key, {
      value,
      bytes,
      expiresAt: Date.now() + ttlMs,
    });

    cacheBytes += bytes;
    options.onMetric?.({ type: "cache-store", key, bytes });
    recordTerminalGraphicTrace({ type: "cache-store", id: key, key, bytes });
    evictUntilBudget();
  }

  function getCache<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      cacheBytes -= entry.bytes;
      return null;
    }

    cache.delete(key);
    cache.set(key, entry);
    options.onMetric?.({ type: "cache-hit", key });
    recordTerminalGraphicTrace({ type: "cache-hit", id: key, key, bytes: entry.bytes });

    return entry.value as T;
  }

  function release(): void {
    active = Math.max(0, active - 1);
    pump();
  }

  function pump(): void {
    while (active < maxConcurrency && waiters.length > 0) {
      const waiter = waiters.shift()!;
      active++;
      waiter.start();
    }
  }

  function acquire(key: string, signal?: AbortSignal): Promise<() => void> {
    throwIfAborted(signal);

    if (active < maxConcurrency) {
      active++;
      return Promise.resolve(release);
    }

    const waitStartedAt = now();

    return new Promise((resolve, reject) => {
      let onAbort = () => undefined;
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };
      const waiter: Waiter = {
        start: () => {
          cleanup();
          const waitMs = now() - waitStartedAt;
          options.onMetric?.({
            type: "queue-wait",
            key,
            waitMs,
          });
          recordTerminalGraphicTrace({
            type: "queue-wait",
            id: key,
            key,
            durationMs: waitMs,
          });
          resolve(release);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };
      onAbort = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        cleanup();
        reject(createAbortError());
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      waiters.push(waiter);
    });
  }

  async function cached<T>(
    key: string,
    signal: AbortSignal | undefined,
    render: () => Promise<T>,
    estimateBytes: (value: T) => number = () => 0,
    cachedOptions: Readonly<{ dedupeInflight?: boolean }> = {},
  ): Promise<T> {
    throwIfAborted(signal);

    const cachedValue = getCache<T>(key);
    if (cachedValue != null) return cachedValue;
    recordTerminalGraphicTrace({ type: "cache-miss", id: key, key });

    const shouldDedupeInflight = cachedOptions.dedupeInflight ?? dedupeInflight;
    const existing = shouldDedupeInflight ? inflight.get(key) : undefined;
    if (existing) return raceAbort(existing as Promise<T>, signal);

    let promise!: Promise<T>;
    promise = (async () => {
      let releaseSlot: (() => void) | null = null;
      const renderGeneration = generation;

      try {
        releaseSlot = await acquire(key, signal);
        throwIfAborted(signal);

        // A duplicate render may have filled the cache while this caller was
        // waiting for a slot. Re-check here to avoid expensive duplicate
        // SVG/PNG/Sixel work during fast virtual-scroll viewport churn.
        const cachedAfterWait = getCache<T>(key);
        if (cachedAfterWait != null) return cachedAfterWait;

        const value = await render();
        throwIfAborted(signal);

        const bytes = Math.max(0, Math.floor(estimateBytes(value)));
        if (renderGeneration === generation) setCache(key, value, bytes);

        return value;
      } finally {
        releaseSlot?.();
        if (shouldDedupeInflight && inflight.get(key) === promise) inflight.delete(key);
      }
    })();

    if (shouldDedupeInflight) inflight.set(key, promise);
    return raceAbort(promise, signal);
  }

  return {
    cached,
    clear() {
      generation++;
      cache.clear();
      inflight.clear();
      const pending = waiters.splice(0);
      for (const waiter of pending) waiter.reject(createAbortError());
      cacheBytes = 0;
    },
    stats() {
      return {
        active,
        waiting: waiters.length,
        cacheEntries: cache.size,
        cacheBytes,
      };
    },
  };
}
