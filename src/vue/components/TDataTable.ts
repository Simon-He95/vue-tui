import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { sliceByCells, textCellWidth } from "../utils/text.js";
import { TTable, type TTableColumn, type TTableRow } from "./TTable.js";

export type TDataTableSortDirection = "asc" | "desc";

export type TDataTableSortChangePayload = Readonly<{
  sortBy: string;
  sortDirection: TDataTableSortDirection;
}>;

export type TDataTableRowSelectPayload = Readonly<{
  row: TTableRow;
  index: number;
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
     * TDataTable owns a controlled viewport offset through scrollTop. It is still
     * non-virtual: rows are sorted/filtered in memory and only the visible slice is
     * passed to TTable.
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
    scrollTop: { type: Number, default: 0 },
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
    const indexedRows = computed<readonly DataRow[]>(() =>
      props.rows.map((row, originalIndex) => ({ row, originalIndex })),
    );
    const filteredRows = computed(() => {
      if (props.manualFilter) return indexedRows.value;
      if (!props.filterable || !props.filter.trim()) return indexedRows.value;
      const query = props.filter.trim().toLowerCase();
      if (props.filterPredicate) {
        return indexedRows.value.filter(({ row, originalIndex }) =>
          props.filterPredicate!(row, query, props.columns, originalIndex),
        );
      }
      return indexedRows.value.filter(({ row, originalIndex }) =>
        props.columns.some((column) =>
          displayValue(column, row, originalIndex).toLowerCase().includes(query),
        ),
      );
    });

    const sortedRows = computed(() => {
      const rows = [...filteredRows.value];
      if (props.manualSort || !props.sortable || !props.sortBy) return rows;
      const column = props.columns.find((candidate) => candidate.key === props.sortBy);
      rows.sort((a, b) => {
        const result =
          props.sorter && column
            ? props.sorter(a.row, b.row, column)
            : compareValues(a.row[props.sortBy], b.row[props.sortBy]);
        return props.sortDirection === "desc" ? -result : result;
      });
      return rows;
    });
    const visibleRowCapacity = computed(() => Math.max(0, Math.floor(props.h) - 2));
    const normalizedScrollTop = computed(() => {
      const max = Math.max(0, sortedRows.value.length - visibleRowCapacity.value);
      return Math.max(0, Math.min(max, Math.floor(props.scrollTop)));
    });
    const visibleRows = computed(() =>
      sortedRows.value.slice(
        normalizedScrollTop.value,
        normalizedScrollTop.value + visibleRowCapacity.value,
      ),
    );
    const tableRows = computed(() => visibleRows.value.map(({ row }) => row));

    const columns = computed(() =>
      props.columns.map((column) => {
        if (!props.sortable || column.key !== props.sortBy) return column;
        const marker = props.sortDirection === "desc" ? "v" : "^";
        return { ...column, label: sortLabel(column, marker) };
      }),
    );

    function originalIndexAt(index: number): number {
      const absoluteIndex = normalizedScrollTop.value + index;
      return sortedRows.value[absoluteIndex]?.originalIndex ?? absoluteIndex;
    }

    function dataTableRowKey(row: TTableRow, index: number): unknown {
      return rowKey(row, originalIndexAt(index), props.rowKey as any);
    }

    function selectedKeySet(): Set<unknown> {
      if (props.selectionMode === "multiple") return new Set(props.selectedRowKeys ?? []);
      return new Set(props.selectedRowKey === undefined ? [] : [props.selectedRowKey]);
    }

    function select(row: TTableRow, index: number): void {
      const originalIndex = originalIndexAt(index);
      const key = rowKey(row, originalIndex, props.rowKey as any);
      if (!props.selectable || props.selectionMode === "none") return;
      if (props.selectionMode === "multiple") {
        const keys = selectedKeySet();
        if (keys.has(key)) keys.delete(key);
        else keys.add(key);
        emit("update:selectedRowKeys", [...keys]);
      } else {
        emit("update:selectedRowKey", key);
      }
      emit("rowSelect", { row, index, originalIndex, key });
    }

    function sort(column: TTableColumn): void {
      if (!props.sortable || props.columns.length === 0) return;
      const nextSortBy = column.key;
      const nextDirection =
        props.sortBy === nextSortBy && props.sortDirection === "asc" ? "desc" : "asc";
      emit("update:sortBy", nextSortBy);
      emit("update:sortDirection", nextDirection);
      emit("sortChange", { sortBy: nextSortBy, sortDirection: nextDirection });
    }

    function selectAbsoluteIndex(absoluteIndex: number): void {
      const clamped = Math.max(0, Math.min(sortedRows.value.length - 1, absoluteIndex));
      const entry = sortedRows.value[clamped];
      if (!entry) return;
      const visibleIndex = clamped - normalizedScrollTop.value;
      if (visibleIndex < 0) emit("update:scrollTop", clamped);
      else if (visibleIndex >= visibleRowCapacity.value) {
        emit("update:scrollTop", Math.max(0, clamped - visibleRowCapacity.value + 1));
      }
      const key = rowKey(entry.row, entry.originalIndex, props.rowKey as any);
      if (props.selectionMode === "multiple") {
        const keys = selectedKeySet();
        keys.add(key);
        emit("update:selectedRowKeys", [...keys]);
      } else {
        emit("update:selectedRowKey", key);
      }
      emit("rowSelect", {
        row: entry.row,
        index: Math.max(0, Math.min(visibleRowCapacity.value - 1, visibleIndex)),
        originalIndex: entry.originalIndex,
        key,
      });
    }

    function onRowKeydown({ index, event }: { index: number; event: any }): void {
      if (!props.selectable || props.selectionMode === "none") return;
      if (event?.key !== "ArrowDown" && event?.key !== "ArrowUp") return;
      event.preventDefault?.();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      selectAbsoluteIndex(normalizedScrollTop.value + index + delta);
    }

    return () =>
      h(TTable as any, {
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        columns: columns.value,
        rows: tableRows.value,
        rowKey: dataTableRowKey,
        selectedRowKey: props.selectionMode === "multiple" ? undefined : props.selectedRowKey,
        selectedRowKeys: props.selectionMode === "multiple" ? props.selectedRowKeys : undefined,
        border: props.border,
        style: props.style,
        headerStyle: props.headerStyle,
        borderStyle: props.borderStyle,
        selectedStyle: props.selectedStyle,
        emptyText: props.emptyText,
        headerFocusable: props.sortable,
        rowFocusable: props.selectable && props.selectionMode !== "none",
        onRowClick: ({ row, index }: { row: TTableRow; index: number }) => select(row, index),
        onHeaderClick: ({ column }: { column: TTableColumn }) => sort(column),
        onRowKeydown,
      });
  },
});
