import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, ref, watch } from "vue";
import { sliceByCells, textCellWidth } from "../utils/text.js";
import { TTable, type TTableColumn, type TTableRow } from "./TTable.js";
import { TView } from "./TView.js";

export type TDataTableSortDirection = "asc" | "desc";

export type TDataTableSortChangePayload = Readonly<{
  sortBy: string;
  sortDirection: TDataTableSortDirection;
}>;

export type TDataTableRowSelectPayload = Readonly<{
  row: TTableRow;
  /** Visible row index within the current viewport. */
  index: number;
  /** Absolute row index in the filtered/sorted result set. */
  dataIndex: number;
  /** Original index in the input rows array. */
  originalIndex: number;
  key: unknown;
}>;

export type TDataTableSorter = (a: TTableRow, b: TTableRow, column: TTableColumn) => number;

export type TDataTableFilterPredicate = (
  row: TTableRow,
  query: string,
  columns: readonly TTableColumn[],
  originalIndex: number,
) => boolean;

export type TDataTableSelectionMode = "none" | "single" | "multiple";

type DataRow = Readonly<{
  row: TTableRow;
  originalIndex: number;
}>;

const NO_ACTIVE_ROW = Symbol("TDataTable.noActiveRow");

function rowKey(
  row: TTableRow,
  index: number,
  key?: string | ((row: TTableRow, index: number) => unknown),
): unknown {
  if (typeof key === "function") return key(row, index);
  if (typeof key === "string") return row[key];
  return index;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function displayValue(column: TTableColumn, row: TTableRow, index: number): string {
  const raw = row[column.key];
  return column.format ? column.format(raw, row, index) : String(raw ?? "");
}

function sortLabel(column: TTableColumn, marker: string): string {
  const label = column.label ?? column.key;
  const width = column.width == null ? undefined : Math.max(1, Math.floor(column.width));
  if (width == null || textCellWidth(`${label} ${marker}`) <= width) return `${label} ${marker}`;
  return `${sliceByCells(label, Math.max(0, width - 1))}${marker}`;
}

export const TDataTable = defineComponent({
  name: "TDataTable",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    columns: {
      type: Array as PropType<readonly TTableColumn[]>,
      required: true,
    },
    /**
     * TDataTable can accept a controlled viewport offset through scrollTop. It is
     * still non-virtual: rows are sorted/filtered in memory and only the visible
     * slice is passed to TTable.
     */
    rows: {
      type: Array as PropType<readonly TTableRow[]>,
      required: true,
    },
    rowKey: {
      type: [String, Function] as PropType<string | ((row: TTableRow, index: number) => unknown)>,
      default: undefined,
    },
    selectedRowKey: { type: null as any, default: undefined },
    selectedRowKeys: {
      type: Array as PropType<readonly unknown[]>,
      default: undefined,
    },
    scrollTop: { type: Number, default: undefined },
    /** Sorts by the raw row value at this key; column format only affects display and filtering. */
    sortBy: { type: String, default: "" },
    sortDirection: {
      type: String as PropType<TDataTableSortDirection>,
      default: "asc",
    },
    sortable: { type: Boolean, default: false },
    manualSort: { type: Boolean, default: false },
    sorter: {
      type: Function as PropType<TDataTableSorter>,
      default: undefined,
    },
    filter: { type: String, default: "" },
    filterable: { type: Boolean, default: false },
    manualFilter: { type: Boolean, default: false },
    filterPredicate: {
      type: Function as PropType<TDataTableFilterPredicate>,
      default: undefined,
    },
    selectable: { type: Boolean, default: false },
    selectionMode: {
      type: String as PropType<TDataTableSelectionMode>,
      default: "single",
    },
    border: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: undefined },
    borderStyle: { type: Object as PropType<Style>, default: undefined },
    selectedStyle: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    emptyText: { type: String, default: "No rows" },
  },
  emits: {
    "update:selectedRowKey": (_key: unknown) => true,
    "update:selectedRowKeys": (_keys: unknown[]) => true,
    "update:scrollTop": (_scrollTop: number) => true,
    "update:sortBy": (_key: string) => true,
    "update:sortDirection": (_direction: TDataTableSortDirection) => true,
    sortChange: (_payload: TDataTableSortChangePayload) => true,
    rowSelect: (_payload: TDataTableRowSelectPayload) => true,
  },
  setup(props, { emit }) {
    const innerScrollTop = ref(0);

    const hasLocalFilter = computed(
      () => !props.manualFilter && props.filterable && Boolean(props.filter.trim()),
    );
    const hasLocalSort = computed(
      () => !props.manualSort && props.sortable && Boolean(props.sortBy),
    );
    const indexedRows = computed<readonly DataRow[] | null>(() => {
      if (!hasLocalFilter.value && !hasLocalSort.value) return null;
      return props.rows.map((row, originalIndex) => ({ row, originalIndex }));
    });
    const filteredRows = computed<readonly DataRow[] | null>(() => {
      const rows = indexedRows.value;
      if (!rows) return null;
      if (!hasLocalFilter.value) return rows;
      const query = props.filter.trim().toLowerCase();
      if (props.filterPredicate) {
        return rows.filter(({ row, originalIndex }) =>
          props.filterPredicate!(row, query, props.columns, originalIndex),
        );
      }
      return rows.filter(({ row, originalIndex }) =>
        props.columns.some((column) =>
          displayValue(column, row, originalIndex).toLowerCase().includes(query),
        ),
      );
    });

    const sortedRows = computed<readonly DataRow[] | null>(() => {
      const rows = filteredRows.value;
      if (!rows) return null;
      if (!hasLocalSort.value) return rows;
      const sorted = [...rows];
      const column = props.columns.find((candidate) => candidate.key === props.sortBy);
      sorted.sort((a, b) => {
        const result =
          props.sorter && column
            ? props.sorter(a.row, b.row, column)
            : compareValues(a.row[props.sortBy], b.row[props.sortBy]);
        return props.sortDirection === "desc" ? -result : result;
      });
      return sorted;
    });
    function nonNegativeInteger(value: unknown): number {
      const n = Math.floor(Number(value));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    const visibleRowCapacity = computed(() => Math.max(0, nonNegativeInteger(props.h) - 2));

    function processedRowCount(): number {
      return sortedRows.value?.length ?? props.rows.length;
    }

    function maxScrollTop(): number {
      return Math.max(0, processedRowCount() - visibleRowCapacity.value);
    }

    function clampScrollTop(value: unknown): number {
      return Math.min(maxScrollTop(), nonNegativeInteger(value));
    }

    const requestedScrollTop = computed(() =>
      nonNegativeInteger(props.scrollTop ?? innerScrollTop.value),
    );
    const normalizedScrollTop = computed(() => clampScrollTop(requestedScrollTop.value));

    function setScrollTop(next: number): number {
      const clamped = clampScrollTop(next);
      if (props.scrollTop == null) innerScrollTop.value = clamped;
      emit("update:scrollTop", clamped);
      return clamped;
    }

    watch(
      () => [normalizedScrollTop.value, requestedScrollTop.value] as const,
      ([next, requested]) => {
        if (next !== requested) setScrollTop(next);
      },
      { immediate: true },
    );
    function dataEntryAt(absoluteIndex: number): DataRow | undefined {
      const rows = sortedRows.value;
      if (rows) return rows[absoluteIndex];
      const row = props.rows[absoluteIndex];
      return row ? { row, originalIndex: absoluteIndex } : undefined;
    }

    function originalIndexForAbsoluteIndex(absoluteIndex: number): number {
      return dataEntryAt(absoluteIndex)?.originalIndex ?? absoluteIndex;
    }

    const visibleRows = computed<readonly DataRow[]>(() => {
      const top = normalizedScrollTop.value;
      const bottom = top + visibleRowCapacity.value;
      const rows = sortedRows.value;
      if (rows) return rows.slice(top, bottom);
      return props.rows.slice(top, bottom).map((row, index) => ({
        row,
        originalIndex: top + index,
      }));
    });
    const tableRows = computed(() => visibleRows.value.map(({ row }) => row));
    const activeAbsoluteIndex = ref<number | null>(null);
    const activeRowIdentity = ref<unknown>(NO_ACTIVE_ROW);
    const keyboardActive = ref(false);

    const columns = computed(() =>
      props.columns.map((column) => {
        const format = column.format
          ? (value: unknown, row: TTableRow, visibleIndex: number) => {
              const absoluteIndex = normalizedScrollTop.value + visibleIndex;
              const originalIndex = originalIndexForAbsoluteIndex(absoluteIndex);
              return column.format!(value, row, originalIndex);
            }
          : undefined;
        if (!props.sortable || column.key !== props.sortBy) {
          return format ? { ...column, format } : column;
        }
        const marker = props.sortDirection === "desc" ? "v" : "^";
        return { ...column, label: sortLabel(column, marker), ...(format ? { format } : {}) };
      }),
    );

    function originalIndexAt(index: number): number {
      const absoluteIndex = normalizedScrollTop.value + index;
      return originalIndexForAbsoluteIndex(absoluteIndex);
    }

    function dataTableRowKey(row: TTableRow, index: number): unknown {
      return rowKey(row, originalIndexAt(index), props.rowKey as any);
    }

    function dataRowKey(entry: DataRow): unknown {
      return rowKey(entry.row, entry.originalIndex, props.rowKey as any);
    }

    function clearActiveRow(): void {
      activeAbsoluteIndex.value = null;
      activeRowIdentity.value = NO_ACTIVE_ROW;
      keyboardActive.value = false;
    }

    function selectedKeySet(): Set<unknown> {
      if (props.selectionMode === "multiple") return new Set(props.selectedRowKeys ?? []);
      return new Set(props.selectedRowKey === undefined ? [] : [props.selectedRowKey]);
    }

    const activeRowKey = computed(() =>
      activeRowIdentity.value === NO_ACTIVE_ROW ? undefined : activeRowIdentity.value,
    );
    const activeRawRowKey = computed(() => {
      if (activeAbsoluteIndex.value == null || sortedRows.value) return NO_ACTIVE_ROW;
      const index = activeAbsoluteIndex.value;
      const row = props.rows[index];
      return row ? rowKey(row, index, props.rowKey as any) : NO_ACTIVE_ROW;
    });

    function findDataIndexByKey(key: unknown): number {
      const rows = sortedRows.value;
      if (rows) {
        return rows.findIndex((entry) => Object.is(dataRowKey(entry), key));
      }
      return props.rows.findIndex((row, index) =>
        Object.is(rowKey(row, index, props.rowKey as any), key),
      );
    }

    watch(
      () => [props.rowKey, props.rows, sortedRows.value, activeRowIdentity.value] as const,
      () => {
        if (activeRowIdentity.value === NO_ACTIVE_ROW) return;

        const nextIndex = findDataIndexByKey(activeRowIdentity.value);

        if (nextIndex < 0) {
          clearActiveRow();
          return;
        }

        activeAbsoluteIndex.value = nextIndex;
      },
    );
    watch(
      () => [props.rowKey, activeRawRowKey.value] as const,
      ([, key]) => {
        if (activeRowIdentity.value === NO_ACTIVE_ROW) return;
        if (key === NO_ACTIVE_ROW) {
          clearActiveRow();
          return;
        }
        if (!Object.is(activeRowIdentity.value, key)) activeRowIdentity.value = key;
      },
    );

    function setActiveAbsoluteIndex(
      absoluteIndex: number,
    ): { dataIndex: number; scrollTop: number } | null {
      const clamped = Math.max(0, Math.min(processedRowCount() - 1, absoluteIndex));
      const entry = dataEntryAt(clamped);
      if (!entry) {
        clearActiveRow();
        return null;
      }
      activeAbsoluteIndex.value = clamped;
      activeRowIdentity.value = dataRowKey(entry);
      let nextScrollTop = normalizedScrollTop.value;
      const visibleIndex = clamped - nextScrollTop;
      if (visibleIndex < 0) nextScrollTop = setScrollTop(clamped);
      else if (visibleIndex >= visibleRowCapacity.value) {
        nextScrollTop = setScrollTop(Math.max(0, clamped - visibleRowCapacity.value + 1));
      }
      return { dataIndex: clamped, scrollTop: nextScrollTop };
    }

    function commitSelection(entry: DataRow, index: number, dataIndex: number): void {
      const key = rowKey(entry.row, entry.originalIndex, props.rowKey as any);
      if (props.selectionMode === "multiple") {
        const keys = selectedKeySet();
        if (keys.has(key)) keys.delete(key);
        else keys.add(key);
        emit("update:selectedRowKeys", [...keys]);
      } else {
        emit("update:selectedRowKey", key);
      }
      emit("rowSelect", {
        row: entry.row,
        index,
        dataIndex,
        originalIndex: entry.originalIndex,
        key,
      });
    }

    function select(row: TTableRow, index: number): void {
      if (!props.selectable || props.selectionMode === "none") return;
      keyboardActive.value = false;
      const dataIndex = normalizedScrollTop.value + index;
      const originalIndex = originalIndexAt(index);
      const active = setActiveAbsoluteIndex(dataIndex);
      if (!active) return;
      const visibleIndex = Math.max(
        0,
        Math.min(Math.max(0, visibleRowCapacity.value - 1), dataIndex - active.scrollTop),
      );
      commitSelection({ row, originalIndex }, visibleIndex, dataIndex);
    }

    function sort(column: TTableColumn): void {
      if (!props.sortable || props.columns.length === 0) return;
      keyboardActive.value = false;
      const nextSortBy = column.key;
      const nextDirection =
        props.sortBy === nextSortBy && props.sortDirection === "asc" ? "desc" : "asc";
      emit("update:sortBy", nextSortBy);
      emit("update:sortDirection", nextDirection);
      emit("sortChange", { sortBy: nextSortBy, sortDirection: nextDirection });
    }

    function handleKeydown(event: any, fallbackAbsoluteIndex: number): void {
      if (event?.defaultPrevented) return;
      if (!props.selectable || props.selectionMode === "none") return;
      if (
        event?.key !== "ArrowDown" &&
        event?.key !== "ArrowUp" &&
        event?.key !== "Enter" &&
        event?.key !== " "
      ) {
        return;
      }
      event.preventDefault?.();
      keyboardActive.value = true;
      const current = activeAbsoluteIndex.value ?? fallbackAbsoluteIndex;
      if (event.key === "Enter" || event.key === " ") {
        const active = setActiveAbsoluteIndex(current);
        if (!active) return;
        const entry = dataEntryAt(active.dataIndex);
        if (!entry) return;
        const visibleIndex = active.dataIndex - active.scrollTop;
        commitSelection(
          entry,
          Math.max(0, Math.min(Math.max(0, visibleRowCapacity.value - 1), visibleIndex)),
          active.dataIndex,
        );
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveAbsoluteIndex(current + delta);
    }

    function onKeydown(event: any): void {
      handleKeydown(event, normalizedScrollTop.value);
    }

    function onRowKeydown({ index, event }: { index: number; event: any }): void {
      handleKeydown(event, normalizedScrollTop.value + index);
    }

    function tableSelectedRowKey(): unknown {
      return props.selectionMode === "single" ? props.selectedRowKey : undefined;
    }

    function tableSelectedRowKeys(): readonly unknown[] | undefined {
      if (props.selectionMode === "multiple") return props.selectedRowKeys;
      if (props.selectionMode === "single" && props.selectedRowKey !== undefined) {
        return [props.selectedRowKey];
      }
      return undefined;
    }

    return () =>
      h(
        TView as any,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: props.h,
          zIndex: props.zIndex,
          focusable: props.selectable && props.selectionMode !== "none",
          autoFocus: keyboardActive.value,
          onKeydown,
        },
        () =>
          h(TTable as any, {
            x: 0,
            y: 0,
            w: props.w,
            h: props.h,
            columns: columns.value,
            rows: tableRows.value,
            rowKey: dataTableRowKey,
            activeRowKey: keyboardActive.value ? activeRowKey.value : undefined,
            selectedRowKey: tableSelectedRowKey(),
            selectedRowKeys: tableSelectedRowKeys(),
            border: props.border,
            style: props.style,
            headerStyle: props.headerStyle,
            borderStyle: props.borderStyle,
            selectedStyle: props.selectedStyle,
            activeStyle: props.activeStyle,
            emptyText: props.emptyText,
            headerFocusable: props.sortable,
            rowFocusable: props.selectable && props.selectionMode !== "none",
            onRowClick: ({ row, index }: { row: TTableRow; index: number }) => select(row, index),
            onHeaderClick: ({ column }: { column: TTableColumn }) => sort(column),
            onRowKeydown,
          }),
      );
  },
});
