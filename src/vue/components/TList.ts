import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import { computed, defineComponent, h, inject, ref, watch, watchEffect } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
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
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const focused = ref(false);
    const active = ref(props.modelValue);
    const scrollTop = ref(0);
    const wheelState = createWheelScrollState();

    const absRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    watchEffect(() => {
      active.value = clamp(props.modelValue, 0, Math.max(0, props.items.length - 1));
    });

    function ensureActiveVisible(): void {
      const h = Math.max(0, props.h);
      if (h <= 0) return;
      const maxTop = Math.max(0, props.items.length - h);
      scrollTop.value = clamp(scrollTop.value, 0, maxTop);
      if (active.value < scrollTop.value) scrollTop.value = active.value;
      else if (active.value >= scrollTop.value + h)
        scrollTop.value = clamp(active.value - (h - 1), 0, maxTop);
    }

    watch(
      [() => active.value, () => props.items.length, () => props.h],
      () => {
        ensureActiveVisible();
      },
      { immediate: true },
    );

    function commit(index: number): void {
      const next = clamp(index, 0, Math.max(0, props.items.length - 1));
      active.value = next;
      emit("update:modelValue", next);
      emit("change", { index: next, value: props.items[next] ?? "" });
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = clamp(active.value - 1, 0, Math.max(0, props.items.length - 1));
        active.value = next;
        emit("update:modelValue", next);
        ensureActiveVisible();
        scheduler.invalidate();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = clamp(active.value + 1, 0, Math.max(0, props.items.length - 1));
        active.value = next;
        emit("update:modelValue", next);
        ensureActiveVisible();
        scheduler.invalidate();
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        const next = clamp(active.value - props.h, 0, Math.max(0, props.items.length - 1));
        active.value = next;
        emit("update:modelValue", next);
        ensureActiveVisible();
        scheduler.invalidate();
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        const next = clamp(active.value + props.h, 0, Math.max(0, props.items.length - 1));
        active.value = next;
        emit("update:modelValue", next);
        ensureActiveVisible();
        scheduler.invalidate();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        active.value = 0;
        emit("update:modelValue", 0);
        ensureActiveVisible();
        scheduler.invalidate();
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        const last = Math.max(0, props.items.length - 1);
        active.value = last;
        emit("update:modelValue", last);
        ensureActiveVisible();
        scheduler.invalidate();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit(active.value);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        emit("close");
      }
    }

    const { id } = useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          const r = absRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          if (idx >= 0 && idx < props.items.length) {
            active.value = idx;
            emit("update:modelValue", idx);
            scheduler.invalidate();
          } else {
            emit("close");
          }
        },
        dblclick: (e: TerminalPointerEvent) => {
          const r = absRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          if (idx >= 0 && idx < props.items.length) commit(idx);
        },
        wheel: (e: any) => {
          const { deltaY, mode } = getWheelScrollInput(e);
          const delta = deltaY;
          if (!delta) return;
          const h = Math.max(0, props.h);
          const maxTop = Math.max(0, props.items.length - h);
          const { nextTop, dir } = applyWheelScroll(
            wheelState,
            delta,
            scrollTop.value,
            maxTop,
            Date.now(),
            mode,
            {
              disableAcceleration: mode === "pixel",
            },
          );
          if (!dir || nextTop === scrollTop.value) return;
          scrollTop.value = nextTop;
          // Keep active within visible range to prevent ensureActiveVisible from
          // resetting scrollTop when watch triggers (e.g., on height change)
          const visibleStart = nextTop;
          const visibleEnd = nextTop + h - 1;
          if (active.value < visibleStart || active.value > visibleEnd) {
            // Move active to follow scroll direction
            const newActive = dir > 0 ? visibleEnd : visibleStart;
            const clampedActive = clamp(newActive, 0, Math.max(0, props.items.length - 1));
            if (clampedActive !== active.value) {
              active.value = clampedActive;
              emit("update:modelValue", clampedActive);
            }
          }
          emit("scroll", nextTop);
          scheduler.invalidate();
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
      const nodeId = id.value;
      if (!manager || !nodeId) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.w,
        props.h,
        props.items,
        props.modelValue,
        props.style,
        focused.value,
        active.value,
        scrollTop.value,
        defaultStyle.value,
      ],
      paint: () => {
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const top = clamp(scrollTop.value, 0, Math.max(0, props.items.length - r.h));
        const activeStyle = base.inverse ? base : { ...base, inverse: true };

        for (let i = 0; i < r.h; i++) {
          const idx = top + i;
          const line = formatInlineCellLine(props.items[idx] ?? "", r.w);
          const style = idx === active.value ? activeStyle : base;
          terminal.write(line, { x: r.x, y: r.y + i, style });
        }
        if (focused.value && r.h > 0 && props.items.length === 0) {
          terminal.write(formatInlineCellLine("(empty)", r.w), {
            x: r.x,
            y: r.y,
            style: { ...base, dim: true },
          });
        }
      },
    }));

    return () => h("span", rootProps);
  },
});
