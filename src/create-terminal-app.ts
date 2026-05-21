import type { App, Component, Ref } from "vue";
import type { WidthProvider } from "./core/buffer/width.js";
import type { PathPickerProvider } from "./core/path-provider-types.js";
import { TERMINAL_RENDER_PLANES } from "./core/render-plane.js";
import type { TerminalRenderPlane, TerminalRenderPlanes } from "./core/render-plane.js";
import type { Style, Terminal } from "./core/types.js";
import type { CliEventManager, TerminalEventRecord } from "./events/index.js";
import type { ClipboardApi } from "./runtime/index.js";
import type { TerminalLinkOpenerLike } from "./vue/components/link/host.js";
import type {
  SelectionTextProvider,
  TerminalSelectionConfig,
  TerminalSelectionCopyPayload,
  TerminalSelectionRefreshOptions,
} from "./selection/terminal-selection.js";
import type { TInputPlugin } from "./vue/components/input/plugins/types.js";

import type {
  ImeAnchor,
  LayoutContext,
  TerminalContext,
  TerminalRuntime,
  TerminalRuntimeHandle,
  TerminalScheduler,
  TerminalSchedulerInvalidateOptions,
} from "./vue/context.js";
import process from "node:process";
import { defineComponent, h, provide, ref, shallowReactive, shallowRef } from "vue";
import { createHeadlessApp, createHeadlessRoot } from "./cli/headless-renderer.js";
import {
  defaultVueTuiFramePerfLogPath,
  defaultVueTuiProfileLogPath,
  installNodeFileWriters,
  nodeProfilerFileWriter,
  shouldInstallFileWriters,
} from "./cli/node-file-writers.js";
import { createNodePathPickerProvider } from "./cli/path-provider.js";
import { createTerminal } from "./core/index.js";
import { getPlaneTerminal, readTerminalRowForPlanes } from "./core/terminal/create-terminal.js";
import { createCliEventManager } from "./events/index.js";
import { getCliLatencyProfiler } from "./observability/cli-latency-node.js";
import { framePerfNow, mergeFramePerfReason } from "./observability/frame-perf.js";
import { createFramePerfStore } from "./observability/frame-perf-store.js";
import { createJsonlPerfSink } from "./observability/perf-sink.js";
import { createTraceStore } from "./observability/trace.js";
import { createTuiProfiler } from "./observability/tui-profiler.js";
import { HEADLESS_RENDERER_CAPABILITIES } from "./renderer/capabilities.js";
import { createTerminalSelectionController } from "./selection/terminal-selection.js";
import { createTInputHostPlugin } from "./vue/components/input/plugins/hostPlugin.js";
import {
  createDefaultTInputHostAdapter,
  defaultTInputHostPlugin,
} from "./vue/components/input/plugins/hostPlugin.node.js";
import {
  normalizeTerminalLinkOpener,
  TerminalLinkOpenerContextKey,
} from "./vue/components/link/host.js";
import { TRenderPlane } from "./vue/components/TRenderPlane.js";
import {
  EventZIndexContextKey,
  ImeAnchorContextKey,
  LayoutContextKey,
  TerminalContextKey,
  TInputPluginsContextKey,
  TPathPickerProviderContextKey,
  VisibilityContextKey,
} from "./vue/context.js";
import { RenderStackKey } from "./vue/render/context.js";
import { createRenderManager } from "./vue/render/render-manager.js";
import {
  EMPTY_FRAME_TASK_RUN_STATS,
  type SchedulerFrameTaskRunStats,
  createSchedulerFrameTasks,
} from "./vue/scheduler/frame-scheduler.js";
import {
  SUPPRESS_TERMINAL_POINTER_DOWN,
  SUPPRESS_TERMINAL_POINTER_MOVE,
  SUPPRESS_TERMINAL_POINTER_UP,
} from "./events/manager/selection-suppression.js";
import { envFlag, envString, firstNonEmptyEnv } from "./utils/env.js";

interface Portal {
  id: string;
  component: Component;
  plane: TerminalRenderPlane;
  props: Record<string, unknown>;
}

let portalId = 0;

type ResolvedTerminalSelectionConfig = Readonly<{
  enabled: boolean;
  autoCopy: boolean;
  copyOnMouseUp: boolean;
  style: Style;
}>;

