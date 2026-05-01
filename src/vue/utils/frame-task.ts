export interface FrameCoalescer<T> {
  request(value: T): void;
  cancel(): void;
  latest(): T | undefined;
}

// Phase 2 should replace this component-local helper with scheduler-owned frame tasks.
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
