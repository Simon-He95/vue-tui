import { describe, expect, it, vi } from "vitest";
import { createTerminalGraphicRenderQueue } from "../src/agent.js";
import {
  getTerminalGraphicTraceMetrics,
  resetTerminalGraphicTraceMetrics,
} from "../src/renderer/terminal-graphics-trace.js";

describe("terminal graphic render queue", () => {
  it("limits concurrency and caches results", async () => {
    const metrics: string[] = [];
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 1,
      onMetric: (metric) => metrics.push(metric.type),
    });
    const starts: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const renderA = vi.fn(async () => {
      starts.push("a");
      await firstGate;
      return "A";
    });
    const renderB = vi.fn(async () => {
      starts.push("b");
      return "B";
    });

    const first = queue.cached("a", undefined, renderA, (value) => value.length);
    const second = queue.cached("b", undefined, renderB, (value) => value.length);

    await Promise.resolve();
    expect(starts).toEqual(["a"]);
    expect(queue.stats()).toMatchObject({ active: 1, waiting: 1 });

    releaseFirst();

    await expect(first).resolves.toBe("A");
    await expect(second).resolves.toBe("B");
    await expect(queue.cached("a", undefined, renderA)).resolves.toBe("A");

    expect(renderA).toHaveBeenCalledTimes(1);
    expect(renderB).toHaveBeenCalledTimes(1);
    expect(metrics).toContain("queue-wait");
    expect(metrics).toContain("cache-hit");
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0, cacheEntries: 2 });
  });

  it("reuses a cache entry filled while a duplicate render waits for a slot", async () => {
    const metrics: string[] = [];
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 1,
      dedupeInflight: false,
      onMetric: (metric) => metrics.push(metric.type),
    });

    let resolveFirst!: (value: string) => void;
    const renderFirst = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const renderSecond = vi.fn(async () => "duplicate-render-should-not-run");

    const first = queue.cached("same-key", undefined, renderFirst, (value) => value.length);
    const second = queue.cached("same-key", undefined, renderSecond, (value) => value.length);

    await Promise.resolve();
    expect(queue.stats()).toMatchObject({ active: 1, waiting: 1 });
    expect(renderFirst).toHaveBeenCalledTimes(1);
    expect(renderSecond).not.toHaveBeenCalled();

    resolveFirst("rendered-once");

    await expect(first).resolves.toBe("rendered-once");
    await expect(second).resolves.toBe("rendered-once");
    expect(renderSecond).not.toHaveBeenCalled();
    expect(metrics).toContain("queue-wait");
    expect(metrics).toContain("cache-hit");
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0, cacheEntries: 1 });
  });

  it("does not cache a value that finishes after its caller is aborted", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1 });
    const controller = new AbortController();
    let finishStale!: (value: string) => void;

    const stale = queue.cached(
      "same-key",
      controller.signal,
      () =>
        new Promise<string>((resolve) => {
          finishStale = resolve;
        }),
      (value) => value.length,
    );

    await Promise.resolve();
    controller.abort();

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });

    // Simulate a converter that ignores AbortSignal and finishes later. The
    // queue must not cache this stale value after the component has unmounted or
    // scrolled out of the virtual viewport.
    finishStale("stale");
    await Promise.resolve();
    await Promise.resolve();

    const renderFresh = vi.fn(async () => "fresh");
    await expect(
      queue.cached("same-key", undefined, renderFresh, (value) => value.length),
    ).resolves.toBe("fresh");
    expect(renderFresh).toHaveBeenCalledTimes(1);
  });

  it("keeps same-key virtual scroll renders independent when one aborts", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1, dedupeInflight: false });
    const offscreenController = new AbortController();
    const visibleController = new AbortController();
    const calls: string[] = [];
    let resolveOffscreenStarted!: () => void;
    const offscreenStarted = new Promise<void>((resolve) => {
      resolveOffscreenStarted = resolve;
    });

    const offscreen = queue.cached(
      "row1",
      offscreenController.signal,
      async () => {
        calls.push("offscreen");
        resolveOffscreenStarted();
        await new Promise<void>((_, reject) => {
          offscreenController.signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
        return "offscreen";
      },
      (value) => value.length,
    );

    await offscreenStarted;

    const visible = queue.cached(
      "row1",
      visibleController.signal,
      async () => {
        calls.push("visible");
        return "row1";
      },
      (value) => value.length,
    );

    offscreenController.abort();

    await expect(offscreen).rejects.toMatchObject({ name: "AbortError" });
    await expect(visible).resolves.toBe("row1");
    expect(calls).toEqual(["offscreen", "visible"]);
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0, cacheEntries: 1 });
  });

  it("does not share abortable in-flight renders by default", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 2 });
    let calls = 0;

    const first = queue.cached(
      "same-key",
      undefined,
      async () => {
        calls++;
        await Promise.resolve();
        throw new Error("first render aborted");
      },
      (value) => String(value).length,
    );

    const second = queue.cached(
      "same-key",
      undefined,
      async () => {
        calls++;
        return "second render";
      },
      (value) => value.length,
    );

    await expect(first).rejects.toThrow("first render aborted");
    await expect(second).resolves.toBe("second render");
    expect(calls).toBe(2);
  });

  it("lets cached calls opt out of global in-flight dedupe", async () => {
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 2,
      dedupeInflight: true,
    });
    let calls = 0;

    const first = queue.cached(
      "same-key",
      undefined,
      async () => {
        calls++;
        await Promise.resolve();
        throw new Error("first render aborted");
      },
      (value) => String(value).length,
      { dedupeInflight: false },
    );

    const second = queue.cached(
      "same-key",
      undefined,
      async () => {
        calls++;
        return "second render";
      },
      (value) => value.length,
      { dedupeInflight: false },
    );

    await expect(first).rejects.toThrow("first render aborted");
    await expect(second).resolves.toBe("second render");
    expect(calls).toBe(2);
  });

  it("can explicitly dedupe pure in-flight renders", async () => {
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 2,
      dedupeInflight: true,
    });
    let resolve!: (value: string) => void;
    const render = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );

    const first = queue.cached("same-key", undefined, render, (value) => value.length);
    const second = queue.cached("same-key", undefined, async () => "unused");
    await Promise.resolve();

    expect(render).toHaveBeenCalledTimes(1);
    resolve("shared render");
    await expect(first).resolves.toBe("shared render");
    await expect(second).resolves.toBe("shared render");
  });

  it("caches nullish render results", async () => {
    const queue = createTerminalGraphicRenderQueue();
    const renderNull = vi.fn(async () => null as string | null);
    const renderUndefined = vi.fn(async () => undefined as string | undefined);

    await expect(
      queue.cached("null-result", undefined, renderNull, (value) =>
        value == null ? 0 : value.length,
      ),
    ).resolves.toBeNull();
    await expect(queue.cached("null-result", undefined, renderNull)).resolves.toBeNull();
    expect(renderNull).toHaveBeenCalledTimes(1);

    await expect(
      queue.cached("undefined-result", undefined, renderUndefined, (value) =>
        value == null ? 0 : value.length,
      ),
    ).resolves.toBeUndefined();
    await expect(
      queue.cached("undefined-result", undefined, renderUndefined),
    ).resolves.toBeUndefined();
    expect(renderUndefined).toHaveBeenCalledTimes(1);
  });

  it("treats non-finite cache size estimates as zero bytes", async () => {
    const queue = createTerminalGraphicRenderQueue();

    await expect(
      queue.cached(
        "bad-estimate",
        undefined,
        async () => "x",
        () => Number.NaN,
      ),
    ).resolves.toBe("x");

    expect(queue.stats().cacheBytes).toBe(0);
    expect(queue.stats().cacheEntries).toBe(1);
  });

  it("records queue wait trace metrics", async () => {
    resetTerminalGraphicTraceMetrics();

    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1 });
    let releaseFirst!: () => void;
    const first = queue.cached(
      "slow",
      undefined,
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve("slow");
        }),
      (value) => value.length,
    );
    const second = queue.cached(
      "queued",
      undefined,
      async () => "queued",
      (value) => value.length,
    );

    await Promise.resolve();
    const during = getTerminalGraphicTraceMetrics();
    expect(during.maxActiveRenders).toBeGreaterThanOrEqual(1);
    expect(during.maxWaitingRenders).toBeGreaterThanOrEqual(1);

    releaseFirst();
    await Promise.all([first, second]);

    const metrics = getTerminalGraphicTraceMetrics();
    expect(metrics.queueWaits).toBeGreaterThan(0);
    expect(metrics.totalQueueWaitMs).toBeGreaterThanOrEqual(0);
    expect(metrics.maxQueueWaitMs).toBeGreaterThanOrEqual(0);
    expect(metrics.maxCacheEntries).toBeGreaterThanOrEqual(2);
    expect(metrics.maxCacheBytes).toBeGreaterThanOrEqual(10);

    resetTerminalGraphicTraceMetrics();
  });

  it("rejects aborted waiters", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1 });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = queue.cached("a", undefined, async () => {
      await firstGate;
      return "A";
    });
    const controller = new AbortController();
    const second = queue.cached("b", controller.signal, async () => "B");
    const secondResult = second.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );

    await Promise.resolve();
    controller.abort();
    releaseFirst();

    await expect(first).resolves.toBe("A");
    expect(await secondResult).toMatchObject({
      ok: false,
      error: { name: "AbortError" },
    });
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("rejects waiters when cleared", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1 });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = queue.cached("a", undefined, async () => {
      await firstGate;
      return "A";
    });
    const second = queue.cached("b", undefined, async () => "B");
    const secondResult = second.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );

    await Promise.resolve();
    queue.clear();
    releaseFirst();

    await expect(first).resolves.toBe("A");
    expect(await secondResult).toMatchObject({
      ok: false,
      error: { name: "AbortError" },
    });
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0, cacheEntries: 0 });
  });

  it("keeps an active slot until aborted render work settles", async () => {
    const metrics: string[] = [];
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 1,
      onMetric: (metric) => metrics.push(metric.type),
    });

    const offscreen = new AbortController();
    let markStarted!: () => void;
    let finishOffscreen!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const finishGate = new Promise<void>((resolve) => {
      finishOffscreen = resolve;
    });

    const first = queue
      .cached("offscreen", offscreen.signal, async () => {
        markStarted();
        await finishGate;
        return "stale";
      })
      .then(
        () => ({ ok: true as const }),
        (error) => ({ ok: false as const, error }),
      );

    await started;

    let visibleStarted = false;
    const second = queue.cached("visible", undefined, async () => {
      visibleStarted = true;
      return "visible";
    });

    await Promise.resolve();
    expect(visibleStarted).toBe(false);

    offscreen.abort();
    await Promise.resolve();
    await Promise.resolve();

    expect(visibleStarted).toBe(false);
    expect(queue.stats()).toMatchObject({ active: 1, waiting: 1 });
    expect(await first).toMatchObject({ ok: false, error: { name: "AbortError" } });

    finishOffscreen();
    await expect(second).resolves.toBe("visible");
    expect(visibleStarted).toBe(true);
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0 });
    expect(metrics).toContain("render-abort");
  });
});
