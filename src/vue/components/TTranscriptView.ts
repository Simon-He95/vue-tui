import type { PropType } from "vue";
import type {
  TVirtualRowsHandle,
  TVirtualRowsPaintContext,
  TVirtualRowsRenderNodesContext,
  TVirtualRowsSelectionSpanTextContext,
} from "./TVirtualRows.js";
import type { Style } from "../../core/types.js";
import type { TerminalKeyboardEvent } from "../../events/manager/types.js";
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
  fixedRows: boolean;
  rowCount: number;
}>;

type WrappedLayoutDeps = Readonly<{
  width: number;
  baseStyle: Style;
  hoverStyle?: Style;
  focusStyle?: Style;
  hoverRegionId: string | null;
  focusedRegionId: string | null;
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
  fixedRows: false,
  rowCount: 0,
});
const MAX_KEYED_ROW_LAYOUT_CACHE_ENTRIES = 2048;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function normalizedChangedRange(
  range: { start: number; end: number } | null | undefined,
  count: number,
): { start: number; end: number } | null {
  if (!range) return null;
  const start = clamp(normalizeInt(range.start), 0, count);
  const end = clamp(normalizeInt(range.end), start, count);
  return { start, end };
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

function cachedLayoutHasRegionId(
  entry: RowLayoutCacheEntry | undefined,
  id: string | null,
): boolean {
  if (!entry || !id) return false;
  for (const visualRow of entry.visualRows) {
    if (visualRow.hitRegions.some((region) => region.id === id)) return true;
  }
  return false;
}

function rowLayoutIdentityKey(rowKey: string | number, rowVersion: string | number): string {
  return JSON.stringify([rowKey, rowVersion]);
}

function reindexVisualRows(
  rows: readonly TTranscriptVisualRow[],
  rowIndex: number,
): readonly TTranscriptVisualRow[] {
  return rows.map((visualRow) => ({
    ...visualRow,
    rowIndex,
    hitRegions: visualRow.hitRegions.map((region) => ({ ...region, rowIndex })),
  }));
}

function sameCachedLayout(
  entry: RowLayoutCacheEntry | undefined,
  next: Omit<RowLayoutCacheEntry, "visualRows">,
  matchRowIndex = true,
): boolean {
  return (
    Boolean(entry) &&
    (next.usesSourceRowVersion || entry!.version === next.version) &&
    entry!.rowVersion === next.rowVersion &&
    entry!.usesSourceRowVersion === next.usesSourceRowVersion &&
    (next.usesSourceRowVersion || entry!.row === next.row) &&
    (!matchRowIndex || entry!.rowIndex === next.rowIndex) &&
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
    source: {
      type: Object as PropType<TTranscriptDataSource>,
      required: true,
    },
    version: { type: Number, required: true },
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
    const keyedRowLayoutCache = new Map<string, RowLayoutCacheEntry>();
    let previousWrappedLayout: LayoutState | null = null;
    let previousWrappedDeps: WrappedLayoutDeps | null = null;
    let canUseWrappedChangedRangeRepaint = false;
    let warnedLargeFlattenedRows = false;

    function isScrollControlled(): boolean {
      return Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, "scrollTop");
    }

    function currentScrollTop(): number {
      return normalizeInt(isScrollControlled() ? props.scrollTop : innerScrollTop.value);
    }

    function currentScrollTopForRowCount(count: number): number {
      const viewportRows = Math.max(0, normalizeInt(props.h));
      const maxTop = Math.max(0, count - viewportRows);
      return clamp(currentScrollTop(), 0, maxTop);
    }

    function rememberKeyedRowLayout(entry: RowLayoutCacheEntry): void {
      if (!entry.usesSourceRowVersion) return;
      keyedRowLayoutCache.set(rowLayoutIdentityKey(entry.rowKey, entry.rowVersion), entry);
      if (keyedRowLayoutCache.size <= MAX_KEYED_ROW_LAYOUT_CACHE_ENTRIES) return;
      const first = keyedRowLayoutCache.keys().next().value;
      if (first != null) keyedRowLayoutCache.delete(first);
    }

    function layoutSourceRow(
      rowIndex: number,
      options: Readonly<{
        width: number;
        baseStyle: Style;
        hoverRegionId: string | null;
        focusedRegionId: string | null;
      }>,
    ): { rows: readonly TTranscriptVisualRow[]; cacheHit: boolean } {
      const sourceRowVersion = props.source.getRowVersion?.(rowIndex);
      let cached = rowLayoutCache.get(rowIndex);
      const usesSourceRowVersion = sourceRowVersion != null;
      let row = cached?.row;
      let rowKey = cached?.rowKey;
      let canUseCachedRow = false;

      if (
        usesSourceRowVersion &&
        cached?.usesSourceRowVersion &&
        cached.rowVersion === sourceRowVersion
      ) {
        if (props.source.getRowKey) {
          rowKey = props.source.getRowKey(rowIndex);
          canUseCachedRow = rowKey === cached.rowKey;
        } else {
          rowKey = cached.rowKey;
          canUseCachedRow = true;
        }
      }

      if (!canUseCachedRow && usesSourceRowVersion && props.source.getRowKey) {
        rowKey = props.source.getRowKey(rowIndex);
        cached = keyedRowLayoutCache.get(rowLayoutIdentityKey(rowKey, sourceRowVersion));
        if (cached) {
          row = cached.row;
          canUseCachedRow = true;
        }
      }

      if (!canUseCachedRow || row == null || rowKey == null) {
        row = props.source.getRow(rowIndex);
        rowKey = props.source.getRowKey?.(rowIndex) ?? row.key;
        canUseCachedRow = false;
      }

      const nextHoverRegionId = canUseCachedRow
        ? cachedLayoutHasRegionId(cached, options.hoverRegionId)
          ? options.hoverRegionId
          : null
        : rowHasRegionId(row, rowKey, options.hoverRegionId)
          ? options.hoverRegionId
          : null;
      const nextFocusedRegionId = canUseCachedRow
        ? cachedLayoutHasRegionId(cached, options.focusedRegionId)
          ? options.focusedRegionId
          : null
        : rowHasRegionId(row, rowKey, options.focusedRegionId)
          ? options.focusedRegionId
          : null;
      const cacheKey = {
        version: props.version,
        rowVersion: sourceRowVersion ?? props.version,
        usesSourceRowVersion,
        row,
        rowIndex,
        rowKey,
        width: options.width,
        wrap: props.wrap,
        baseStyle: options.baseStyle,
        hoverStyle: props.hoverStyle,
        focusStyle: props.focusStyle,
        hoverRegionId: nextHoverRegionId,
        focusedRegionId: nextFocusedRegionId,
      };
      const cacheMatches = sameCachedLayout(cached, cacheKey);
      const reindexableCacheMatches =
        !cacheMatches && canUseCachedRow && sameCachedLayout(cached, cacheKey, false);
      const rows = cacheMatches
        ? cached!.visualRows
        : reindexableCacheMatches
          ? reindexVisualRows(cached!.visualRows, rowIndex)
          : layoutTranscriptRow({
              row,
              rowIndex,
              rowKey,
              width: options.width,
              baseStyle: options.baseStyle,
              hoverRegionId: nextHoverRegionId,
              focusedRegionId: nextFocusedRegionId,
              hoverStyle: props.hoverStyle,
              focusStyle: props.focusStyle,
              wrap: props.wrap,
            });
      if (rows !== cached?.visualRows) {
        const entry = { ...cacheKey, visualRows: rows };
        rowLayoutCache.set(rowIndex, entry);
        rememberKeyedRowLayout(entry);
      }
      return { rows, cacheHit: cacheMatches || reindexableCacheMatches };
    }

    function pruneRowLayoutCache(count: number): void {
      for (const rowIndex of rowLayoutCache.keys()) {
        if (rowIndex >= count) rowLayoutCache.delete(rowIndex);
      }
    }

    function sameWrappedDeps(a: WrappedLayoutDeps | null, b: WrappedLayoutDeps): boolean {
      return (
        Boolean(a) &&
        a!.width === b.width &&
        a!.baseStyle === b.baseStyle &&
        a!.hoverStyle === b.hoverStyle &&
        a!.focusStyle === b.focusStyle &&
        a!.hoverRegionId === b.hoverRegionId &&
        a!.focusedRegionId === b.focusedRegionId
      );
    }

    function visibleRegionsForVisualRows(
      visualRows: readonly TTranscriptVisualRow[],
    ): readonly TTranscriptHitRegion[] {
      const top = clamp(currentScrollTop(), 0, visualRows.length);
      const bottom = Math.min(visualRows.length, top + Math.max(0, normalizeInt(props.h)));
      const regions: TTranscriptHitRegion[] = [];
      for (let index = top; index < bottom; index++) {
        regions.push(...(visualRows[index]?.hitRegions ?? []));
      }
      return regions;
    }

    function tryUpdateWrappedLayoutFromChangedRange(
      count: number,
      changedRange: { start: number; end: number } | null,
      deps: WrappedLayoutDeps,
    ): { state: LayoutState; cacheHit: number; cacheMiss: number } | null {
      const previous = previousWrappedLayout;
      if (!previous || previous.fixedRows || previous.rowCount !== count) return null;
      if (!changedRange || !sameWrappedDeps(previousWrappedDeps, deps)) return null;

      const changedCount = changedRange.end - changedRange.start;
      if (changedCount <= 0) {
        canUseWrappedChangedRangeRepaint = true;
        return {
          state: { ...previous, regions: visibleRegionsForVisualRows(previous.visualRows) },
          cacheHit: count,
          cacheMiss: 0,
        };
      }

      const oldVisualStart = previous.rowStarts.get(changedRange.start);
      const oldVisualEnd = previous.rowEnds.get(changedRange.end - 1);
      if (oldVisualStart == null || oldVisualEnd == null) return null;

      const nextRows: TTranscriptVisualRow[] = [];
      const changedRowHeights: number[] = [];
      let cacheHit = count - changedCount;
      let cacheMiss = 0;
      for (let rowIndex = changedRange.start; rowIndex < changedRange.end; rowIndex++) {
        const result = layoutSourceRow(rowIndex, {
          width: deps.width,
          baseStyle: deps.baseStyle,
          hoverRegionId: deps.hoverRegionId,
          focusedRegionId: deps.focusedRegionId,
        });
        if (result.cacheHit) cacheHit++;
        else cacheMiss++;
        changedRowHeights.push(result.rows.length);
        nextRows.push(...result.rows);
      }

      if (nextRows.length !== oldVisualEnd - oldVisualStart) return null;
      canUseWrappedChangedRangeRepaint = true;

      // Patch the previous wrapped layout in place; cloning the full layout would undo this path's cost saving.
      const visualRows = previous.visualRows as TTranscriptVisualRow[];
      for (let index = 0; index < nextRows.length; index++) {
        visualRows[oldVisualStart + index] = nextRows[index]!;
      }

      const rowStarts = previous.rowStarts as Map<number, number>;
      const rowEnds = previous.rowEnds as Map<number, number>;
      let visualCursor = oldVisualStart;
      for (
        let rowIndex = changedRange.start, offset = 0;
        rowIndex < changedRange.end;
        rowIndex++, offset++
      ) {
        rowStarts.set(rowIndex, visualCursor);
        visualCursor += changedRowHeights[offset] ?? 0;
        rowEnds.set(rowIndex, visualCursor);
      }

      const state = {
        visualRows,
        rowStarts,
        rowEnds,
        regions: visibleRegionsForVisualRows(visualRows),
        fixedRows: false,
        rowCount: count,
      };
      previousWrappedLayout = state;
      return { state, cacheHit, cacheMiss };
    }

    const layoutState = computed<LayoutState>(() => {
      void props.version;
      canUseWrappedChangedRangeRepaint = false;
      const perfEnabled = observability.framePerf.enabled.value;
      const perfStartedAt = perfEnabled ? framePerfNow() : 0;
      const width = Math.max(1, Math.floor(props.w));
      const count = Math.max(0, normalizeInt(props.source.rowCount()));
      if (!count) {
        rowLayoutCache.clear();
        keyedRowLayoutCache.clear();
        previousWrappedLayout = null;
        previousWrappedDeps = null;
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
            width,
            version: props.version,
          });
        }
        return EMPTY_LAYOUT;
      }

      const fixedRows = props.wrap === false;
      const visualRows: TTranscriptVisualRow[] = [];
      if (fixedRows) visualRows.length = count;
      const rowStarts = new Map<number, number>();
      const rowEnds = new Map<number, number>();
      const regions: TTranscriptHitRegion[] = [];
      const baseStyle = props.style ?? defaultStyle.value;
      const hoverRegionId = hoveredRegion.value?.id ?? null;
      const focusedRegionId = focusedRegion.value?.id ?? null;
      let cacheHit = 0;
      let cacheMiss = 0;
      const sourceChangedRange = normalizedChangedRange(props.source.getChangedRange?.(), count);
      const wrappedDeps = {
        width,
        baseStyle,
        hoverStyle: props.hoverStyle,
        focusStyle: props.focusStyle,
        hoverRegionId,
        focusedRegionId,
      };

      if (fixedRows) {
        previousWrappedLayout = null;
        previousWrappedDeps = null;
        const top = currentScrollTopForRowCount(count);
        const bottom = Math.min(count, top + Math.max(0, normalizeInt(props.h)));
        for (let rowIndex = top; rowIndex < bottom; rowIndex++) {
          rowStarts.set(rowIndex, rowIndex);
          rowEnds.set(rowIndex, rowIndex + 1);
          const result = layoutSourceRow(rowIndex, {
            width,
            baseStyle,
            hoverRegionId,
            focusedRegionId,
          });
          if (result.cacheHit) cacheHit++;
          else cacheMiss++;
          const row = result.rows[0]!;
          visualRows[rowIndex] = row;
          regions.push(...row.hitRegions);
        }
      } else {
        const incremental = tryUpdateWrappedLayoutFromChangedRange(
          count,
          sourceChangedRange,
          wrappedDeps,
        );
        if (incremental) {
          if (perfEnabled) {
            observability.framePerf.recordComponent({
              name: "TTranscriptView",
              id: instance?.uid == null ? undefined : String(instance.uid),
              phase: "layout",
              durationMs: framePerfNow() - perfStartedAt,
              itemCount: count,
              renderedCount: incremental.state.visualRows.length,
              cacheHit: incremental.cacheHit,
              cacheMiss: incremental.cacheMiss,
              width,
              version: props.version,
            });
          }
          return incremental.state;
        }

        for (let rowIndex = 0; rowIndex < count; rowIndex++) {
          rowStarts.set(rowIndex, visualRows.length);
          const result = layoutSourceRow(rowIndex, {
            width,
            baseStyle,
            hoverRegionId,
            focusedRegionId,
          });
          if (result.cacheHit) cacheHit++;
          else cacheMiss++;
          for (const visualRow of result.rows) {
            visualRows.push(visualRow);
            regions.push(...visualRow.hitRegions);
          }
          rowEnds.set(rowIndex, visualRows.length);
        }
      }
      pruneRowLayoutCache(count);
      if (
        !warnedLargeFlattenedRows &&
        !fixedRows &&
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
          renderedCount: fixedRows ? cacheHit + cacheMiss : visualRows.length,
          cacheHit,
          cacheMiss,
          width,
          version: props.version,
        });
      }
      const state = { visualRows, rowStarts, rowEnds, regions, fixedRows, rowCount: count };
      if (fixedRows) {
        previousWrappedLayout = null;
        previousWrappedDeps = null;
      } else {
        previousWrappedLayout = state;
        previousWrappedDeps = wrappedDeps;
      }
      return state;
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

    function visualIndexesForRegion(region: TTranscriptHitRegion | null): number[] {
      if (!region) return [];
      const rows = layoutState.value.visualRows;
      const indexes: number[] = [];
      const top = layoutState.value.fixedRows ? clamp(currentScrollTop(), 0, rows.length) : 0;
      const bottom = layoutState.value.fixedRows
        ? Math.min(rows.length, top + Math.max(0, normalizeInt(props.h)))
        : rows.length;
      for (let i = top; i < bottom; i++) {
        const row = getVisualRow(i);
        if (row?.hitRegions.some((candidate) => candidate.id === region.id)) indexes.push(i);
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
        for (const region of getVisualRow(i)?.hitRegions ?? []) {
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
        if (getVisualRow(i)?.hitRegions.some((region) => region.id === id)) return true;
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
      const visualIndex = layoutState.value.fixedRows
        ? rowIndex
        : (layoutState.value.rowStarts.get(rowIndex) ?? 0);
      const rowEnd = layoutState.value.fixedRows
        ? rowIndex + 1
        : (layoutState.value.rowEnds.get(rowIndex) ?? visualIndex + 1);
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
      const start = layoutState.value.fixedRows ? index : layoutState.value.rowStarts.get(index);
      const end = layoutState.value.fixedRows ? index + 1 : layoutState.value.rowEnds.get(index);
      if (start == null || end == null) return;
      rowsRef.value?.invalidateRange(start, end);
    }

    function invalidateRange(start: number, end: number): void {
      const first = clamp(normalizeInt(start), 0, props.source.rowCount());
      const last = clamp(normalizeInt(end), first, props.source.rowCount());
      const visualStart = layoutState.value.fixedRows
        ? first
        : layoutState.value.rowStarts.get(first);
      const visualEnd = layoutState.value.fixedRows
        ? last
        : layoutState.value.rowEnds.get(last - 1);
      if (visualStart == null || visualEnd == null) return;
      rowsRef.value?.invalidateRange(visualStart, visualEnd);
    }

    function virtualRowsChangedRange(): { start: number; end: number } | null {
      const state = layoutState.value;
      const changedRange = normalizedChangedRange(props.source.getChangedRange?.(), state.rowCount);
      if (!changedRange) return null;
      if (state.fixedRows || changedRange.end <= changedRange.start) return changedRange;
      if (!canUseWrappedChangedRangeRepaint) return null;

      const visualStart = state.rowStarts.get(changedRange.start);
      const visualEnd = state.rowEnds.get(changedRange.end - 1);
      if (visualStart == null || visualEnd == null) return null;
      return { start: visualStart, end: visualEnd };
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
            onPointermove: () => setHoveredRegion(region),
            onPointerleave: () => {
              if (hoveredRegion.value?.id === region.id) setHoveredRegion(null);
            },
            onClick: (e: any) => {
              e.stopPropagation?.();
              emitRegion(region, e);
            },
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
      const state = layoutState.value;
      const cached = state.visualRows[index];
      if (cached || !state.fixedRows) return cached;
      if (index < 0 || index >= state.visualRows.length) return undefined;
      const result = layoutSourceRow(index, {
        width: Math.max(1, Math.floor(props.w)),
        baseStyle: props.style ?? defaultStyle.value,
        hoverRegionId: hoveredRegion.value?.id ?? null,
        focusedRegionId: focusedRegion.value?.id ?? null,
      });
      const row = result.rows[0];
      if (row) (state.visualRows as TTranscriptVisualRow[])[index] = row;
      return row;
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
        itemChangedRange: virtualRowsChangedRange,
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
