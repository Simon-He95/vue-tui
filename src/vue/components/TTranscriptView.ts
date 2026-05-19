import type { PropType } from "vue";
import type {
  TVirtualRowsHandle,
  TVirtualRowsPaintContext,
  TVirtualRowsRenderNodesContext,
  TVirtualRowsSelectionSpanTextContext,
} from "./TVirtualRows.js";
import type { Style } from "../../core/types.js";
import type { TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/manager/types.js";
import type {
  TTranscriptDataSource,
  TTranscriptHitRegion,
  TTranscriptRegionEvent,
  TTranscriptRow,
  TTranscriptRowEvent,
  TTranscriptSelectionSegment,
  TTranscriptSegment,
  TTranscriptViewHandle,
  TTranscriptVisualRow,
} from "../transcript/types.js";
import { computed, defineComponent, getCurrentInstance, h, ref, watch } from "vue";
import { framePerfNow } from "../../observability/frame-perf.js";
import {
  layoutTranscriptRow,
  transcriptActionRegionId,
  transcriptFoldToggleRegionId,
  transcriptLinkRegionId,
  transcriptToolCallRegionId,
} from "../transcript/layout.js";
import { plainTextForTranscriptRow } from "../transcript/plain-text.js";
import { sliceByCellsRange } from "../utils/text.js";
import { TView } from "./TView.js";
import { TVirtualRows } from "./TVirtualRows.js";
import { useTerminal } from "../composables/use-terminal.js";

type RowScrollMode = "off" | "unsafe-full-row";

type LayoutState = Readonly<{
  visualRows: readonly TTranscriptVisualRow[];
  rowStarts: ReadonlyMap<number, number>;
  rowEnds: ReadonlyMap<number, number>;
  regions: readonly TTranscriptHitRegion[];
}>;

type RowLayoutCacheEntry = Readonly<{
  version: number;
  rowVersion: string | number;
  usesSourceRowVersion: boolean;
  row: TTranscriptRow;
  rowIndex: number;
  rowKey: string | number;
  width: number;
  wrap: boolean;
  baseStyle: Style;
  hoverStyle?: Style;
  focusStyle?: Style;
  hoverRegionId: string | null;
  focusedRegionId: string | null;
  visualRows: readonly TTranscriptVisualRow[];
}>;

const EMPTY_LAYOUT: LayoutState = Object.freeze({
  visualRows: Object.freeze([]),
  rowStarts: new Map(),
  rowEnds: new Map(),
  regions: Object.freeze([]),
});

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function sourceSegmentsForRegion(row: TTranscriptRow): readonly TTranscriptSegment[] {
  if (row.kind === "message") return row.segments;
  if (row.kind === "approval") {
    const description = row.description ?? [];
    return [{ text: row.title }, ...(description.length ? [{ text: " " }] : []), ...description];
  }
  if (row.kind === "tool-call") {
    const content: TTranscriptSegment[] = [
      { text: row.collapsed ? `▸ ${row.title}` : `▾ ${row.title}` },
    ];
    if (row.summary?.length) content.push({ text: " " }, ...row.summary);
    if (!row.collapsed && row.body?.length) content.push({ text: " " }, ...row.body);
    return content;
  }
  return [{ text: row.label }];
}

function rowHasRegionId(row: TTranscriptRow, rowKey: string | number, id: string | null): boolean {
  if (!id) return false;
  if (
    "actions" in row &&
    row.actions?.some((action) => transcriptActionRegionId(rowKey, action.id) === id)
  )
    return true;
  if (
    row.kind === "tool-call" &&
    (transcriptFoldToggleRegionId(rowKey) === id || transcriptToolCallRegionId(rowKey) === id)
  )
    return true;
  const segments = sourceSegmentsForRegion(row);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.href == null) continue;
    if (transcriptLinkRegionId(rowKey, i, segment.tokenId) === id) return true;
  }
  return false;
}

