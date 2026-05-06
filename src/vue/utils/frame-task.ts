export interface FrameCoalescer<T> {
  request(value: T): void;
  cancel(): void;
  latest(): T | undefined;
}

// Legacy internal Phase 1 helper.
// New high-frequency producers should use createFrameMailbox() so latest-only
// payloads, cancellation, scheduler rejection, and droppedUpdates metrics are
// handled consistently.
export function createFrameCoalescer<T>(apply: (latest: T) => void): FrameCoalescer<T> {
  let queued = false;
  let latestValue: T | undefined;
  let cancelQueued: (() => void) | null = null;

  const run = () => {
    if (!queued) return;
    queued = false;
    cancelQueued = null;
    const value = latestValue as T;
    latestValue = undefined;
    apply(value);
  };

  return {
    request(value: T): void {
      latestValue = value;
      if (queued) return;
      queued = true;
      if (typeof requestAnimationFrame === "function") {
        let id = 0;
        cancelQueued = () => {
          if (!queued) return;
          queued = false;
          latestValue = undefined;
          cancelAnimationFrame(id);
        };
        id = requestAnimationFrame(run);
        return;
      }
      const id = setTimeout(run, 16);
      cancelQueued = () => {
        if (!queued) return;
        queued = false;
        latestValue = undefined;
        clearTimeout(id);
      };
    },
    cancel(): void {
      cancelQueued?.();
      cancelQueued = null;
    },
    latest(): T | undefined {
      return latestValue;
    },
  };
}
