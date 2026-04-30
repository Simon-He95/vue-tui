import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import { computed, defineComponent, h, inject, ref, watch, watchEffect } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey, RenderPlaneContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { formatInlineCellLine } from "../utils/text.js";
import { applyWheelScroll, createWheelScrollState } from "../utils/wheel-scroll.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
    (deltaMode == null || deltaMode === 0)
  ) {
    return { deltaY: deltaY / 100, mode: "line" };
  }
  if (deltaMode === 1) return { deltaY, mode: "line" };
  if (deltaMode === 0) return { deltaY, mode: "pixel" };
  return { deltaY, mode: "auto" };
}

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
      type: Function as PropType<(item: unknown, index: number) => string>,
      default: undefined,
    },
    modelValue: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "change", "scroll", "focus", "blur", "keydown"],
  setup(props, { emit }) {
    const { terminal, scheduler, render, renderer, defaultStyle, events } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const plane = inject(RenderPlaneContextKey, ref<TerminalRenderPlane>("default"));
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const focused = ref(false);
    const active = ref(props.modelValue);
    const scrollTop = ref(0);
    let dirtyRowsHint: readonly number[] | undefined;
    const wheelState = createWheelScrollState();

    const absRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    const visibleWindow = computed(() => {
      const h = Math.max(0, absRect.value.h);
      const top = clamp(scrollTop.value, 0, Math.max(0, props.itemCount - h));
      return { top, end: Math.min(props.itemCount, top + h), h };
    });

    watchEffect(() => {
      active.value = clamp(props.modelValue, 0, Math.max(0, props.itemCount - 1));
    });

    function ensureActiveVisible(): void {
      const h = Math.max(0, props.h);
      if (h <= 0) return;
      const maxTop = Math.max(0, props.itemCount - h);
      let nextTop = clamp(scrollTop.value, 0, maxTop);
      if (active.value < nextTop) nextTop = active.value;
      else if (active.value >= nextTop + h) nextTop = clamp(active.value - (h - 1), 0, maxTop);
      applyScrollTop(nextTop);
    }

    watch(
      [() => active.value, () => props.itemCount, () => props.h],
      () => {
        ensureActiveVisible();
      },
      { immediate: true },
    );

    function itemText(index: number): string {
      const item = props.getItem(index);
      return props.renderItem ? props.renderItem(item, index) : String(item ?? "");
    }

    function commit(index: number): void {
      const next = clamp(index, 0, Math.max(0, props.itemCount - 1));
      active.value = next;
      emit("update:modelValue", next);
      emit("change", { index: next, value: props.getItem(next) });
    }

    function moveActive(index: number): void {
      const prevTop = scrollTop.value;
      active.value = clamp(index, 0, Math.max(0, props.itemCount - 1));
      emit("update:modelValue", active.value);
      ensureActiveVisible();
      if (scrollTop.value !== prevTop) dirtyRowsHint = viewportRows();
      else setDirtyRowsHint(viewportRows());
      if (renderNodeId) render.update(renderNodeId, { dirtyRowsHint });
      scheduler.invalidate({ priority: "high", plane: plane.value });
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
        moveActive(active.value - props.h);
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        moveActive(active.value + props.h);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        moveActive(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        moveActive(props.itemCount - 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit(active.value);
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
          if (idx < 0 || idx >= props.itemCount) return;
          active.value = idx;
          emit("update:modelValue", idx);
          scheduler.invalidate();
        },
        dblclick: (e: TerminalPointerEvent) => {
          const r = absRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          if (idx >= 0 && idx < props.itemCount) commit(idx);
        },
        wheel: (e: any) => {
          const { deltaY, mode } = getWheelScrollInput(e);
          if (!deltaY) return;
          const h = Math.max(0, absRect.value.h);
          const maxTop = Math.max(0, props.itemCount - h);
          const { nextTop, dir } = applyWheelScroll(
            wheelState,
            deltaY,
            scrollTop.value,
            maxTop,
            Date.now(),
            mode,
          );
          if (!dir || nextTop === scrollTop.value) return;

          applyScrollTop(nextTop);
          emit("scroll", nextTop);
          scheduler.invalidate({ priority: "high", plane: plane.value });
        },
        focus: () => {
          focused.value = true;
          emit("focus");
          scheduler.invalidate();
        },
        blur: () => {
          focused.value = false;
          emit("blur");
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

    function exposedRowsForDelta(y0: number, h: number, delta: number): number[] {
      const rows: number[] = [];
      if (delta > 0) {
        for (let i = h - delta; i < h; i++) rows.push(y0 + i);
      } else {
        for (let i = 0; i < -delta; i++) rows.push(y0 + i);
      }
      return rows;
    }

    function viewportRows(): number[] {
      const r = absRect.value;
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

    let renderNodeId: string | null = null;
    function setDirtyRowsHint(nextRows: readonly number[]): void {
      dirtyRowsHint = unionDirtyRows(nextRows);
      if (renderNodeId) render.update(renderNodeId, { dirtyRowsHint });
    }

    function applyScrollTop(nextTop: number): void {
      const r = absRect.value;
      const h = Math.max(0, Math.floor(r.h));
      const clampedTop = clamp(nextTop, 0, Math.max(0, props.itemCount - h));
      const delta = clampedTop - scrollTop.value;
      if (!delta) return;
      scrollTop.value = clampedTop;
      const size = terminal.size();
      const ownsFullRows = Math.floor(r.x) === 0 && Math.floor(r.w) >= size.cols;
      const canUseScrollPlane = !renderer.value && ownsFullRows && Math.abs(delta) < h;
      if (canUseScrollPlane) {
        render.scrollPlane(plane.value, r.y, r.y + h, delta);
        setDirtyRowsHint(exposedRowsForDelta(r.y, h, delta));
        return;
      }
      setDirtyRowsHint(viewportRows());
    }

    const renderNode = useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      dirtyRowsHint,
      priority: dirtyRowsHint?.length ? "high" : "normal",
      deps: [
        visible.value,
        absRect.value,
        props.itemCount,
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
        const consumedHint = dirtyRowsHint;
        dirtyRowsHint = undefined;
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const activeStyle = props.activeStyle ?? (base.inverse ? base : { ...base, inverse: true });
        const top = visibleWindow.value.top;

        const paintRow = (y: number): void => {
          if (y < r.y || y >= r.y + r.h) return;
          const idx = top + (y - r.y);
          const line = formatInlineCellLine(idx < props.itemCount ? itemText(idx) : "", r.w);
          const style = idx === active.value ? activeStyle : base;
          terminal.write(line, { x: r.x, y, style });
        };

        const rows = dirtyRows ?? consumedHint;
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