function sameCachedLayout(
  entry: RowLayoutCacheEntry | undefined,
  next: Omit<RowLayoutCacheEntry, "visualRows">,
): boolean {
  return (
    Boolean(entry) &&
    (next.usesSourceRowVersion || entry!.version === next.version) &&
    entry!.rowVersion === next.rowVersion &&
    entry!.usesSourceRowVersion === next.usesSourceRowVersion &&
    (next.usesSourceRowVersion || entry!.row === next.row) &&
    entry!.rowIndex === next.rowIndex &&
    entry!.rowKey === next.rowKey &&
    entry!.width === next.width &&
    entry!.wrap === next.wrap &&
    entry!.baseStyle === next.baseStyle &&
    entry!.hoverStyle === next.hoverStyle &&
    entry!.focusStyle === next.focusStyle &&
    entry!.hoverRegionId === next.hoverRegionId &&
    entry!.focusedRegionId === next.focusedRegionId
  );
}

export const TTranscriptView = defineComponent({
  name: "TTranscriptView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    /**
     * Transcript source. When `getRowKey` and `getRowVersion` are both provided,
     * unchanged rows can skip `getRow()`. The row version must change whenever
     * rendered content, segments, styles, actions, hit regions, or selectable
     * text can change.
     */
    source: {
      type: Object as PropType<TTranscriptDataSource>,
      required: true,
    },
    /**
     * Global data version. When the source provides `getRowVersion`, unchanged
     * row key/version pairs keep their row content/layout cache across global
     * version changes.
     */
    version: { type: Number, required: true },
    /**
     * Controlled viewport scrollTop. Wheel and keyboard scroll repaint
     * optimistically before emitting `update:scrollTop`; a later parent prop
     * write reconciles the view.
     */
    scrollTop: { type: Number, default: undefined },
    defaultScrollTop: { type: Number, default: 0 },
    autoStickToBottom: { type: Boolean, default: false },
    selectable: { type: Boolean, default: true },
    wrap: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    hoverStyle: { type: Object as PropType<Style>, default: undefined },
    focusStyle: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    focusable: { type: Boolean, default: true },
    wheelScroll: { type: Boolean, default: true },
    keyboardRegions: { type: Boolean, default: true },
    rowScrollMode: {
      type: String as PropType<RowScrollMode>,
      default: "unsafe-full-row",
    },
  },
  emits: [
    "scroll",
    "scrollEdge",
    "update:scrollTop",
    "rowClick",
    "actionClick",
    "linkClick",
    "foldToggle",
    "toolClick",
    "hoverRegion",
  ],
  setup(props, { emit, expose }) {
    const { defaultStyle, observability } = useTerminal();
    const instance = getCurrentInstance();
    const rowsRef = ref<TVirtualRowsHandle | null>(null);
    const innerScrollTop = ref(normalizeInt(props.defaultScrollTop));
    const hoveredRegion = ref<TTranscriptHitRegion | null>(null);
    const focusedRegion = ref<TTranscriptHitRegion | null>(null);
    const rowLayoutCache = new Map<number, RowLayoutCacheEntry>();
    let pointerUpActivatedRegionId: string | null = null;
    let pointerDownRegionId: string | null = null;
    let pointerDownCellX = 0;
    let pointerDownCellY = 0;
    let pointerMoved = false;
    let warnedLargeFlattenedRows = false;

    function isScrollControlled(): boolean {
      return Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, "scrollTop");
    }

    function currentScrollTop(): number {
      return normalizeInt(isScrollControlled() ? props.scrollTop : innerScrollTop.value);
    }

    const layoutState = computed<LayoutState>(() => {
      void props.version;
      const perfEnabled = observability.framePerf.enabled.value;
      const perfStartedAt = perfEnabled ? framePerfNow() : 0;
      const width = Math.max(1, Math.floor(props.w));
      const count = Math.max(0, normalizeInt(props.source.rowCount()));
      if (!count) {
        rowLayoutCache.clear();
        if (perfEnabled) {
          observability.framePerf.recordComponent({
            name: "TTranscriptView",
            id: instance?.uid == null ? undefined : String(instance.uid),
            phase: "layout",
            durationMs: framePerfNow() - perfStartedAt,
            itemCount: 0,
            renderedCount: 0,
            cacheHit: 0,
            cacheMiss: 0,
            sourceReadCount: 0,
            sourceSkippedCount: 0,
            width,
            version: props.version,
          });
        }
        return EMPTY_LAYOUT;
      }

      const visualRows: TTranscriptVisualRow[] = [];
      const rowStarts = new Map<number, number>();
      const rowEnds = new Map<number, number>();
      const regions: TTranscriptHitRegion[] = [];
      const baseStyle = props.style ?? defaultStyle.value;
      const hoverRegionId = hoveredRegion.value?.id ?? null;
      const focusedRegionId = focusedRegion.value?.id ?? null;
      let cacheHit = 0;
      let cacheMiss = 0;
      let sourceReadCount = 0;
      let sourceSkippedCount = 0;
      for (let rowIndex = 0; rowIndex < count; rowIndex++) {
        const cached = rowLayoutCache.get(rowIndex);
        const sourceRowKey = props.source.getRowKey?.(rowIndex);
        const sourceRowVersion = props.source.getRowVersion?.(rowIndex);
        let rowKey = sourceRowKey;
        let row: TTranscriptRow | undefined =
          sourceRowVersion != null &&
          rowKey != null &&
          cached?.usesSourceRowVersion &&
          cached.rowVersion === sourceRowVersion &&
          cached.rowKey === rowKey
            ? cached.row
            : undefined;
        if (row) {
          sourceSkippedCount++;
        } else {
          row = props.source.getRow(rowIndex);
          sourceReadCount++;
          rowKey = rowKey ?? row.key;
        }
        const resolvedRowKey = rowKey ?? row.key;
        const localHoverRegionId = rowHasRegionId(row, resolvedRowKey, hoverRegionId)
          ? hoverRegionId
          : null;
        const localFocusedRegionId = rowHasRegionId(row, resolvedRowKey, focusedRegionId)
          ? focusedRegionId
          : null;
        const cacheKey = {
          version: props.version,
          rowVersion: sourceRowVersion ?? props.version,
          usesSourceRowVersion: sourceRowVersion != null,
          row,
          rowIndex,
          rowKey: resolvedRowKey,
          width,
          wrap: props.wrap,
          baseStyle,
          hoverStyle: props.hoverStyle,
          focusStyle: props.focusStyle,
          hoverRegionId: localHoverRegionId,
          focusedRegionId: localFocusedRegionId,
        };
        rowStarts.set(rowIndex, visualRows.length);
        const cacheMatches = sameCachedLayout(cached, cacheKey);
        if (cacheMatches) cacheHit++;
        else cacheMiss++;
        const rows = cacheMatches
          ? cached!.visualRows
          : layoutTranscriptRow({
              row,
              rowIndex,
              rowKey: resolvedRowKey,
              width,
              baseStyle,
              hoverRegionId: localHoverRegionId,
              focusedRegionId: localFocusedRegionId,
              hoverStyle: props.hoverStyle,
              focusStyle: props.focusStyle,
              wrap: props.wrap,
            });
        if (rows !== cached?.visualRows)
          rowLayoutCache.set(rowIndex, { ...cacheKey, visualRows: rows });
        for (const visualRow of rows) {
          visualRows.push(visualRow);
          regions.push(...visualRow.hitRegions);
        }
        rowEnds.set(rowIndex, visualRows.length);
      }
      for (const rowIndex of rowLayoutCache.keys()) {
        if (rowIndex >= count) rowLayoutCache.delete(rowIndex);
      }
      if (
        !warnedLargeFlattenedRows &&
        (globalThis as any).__VT_DEBUG_PERF__ &&
        visualRows.length > 5000
      ) {
        warnedLargeFlattenedRows = true;
        console.warn(
          "[vue-tui] TTranscriptView flattens all transcript rows; use TLogView or windowed source for large retained output.",
        );
      }
      if (perfEnabled) {
        observability.framePerf.recordComponent({
          name: "TTranscriptView",
          id: instance?.uid == null ? undefined : String(instance.uid),
          phase: "layout",
          durationMs: framePerfNow() - perfStartedAt,
          itemCount: count,
          renderedCount: visualRows.length,
          cacheHit,
          cacheMiss,
          sourceReadCount,
          sourceSkippedCount,
          width,
          version: props.version,
        });
      }
      return { visualRows, rowStarts, rowEnds, regions };
    });

    const maxScrollTop = computed(() =>
      Math.max(0, layoutState.value.visualRows.length - Math.max(0, normalizeInt(props.h))),
    );

    function setScrollTop(top: number): void {
      const next = clamp(normalizeInt(top), 0, maxScrollTop.value);
      if (!isScrollControlled()) innerScrollTop.value = next;
      emit("update:scrollTop", next);
    }

    function rowForVisualRow(visualRow: TTranscriptVisualRow): TTranscriptRow {
      return props.source.getRow(visualRow.rowIndex);
    }

    function firstRowIndex(): number {
      return normalizeInt(props.source.firstRowIndex?.() ?? 0);
    }

    function regionEvent(region: TTranscriptHitRegion, event?: unknown): TTranscriptRegionEvent {
      return {
        region,
        row: props.source.getRow(region.rowIndex),
        rowIndex: region.rowIndex,
        absoluteRowIndex: firstRowIndex() + region.rowIndex,
        event,
      };
    }

    function isDisabledActionRegion(region: TTranscriptHitRegion): boolean {
      return (
        region.kind === "action" &&
        Boolean(
          (region.payload as { action?: { disabled?: boolean } } | undefined)?.action?.disabled,
        )
      );
    }

    function emitRegion(region: TTranscriptHitRegion, pointerEvent?: unknown): void {
      if (isDisabledActionRegion(region)) return;
      const event = regionEvent(region, pointerEvent);
      if (region.kind === "action") emit("actionClick", event);
      else if (region.kind === "link") emit("linkClick", event);
      else if (region.kind === "fold-toggle") emit("foldToggle", event);
      else if (region.kind === "tool-call") emit("toolClick", event);
    }

    function emitRegionFromPointerUp(region: TTranscriptHitRegion, e: TerminalPointerEvent): void {
      if (e.button != null && e.button !== 0) {
        pointerDownRegionId = null;
        pointerMoved = false;
        return;
      }
      const canActivate = pointerDownRegionId === region.id && !pointerMoved;
      pointerDownRegionId = null;
      pointerMoved = false;
      if (!canActivate) return;
      if (isDisabledActionRegion(region)) return;
      e.stopPropagation?.();
      pointerUpActivatedRegionId = region.id;
      emitRegion(region, e);
    }

    function emitRegionFromClick(region: TTranscriptHitRegion, e: TerminalPointerEvent): void {
      e.stopPropagation?.();
      if (isDisabledActionRegion(region)) return;
      if (pointerUpActivatedRegionId === region.id) {
        pointerUpActivatedRegionId = null;
        return;
      }
      pointerUpActivatedRegionId = null;
      emitRegion(region, e);
    }

    function visualIndexesForRegion(region: TTranscriptHitRegion | null): number[] {
      if (!region) return [];
      const rows = layoutState.value.visualRows;
      const indexes: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i]!.hitRegions.some((candidate) => candidate.id === region.id)) indexes.push(i);
      }
      return indexes;
    }

    function invalidateRegion(region: TTranscriptHitRegion | null): void {
      for (const index of visualIndexesForRegion(region)) rowsRef.value?.invalidateIndex(index);
    }

    function setHoveredRegion(region: TTranscriptHitRegion | null): void {
      const prev = hoveredRegion.value;
      if (prev?.id === region?.id) return;
      hoveredRegion.value = region;
      invalidateRegion(prev);
      invalidateRegion(region);
      emit("hoverRegion", region ? regionEvent(region) : null);
    }

    function setFocusedRegion(region: TTranscriptHitRegion | null): void {
      const prev = focusedRegion.value;
      if (prev?.id === region?.id) return;
      focusedRegion.value = region;
      invalidateRegion(prev);
      invalidateRegion(region);
    }

    function visibleFocusableRegions(): TTranscriptHitRegion[] {
      const rows = layoutState.value.visualRows;
      const top = clamp(currentScrollTop(), 0, rows.length);
      const bottom = Math.min(rows.length, top + Math.max(0, normalizeInt(props.h)));
      const seen = new Set<string>();
      const regions: TTranscriptHitRegion[] = [];
      for (let i = top; i < bottom; i++) {
        for (const region of rows[i]?.hitRegions ?? []) {
          if (seen.has(region.id)) continue;
          seen.add(region.id);
          regions.push(region);
        }
      }
      return regions;
    }

    function hasVisibleRegionId(id: string): boolean {
      const rows = layoutState.value.visualRows;
      const top = clamp(currentScrollTop(), 0, rows.length);
      const bottom = Math.min(rows.length, top + Math.max(0, normalizeInt(props.h)));
      for (let i = top; i < bottom; i++) {
        if (rows[i]?.hitRegions.some((region) => region.id === id)) return true;
      }
      return false;
    }

    function reconcileActiveRegions(): void {
      const hover = hoveredRegion.value;
      if (hover && !hasVisibleRegionId(hover.id)) setHoveredRegion(null);
      const focus = focusedRegion.value;
      if (focus && !hasVisibleRegionId(focus.id)) setFocusedRegion(null);
    }

    function focusRegionByOffset(offset: number): boolean {
      const regions = visibleFocusableRegions();
      if (!regions.length) return false;
      const current = focusedRegion.value
        ? regions.findIndex((region) => region.id === focusedRegion.value?.id)
        : -1;
      const next = current < 0 ? (offset > 0 ? 0 : regions.length - 1) : current + offset;
      setFocusedRegion(regions[(next + regions.length) % regions.length]!);
      return true;
    }

    function focusNextRegion(): boolean {
      return focusRegionByOffset(1);
    }

    function focusPreviousRegion(): boolean {
      return focusRegionByOffset(-1);
    }

    function activateFocusedRegion(): boolean {
      const region = focusedRegion.value;
      if (!region) return false;
      if (!visibleFocusableRegions().some((candidate) => candidate.id === region.id)) return false;
      emitRegion(region);
      return true;
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      if (!props.keyboardRegions) return;
      if (e.key === "Tab") {
        const handled = e.shiftKey ? focusPreviousRegion() : focusNextRegion();
        if (handled) e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        if (activateFocusedRegion()) e.preventDefault();
        return;
      }
      if (e.key === "Escape" && focusedRegion.value) {
        e.preventDefault();
        setFocusedRegion(null);
      }
    }

    function scrollToTop(): void {
      rowsRef.value?.scrollTo(0);
      setScrollTop(0);
    }

    function scrollToBottom(): void {
      const top = maxScrollTop.value;
      rowsRef.value?.scrollTo(top);
      setScrollTop(top);
    }

    function scrollToRow(index: number, options?: { align?: "start" | "center" | "end" }): void {
      const rowIndex = clamp(normalizeInt(index), 0, Math.max(0, props.source.rowCount() - 1));
      const visualIndex = layoutState.value.rowStarts.get(rowIndex) ?? 0;
      const rowEnd = layoutState.value.rowEnds.get(rowIndex) ?? visualIndex + 1;
      const viewportRows = Math.max(1, normalizeInt(props.h));
      const rowHeight = Math.max(1, rowEnd - visualIndex);
      let top = visualIndex;
      if (options?.align === "center")
        top = visualIndex - Math.floor((viewportRows - rowHeight) / 2);
      else if (options?.align === "end") top = rowEnd - viewportRows;
      top = clamp(top, 0, maxScrollTop.value);
      rowsRef.value?.scrollTo(top);
      setScrollTop(top);
    }

    function invalidateRow(index: number): void {
      const start = layoutState.value.rowStarts.get(index);
      const end = layoutState.value.rowEnds.get(index);
      if (start == null || end == null) return;
      rowsRef.value?.invalidateRange(start, end);
    }

    function invalidateRange(start: number, end: number): void {
      const first = clamp(normalizeInt(start), 0, props.source.rowCount());
      const last = clamp(normalizeInt(end), first, props.source.rowCount());
      const visualStart = layoutState.value.rowStarts.get(first);
      const visualEnd = layoutState.value.rowEnds.get(last - 1);
      if (visualStart == null || visualEnd == null) return;
      rowsRef.value?.invalidateRange(visualStart, visualEnd);
    }

    expose({
      scrollToBottom,
      scrollToTop,
      scrollToRow,
      invalidateRow,
      invalidateRange,
      refreshViewport: () => rowsRef.value?.refreshViewport(),
      focusNextRegion,
      focusPreviousRegion,
      activateFocusedRegion,
      getHoveredRegion: () => hoveredRegion.value,
    } satisfies TTranscriptViewHandle);

    watch(
      () => props.defaultScrollTop,
      (top) => {
        if (isScrollControlled()) return;
        innerScrollTop.value = clamp(normalizeInt(top), 0, maxScrollTop.value);
      },
    );

    watch(
      () => layoutState.value.visualRows.length,
      (next, prev) => {
        if (!props.autoStickToBottom) return;
        const viewportRows = Math.max(0, normalizeInt(props.h));
        const previousMax = Math.max(0, prev - viewportRows);
        if (currentScrollTop() < previousMax) return;
        const nextTop = Math.max(0, next - viewportRows);
        rowsRef.value?.scrollTo(nextTop);
        setScrollTop(nextTop);
      },
    );

    watch(
      () => props.version,
      () => rowsRef.value?.refreshViewport(),
      { flush: "post" },
    );

    watch(
      () => [layoutState.value.regions, currentScrollTop(), props.h],
      () => reconcileActiveRegions(),
    );

    function paintVisualRow(paintCtx: TVirtualRowsPaintContext): void {
      const visualRow = paintCtx.item as TTranscriptVisualRow | undefined;
      if (!visualRow) return;

      let x = 0;
      for (const segment of visualRow.segments) {
        const start = x;
        const end = start + segment.cells;
        const drawStart = Math.max(paintCtx.clipX, start);
        const drawEnd = Math.min(paintCtx.clipX + paintCtx.w, end);
        if (drawEnd > drawStart) {
          paintCtx.terminal.write(
            sliceByCellsRange(segment.text, drawStart - start, drawEnd - start),
            {
              x: paintCtx.x + (drawStart - paintCtx.clipX),
              y: paintCtx.y,
              style: segment.style,
            },
          );
        }
        x = end;
      }
    }

    function renderVisualRowNodes(ctx: TVirtualRowsRenderNodesContext): any[] {
      const visualRow = ctx.item as TTranscriptVisualRow | undefined;
      if (!visualRow) return [];
      const nodes: any[] = [];
      for (const region of visualRow.hitRegions) {
        nodes.push(
          h(TView, {
            key: `${region.id}:${ctx.index}:${region.x0}`,
            x: region.x0,
            y: ctx.row,
            w: Math.max(1, region.x1 - region.x0),
            h: 1,
            zIndex: 2,
            focusable: false,
            onPointerenter: () => setHoveredRegion(region),
            onPointermove: (e: TerminalPointerEvent) => {
              if (
                pointerDownRegionId &&
                (e.cellX !== pointerDownCellX || e.cellY !== pointerDownCellY)
              ) {
                pointerMoved = true;
              }
              setHoveredRegion(region);
            },
            onPointerleave: () => {
              pointerDownRegionId = null;
              pointerMoved = false;
              if (hoveredRegion.value?.id === region.id) setHoveredRegion(null);
            },
            onPointerdown: (e: TerminalPointerEvent) => {
              pointerUpActivatedRegionId = null;
              pointerDownRegionId = null;
              pointerMoved = false;
              if (e.button == null || e.button === 0) {
                pointerDownRegionId = region.id;
                pointerDownCellX = e.cellX;
                pointerDownCellY = e.cellY;
              }
            },
            onPointerup: (e: TerminalPointerEvent) => emitRegionFromPointerUp(region, e),
            onClick: (e: TerminalPointerEvent) => emitRegionFromClick(region, e),
          }),
        );
      }
      return nodes;
    }

    function textForSelectionSegments(
      segments: readonly TTranscriptSelectionSegment[],
      x0: number,
      x1: number,
    ): string {
      let text = "";
      for (const segment of segments) {
        const start = Math.max(x0, segment.x0);
        const end = Math.min(x1, segment.x1);
        if (end <= start || !segment.selectable) continue;
        text += sliceByCellsRange(segment.text, start - segment.x0, end - segment.x0);
      }
      return text;
    }

    function getVisualRow(index: number): TTranscriptVisualRow | undefined {
      return layoutState.value.visualRows[index];
    }

    function selectionTextForVisualRow(visualRow: TTranscriptVisualRow | undefined): string {
      if (!visualRow) return "";
      const row = rowForVisualRow(visualRow);
      return visualRow.selectableText ?? plainTextForTranscriptRow(row);
    }

    function selectionTextForItem(item: unknown): string {
      return selectionTextForVisualRow(item as TTranscriptVisualRow | undefined);
    }

    function selectionTextForVisualRowSpan(ctx: TVirtualRowsSelectionSpanTextContext): string {
      const visualRow = ctx.item as TTranscriptVisualRow | undefined;
      if (!visualRow) return "";
      if (visualRow.selectionSegments.length)
        return textForSelectionSegments(visualRow.selectionSegments, ctx.x0, ctx.x1);
      return sliceByCellsRange(selectionTextForVisualRow(visualRow), ctx.x0, ctx.x1);
    }

    return () =>
      h(TVirtualRows, {
        ref: rowsRef,
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        itemCount: layoutState.value.visualRows.length,
        itemVersion: props.version,
        getItem: getVisualRow,
        paintItem: paintVisualRow,
        renderItemNodes: renderVisualRowNodes,
        selectionText: selectionTextForItem,
        selectionSpanText: selectionTextForVisualRowSpan,
        scrollTop: currentScrollTop(),
        style: props.style,
        autoFocus: props.autoFocus,
        focusable: props.focusable,
        selectable: props.selectable,
        wheelScroll: props.wheelScroll,
        rowScrollMode: props.rowScrollMode,
        onKeydown,
        onScroll: (payload: any) => emit("scroll", payload),
        onScrollEdge: (payload: any) => emit("scrollEdge", payload),
        onItemClick: (event: { item: unknown; event?: unknown }) => {
          const visualRow = event.item as TTranscriptVisualRow | undefined;
          if (!visualRow) return;
          const rowEvent: TTranscriptRowEvent = {
            row: rowForVisualRow(visualRow),
            rowIndex: visualRow.rowIndex,
            absoluteRowIndex: firstRowIndex() + visualRow.rowIndex,
            event: event.event,
          };
          emit("rowClick", rowEvent);
        },
        "onUpdate:scrollTop": setScrollTop,
      });
  },
});
