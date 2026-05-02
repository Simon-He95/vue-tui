import type { Component, InjectionKey, Ref, ShallowRef } from "vue";
import type { PathPickerProvider } from "../cli/path-provider.js";
import type { TerminalRenderPlane } from "../core/render-plane.js";
import type { Style, Terminal } from "../core/types.js";
import type { EventManager, Rect } from "../events/index.js";
import type { RendererCapabilities, TerminalRendererLike } from "../renderer/index.js";
import type { TraceStore } from "../observability/trace.js";
import type { TInputPlugin } from "./components/input/plugins/types.js";
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
}>;

export type TerminalScheduler = Readonly<{
  invalidate: (options?: TerminalSchedulerInvalidateOptions) => void;
  flush: () => void;
  /**
   * Flushes render-manager work and requests a sync terminal commit immediately.
   * DOM row updates may still defer to rAF when they exceed the renderer sync budget.
   */
  flushNow: () => void;
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
  }>;
  defaultStyle: Ref<Style>;
  render: RenderManager;
}>;

export const TerminalContextKey: InjectionKey<TerminalContext> = Symbol("TerminalContext") as any;
export const LayoutContextKey: InjectionKey<LayoutContext> = Symbol("LayoutContext") as any;
export const VisibilityContextKey: InjectionKey<Ref<boolean>> = Symbol("VisibilityContext") as any;
export const EventZIndexContextKey: InjectionKey<Ref<number>> = Symbol("EventZIndex") as any;
export const RenderPlaneContextKey: InjectionKey<Ref<TerminalRenderPlane>> = Symbol(
  "RenderPlane",
) as any;
export const ImeAnchorContextKey: InjectionKey<ShallowRef<ImeAnchor | null>> = Symbol(
  "ImeAnchor",
) as any;
export const TInputPluginsContextKey: InjectionKey<Readonly<Ref<readonly TInputPlugin[]>>> = Symbol(
  "TInputPlugins",
) as any;
export const TPathPickerProviderContextKey: InjectionKey<
  Readonly<Ref<PathPickerProvider | undefined>>
> = Symbol("TPathPickerProvider") as any;

// Provided by dialog surfaces to indicate "this subtree is inside a modal dialog".
// Used by inputs to opt into dialog confirmation semantics (e.g. Enter submits the dialog).
export const DialogContextKey: InjectionKey<boolean> = Symbol("DialogContext") as any;
