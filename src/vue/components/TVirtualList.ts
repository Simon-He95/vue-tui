import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import type { FramePerfReason } from "../../observability/frame-perf.js";
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
  ref,
  watch,
  watchEffect,
} from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey, RenderPlaneContextKey } from "../context.js";
import { createFrameMailbox } from "../scheduler/frame-mailbox.js";
import { terminalSelectionRowSpans, terminalSelectionVisibleRowSpans } from "../../selection/terminal-selection.js";
import { intersectRect, normalizeCellRect, translateRect } from "../utils/rect.js";
import { defaultActiveStyle } from "../utils/style-cache.js";
import { formatInlineCellLine, padEndByCells, sliceByCellsRange } from "../utils/text.js";
import {
  applyWheelScroll,
  createWheelScrollState,
  resetWheelScrollState,
} from "../utils/wheel-scroll.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeIndex(value: unknown, count: number): number {
  const max = Math.max(0, count - 1);
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return clamp(n, 0, max);
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

export type RowScrollMode = "off" | "unsafe-full-row";

type ScrollApplyResult = Readonly<{
  changed: boolean;
  dirty: boolean;
  top: number;
  controlled: boolean;
}>;

let virtualListInstanceSeq = 0;

export const TVirtualList = defineComponent({
  name: "TVirtualList",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    itemCount: { type: Number, required: true },
    itemVersion: { type: Number, required: true },
    getItem: { type: Function as PropType<(index: number) => unknown>, required: true },
    renderItem: {
      type: Function as PropType<(item: unknown, index: number) => unknown>,
      default: undefined,
    },
    modelValue: { type: Number, default: 0 },
    scrollTop: { type: Number, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    selectionText: {
      type: Function as PropType<(item: unknown, index: number) => string>,
      default: undefined,
    },
    selectable: { type: Boolean, default: false },
    rowScrollMode: {
      type: String as PropType<RowScrollMode>,
      default: "off",
    },
  },
  emits: [
    "update:modelValue",
    "update:scrollTop",
    "change",
    "itemClick",
    "scroll",
    "focus",
    "blur",
    "keydown",
  ],
  setup(props, { emit }) {
    const { terminal, scheduler, render, defaultStyle, events, selection } = useTerminal();
    const instance = getCurrentInstance();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const plane = inject(RenderPlaneContextKey, ref<TerminalRenderPlane>("default"));
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const virtualListInstanceId = ++virtualListInstanceSeq;
    const wheelTaskId = `TVirtualList:${virtualListInstanceId}:wheel`;

    const focused = ref(false);
    const active = ref(props.modelValue);
    const scrollTop = ref(0);
    // One-shot manual dirty rows are only for stable-rect scroll fast paths.
    // Reactive deps and rect changes repaint through useRenderNode normally.
    let dirtyRowsHint: readonly number[] | undefined;
    let renderNodeId: string | null = null;
    let warnedGetItemIdentity = false;
    let warnedRenderItemIdentity = false;
    let alive = true;
    let pendingWheelTop: number | null = null;

    // Under controlled scrollTop, selection auto-scroll only emits a single
    // pending update:scrollTop; the selection focus is remapped only after the
    // parent writes scrollTop back. If the parent never writes back, selection
    // auto-scroll pauses. This is the intended controlled-component semantic.
    let pendingSelectionScrollFocusRemap = false;
    const wheelState = createWheelScrollState();

    const itemCount = computed(() => {
      const n = Math.floor(Number(props.itemCount));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    });

    const fullRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      return translateRect(raw, layout.originX, layout.originY);
    });

    const absRect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
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

    function maxScrollTop(): number {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      return Math.max(0, itemCount.value - (clipY + clip.h));
    }

    function maxScrollTopForClamp(): number | null {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      if (full.h <= 0) return 0;
      if (clip.h <= 0) return null;
      return maxScrollTop();
    }

    function clampScrollTop(value: unknown): number {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n)) return 0;
      const maxTop = maxScrollTopForClamp();
      if (maxTop == null) return Math.max(0, n);
      return clamp(n, 0, maxTop);
    }

    function hasPaintableViewport(): boolean {
      const r = normalizedRect();
      return visible.value && r.w > 0 && r.h > 0;
    }

    function isScrollControlled(): boolean {
      return Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, "scrollTop");
    }

    const visibleWindow = computed(() => {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      const top = clampScrollTop(scrollTop.value);
      return {
        top,
        end: Math.min(itemCount.value, top + clipY + clip.h),
        h: clip.h,
      };
    });

    function viewportHeight(): number {
      return normalizedRect().h;
    }

    function ensureActiveVisible(
      options?: Readonly<{
        emitScroll?: boolean;
        priority?: "low" | "normal" | "high";
        reason?: FramePerfReason;
      }>,
    ): ScrollApplyResult {
      const controlled = isScrollControlled();
      const clip = normalizedRect();
      const full = normalizedFullRect();
      if (clip.h <= 0 || full.h <= 0) {
        return { changed: false, dirty: false, top: scrollTop.value, controlled };
      }
      const { y: clipY } = clipOffsets();
      const maxTop = maxScrollTop();
      let nextTop = clamp(scrollTop.value, 0, maxTop);
      const visibleStart = nextTop + clipY;
      const visibleEnd = visibleStart + clip.h - 1;
      if (active.value < visibleStart) nextTop = clamp(active.value - clipY, 0, maxTop);
      else if (active.value > visibleEnd)
        nextTop = clamp(active.value - (clipY + clip.h - 1), 0, maxTop);
      const result = applyScrollTop(nextTop, options);
      if (result.changed) selection.refresh();
      return result;
    }

    function normalizedModelValue(): number {
      return normalizeIndex(props.modelValue, itemCount.value);
    }

    const wheelMailbox = createFrameMailbox<number>({
      scheduler,
      id: wheelTaskId,
      reason: "scroll",
      priority: "high",
      sync: true,
      apply(nextTop, ctx) {
        pendingWheelTop = null;
        if (!alive || !hasPaintableViewport()) {
          resetWheelScrollState(wheelState);
          return;
        }
        const changed = applyScrollTop(nextTop, {
          emitScroll: true,
          emitUpdate: true,
        });
        if (!changed.changed) {
          resetWheelScrollState(wheelState);
          return;
        }
        selection.refresh();
        if (changed.dirty)
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

    function replacePendingWheelTop(nextTop: number): boolean {
      pendingWheelTop = nextTop;
      if (wheelMailbox.replacePending(nextTop)) return true;
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
      return false;
    }

    let initializedModel = false;
    let initializedGeometry = false;
    let initializedScrollTop = false;

    watch(
      () => props.modelValue,
      () => {
        const emitScroll = initializedModel;
        initializedModel = true;
        resetWheelScrollState(wheelState);
        active.value = normalizedModelValue();
        if (isScrollControlled()) {
          if (emitScroll) markViewportDirty();
          return;
        }
        ensureActiveVisible({ emitScroll });
      },
      { immediate: true },
    );

    watch(
      [
        () => itemCount.value,
        () => fullRect.value.y,
        () => fullRect.value.h,
        () => absRect.value.y,
        () => absRect.value.h,
      ],
      () => {
        const emitScroll = initializedGeometry;
        initializedGeometry = true;
        resetWheelScrollState(wheelState);
        active.value = normalizedModelValue();
        const nextTop = clampScrollTop(scrollTop.value);
        const changed = applyScrollTop(nextTop, { emitScroll });
        if (changed.changed) selection.refresh();
        if (!changed.changed) markViewportDirty();
        if (pendingWheelTop !== null && !hasPaintableViewport()) {
          cancelWheelScrollFrame();
        } else if (pendingWheelTop !== null) {
          const nextPendingTop = clampScrollTop(pendingWheelTop);
          if (nextPendingTop === scrollTop.value) {
            cancelWheelScrollFrame();
          } else if (nextPendingTop !== pendingWheelTop) {
            replacePendingWheelTop(nextPendingTop);
          }
        }
        invalidateSelf();
      },
      { immediate: true },
    );

    watch(
      () => props.scrollTop,
      () => {
        if (!isScrollControlled()) return;

        const wasInitialized = initializedScrollTop;
        initializedScrollTop = true;
        cancelWheelScrollFrame();
        const nextTop = clampScrollTop(props.scrollTop);
        const changed = scrollTop.value !== nextTop;
        scrollTop.value = nextTop;
        if (!wasInitialized || !changed) return;

        const remap = pendingSelectionScrollFocusRemap;
        pendingSelectionScrollFocusRemap = false;

        selection.refresh(remap ? { remapFocus: true } : undefined);

        markViewportDirty();
        invalidateSelf("high", "scroll");
      },
      { immediate: true },
    );

    watch(
      () => props.getItem,
      (next, prev) => {
        if (next === prev || warnedGetItemIdentity || !(globalThis as any).__VT_DEBUG_PERF__)
          return;
        warnedGetItemIdentity = true;
        console.warn(
          "[vue-tui] TVirtualList getItem changed identity; use a stable function reference and itemVersion.",
        );
      },
    );

    watch(
      () => props.renderItem,
      (next, prev) => {
        if (next === prev || warnedRenderItemIdentity || !(globalThis as any).__VT_DEBUG_PERF__)
          return;
        warnedRenderItemIdentity = true;
        console.warn(
          "[vue-tui] TVirtualList renderItem changed identity; use a stable function reference and itemVersion.",
        );
      },
    );

    watch(
      () => props.itemVersion,
      () => {
        selection.refresh();
      },
    );

    function itemText(index: number): string {
      const item = props.getItem(index);

      if (props.selectionText) {
        return String(props.selectionText(item, index) ?? "");
      }

      const raw = props.renderItem ? props.renderItem(item, index) : item;
      return typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
        ? String(raw)
        : "";
    }

    function commit(index: number): void {
      if (itemCount.value <= 0) return;
      const next = clamp(index, 0, itemCount.value - 1);
      active.value = next;
      emit("update:modelValue", next);
      emit("change", { index: next, value: props.getItem(next) });
    }

    function invalidateSelf(
      priority: "low" | "normal" | "high" = "normal",
      reason?: FramePerfReason,
    ): void {
      scheduler.invalidate({ priority, plane: plane.value, reason });
    }

    function moveActive(index: number): void {
      if (itemCount.value <= 0) return;
      cancelWheelScrollFrame();
      const prevTop = scrollTop.value;
      active.value = clamp(index, 0, Math.max(0, itemCount.value - 1));
      emit("update:modelValue", active.value);
      const scrolled = ensureActiveVisible();
      if (scrolled.changed) emit("scroll", scrolled.top);
      if (scrolled.changed && scrolled.controlled) return;
      if (!scrolled.changed || scrollTop.value === prevTop) markViewportDirty();
      invalidateSelf("high", "input");
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(active.value - 1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(active.value + 1);
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        moveActive(active.value - viewportHeight());
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        moveActive(active.value + viewportHeight());
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        moveActive(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        moveActive(itemCount.value - 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit(active.value);
      }
    }

    function scrollSelectionBy(delta: number): boolean {
      const n = Math.trunc(Number(delta));
      if (!Number.isFinite(n) || n === 0) return false;
      cancelWheelScrollFrame();

      if (isScrollControlled()) {
        const nextTop = clampScrollTop(scrollTop.value + n);
        if (nextTop === scrollTop.value) return false;

        // Do not spam update:scrollTop while waiting for parent-controlled prop.
        if (pendingSelectionScrollFocusRemap) return false;

        pendingSelectionScrollFocusRemap = true;
        emit("update:scrollTop", nextTop);
        emit("scroll", nextTop);
        return true;
      }

      const changed = applyScrollTop(scrollTop.value + n, {
        emitScroll: true,
        emitUpdate: true,
        priority: "high",
        reason: "scroll",
      });

      if (!changed.changed) return false;

      selection.refresh({ remapFocus: true });
      return true;
    }

    function selectionPointForCell(point: TerminalSelectionPoint): TerminalSelectionPoint | null {
      const r = normalizedRect();
      if (point.x < r.x || point.y < r.y || point.x >= r.x + r.w || point.y >= r.y + r.h) {
        return null;
      }
      const { x: clipX, y: clipY } = clipOffsets();
      const virtualY = scrollTop.value + clipY + (point.y - r.y);
      if (virtualY < 0 || virtualY >= itemCount.value) return null;
      return {
        x: clamp(clipX + (point.x - r.x), 0, Math.max(0, props.w - 1)),
        y: virtualY,
      };
    }

    function canHandleSelectionRange(range: TerminalSelectionRange): boolean {
      return Boolean(selectionPointForCell(range.anchor) && selectionPointForCell(range.focus));
    }

    function textForSelectionRange(range: TerminalSelectionRange): string {
      const cols = Math.max(1, Math.floor(props.w));
      return terminalSelectionRowSpans(range, cols, itemCount.value)
        .map((span) => {
          const text = sliceByCellsRange(itemText(span.y), span.x0, span.x1);
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
      const top = scrollTop.value + clipY;
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
      id: `TVirtualList:${virtualListInstanceId}:selection-text`,
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
      focusable: true,
      selectable: props.selectable,
      selectionScrollBy: scrollSelectionBy,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          cancelWheelScrollFrame();
          const r = normalizedRect();
          const { y: clipY } = clipOffsets();
          const idx = scrollTop.value + clipY + (e.cellY - r.y);
          if (idx < 0 || idx >= itemCount.value) return;
          active.value = idx;
          emit("update:modelValue", idx);
          emit("itemClick", { index: idx, value: props.getItem(idx) });
          markViewportDirty();
          invalidateSelf("high");
        },
        dblclick: (e: TerminalPointerEvent) => {
          cancelWheelScrollFrame();
          const r = normalizedRect();
          const { y: clipY } = clipOffsets();
          const idx = scrollTop.value + clipY + (e.cellY - r.y);
          if (idx >= 0 && idx < itemCount.value) commit(idx);
        },
        wheel: (e: any) => {
          const { deltaY, mode } = getWheelScrollInput(e);
          if (!deltaY) return;
          const maxTop = maxScrollTop();
          const baseTop = pendingWheelTop ?? scrollTop.value;
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
            maxTop,
            now,
            mode,
            {
              disableAcceleration: mode === "pixel",
            },
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
        keydown: onKeydown,
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
    });

    function viewportRows(): number[] {
      const r = normalizedRect();
      const rows: number[] = [];
      for (let y = r.y; y < r.y + r.h; y++) rows.push(y);
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

    function applyScrollTop(
      nextTop: number,
      options?: Readonly<{
        emitScroll?: boolean;
        emitUpdate?: boolean;
        priority?: "low" | "normal" | "high";
        reason?: FramePerfReason;
      }>,
    ): ScrollApplyResult {
      const controlled = isScrollControlled();
      const r = normalizedRect();
      const full = normalizedFullRect();
      const h = r.h;
      if (h <= 0 || full.h <= 0) {
        return { changed: false, dirty: false, top: scrollTop.value, controlled };
      }
      const clampedTop = clampScrollTop(nextTop);
      const delta = clampedTop - scrollTop.value;
      if (!delta) return { changed: false, dirty: false, top: scrollTop.value, controlled };
      if (controlled) {
        if (options?.emitUpdate ?? true) emit("update:scrollTop", clampedTop);
        if (options?.emitScroll) emit("scroll", clampedTop);
        return { changed: true, dirty: false, top: clampedTop, controlled };
      }
      scrollTop.value = clampedTop;
      if (options?.emitUpdate) emit("update:scrollTop", clampedTop);
      const dirty = markViewportDirty();
      if (options?.emitScroll) emit("scroll", clampedTop);
      if (options?.priority && dirty) invalidateSelf(options.priority, options.reason ?? "scroll");
      return { changed: true, dirty, top: clampedTop, controlled };
    }

    const renderNode = useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? normalizedRect() : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        itemCount.value,
        props.itemVersion,
        props.getItem,
        props.renderItem,
        active.value,
        focused.value,
        props.style,
        props.activeStyle,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        dirtyRowsHint = undefined;
        if (!visible.value) return;
        const r = normalizedRect();
        const full = normalizedFullRect();
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const activeStyle = props.activeStyle ?? defaultActiveStyle(base);
        const top = visibleWindow.value.top;
        const { x: clipX, y: clipY } = clipOffsets();

        const paintRow = (y: number): void => {
          if (y < r.y || y >= r.y + r.h) return;
          const idx = top + clipY + (y - r.y);
          const fullLine = formatInlineCellLine(
            idx >= 0 && idx < itemCount.value ? itemText(idx) : "",
            full.w,
          );
          const line = padEndByCells(sliceByCellsRange(fullLine, clipX, clipX + r.w), r.w);
          const style =
            idx >= 0 && idx < itemCount.value && idx === active.value ? activeStyle : base;
          terminal.write(line, { x: r.x, y, style });
        };

        const rows = dirtyRows;
        if (rows?.length) {
          for (const y of rows) paintRow(y);
          return;
        }
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
      },
    }));

    watchEffect(() => {
      renderNodeId = renderNode.id.value;
    });

    return () => h("span", rootProps);
  },
});
