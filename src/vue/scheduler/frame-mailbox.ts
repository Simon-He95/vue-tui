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

/**
 * Coalesces many producer updates into a single scheduler frame task.
 *
 * Default behavior keeps only the latest queued value. If `merge` is provided,
 * the pending value is updated with `merge(prev, next)`.
 *
 * Only the first queue() call in a pending cycle schedules a frame task.
 * Later queue() calls update the pending payload and are reported as dropped
 * producer updates when the frame task runs.
 *
 * cancel() is best-effort at scheduler level. The run callback still guards
 * `disposed || !hasPending`, because a scheduler may already have taken a
 * snapshot of tasks for the current frame.
 */
export function createFrameMailbox<T>(options: FrameMailboxOptions<T>) {
  let disposed = false;
  let hasPending = false;
  let pending!: T;
  let queued = 0;
  let pendingTaskId: string | null = null;

  function currentTaskId(): string {
    if (pendingTaskId) return pendingTaskId;
    const id = typeof options.id === "function" ? options.id() : options.id;
    if (!id) {
      throw new Error("createFrameMailbox requires a non-empty task id");
    }
    pendingTaskId = id;
    return pendingTaskId;
  }

  function queue(value: T): void {
    if (disposed) return;
    const wasPending = hasPending;
    const taskId = wasPending ? pendingTaskId! : currentTaskId();

    if (hasPending && options.merge) pending = options.merge(pending, value);
    else pending = value;

    hasPending = true;
    queued++;
    if (wasPending) return;

    options.scheduler.queueFrameTask({
      id: taskId,
      reason: options.reason,
      priority: options.priority,
      sync: options.sync,
      run(ctx) {
        if (disposed || !hasPending) return;

        const value = pending;
        const count = queued;
        const dropped = Math.max(0, count - 1);

        hasPending = false;
        queued = 0;
        pendingTaskId = null;
        ctx.reportDroppedUpdates(dropped);

        options.apply(value, ctx, {
          queued: count,
          dropped,
        });
      },
    });
  }

  function cancel(): void {
    const taskId = pendingTaskId;
    hasPending = false;
    queued = 0;
    pendingTaskId = null;
    if (taskId) options.scheduler.cancelFrameTask(taskId);
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
