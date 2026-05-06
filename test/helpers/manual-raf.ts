export type ManualRaf = Readonly<{
  callbacks: Map<number, FrameRequestCallback>;
  scheduled: () => number;
  pending: () => number;
  runNext: (time?: number) => boolean;
  flush: (time?: number) => number;
  flushAll: (time?: number) => number;
  restore: () => void;
}>;

export function installManualRaf(): ManualRaf {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  let scheduled = 0;

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const nextId = ++id;
    scheduled++;
    callbacks.set(nextId, cb);
    return nextId;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((rafId: number) => {
    callbacks.delete(rafId);
  }) as typeof cancelAnimationFrame;

  function runNext(time = 0): boolean {
    const next = callbacks.entries().next().value;
    if (!next) return false;
    const [rafId, cb] = next;
    callbacks.delete(rafId);
    cb(time);
    return true;
  }

  function flushAll(time = 0): number {
    const pending = Array.from(callbacks.entries());
    callbacks.clear();
    for (const [, cb] of pending) cb(time);
    return pending.length;
  }

  return {
    callbacks,
    scheduled: () => scheduled,
    pending: () => callbacks.size,
    runNext,
    flush: flushAll,
    flushAll,
    restore() {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

export function flushAllRaf(raf: Pick<ManualRaf, "flushAll">, time = 0): number {
  return raf.flushAll(time);
}

export function disableRaf() {
  const g = globalThis as any;
  const previousRaf = g.requestAnimationFrame;
  const previousCancel = g.cancelAnimationFrame;
  g.requestAnimationFrame = undefined;
  g.cancelAnimationFrame = undefined;
  return {
    restore() {
      g.requestAnimationFrame = previousRaf;
      g.cancelAnimationFrame = previousCancel;
    },
  };
}
