import type { Component, PropType } from "vue";
import type { PathPickerProvider } from "../../cli/path-provider.js";
import type { TerminalRenderPlane, TerminalRenderPlanes } from "../../core/render-plane.js";
import type { Style, Terminal } from "../../core/types.js";
import type { EventManager, TerminalEventRecord } from "../../events/index.js";
import type { DomRenderer, DomRendererOptions } from "../../renderer/index.js";
import type {
  ImeAnchor,
  LayoutContext,
  TerminalContext,
  TerminalRuntime,
  TerminalRuntimeHandle,
  TerminalSchedulerInvalidateOptions,
} from "../context.js";
import type { TInputPlugin } from "./input/plugins/types.js";
import {
  defineComponent,
  effectScope,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  onUnmounted,
  provide,
  ref,
  shallowReactive,
  shallowRef,
  toRef,
  watchEffect,
} from "vue";
import { createTerminal } from "../../core/index.js";
import { createEventManager } from "../../events/index.js";
import { createTraceStore } from "../../observability/trace.js";
import { createTuiProfiler } from "../../observability/tui-profiler.js";
import { createDomRenderer } from "../../renderer/index.js";
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

interface Portal {
  id: string;
  component: Component;
  plane: TerminalRenderPlane;
  props: Record<string, unknown>;
}

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

let portalId = 0;

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
  },
  setup(props, { slots }) {
    const terminal: Terminal = createTerminal({
      cols: props.cols,
      rows: props.rows,
    });
    const hostRef = ref<HTMLElement | null>(null);
    const containerRef = ref<HTMLElement | null>(null);
    const imeRef = ref<HTMLTextAreaElement | null>(null);
    const imeAnchor = shallowRef<ImeAnchor | null>(null);
    const copyToastVisible = ref(false);
    const copyToastText = ref("Copied to clipboard");
    const renderer = shallowRef<DomRenderer | null>(null);
    const events = shallowRef<EventManager | null>(null);
    const imeTimeline = shallowReactive<
      Array<{ at: number; msg: string; extra: Record<string, unknown> }>
    >([]);
    const trace = createTraceStore({
      enabled: props.debugTrace || Boolean((globalThis as any).__VT_DEBUG_TRACE__),
    });
    const offCommit = terminal.on("commit", ({ dirtyRows, planes }) => {
      if (!trace.enabled.value) return;
      const focusedId = events.value?.getFocused() ?? null;
      // Avoid mutating Vue reactive state during the render/flush call stack.
      // In tests we often stub rAF to be synchronous, and a synchronous trace push
      // can cause recursive Vue updates.
      queueMicrotask(() => {
        trace.push({
          type: "commit",
          at: Date.now(),
          dirtyRows,
          planes,
          focusedId,
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

    let raf = 0;
    let rafToken = 0;
    let pendingInvalidate = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let holdNormalInvalidates = false;
    let holdReleaseToken = 0;
    let pendingInvalidateAllPlanes = false;
    const pendingInvalidatePlanes = new Set<TerminalRenderPlane>();
    let imeComposing = false;
    let unmounting = false;
    let updateImePositionAfterFlush: (() => void) | null = null;
    const render = createRenderManager(terminal);
    const profiler = createTuiProfiler("dom-scheduler");
    const scope = effectScope();

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

    function flush(sync = false): void {
      if (unmounting) return;
      const activePlanes = takeActivePlanes();
      render.render({ activePlanes });
      terminal.commit({ planes: activePlanes, sync });
      updateImePositionAfterFlush?.();
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
        if (unmounting || !pendingInvalidate) return;
        pendingInvalidate = false;
        invalidate({ priority: "normal" });
      });
    }

    function flushNow(): void {
      if (unmounting) return;
      pendingInvalidate = false;
      if (raf) {
        rafToken++;
        if (raf > 0) cancelAnimationFrame(raf);
        raf = 0;
      }
      clearTimer();
      holdNormalInvalidates = true;
      scheduleNormalInvalidateRelease();
      flush(true);
    }

    function invalidate(options?: TerminalSchedulerInvalidateOptions): void {
      if (unmounting) return;

      const priority = options?.priority ?? "normal";
      queueInvalidatePlane(options?.plane);
      if (priority === "high") {
        profiler?.recordInvalidate({ plane: options?.plane ?? null });
        flushNow();
        return;
      }

      if (holdNormalInvalidates) {
        pendingInvalidate = true;
        return;
      }

      if (priority === "low") {
        if (timer || raf) return;
        profiler?.recordInvalidate({ plane: options?.plane ?? null });
        timer = setTimeout(() => {
          timer = null;
          invalidate({ priority: "normal", plane: options?.plane });
        }, 16);
        return;
      }

      if (raf) {
        pendingInvalidate = true;
        return;
      }
      profiler?.recordInvalidate({ plane: options?.plane ?? null });
      const token = ++rafToken;
      pendingInvalidate = false;

      // Support test environments that stub rAF synchronously by preventing re-entrant invalidates
      // from resetting `raf` to 0 before `requestAnimationFrame()` returns.
      raf = -1;
      const id = requestAnimationFrame(() => {
        if (unmounting) return;
        if (token !== rafToken) return;
        flush();
        queueMicrotask(() => {
          if (unmounting) return;
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

    const portals = shallowReactive<Portal[]>([]);

    const runtime: TerminalRuntime = {
      mount(component, initialProps, options) {
        const id = `p${portalId++}`;
        // Portal entries must be reactive so prop updates (e.g. teleported dialogs)
        // trigger a Vue re-render of the portal VNode tree.
        let currentProps: Record<string, unknown> = { ...initialProps };
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
            // Avoid reading reactive portal fields here; `update()` is often called
            // from userland `watchEffect()`, and tracking `portal.props` would
            // create a self-triggering effect loop.
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
            const idx = portals.findIndex((p) => p.id === id);
            if (idx < 0) {
              alive = false;
              return;
            }
            alive = false;
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
      clipRect: { x: 0, y: 0, w: props.cols, h: props.rows },
    });

    const ctx: TerminalContext = {
      terminal,
      renderer,
      events,
      scheduler: { invalidate, flush, flushNow },
      runtime,
      observability: { trace },
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

    let offResize: (() => void) | null = null;

    onMounted(() => {
      scope.run(() => {
        const el = containerRef.value;
        if (!el) return;

        const r = createDomRenderer(terminal, el, props.domRendererOptions ?? {});
        renderer.value = r;

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
        });
        events.value = m;

        offResize = terminal.on("resize", ({ cols, rows }) => {
          m.setMetrics(r.metrics);
          rootLayout.clipRect = { x: 0, y: 0, w: cols, h: rows };
          clearTextCaches();
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

        let toastTimer: number | null = null;
        const showCopyToast = () => {
          copyToastVisible.value = true;
          if (toastTimer != null) clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => {
            copyToastVisible.value = false;
            toastTimer = null;
          }, 1200);
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
          showCopyToast();
        };

        const doc = el.ownerDocument;
        doc.addEventListener("copy", onCopy, true);
        onScopeDispose(() => {
          doc.removeEventListener("copy", onCopy, true);
          if (toastTimer != null) clearTimeout(toastTimer);
          toastTimer = null;
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
      clearTimer();
      holdReleaseToken++;
      if (raf > 0) cancelAnimationFrame(raf);
      raf = 0;
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
          copyToastVisible.value
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
                copyToastText.value,
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
