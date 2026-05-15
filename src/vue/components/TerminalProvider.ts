import type { PropType } from "vue";
import type { PathPickerProvider } from "../../core/path-provider-types.js";
import type { Style, Terminal } from "../../core/types.js";
import type { TerminalEventRecord } from "../../events/recording.js";
import type { EventManager } from "../../events/manager/event-manager.js";
import type { DomRenderer, DomRendererOptions } from "../../renderer/dom/dom-renderer.js";
import type { ClipboardApi } from "../../runtime/index.js";
import type {
  SelectionTextProvider,
  TerminalSelectionCopyPayload,
  TerminalSelectionRefreshOptions,
} from "../../selection/terminal-selection.js";
import type { ImeAnchor, LayoutContext, TerminalContext } from "../context.js";
import type { TInputPlugin } from "./input/plugins/types.js";
import {
  defineComponent,
  effectScope,
  h,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  onUnmounted,
  provide,
  ref,
  shallowReactive,
  shallowRef,
  toRef,
  watch,
  watchEffect,
} from "vue";
import { createTerminal } from "../../core/index.js";
import { getPlaneTerminal } from "../../core/terminal/create-terminal.js";
import { createEventManager } from "../../events/manager/event-manager.js";
import { createFramePerfStore } from "../../observability/frame-perf-store.js";
import { createTraceStore } from "../../observability/trace.js";
import { createTuiProfiler } from "../../observability/tui-profiler.js";
import { DOM_RENDERER_CAPABILITIES } from "../../renderer/capabilities.js";
import { createDomRenderer } from "../../renderer/dom/dom-renderer.js";
import { createRuntime } from "../../runtime/index.js";
import { createTerminalSelectionController } from "../../selection/terminal-selection.js";
import {
  EventZIndexContextKey,
  ImeAnchorContextKey,
  LayoutContextKey,
  TerminalContextKey,
  TInputPluginsContextKey,
  TPathPickerProviderContextKey,
  VisibilityContextKey,
} from "../context.js";
import { RenderStackKey } from "../render/context.js";
import { createRenderManager } from "../render/render-manager.js";
import { clearTextCaches } from "../utils/text.js";
import { defaultTInputHostPlugin } from "./input/plugins/hostPlugin.js";
import { TRenderPlane } from "./TRenderPlane.js";
import { createCopyToastState } from "./terminal-provider/copy-toast.js";
import { createTerminalPortals } from "./terminal-provider/portals.js";
import {
  type TerminalProviderSelectionConfig,
  resolveSelectionConfig,
  selectionCopyToastText,
} from "./terminal-provider/selection-config.js";
import { createTerminalProviderScheduler } from "./terminal-provider/scheduler.js";
import { pickInitOnlyDomOptions, shallowEqualRecord, warnDev } from "./terminal-provider/utils.js";
import {
  SUPPRESS_TERMINAL_POINTER_DOWN,
  SUPPRESS_TERMINAL_POINTER_MOVE,
  SUPPRESS_TERMINAL_POINTER_UP,
} from "../../events/manager/selection-suppression.js";
export type {
  TerminalProviderSelectionConfig,
  TerminalProviderSelectionOptions,
} from "./terminal-provider/selection-config.js";

