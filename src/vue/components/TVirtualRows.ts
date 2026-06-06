import type { PropType, VNodeChild } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Style, Terminal } from "../../core/types.js";
import type {
  Rect,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import type {
  SelectedRowSpan,
  SelectionTextProvider,
  TerminalSelectionPoint,
  TerminalSelectionRange,
} from "../../selection/terminal-selection.js";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  onBeforeUnmount,
  provide,
  ref,
  shallowReactive,
  watch,
  watchEffect,
} from "vue";
import {
  terminalSelectionRowSpans,
  terminalSelectionVisibleRowSpans,
} from "../../selection/terminal-selection.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useRenderStack } from "../composables/use-render-stack.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useVisibility } from "../composables/use-visibility.js";
import {
  createCombinedTerminalGraphicsActivity,
  createTerminalGraphicsActivity,
  EventZIndexContextKey,
  LayoutContextKey,
  RenderPlaneContextKey,
  TerminalGraphicsActivityKey,
} from "../context.js";
import { RenderStackKey } from "../render/context.js";
import { createFrameMailbox } from "../scheduler/frame-mailbox.js";
import { intersectRect, normalizeCellRect, translateRect } from "../utils/rect.js";
import { sliceByCellsRange, spaces } from "../utils/text.js";
import {
  applyWheelScroll,
  createWheelScrollState,
  resetWheelScrollState,
} from "../utils/wheel-scroll.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function normalizeChangedRange(
  range: { start: number; end: number } | null | undefined,
  count: number,
): { start: number; end: number } | null {
  if (!range) return null;
  const start = clamp(normalizeInt(range.start), 0, count);
  const end = clamp(normalizeInt(range.end), start, count);
  return { start, end };
}

function getWheelScrollInput(e: { deltaY?: number; deltaMode?: number }): {
  deltaY: number;
  mode: "auto" | "line" | "pixel";
} {
  const deltaY = Number(e.deltaY ?? 0);
  const deltaMode = typeof e.deltaMode === "number" ? e.deltaMode : undefined;
  if (
    Number.isInteger(deltaY) &&
    deltaY !== 0 &&
    Math.abs(deltaY) >= 100 &&
    Math.abs(deltaY) % 100 === 0 &&
    deltaMode == null
  ) {
    return { deltaY: deltaY / 100, mode: "line" };
  }
  if (deltaMode === 1) return { deltaY, mode: "line" };
  if (deltaMode === 0) return { deltaY, mode: "pixel" };
  return { deltaY, mode: "auto" };
}

export type TVirtualRowsRowScrollMode = "off" | "unsafe-full-row";

export type TVirtualRowsPaintContext = Readonly<{
  terminal: Terminal;
  item: unknown;
  index: number;
  row: number;
  x: number;
  y: number;
  w: number;
  clipX: number;
  clipY: number;
  fullW: number;
  scrollTop: number;
  style: Style;
}>;

export type TVirtualRowsRenderNodesContext = Readonly<{
  item: unknown;
  index: number;
  row: number;
  clipX: number;
  clipY: number;
  fullW: number;
  scrollTop: number;
}>;

export type TVirtualRowsSelectionSpanTextContext = Readonly<{
  item: unknown;
  index: number;
  x0: number;
  x1: number;
  cols: number;
}>;

export type TVirtualRowsScrollMetrics = Readonly<{
  scrollTop: number;
  maxScrollTop: number;
  viewportRows: number;
  itemCount: number;
  atTop: boolean;
  atBottom: boolean;
}>;

export type TVirtualRowsScrollPayload = TVirtualRowsScrollMetrics;

export type TVirtualRowsHandle = Readonly<{
  scrollTo: (top: number) => void;
  scrollBy: (delta: number) => void;
  invalidateIndex: (index: number) => void;
  invalidateRange: (start: number, end: number) => void;
  refreshViewport: () => void;
  getScrollMetrics: () => TVirtualRowsScrollMetrics;
}>;

let virtualRowsInstanceSeq = 0;

const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });

