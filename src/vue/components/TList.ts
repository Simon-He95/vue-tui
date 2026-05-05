import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import {
  computed,
  defineComponent,
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
import { EventZIndexContextKey } from "../context.js";
import { createFrameMailbox } from "../scheduler/frame-mailbox.js";
import { intersectRect, normalizeCellRect, translateRect } from "../utils/rect.js";
import { defaultActiveStyle, defaultDimStyle } from "../utils/style-cache.js";
import { formatInlineCellLine, padEndByCells, sliceByCellsRange } from "../utils/text.js";
import {
  applyWheelScroll,
  createWheelScrollState,
  resetWheelScrollState,
} from "../utils/wheel-scroll.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatClippedInlineCellLine(
  raw: string,
  fullWidth: number,
  clipX: number,
  width: number,
): string {
  if (clipX === 0 && width === fullWidth) {
    return formatInlineCellLine(raw, width);
  }

  return padEndByCells(
    sliceByCellsRange(formatInlineCellLine(raw, fullWidth), clipX, clipX + width),
    width,
  );
}

type ScrollTopChange = Readonly<{
  changed: boolean;
  dirty: boolean;
  top: number;
}>;

type ActiveChange = Readonly<{
  changedActive: boolean;
  changedScroll: boolean;
  dirty: boolean;
  next: number;
}>;

type SyncModelResult = Readonly<{
  canceledPendingWheel: boolean;
  reattached: boolean;
  changedActive: boolean;
  changedScroll: boolean;
  dirty: boolean;
}>;

let tListInstanceSeq = 0;

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