function resolveSelectionConfig(
  config: TerminalSelectionConfig | undefined,
): ResolvedTerminalSelectionConfig {
  if (config == null || config === false) {
    return {
      enabled: false,
      autoCopy: true,
      copyOnMouseUp: true,
      style: { inverse: true },
    };
  }
  const value = config === true ? {} : config;
  return {
    enabled: true,
    autoCopy: value.autoCopy ?? true,
    copyOnMouseUp: value.copyOnMouseUp ?? true,
    style: value.style ?? { inverse: true },
  };
}

const unsupportedClipboard: ClipboardApi = {
  supported: false,
  async readText() {
    return "";
  },
  async writeText() {
    throw new Error("Clipboard unavailable");
  },
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function shallowEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

function shallowEqualRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (!shallowEqualValue(a[k], b[k])) return false;
  }
  return true;
}

export type TerminalApp = Readonly<{
  app: App;
  terminal: Terminal;
  events: CliEventManager;
  scheduler: TerminalScheduler;
  defaultStyle: Ref<Style>;
  /** Returns the current IME anchor position (cursor position in cell coordinates), or null if no input is focused */
  getImeAnchor: () => ImeAnchor | null;
  mount: () => void;
  dispose: () => void;
}>;

export type CreateTerminalAppOptions = Readonly<{
  cols: number;
  rows: number;
  component: Component;
  widthProvider?: WidthProvider;
  props?: Record<string, unknown>;
  defaultStyle?: Style;
  clipboard?: ClipboardApi;
  selection?: TerminalSelectionConfig;
  onSelectionCopy?: (payload: TerminalSelectionCopyPayload) => void;
  inputPlugins?: readonly TInputPlugin[];
  pathPickerProvider?: PathPickerProvider;
  linkOpener?: TerminalLinkOpenerLike;
}>;

