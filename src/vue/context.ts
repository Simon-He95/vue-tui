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
import type { TraceStore } from "../observability/trace.js";
import type { FramePerfReason } from "../observability/frame-perf.js";
import type { FramePerfStore } from "../observability/frame-perf-store.js";
import type { TInputPlugin } from "./components/input/plugins/types.js";
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

// Provided by dialog surfaces to indicate "this subtree is inside a modal dialog".
// Used by inputs to opt into dialog confirmation semantics (e.g. Enter submits the dialog).
export const DialogContextKey = injectionKey<boolean>("DialogContext");