export const TList = defineComponent({
  name: "TList",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    items: { type: Array as PropType<string[]>, required: true },
    itemVersion: { type: Number, default: 0 },
    modelValue: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    closeOnBlur: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "change", "scroll", "close", "focus", "blur", "keydown"],
  setup(props, { emit }) {
    const { terminal, scheduler, render, defaultStyle, events } = useTerminal();
    const tListInstanceId = ++tListInstanceSeq;
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const focused = ref(false);
    /**
     * TList render invalidation contract:
     *
     * - scrollTop/active/modelValue are intentionally not render deps.
     * - paint reads latest refs at render time.
     * - viewport changes must call setScrollTop(), which marks viewport rows dirty.
     * - active-only changes must call setActiveIndex(), which marks old/new rows dirty.
     * - no manual dirty rows should be marked while visible=false.
     * - initial modelValue sync must not trigger a high-priority flush during setup.
     */
    const active = ref(0);
    const scrollTop = ref(0);
    const wheelState = createWheelScrollState();
    let detachedByWheel = false;
    let pendingWheelTop: number | null = null;
    const dirtyRowsScratch: number[] = [];
    const indexDirtyRowsScratch: number[] = [];

    const fullRect = computed<Rect>(() =>
      translateRect(
        { x: props.x, y: props.y, w: props.w, h: props.h },
        layout.originX,
        layout.originY,
      ),
    );

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
      if (clip.h <= 0) return 0;
      return Math.max(0, props.items.length - (clipY + clip.h));
    }

    function maxScrollTopForClamp(): number | null {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      if (full.h <= 0) return 0;
      if (clip.h <= 0) return null;
      const { y: clipY } = clipOffsets();
      return Math.max(0, props.items.length - (clipY + clip.h));
    }

    function clampScrollTop(value: number): number {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n)) return 0;
      const max = maxScrollTopForClamp();
      if (max == null) return Math.max(0, n);
      return clamp(n, 0, max);
    }

    function hasItems(): boolean {
      return props.items.length > 0;
    }

    function normalizeIndex(value: unknown): number {
      const last = props.items.length - 1;
      if (last < 0) return 0;
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n)) return 0;
      return clamp(n, 0, last);
    }

    function clampedModelValue(): number {
      return normalizeIndex(props.modelValue);
    }

    function markViewportDirty(): boolean {
      if (!visible.value) return false;
      const nodeId = renderNode.id.value;
      if (!nodeId) return false;
      const r = normalizedRect();
      if (r.w <= 0 || r.h <= 0) return false;
      dirtyRowsScratch.length = 0;
      for (let y = r.y; y < r.y + r.h; y++) dirtyRowsScratch.push(y);
      return render.markDirtyRows(nodeId, dirtyRowsScratch);
    }

    function markViewportDirtyForScroll(): boolean {
      return markViewportDirty();
    }

    function pushDirtyIndexRow(rows: number[], y: number): void {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] === y) return;
      }
      rows.push(y);
    }

    function markIndexRowsDirty(...indexes: number[]): boolean {
      if (!visible.value) return false;
      const nodeId = renderNode.id.value;
      if (!nodeId) return false;
      const r = normalizedRect();
      if (r.w <= 0 || r.h <= 0) return false;

      indexDirtyRowsScratch.length = 0;
      const { start, h } = visibleRange();
      for (const index of indexes) {
        if (!Number.isFinite(index)) continue;
        const offset = index - start;
        if (offset < 0 || offset >= h) continue;
        pushDirtyIndexRow(indexDirtyRowsScratch, r.y + offset);
      }
      return render.markDirtyRows(nodeId, indexDirtyRowsScratch);
    }

    // Marks affected rows dirty but does not schedule a renderer flush.
    // Callers must invalidate the scheduler/context themselves when dirty=true.
    function setScrollTop(nextTop: number, options?: { emitScroll?: boolean }): ScrollTopChange {
      const clampedTop = clampScrollTop(nextTop);
      if (clampedTop === scrollTop.value) {
        return {
          changed: false,
          dirty: false,
          top: scrollTop.value,
        };
      }
      scrollTop.value = clampedTop;
      const dirty = visible.value ? markViewportDirtyForScroll() : false;
      if (options?.emitScroll !== false) emit("scroll", clampedTop);
      return {
        changed: true,
        dirty,
        top: clampedTop,
      };
    }

    function visibleRange(): { start: number; end: number; h: number } {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      const start = clampScrollTop(scrollTop.value) + clipY;
      return {
        start,
        end: clip.h <= 0 ? start - 1 : start + clip.h - 1,
        h: clip.h,
      };
    }

    function isActiveVisible(): boolean {
      const { start, end, h } = visibleRange();
      return h > 0 && active.value >= start && active.value <= end;
    }

    function ensureActiveVisible(): ScrollTopChange {
      const { start, end, h } = visibleRange();
      if (h <= 0) {
        return {
          changed: false,
          dirty: false,
          top: clampScrollTop(scrollTop.value),
        };
      }
      const { y: clipY } = clipOffsets();
      const maxTop = maxScrollTop();
      let nextTop = clampScrollTop(scrollTop.value);
      if (active.value < start) nextTop = clamp(active.value - clipY, 0, maxTop);
      else if (active.value > end) nextTop = clamp(active.value - (clipY + h - 1), 0, maxTop);
      // Selection-driven viewport changes intentionally do not emit scroll.
      return setScrollTop(nextTop, { emitScroll: false });
    }

    function setActiveSilently(nextIndex: unknown): {
      prev: number;
      next: number;
      changed: boolean;
    } {
      const prev = active.value;
      const next = normalizeIndex(nextIndex);
      if (prev === next) return { prev, next, changed: false };
      active.value = next;
      return { prev, next, changed: true };
    }

    const wheelMailbox = createFrameMailbox<number>({
      scheduler,
      id: `TList:${tListInstanceId}:wheel`,
      reason: "scroll",
      priority: "high",
      sync: true,
      apply(nextTop, ctx) {
        pendingWheelTop = null;
        const clampedTop = clampScrollTop(nextTop);
        if (clampedTop === scrollTop.value) {
          resetWheelScrollState(wheelState);
          return;
        }
        detachedByWheel = true;
        const result = setScrollTop(clampedTop, { emitScroll: true });
        if (result.dirty) {
          ctx.invalidate({ priority: "high", reason: "scroll" });
        }
      },
    });

    function cancelWheelScrollFrame(): void {
      pendingWheelTop = null;
      wheelMailbox.cancel();
      resetWheelScrollState(wheelState);
    }

    function reattachSelection(): void {
      detachedByWheel = false;
      cancelWheelScrollFrame();
    }

    function anchorActiveToViewport(direction: -1 | 1): number {
      const { start, end, h } = visibleRange();
      if (h <= 0) return active.value;
      if (active.value < start) return start;
      if (active.value > end) return end;
      return clamp(active.value + direction, 0, Math.max(0, props.items.length - 1));
    }

    function pageAnchor(direction: -1 | 1): number {
      const { start, end, h } = visibleRange();
      const last = Math.max(0, props.items.length - 1);
      if (h <= 0) return active.value;
      if (!isActiveVisible()) {
        return direction > 0 ? clamp(end + h, 0, last) : clamp(start - h, 0, last);
      }
      return clamp(active.value + direction * h, 0, last);
    }

    function nearestVisibleActive(): number {
      const { start, h } = visibleRange();
      const last = Math.max(0, props.items.length - 1);
      if (h <= 0) return clamp(active.value, 0, last);
      if (!isActiveVisible()) return clamp(start, 0, last);
      return clamp(active.value, 0, last);
    }

    function setActiveIndex(
      nextIndex: number,
      options?: {
        emitUpdate?: boolean;
        emitChange?: boolean;
      },
    ): ActiveChange {
      if (!hasItems()) {
        const changedActive = active.value !== 0;
        if (changedActive) active.value = 0;
        return { changedActive, changedScroll: false, dirty: false, next: 0 };
      }

      const updated = setActiveSilently(nextIndex);
      if (!updated.changed) {
        if (options?.emitChange) {
          emit("change", { index: updated.next, value: props.items[updated.next] ?? "" });
        }
        const scroll = ensureActiveVisible();
        return {
          changedActive: false,
          changedScroll: scroll.changed,
          dirty: scroll.dirty,
          next: updated.next,
        };
      }

      if (options?.emitUpdate !== false) {
        emit("update:modelValue", updated.next);
      }
      if (options?.emitChange) {
        emit("change", { index: updated.next, value: props.items[updated.next] ?? "" });
      }

      const scroll = ensureActiveVisible();
      if (!scroll.changed) {
        const dirty = markIndexRowsDirty(updated.prev, updated.next);
        return { changedActive: true, changedScroll: false, dirty, next: updated.next };
      }

      return {
        changedActive: true,
        changedScroll: true,
        dirty: scroll.dirty,
        next: updated.next,
      };
    }

    function selectActive(index: number, options?: { emitChange?: boolean }): void {
      const hadPendingWheel = wheelMailbox.hasPending();
      const wasDetached = detachedByWheel;

      if (hadPendingWheel || wasDetached) {
        reattachSelection();
      }

      const result = setActiveIndex(index, {
        emitUpdate: true,
        emitChange: options?.emitChange,
      });
      if (result.changedScroll || result.dirty) {
        scheduler.invalidate({ priority: "high", reason: "input" });
      }
    }

    function commitVisibleSelection(): void {
      if (!hasItems()) return;
      selectActive(nearestVisibleActive(), { emitChange: true });
    }

    function syncExternalModelValue(value: number): SyncModelResult {
      const hadPendingWheel = wheelMailbox.hasPending();
      const wasDetached = detachedByWheel;
      const next = normalizeIndex(value);
      const changedActive = active.value !== next;

      if (hadPendingWheel || wasDetached || changedActive) {
        reattachSelection();
      }

      const result = setActiveIndex(next, { emitUpdate: false });
      return {
        canceledPendingWheel: hadPendingWheel,
        reattached: wasDetached,
        changedActive: result.changedActive,
        changedScroll: result.changedScroll,
        dirty: result.dirty,
      };
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectActive(anchorActiveToViewport(-1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectActive(anchorActiveToViewport(1));
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        selectActive(pageAnchor(-1));
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        selectActive(pageAnchor(1));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        selectActive(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        const last = Math.max(0, props.items.length - 1);
        selectActive(last);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commitVisibleSelection();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        emit("close");
      }
    }

    const eventNode = useTerminalNode(() => ({
      rect: normalizedRect(),
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          const r = normalizedRect();
          const idx = visibleRange().start + (e.cellY - r.y);
          if (idx >= 0 && idx < props.items.length) {
            selectActive(idx);
          } else {
            emit("close");
          }
        },
        dblclick: (e: TerminalPointerEvent) => {
          const r = normalizedRect();
          const idx = visibleRange().start + (e.cellY - r.y);
          if (idx >= 0 && idx < props.items.length) selectActive(idx, { emitChange: true });
        },
        wheel: (e: any) => {
          const { deltaY, mode } = getWheelScrollInput(e);
          if (!deltaY) return;
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
            maxScrollTop(),
            now,
            mode,
            {
              disableAcceleration: mode === "pixel",
            },
          );
          if (!dir || nextTop === baseTop) {
            const maxTop = maxScrollTop();
            const isEdgeNoop = (deltaY < 0 && baseTop <= 0) || (deltaY > 0 && baseTop >= maxTop);
            if (isEdgeNoop) resetWheelScrollState(wheelState);
            return;
          }

          pendingWheelTop = nextTop;
          const queued = wheelMailbox.queue(nextTop);
          if (!queued) {
            pendingWheelTop = null;
            resetWheelScrollState(wheelState);
            return;
          }
          e.preventDefault?.();
        },
        focus: () => {
          focused.value = true;
          emit("focus");
          scheduler.invalidate({ reason: "input" });
        },
        blur: () => {
          focused.value = false;
          emit("blur");
          if (props.closeOnBlur) emit("close");
          scheduler.invalidate({ reason: "input" });
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

    onBeforeUnmount(() => {
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
      wheelMailbox.dispose();
    });

    // Keep renderNode declaration before immediate watchers.
    // markViewportDirty / markIndexRowsDirty close over renderNode.
    const renderNode = useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? normalizedRect() : { x: 0, y: 0, w: 0, h: 0 },
      // Intentionally not in render deps:
      // - scrollTop / active / modelValue repaint through manual dirty-row paths.
      // - itemVersion is handled by the structure watcher below so same-length
      //   content updates stay on the viewport dirty-row path instead of the
      //   more conservative render.update() rect path.
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        props.w,
        props.h,
        props.items,
        props.style,
        focused.value,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = normalizedRect();
        const full = normalizedFullRect();
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const emptyStyle = defaultDimStyle(base);
        const top = clampScrollTop(scrollTop.value);
        const activeStyle = defaultActiveStyle(base);
        const { x: clipX, y: clipY } = clipOffsets();
        const needsHorizontalSlice = clipX !== 0 || r.w !== full.w;
        let emptyLine: string | null = null;

        function getEmptyLine(): string {
          if (emptyLine != null) return emptyLine;
          emptyLine = clipY !== 0 ? "" : formatClippedInlineCellLine("(empty)", full.w, clipX, r.w);
          return emptyLine;
        }

        const paintRow = (i: number) => {
          if (i < 0 || i >= r.h) return;
          const idx = top + clipY + i;
          const raw = props.items[idx] ?? "";
          const line = needsHorizontalSlice
            ? formatClippedInlineCellLine(raw, full.w, clipX, r.w)
            : formatInlineCellLine(raw, r.w);
          const style = idx === active.value ? activeStyle : base;
          terminal.write(line, { x: r.x, y: r.y + i, style });
        };

        if (dirtyRows) {
          if (dirtyRows.length === 0) return;
          let firstRowDirty = false;
          for (const y of dirtyRows) {
            if (Math.floor(y) === r.y) firstRowDirty = true;
            const localY = Math.floor(y) - r.y;
            if (localY < 0 || localY >= r.h) continue;
            paintRow(localY);
          }
          if (
            focused.value &&
            props.items.length === 0 &&
            r.h > 0 &&
            firstRowDirty &&
            clipY === 0
          ) {
            terminal.write(getEmptyLine(), {
              x: r.x,
              y: r.y,
              style: emptyStyle,
            });
          }
          return;
        }

        for (let i = 0; i < r.h; i++) paintRow(i);
        if (focused.value && r.h > 0 && props.items.length === 0 && clipY === 0) {
          terminal.write(getEmptyLine(), {
            x: r.x,
            y: r.y,
            style: emptyStyle,
          });
        }
      },
    }));

    let didInitialModelSync = false;

    watch(
      () => props.modelValue,
      (value) => {
        const isInitial = !didInitialModelSync;
        didInitialModelSync = true;
        const result = syncExternalModelValue(value);
        if (!isInitial && (result.dirty || result.changedScroll)) {
          scheduler.invalidate({ priority: "high", reason: "input" });
        }
      },
      { immediate: true },
    );

    watch(
      [
        () => props.items.length,
        () => props.itemVersion,
        () => fullRect.value.y,
        () => fullRect.value.h,
        () => absRect.value.y,
        () => absRect.value.h,
      ],
      (
        [itemsLength, itemVersion, fullY, fullH, clipY, clipH],
        [prevItemsLength, prevItemVersion, prevFullY, prevFullH, prevClipY, prevClipH] = [
          itemsLength,
          itemVersion,
          fullY,
          fullH,
          clipY,
          clipH,
        ],
      ) => {
        const structureChanged =
          itemsLength !== prevItemsLength ||
          itemVersion !== prevItemVersion ||
          fullY !== prevFullY ||
          fullH !== prevFullH ||
          clipY !== prevClipY ||
          clipH !== prevClipH;
        const last = Math.max(0, props.items.length - 1);
        let needsInvalidate = false;
        const wheelDetachedOrPending = detachedByWheel || wheelMailbox.hasPending();

        if (wheelDetachedOrPending) {
          if (active.value > last || active.value < 0) {
            const updated = setActiveSilently(last);
            if (updated.changed) {
              needsInvalidate = markIndexRowsDirty(updated.prev, updated.next) || needsInvalidate;
            }
          }
        } else {
          const modelSync = setActiveIndex(clampedModelValue(), { emitUpdate: false });
          needsInvalidate = modelSync.dirty || needsInvalidate;
        }

        if (pendingWheelTop !== null) {
          const maxPendingTop = maxScrollTopForClamp();
          if (maxPendingTop != null) {
            const nextPendingTop = clamp(pendingWheelTop, 0, maxPendingTop);
            if (nextPendingTop === scrollTop.value) {
              cancelWheelScrollFrame();
            } else {
              pendingWheelTop = nextPendingTop;
            }
          }
        }

        const clampedTop = clampScrollTop(scrollTop.value);
        if (clampedTop !== scrollTop.value) {
          // Scroll is defined as viewport-driven changes, including programmatic
          // clamps caused by data length or clipped viewport changes.
          const scroll = setScrollTop(clampedTop, { emitScroll: true });
          needsInvalidate = scroll.dirty || needsInvalidate;
        }

        if (structureChanged) {
          needsInvalidate = markViewportDirty() || needsInvalidate;
        }

        if (needsInvalidate) {
          scheduler.invalidate({ priority: "normal", reason: "data" });
        }
      },
    );

    return () => h("span", rootProps);
  },
});
