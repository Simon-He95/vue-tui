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
import { intersectRect, translateRect } from "../utils/rect.js";
import { formatInlineCellLine } from "../utils/text.js";
import {
  applyWheelScroll,
  createWheelScrollState,
  resetWheelScrollState,
} from "../utils/wheel-scroll.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

const activeStyleCache = new WeakMap<Style, Style>();
let tListInstanceSeq = 0;

function defaultActiveStyle(base: Style): Style {
  if (base.inverse) return base;
  let cached = activeStyleCache.get(base);
  if (!cached) {
    cached = Object.freeze({ ...base, inverse: true });
    activeStyleCache.set(base, cached);
  }
  return cached;
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

export const TList = defineComponent({
  name: "TList",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    items: { type: Array as PropType<string[]>, required: true },
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
    const active = ref(props.modelValue);
    // Intentionally excluded from render deps.
    // Every mutation must go through setScrollTop(), otherwise the render node
    // will not receive dirtyRowsHint and the visible rows may become stale.
    const scrollTop = ref(0);
    const wheelState = createWheelScrollState();
    let detachedByWheel = false;
    let pendingWheelTop: number | null = null;
    const dirtyRowsScratch: number[] = [];
    const indexDirtyRowsScratch: number[] = [];
    const paintRowsScratch: number[] = [];

    const absRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    const viewportRows = computed(() => Math.max(0, absRect.value.h));

    function viewportHeight(): number {
      return viewportRows.value;
    }

    function maxScrollTop(): number {
      const h = viewportHeight();
      if (h <= 0) return 0;
      return Math.max(0, props.items.length - h);
    }

    function clampScrollTop(value: number): number {
      return clamp(value, 0, maxScrollTop());
    }

    function clampedModelValue(): number {
      return clamp(props.modelValue, 0, Math.max(0, props.items.length - 1));
    }

    function markViewportDirty(): void {
      const nodeId = renderNode.id.value;
      if (!nodeId) return;
      const r = absRect.value;
      if (r.w <= 0 || r.h <= 0) return;
      dirtyRowsScratch.length = 0;
      for (let y = r.y; y < r.y + r.h; y++) dirtyRowsScratch.push(y);
      // dirtyRowsHint is consumed synchronously by RenderManager.update().
      render.update(nodeId, { dirtyRowsHint: dirtyRowsScratch });
    }

    function pushDirtyIndexRow(rows: number[], y: number): void {
      if (rows.includes(y)) return;
      rows.push(y);
    }

    function markIndexRowsDirty(...indexes: number[]): void {
      const nodeId = renderNode.id.value;
      if (!nodeId) return;
      const r = absRect.value;
      if (r.w <= 0 || r.h <= 0) return;

      indexDirtyRowsScratch.length = 0;
      const top = scrollTop.value;
      for (const index of indexes) {
        if (!Number.isFinite(index)) continue;
        const offset = index - top;
        if (offset < 0 || offset >= r.h) continue;
        pushDirtyIndexRow(indexDirtyRowsScratch, r.y + offset);
      }
      if (indexDirtyRowsScratch.length > 0) {
        // dirtyRowsHint is consumed synchronously by RenderManager.update().
        render.update(nodeId, { dirtyRowsHint: indexDirtyRowsScratch });
      }
    }

    function setScrollTop(nextTop: number, options?: { emitScroll?: boolean }): boolean {
      const clampedTop = clampScrollTop(nextTop);
      if (clampedTop === scrollTop.value) return false;
      scrollTop.value = clampedTop;
      markViewportDirty();
      if (options?.emitScroll !== false) emit("scroll", clampedTop);
      return true;
    }

    function visibleRange(): { start: number; end: number; h: number } {
      const h = viewportHeight();
      const start = scrollTop.value;
      return {
        start,
        end: h <= 0 ? start : start + h - 1,
        h,
      };
    }

    function isActiveVisible(): boolean {
      const { start, end, h } = visibleRange();
      return h > 0 && active.value >= start && active.value <= end;
    }

    function ensureActiveVisible(): boolean {
      const h = viewportHeight();
      if (h <= 0) return false;
      const maxTop = maxScrollTop();
      let nextTop = clampScrollTop(scrollTop.value);
      if (active.value < nextTop) nextTop = active.value;
      else if (active.value >= nextTop + h) nextTop = clamp(active.value - (h - 1), 0, maxTop);
      return setScrollTop(nextTop, { emitScroll: false });
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
        if (clampedTop === scrollTop.value) return;
        detachedByWheel = true;
        setScrollTop(clampedTop, { emitScroll: true });
        ctx.invalidate({ priority: "high", reason: "scroll" });
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
      const { start, h } = visibleRange();
      const last = Math.max(0, props.items.length - 1);
      if (h <= 0) return active.value;
      if (!isActiveVisible()) return clamp(start + direction * h, 0, last);
      return clamp(active.value + direction * h, 0, last);
    }

    function nearestVisibleActive(): number {
      const { start, h } = visibleRange();
      const last = Math.max(0, props.items.length - 1);
      if (h <= 0) return clamp(active.value, 0, last);
      if (!isActiveVisible()) return clamp(start, 0, last);
      return clamp(active.value, 0, last);
    }

    function selectActive(index: number, options?: { emitChange?: boolean }): void {
      const last = Math.max(0, props.items.length - 1);
      const prev = active.value;
      const next = clamp(index, 0, last);
      const hadPendingWheel = wheelMailbox.hasPending();
      const wasDetached = detachedByWheel;
      const changedActive = prev !== next;

      if (hadPendingWheel || wasDetached) {
        reattachSelection();
      }

      if (!changedActive) {
        if (options?.emitChange) emit("change", { index: next, value: props.items[next] ?? "" });
        const changedScroll = ensureActiveVisible();
        if (changedScroll) {
          scheduler.invalidate({ priority: "high", reason: "input" });
        }
        return;
      }

      active.value = next;
      emit("update:modelValue", next);
      if (options?.emitChange) emit("change", { index: next, value: props.items[next] ?? "" });
      const changedScroll = ensureActiveVisible();
      if (!changedScroll) markIndexRowsDirty(prev, next);
      scheduler.invalidate({ priority: "high", reason: "input" });
    }

    function commitVisibleSelection(): void {
      selectActive(nearestVisibleActive(), { emitChange: true });
    }

    function syncActiveToModelValueForData(): { changed: boolean; prev: number; next: number } {
      const prev = active.value;
      const next = clampedModelValue();
      if (prev === next) {
        return { changed: false, prev, next };
      }
      active.value = next;
      return { changed: true, prev, next };
    }

    function syncExternalModelValue(value: number): void {
      const prev = active.value;
      const next = clamp(value, 0, Math.max(0, props.items.length - 1));
      const hadPendingWheel = wheelMailbox.hasPending();
      const changedActive = active.value !== next;
      const wasDetached = detachedByWheel;

      if (hadPendingWheel || wasDetached || changedActive) {
        reattachSelection();
      }

      active.value = next;
      const changedScroll = ensureActiveVisible();
      if (!changedScroll && changedActive) markIndexRowsDirty(prev, next);

      if (hadPendingWheel || changedActive || changedScroll) {
        scheduler.invalidate({ priority: "high", reason: "input" });
      }
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
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          const r = absRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          if (idx >= 0 && idx < props.items.length) {
            selectActive(idx);
          } else {
            emit("close");
          }
        },
        dblclick: (e: TerminalPointerEvent) => {
          const r = absRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
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
          if (!dir || nextTop === baseTop) return;

          e.preventDefault?.();
          pendingWheelTop = nextTop;
          wheelMailbox.queue(nextTop);
        },
        focus: () => {
          focused.value = true;
          emit("focus");
          scheduler.invalidate();
        },
        blur: () => {
          focused.value = false;
          emit("blur");
          if (props.closeOnBlur) emit("close");
          scheduler.invalidate();
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
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.w,
        props.h,
        props.items,
        props.style,
        focused.value,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const top = clamp(scrollTop.value, 0, Math.max(0, props.items.length - r.h));
        const activeStyle = defaultActiveStyle(base);
        const paintRow = (i: number) => {
          if (i < 0 || i >= r.h) return;
          const idx = top + i;
          const line = formatInlineCellLine(props.items[idx] ?? "", r.w);
          const style = idx === active.value ? activeStyle : base;
          terminal.write(line, { x: r.x, y: r.y + i, style });
        };

        if (dirtyRows) {
          if (dirtyRows.length === 0) return;
          paintRowsScratch.length = 0;
          for (const y of dirtyRows) {
            const localY = Math.floor(y) - r.y;
            if (localY < 0 || localY >= r.h) continue;
            if (paintRowsScratch.includes(localY)) continue;
            paintRowsScratch.push(localY);
          }
          for (const localY of paintRowsScratch) paintRow(localY);
          if (
            focused.value &&
            props.items.length === 0 &&
            r.h > 0 &&
            paintRowsScratch.includes(0)
          ) {
            terminal.write(formatInlineCellLine("(empty)", r.w), {
              x: r.x,
              y: r.y,
              style: { ...base, dim: true },
            });
          }
          return;
        }

        for (let i = 0; i < r.h; i++) paintRow(i);
        if (focused.value && r.h > 0 && props.items.length === 0) {
          terminal.write(formatInlineCellLine("(empty)", r.w), {
            x: r.x,
            y: r.y,
            style: { ...base, dim: true },
          });
        }
      },
    }));

    watch(
      () => props.modelValue,
      (value) => syncExternalModelValue(value),
      { immediate: true },
    );

    watch(
      [() => props.items.length, viewportRows],
      ([itemsLength, height], [prevItemsLength, prevHeight]) => {
        const structureChanged = itemsLength !== prevItemsLength || height !== prevHeight;
        const last = Math.max(0, props.items.length - 1);
        let needsInvalidate = false;
        const wheelDetachedOrPending = detachedByWheel || wheelMailbox.hasPending();

        if (wheelDetachedOrPending) {
          if (active.value > last) {
            const prevActive = active.value;
            active.value = last;
            if (prevActive !== active.value) markIndexRowsDirty(prevActive, active.value);
            needsInvalidate = true;
          }
        } else {
          const modelSync = syncActiveToModelValueForData();
          if (modelSync.changed) {
            needsInvalidate = true;
            const changedScroll = ensureActiveVisible();
            if (!changedScroll) markIndexRowsDirty(modelSync.prev, modelSync.next);
            needsInvalidate = changedScroll || needsInvalidate;
          }
        }

        if (pendingWheelTop !== null) {
          pendingWheelTop = clampScrollTop(pendingWheelTop);
        }

        const clampedTop = clampScrollTop(scrollTop.value);
        if (clampedTop !== scrollTop.value) {
          // Scroll is defined as viewport-top changes, including programmatic
          // clamps caused by data length or clipped viewport changes.
          setScrollTop(clampedTop, { emitScroll: true });
          needsInvalidate = true;
        }

        if (!wheelDetachedOrPending) {
          needsInvalidate = ensureActiveVisible() || needsInvalidate;
        }

        if (structureChanged) {
          markViewportDirty();
          needsInvalidate = true;
        }

        if (needsInvalidate) {
          scheduler.invalidate({ priority: "normal", reason: "data" });
        }
      },
    );

    return () => h("span", rootProps);
  },
});
