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
  key: unknown;
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
    const filteredRows = computed(() => {
      if (!props.filterable || !props.filter.trim()) return props.rows;
      const query = props.filter.trim().toLowerCase();
      return props.rows.filter((row) =>
        props.columns.some((column) =>
          String(row[column.key] ?? "")
            .toLowerCase()
            .includes(query),
        ),
      );
    });

    const sortedRows = computed(() => {
      const rows = [...filteredRows.value];
      if (!props.sortable || !props.sortBy) return rows;
      rows.sort((a, b) => {
        const result = compareValues(a[props.sortBy], b[props.sortBy]);
        return props.sortDirection === "desc" ? -result : result;
      });
      return rows;
    });

    const columns = computed(() =>
      props.columns.map((column) => {
        if (!props.sortable || column.key !== props.sortBy) return column;
        const marker = props.sortDirection === "desc" ? "v" : "^";
        return { ...column, label: `${column.label ?? column.key} ${marker}` };
      }),
    );

    function select(row: TTableRow, index: number): void {
      const key = rowKey(row, index, props.rowKey as any);
      if (props.selectable) emit("update:selectedRowKey", key);
      emit("rowSelect", { row, index, key });
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
        rows: sortedRows.value,
        rowKey: props.rowKey,
        selectedRowKey: props.selectedRowKey,
        border: props.border,
        style: props.style,
        headerStyle: props.headerStyle,
        selectedStyle: props.selectedStyle,
        emptyText: props.emptyText,
        onRowClick: ({ row, index }: { row: TTableRow; index: number }) => select(row, index),
        onHeaderClick: ({ column }: { column: TTableColumn }) => sort(column),
      });
  },
});
