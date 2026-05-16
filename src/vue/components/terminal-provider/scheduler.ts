import type { ShallowRef } from "vue";
import type { TerminalRenderPlane, TerminalRenderPlanes } from "../../../core/render-plane.js";
import type { Terminal } from "../../../core/types.js";
import type { FramePerfStore } from "../../../observability/frame-perf-store.js";
import type { TuiProfiler } from "../../../observability/tui-profiler.js";
import type { DomRenderer } from "../../../renderer/dom/dom-renderer.js";
import type { TerminalScheduler, TerminalSchedulerInvalidateOptions } from "../../context.js";
import type { RenderManager } from "../../render/render-manager.js";
import { nextTick } from "vue";
import { TERMINAL_RENDER_PLANES } from "../../../core/render-plane.js";
import { framePerfNow, mergeFramePerfReason } from "../../../observability/frame-perf.js";
import {
  EMPTY_FRAME_TASK_RUN_STATS,
  type SchedulerFrameTaskRunStats,
  createSchedulerFrameTasks,
} from "../../scheduler/frame-scheduler.js";

export function createTerminalProviderScheduler(options: {
  terminal: Terminal;
  renderer: ShallowRef<DomRenderer | null>;
  render: RenderManager;
  framePerf: FramePerfStore;
  profiler: TuiProfiler | null;
  isUnmounting: () => boolean;
  afterFlush: () => void;
}) {
  const { terminal, renderer, render, framePerf, profiler, isUnmounting, afterFlush } = options;
  let raf = 0;
  let rafToken = 0;
  let pendingInvalidate = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let holdNormalInvalidates = false;
  let holdReleaseToken = 0;
  let pendingInvalidateDuringFrame = false;
  let pendingInvalidateAllPlanes = false;
  const pendingInvalidatePlanes = new Set<TerminalRenderPlane>();
  let frameId = 0;
  let pendingFrameReason: TerminalSchedulerInvalidateOptions["reason"] = "unknown";
  let pendingCoalescedInvalidates = 0;
  let api!: TerminalScheduler;

  function queueInvalidatePlane(plane?: TerminalRenderPlane): void {
    if (!plane) {
      pendingInvalidateAllPlanes = true;
      pendingInvalidatePlanes.clear();
      return;
    }
    if (pendingInvalidateAllPlanes) return;
    pendingInvalidatePlanes.add(plane);
  }

  const sortRenderPlanes = (planes: TerminalRenderPlanes): TerminalRenderPlanes => {
    const order = new Map<TerminalRenderPlane, number>(
      TERMINAL_RENDER_PLANES.map((plane, index) => [plane, index]),
    );
    return [...planes].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  };

  function takeActivePlanes(): TerminalRenderPlanes | null {
    if (pendingInvalidateAllPlanes) {
      pendingInvalidateAllPlanes = false;
      pendingInvalidatePlanes.clear();
      return null;
    }
    if (pendingInvalidatePlanes.size === 0) return null;
    const activePlanes = sortRenderPlanes(Array.from(pendingInvalidatePlanes));
    pendingInvalidatePlanes.clear();
    return activePlanes;
  }

  function noteFrameReason(reason: TerminalSchedulerInvalidateOptions["reason"]): void {
    if (!reason || reason === "unknown") return;
    pendingFrameReason = mergeFramePerfReason(pendingFrameReason, reason);
  }

  function resetPendingFramePerfState(): void {
    pendingFrameReason = "unknown";
    pendingCoalescedInvalidates = 0;
  }

  function rendererFlushCount(): number {
    return renderer.value?.debugStats.flush.count ?? 0;
  }

  function latestRendererFlushMs(previousCount: number): number | undefined {
    const flush = renderer.value?.debugStats.flush;
    if (!flush || flush.count === previousCount) return undefined;
    return flush.last?.durationMs;
  }

  const frameScheduler = createSchedulerFrameTasks({
    isActive: () => !isUnmounting(),
    invalidate: (invalidateOptions) => api.invalidate(invalidateOptions),
    flushFrame: (stats) => {
      if (!pendingInvalidateDuringFrame) return;
      pendingInvalidateDuringFrame = false;
      flush(stats.sync, stats);
    },
  });

  function queueDepth(): number {
    return (
      (raf ? 1 : 0) + (timer ? 1 : 0) + (pendingInvalidate ? 1 : 0) + frameScheduler.queueDepth()
    );
  }

  function flush(
    sync = false,
    frameTasks: SchedulerFrameTaskRunStats = EMPTY_FRAME_TASK_RUN_STATS,
  ): void {
    if (isUnmounting()) return;
    const activePlanes = takeActivePlanes();
    if (!framePerf.enabled.value) {
      render.render({ activePlanes });
      terminal.commit({ planes: activePlanes, sync });
      resetPendingFramePerfState();
      afterFlush();
      return;
    }

    const startedAt = framePerfNow();
    const currentFrameId = ++frameId;
    const reason = mergeFramePerfReason(pendingFrameReason, frameTasks.reason);
    const coalescedInvalidates = pendingCoalescedInvalidates;
    resetPendingFramePerfState();
    const renderStartedAt = framePerfNow();
    const stats = render.render({ activePlanes });
    const renderManagerMs = framePerfNow() - renderStartedAt;
    const flushCountBeforeCommit = rendererFlushCount();
    const commitStartedAt = framePerfNow();
    const dirtyRows = terminal.commit({ planes: activePlanes, sync });
    const commitMs = framePerfNow() - commitStartedAt;
    framePerf.push({
      frameId: currentFrameId,
      reason,
      startedAt,
      durationMs: framePerfNow() - startedAt,
      renderManagerMs,
      commitMs,
      domFlushMs: latestRendererFlushMs(flushCountBeforeCommit),
      dirtyRows: dirtyRows === null ? null : dirtyRows.length,
      activePlanes: activePlanes ? [...activePlanes] : null,
      scannedNodes: stats?.scannedNodes ?? 0,
      paintedNodes: stats?.paintedNodes ?? 0,
      rowBucketFallbacks: stats?.rowBucketFallbacks,
      coalescedInvalidates,
      frameTaskCount: frameTasks.frameTaskCount,
      coalescedFrameTasks: frameTasks.coalescedFrameTasks,
      frameTaskQueueDepthBeforeRun: frameTasks.frameTaskQueueDepthBeforeRun,
      frameTaskQueueDepthAfterRun: frameTasks.frameTaskQueueDepthAfterRun,
      remainingFrameTasks: frameTasks.remainingFrameTasks,
      droppedUpdates: frameTasks.droppedUpdates,
      ...(frameTasks.mailboxFailure ? { mailboxFailure: frameTasks.mailboxFailure } : {}),
      queueDepth: queueDepth(),
      liveReasons: (() => {
        const reasons = frameScheduler.liveReasonList();
        return reasons.length ? reasons : undefined;
      })(),
    });
    afterFlush();
  }

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function scheduleNormalInvalidateRelease(): void {
    const token = ++holdReleaseToken;
    void nextTick(() => {
      if (token !== holdReleaseToken) return;
      holdNormalInvalidates = false;
      if (isUnmounting() || !pendingInvalidate) return;
      pendingInvalidate = false;
      invalidate({ priority: "normal" });
    });
  }

  function flushNow(): void {
    if (isUnmounting()) return;
    if (frameScheduler.isInsideFrame()) return;
    pendingInvalidate = false;
    if (raf) {
      rafToken++;
      if (raf > 0) cancelAnimationFrame(raf);
      raf = 0;
    }
    clearTimer();
    frameScheduler.cancelScheduledFrame();
    const frameTasks = frameScheduler.runPendingFrameTasks({ force: true });
    pendingInvalidateDuringFrame = false;
    holdNormalInvalidates = true;
    scheduleNormalInvalidateRelease();
    flush(true, frameTasks);
    frameScheduler.scheduleIfNeeded(frameTasks.requestMore);
    if (Object.prototype.hasOwnProperty.call(frameTasks, "error")) throw frameTasks.error;
  }

  function invalidate(invalidateOptions?: TerminalSchedulerInvalidateOptions): void {
    if (isUnmounting()) return;

    const priority = invalidateOptions?.priority ?? "normal";
    noteFrameReason(invalidateOptions?.reason);
    queueInvalidatePlane(invalidateOptions?.plane);
    if (frameScheduler.isInsideFrame()) {
      pendingInvalidateDuringFrame = true;
      profiler?.recordInvalidate({ plane: invalidateOptions?.plane ?? null });
      return;
    }
    if (priority === "high") {
      profiler?.recordInvalidate({ plane: invalidateOptions?.plane ?? null });
      flushNow();
      return;
    }

    if (holdNormalInvalidates) {
      pendingInvalidate = true;
      return;
    }

    if (priority === "low") {
      if (timer || raf) {
        pendingCoalescedInvalidates++;
        return;
      }
      profiler?.recordInvalidate({ plane: invalidateOptions?.plane ?? null });
      timer = setTimeout(() => {
        timer = null;
        invalidate({ priority: "normal", plane: invalidateOptions?.plane });
      }, 16);
      return;
    }

    if (raf) {
      pendingInvalidate = true;
      pendingCoalescedInvalidates++;
      return;
    }
    profiler?.recordInvalidate({ plane: invalidateOptions?.plane ?? null });
    const token = ++rafToken;
    pendingInvalidate = false;

    raf = -1;
    const id = requestAnimationFrame(() => {
      if (isUnmounting()) return;
      if (token !== rafToken) return;
      flush();
      queueMicrotask(() => {
        if (isUnmounting()) return;
        if (token !== rafToken) return;
        raf = 0;
        if (pendingInvalidate) {
          pendingInvalidate = false;
          invalidate({ priority: "normal" });
        }
      });
    });
    if (raf === -1) raf = id;
  }

  function dispose(): void {
    clearTimer();
    holdReleaseToken++;
    frameScheduler.cancelScheduledFrame();
    if (raf > 0) cancelAnimationFrame(raf);
    raf = 0;
  }

  api = {
    invalidate,
    flush,
    flushNow,
    configure: frameScheduler.configure,
    queueFrameTask: frameScheduler.queueFrameTask,
    cancelFrameTask: frameScheduler.cancelFrameTask,
    requestLive: frameScheduler.requestLive,
    dropLive: frameScheduler.dropLive,
    isInsideFrame: frameScheduler.isInsideFrame,
  };

  return { api, dispose } as const;
}
