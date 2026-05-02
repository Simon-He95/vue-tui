import type { App, Component, Ref } from "vue";
import type { PathPickerProvider } from "./cli/path-provider.js";
import type { TerminalRenderPlane, TerminalRenderPlanes } from "./core/render-plane.js";
import type { Style, Terminal } from "./core/types.js";
import type { CliEventManager } from "./events/index.js";
import type { TInputPlugin } from "./vue/components/input/plugins/types.js";

import type {
  ImeAnchor,
  LayoutContext,
  TerminalContext,
  TerminalRuntime,
  TerminalRuntimeHandle,
  TerminalSchedulerInvalidateOptions,
} from "./vue/context.js";
import process from "node:process";
import { defineComponent, h, provide, ref, shallowReactive, shallowRef } from "vue";
import { createHeadlessApp, createHeadlessRoot } from "./cli/headless-renderer.js";
import { createNodePathPickerProvider } from "./cli/path-provider.js";
import { createTerminal } from "./core/index.js";
import { createCliEventManager } from "./events/index.js";
import { getCliLatencyProfiler } from "./observability/cli-latency.js";
import { createTraceStore } from "./observability/trace.js";
import { createTuiProfiler } from "./observability/tui-profiler.js";
import { defaultTInputHostPlugin } from "./vue/components/input/plugins/hostPlugin.js";
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

interface Portal {
  id: string;
  component: Component;
  plane: TerminalRenderPlane;
  props: Record<string, unknown>;
}

let portalId = 0;

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
  scheduler: {
    invalidate: (options?: TerminalSchedulerInvalidateOptions) => void;
    flush: () => void;
    /**
     * Flushes render-manager work and requests a sync terminal commit immediately.
     * Renderer backends may still defer expensive output work to their frame budget.
     */
    flushNow: () => void;
  };
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
  props?: Record<string, unknown>;
  defaultStyle?: Style;
  inputPlugins?: readonly TInputPlugin[];
  pathPickerProvider?: PathPickerProvider;
}>;

export function createTerminalApp(options: CreateTerminalAppOptions): TerminalApp {
  const terminal: Terminal = createTerminal({
    cols: options.cols,
    rows: options.rows,
  });
  const trace = createTraceStore({
    enabled: Boolean((globalThis as any).__VT_DEBUG_TRACE__),
  });
  const latency = getCliLatencyProfiler();
  const profiler = createTuiProfiler("cli-scheduler");
  const events = createCliEventManager({
    record: (event) => {
      if (!trace.enabled.value) return;
      trace.push({ type: "event", at: Date.now(), event });
    },
    onFocusChange: (prev, next) => {
      if (!trace.enabled.value) return;
      trace.push({ type: "focus", at: Date.now(), prev, next });
    },
  });
  const render = createRenderManager(terminal);
  const offCommit = terminal.on("commit", ({ dirtyRows, planes, sync }) => {
    latency?.recordCommit({ dirtyRows, planes, sync });
    if (!trace.enabled.value) return;
    trace.push({
      type: "commit",
      at: Date.now(),
      dirtyRows,
      planes,
      focusedId: events.getFocused(),
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
  let pendingInvalidateAllPlanes = false;
  const pendingInvalidatePlanes = new Set<TerminalRenderPlane>();
  const env = (process?.env ?? {}) as Record<string, unknown>;
  const throttleMs = (() => {
    const raw = env.DIMCODE_TUI_THROTTLE_MS;
    if (!raw) return 0;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : 0;
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

  function takeActivePlanes(): TerminalRenderPlanes | null {
    if (pendingInvalidateAllPlanes) {
      pendingInvalidateAllPlanes = false;
      pendingInvalidatePlanes.clear();
      return null;
    }
    if (pendingInvalidatePlanes.size === 0) return null;
    const activePlanes = Array.from(pendingInvalidatePlanes);
    pendingInvalidatePlanes.clear();
    return activePlanes;
  }

  function flush(sync?: boolean): void {
    if (disposed) return;

    scheduled = false;
    flushing = true;

    const activePlanes = takeActivePlanes();
    latency?.recordFlushStart({ sync, activePlanes });
    try {
      render.render({ activePlanes });
      terminal.commit({ planes: activePlanes, sync });
    } finally {
      latency?.recordFlushEnd();
      flushing = false;
      lastFlushAtMs = Date.now();
      scheduledAtMs = 0;
    }

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
    clearScheduledTimer();
    scheduled = false;
    flush(true);
  }

  function invalidate(options?: TerminalSchedulerInvalidateOptions): void {
    if (disposed) return;
    const priority = options?.priority ?? "normal";
    latency?.recordSchedulerInvalidate({
      priority,
      plane: options?.plane ?? null,
    });
    if (flushing) {
      queueInvalidatePlane(options?.plane);
      pendingInvalidateAfterFlush = true;
      return;
    }

    queueInvalidatePlane(options?.plane);

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
  const offResize = terminal.on("resize", ({ cols, rows }) => {
    rootLayout.clipRect = { x: 0, y: 0, w: cols, h: rows };
    // Ensure resize triggers a re-render even if no other reactive state changes.
    invalidate();
  });

  const ctx: TerminalContext = {
    terminal,
    renderer: shallowRef(null as any),
    events: shallowRef(events as any),
    scheduler: { invalidate, flush, flushNow },
    runtime,
    observability: { trace },
    defaultStyle: ref(options.defaultStyle ?? {}),
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
      provide(
        TInputPluginsContextKey,
        ref(options.inputPlugins ?? [defaultTInputHostPlugin]) as any,
      );
      provide(
        TPathPickerProviderContextKey,
        ref(options.pathPickerProvider ?? createNodePathPickerProvider()) as any,
      );

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
      if (mounted) app.unmount();
      offResize?.();
      offCommit?.();
      events.dispose();
      terminal.dispose();
    },
  };
}
