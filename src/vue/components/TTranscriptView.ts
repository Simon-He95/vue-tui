import type { PropType } from "vue";
import type { TVirtualRowsHandle, TVirtualRowsPaintContext } from "./TVirtualRows.js";
import type { Style } from "../../core/types.js";
import type {
  TTranscriptDataSource,
  TTranscriptHitRegion,
  TTranscriptRegionEvent,
  TTranscriptRow,
  TTranscriptRowEvent,
  TTranscriptViewHandle,
  TTranscriptVisualRow,
} from "../transcript/types.js";
import { computed, defineComponent, getCurrentInstance, h, ref, watch } from "vue";
import { layoutTranscriptRow } from "../transcript/layout.js";
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
    overscan: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
    hoverStyle: { type: Object as PropType<Style>, default: undefined },
    focusStyle: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    focusable: { type: Boolean, default: true },
    wheelScroll: { type: Boolean, default: true },
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
    "selectionHover",
    "search",
    "searchMatch",
  ],
  setup(props, { emit, expose }) {
    const { defaultStyle } = useTerminal();
    const instance = getCurrentInstance();
    const rowsRef = ref<TVirtualRowsHandle | null>(null);
    const innerScrollTop = ref(normalizeInt(props.defaultScrollTop));
    const hoveredRegion = ref<TTranscriptHitRegion | null>(null);
    const focusedRegion = ref<TTranscriptHitRegion | null>(null);
    const interactionVersion = ref(0);

    function isScrollControlled(): boolean {
      return Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, "scrollTop");
    }

    function currentScrollTop(): number {
      return normalizeInt(isScrollControlled() ? props.scrollTop : innerScrollTop.value);
    }

    const layoutState = computed<LayoutState>(() => {
      void props.version;
      void interactionVersion.value;
      const width = Math.max(1, Math.floor(props.w));
      const count = Math.max(0, normalizeInt(props.source.rowCount()));
      if (!count) return EMPTY_LAYOUT;

      const visualRows: TTranscriptVisualRow[] = [];
      const rowStarts = new Map<number, number>();
      const rowEnds = new Map<number, number>();
      const regions: TTranscriptHitRegion[] = [];
      const baseStyle = props.style ?? defaultStyle.value;
      for (let rowIndex = 0; rowIndex < count; rowIndex++) {
        const row = props.source.getRow(rowIndex);
        const rowKey = props.source.getRowKey?.(rowIndex) ?? row.key;
        rowStarts.set(rowIndex, visualRows.length);
        const rows = layoutTranscriptRow({
          row,
          rowIndex,
          rowKey,
          width,
          baseStyle,
          hoverRegionId: hoveredRegion.value?.id ?? null,
          focusedRegionId: focusedRegion.value?.id ?? null,
          hoverStyle: props.hoverStyle,
          focusStyle: props.focusStyle,
          wrap: props.wrap,
        });
        for (const visualRow of rows) {
          visualRows.push(visualRow);
          regions.push(...visualRow.hitRegions);
        }
        rowEnds.set(rowIndex, visualRows.length);
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

    function regionEvent(region: TTranscriptHitRegion, event?: unknown): TTranscriptRegionEvent {
      return {
        region,
        row: props.source.getRow(region.rowIndex),
        rowIndex: region.rowIndex,
        event,
      };
    }

    function emitRegion(region: TTranscriptHitRegion, pointerEvent?: unknown): void {
      const event = regionEvent(region, pointerEvent);
      if (region.kind === "action") emit("actionClick", event);
      else if (region.kind === "link") emit("linkClick", event);
      else if (region.kind === "fold-toggle") emit("foldToggle", event);
      else if (region.kind === "tool-call") emit("toolClick", event);
    }

    function visualIndexForRegion(region: TTranscriptHitRegion | null): number {
      if (!region) return -1;
      const rows = layoutState.value.visualRows;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i]!.hitRegions.some((candidate) => candidate.id === region.id)) return i;
      }
      return -1;
    }

    function invalidateRegion(region: TTranscriptHitRegion | null): void {
      const index = visualIndexForRegion(region);
      if (index >= 0) rowsRef.value?.invalidateIndex(index);
    }

    function setHoveredRegion(region: TTranscriptHitRegion | null): void {
      const prev = hoveredRegion.value;
      if (prev?.id === region?.id) return;
      hoveredRegion.value = region;
      interactionVersion.value++;
      invalidateRegion(prev);
      invalidateRegion(region);
      emit("hoverRegion", region ? regionEvent(region) : null);
    }

    function setFocusedRegion(region: TTranscriptHitRegion | null): void {
      const prev = focusedRegion.value;
      if (prev?.id === region?.id) return;
      focusedRegion.value = region;
      interactionVersion.value++;
      invalidateRegion(prev);
      invalidateRegion(region);
    }

    function focusRegionByOffset(offset: number): boolean {
      const regions = layoutState.value.regions.filter((region) => region.kind !== "custom");
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
      emitRegion(region);
      return true;
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

    function paintVisualRow(paintCtx: TVirtualRowsPaintContext): void {
      const visualRow = paintCtx.item as TTranscriptVisualRow | undefined;
      if (!visualRow) return;

      let x = 0;
      for (const segment of visualRow.segments) {
        const start = x;
        const end = start + segment.cells;
        const drawStart = Math.max(0, start);
        const drawEnd = Math.min(paintCtx.w, end);
        if (drawEnd > drawStart) {
          paintCtx.terminal.write(
            sliceByCellsRange(segment.text, drawStart - start, drawEnd - start),
            {
              x: paintCtx.x + drawStart,
              y: paintCtx.y,
              style: segment.style,
            },
          );
        }
        x = end;
      }
    }

    function renderVisualRowNodes(ctx: { item: unknown; index: number; row: number }): any[] {
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

    return () =>
      h(TVirtualRows, {
        ref: rowsRef,
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        itemCount: layoutState.value.visualRows.length,
        itemVersion: props.version + interactionVersion.value,
        getItem: (index: number) => layoutState.value.visualRows[index],
        paintItem: paintVisualRow,
        renderItemNodes: renderVisualRowNodes,
        selectionText: (item: unknown) => {
          const visualRow = item as TTranscriptVisualRow | undefined;
          if (!visualRow) return "";
          const row = rowForVisualRow(visualRow);
          return visualRow.selectableText ?? plainTextForTranscriptRow(row);
        },
        scrollTop: currentScrollTop(),
        style: props.style,
        autoFocus: props.autoFocus,
        focusable: props.focusable,
        selectable: props.selectable,
        wheelScroll: props.wheelScroll,
        rowScrollMode: props.rowScrollMode,
        onScroll: (payload: any) => emit("scroll", payload),
        onItemClick: (event: { item: unknown; event?: unknown }) => {
          const visualRow = event.item as TTranscriptVisualRow | undefined;
          if (!visualRow) return;
          const rowEvent: TTranscriptRowEvent = {
            row: rowForVisualRow(visualRow),
            rowIndex: visualRow.rowIndex,
            event: event.event,
          };
          emit("rowClick", rowEvent);
        },
        "onUpdate:scrollTop": setScrollTop,
      });
  },
});
