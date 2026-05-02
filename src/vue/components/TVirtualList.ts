import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import type { FramePerfReason } from "../../observability/frame-perf.js";
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
import { EventZIndexContextKey, RenderPlaneContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
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

const activeStyleCache = new WeakMap<Style, Style>();

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

type ScrollStrategy = "auto" | "viewport-repaint";
export type RowScrollMode = "off" | "unsafe-full-row";

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
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    rowScrollMode: {
      type: String as PropType<RowScrollMode>,
      default: "off",
    },
  },
  emits: ["update:modelValue", "change", "scroll", "focus", "blur", "keydown"],
  setup(props, { emit }) {
    const { terminal, scheduler, render, rendererCapabilities, defaultStyle, events } =
      useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const plane = inject(RenderPlaneContextKey, ref<TerminalRenderPlane>("default"));
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const focused = ref(false);
    const active = ref(props.modelValue);
    const scrollTop = ref(0);
    // One-shot manual dirty rows are only for stable-rect scroll fast paths.
    // Reactive deps and rect changes repaint through useRenderNode normally.
    let dirtyRowsHint: readonly number[] | undefined;
    let renderNodeId: string | null = null;
    const warnedIgnoredRowScrollReasons = new Set<string>();
    let warnedEnabledRowScroll = false;
    let warnedGetItemIdentity = false;
    let warnedRenderItemIdentity = false;
    let alive = true;
    let pendingWheelTop: number | null = null;
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

    function normalizeRect(r: Rect): Rect {
      return {
        x: Math.floor(r.x),
        y: Math.floor(r.y),
        w: Math.max(0, Math.floor(r.w)),
        h: Math.max(0, Math.floor(r.h)),
      };
    }

    function normalizedRect(): Rect {
      return normalizeRect(absRect.value);
    }

    function normalizedFullRect(): Rect {
      return normalizeRect(fullRect.value);
    }

    function clipOffsets(): { x: number; y: number } {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      return {
        x: Math.max(0, clip.x - full.x),
        y: Math.max(0, clip.y - full.y),
      };
    }

    function isClipped(): boolean {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      return full.x !== clip.x || full.y !== clip.y || full.w !== clip.w || full.h !== clip.h;
    }

    function maxScrollTop(): number {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      return Math.max(0, itemCount.value - (clipY + clip.h));
    }

    const visibleWindow = computed(() => {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      const top = clamp(scrollTop.value, 0, maxScrollTop());
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
      strategy: ScrollStrategy = "viewport-repaint",
      options?: Readonly<{
        emitScroll?: boolean;
        priority?: "low" | "normal" | "high";
        reason?: FramePerfReason;
      }>,
    ): boolean {
      const clip = normalizedRect();
      const full = normalizedFullRect();
      if (clip.h <= 0 || full.h <= 0) return false;
      const { y: clipY } = clipOffsets();
      const maxTop = maxScrollTop();
      let nextTop = clamp(scrollTop.value, 0, maxTop);
      const visibleStart = nextTop + clipY;
      const visibleEnd = visibleStart + clip.h - 1;
      if (active.value < visibleStart) nextTop = clamp(active.value - clipY, 0, maxTop);
      else if (active.value > visibleEnd)
        nextTop = clamp(active.value - (clipY + clip.h - 1), 0, maxTop);
      return applyScrollTop(nextTop, strategy, options);
    }

    function normalizedModelValue(): number {
      return normalizeIndex(props.modelValue, itemCount.value);
    }

    let initializedModel = false;
    let initializedGeometry = false;

    watch(
      () => props.modelValue,
      () => {
        const emitScroll = initializedModel;
        initializedModel = true;
        resetWheelScrollState(wheelState);
        active.value = normalizedModelValue();
        ensureActiveVisible("viewport-repaint", { emitScroll });
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
        const nextTop = clamp(scrollTop.value, 0, maxScrollTop());
        const changed = applyScrollTop(nextTop, "viewport-repaint", { emitScroll });
        if (!changed) markViewportDirty();
        invalidateSelf();
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

    function itemText(index: number): string {
      const item = props.getItem(index);
      const raw = props.renderItem ? props.renderItem(item, index) : item;
      return String(raw ?? "");
    }

    function commit(index: number): void {
      if (itemCount.value <= 0) return;
      const next = clamp(index, 0, itemCount.value - 1);
      active.value = next;
      emit("update:modelValue", next);
      emit("change", { index: next, value: props.getItem(next) });
    }

    function cancelWheelScrollFrame(): void {
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
    }

    function requestWheelScroll(nextTop: number): void {
      pendingWheelTop = nextTop;
      scheduler.queueFrameTask({
        id: `TVirtualList:${renderNodeId ?? "pending"}:wheel`,
        reason: "scroll",
        priority: "high",
        sync: true,
        run(ctx) {
          if (!alive) return;
          const top = pendingWheelTop;
          pendingWheelTop = null;
          if (top == null) return;
          const changed = applyScrollTop(top, "auto", { emitScroll: true });
          if (!changed) return;
          ctx.invalidate({ priority: "high", plane: plane.value, reason: "scroll" });
        },
      });
    }

    function invalidateSelf(
      priority: "low" | "normal" | "high" = "normal",
      reason?: FramePerfReason,
    ): void {
      scheduler.invalidate({ priority, plane: plane.value, reason });
    }

    function warnIgnoredRowScroll(reason: string): void {
      if (warnedIgnoredRowScrollReasons.has(reason) || !(globalThis as any).__VT_DEBUG_PERF__)
        return;
      warnedIgnoredRowScrollReasons.add(reason);
      console.warn(`[vue-tui] TVirtualList.rowScrollMode="unsafe-full-row" ignored: ${reason}`);
    }

    function warnEnabledRowScroll(): void {
      if (warnedEnabledRowScroll || !(globalThis as any).__VT_DEBUG_PERF__) return;
      warnedEnabledRowScroll = true;
      console.warn(
        '[vue-tui] TVirtualList.rowScrollMode="unsafe-full-row" shifts whole plane rows. Use only when these rows are exclusively owned by this component.',
      );
    }

    function moveActive(index: number): void {
      if (itemCount.value <= 0) return;
      cancelWheelScrollFrame();
      const prevTop = scrollTop.value;
      active.value = clamp(index, 0, Math.max(0, itemCount.value - 1));
      emit("update:modelValue", active.value);
      const scrolled = ensureActiveVisible("viewport-repaint");
      if (scrolled) emit("scroll", scrollTop.value);
      if (!scrolled || scrollTop.value === prevTop) markViewportDirty();
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

    const eventNode = useTerminalNode(() => ({
      rect: normalizedRect(),
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          cancelWheelScrollFrame();
          const r = normalizedRect();
          const { y: clipY } = clipOffsets();
          const idx = scrollTop.value + clipY + (e.cellY - r.y);
          if (idx < 0 || idx >= itemCount.value) return;
          active.value = idx;
          emit("update:modelValue", idx);
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

          e.preventDefault?.();
          requestWheelScroll(nextTop);
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

    onBeforeUnmount(() => {
      alive = false;
      cancelWheelScrollFrame();
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

    function markRowsDirty(nextRows: readonly number[]): void {
      dirtyRowsHint = unionDirtyRows(nextRows);
      if (renderNodeId) render.update(renderNodeId, { dirtyRowsHint });
    }

    function markViewportDirty(): void {
      markRowsDirty(viewportRows());
    }

    function applyScrollTop(
      nextTop: number,
      strategy: ScrollStrategy = "auto",
      options?: Readonly<{
        emitScroll?: boolean;
        priority?: "low" | "normal" | "high";
        reason?: FramePerfReason;
      }>,
    ): boolean {
      const r = normalizedRect();
      const full = normalizedFullRect();
      const h = r.h;
      if (h <= 0 || full.h <= 0) return false;
      const clampedTop = clamp(nextTop, 0, maxScrollTop());
      const delta = clampedTop - scrollTop.value;
      if (!delta) return false;
      scrollTop.value = clampedTop;
      const size = terminal.size();
      const ownsFullRows = Math.floor(r.x) === 0 && Math.floor(r.w) >= size.cols;
      const withinTerminalRows = r.y >= 0 && r.y + h <= size.rows;
      const wantsUnsafeRowScroll = props.rowScrollMode === "unsafe-full-row";
      const supportsScrollOperations = rendererCapabilities.value.scrollOperations;
      if (strategy === "auto" && wantsUnsafeRowScroll) {
        if (!supportsScrollOperations)
          warnIgnoredRowScroll("renderer does not support scroll operations");
        else if (!ownsFullRows) warnIgnoredRowScroll("list does not own full terminal rows");
        else if (isClipped()) warnIgnoredRowScroll("list rect is clipped");
        else if (!withinTerminalRows) warnIgnoredRowScroll("list rows are outside terminal bounds");
      }
      // Row-scroll requires a renderer that consumes terminal scrollOperations.
      // It also requires unsafe opt-in so consumers acknowledge plane row-shift semantics.
      const canUseScrollPlane =
        strategy === "auto" &&
        wantsUnsafeRowScroll &&
        supportsScrollOperations &&
        ownsFullRows &&
        withinTerminalRows &&
        !isClipped() &&
        Math.abs(delta) < h &&
        !dirtyRowsHint?.length;
      if (canUseScrollPlane) {
        warnEnabledRowScroll();
        render.unsafeScrollPlaneRows(plane.value, r.y, r.y + h, delta);
        markRowsDirty(exposedRowsForDelta(r.y, h, delta));
        if (options?.emitScroll) emit("scroll", scrollTop.value);
        if (options?.priority) invalidateSelf(options.priority, options.reason ?? "scroll");
        return true;
      }
      markViewportDirty();
      if (options?.emitScroll) emit("scroll", scrollTop.value);
      if (options?.priority) invalidateSelf(options.priority, options.reason ?? "scroll");
      return true;
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