export const TerminalProvider = defineComponent({
  name: "TerminalProvider",
  props: {
    cols: { type: Number, required: true },
    rows: { type: Number, required: true },
    defaultStyle: { type: Object as PropType<Style>, default: () => ({}) },
    autoResize: { type: Boolean, default: false },
    minCols: { type: Number, default: 1 },
    minRows: { type: Number, default: 1 },
    recordEvents: {
      type: Function as PropType<((e: TerminalEventRecord) => void) | undefined>,
      default: undefined,
    },
    inputPlugins: {
      type: Array as PropType<readonly TInputPlugin[]>,
      default: () => [defaultTInputHostPlugin],
    },
    pathPickerProvider: {
      type: Object as PropType<PathPickerProvider>,
      default: undefined,
    },
    debugIme: { type: Boolean, default: false },
    debugTrace: { type: Boolean, default: false },
    domRendererOptions: {
      type: Object as PropType<DomRendererOptions>,
      default: undefined,
    },
    clipboard: {
      type: Object as PropType<ClipboardApi>,
      default: undefined,
    },
    selection: {
      type: [Boolean, Object] as PropType<TerminalProviderSelectionConfig>,
      default: false,
    },
  },
  emits: {
    selectionCopy: (_payload: TerminalSelectionCopyPayload) => true,
  },
  setup(props, { slots, emit }) {
    const terminal: Terminal = createTerminal({
      cols: props.cols,
      rows: props.rows,
    });
    const hostRef = ref<HTMLElement | null>(null);
    const containerRef = ref<HTMLElement | null>(null);
    const imeRef = ref<HTMLTextAreaElement | null>(null);
    const imeAnchor = shallowRef<ImeAnchor | null>(null);
    const copyToast = createCopyToastState();
    const renderer = shallowRef<DomRenderer | null>(null);
    const rendererCapabilities = shallowRef(DOM_RENDERER_CAPABILITIES);
    const events = shallowRef<EventManager | null>(null);
    const imeTimeline = shallowReactive<
      Array<{ at: number; msg: string; extra: Record<string, unknown> }>
    >([]);
    const trace = createTraceStore({
      enabled: props.debugTrace || Boolean((globalThis as any).__VT_DEBUG_TRACE__),
    });
    const framePerf = createFramePerfStore(120, {
      enabled: Boolean((globalThis as any).__VT_DEBUG_PERF__),
    });
    const offCommit = terminal.on("commit", ({ dirtyRows, planes, sync }) => {
      if (!trace.enabled.value) return;
      // Avoid mutating Vue reactive state during the render/flush call stack.
      // In tests we often stub rAF to be synchronous, and a synchronous trace push
      // can cause recursive Vue updates.
      queueMicrotask(() => {
        trace.push({
          type: "commit",
          at: Date.now(),
          dirtyRows,
          planes,
          sync,
          rendererSyncFlush: renderer.value?.debugStats?.syncFlush.last ?? null,
          focusedId: events.value?.getFocused() ?? null,
        });
      });
    });

    const shouldDebugIme = () => props.debugIme || Boolean((globalThis as any).__VT_DEBUG_IME__);
    const recordIme = (msg: string, extra?: Record<string, unknown>) => {
      if (!shouldDebugIme()) return;
      imeTimeline.push({ at: Date.now(), msg, extra: extra ?? {} });
      const keep = 80;
      if (imeTimeline.length > keep) imeTimeline.splice(0, imeTimeline.length - keep);
    };

    let imeComposing = false;
    let unmounting = false;
    let updateImePositionAfterFlush: (() => void) | null = null;
    const render = createRenderManager(terminal);
    const profiler = createTuiProfiler("dom-scheduler");
    const scope = effectScope();
    const scheduler = createTerminalProviderScheduler({
      terminal,
      renderer,
      render,
      framePerf,
      profiler,
      isUnmounting: () => unmounting,
      afterFlush: () => updateImePositionAfterFlush?.(),
    });
    const schedulerApi = scheduler.api;
    const invalidate = schedulerApi.invalidate;

    const platformRuntime = createRuntime();
    const selectionClipboard: ClipboardApi = {
      get supported() {
        return props.clipboard?.supported ?? platformRuntime.clipboard.supported;
      },
      readText() {
        return (props.clipboard ?? platformRuntime.clipboard).readText();
      },
      writeText(text: string) {
        return (props.clipboard ?? platformRuntime.clipboard).writeText(text);
      },
    };
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
    let selectionRenderNodeId: string | null = null;
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: selectionOverlay,
      clipboard: selectionClipboard,
      getTextProviders: () => Array.from(selectionTextProviders.values()),
      getOptions: () => {
        const config = resolveSelectionConfig(props.selection);
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
        for (const handler of selectionCopyHandlers) handler(payload);
        emit("selectionCopy", payload);
        if (trace.enabled.value) {
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
        }
        const config = resolveSelectionConfig(props.selection);
        if (config.enabled && config.toast) copyToast.show(selectionCopyToastText(payload));
      },
    });
    const selectionRenderNode = render.register({
      stack: render.rootStack,
      plane: "overlay",
      zIndex: -10_000,
      rect: { x: 0, y: 0, w: props.cols, h: props.rows },
      paint: selection.paint,
    });
    selectionRenderNodeId = selectionRenderNode.id;

    const { portals, runtime } = createTerminalPortals(invalidate);

    const rootLayout = shallowReactive<LayoutContext>({
      originX: 0,
      originY: 0,
      clipRect: { x: 0, y: 0, w: props.cols, h: props.rows },
    });

    const ctx: TerminalContext = {
      terminal,
      renderer,
      rendererCapabilities,
      events,
      scheduler: schedulerApi,
      runtime,
      observability: { trace, framePerf },
      selection: selectionContext,
      defaultStyle: toRef(props, "defaultStyle"),
      render,
    };

    provide(TerminalContextKey, ctx);
    provide(LayoutContextKey, rootLayout);
    provide(VisibilityContextKey, ref(true) as any);
    provide(EventZIndexContextKey, ref(0) as any);
    provide(RenderStackKey, shallowRef(render.rootStack) as any);
    provide(ImeAnchorContextKey, imeAnchor);
    provide(TInputPluginsContextKey, toRef(props, "inputPlugins") as any);
    provide(TPathPickerProviderContextKey, toRef(props, "pathPickerProvider") as any);
    const initialInputPlugins = props.inputPlugins;
    watch(
      () => props.inputPlugins,
      (next) => {
        if (next === initialInputPlugins) return;
        warnDev(
          "[vue-tui] TerminalProvider inputPlugins is init-only. Remount TerminalProvider/TInput to apply plugin changes.",
        );
      },
    );

    let offResize: (() => void) | null = null;

    onMounted(() => {
      scope.run(() => {
        const el = containerRef.value;
        if (!el) return;

        const r = createDomRenderer(terminal, el, props.domRendererOptions ?? {});
        renderer.value = r;
        rendererCapabilities.value = r.capabilities;
        let currentInitOnlyDomOptions = pickInitOnlyDomOptions(props.domRendererOptions);
        watch(
          () => pickInitOnlyDomOptions(props.domRendererOptions),
          (next) => {
            if (shallowEqualRecord(currentInitOnlyDomOptions, next)) return;
            currentInitOnlyDomOptions = next;
            warnDev(
              "[vue-tui] domRendererOptions.accessibility/syncFlushMaxRows/syncFlushCellBudget/enableScrollOperations/enableRowKeyPrepass are init-only. Remount TerminalProvider to apply them.",
            );
          },
          { deep: true },
        );
        watch(
          () => ({
            links: props.domRendererOptions?.links ?? false,
            onLinkClick: props.domRendererOptions?.onLinkClick,
          }),
          (next) => r.updateOptions(next),
          { deep: true },
        );
        watch(
          () => props.domRendererOptions?.palette ?? null,
          (palette) => {
            r.updateTheme({ palette });
          },
          { deep: true },
        );

        let lastPointerImeAt = 0;
        let focusImeFn: ((e?: PointerEvent | MouseEvent) => void) | null = null;

        const m = createEventManager(el, r.metrics, {
          record: (event) => {
            props.recordEvents?.(event);
            if (!trace.enabled.value) return;
            queueMicrotask(() => {
              trace.push({ type: "event", at: Date.now(), event });
            });
          },
          onFocusChange: (prev, next) => {
            if (trace.enabled.value) {
              queueMicrotask(() => {
                trace.push({ type: "focus", at: Date.now(), prev, next });
              });
            }
            if (!next) return;
            if (Date.now() - lastPointerImeAt < 80) return;
            // Programmatic focus (e.g. autoFocus) won't trigger pointer handlers.
            // Keep the hidden IME textarea positioned inside the focused node to avoid IME UI anchoring
            // outside the terminal and causing layout/scroll adjustments.
            queueMicrotask(() => focusImeFn?.());
          },
          textInputTarget: imeRef.value,
          debugIme: props.debugIme,
          deferAttach: true,
        });
        events.value = m;

        offResize = terminal.on("resize", ({ cols, rows }) => {
          m.setMetrics(r.metrics);
          rootLayout.clipRect = { x: 0, y: 0, w: cols, h: rows };
          selection.clear();
          render.update(selectionRenderNode.id, {
            rect: { x: 0, y: 0, w: cols, h: rows },
          });
          clearTextCaches();
          invalidate({ reason: "resize" });
        });
        onScopeDispose(() => {
          offResize?.();
          offResize = null;
        });

        onScopeDispose(() => {
          events.value?.dispose();
          events.value = null;
          renderer.value?.dispose();
          renderer.value = null;
          rendererCapabilities.value = DOM_RENDERER_CAPABILITIES;
        });

        if (props.autoResize) {
          const host = hostRef.value;
          if (host && "ResizeObserver" in globalThis) {
            const ro = new ResizeObserver(() => {
              const metrics = r.metrics;
              const rect = host.getBoundingClientRect();
              const cols = Math.max(props.minCols, Math.floor(rect.width / metrics.cellWidth));
              const rows = Math.max(props.minRows, Math.floor(rect.height / metrics.cellHeight));
              terminal.resize(cols, rows);
            });
            ro.observe(host);
            onScopeDispose(() => ro.disconnect());
          }
        }

        const imeLog = (msg: string, extra?: Record<string, unknown>) => {
          recordIme(msg, extra);
          if (!shouldDebugIme()) return;
          // eslint-disable-next-line no-console
          console.debug(`[vue-terminal][ime] ${msg}`, extra ?? {});
        };

        let imePosRaf = 0;
        let lastImePos: {
          x: number;
          y: number;
          cellW: number;
          cellH: number;
        } | null = null;
        let lastImeAnchor: {
          cellX: number;
          cellY: number;
          cellW: number;
          cellH: number;
        } | null = null;
        const updateImePosition = (reason: string) => {
          const input = imeRef.value;
          const anchor = imeAnchor.value;
          if (!input || !anchor) return;
          // Use containerRef since imeAnchor coordinates are relative to the terminal content container
          const container = containerRef.value;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const metrics = renderer.value?.metrics ?? r.metrics;
          // Calculate position relative to the viewport (textarea uses position: fixed)
          // Add rect.left/top to convert from container-relative to viewport-relative coordinates
          const x = Math.floor(rect.left + anchor.cellX * metrics.cellWidth);
          const y = Math.floor(rect.top + anchor.cellY * metrics.cellHeight);
          const cellW = metrics.cellWidth;
          const cellH = metrics.cellHeight;
          const prev = lastImePos;
          if (
            prev &&
            prev.x === x &&
            prev.y === y &&
            prev.cellW === cellW &&
            prev.cellH === cellH
          ) {
            return;
          }

          input.style.left = `${x}px`;
          input.style.top = `${y}px`;
          // Set textarea size to match cell dimensions so IME candidate UI anchors correctly
          input.style.width = `${cellW}px`;
          input.style.height = `${cellH}px`;
          input.style.lineHeight = `${cellH}px`;
          input.style.fontSize = `${cellH}px`;
          lastImePos = { x, y, cellW, cellH };
          lastImeAnchor = {
            cellX: anchor.cellX,
            cellY: anchor.cellY,
            cellW,
            cellH,
          };
          imeLog(`ime position (${reason})`, {
            x,
            y,
            rectLeft: rect.left,
            rectTop: rect.top,
            cellX: anchor.cellX,
            cellY: anchor.cellY,
          });
        };
        updateImePositionAfterFlush = () => {
          const anchor = imeAnchor.value;
          const input = imeRef.value;
          if (!input || !anchor) return;
          const metrics = renderer.value?.metrics ?? r.metrics;
          const prev = lastImeAnchor;
          if (
            prev &&
            prev.cellX === anchor.cellX &&
            prev.cellY === anchor.cellY &&
            prev.cellW === metrics.cellWidth &&
            prev.cellH === metrics.cellHeight
          ) {
            return;
          }
          updateImePosition("flush");
        };

        const scheduleImePosition = (reason: string) => {
          if (!imeRef.value || !imeAnchor.value) return;
          if (imePosRaf) return;
          imePosRaf = requestAnimationFrame(() => {
            imePosRaf = 0;
            updateImePosition(reason);
          });
        };

        type ScrollTarget = { kind: "window" } | { kind: "element"; el: HTMLElement };
        type ScrollPos = Readonly<{ left: number; top: number }>;
        type ScrollState = Readonly<{
          targets: readonly ScrollTarget[];
          positions: ReadonlyArray<ScrollPos>;
        }>;

        const isScrollable = (el: HTMLElement, axis: "x" | "y") => {
          const style = getComputedStyle(el);
          const overflow = axis === "x" ? style.overflowX : style.overflowY;
          if (overflow !== "auto" && overflow !== "scroll") return false;
          if (axis === "x") return el.scrollWidth > el.clientWidth + 1;
          return el.scrollHeight > el.clientHeight + 1;
        };

        const getScrollTargets = (): ScrollTarget[] => {
          const targets: ScrollTarget[] = [{ kind: "window" }];
          const start = hostRef.value;
          let cur: HTMLElement | null = start;
          while (cur) {
            if (isScrollable(cur, "x") || isScrollable(cur, "y"))
              targets.push({ kind: "element", el: cur });
            cur = cur.parentElement;
          }
          const root = document.scrollingElement;
          if (root && root instanceof HTMLElement) targets.push({ kind: "element", el: root });
          // De-dupe by element identity.
          const seen = new Set<HTMLElement>();
          const out: ScrollTarget[] = [];
          for (const t of targets) {
            if (t.kind === "window") {
              out.push(t);
              continue;
            }
            if (seen.has(t.el)) continue;
            seen.add(t.el);
            out.push(t);
          }
          return out;
        };

        const readScrollState = (): ScrollState => {
          const targets = getScrollTargets();
          const positions: ScrollPos[] = targets.map((t) =>
            t.kind === "window"
              ? { left: window.scrollX, top: window.scrollY }
              : { left: t.el.scrollLeft, top: t.el.scrollTop },
          );
          return { targets, positions };
        };

        const restoreScrollState = (state: ScrollState): void => {
          for (let i = 0; i < state.targets.length; i++) {
            const t = state.targets[i]!;
            const snap = state.positions[i];
            if (!snap) continue;
            if (t.kind === "window") {
              if (window.scrollX !== snap.left || window.scrollY !== snap.top)
                window.scrollTo(snap.left, snap.top);
            } else {
              if (t.el.scrollLeft !== snap.left) t.el.scrollLeft = snap.left;
              if (t.el.scrollTop !== snap.top) t.el.scrollTop = snap.top;
            }
          }
        };

        const stabilizeScroll = (state: ScrollState, reason: string) => {
          if (shouldDebugIme()) {
            const labeled = state.targets.map((t, i) => ({
              target:
                t.kind === "window"
                  ? "window"
                  : t.el === document.scrollingElement
                    ? "document.scrollingElement"
                    : t.el.tagName.toLowerCase(),
              left: state.positions[i]?.left ?? 0,
              top: state.positions[i]?.top ?? 0,
            }));
            imeLog(`stabilizeScroll(${reason})`, { state: labeled });
          }
          // Some environments (notably VSCode webview) adjust scroll after focus/composition
          // in later tasks/frames, so we restore scroll multiple times.
          restoreScrollState(state);
          queueMicrotask(() => restoreScrollState(state));
          setTimeout(() => restoreScrollState(state), 0);
          requestAnimationFrame(() => restoreScrollState(state));
        };

        const onCopy = () => {
          const container = containerRef.value;
          if (!container) return;
          const sel = window.getSelection?.() ?? null;
          const text = sel?.toString?.() ?? "";
          if (!text.trim()) return;
          const a = sel?.anchorNode;
          const f = sel?.focusNode;
          const inContainer = (n: Node | null | undefined) =>
            !!n && (n === container || container.contains(n));
          if (!inContainer(a) && !inContainer(f)) return;
          copyToast.show();
        };

        const doc = el.ownerDocument;
        doc.addEventListener("copy", onCopy, true);
        onScopeDispose(() => {
          doc.removeEventListener("copy", onCopy, true);
          copyToast.dispose();
        });

        // Keep IME textarea anchored even if scroll/resize happens without caret movement.
        const onAnyScroll = () => scheduleImePosition("scroll");
        const onResize = () => scheduleImePosition("resize");
        window.addEventListener("scroll", onAnyScroll, true);
        window.addEventListener("resize", onResize, true);
        onScopeDispose(() => {
          window.removeEventListener("scroll", onAnyScroll, true);
          window.removeEventListener("resize", onResize, true);
          if (imePosRaf) cancelAnimationFrame(imePosRaf);
          imePosRaf = 0;
          updateImePositionAfterFlush = null;
        });

        const focusIme = (e?: PointerEvent | MouseEvent) => {
          const input = imeRef.value;
          if (!input) return;

          const placeImeAtClient = (clientX: number, clientY: number) => {
            const x = Math.max(0, Math.min(window.innerWidth - 2, Math.floor(clientX)));
            const y = Math.max(0, Math.min(window.innerHeight - 2, Math.floor(clientY)));
            input.style.left = `${x}px`;
            input.style.top = `${y}px`;
          };

          const placeImeAtCell = (cellX: number, cellY: number) => {
            const host = containerRef.value;
            if (!host) return;
            const rect = host.getBoundingClientRect();
            const metrics = renderer.value?.metrics ?? r.metrics;
            placeImeAtClient(
              rect.left + cellX * metrics.cellWidth,
              rect.top + cellY * metrics.cellHeight,
            );
          };

          const placeImeNearFocusedNode = () => {
            const anchor = imeAnchor.value;
            if (anchor) {
              placeImeAtCell(anchor.cellX, anchor.cellY);
              return;
            }
            const manager = events.value;
            if (!manager) return;
            const focused = manager.getFocused();
            if (!focused) return;
            const node = manager.debugNodes().find((n) => n.id === focused);
            if (!node) return;
            const rect = node.rect;
            const cellX = rect.x + (rect.w >= 3 ? 1 : 0);
            const cellY = rect.y + (rect.h >= 3 ? 1 : 0);
            placeImeAtCell(cellX, cellY);
          };

          // Keep the IME input inside the viewport and near the user's interaction point.
          if (e && "clientX" in e && "clientY" in e) {
            lastPointerImeAt = Date.now();
            placeImeAtClient(e.clientX, e.clientY);
          } else {
            placeImeNearFocusedNode();
          }

          const before = readScrollState();
          try {
            input.focus({ preventScroll: true });
          } catch {
            input.focus();
          }
          imeLog("focusIme", {
            active: (document.activeElement as any)?.tagName ?? null,
          });
          scheduleImePosition("focus");
          queueMicrotask(() => {
            stabilizeScroll(before, "focusIme");
          });
          queueMicrotask(() => scheduleImePosition("post-focus"));
        };

        focusImeFn = focusIme;

        watchEffect(() => {
          const input = imeRef.value;
          const anchor = imeAnchor.value;
          if (!input || !anchor) return;
          // Update IME anchor continuously so candidate UI follows the caret.
          updateImePosition("anchor");
        });

        // Focus IME input when interacting so composition/input events can be captured.
        el.addEventListener("pointerdown", focusIme as any);
        el.addEventListener("mousedown", focusIme as any);
        onScopeDispose(() => {
          el.removeEventListener("pointerdown", focusIme as any);
          el.removeEventListener("mousedown", focusIme as any);
        });

        let selecting = false;
        let selectionStartPoint: { x: number; y: number } | null = null;
        let selectionScrollOrigin: { x: number; y: number } | null = null;
        let selectionLastPoint: { x: number; y: number } | null = null;
        let selectionAutoScrollTimer: ReturnType<typeof setTimeout> | null = null;
        let selectionDragStarted = false;
        let suppressNextSelectionClick = false;
        let ignoreCompatibilityMouseSelectionEvents = false;
        let compatibilityMouseResetTimer: ReturnType<typeof setTimeout> | null = null;
        let activeSelectionPointerId: number | null = null;
        let selectionPreviousUserSelect: string | null = null;

        let suppressDocumentActivation = false;
        let suppressDocumentActivationTimer: ReturnType<typeof setTimeout> | null = null;

        const ACTIVATION_SUPPRESS_WINDOW_MS = 250;
        const ACTIVATION_SUPPRESS_DISTANCE_PX = 4;

        let lastSelectionActivationSource: { clientX: number; clientY: number; at: number } | null =
          null;

        const disarmDocumentActivationSuppression = () => {
          suppressDocumentActivation = false;
          suppressNextSelectionClick = false;
          lastSelectionActivationSource = null;
          if (suppressDocumentActivationTimer != null) {
            clearTimeout(suppressDocumentActivationTimer);
            suppressDocumentActivationTimer = null;
          }
          removeSelectionDocActivationListeners();
        };

        const beginSelectionUserSelect = () => {
          if (selectionPreviousUserSelect == null) {
            selectionPreviousUserSelect = el.style.userSelect;
          }
          el.style.userSelect = "none";
        };

        const restoreSelectionUserSelect = () => {
          if (selectionPreviousUserSelect == null) return;
          el.style.userSelect = selectionPreviousUserSelect;
          selectionPreviousUserSelect = null;
        };

        const isPointerSelectionEvent = (event: MouseEvent | PointerEvent): event is PointerEvent =>
          "pointerId" in event && typeof event.pointerId === "number";

        const isEventInsideTerminal = (event: Event): boolean => {
          const target = event.target;
          return target instanceof Node && el.contains(target);
        };

        const onSelectionPointerCancel = (event: PointerEvent) => {
          if (!selecting) return;
          if (activeSelectionPointerId != null && event.pointerId !== activeSelectionPointerId)
            return;

          resetSelectionGesture({ clearSelection: true });
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        };

        const onSelectionLostPointerCapture = (event: PointerEvent) => {
          if (!selecting) return;
          if (activeSelectionPointerId != null && event.pointerId !== activeSelectionPointerId)
            return;

          // lostpointercapture can fire after a normal pointerup; if the gesture
          // already finished (selecting === false), we skip. Otherwise clean up.
          resetSelectionGesture({ clearSelection: true });
        };

        // Document-level pointer listeners ensure selection continues even when
        // the pointer drags outside the terminal and setPointerCapture is
        // unavailable or unreliable.
        const onSelectionDocPointerMove = (event: PointerEvent) => {
          if (!selecting) return;
          if (activeSelectionPointerId != null && event.pointerId !== activeSelectionPointerId)
            return;

          // Inside terminal: container listener will handle it.
          if (isEventInsideTerminal(event)) return;

          (event as any)[SUPPRESS_TERMINAL_POINTER_MOVE] = true;
          onSelectionPointerMove(event);
        };

        const onSelectionDocPointerUp = (event: PointerEvent) => {
          if (!selecting) return;
          if (activeSelectionPointerId != null && event.pointerId !== activeSelectionPointerId)
            return;

          if (isEventInsideTerminal(event)) return;

          onSelectionPointerUp(event);
        };

        const addSelectionDocPointerListeners = () => {
          doc.addEventListener("pointermove", onSelectionDocPointerMove, true);
          doc.addEventListener("pointerup", onSelectionDocPointerUp, true);
          doc.addEventListener("pointercancel", onSelectionPointerCancel, true);
        };

        const removeSelectionDocPointerListeners = () => {
          doc.removeEventListener("pointermove", onSelectionDocPointerMove, true);
          doc.removeEventListener("pointerup", onSelectionDocPointerUp, true);
          doc.removeEventListener("pointercancel", onSelectionPointerCancel, true);
        };

        const suppressNativeSelectionEvent = (event: MouseEvent | PointerEvent) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        };

        const clearCompatibilityMouseReset = () => {
          if (compatibilityMouseResetTimer == null) return;
          clearTimeout(compatibilityMouseResetTimer);
          compatibilityMouseResetTimer = null;
        };

        const scheduleCompatibilityMouseReset = () => {
          clearCompatibilityMouseReset();
          compatibilityMouseResetTimer = setTimeout(() => {
            ignoreCompatibilityMouseSelectionEvents = false;
            compatibilityMouseResetTimer = null;
          }, 0);
        };

        const shouldSuppressSelectionActivation = (event: MouseEvent): boolean => {
          if (!suppressDocumentActivation || !lastSelectionActivationSource) return false;

          const dt = Date.now() - lastSelectionActivationSource.at;
          const dx = Math.abs(event.clientX - lastSelectionActivationSource.clientX);
          const dy = Math.abs(event.clientY - lastSelectionActivationSource.clientY);

          return (
            dt <= ACTIVATION_SUPPRESS_WINDOW_MS &&
            dx <= ACTIVATION_SUPPRESS_DISTANCE_PX &&
            dy <= ACTIVATION_SUPPRESS_DISTANCE_PX
          );
        };

        const onSelectionDocActivationCapture = (event: MouseEvent) => {
          if (!shouldSuppressSelectionActivation(event)) {
            disarmDocumentActivationSuppression();
            return;
          }

          // Suppress all same-source activation events (click, dblclick,
          // contextmenu) within the short window. Do not disarm early —
          // the timer will expire and clean up automatically.
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        };

        const removeSelectionDocActivationListeners = () => {
          doc.removeEventListener("click", onSelectionDocActivationCapture, true);
          doc.removeEventListener("dblclick", onSelectionDocActivationCapture, true);
          doc.removeEventListener("contextmenu", onSelectionDocActivationCapture, true);
        };

        const armDocumentActivationSuppression = (event: MouseEvent | PointerEvent) => {
          suppressDocumentActivation = true;
          lastSelectionActivationSource = {
            clientX: event.clientX,
            clientY: event.clientY,
            at: Date.now(),
          };

          doc.addEventListener("click", onSelectionDocActivationCapture, true);
          doc.addEventListener("dblclick", onSelectionDocActivationCapture, true);
          doc.addEventListener("contextmenu", onSelectionDocActivationCapture, true);

          if (suppressDocumentActivationTimer != null) {
            clearTimeout(suppressDocumentActivationTimer);
          }

          suppressDocumentActivationTimer = setTimeout(() => {
            disarmDocumentActivationSuppression();
          }, ACTIVATION_SUPPRESS_WINDOW_MS);
        };

        const clearSelectionAutoScroll = () => {
          if (selectionAutoScrollTimer == null) return;
          clearTimeout(selectionAutoScrollTimer);
          selectionAutoScrollTimer = null;
        };

        const runSelectionAutoScroll = () => {
          selectionAutoScrollTimer = null;
          if (!selecting || !selectionScrollOrigin || !selectionLastPoint) return;
          const delta = m.autoScrollSelectionAt(
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

        const selectionEnabled = () => resolveSelectionConfig(props.selection).enabled;
        const cellPointFromClient = (event: MouseEvent | PointerEvent) => {
          const container = containerRef.value;
          const metrics = renderer.value?.metrics ?? r.metrics;
          const size = terminal.size();
          if (!container || size.cols <= 0 || size.rows <= 0) return { x: 0, y: 0 };
          const rect = container.getBoundingClientRect();
          const rawX = Math.floor((event.clientX - rect.left) / metrics.cellWidth);
          const rawY = Math.floor((event.clientY - rect.top) / metrics.cellHeight);
          return {
            x: Math.max(0, Math.min(size.cols - 1, rawX)),
            y: Math.max(0, Math.min(size.rows - 1, rawY)),
          };
        };

        const onSelectionPointerDown = (event: MouseEvent | PointerEvent) => {
          if (!isPointerSelectionEvent(event) && ignoreCompatibilityMouseSelectionEvents) {
            suppressNativeSelectionEvent(event);
            return;
          }
          if (!selectionEnabled()) return;
          suppressNextSelectionClick = false;
          selectionDragStarted = false;
          if (selecting) {
            event.preventDefault();
            return;
          }
          if (event.button !== 0) return;
          const point = cellPointFromClient(event);
          if (!m.canSelectAt(point.x, point.y)) return;
          selection.start(point, { extend: Boolean(event.shiftKey) });
          selecting = true;
          selectionStartPoint = point;
          selectionScrollOrigin = point;
          selectionLastPoint = point;
          beginSelectionUserSelect();
          if (isPointerSelectionEvent(event)) {
            activeSelectionPointerId = event.pointerId;
            addSelectionDocPointerListeners();
            ignoreCompatibilityMouseSelectionEvents = true;
            clearCompatibilityMouseReset();
            try {
              el.setPointerCapture?.(event.pointerId);
            } catch {
              // Document-level pointer listeners are the fallback.
            }
          }
          // Install document-level listeners so dragging outside the terminal
          // element still produces mousemove/mouseup events. Pointer capture
          // handles this for pointer events, but the mouse fallback needs
          // explicit document listeners.
          doc.addEventListener("mousemove", onSelectionDocMouseMove, true);
          doc.addEventListener("mouseup", onSelectionDocMouseUp, true);
          scheduleSelectionAutoScroll();
          (event as any)[SUPPRESS_TERMINAL_POINTER_DOWN] = true;
          event.preventDefault();
        };

        const onSelectionDocMouseMove = (event: MouseEvent) => {
          if (!selecting) return;
          if (ignoreCompatibilityMouseSelectionEvents) return;
          if (isEventInsideTerminal(event)) return;

          const point = cellPointFromClient(event);
          selectionLastPoint = point;
          if (
            selectionStartPoint &&
            (point.x !== selectionStartPoint.x || point.y !== selectionStartPoint.y)
          ) {
            selectionDragStarted = true;
          }
          selection.update(point);
          scheduleSelectionAutoScroll();
          (event as any)[SUPPRESS_TERMINAL_POINTER_MOVE] = true;
          event.preventDefault();
        };

        const onSelectionDocMouseUp = (event: MouseEvent) => {
          if (!selecting) return;
          if (ignoreCompatibilityMouseSelectionEvents) return;
          if (isEventInsideTerminal(event)) return;

          const point = cellPointFromClient(event);
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
            armDocumentActivationSuppression(event);
            (event as any)[SUPPRESS_TERMINAL_POINTER_UP] = true;
            suppressNativeSelectionEvent(event);
          }
          finishSelection();
        };

        const finishSelection = () => {
          selecting = false;
          activeSelectionPointerId = null;
          selectionStartPoint = null;
          selectionScrollOrigin = null;
          selectionLastPoint = null;
          restoreSelectionUserSelect();
          clearSelectionAutoScroll();
          removeSelectionDocPointerListeners();
          removeSelectionDocListeners();
          ignoreCompatibilityMouseSelectionEvents = false;
          void selection.finish();
        };

        const removeSelectionDocListeners = () => {
          doc.removeEventListener("mousemove", onSelectionDocMouseMove, true);
          doc.removeEventListener("mouseup", onSelectionDocMouseUp, true);
        };

        const onSelectionPointerMove = (event: MouseEvent | PointerEvent) => {
          if (!isPointerSelectionEvent(event) && ignoreCompatibilityMouseSelectionEvents) {
            suppressNativeSelectionEvent(event);
            return;
          }
          if (!selecting) return;
          const point = cellPointFromClient(event);
          selectionLastPoint = point;
          if (
            selectionStartPoint &&
            (point.x !== selectionStartPoint.x || point.y !== selectionStartPoint.y)
          ) {
            selectionDragStarted = true;
          }
          selection.update(point);
          scheduleSelectionAutoScroll();
          (event as any)[SUPPRESS_TERMINAL_POINTER_MOVE] = true;
          event.preventDefault();
        };

        const onSelectionPointerUp = (event: MouseEvent | PointerEvent) => {
          if (!isPointerSelectionEvent(event) && ignoreCompatibilityMouseSelectionEvents) {
            suppressNativeSelectionEvent(event);
            return;
          }
          if (!selecting) return;
          const point = cellPointFromClient(event);
          if (
            !selectionStartPoint ||
            point.x !== selectionStartPoint.x ||
            point.y !== selectionStartPoint.y
          ) {
            selection.update(point);
          }
          const suppressActivation = selectionDragStarted || selection.state.value.hasRange;
          const outsideTerminal = !isEventInsideTerminal(event);
          if (suppressActivation) {
            suppressNextSelectionClick = true;
            armDocumentActivationSuppression(event);
            (event as any)[SUPPRESS_TERMINAL_POINTER_UP] = true;

            if (outsideTerminal) suppressNativeSelectionEvent(event);
            else event.preventDefault();
          }
          selecting = false;
          activeSelectionPointerId = null;
          selectionStartPoint = null;
          selectionScrollOrigin = null;
          selectionLastPoint = null;
          restoreSelectionUserSelect();
          clearSelectionAutoScroll();
          removeSelectionDocPointerListeners();
          if (isPointerSelectionEvent(event)) {
            try {
              el.releasePointerCapture?.(event.pointerId);
            } catch {
              // Pointer capture may not have been acquired.
            }
            scheduleCompatibilityMouseReset();
          } else {
            ignoreCompatibilityMouseSelectionEvents = false;
          }
          removeSelectionDocListeners();
          void selection.finish();
        };

        const onSelectionClickCapture = (event: MouseEvent) => {
          if (!selectionEnabled()) return;
          // Suppress all activation events (click, dblclick, contextmenu) during
          // the suppression window, not just the first one.
          if (!suppressNextSelectionClick && !suppressDocumentActivation) return;

          // If the click is at a different location from the selection source,
          // it is an unrelated terminal-internal click — don't suppress it.
          if (lastSelectionActivationSource && !shouldSuppressSelectionActivation(event)) {
            disarmDocumentActivationSuppression();
            ignoreCompatibilityMouseSelectionEvents = false;
            clearCompatibilityMouseReset();
            return;
          }

          ignoreCompatibilityMouseSelectionEvents = false;
          clearCompatibilityMouseReset();
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        };

        const onSelectionKeydown = (event: KeyboardEvent) => {
          if (!selectionEnabled()) return;
          if (event.key !== "Escape") return;
          if (!selection.state.value.active && !selecting) return;
          resetSelectionGesture({ clearSelection: true });
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        };

        const onSelectionMouseLeave = () => {
          if (!selecting) return;
          selectionStartPoint = null;
        };

        const cleanupSelectionListeners = () => {
          resetSelectionGesture({ clearSelection: false });
        };

        const releaseSelectionPointerCapture = (
          pointerId: number | null = activeSelectionPointerId,
        ): void => {
          if (pointerId == null) return;
          try {
            el.releasePointerCapture?.(pointerId);
          } catch {
            // best-effort
          }
        };

        type SelectionGestureCleanupOptions = Readonly<{
          clearSelection?: boolean;
          suppressActivation?: boolean;
        }>;

        const resetSelectionGesture = (options: SelectionGestureCleanupOptions = {}): void => {
          const pointerId = activeSelectionPointerId;

          selecting = false;
          selectionStartPoint = null;
          selectionScrollOrigin = null;
          selectionLastPoint = null;
          selectionDragStarted = false;

          // Release pointer capture before clearing activeSelectionPointerId
          // so the correct pointerId is used even when cleanup is triggered
          // by Escape, selection being disabled, or component unmount.
          releaseSelectionPointerCapture(pointerId);
          activeSelectionPointerId = null;

          restoreSelectionUserSelect();
          clearSelectionAutoScroll();
          clearCompatibilityMouseReset();
          removeSelectionDocPointerListeners();
          removeSelectionDocListeners();

          ignoreCompatibilityMouseSelectionEvents = false;

          if (!options.suppressActivation) {
            suppressNextSelectionClick = false;
            disarmDocumentActivationSuppression();
          }

          if (options.clearSelection ?? true) {
            selection.clear();
          }
        };

        el.addEventListener("pointerdown", onSelectionPointerDown, true);
        el.addEventListener("pointermove", onSelectionPointerMove, true);
        el.addEventListener("pointerup", onSelectionPointerUp, true);
        el.addEventListener("pointercancel", onSelectionPointerCancel, true);
        el.addEventListener("lostpointercapture", onSelectionLostPointerCapture as any, true);
        el.addEventListener("mousedown", onSelectionPointerDown, true);
        el.addEventListener("mousemove", onSelectionPointerMove, true);
        el.addEventListener("mouseup", onSelectionPointerUp, true);
        el.addEventListener("mouseleave", onSelectionMouseLeave);
        el.addEventListener("click", onSelectionClickCapture, true);
        el.addEventListener("dblclick", onSelectionClickCapture, true);
        el.addEventListener("contextmenu", onSelectionClickCapture, true);
        doc.addEventListener("keydown", onSelectionKeydown, true);

        // Attach DOM listeners *after* selection capture listeners so that
        // selection's pointerdown/move handlers run first (setting suppress
        // flags) before the EventManager's handlers check them.  This is
        // critical at AT_TARGET where capture/bubble ordering is determined
        // by registration order, not by phase.
        m.attach();

        onScopeDispose(() => {
          el.removeEventListener("pointerdown", onSelectionPointerDown, true);
          el.removeEventListener("pointermove", onSelectionPointerMove, true);
          el.removeEventListener("pointerup", onSelectionPointerUp, true);
          el.removeEventListener("pointercancel", onSelectionPointerCancel, true);
          el.removeEventListener("lostpointercapture", onSelectionLostPointerCapture as any, true);
          el.removeEventListener("mousedown", onSelectionPointerDown, true);
          el.removeEventListener("mousemove", onSelectionPointerMove, true);
          el.removeEventListener("mouseup", onSelectionPointerUp, true);
          el.removeEventListener("mouseleave", onSelectionMouseLeave);
          el.removeEventListener("click", onSelectionClickCapture, true);
          el.removeEventListener("dblclick", onSelectionClickCapture, true);
          el.removeEventListener("contextmenu", onSelectionClickCapture, true);
          doc.removeEventListener("keydown", onSelectionKeydown, true);
          cleanupSelectionListeners();
        });

        // Watch for selection being dynamically disabled — clean up active drag gestures.
        const stopSelectionEnabledWatch = watchEffect(() => {
          if (selectionEnabled()) return;

          if (selecting) {
            resetSelectionGesture({ clearSelection: true });
            return;
          }

          selection.clear();
        });

        onScopeDispose(stopSelectionEnabledWatch);

        // Watch for selection becoming inactive while a drag is in progress
        // (e.g. provider unregisters mid-drag). Clean up gesture state only;
        // the controller already cleared the selection.
        const stopSelectionActiveWatch = watchEffect(() => {
          if (!selecting) return;
          if (selection.state.value.active) return;

          resetSelectionGesture({ clearSelection: false });
        });

        onScopeDispose(stopSelectionActiveWatch);

        const input = imeRef.value;
        const onImeFocus = () => {
          imeLog("ime focus", {
            active: (document.activeElement as any)?.tagName ?? null,
          });
        };
        const onImeBlur = () => {
          imeLog("ime blur", {
            active: (document.activeElement as any)?.tagName ?? null,
          });
        };
        const onImeKeydown = (e: KeyboardEvent) => {
          const anyNative: any = e as any;
          imeLog("ime keydown", {
            key: e.key,
            code: e.code,
            keyCode: typeof anyNative.keyCode === "number" ? anyNative.keyCode : undefined,
            isComposing: Boolean(anyNative.isComposing),
          });
        };
        const onImeBeforeInput = (e: Event) => {
          const anyNative: any = e as any;
          imeLog("ime beforeinput", {
            data: typeof anyNative.data === "string" ? anyNative.data : undefined,
            inputType: typeof anyNative.inputType === "string" ? anyNative.inputType : undefined,
            isComposing: Boolean(anyNative.isComposing),
            valueLen: imeRef.value?.value?.length ?? 0,
          });
          if (anyNative.isComposing) imeComposing = true;
        };
        const onInput = (e: Event) => {
          if (!input) return;
          const anyNative: any = e as any;
          // Some browsers provide isComposing only on input/beforeinput; don't clear while composing.
          if (anyNative.isComposing) {
            imeComposing = true;
            return;
          }
          if (imeComposing) imeComposing = false;
          queueMicrotask(() => {
            if (input) input.value = "";
          });
        };
        const onCompositionStart = () => {
          imeComposing = true;
          const before = readScrollState();
          queueMicrotask(() => {
            stabilizeScroll(before, "compositionstart");
          });
          imeLog("compositionstart", {
            ime: { valueLen: imeRef.value?.value?.length ?? 0 },
          });
        };
        const onCompositionUpdate = () => {
          const before = readScrollState();
          queueMicrotask(() => {
            stabilizeScroll(before, "compositionupdate");
          });
          // Keep IME candidate UI near the caret during composition
          scheduleImePosition("compositionupdate");
          imeLog("compositionupdate", {
            ime: {
              valueLen: imeRef.value?.value?.length ?? 0,
              selStart: imeRef.value?.selectionStart ?? null,
              selEnd: imeRef.value?.selectionEnd ?? null,
            },
          });
        };
        const onCompositionEnd = () => {
          imeComposing = false;
          const before = readScrollState();
          queueMicrotask(() => {
            if (input) input.value = "";
            stabilizeScroll(before, "compositionend");
          });
          imeLog("compositionend", {
            ime: { valueLen: imeRef.value?.value?.length ?? 0 },
          });
        };
        input?.addEventListener("input", onInput);
        input?.addEventListener("focus", onImeFocus);
        input?.addEventListener("blur", onImeBlur);
        input?.addEventListener("keydown", onImeKeydown);
        input?.addEventListener("beforeinput", onImeBeforeInput as any);
        input?.addEventListener("compositionstart", onCompositionStart);
        input?.addEventListener("compositionupdate", onCompositionUpdate);
        input?.addEventListener("compositionend", onCompositionEnd);
        onScopeDispose(() => {
          input?.removeEventListener("input", onInput);
          input?.removeEventListener("focus", onImeFocus);
          input?.removeEventListener("blur", onImeBlur);
          input?.removeEventListener("keydown", onImeKeydown);
          input?.removeEventListener("beforeinput", onImeBeforeInput as any);
          input?.removeEventListener("compositionstart", onCompositionStart);
          input?.removeEventListener("compositionupdate", onCompositionUpdate);
          input?.removeEventListener("compositionend", onCompositionEnd);
        });
      });
    });

    onBeforeUnmount(() => {
      unmounting = true;
      offCommit?.();
      scheduler.dispose();
      copyToast.dispose();
      render.unregister(selectionRenderNode.id);
      profiler?.dispose();
      render.dispose();
      scope.stop();
    });

    onUnmounted(() => {
      terminal.dispose();
    });

    return () => {
      const debugIme = shouldDebugIme();
      const timelineText = debugIme
        ? imeTimeline
            .map((e) => {
              const t = new Date(e.at);
              const hh = String(t.getHours()).padStart(2, "0");
              const mm = String(t.getMinutes()).padStart(2, "0");
              const ss = String(t.getSeconds()).padStart(2, "0");
              const ms = String(t.getMilliseconds()).padStart(3, "0");
              const extra = Object.keys(e.extra).length ? ` ${JSON.stringify(e.extra)}` : "";
              return `${hh}:${mm}:${ss}.${ms} ${e.msg}${extra}`;
            })
            .join("\n")
        : "";

      // Render portals inside the same provider so they can access injections.
      const portalVNodes = portals.map((p) =>
        h(TRenderPlane, { key: p.id, plane: p.plane }, () => [
          h(p.component as any, { ...p.props }),
        ]),
      );

      return h(
        "div",
        {
          ref: hostRef,
          "data-vt-host": "",
          style: {
            display: "inline-block",
            position: "relative",
          },
        },
        [
          copyToast.visible.value
            ? h(
                "div",
                {
                  "data-vt-copy-toast": "",
                  style: {
                    position: "absolute",
                    right: "10px",
                    top: "10px",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    background: "rgba(17, 24, 39, 0.92)",
                    color: "#f9fafb",
                    border: "1px solid rgba(255,255,255,0.16)",
                    fontSize: "12px",
                    lineHeight: "1.2",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    pointerEvents: "none",
                    userSelect: "none",
                    zIndex: 9999,
                  },
                },
                copyToast.text.value,
              )
            : null,
          h("div", {
            ref: containerRef,
            "data-vt-container": "",
            style: {
              display: "inline-block",
              position: "relative",
            },
          }),
          h("textarea", {
            ref: imeRef,
            "aria-hidden": "true",
            autocapitalize: "off",
            autocomplete: "off",
            autocorrect: "off",
            spellcheck: "false",
            inputmode: "text",
            style: {
              // Keep a real editable element focused so browsers can start IME/composition.
              // Mimics xterm-like hidden textarea behavior.
              // Use position: fixed so the textarea is not clipped by overflow:hidden on parent elements.
              position: "fixed",
              left: "0px",
              top: "0px",
              // Size will be set by updateImePosition to match cell dimensions
              width: debugIme ? "240px" : "10px",
              height: debugIme ? "90px" : "20px",
              opacity: debugIme ? 1 : 0.01,
              pointerEvents: debugIme ? "auto" : "none",
              overflow: "hidden",
              padding: 0,
              margin: 0,
              border: debugIme ? "1px solid #9ca3af" : "none",
              outline: "none",
              background: debugIme ? "#ffffff" : "transparent",
              color: debugIme ? "#111827" : "transparent",
              caretColor: "transparent",
              resize: "none",
              zIndex: debugIme ? 9999 : -10,
              whiteSpace: "nowrap",
            },
          }),
          debugIme
            ? h(
                "pre",
                {
                  "data-vt-ime-timeline": "",
                  style: {
                    position: "fixed",
                    right: "8px",
                    top: "8px",
                    maxWidth: "55vw",
                    maxHeight: "55vh",
                    overflow: "auto",
                    padding: "8px",
                    margin: 0,
                    fontSize: "11px",
                    lineHeight: "1.3",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    background: "rgba(17, 24, 39, 0.92)",
                    color: "#e5e7eb",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "6px",
                    zIndex: 9999,
                    pointerEvents: "auto",
                    whiteSpace: "pre-wrap",
                  },
                },
                timelineText,
              )
            : null,
          slots.default?.(),
          ...portalVNodes,
        ],
      );
    };
  },
});
