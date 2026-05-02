import type { FramePerfReason } from "../../observability/frame-perf.js";
import type {
  TerminalFrameContext,
  TerminalFrameTask,
  TerminalFrameTaskPriority,
  TerminalSchedulerConfig,
  TerminalSchedulerInvalidateOptions,
} from "../context.js";
import { framePerfNow, mergeFramePerfReason } from "../../observability/frame-perf.js";

export type SchedulerFrameTaskRunStats = Readonly<{
  frameTaskCount: number;
  coalescedFrameTasks: number;
  remainingFrameTasks: number;
  reason: FramePerfReason;
  sync: boolean;
  requestMore: boolean;
}>;

export const EMPTY_FRAME_TASK_RUN_STATS: SchedulerFrameTaskRunStats = Object.freeze({
  frameTaskCount: 0,
  coalescedFrameTasks: 0,
  remainingFrameTasks: 0,
  reason: "unknown",
  sync: false,
  requestMore: false,
});

type SchedulerFrameTasksOptions = Readonly<{
  isActive: () => boolean;
  invalidate: (options?: TerminalSchedulerInvalidateOptions) => void;
  flushFrame: (stats: SchedulerFrameTaskRunStats) => void;
}>;

type ScheduledFrameHandle =
  | Readonly<{ kind: "raf"; id: number }>
  | Readonly<{ kind: "timer"; id: ReturnType<typeof setTimeout> }>;

const SCHEDULED_SENTINEL = Symbol("scheduled-frame-task");

const PRIORITY_RANK: Record<TerminalFrameTaskPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

function normalizePriority(
  priority: TerminalFrameTaskPriority | undefined,
): TerminalFrameTaskPriority {
  return priority ?? "normal";
}

function mergePriority(
  prev: TerminalFrameTaskPriority,
  next: TerminalFrameTaskPriority,
): TerminalFrameTaskPriority {
  return PRIORITY_RANK[next] > PRIORITY_RANK[prev] ? next : prev;
}

function mergeFrameTasks(prev: TerminalFrameTask, next: TerminalFrameTask): TerminalFrameTask {
  return {
    ...next,
    reason: mergeFramePerfReason(prev.reason, next.reason),
    priority: mergePriority(normalizePriority(prev.priority), normalizePriority(next.priority)),
    sync: prev.sync === true || next.sync === true,
  };
}

function orderedTasks(tasks: readonly TerminalFrameTask[]): TerminalFrameTask[] {
  const high: TerminalFrameTask[] = [];
  const normal: TerminalFrameTask[] = [];
  const low: TerminalFrameTask[] = [];
  for (const task of tasks) {
    const priority = normalizePriority(task.priority);
    if (priority === "high") high.push(task);
    else if (priority === "low") low.push(task);
    else normal.push(task);
  }
  return [...high, ...normal, ...low];
}

