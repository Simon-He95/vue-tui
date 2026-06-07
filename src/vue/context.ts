import type { Component, InjectionKey, Ref, ShallowRef } from "vue";
import type { PathPickerProvider } from "../core/path-provider-types.js";
import type { TerminalRenderPlane } from "../core/render-plane.js";
import type { WidthProvider } from "../core/buffer/width.js";
import type { Style, Terminal } from "../core/types.js";
import type { EventManager } from "../events/manager/event-manager.js";
import type { Rect } from "../events/manager/types.js";
import type {
  SelectionTextProvider,
  TerminalSelectionCopyPayload,
  TerminalSelectionRefreshOptions,
} from "../selection/terminal-selection.js";
import type { RendererCapabilities, TerminalRendererLike } from "../renderer/capabilities.js";
import type { ClipboardApi } from "../runtime/index.js";
import type { TraceStore } from "../observability/trace.js";
import type { FramePerfReason } from "../observability/frame-perf.js";
import type { FramePerfStore } from "../observability/frame-perf-store.js";
import type { TInputPlugin } from "./components/input/plugins/types.js";
import { computed, readonly, ref } from "vue";
import {
  nowTerminalGraphicTraceTime,
  recordTerminalGraphicTrace,
} from "../renderer/terminal-graphics-trace.js";
import { injectionKey } from "./injection-key.js";
import type { RenderManager } from "./render/render-manager.js";

export interface LayoutContext {
  originX: number;
  originY: number;
  clipRect: Rect | null;
}

export type TerminalSchedulerPriority = "high" | "normal" | "low";

export type TerminalSchedulerInvalidateOptions = Readonly<{
  priority?: TerminalSchedulerPriority;
  plane?: TerminalRenderPlane;
  reason?: FramePerfReason;
}>;

export type TerminalFrameTaskPriority = "high" | "normal" | "low";

export type TerminalFrameContext = Readonly<{
  frameId: number;
  startedAt: number;
  now: () => number;
  budgetMs: number;
  remainingMs: () => number;
  requestMore: () => void;
  invalidate: (options?: TerminalSchedulerInvalidateOptions) => void;
  /**
   * Internal scheduler metric hook used by frame tasks/mailboxes to report
   * dropped producer updates that were intentionally coalesced before paint.
   *
   * Compatibility note:
   * TerminalFrameContext is an exported type, so additions here are public.
   */
  reportDroppedUpdates?: (count: number) => void;
  reportMailboxDeliveryAttempt?: (attempt: { id: string; queued: number; dropped: number }) => void;
}>;

export type TerminalFrameTask = Readonly<{
  id?: string;
  reason?: FramePerfReason;
  priority?: TerminalFrameTaskPriority;
  sync?: boolean;
  run: (ctx: TerminalFrameContext) => void;
}>;

export type TerminalSchedulerConfig = Readonly<{
  targetFps?: number;
  maxFps?: number;
  frameBudgetMs?: number;
}>;

export type TerminalScheduler = Readonly<{
  invalidate: (options?: TerminalSchedulerInvalidateOptions) => void;
  flush: () => void;
  /**
   * Flushes render-manager work and requests a sync terminal commit immediately.
   * DOM row updates may still defer to rAF when they exceed the renderer sync budget.
   */
  flushNow: () => void;
  configure: (options: TerminalSchedulerConfig) => void;
  /**
   * Queues a frame task for the next scheduler frame.
   * false means the scheduler explicitly rejected the task; producers must clear
   * local pending state. true or undefined means accepted so legacy schedulers
   * that do not return a value remain valid.
   */
  queueFrameTask: (task: TerminalFrameTask) => boolean | void;
  /**
   * Best-effort cancellation for a pending id task.
   * If the scheduler has already taken the task for the current frame,
   * the task run() still needs to guard its own stale state.
   */
  cancelFrameTask?: (id: string) => boolean | void;
  requestLive: (reason: string) => () => void;
  dropLive: (reason: string) => void;
  isInsideFrame: () => boolean;
}>;

export type TerminalRuntimeHandle = Readonly<{
  update: (props: Record<string, unknown>) => void;
  move: (x: number, y: number) => void;
  unmount: () => void;
}>;

export type TerminalRuntime = Readonly<{
  mount: (
    component: Component,
    props: Record<string, unknown>,
    options?: Readonly<{ plane?: TerminalRenderPlane }>,
  ) => TerminalRuntimeHandle;
}>;

export type TerminalSelectionContext = Readonly<{
  registerTextProvider: (provider: SelectionTextProvider) => () => void;
  onCopy: (handler: (payload: TerminalSelectionCopyPayload) => void) => () => void;
  refresh: (options?: TerminalSelectionRefreshOptions) => void;
  clear: () => void;
}>;

export type TerminalGraphicsActivityOptions = Readonly<{
  scrollIdleMs?: number;
  traceId?: string;
  trace?: boolean;
}>;

