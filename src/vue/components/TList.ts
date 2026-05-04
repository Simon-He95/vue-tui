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
    const scrollTop = ref(0);
    const wheelState = createWheelScrollState();
    let detachedByWheel = false;
    let pendingWheelTop: number | null = null;

    const absRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    watchEffect(() => {
      active.value = clamp(props.modelValue, 0, Math.max(0, props.items.length - 1));
    });

    function viewportHeight(): number {
      return Math.max(0, props.h);
    }

    function maxScrollTop(): number {
      return Math.max(0, props.items.length - viewportHeight());
    }

    function clampScrollTop(value: number): number {
      return clamp(value, 0, maxScrollTop());
    }

    function applyScrollTop(nextTop: number, options?: { emitScroll?: boolean }): boolean {
      const clampedTop = clampScrollTop(nextTop);
      if (clampedTop === scrollTop.value) return false;
      scrollTop.value = clampedTop;
      const nodeId = renderNode.id.value;
      if (nodeId) {
        const r = absRect.value;
        const dirtyRows: number[] = [];
        for (let y = r.y; y < r.y + r.h; y++) dirtyRows.push(y);
        render.update(nodeId, { dirtyRowsHint: dirtyRows });
      }
      if (options?.emitScroll !== false) emit("scroll", clampedTop);
      return true;
    }

    function ensureActiveVisible(): void {
      const h = viewportHeight();
      if (h <= 0) return;
      const maxTop = maxScrollTop();
      scrollTop.value = clampScrollTop(scrollTop.value);
      if (active.value < scrollTop.value) scrollTop.value = active.value;
      else if (active.value >= scrollTop.value + h)
        scrollTop.value = clamp(active.value - (h - 1), 0, maxTop);
    }

    watch(
      () => active.value,
      () => {
        detachedByWheel = false;
        ensureActiveVisible();
      },
      { immediate: true },
    );

    watch(
      [() => props.items.length, () => props.h],
      () => {
        scrollTop.value = clampScrollTop(scrollTop.value);
        if (detachedByWheel) return;
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

    function cancelWheelScrollFrame(): void {
      pendingWheelTop = null;
      wheelMailbox.cancel();
      resetWheelScrollState(wheelState);
    }

    function visibleKeyboardAnchor(direction: -1 | 1): number {
      const h = viewportHeight();
      if (h <= 0) return active.value;
      const start = scrollTop.value;
      const end = scrollTop.value + h - 1;
      if (active.value < start) return start;
      if (active.value > end) return end;
      return clamp(active.value + direction, 0, Math.max(0, props.items.length - 1));
    }

    function moveActiveFromKeyboard(next: number): void {
      detachedByWheel = false;
      cancelWheelScrollFrame();
      const clamped = clamp(next, 0, Math.max(0, props.items.length - 1));
      active.value = clamped;
      emit("update:modelValue", clamped);
      ensureActiveVisible();
      scheduler.invalidate({ priority: "high", reason: "input" });
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActiveFromKeyboard(visibleKeyboardAnchor(-1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActiveFromKeyboard(visibleKeyboardAnchor(1));
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        moveActiveFromKeyboard(active.value - props.h);
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        moveActiveFromKeyboard(active.value + props.h);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        moveActiveFromKeyboard(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        const last = Math.max(0, props.items.length - 1);
        moveActiveFromKeyboard(last);
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

    const wheelMailbox = createFrameMailbox<number>({
      scheduler,
      id: `TList:${tListInstanceId}:wheel`,
      reason: "scroll",
      priority: "high",
      sync: true,
      apply(nextTop, ctx) {
        pendingWheelTop = null;
        const changed = applyScrollTop(nextTop, { emitScroll: true });
        if (!changed) return;
        detachedByWheel = true;
        ctx.invalidate({ priority: "high", reason: "scroll" });
      },
    });

    const eventNode = useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          cancelWheelScrollFrame();
          const r = absRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          if (idx >= 0 && idx < props.items.length) {
            active.value = idx;
            emit("update:modelValue", idx);
            scheduler.invalidate({ reason: "input" });
          } else {
            emit("close");
          }
        },
        dblclick: (e: TerminalPointerEvent) => {
          cancelWheelScrollFrame();
          const r = absRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          if (idx >= 0 && idx < props.items.length) commit(idx);
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
      wheelMailbox.dispose();
      cancelWheelScrollFrame();
    });

    const renderNode = useRenderNode(() => ({
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
        const activeStyle = defaultActiveStyle(base);

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