export function createTerminalApp(options: CreateTerminalAppOptions): TerminalApp {
  const env = (process?.env ?? {}) as Record<string, unknown>;
  if (shouldInstallFileWriters(env)) installNodeFileWriters();
  const widthProvider = options.widthProvider ?? "default";
  const profileEnabled = envFlag(env, "VUE_TUI_PROFILE", "DIMCODE_PROFILE_TUI");
  const profileLogPath = envString(env, "VUE_TUI_PROFILE_LOG_PATH", "DIMCODE_PROFILE_TUI_LOG_PATH");
  const framePerfLogPath =
    envString(env, "VUE_TUI_FRAME_PERF_LOG_PATH", "DIMCODE_TUI_PERF_LOG") ||
    (profileLogPath.endsWith(".jsonl") ? profileLogPath : defaultVueTuiFramePerfLogPath());
  const framePerfSink = profileEnabled
    ? createJsonlPerfSink({
        file: framePerfLogPath,
        fileWriter: nodeProfilerFileWriter,
        includeComponents: envFlag(
          env,
          "VUE_TUI_PROFILE_COMPONENTS",
          "DIMCODE_PROFILE_TUI_COMPONENTS",
        ),
        includeEvents: envFlag(env, "VUE_TUI_PROFILE_EVENTS", "DIMCODE_PROFILE_TUI_EVENTS"),
      })
    : undefined;

  const terminal: Terminal = createTerminal({
    cols: options.cols,
    rows: options.rows,
    widthProvider,
  });
  const trace = createTraceStore({
    enabled: Boolean((globalThis as any).__VT_DEBUG_TRACE__),
  });
  const framePerf = createFramePerfStore(120, {
    enabled: Boolean((globalThis as any).__VT_DEBUG_PERF__) || profileEnabled,
    sink: framePerfSink,
  });
  const latency = getCliLatencyProfiler();
  const profiler = createTuiProfiler("cli-scheduler", {
    fileWriter: nodeProfilerFileWriter,
    defaultLogDest: "file",
    defaultLogPath: defaultVueTuiProfileLogPath(),
  });
  const baseEvents = createCliEventManager({
    record: (event) => {
      if (!trace.enabled.value) return;
      trace.push({ type: "event", at: Date.now(), event });
    },
    onFocusChange: (prev, next) => {
      if (!trace.enabled.value) return;
      trace.push({ type: "focus", at: Date.now(), prev, next });
    },
  });
  const render = createRenderManager(terminal, {
    widthProvider,
    profiler: {
      fileWriter: nodeProfilerFileWriter,
      defaultLogDest: "file",
      defaultLogPath: defaultVueTuiProfileLogPath(),
    },
  });
  const offCommit = terminal.on("commit", ({ dirtyRows, planes, sync }) => {
    latency?.recordCommit({ dirtyRows, planes, sync });
    if (!trace.enabled.value) return;
    trace.push({
      type: "commit",
      at: Date.now(),
      dirtyRows,
      planes,
      sync,
      focusedId: baseEvents.getFocused(),
    });
  });

  let scheduled = false;
  let flushing = false;
  let mounted = false;
  let disposed = false;
  let lastFlushAtMs = 0;
  let scheduledAtMs = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingInvalidateAfterFlush = false;
  let pendingInvalidateDuringFrame = false;
  let pendingInvalidateAllPlanes = false;
  const pendingInvalidatePlanes = new Set<TerminalRenderPlane>();
  let frameId = 0;
  let pendingFrameReason: TerminalSchedulerInvalidateOptions["reason"] = "unknown";
  let pendingCoalescedInvalidates = 0;
  let schedulerApi: TerminalScheduler;
  const throttleMs = (() => {
    const parseThrottle = (raw: unknown): number | null => {
      if (raw == null) return null;
      const v = Number(raw);
      return Number.isFinite(v) && v >= 0 ? v : null;
    };
    return (
      parseThrottle(firstNonEmptyEnv(env, "VUE_TUI_THROTTLE_MS", "DIMCODE_TUI_THROTTLE_MS")) ?? 0
    );
  })();
  const frameThrottleMs = (() => {
    if (!process?.stdout?.isTTY) return 0;
    return 16;
  })();

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

  function queueDepth(): number {
    return (
      (scheduled ? 1 : 0) +
      (timer ? 1 : 0) +
      (pendingInvalidateAfterFlush ? 1 : 0) +
      frameScheduler.queueDepth()
    );
  }

  function noteFrameReason(reason: TerminalSchedulerInvalidateOptions["reason"]): void {
    if (!reason || reason === "unknown") return;
    pendingFrameReason = mergeFramePerfReason(pendingFrameReason, reason);
  }

  function resetPendingFramePerfState(): void {
    pendingFrameReason = "unknown";
    pendingCoalescedInvalidates = 0;
  }

  const frameScheduler = createSchedulerFrameTasks({
    isActive: () => !disposed,
    invalidate: (options) => schedulerApi.invalidate(options),
    flushFrame: (stats) => {
      if (!pendingInvalidateDuringFrame) return;
      pendingInvalidateDuringFrame = false;
      flush(stats.sync, stats);
    },
  });

  function flush(
    sync?: boolean,
    frameTasks: SchedulerFrameTaskRunStats = EMPTY_FRAME_TASK_RUN_STATS,
  ): void {
    if (disposed) return;

    scheduled = false;
    flushing = true;

    const activePlanes = takeActivePlanes();
    latency?.recordFlushStart({ sync, activePlanes });
    if (!framePerf.enabled.value) {
      try {
        render.render({ activePlanes });
        terminal.commit({ planes: activePlanes, sync });
      } finally {
        latency?.recordFlushEnd();
        flushing = false;
        lastFlushAtMs = Date.now();
        scheduledAtMs = 0;
      }
      resetPendingFramePerfState();

      if (pendingInvalidateAfterFlush) {
        pendingInvalidateAfterFlush = false;
        flush(true);
      }
      return;
    }

    const startedAt = framePerfNow();
    const currentFrameId = ++frameId;
    const reason = mergeFramePerfReason(pendingFrameReason, frameTasks.reason);
    const coalescedInvalidates = pendingCoalescedInvalidates;
    resetPendingFramePerfState();
    let stats: ReturnType<typeof render.render> = null;
    let dirtyRows: readonly number[] | null = [];
    let renderManagerMs = 0;
    let commitMs = 0;
    try {
      const renderStartedAt = framePerfNow();
      stats = render.render({ activePlanes });
      renderManagerMs = framePerfNow() - renderStartedAt;
      const commitStartedAt = framePerfNow();
      dirtyRows = terminal.commit({ planes: activePlanes, sync });
      commitMs = framePerfNow() - commitStartedAt;
    } finally {
      latency?.recordFlushEnd();
      flushing = false;
      lastFlushAtMs = Date.now();
      scheduledAtMs = 0;
    }
    framePerf.push({
      frameId: currentFrameId,
      reason,
      startedAt,
      durationMs: framePerfNow() - startedAt,
      renderManagerMs,
      commitMs,
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

    if (pendingInvalidateAfterFlush) {
      pendingInvalidateAfterFlush = false;
      flush(true);
    }
  }

  function clearScheduledTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function scheduleFlushAt(atMs: number): void {
    const nowMs = Date.now();
    const delayMs = Math.max(0, atMs - nowMs);

    if (delayMs > 0) {
      clearScheduledTimer();
      scheduledAtMs = atMs;
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delayMs);
      return;
    }

    // CRITICAL: In ghostty, async scheduling works (keep-alive proves it).
    // We rely on the keep-alive interval to call flush() periodically.
    // This allows Vue's watchEffect to schedule updates before flush() is called.
    clearScheduledTimer();
    scheduledAtMs = nowMs;
    if (typeof (process as any).nextTick === "function") {
      (process as any).nextTick(() => {
        flush();
      });
    } else if (typeof (globalThis as any).setImmediate === "function") {
      (globalThis as any).setImmediate(() => {
        flush();
      });
    } else {
      setTimeout(() => {
        flush();
      }, 0);
    }
  }

  function flushNow(): void {
    if (disposed) return;
    if (flushing) return;
    if (frameScheduler.isInsideFrame()) return;
    clearScheduledTimer();
    frameScheduler.cancelScheduledFrame();
    const frameTasks = frameScheduler.runPendingFrameTasks({ force: true });
    pendingInvalidateDuringFrame = false;
    scheduled = false;
    flush(true, frameTasks);
    frameScheduler.scheduleIfNeeded(frameTasks.requestMore);
    if (Object.prototype.hasOwnProperty.call(frameTasks, "error")) throw frameTasks.error;
  }

  function invalidate(options?: TerminalSchedulerInvalidateOptions): void {
    if (disposed) return;
    const priority = options?.priority ?? "normal";
    noteFrameReason(options?.reason);
    latency?.recordSchedulerInvalidate({
      priority,
      plane: options?.plane ?? null,
    });
    queueInvalidatePlane(options?.plane);
    if (frameScheduler.isInsideFrame()) {
      pendingInvalidateDuringFrame = true;
      profiler?.recordInvalidate({ plane: options?.plane ?? null });
      return;
    }
    if (flushing) {
      pendingInvalidateAfterFlush = true;
      return;
    }

    profiler?.recordInvalidate({ plane: options?.plane ?? null });

    if (priority === "high") {
      flushNow();
      return;
    }

    const nowMs = Date.now();
    const throttleDelayMs = throttleMs > 0 ? Math.max(0, lastFlushAtMs + throttleMs - nowMs) : 0;
    const laneDelayMs =
      priority === "low"
        ? Math.max(throttleDelayMs, frameThrottleMs || 16)
        : priority === "normal"
          ? Math.max(throttleDelayMs, frameThrottleMs)
          : 0;
    const desiredAtMs = nowMs + laneDelayMs;

    if (!scheduled) {
      scheduled = true;
      scheduleFlushAt(desiredAtMs);
      return;
    }

    pendingCoalescedInvalidates++;

    if (!scheduledAtMs) {
      scheduleFlushAt(desiredAtMs);
      return;
    }

    if (!timer && scheduledAtMs === nowMs) {
      // Already scheduled via nextTick/setImmediate; can't reliably reschedule.
      return;
    }

    if (desiredAtMs < scheduledAtMs) scheduleFlushAt(desiredAtMs);
  }

  const portals = shallowReactive<Portal[]>([]);

  const runtime: TerminalRuntime = {
    mount(component, initialProps, options) {
      const id = `p${portalId++}`;
      let currentProps: Record<string, unknown> = { ...initialProps };
      // Portal entries must be reactive so prop updates (e.g. teleported dialogs)
      // trigger a Vue re-render of the portal VNode tree.
      const portal = shallowReactive<Portal>({
        id,
        component,
        plane: options?.plane ?? "overlay",
        props: currentProps,
      });
      portals.push(portal);
      let alive = true;
      const handle: TerminalRuntimeHandle = {
        update(nextProps) {
          if (!alive) return;
          const next = { ...currentProps, ...nextProps };
          if (shallowEqualRecord(currentProps, next)) return;
          currentProps = next;
          portal.props = currentProps;
          invalidate({ plane: portal.plane });
        },
        move(x, y) {
          if (!alive) return;
          const next = { ...currentProps, x, y };
          if (shallowEqualRecord(currentProps, next)) return;
          currentProps = next;
          portal.props = currentProps;
          invalidate({ plane: portal.plane });
        },
        unmount() {
          if (!alive) return;
          alive = false;
          const idx = portals.findIndex((p) => p.id === id);
          if (idx >= 0) portals.splice(idx, 1);
          invalidate({ plane: portal.plane });
        },
      };
      invalidate({ plane: portal.plane });
      return handle;
    },
  };

  const rootLayout = shallowReactive<LayoutContext>({
    originX: 0,
    originY: 0,
    clipRect: { x: 0, y: 0, w: options.cols, h: options.rows },
  });
  const selectionTextProviders = new Map<string, SelectionTextProvider>();
  const selectionCopyHandlers = new Set<(payload: TerminalSelectionCopyPayload) => void>();
  const selectionContext = {
    registerTextProvider(provider: SelectionTextProvider) {
      selectionTextProviders.set(provider.id, provider);
      return () => {
        if (selectionTextProviders.get(provider.id) !== provider) return;
        selectionTextProviders.delete(provider.id);
        selection.clearProvider(provider.id);
      };
    },
    onCopy(handler: (payload: TerminalSelectionCopyPayload) => void) {
      selectionCopyHandlers.add(handler);
      return () => selectionCopyHandlers.delete(handler);
    },
    refresh(options?: TerminalSelectionRefreshOptions) {
      selection.refresh(options);
    },
    clear() {
      selection.clear();
    },
  } as const;
  const selectionOverlay = getPlaneTerminal(terminal, "overlay");
  const selectionReadPlanes: TerminalRenderPlanes = ["default", "transcript", "chrome"];
  let selectionRenderNodeId: string | null = null;
  const selection = createTerminalSelectionController({
    terminal,
    overlayTerminal: selectionOverlay,
    clipboard: options.clipboard ?? unsupportedClipboard,
    getRow: (y) => readTerminalRowForPlanes(terminal, y, selectionReadPlanes),
    getTextProviders: () => Array.from(selectionTextProviders.values()),
    getOptions: () => {
      const config = resolveSelectionConfig(options.selection);
      return {
        autoCopy: config.autoCopy,
        copyOnMouseUp: config.copyOnMouseUp,
        style: config.style,
      };
    },
    onDirtyRows: (rows) => {
      if (selectionRenderNodeId && render.markDirtyRows(selectionRenderNodeId, rows)) {
        invalidate({ plane: "overlay", reason: "selection" });
        return;
      }
      invalidate({ plane: "overlay", reason: "selection" });
    },
    onCopy: (payload) => {
      options.onSelectionCopy?.(payload);
      for (const handler of selectionCopyHandlers) handler(payload);
      if (!trace.enabled.value) return;
      queueMicrotask(() => {
        trace.push({
          type: "selection-copy",
          at: Date.now(),
          rows: payload.rows,
          chars: payload.chars,
          ok: payload.ok,
          error: payload.error == null ? undefined : String(payload.error),
        });
      });
    },
  });
  if (resolveSelectionConfig(options.selection).enabled) {
    const selectionRenderNode = render.register({
      stack: render.rootStack,
      plane: "overlay",
      zIndex: -10_000,
      rect: { x: 0, y: 0, w: options.cols, h: options.rows },
      paint: selection.paint,
    });
    selectionRenderNodeId = selectionRenderNode.id;
  }

  let selecting = false;
  let selectionStartPoint: { x: number; y: number } | null = null;
  let selectionScrollOrigin: { x: number; y: number } | null = null;
  let selectionLastPoint: { x: number; y: number } | null = null;
  let selectionAutoScrollTimer: ReturnType<typeof setTimeout> | null = null;
  let selectionDragStarted = false;
  let suppressNextSelectionClick = false;

  const resetSelectionGesture = (options?: { clearSelection?: boolean }): void => {
    selecting = false;
    selectionStartPoint = null;
    selectionScrollOrigin = null;
    selectionLastPoint = null;
    selectionDragStarted = false;
    suppressNextSelectionClick = false;
    clearSelectionAutoScroll();

    if (options?.clearSelection ?? true) {
      selection.clear();
    }
  };

  const clearSelectionAutoScroll = () => {
    if (selectionAutoScrollTimer == null) return;
    clearTimeout(selectionAutoScrollTimer);
    selectionAutoScrollTimer = null;
  };

  const runSelectionAutoScroll = () => {
    selectionAutoScrollTimer = null;
    if (!selecting || !selectionScrollOrigin || !selectionLastPoint) return;
    const delta = baseEvents.autoScrollSelectionAt(
      selectionScrollOrigin.x,
      selectionScrollOrigin.y,
      selectionLastPoint.y,
    );
    if (!delta) return;
    selection.update(selectionLastPoint);
    selectionAutoScrollTimer = setTimeout(runSelectionAutoScroll, 80);
  };

  const scheduleSelectionAutoScroll = () => {
    if (selectionAutoScrollTimer != null) return;
    selectionAutoScrollTimer = setTimeout(runSelectionAutoScroll, 80);
  };

  const selectionEnabled = () => resolveSelectionConfig(options.selection).enabled;
  const eventPoint = (event: TerminalEventRecord) => ({
    x: Math.max(0, Math.floor((event as any).cellX ?? 0)),
    y: Math.max(0, Math.floor((event as any).cellY ?? 0)),
  });

  const dispatchWithSelection = (event: TerminalEventRecord): boolean => {
    if (!selectionEnabled()) return baseEvents.dispatch(event);

    if (
      event.type === "keydown" &&
      event.key === "Escape" &&
      (selecting || selection.state.value.active)
    ) {
      resetSelectionGesture({ clearSelection: true });
      return true;
    }

    if (event.type === "click" || event.type === "dblclick" || event.type === "contextmenu") {
      if (!suppressNextSelectionClick) return baseEvents.dispatch(event);
      suppressNextSelectionClick = false;
      return true;
    }

    if (event.type === "pointerdown") {
      suppressNextSelectionClick = false;
      selectionDragStarted = false;
      if (!selecting && (event.button ?? 0) === 0) {
        const point = eventPoint(event);
        if (baseEvents.canSelectAt(point.x, point.y)) {
          selection.start(point, { extend: Boolean(event.shiftKey) });
          selecting = true;
          selectionStartPoint = point;
          selectionScrollOrigin = point;
          selectionLastPoint = point;
          scheduleSelectionAutoScroll();

          // Set suppress flag and dispatch so the CLI event manager's
          // suppressed path still resolves focus/capture for parity
          // with the DOM event manager.
          (event as any)[SUPPRESS_TERMINAL_POINTER_DOWN] = true;
          baseEvents.dispatch(event);
          return true;
        }
      }
      return baseEvents.dispatch(event);
    }

    if (event.type === "pointermove" && selecting) {
      const point = eventPoint(event);
      selectionLastPoint = point;
      if (
        selectionStartPoint &&
        (point.x !== selectionStartPoint.x || point.y !== selectionStartPoint.y)
      ) {
        selectionDragStarted = true;
      }
      selection.update(point);
      scheduleSelectionAutoScroll();
      // Set suppress flag and dispatch so the CLI event manager's
      // suppressed path still updates hover state for parity with
      // the DOM event manager.
      (event as any)[SUPPRESS_TERMINAL_POINTER_MOVE] = true;
      baseEvents.dispatch(event);
      return true;
    }

    if (event.type === "pointerup" && selecting) {
      const point = eventPoint(event);
      if (
        !selectionStartPoint ||
        point.x !== selectionStartPoint.x ||
        point.y !== selectionStartPoint.y
      ) {
        selection.update(point);
      }
      const suppressActivation = selectionDragStarted || selection.state.value.hasRange;
      if (suppressActivation) {
        suppressNextSelectionClick = true;
        (event as any)[SUPPRESS_TERMINAL_POINTER_UP] = true;
      }
      selecting = false;
      selectionStartPoint = null;
      selectionScrollOrigin = null;
      selectionLastPoint = null;
      clearSelectionAutoScroll();
      const prevented = baseEvents.dispatch(event);
      void selection.finish();
      return suppressActivation || prevented;
    }

    return baseEvents.dispatch(event);
  };

  const events: CliEventManager = {
    ...baseEvents,
    dispatch: dispatchWithSelection,
    dispose() {
      clearSelectionAutoScroll();
      baseEvents.dispose();
    },
  };

  const inputPlugins =
    options.inputPlugins ??
    (options.clipboard
      ? [
          createTInputHostPlugin(() => ({
            ...createDefaultTInputHostAdapter(),
            isTerminalLike: true,
            async readClipboardText() {
              if (!options.clipboard?.supported) return "";
              try {
                return await options.clipboard.readText();
              } catch {
                return "";
              }
            },
            async writeClipboardText(text: string) {
              if (!text || !options.clipboard?.supported) return false;
              try {
                await options.clipboard.writeText(text);
                return true;
              } catch {
                return false;
              }
            },
          })),
        ]
      : [defaultTInputHostPlugin]);
  const linkOpener = ref(normalizeTerminalLinkOpener(options.linkOpener));
  const offResize = terminal.on("resize", ({ cols, rows }) => {
    rootLayout.clipRect = { x: 0, y: 0, w: cols, h: rows };
    selection.clear();
    if (selectionRenderNodeId) {
      render.update(selectionRenderNodeId, {
        rect: { x: 0, y: 0, w: cols, h: rows },
      });
    }
    // Ensure resize triggers a re-render even if no other reactive state changes.
    invalidate({ reason: "resize" });
  });

  schedulerApi = {
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

  const ctx: TerminalContext = {
    terminal,
    renderer: shallowRef(null as any),
    rendererCapabilities: shallowRef(HEADLESS_RENDERER_CAPABILITIES),
    events: shallowRef(events as any),
    scheduler: schedulerApi,
    runtime,
    observability: { trace, framePerf },
    selection: selectionContext,
    defaultStyle: ref(options.defaultStyle ?? {}),
    widthProvider,
    render,
  };

  // IME anchor tracking for CLI mode - allows external code to position the terminal cursor
  const imeAnchor = shallowRef<ImeAnchor | null>(null);

  const Root = defineComponent({
    name: "TerminalAppRoot",
    setup() {
      provide(TerminalContextKey, ctx);
      provide(LayoutContextKey, rootLayout);
      provide(VisibilityContextKey, ref(true) as any);
      provide(EventZIndexContextKey, ref(0) as any);
      provide(RenderStackKey, shallowRef(render.rootStack) as any);
      provide(ImeAnchorContextKey, imeAnchor);
      provide(TInputPluginsContextKey, ref(inputPlugins) as any);
      provide(
        TPathPickerProviderContextKey,
        ref(options.pathPickerProvider ?? createNodePathPickerProvider()) as any,
      );
      provide(TerminalLinkOpenerContextKey, linkOpener as any);

      return () => {
        const portalVNodes = portals.map((p) =>
          h(TRenderPlane, { key: p.id, plane: p.plane }, () => [
            h(p.component as any, { ...p.props }),
          ]),
        );
        return h("div", null, [h(options.component as any, options.props ?? {}), ...portalVNodes]);
      };
    },
  });

  const app = createHeadlessApp(Root);
  const hostRoot = createHeadlessRoot();

  return {
    app,
    terminal,
    events,
    scheduler: ctx.scheduler,
    defaultStyle: ctx.defaultStyle,
    getImeAnchor() {
      return imeAnchor.value;
    },
    mount() {
      if (disposed || mounted) return;
      mounted = true;
      app.mount(hostRoot);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearScheduledTimer();
      frameScheduler.cancelScheduledFrame();
      if (mounted) app.unmount();
      if (selectionRenderNodeId) render.unregister(selectionRenderNodeId);
      offResize?.();
      offCommit?.();
      profiler?.dispose();
      render.dispose();
      events.dispose();
      terminal.dispose();
    },
  };
}