export type TerminalGraphicsActivity = Readonly<{
  scrolling: Readonly<Ref<boolean>>;
  version: Readonly<Ref<number>>;
  markScroll: () => void;
  setScrollIdleMs: (value: number | undefined) => void;
  dispose: () => void;
}>;

export type ImeAnchor = Readonly<{
  cellX: number;
  cellY: number;
  ownerId?: string;
}>;

export type TerminalContext = Readonly<{
  terminal: Terminal;
  renderer: Ref<TerminalRendererLike | null>;
  rendererCapabilities: Ref<RendererCapabilities>;
  events: Ref<EventManager | null>;
  scheduler: TerminalScheduler;
  runtime: TerminalRuntime;
  clipboard?: ClipboardApi;
  observability: Readonly<{
    trace: TraceStore;
    framePerf: FramePerfStore;
  }>;
  selection: TerminalSelectionContext;
  defaultStyle: Ref<Style>;
  widthProvider: WidthProvider;
  render: RenderManager;
}>;

export const TerminalContextKey = injectionKey<TerminalContext>("TerminalContext");
export const LayoutContextKey = injectionKey<LayoutContext>("LayoutContext");
export const VisibilityContextKey = injectionKey<Ref<boolean>>("VisibilityContext");
export const EventZIndexContextKey = injectionKey<Ref<number>>("EventZIndex");
export const RenderPlaneContextKey = injectionKey<Ref<TerminalRenderPlane>>("RenderPlane");
export const ImeAnchorContextKey = injectionKey<ShallowRef<ImeAnchor | null>>("ImeAnchor");
export const TInputPluginsContextKey =
  injectionKey<Readonly<Ref<readonly TInputPlugin[]>>>("TInputPlugins");
export const TPathPickerProviderContextKey: InjectionKey<
  Readonly<Ref<PathPickerProvider | undefined>>
> = injectionKey<Readonly<Ref<PathPickerProvider | undefined>>>("TPathPickerProvider");
export const TerminalGraphicsActivityKey = injectionKey<TerminalGraphicsActivity>(
  "TerminalGraphicsActivity",
);

// Provided by dialog surfaces to indicate "this subtree is inside a modal dialog".
// Used by inputs to opt into dialog confirmation semantics (e.g. Enter submits the dialog).
export const DialogContextKey = injectionKey<boolean>("DialogContext");

export function createTerminalGraphicsActivity(
  options: TerminalGraphicsActivityOptions = {},
): TerminalGraphicsActivity {
  let scrollIdleMs = normalizeTerminalGraphicsScrollIdleMs(options.scrollIdleMs);
  const traceId = options.traceId ?? "TerminalGraphicsActivity";
  const scrolling = ref(false);
  const version = ref(0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scrollStartedAt = 0;

  function bump(): void {
    version.value++;
  }

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function traceScroll(
    type: "scroll-start" | "scroll-mark" | "scroll-idle",
    durationMs?: number,
  ): void {
    if (options.trace !== true) return;

    recordTerminalGraphicTrace({
      type,
      id: traceId,
      key: traceId,
      durationMs,
    });
  }

  function finishScroll(): void {
    if (!scrolling.value) return;

    const endedAt = nowTerminalGraphicTraceTime();
    const durationMs = scrollStartedAt > 0 ? endedAt - scrollStartedAt : undefined;
    scrolling.value = false;
    scrollStartedAt = 0;
    traceScroll("scroll-idle", durationMs);
    bump();
  }

  function markScroll(): void {
    const started = !scrolling.value;

    if (started) {
      scrolling.value = true;
      scrollStartedAt = nowTerminalGraphicTraceTime();
      traceScroll("scroll-start");
      bump();
    } else {
      traceScroll("scroll-mark");
    }

    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      finishScroll();
    }, scrollIdleMs);
  }

  function setScrollIdleMs(value: number | undefined): void {
    scrollIdleMs = normalizeTerminalGraphicsScrollIdleMs(value);
    if (!scrolling.value) return;

    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      finishScroll();
    }, scrollIdleMs);
  }

  function dispose(): void {
    clearTimer();
    finishScroll();
  }

  return {
    scrolling: readonly(scrolling) as Readonly<Ref<boolean>>,
    version: readonly(version) as Readonly<Ref<number>>,
    markScroll,
    setScrollIdleMs,
    dispose,
  };
}

export function createCombinedTerminalGraphicsActivity(
  parent: TerminalGraphicsActivity | null | undefined,
  own: TerminalGraphicsActivity,
): TerminalGraphicsActivity {
  if (!parent) return own;

  return {
    scrolling: computed(() => parent.scrolling.value || own.scrolling.value),
    version: computed(() => parent.version.value + own.version.value),
    markScroll: own.markScroll,
    setScrollIdleMs: own.setScrollIdleMs,
    dispose: own.dispose,
  };
}

function positiveFiniteInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;

  const int = Math.floor(n);
  return int > 0 ? int : fallback;
}

function normalizeTerminalGraphicsScrollIdleMs(value: number | undefined): number {
  return Math.max(16, positiveFiniteInt(value, 96));
}
