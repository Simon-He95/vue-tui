import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent } from "../../events/index.js";
import type { FramePerfReason } from "../../observability/frame-perf.js";
import type { TLogDataSource, TLogViewScrollPayload } from "../log/types.js";
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

type ScrollStrategy = "auto" | "viewport-repaint";
type RowScrollMode = "off" | "unsafe-full-row";

let nextTLogViewTaskId = 0;

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

export const TLogView = defineComponent({
  name: "TLogView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    source: {
      type: Object as PropType<TLogDataSource>,
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    style: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    autoFocus: { type: Boolean, default: false },
    autoStickToBottom: { type: Boolean, default: true },
    overscan: { type: Number, default: 2 },
    rowScrollMode: {
      type: String as PropType<RowScrollMode>,
      default: "off",
    },
  },
  emits: ["scroll", "focus", "blur", "keydown"],
  setup(props, { emit }) {
    const { terminal, scheduler, render, rendererCapabilities, defaultStyle, events } =
      useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const plane = inject(RenderPlaneContextKey, ref<TerminalRenderPlane>("default"));
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const focused = ref(false);
    const scrollTop = ref(0);
    const stickToBottom = ref(true);
    const frameTaskId = `TLogView:${nextTLogViewTaskId++}`;
    let dirtyRowsHint: readonly number[] | undefined;
    let renderNodeId: string | null = null;
    let alive = true;
    let pendingWheelTop: number | null = null;
    let lastLineCount = 0;
    let lastPaintedBottom: Readonly<{
      index: number;
      text: string;
    }> | null = null;
    const wheelState = createWheelScrollState();

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

    function lineCount(): number {
      const n = Math.floor(Number(props.source.lineCount()));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    function maxScrollTop(): number {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      return Math.max(0, lineCount() - (clipY + clip.h));
    }

    function viewportHeight(): number {
      return normalizedRect().h;
    }

    function isAtBottom(): boolean {
      return scrollTop.value >= maxScrollTop();
    }

    function scrollPayload(): TLogViewScrollPayload {
      return {
        scrollTop: scrollTop.value,
        atBottom: isAtBottom(),
        lineCount: lineCount(),
      };
    }

    function emitScroll(): void {
      emit("scroll", scrollPayload());
    }

    function invalidateSelf(
      priority: "low" | "normal" | "high" = "normal",
      reason?: FramePerfReason,
    ): void {
      scheduler.invalidate({ priority, plane: plane.value, reason });
    }

    function cancelWheelScrollFrame(): void {
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
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

    function tailMutationDirtyRow(
      prevCount: number,
      nextCount: number,
      delta: number,
      r: Rect,
    ): number | null {
      if (delta <= 0 || delta >= r.h) return null;
      if (prevCount <= 0 || nextCount <= prevCount) return null;
      if (lastPaintedBottom?.index !== prevCount - 1) return null;
      const nextText = props.source.getLine(prevCount - 1);
      if (nextText === lastPaintedBottom.text) return null;
      return r.y + r.h - delta - 1;
    }

    function applyScrollTop(
      nextTop: number,
      strategy: ScrollStrategy = "auto",
      options?: Readonly<{
        emitScroll?: boolean;
        stickToBottom?: boolean;
        extraDirtyRows?: readonly number[];
      }>,
    ): boolean {
      const r = normalizedRect();
      const full = normalizedFullRect();
      const h = r.h;
      if (h <= 0 || full.h <= 0) return false;
      const clampedTop = clamp(nextTop, 0, maxScrollTop());
      const delta = clampedTop - scrollTop.value;
      if (!delta) {
        if (options?.stickToBottom != null) stickToBottom.value = options.stickToBottom;
        return false;
      }
      scrollTop.value = clampedTop;
      stickToBottom.value = options?.stickToBottom ?? isAtBottom();

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
        markRowsDirty(
          options?.extraDirtyRows?.length
            ? [...exposedRowsForDelta(r.y, h, delta), ...options.extraDirtyRows]
            : exposedRowsForDelta(r.y, h, delta),
        );
        if (options?.emitScroll) emitScroll();
        return true;
      }

      markViewportDirty();
      if (options?.emitScroll) emitScroll();
      return true;
    }

    function visibleLineRange(): { start: number; end: number } {
      const r = normalizedRect();
      const { y: clipY } = clipOffsets();
      const top = clamp(scrollTop.value, 0, maxScrollTop());
      const start = top + clipY;
      return { start, end: start + r.h };
    }

    function viewportIntersectsLines(startIndex: number, endIndex: number): boolean {
      const visible = visibleLineRange();
      return startIndex < visible.end && endIndex > visible.start;
    }

    function handleSourceVersionChanged(): boolean {
      const prevCount = lastLineCount;
      const nextCount = lineCount();
      lastLineCount = nextCount;

      if (nextCount < prevCount) {
        const nextTop = stickToBottom.value
          ? maxScrollTop()
          : clamp(scrollTop.value, 0, maxScrollTop());
        const changed = applyScrollTop(nextTop, "viewport-repaint", {
          emitScroll: true,
          stickToBottom: stickToBottom.value && nextTop >= maxScrollTop(),
        });
        if (!changed) markViewportDirty();
        return true;
      }

      if (props.autoStickToBottom && stickToBottom.value) {
        const r = normalizedRect();
        const prevTop = scrollTop.value;
        const nextTop = maxScrollTop();
        const delta = nextTop - prevTop;
        const extraDirtyRow = tailMutationDirtyRow(prevCount, nextCount, delta, r);
        const changed = applyScrollTop(nextTop, "auto", {
          emitScroll: true,
          stickToBottom: true,
          extraDirtyRows: extraDirtyRow == null ? undefined : [extraDirtyRow],
        });
        if (!changed) markViewportDirty();
        return true;
      }

      if (nextCount > prevCount) {
        const changedStart = Math.max(0, prevCount - 1);
        if (viewportIntersectsLines(changedStart, nextCount)) {
          markViewportDirty();
          return true;
        }
      }

      if (scrollTop.value > maxScrollTop()) {
        const changed = applyScrollTop(maxScrollTop(), "viewport-repaint", {
          emitScroll: true,
          stickToBottom: isAtBottom(),
        });
        if (!changed) markViewportDirty();
        return true;
      }

      if (
        nextCount === prevCount &&
        nextCount > 0 &&
        viewportIntersectsLines(nextCount - 1, nextCount)
      ) {
        markViewportDirty();
        return true;
      }

      return false;
    }

    function requestStreamFrame(): void {
      scheduler.queueFrameTask({
        id: `${frameTaskId}:stream`,
        reason: "stream",
        priority: stickToBottom.value ? "high" : "normal",
        sync: stickToBottom.value,
        run(ctx) {
          if (!alive) return;
          const invalidated = handleSourceVersionChanged();
          if (!invalidated) return;
          ctx.invalidate({
            priority: stickToBottom.value ? "high" : "normal",
            plane: plane.value,
            reason: "stream",
          });
        },
      });
    }

    function requestWheelScroll(nextTop: number): void {
      pendingWheelTop = nextTop;
      scheduler.queueFrameTask({
        id: `${frameTaskId}:wheel`,
        reason: "scroll",
        priority: "high",
        sync: true,
        run(ctx) {
          if (!alive) return;
          const top = pendingWheelTop;
          pendingWheelTop = null;
          if (top == null) return;
          const changed = applyScrollTop(top, "viewport-repaint", { emitScroll: true });
          if (!changed) return;
          ctx.invalidate({ priority: "high", plane: plane.value, reason: "scroll" });
        },
      });
    }

    function keyboardScroll(nextTop: number, nextStick?: boolean): void {
      cancelWheelScrollFrame();
      const changed = applyScrollTop(nextTop, "viewport-repaint", {
        emitScroll: true,
        stickToBottom: nextStick,
      });
      if (!changed && nextStick != null) stickToBottom.value = nextStick;
      if (changed) invalidateSelf("high", "input");
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (e.key === "ArrowUp") {
        e.preventDefault();
        keyboardScroll(scrollTop.value - 1, false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        keyboardScroll(scrollTop.value + 1);
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        keyboardScroll(scrollTop.value - viewportHeight(), false);
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        keyboardScroll(scrollTop.value + viewportHeight());
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        keyboardScroll(0, false);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        keyboardScroll(maxScrollTop(), true);
      }
    }

    const eventNode = useTerminalNode(() => ({
      rect: normalizedRect(),
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
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

    watch(
      () => props.version,
      () => {
        resetWheelScrollState(wheelState);
        requestStreamFrame();
      },
    );

    watch(
      [
        () => props.source,
        () => fullRect.value.y,
        () => fullRect.value.h,
        () => absRect.value.y,
        () => absRect.value.h,
      ],
      () => {
        resetWheelScrollState(wheelState);
        lastLineCount = lineCount();
        const nextTop = stickToBottom.value
          ? maxScrollTop()
          : clamp(scrollTop.value, 0, maxScrollTop());
        const changed = applyScrollTop(nextTop, "viewport-repaint", {
          stickToBottom: stickToBottom.value && nextTop >= maxScrollTop(),
        });
        if (!changed) markViewportDirty();
        invalidateSelf("normal", "data");
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      alive = false;
      cancelWheelScrollFrame();
    });

    const renderNode = useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? normalizedRect() : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        props.source,
        focused.value,
        props.style,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        dirtyRowsHint = undefined;
        lastPaintedBottom = null;
        if (!visible.value) return;
        const r = normalizedRect();
        const full = normalizedFullRect();
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const count = lineCount();
        const top = clamp(scrollTop.value, 0, maxScrollTop());
        const { x: clipX, y: clipY } = clipOffsets();

        const paintRow = (y: number): void => {
          if (y < r.y || y >= r.y + r.h) return;
          const idx = top + clipY + (y - r.y);
          const text = idx >= 0 && idx < count ? props.source.getLine(idx) : "";
          if (idx === count - 1 && y === r.y + r.h - 1) {
            lastPaintedBottom = { index: idx, text };
          }
          const fullLine = formatInlineCellLine(text, full.w);
          const line = padEndByCells(sliceByCellsRange(fullLine, clipX, clipX + r.w), r.w);
          terminal.write(line, { x: r.x, y, style: base });
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

    lastLineCount = lineCount();

    return () => h("span", rootProps);
  },
});
