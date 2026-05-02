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
import {
  formatInlineCellLine,
  padEndByCells,
  sanitizeInlineText,
  sliceByCellsRange,
  spaces,
  wrapByCells,
} from "../utils/text.js";
import {
  applyWheelScroll,
  createWheelScrollState,
  resetWheelScrollState,
} from "../utils/wheel-scroll.js";

type ScrollStrategy = "auto" | "viewport-repaint";
type RowScrollMode = "off" | "unsafe-full-row";
type TLogLineKey = string | number;
type TLogRenderCacheKey = string;
type TLogRenderCacheEntry = {
  key: TLogRenderCacheKey;
  value: string;
  touchedAt: number;
};
type TLogWrapCacheEntry = {
  key: TLogRenderCacheKey;
  visualRows: readonly string[];
  touchedAt: number;
};
type LocatedVisualRow = {
  lineIndex: number;
  partIndex: number;
};

let nextTLogViewTaskId = 0;
const DEFAULT_LOG_RENDER_CACHE_SIZE = 2_000;
const DEFAULT_LOG_WRAP_CACHE_SIZE = 2_000;
const DEFAULT_VISUAL_INDEX_CAPACITY = 1_024;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function nextPowerOfTwo(n: number): number {
  n = Math.max(1, Math.floor(n));
  let power = 1;
  while (power < n) power <<= 1;
  return power;
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
    wrap: { type: Boolean, default: false },
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
      lineKey: TLogLineKey;
    }> | null = null;
    let cacheClock = 0;
    const renderLineCache = new Map<TLogRenderCacheKey, TLogRenderCacheEntry>();
    const wrapLineCache = new Map<TLogRenderCacheKey, TLogWrapCacheEntry>();
    const wheelState = createWheelScrollState();
    // Unknown wrapped lines count as one row until measured, so large bottom mounts avoid full-source wrapping.
    let visualIndexWidth = 0;
    let visualIndexLineCount = 0;
    let visualIndexCapacity = 0;
    let visualCounts: number[] = [];
    let visualKeys: Array<TLogLineKey | undefined> = [];
    let visualTree: number[] = [0];

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

    function lineKey(index: number): TLogLineKey {
      return props.source.getLineKey?.(index) ?? `v:${props.version}:i:${index}`;
    }

    function renderCacheKey(
      key: TLogLineKey,
      fullW: number,
      clipX: number,
      visibleW: number,
    ): TLogRenderCacheKey {
      return JSON.stringify([key, fullW, clipX, visibleW]);
    }

    function wrapCacheKey(key: TLogLineKey, width: number): TLogRenderCacheKey {
      return JSON.stringify([key, width]);
    }

    function visualLineKey(key: TLogLineKey, partIndex: number): TLogRenderCacheKey {
      return JSON.stringify([key, "part", partIndex]);
    }

    function trimRenderCache(): void {
      const max = DEFAULT_LOG_RENDER_CACHE_SIZE;
      if (renderLineCache.size <= max) return;

      const entries = Array.from(renderLineCache.values()).sort(
        (a, b) => a.touchedAt - b.touchedAt,
      );
      for (const entry of entries.slice(0, renderLineCache.size - max)) {
        renderLineCache.delete(entry.key);
      }
    }

    function trimWrapCache(): void {
      const max = DEFAULT_LOG_WRAP_CACHE_SIZE;
      if (wrapLineCache.size <= max) return;

      const entries = Array.from(wrapLineCache.values()).sort((a, b) => a.touchedAt - b.touchedAt);
      for (const entry of entries.slice(0, wrapLineCache.size - max)) {
        wrapLineCache.delete(entry.key);
      }
    }

    function clearLineCaches(): void {
      renderLineCache.clear();
      wrapLineCache.clear();
    }

    function renderLine(
      index: number,
      count: number,
      fullW: number,
      clipX: number,
      visibleW: number,
    ): string {
      if (index < 0 || index >= count) return spaces(visibleW);

      const rawKey = lineKey(index);
      const key = renderCacheKey(rawKey, fullW, clipX, visibleW);
      const cached = renderLineCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.value;
      }

      const text = props.source.getLine(index);
      const fullLine = formatInlineCellLine(text, fullW);
      const line = padEndByCells(sliceByCellsRange(fullLine, clipX, clipX + visibleW), visibleW);
      renderLineCache.set(key, {
        key,
        value: line,
        touchedAt: ++cacheClock,
      });
      return line;
    }

    function wrappedRowsForLine(index: number, count: number, width: number): readonly string[] {
      if (index < 0 || index >= count) return [""];

      width = Math.max(1, Math.floor(width));
      const rawKey = lineKey(index);
      const key = wrapCacheKey(rawKey, width);
      const cached = wrapLineCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.visualRows;
      }

      const wrapped = wrapByCells(sanitizeInlineText(props.source.getLine(index)), width);
      const rows = wrapped.length ? wrapped : [""];
      wrapLineCache.set(key, {
        key,
        visualRows: rows,
        touchedAt: ++cacheClock,
      });
      return rows;
    }

    function renderVisualLine(
      key: TLogLineKey,
      rawVisual: string,
      fullW: number,
      clipX: number,
      visibleW: number,
    ): string {
      const cacheKey = renderCacheKey(key, fullW, clipX, visibleW);
      const cached = renderLineCache.get(cacheKey);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.value;
      }

      const line = padEndByCells(sliceByCellsRange(rawVisual, clipX, clipX + visibleW), visibleW);
      renderLineCache.set(cacheKey, {
        key: cacheKey,
        value: line,
        touchedAt: ++cacheClock,
      });
      return line;
    }

    function currentWrapWidth(): number {
      return Math.max(1, normalizedFullRect().w);
    }

    function fenwickAdd(index: number, delta: number): void {
      for (let i = index + 1; i <= visualIndexCapacity; i += i & -i) {
        visualTree[i] = (visualTree[i] ?? 0) + delta;
      }
    }

    function fenwickSum(lineEnd: number): number {
      let sum = 0;
      for (let i = clamp(lineEnd, 0, visualIndexLineCount); i > 0; i -= i & -i) {
        sum += visualTree[i] ?? 0;
      }
      return sum;
    }

    function rebuildFenwick(): void {
      visualTree = Array.from({ length: visualIndexCapacity + 1 }, (_, index) =>
        index > 0 && index <= visualIndexLineCount ? (visualCounts[index - 1] ?? 1) : 0,
      );
      for (let i = 1; i <= visualIndexCapacity; i++) {
        const next = i + (i & -i);
        if (next <= visualIndexCapacity) visualTree[next] += visualTree[i] ?? 0;
      }
    }

    function resetVisualIndex(count = lineCount(), width = currentWrapWidth()): void {
      visualIndexWidth = width;
      visualIndexLineCount = count;
      visualIndexCapacity = nextPowerOfTwo(Math.max(DEFAULT_VISUAL_INDEX_CAPACITY, count));
      visualCounts = Array.from({ length: count }, () => 1);
      visualKeys = Array.from({ length: count }, () => undefined);
      rebuildFenwick();
    }

    function ensureVisualCapacity(count: number): void {
      if (count <= visualIndexCapacity) return;
      visualIndexCapacity = nextPowerOfTwo(Math.max(count, visualIndexCapacity * 2));
      rebuildFenwick();
    }

    function appendEstimatedVisualLines(prevCount: number, nextCount: number): void {
      if (nextCount <= prevCount) return;
      ensureVisualCapacity(nextCount);
      visualCounts.length = nextCount;
      visualKeys.length = nextCount;
      for (let i = prevCount; i < nextCount; i++) {
        visualCounts[i] = 1;
        visualKeys[i] = undefined;
        fenwickAdd(i, 1);
      }
      visualIndexLineCount = nextCount;
    }

    function ensureVisualIndex(): void {
      if (!props.wrap) return;
      const count = lineCount();
      const width = currentWrapWidth();
      if (visualIndexCapacity <= 0 || visualIndexWidth !== width || count < visualIndexLineCount) {
        resetVisualIndex(count, width);
        return;
      }
      if (count > visualIndexLineCount) appendEstimatedVisualLines(visualIndexLineCount, count);
    }

    function measureVisualLine(index: number): void {
      ensureVisualIndex();
      if (index < 0 || index >= visualIndexLineCount) return;

      const key = lineKey(index);
      if (visualKeys[index] === key) return;

      const rows = wrappedRowsForLine(index, visualIndexLineCount, visualIndexWidth);
      const nextCount = Math.max(1, rows.length);
      const prevCount = visualCounts[index] ?? 1;
      if (nextCount !== prevCount) {
        visualCounts[index] = nextCount;
        fenwickAdd(index, nextCount - prevCount);
      }
      visualKeys[index] = key;
    }

    function ensureBottomMeasured(): void {
      if (!props.wrap) return;
      ensureVisualIndex();
      const count = visualIndexLineCount;
      const r = normalizedRect();
      const { y: clipY } = clipOffsets();
      const needed = Math.max(0, clipY + r.h + Math.max(0, Math.floor(props.overscan)));
      let rows = 0;
      for (let i = count - 1; i >= 0 && rows < needed; i--) {
        measureVisualLine(i);
        rows += visualCounts[i] ?? 1;
      }
    }

    function estimatedVisualRowCount(): number {
      if (!props.wrap) return lineCount();
      ensureVisualIndex();
      return fenwickSum(visualIndexLineCount);
    }

    function bottomScrollTop(): number {
      if (props.wrap) ensureBottomMeasured();
      return maxScrollTop();
    }

    function visualStartForLine(index: number): number {
      ensureVisualIndex();
      return fenwickSum(index);
    }

    function findLineForVisualRow(visualRow: number): number {
      let index = 0;
      let bit = 1;
      while (bit << 1 <= visualIndexCapacity) bit <<= 1;

      let target = visualRow + 1;
      for (; bit > 0; bit >>= 1) {
        const next = index + bit;
        if (next <= visualIndexCapacity && (visualTree[next] ?? 0) < target) {
          index = next;
          target -= visualTree[next] ?? 0;
        }
      }
      return clamp(index, 0, Math.max(0, visualIndexLineCount - 1));
    }

    function locateVisualRow(visualRow: number): LocatedVisualRow | null {
      ensureVisualIndex();
      if (visualRow < 0 || visualRow >= estimatedVisualRowCount()) return null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const lineIndex = findLineForVisualRow(visualRow);
        measureVisualLine(lineIndex);
        const start = visualStartForLine(lineIndex);
        const count = visualCounts[lineIndex] ?? 1;
        if (visualRow >= start && visualRow < start + count) {
          return { lineIndex, partIndex: visualRow - start };
        }
      }

      const lineIndex = findLineForVisualRow(visualRow);
      const start = visualStartForLine(lineIndex);
      return { lineIndex, partIndex: Math.max(0, visualRow - start) };
    }

    function prepareWrapIndexForSourceChange(prevCount: number, nextCount: number): boolean {
      if (!props.wrap) return false;

      ensureVisualIndex();
      if (nextCount < prevCount) {
        resetVisualIndex(nextCount, currentWrapWidth());
        return false;
      }

      if (nextCount > visualIndexLineCount) {
        appendEstimatedVisualLines(visualIndexLineCount, nextCount);
      }

      const maybeChanged = nextCount > prevCount ? prevCount - 1 : nextCount - 1;
      if (maybeChanged < 0) return false;

      const oldKey = visualKeys[maybeChanged];
      const nextKey = lineKey(maybeChanged);
      if (oldKey === undefined || oldKey === nextKey) return false;

      visualKeys[maybeChanged] = undefined;
      measureVisualLine(maybeChanged);
      return true;
    }

    function maxScrollTop(): number {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      return Math.max(0, estimatedVisualRowCount() - (clipY + clip.h));
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
        estimatedVisualRowCount: estimatedVisualRowCount(),
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
      if (props.wrap) return null;
      if (delta <= 0 || delta >= r.h) return null;
      if (prevCount <= 0 || nextCount <= prevCount) return null;
      if (lastPaintedBottom?.index !== prevCount - 1) return null;
      if (lineKey(prevCount - 1) === lastPaintedBottom.lineKey) return null;
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
      if (options?.stickToBottom === true && props.wrap) ensureBottomMeasured();
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
      if (props.wrap) {
        if (startIndex >= endIndex) return false;
        const visible = visibleLineRange();
        const start = visualStartForLine(startIndex);
        const end =
          endIndex >= lineCount() ? estimatedVisualRowCount() : visualStartForLine(endIndex);
        return start < visible.end && end > visible.start;
      }

      const visible = visibleLineRange();
      return startIndex < visible.end && endIndex > visible.start;
    }

    function handleSourceVersionChanged(): boolean {
      const prevCount = lastLineCount;
      const nextCount = lineCount();
      const wrapExistingMutation = prepareWrapIndexForSourceChange(prevCount, nextCount);
      lastLineCount = nextCount;

      if (nextCount < prevCount) {
        const nextTop = stickToBottom.value
          ? bottomScrollTop()
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
        const nextTop = bottomScrollTop();
        const delta = nextTop - prevTop;
        const extraDirtyRow = tailMutationDirtyRow(prevCount, nextCount, delta, r);
        const changed = applyScrollTop(
          nextTop,
          wrapExistingMutation ? "viewport-repaint" : "auto",
          {
            emitScroll: true,
            stickToBottom: true,
            extraDirtyRows: extraDirtyRow == null ? undefined : [extraDirtyRow],
          },
        );
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
        keyboardScroll(bottomScrollTop(), true);
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

    watch([() => props.source, () => props.wrap, () => fullRect.value.w], () => {
      clearLineCaches();
    });

    watch(
      [
        () => props.source,
        () => props.wrap,
        () => fullRect.value.w,
        () => fullRect.value.y,
        () => fullRect.value.h,
        () => absRect.value.y,
        () => absRect.value.h,
      ],
      () => {
        resetWheelScrollState(wheelState);
        if (props.wrap) resetVisualIndex(lineCount(), currentWrapWidth());
        lastLineCount = lineCount();
        const nextTop = stickToBottom.value
          ? bottomScrollTop()
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
        props.wrap,
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
          const visualIndex = top + clipY + (y - r.y);
          if (props.wrap) {
            const located = locateVisualRow(visualIndex);
            if (!located) {
              terminal.write(spaces(r.w), { x: r.x, y, style: base });
              return;
            }

            const rawKey = lineKey(located.lineIndex);
            const wrappedRows = wrappedRowsForLine(located.lineIndex, count, full.w);
            if (
              located.lineIndex === count - 1 &&
              located.partIndex === wrappedRows.length - 1 &&
              y === r.y + r.h - 1
            ) {
              lastPaintedBottom = { index: located.lineIndex, lineKey: rawKey };
            }
            const line = renderVisualLine(
              visualLineKey(rawKey, located.partIndex),
              wrappedRows[located.partIndex] ?? "",
              full.w,
              clipX,
              r.w,
            );
            terminal.write(line, { x: r.x, y, style: base });
            return;
          }

          const idx = visualIndex;
          if (idx === count - 1 && y === r.y + r.h - 1) {
            lastPaintedBottom = { index: idx, lineKey: lineKey(idx) };
          }
          const line = renderLine(idx, count, full.w, clipX, r.w);
          terminal.write(line, { x: r.x, y, style: base });
        };

        const rows = dirtyRows;
        if (rows?.length) {
          for (const y of rows) paintRow(y);
          trimRenderCache();
          trimWrapCache();
          return;
        }
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
        trimRenderCache();
        trimWrapCache();
      },
    }));

    watchEffect(() => {
      renderNodeId = renderNode.id.value;
    });

    lastLineCount = lineCount();

    return () => h("span", rootProps);
  },
});
