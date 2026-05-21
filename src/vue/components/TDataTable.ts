import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
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
    rows: {
      type: Array as PropType<readonly TTableRow[]>,
      required: true,
    },
    rowKey: {
      type: [String, Function] as PropType<string | ((row: TTableRow, index: number) => unknown)>,
      default: undefined,
    },
    selectedRowKey: { type: null as any, default: undefined },
    sortBy: { type: String, default: "" },
    sortDirection: {
      type: String as PropType<TDataTableSortDirection>,
      default: "asc",
    },
    sortable: { type: Boolean, default: false },
    filter: { type: String, default: "" },
    filterable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: false },
    border: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: undefined },
    selectedStyle: { type: Object as PropType<Style>, default: undefined },
    emptyText: { type: String, default: "No rows" },
  },
  emits: {
    "update:selectedRowKey": (_key: unknown) => true,
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
      if (!props.filterable || !props.filter.trim()) return indexedRows.value;
      const query = props.filter.trim().toLowerCase();
      return indexedRows.value.filter(({ row, originalIndex }) =>
        props.columns.some((column) =>
          displayValue(column, row, originalIndex).toLowerCase().includes(query),
        ),
      );
    });

    const sortedRows = computed(() => {
      const rows = [...filteredRows.value];
      if (!props.sortable || !props.sortBy) return rows;
      rows.sort((a, b) => {
        const result = compareValues(a.row[props.sortBy], b.row[props.sortBy]);
        return props.sortDirection === "desc" ? -result : result;
      });
      return rows;
    });
    const tableRows = computed(() => sortedRows.value.map(({ row }) => row));

    const columns = computed(() =>
      props.columns.map((column) => {
        if (!props.sortable || column.key !== props.sortBy) return column;
        const marker = props.sortDirection === "desc" ? "v" : "^";
        return { ...column, label: `${column.label ?? column.key} ${marker}` };
      }),
    );

    function originalIndexAt(index: number): number {
      return sortedRows.value[index]?.originalIndex ?? index;
    }

    function dataTableRowKey(row: TTableRow, index: number): unknown {
      return rowKey(row, originalIndexAt(index), props.rowKey as any);
    }

    function select(row: TTableRow, index: number): void {
      const originalIndex = originalIndexAt(index);
      const key = rowKey(row, originalIndex, props.rowKey as any);
      if (props.selectable) emit("update:selectedRowKey", key);
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
        selectedRowKey: props.selectedRowKey,
        border: props.border,
        style: props.style,
        headerStyle: props.headerStyle,
        selectedStyle: props.selectedStyle,
        emptyText: props.emptyText,
        headerFocusable: props.sortable,
        rowFocusable: props.selectable,
        onRowClick: ({ row, index }: { row: TTableRow; index: number }) => select(row, index),
        onHeaderClick: ({ column }: { column: TTableColumn }) => sort(column),
      });
  },
});
