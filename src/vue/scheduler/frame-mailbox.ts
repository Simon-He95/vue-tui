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

const EMPTY = Symbol("frame-mailbox-empty");

/**
 * Coalesces many producer updates into a single scheduler frame task.
 *
 * This helper is currently internal to vue-tui. It is used by library
 * components and internal tests, but it is not exported from the package root.
 *
 * Default behavior keeps only the latest queued value. If `merge` is provided,
 * the pending value is updated with `merge(prev, next)`.
 *
 * Only the first queue() call in a pending cycle schedules a frame task.
 * Later queue() calls update the pending payload and are reported as dropped
 * producer updates when the frame task runs.
 *
 * droppedUpdates are reported at frame-task execution time. They only appear in
 * framePerf when apply() also invalidates and produces a rendered frame sample.
 *
 * cancel() is best-effort at scheduler level. The run callback still guards
 * `disposed || !hasPending`, because a scheduler may already have taken a
 * snapshot of tasks for the current frame.
 *
 * queue() assumes the scheduler accepts the task. Owners should call
 * dispose() before the component/scope that owns the mailbox is destroyed.
 *
 * id is scheduler-global. Components should include instance id and producer
 * name, for example `TList:${uid}:wheel`.
 */
export function createFrameMailbox<T>(options: FrameMailboxOptions<T>) {
  let disposed = false;
  let hasPending = false;
  let pending: T | typeof EMPTY = EMPTY;
  let queued = 0;
  let pendingTaskId: string | null = null;

  function clearPending(): void {
    hasPending = false;
    pending = EMPTY;
    queued = 0;
    pendingTaskId = null;
  }

  function currentTaskId(): string {
    if (pendingTaskId) return pendingTaskId;
    const id = typeof options.id === "function" ? options.id() : options.id;
    if (!id) {
      throw new Error("createFrameMailbox requires a non-empty task id");
    }
    pendingTaskId = id;
    return pendingTaskId;
  }

  function queue(value: T): boolean {
    if (disposed) return false;
    const wasPending = hasPending;
    const taskId = wasPending ? pendingTaskId! : currentTaskId();

    if (hasPending && options.merge) pending = options.merge(pending as T, value);
    else pending = value;

    hasPending = true;
    queued++;
    if (wasPending) return true;

    const accepted = options.scheduler.queueFrameTask({
      id: taskId,
      reason: options.reason,
      priority: options.priority,
      sync: options.sync,
      run(ctx) {
        if (disposed || !hasPending) return;

        const value = pending as T;
        const count = queued;
        const dropped = Math.max(0, count - 1);

        clearPending();
        ctx.reportDroppedUpdates?.(dropped);

        options.apply(value, ctx, {
          queued: count,
          dropped,
        });
      },
    });

    if (!accepted) {
      clearPending();
      return false;
    }

    return true;
  }

  function cancel(): void {
    const taskId = pendingTaskId;
    clearPending();
    if (taskId) options.scheduler.cancelFrameTask?.(taskId);
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
    // Ambiguous when T includes undefined. Pair with hasPending() to
    // distinguish "pending undefined" from "no pending value".
    peek: () => (hasPending ? (pending as T) : undefined),
  } as const;
}
