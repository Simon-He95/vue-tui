import type {
  TerminalFrameContext,
  TerminalFrameTaskPriority,
  TerminalScheduler,
} from "../context.js";
import type { FramePerfReason } from "../../observability/frame-perf.js";

export type FrameMailboxApply<T> = (
  value: T,
  ctx: TerminalFrameContext,
  meta: {
    queued: number;
    dropped: number;
  },
) => void;

export type FrameMailboxOptions<T> = Readonly<{
  scheduler: TerminalScheduler;
  id: string | (() => string);
  reason?: FramePerfReason;
  priority?: TerminalFrameTaskPriority;
  sync?: boolean;
  merge?: (prev: T, next: T) => T;
  apply: FrameMailboxApply<T>;
}>;

export function createFrameMailbox<T>(options: FrameMailboxOptions<T>) {
  let disposed = false;
  let hasPending = false;
  let pending!: T;
  let queued = 0;

  function taskId(): string {
    return typeof options.id === "function" ? options.id() : options.id;
  }

  function queue(value: T): void {
    if (disposed) return;

    if (hasPending && options.merge) pending = options.merge(pending, value);
    else pending = value;

    hasPending = true;
    queued++;

    options.scheduler.queueFrameTask({
      id: taskId(),
      reason: options.reason,
      priority: options.priority,
      sync: options.sync,
      run(ctx) {
        if (disposed || !hasPending) return;

        const value = pending;
        const count = queued;

        hasPending = false;
        queued = 0;

        options.apply(value, ctx, {
          queued: count,
          dropped: Math.max(0, count - 1),
        });
      },
    });
  }

  function cancel(): void {
    hasPending = false;
    queued = 0;
  }

  function dispose(): void {
    disposed = true;
    cancel();
  }

  return {
    queue,
    cancel,
    dispose,
    hasPending: () => hasPending,
    peek: () => (hasPending ? pending : undefined),
  } as const;
}