export const TVirtualRows = defineComponent({
  name: "TVirtualRows",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    itemCount: { type: Number, required: true },
    itemVersion: { type: Number, required: true },
    itemChangedRange: {
      type: Function as PropType<() => { start: number; end: number } | null | undefined>,
      default: undefined,
    },
    getItem: { type: Function as PropType<(index: number) => unknown>, required: true },
    paintItem: {
      type: Function as PropType<(ctx: TVirtualRowsPaintContext) => void>,
      required: true,
    },
    renderItemNodes: {
      type: Function as PropType<(ctx: TVirtualRowsRenderNodesContext) => VNodeChild>,
      default: undefined,
    },
    selectionText: {
      type: Function as PropType<(item: unknown, index: number) => string>,
      default: undefined,
    },
    selectionSpanText: {
      type: Function as PropType<(ctx: TVirtualRowsSelectionSpanTextContext) => string>,
      default: undefined,
    },
    scrollTop: { type: Number, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    focusable: { type: Boolean, default: true },
    selectable: { type: Boolean, default: false },
    wheelScroll: { type: Boolean, default: true },
    rowScrollMode: {
      type: String as PropType<TVirtualRowsRowScrollMode>,
      default: "off",
    },
    terminalGraphicScrollIdleMs: { type: Number, default: 96 },
  },
  emits: [
    "update:scrollTop",
    "scroll",
    "clickCapture",
    "click",
    "contextmenuCapture",
    "contextmenu",
    "pointerdownCapture",
    "pointerdown",
    "pointermoveCapture",
    "pointermove",
    "pointerupCapture",
    "pointerup",
    "pointerleave",
    "wheel",
    "focus",
    "blur",
    "keydown",
    "itemClick",
  ],
  setup(props, { emit, expose }) {
    const { terminal, scheduler, render, rendererCapabilities, defaultStyle, events, selection } =
      useTerminal();
    const instance = getCurrentInstance();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const plane = inject(RenderPlaneContextKey, ref<TerminalRenderPlane>("default"));
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const parentStack = useRenderStack();
    const childLayout = shallowReactive({
      originX: 0,
      originY: 0,
      clipRect: null as Rect | null,
    });
    const childStack = computed(() => render.createStack(parentStack.value, props.zIndex));
    provide(LayoutContextKey, childLayout);
    provide(RenderStackKey, childStack as any);
    provide(EventZIndexContextKey, eventZ as any);

    const virtualRowsInstanceId = ++virtualRowsInstanceSeq;
    const parentTerminalGraphicsActivity = inject(TerminalGraphicsActivityKey, null);
    const terminalGraphicsActivity = createTerminalGraphicsActivity({
      scrollIdleMs: props.terminalGraphicScrollIdleMs,
      traceId: `TVirtualRows:${virtualRowsInstanceId}:terminal-graphics`,
    });
    provide(
      TerminalGraphicsActivityKey,
      createCombinedTerminalGraphicsActivity(
        parentTerminalGraphicsActivity,
        terminalGraphicsActivity,
      ),
    );
    watch(
      () => props.terminalGraphicScrollIdleMs,
      (value) => terminalGraphicsActivity.setScrollIdleMs(value),
    );

    const frameTaskId = `TVirtualRows:${virtualRowsInstanceId}`;
    const innerScrollTop = ref(0);
    const controlledScrollTop = ref(0);
    const focused = ref(false);
    const wheelState = createWheelScrollState();
    let initializedScrollTop = false;
    let dirtyRowsHint: readonly number[] | undefined;
    let renderNodeId: string | null = null;
    let pendingWheelTop: number | null = null;
    let pendingSelectionScrollFocusRemap = false;
    let alive = true;

    const itemCount = computed(() => Math.max(0, normalizeInt(props.itemCount)));

    const fullRect = computed<Rect>(() =>
      translateRect(
        {
          x: normalizeInt(props.x),
          y: normalizeInt(props.y),
          w: Math.max(0, normalizeInt(props.w)),
          h: Math.max(0, normalizeInt(props.h)),
        },
        layout.originX,
        layout.originY,
      ),
    );

    const absRect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? EMPTY_RECT;
    });

    function normalizedRect(): Rect {
      return normalizeCellRect(absRect.value);
    }

    function normalizedFullRect(): Rect {
      return normalizeCellRect(fullRect.value);
    }

    function clipOffsets(): { x: number; y: number } {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      return {
        x: Math.max(0, clip.x - full.x),
        y: Math.max(0, clip.y - full.y),
      };
    }

    function viewportHeight(): number {
      return normalizedRect().h;
    }

    function maxScrollTop(): number {
      const { y: clipY } = clipOffsets();
      return Math.max(0, itemCount.value - (clipY + viewportHeight()));
    }

    function clampScrollTop(value: unknown): number {
      return clamp(normalizeInt(value), 0, maxScrollTop());
    }

    function isScrollControlled(): boolean {
      return Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, "scrollTop");
    }

    function currentScrollTop(): number {
      return clampScrollTop(
        isScrollControlled() ? controlledScrollTop.value : innerScrollTop.value,
      );
    }

    function setCurrentScrollTop(top: number): void {
      if (!isScrollControlled()) innerScrollTop.value = top;
    }

    function hasPaintableViewport(): boolean {
      const r = normalizedRect();
      return visible.value && r.w > 0 && r.h > 0;
    }

    function isClipped(): boolean {
      const r = normalizedRect();
      const full = normalizedFullRect();
      return r.x !== full.x || r.y !== full.y || r.w !== full.w || r.h !== full.h;
    }

    function scrollMetrics(top = currentScrollTop()): TVirtualRowsScrollMetrics {
      const maxTop = maxScrollTop();
      return {
        scrollTop: top,
        maxScrollTop: maxTop,
        viewportRows: viewportHeight(),
        itemCount: itemCount.value,
        atTop: top <= 0,
        atBottom: top >= maxTop,
      };
    }

    function emitScroll(top = currentScrollTop()): void {
      emit("scroll", scrollMetrics(top));
    }

    function viewportRows(): number[] {
      const r = normalizedRect();
      const rows: number[] = [];
      for (let y = r.y; y < r.y + r.h; y++) rows.push(y);
      return rows;
    }

    function exposedRowsForDelta(y0: number, h: number, delta: number): number[] {
      const rows: number[] = [];
      if (delta > 0) {
        for (let i = h - delta; i < h; i++) rows.push(y0 + i);
      } else {
        for (let i = 0; i < -delta; i++) rows.push(y0 + i);
      }
      return rows;
    }

    function unionDirtyRows(nextRows: readonly number[]): readonly number[] {
      if (!dirtyRowsHint?.length) return nextRows.slice().sort((a, b) => a - b);
      const rows = new Set(dirtyRowsHint);
      for (const y of nextRows) rows.add(y);
      return Array.from(rows).sort((a, b) => a - b);
    }

    function markRowsDirty(nextRows: readonly number[]): boolean {
      if (!hasPaintableViewport()) return false;
      dirtyRowsHint = unionDirtyRows(nextRows);
      if (!renderNodeId) return false;
      if (render.markDirtyRows(renderNodeId, dirtyRowsHint)) return true;
      dirtyRowsHint = undefined;
      return false;
    }

    function markViewportDirty(): boolean {
      return markRowsDirty(viewportRows());
    }

    function invalidateSelf(priority: "low" | "normal" | "high" = "normal"): void {
      scheduler.invalidate({ priority, plane: plane.value, reason: "scroll" });
    }

    function markScrollDamage(
      prevTop: number,
      nextTop: number,
      strategy: "auto" | "viewport-repaint" = "auto",
    ): void {
      const r = normalizedRect();
      const h = r.h;
      const delta = nextTop - prevTop;
      if (h <= 0 || !delta) return;

      const size = terminal.size();
      const ownsFullRows = Math.floor(r.x) === 0 && Math.floor(r.w) >= size.cols;
      const withinTerminalRows = r.y >= 0 && r.y + h <= size.rows;
      const canUseScrollPlane =
        strategy === "auto" &&
        props.rowScrollMode === "unsafe-full-row" &&
        rendererCapabilities.value.scrollOperations &&
        ownsFullRows &&
        withinTerminalRows &&
        !isClipped() &&
        Math.abs(delta) < h &&
        !dirtyRowsHint?.length;

      if (canUseScrollPlane) {
        render.unsafeScrollPlaneRows(plane.value, r.y, r.y + h, delta);
        markRowsDirty(exposedRowsForDelta(r.y, h, delta));
      } else {
        markViewportDirty();
      }
    }

    function applyScrollTop(
      nextTop: number,
      options?: Readonly<{
        emitScroll?: boolean;
        emitUpdate?: boolean;
        strategy?: "auto" | "viewport-repaint";
      }>,
    ): boolean {
      const r = normalizedRect();
      const h = r.h;
      if (h <= 0) return false;
      const prevTop = currentScrollTop();
      const clampedTop = clampScrollTop(nextTop);
      const delta = clampedTop - prevTop;
      if (!delta) return false;
      terminalGraphicsActivity.markScroll();

      if (isScrollControlled()) {
        if (options?.emitUpdate !== false) emit("update:scrollTop", clampedTop);
        if (options?.emitScroll) emitScroll(clampedTop);
        return true;
      }

      setCurrentScrollTop(clampedTop);
      if (options?.emitUpdate !== false) emit("update:scrollTop", clampedTop);

      markScrollDamage(prevTop, clampedTop, options?.strategy);

      if (options?.emitScroll) emitScroll(clampedTop);
      return true;
    }

    const wheelMailbox = createFrameMailbox<number>({
      scheduler,
      id: `${frameTaskId}:wheel`,
      reason: "scroll",
      priority: "high",
      sync: true,
      apply(nextTop, ctx) {
        pendingWheelTop = null;
        if (!alive || !hasPaintableViewport()) {
          resetWheelScrollState(wheelState);
          return;
        }
        const changed = applyScrollTop(nextTop, { emitScroll: true });
        if (!changed) {
          resetWheelScrollState(wheelState);
          return;
        }
        selection.refresh();
        ctx.invalidate({ priority: "high", plane: plane.value, reason: "scroll" });
      },
    });

    function cancelWheelScrollFrame(): void {
      pendingWheelTop = null;
      wheelMailbox.cancel();
      resetWheelScrollState(wheelState);
    }

    function requestWheelScroll(nextTop: number): boolean {
      pendingWheelTop = nextTop;
      try {
        if (wheelMailbox.queue(nextTop)) return true;
      } catch (error) {
        pendingWheelTop = null;
        resetWheelScrollState(wheelState);
        throw error;
      }
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
      return false;
    }

    function scrollTo(top: number): void {
      cancelWheelScrollFrame();
      const changed = applyScrollTop(top, {
        emitScroll: true,
        strategy: "viewport-repaint",
      });
      if (changed) {
        selection.refresh();
        invalidateSelf("high");
      }
    }

    function scrollBy(delta: number): void {
      const n = normalizeInt(delta);
      if (!n) return;
      scrollTo(currentScrollTop() + n);
    }

    function refreshViewport(): void {
      markViewportDirty();
      invalidateSelf("normal");
    }

    function invalidateRange(start: number, end: number): void {
      markItemRangeDirty(start, end);
    }

    function markItemRangeDirty(start: number, end: number): boolean {
      if (!hasPaintableViewport()) return false;
      const r = normalizedRect();
      const { y: clipY } = clipOffsets();
      const top = currentScrollTop() + clipY;
      const lo = clamp(normalizeInt(start), 0, itemCount.value);
      const hi = clamp(normalizeInt(end), lo, itemCount.value);
      const rows: number[] = [];
      for (let index = lo; index < hi; index++) {
        const y = r.y + (index - top);
        if (y >= r.y && y < r.y + r.h) rows.push(y);
      }
      if (!rows.length) return true;
      markRowsDirty(rows);
      invalidateSelf("normal");
      return true;
    }

    function invalidateIndex(index: number): void {
      const n = normalizeInt(index);
      invalidateRange(n, n + 1);
    }

    expose({
      scrollTo,
      scrollBy,
      invalidateIndex,
      invalidateRange,
      refreshViewport,
      getScrollMetrics: scrollMetrics,
    } satisfies TVirtualRowsHandle);

    function scrollSelectionBy(delta: number): boolean {
      const n = normalizeInt(delta);
      if (!n) return false;
      cancelWheelScrollFrame();
      const changed = applyScrollTop(currentScrollTop() + n, {
        emitScroll: true,
        strategy: "viewport-repaint",
      });
      if (changed) {
        if (isScrollControlled()) pendingSelectionScrollFocusRemap = true;
        else selection.refresh({ remapFocus: true });
      }
      return changed;
    }

    function itemText(index: number): string {
      const item = props.getItem(index);
      if (props.selectionText) return String(props.selectionText(item, index) ?? "");
      return typeof item === "string" || typeof item === "number" || typeof item === "boolean"
        ? String(item)
        : "";
    }

    function selectionPointForCell(point: TerminalSelectionPoint): TerminalSelectionPoint | null {
      const r = normalizedRect();
      if (point.x < r.x || point.y < r.y || point.x >= r.x + r.w || point.y >= r.y + r.h) {
        return null;
      }
      const { x: clipX, y: clipY } = clipOffsets();
      const virtualY = currentScrollTop() + clipY + (point.y - r.y);
      if (virtualY < 0 || virtualY >= itemCount.value) return null;
      return {
        x: clamp(clipX + (point.x - r.x), 0, Math.max(0, props.w - 1)),
        y: virtualY,
      };
    }

    function canHandleSelectionRange(range: TerminalSelectionRange): boolean {
      if (!props.selectable) return false;
      return Boolean(selectionPointForCell(range.anchor) && selectionPointForCell(range.focus));
    }

    function textForSelectionRange(range: TerminalSelectionRange): string {
      const cols = Math.max(1, Math.floor(props.w));
      return terminalSelectionRowSpans(range, cols, itemCount.value)
        .map((span) => {
          const item = props.getItem(span.y);
          const text = props.selectionSpanText
            ? String(
                props.selectionSpanText({
                  item,
                  index: span.y,
                  x0: span.x0,
                  x1: span.x1,
                  cols,
                }) ?? "",
              )
            : sliceByCellsRange(itemText(span.y), span.x0, span.x1);
          return span.x1 >= cols ? text.trimEnd() : text;
        })
        .join("\n");
    }

    function visibleSpansForSelectionRange(
      providerRange: TerminalSelectionRange,
      _screenRange: TerminalSelectionRange,
    ): readonly SelectedRowSpan[] {
      const r = normalizedRect();
      const { x: clipX, y: clipY } = clipOffsets();
      const cols = Math.max(1, Math.floor(props.w));
      const top = currentScrollTop() + clipY;
      const bottom = top + r.h;
      const providerSpans = terminalSelectionVisibleRowSpans(
        providerRange,
        cols,
        itemCount.value,
        top,
        bottom,
      );
      const result: SelectedRowSpan[] = [];
      for (const span of providerSpans) {
        const screenY = r.y + (span.y - top);
        const screenX0 = r.x + span.x0 - clipX;
        const screenX1 = r.x + span.x1 - clipX;
        const x0 = Math.max(r.x, screenX0);
        const x1 = Math.min(r.x + r.w, screenX1);
        if (screenY >= r.y && screenY < r.y + r.h && x1 > x0) {
          result.push({ y: screenY, x0, x1 });
        }
      }
      return result;
    }

    const selectionTextProvider: SelectionTextProvider = {
      id: `${frameTaskId}:selection-text`,
      get rect() {
        return normalizedRect();
      },
      canHandle: canHandleSelectionRange,
      pointForCell: selectionPointForCell,
      getText: textForSelectionRange,
      getVisibleSpans: visibleSpansForSelectionRange,
    };
    const unregisterSelectionTextProvider = selection.registerTextProvider(selectionTextProvider);
    onBeforeUnmount(unregisterSelectionTextProvider);

    const eventNode = useTerminalNode(() => ({
      rect: normalizedRect(),
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: props.focusable,
      selectable: props.selectable,
      selectionScrollBy: scrollSelectionBy,
      handlers: {
        clickCapture: (e: TerminalPointerEvent) => emit("clickCapture", e),
        click: (e: TerminalPointerEvent) => {
          emit("click", e);
          const r = normalizedRect();
          const { y: clipY } = clipOffsets();
          const index = currentScrollTop() + clipY + (e.cellY - r.y);
          if (index < 0 || index >= itemCount.value) return;
          emit("itemClick", { index, item: props.getItem(index), row: e.cellY - r.y, event: e });
        },
        contextmenuCapture: (e: TerminalPointerEvent) => emit("contextmenuCapture", e),
        contextmenu: (e: TerminalPointerEvent) => emit("contextmenu", e),
        pointerdownCapture: (e: TerminalPointerEvent) => emit("pointerdownCapture", e),
        pointerdown: (e: TerminalPointerEvent) => emit("pointerdown", e),
        pointermoveCapture: (e: TerminalPointerEvent) => emit("pointermoveCapture", e),
        pointermove: (e: TerminalPointerEvent) => emit("pointermove", e),
        pointerupCapture: (e: TerminalPointerEvent) => emit("pointerupCapture", e),
        pointerup: (e: TerminalPointerEvent) => emit("pointerup", e),
        pointerleave: (e: TerminalPointerEvent) => emit("pointerleave", e),
        wheel: (e: any) => {
          emit("wheel", e);
          if (!props.wheelScroll) return;
          const { deltaY, mode } = getWheelScrollInput(e);
          if (!deltaY) return;
          const baseTop = pendingWheelTop ?? currentScrollTop();
          const now =
            typeof e.time === "number"
              ? e.time
              : typeof e.timeStamp === "number"
                ? e.timeStamp
                : Date.now();
          const { nextTop, dir } = applyWheelScroll(
            wheelState,
            deltaY,
            baseTop,
            maxScrollTop(),
            now,
            mode,
            { disableAcceleration: mode === "pixel" },
          );
          if (!dir || nextTop === baseTop) return;
          if (!requestWheelScroll(nextTop)) return;
          e.preventDefault?.();
        },
        focus: () => {
          focused.value = true;
          emit("focus");
          invalidateSelf();
        },
        blur: () => {
          focused.value = false;
          emit("blur");
          invalidateSelf();
        },
        keydown: (e: TerminalKeyboardEvent) => {
          emit("keydown", e);
          if (e.key === "ArrowUp") {
            e.preventDefault();
            scrollBy(-1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            scrollBy(1);
          } else if (e.key === "PageUp") {
            e.preventDefault();
            scrollBy(-viewportHeight());
          } else if (e.key === "PageDown") {
            e.preventDefault();
            scrollBy(viewportHeight());
          } else if (e.key === "Home") {
            e.preventDefault();
            scrollTo(0);
          } else if (e.key === "End") {
            e.preventDefault();
            scrollTo(maxScrollTop());
          }
        },
      },
    }));

    watchEffect(() => {
      if (!props.autoFocus) return;
      if (!visible.value) return;
      const manager = events.value;
      const nodeId = eventNode.id.value;
      if (!manager || !nodeId) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });

    watchEffect(() => {
      const full = normalizedFullRect();
      childLayout.originX = full.x;
      childLayout.originY = full.y;
      childLayout.clipRect = normalizedRect();
    });

    watch(
      () => props.scrollTop,
      () => {
        if (!isScrollControlled()) return;
        const desiredTop = normalizeInt(props.scrollTop);
        const nextTop = clampScrollTop(props.scrollTop);
        if (!initializedScrollTop) {
          initializedScrollTop = true;
          controlledScrollTop.value = nextTop;
          markViewportDirty();
          invalidateSelf("normal");
          if (desiredTop !== nextTop) {
            emit("update:scrollTop", nextTop);
            emitScroll(nextTop);
          }
          return;
        }
        if (nextTop === controlledScrollTop.value) {
          if (desiredTop !== nextTop) {
            emit("update:scrollTop", nextTop);
            emitScroll(nextTop);
          }
          return;
        }
        cancelWheelScrollFrame();
        const prevTop = controlledScrollTop.value;
        controlledScrollTop.value = nextTop;
        terminalGraphicsActivity.markScroll();
        markScrollDamage(prevTop, nextTop);
        selection.refresh(pendingSelectionScrollFocusRemap ? { remapFocus: true } : undefined);
        pendingSelectionScrollFocusRemap = false;
        invalidateSelf("high");
        if (desiredTop !== nextTop) {
          emit("update:scrollTop", nextTop);
          emitScroll(nextTop);
        }
      },
      { immediate: true },
    );

    watch(
      [
        () => itemCount.value,
        () => props.itemVersion,
        () => fullRect.value.x,
        () => fullRect.value.y,
        () => fullRect.value.w,
        () => fullRect.value.h,
        () => absRect.value.x,
        () => absRect.value.y,
        () => absRect.value.w,
        () => absRect.value.h,
      ],
      (next, prev) => {
        resetWheelScrollState(wheelState);
        const nextTop = clampScrollTop(currentScrollTop());
        if (isScrollControlled()) {
          if (controlledScrollTop.value !== nextTop) {
            emit("update:scrollTop", nextTop);
            emitScroll(nextTop);
          }
        } else {
          setCurrentScrollTop(nextTop);
        }

        const onlyItemVersionChanged = Boolean(
          prev &&
          next[0] === prev[0] &&
          next[1] !== prev[1] &&
          next[2] === prev[2] &&
          next[3] === prev[3] &&
          next[4] === prev[4] &&
          next[5] === prev[5] &&
          next[6] === prev[6] &&
          next[7] === prev[7] &&
          next[8] === prev[8] &&
          next[9] === prev[9],
        );
        if (onlyItemVersionChanged) {
          const changedRange = normalizeChangedRange(props.itemChangedRange?.(), itemCount.value);
          if (changedRange) {
            markItemRangeDirty(changedRange.start, changedRange.end);
            return;
          }
        }

        markViewportDirty();
        invalidateSelf("normal");
      },
      { immediate: true },
    );

    watch(
      () => visible.value,
      (nextVisible) => {
        if (!nextVisible) cancelWheelScrollFrame();
      },
    );

    onBeforeUnmount(() => {
      alive = false;
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
      wheelMailbox.dispose();
      terminalGraphicsActivity.dispose();
    });

    const renderNode = useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? normalizedRect() : EMPTY_RECT,
      dirtyRowsHint,
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        itemCount.value,
        props.getItem,
        props.paintItem,
        props.selectionSpanText,
        props.style,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        dirtyRowsHint = undefined;
        if (!visible.value) return;
        const r = normalizedRect();
        const full = normalizedFullRect();
        if (r.w <= 0 || r.h <= 0) return;
        const { x: clipX, y: clipY } = clipOffsets();
        const top = currentScrollTop();
        const base = props.style ?? defaultStyle.value;
        const blank = spaces(r.w);

        const paintRow = (y: number): void => {
          if (y < r.y || y >= r.y + r.h) return;
          terminal.write(blank, { x: r.x, y, style: base });
          const row = clipY + (y - r.y);
          const index = top + row;
          if (index < 0 || index >= itemCount.value) return;
          props.paintItem({
            terminal,
            item: props.getItem(index),
            index,
            row,
            x: r.x,
            y,
            w: r.w,
            clipX,
            clipY,
            fullW: full.w,
            scrollTop: top,
            style: base,
          });
        };

        if (dirtyRows?.length) {
          for (const y of dirtyRows) paintRow(y);
          return;
        }
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
      },
    }));

    watchEffect(() => {
      renderNodeId = renderNode.id.value;
    });

    return () => {
      const children: VNodeChild[] = [];
      if (props.renderItemNodes && visible.value) {
        const r = normalizedRect();
        const full = normalizedFullRect();
        const { x: clipX, y: clipY } = clipOffsets();
        const top = currentScrollTop();
        for (let y = r.y; y < r.y + r.h; y++) {
          const row = clipY + (y - r.y);
          const index = top + row;
          if (index < 0 || index >= itemCount.value) continue;
          children.push(
            props.renderItemNodes({
              item: props.getItem(index),
              index,
              row,
              clipX,
              clipY,
              fullW: full.w,
              scrollTop: top,
            }),
          );
        }
      }
      return h("div", rootProps, children);
    };
  },
});