export function createSchedulerFrameTasks(options: SchedulerFrameTasksOptions) {
  let targetFps = 30;
  let maxFps = 60;
  let frameBudgetMs = 8;
  let insideFrame = false;
  let frameTaskFrameId = 0;
  let frameTaskToken = 0;
  let scheduledFrame: ScheduledFrameHandle | typeof SCHEDULED_SENTINEL | null = null;
  let scheduledLiveOnly = false;
  let runningScheduledFrame = false;
  let pendingScheduleMicrotask = false;
  let pendingScheduleRequestMore = false;
  let coalescedFrameTasks = 0;

  const frameTasksById = new Map<string, TerminalFrameTask>();
  const anonymousFrameTasks: TerminalFrameTask[] = [];
  const liveReasons = new Map<string, number>();

  function hasPendingFrameTasks(): boolean {
    return frameTasksById.size > 0 || anonymousFrameTasks.length > 0;
  }

  function remainingFrameTasks(): number {
    return frameTasksById.size + anonymousFrameTasks.length;
  }

  function liveIntervalMs(): number {
    const fps = Math.max(1, Math.min(maxFps, targetFps));
    return 1_000 / fps;
  }

  function taskIntervalMs(): number {
    return 1_000 / Math.max(1, maxFps);
  }

  function requestFrame(cb: FrameRequestCallback, liveOnly: boolean): ScheduledFrameHandle {
    const g = globalThis as any;
    if (
      !liveOnly &&
      typeof g.requestAnimationFrame === "function" &&
      typeof g.cancelAnimationFrame === "function"
    ) {
      return { kind: "raf", id: g.requestAnimationFrame(cb) };
    }
    const id = setTimeout(() => cb(framePerfNow()), liveOnly ? liveIntervalMs() : taskIntervalMs());
    return { kind: "timer", id };
  }

  function cancelFrame(handle: ScheduledFrameHandle): void {
    if (handle.kind === "raf") {
      (globalThis as any).cancelAnimationFrame?.(handle.id);
      return;
    }
    clearTimeout(handle.id);
  }

  function scheduleFrame(liveOnly: boolean): void {
    if (!options.isActive()) return;
    if (scheduledFrame) {
      if (scheduledLiveOnly && !liveOnly) cancelScheduledFrame();
      else return;
    }
    const token = ++frameTaskToken;
    scheduledLiveOnly = liveOnly;
    scheduledFrame = SCHEDULED_SENTINEL;
    const handle = requestFrame((time) => {
      if (token !== frameTaskToken) return;
      scheduledFrame = null;
      scheduledLiveOnly = false;
      runScheduledFrame(time);
    }, liveOnly);
    if (scheduledFrame === SCHEDULED_SENTINEL) scheduledFrame = handle;
  }

  function cancelScheduledFrame(): void {
    frameTaskToken++;
    const handle = scheduledFrame;
    scheduledFrame = null;
    scheduledLiveOnly = false;
    pendingScheduleMicrotask = false;
    pendingScheduleRequestMore = false;
    if (handle && handle !== SCHEDULED_SENTINEL) cancelFrame(handle);
  }

  function addDeferredTask(task: TerminalFrameTask): void {
    if (!task.id) {
      anonymousFrameTasks.push(task);
      return;
    }
    const existing = frameTasksById.get(task.id);
    frameTasksById.set(task.id, existing ? mergeFrameTasks(existing, task) : task);
  }

  function requeueDeferredTasks(tasks: readonly TerminalFrameTask[]): void {
    if (!tasks.length) return;
    const queuedById = new Map(frameTasksById);
    const queuedAnonymous = anonymousFrameTasks.splice(0);
    frameTasksById.clear();
    for (const task of tasks) addDeferredTask(task);
    for (const task of queuedById.values()) addDeferredTask(task);
    anonymousFrameTasks.push(...queuedAnonymous);
  }

  function takeOrderedTasks(): TerminalFrameTask[] {
    const tasks = orderedTasks([...frameTasksById.values(), ...anonymousFrameTasks]);
    frameTasksById.clear();
    anonymousFrameTasks.length = 0;
    return tasks;
  }

  function runPendingFrameTasks(
    optionsForRun?: Readonly<{ force?: boolean }>,
  ): SchedulerFrameTaskRunStats {
    if (!options.isActive()) return EMPTY_FRAME_TASK_RUN_STATS;

    const force = optionsForRun?.force === true;
    const tasks = takeOrderedTasks();
    if (!tasks.length) return EMPTY_FRAME_TASK_RUN_STATS;

    const startedAt = framePerfNow();
    const currentFrameId = ++frameTaskFrameId;
    const coalesced = coalescedFrameTasks;
    coalescedFrameTasks = 0;
    let requestMore = false;
    let frameTaskCount = 0;
    let frameReason: FramePerfReason = "unknown";
    let shouldSync = false;
    const deferredTasks: TerminalFrameTask[] = [];

    const ctx: TerminalFrameContext = {
      frameId: currentFrameId,
      startedAt,
      now: framePerfNow,
      budgetMs: frameBudgetMs,
      remainingMs: () => Math.max(0, frameBudgetMs - (framePerfNow() - startedAt)),
      requestMore: () => {
        requestMore = true;
      },
      invalidate: (invalidateOptions) => {
        frameReason = mergeFramePerfReason(frameReason, invalidateOptions?.reason);
        if ((invalidateOptions?.priority ?? "normal") === "high") shouldSync = true;
        options.invalidate(invalidateOptions);
      },
    };

    insideFrame = true;
    try {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]!;
        const priority = normalizePriority(task.priority);
        if (!force && frameTaskCount > 0 && priority !== "high" && ctx.remainingMs() <= 0) {
          deferredTasks.push(...tasks.slice(i));
          requestMore = true;
          break;
        }

        frameTaskCount++;
        frameReason = mergeFramePerfReason(frameReason, task.reason);
        shouldSync = shouldSync || task.sync === true || priority === "high";
        task.run(ctx);

        if (!force && priority !== "high" && ctx.remainingMs() <= 0 && i < tasks.length - 1) {
          deferredTasks.push(...tasks.slice(i + 1));
          requestMore = true;
          break;
        }
      }
    } finally {
      insideFrame = false;
    }

    requeueDeferredTasks(deferredTasks);

    const remaining = remainingFrameTasks();
    return {
      frameTaskCount,
      coalescedFrameTasks: coalesced,
      remainingFrameTasks: remaining,
      reason: frameReason,
      sync: shouldSync,
      requestMore,
    };
  }

  function scheduleIfNeeded(requestMore = false): void {
    if (!options.isActive()) return;
    const hasTasks = hasPendingFrameTasks();
    if (!requestMore && !hasTasks && liveReasons.size === 0) return;
    if (!runningScheduledFrame) {
      scheduleFrame(!requestMore && !hasTasks);
      return;
    }
    if (requestMore) pendingScheduleRequestMore = true;
    if (pendingScheduleMicrotask) return;
    pendingScheduleMicrotask = true;
    queueMicrotask(() => {
      pendingScheduleMicrotask = false;
      const requestMore = pendingScheduleRequestMore;
      pendingScheduleRequestMore = false;
      if (!options.isActive()) return;
      scheduleIfNeeded(requestMore);
    });
  }

  function runScheduledFrame(_time = framePerfNow()): void {
    if (!options.isActive()) return;
    runningScheduledFrame = true;
    try {
      const stats = runPendingFrameTasks();
      if (stats.frameTaskCount > 0) options.flushFrame(stats);
      scheduleIfNeeded(stats.requestMore);
    } finally {
      runningScheduledFrame = false;
    }
  }

  function configure(config: TerminalSchedulerConfig): void {
    if (config.targetFps != null && Number.isFinite(config.targetFps) && config.targetFps > 0)
      targetFps = config.targetFps;
    if (config.maxFps != null && Number.isFinite(config.maxFps) && config.maxFps > 0)
      maxFps = config.maxFps;
    if (
      config.frameBudgetMs != null &&
      Number.isFinite(config.frameBudgetMs) &&
      config.frameBudgetMs >= 0
    )
      frameBudgetMs = config.frameBudgetMs;
  }

  function queueFrameTask(task: TerminalFrameTask): void {
    if (!options.isActive()) return;
    if (task.id) {
      const prev = frameTasksById.get(task.id);
      if (prev) {
        coalescedFrameTasks++;
        frameTasksById.set(task.id, mergeFrameTasks(prev, task));
      } else {
        frameTasksById.set(task.id, task);
      }
    } else {
      anonymousFrameTasks.push(task);
    }
    scheduleFrame(false);
  }

  function requestLive(reason: string): () => void {
    const key = String(reason || "unknown");
    liveReasons.set(key, (liveReasons.get(key) ?? 0) + 1);
    scheduleIfNeeded();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      dropLive(key);
    };
  }

  function dropLive(reason: string): void {
    const key = String(reason || "unknown");
    const next = (liveReasons.get(key) ?? 0) - 1;
    if (next > 0) liveReasons.set(key, next);
    else liveReasons.delete(key);
    if (liveReasons.size === 0 && scheduledLiveOnly && !hasPendingFrameTasks())
      cancelScheduledFrame();
  }

  return {
    configure,
    queueFrameTask,
    requestLive,
    dropLive,
    isInsideFrame: () => insideFrame,
    cancelScheduledFrame,
    runPendingFrameTasks,
    scheduleIfNeeded,
    remainingFrameTasks,
    liveReasonList: () => Array.from(liveReasons.keys()).sort(),
    queueDepth: () => (scheduledFrame ? 1 : 0),
  } as const;
}
