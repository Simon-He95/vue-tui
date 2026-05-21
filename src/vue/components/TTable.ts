import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, inject, ref } from "vue";
import { TuiThemeContextKey, tuiDefaultTheme } from "../theme.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { fitCellText, mergeStyle, repeatToCells } from "./simple-utils.js";

export type TTableColumn = Readonly<{
  key: string;
  label?: string;
  width?: number;
  align?: "left" | "right";
  style?: Style;
  headerStyle?: Style;
  format?: (value: unknown, row: TTableRow, index: number) => string;
}>;

export type TTableRow = Readonly<Record<string, unknown>>;

export type TTableRowClickPayload = Readonly<{
  row: TTableRow;
  index: number;
}>;

export type TTableHeaderClickPayload = Readonly<{
  column: TTableColumn;
  index: number;
}>;

function resolveColumnWidths(
  columns: readonly TTableColumn[],
  width: number,
  border: boolean,
): number[] {
  const count = columns.length;
  if (count === 0) return [];
  const separators = border ? count + 1 : Math.max(0, count - 1);
  const available = Math.max(0, Math.floor(width) - separators);
  const explicit = columns.map((column) =>
    column.width == null ? 0 : Math.max(1, Math.floor(column.width)),
  );
  const explicitTotal = explicit.reduce((sum, next) => sum + next, 0);
  const autoIndexes = explicit.flatMap((value, index) => (value > 0 ? [] : [index]));
  const out = [...explicit];
  if (autoIndexes.length === 0) return out.map((value) => Math.max(1, value));

  let remaining = Math.max(0, available - explicitTotal);
  for (let i = 0; i < autoIndexes.length; i++) {
    const slotsLeft = autoIndexes.length - i;
    const value = Math.max(1, Math.floor(remaining / slotsLeft));
    out[autoIndexes[i]!] = value;
    remaining -= value;
  }
  return out;
}

function cellValue(column: TTableColumn, row: TTableRow, index: number): string {
  const raw = row[column.key];
  return column.format ? column.format(raw, row, index) : String(raw ?? "");
}

function makeRowLine(
  columns: readonly TTableColumn[],
  widths: readonly number[],
  row: TTableRow,
  index: number,
  border: boolean,
): string {
  const cells = columns.map((column, columnIndex) =>
    fitCellText(cellValue(column, row, index), widths[columnIndex] ?? 1, column.align),
  );
  return border ? `|${cells.join("|")}|` : cells.join(" ");
}

function makeHeaderLine(
  columns: readonly TTableColumn[],
  widths: readonly number[],
  border: boolean,
): string {
  const cells = columns.map((column, index) =>
    fitCellText(column.label ?? column.key, widths[index] ?? 1, column.align),
  );
  return border ? `|${cells.join("|")}|` : cells.join(" ");
}

function rowKey(
  row: TTableRow,
  index: number,
  key?: string | ((row: TTableRow, index: number) => unknown),
): unknown {
  if (typeof key === "function") return key(row, index);
  if (typeof key === "string") return row[key];
  return index;
}

export const TTable = defineComponent({
  name: "TTable",
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
    border: { type: Boolean, default: false },
    header: { type: Boolean, default: true },
    style: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: undefined },
    borderStyle: { type: Object as PropType<Style>, default: undefined },
    selectedStyle: { type: Object as PropType<Style>, default: undefined },
    emptyText: { type: String, default: "No rows" },
  },
  emits: {
    rowClick: (_payload: TTableRowClickPayload) => true,
    headerClick: (_payload: TTableHeaderClickPayload) => true,
  },
  setup(props, { emit }) {
    const theme = inject(TuiThemeContextKey, ref(tuiDefaultTheme));
    const widths = computed(() => resolveColumnWidths(props.columns, props.w, props.border));
    const headerLine = computed(() => makeHeaderLine(props.columns, widths.value, props.border));
    const separatorLine = computed(() => {
      if (!props.header) return "";
      const cells = widths.value.map((width) => repeatToCells("-", width));
      return props.border ? `+${cells.join("+")}+` : cells.join(" ");
    });
    const headerStyle = computed(() =>
      mergeStyle(theme.value.components.TTable?.headerStyle, props.headerStyle),
    );
    const borderStyle = computed(() =>
      mergeStyle(theme.value.components.TTable?.borderStyle, props.borderStyle),
    );
    const rowStyle = computed(() =>
      mergeStyle(theme.value.components.TTable?.rowStyle, props.style),
    );
    const selectedRowStyle = computed(() =>
      mergeStyle(rowStyle.value, theme.value.components.TTable?.selectedStyle, props.selectedStyle),
    );
    const bodyRows = computed(() => {
      const top = props.header ? 2 : 0;
      return props.rows.slice(0, Math.max(0, props.h - top));
    });

    return () => {
      const children: any[] = [];
      if (props.header && props.h > 0) {
        children.push(
          h(TText as any, {
            key: "header",
            x: 0,
            y: 0,
            w: props.w,
            value: headerLine.value,
            style: headerStyle.value,
          }),
        );
        let cursor = props.border ? 1 : 0;
        for (let index = 0; index < props.columns.length; index++) {
          const column = props.columns[index]!;
          const width = widths.value[index] ?? 1;
          if (column.headerStyle) {
            children.push(
              h(TText as any, {
                key: `header-cell:${column.key}`,
                x: cursor,
                y: 0,
                w: width,
                value: fitCellText(column.label ?? column.key, width, column.align),
                style: mergeStyle(headerStyle.value, column.headerStyle),
              }),
            );
          }
          children.push(
            h(TView as any, {
              key: `header-hit:${column.key}`,
              x: cursor,
              y: 0,
              w: width,
              h: 1,
              focusable: true,
              onClick: () => emit("headerClick", { column, index }),
            }),
          );
          cursor += width + 1;
        }
      }
      if (props.header && props.h > 1) {
        children.push(
          h(TText as any, {
            key: "separator",
            x: 0,
            y: 1,
            w: props.w,
            value: separatorLine.value,
            style: borderStyle.value,
          }),
        );
      }

      if (bodyRows.value.length === 0 && props.h > (props.header ? 2 : 0)) {
        children.push(
          h(TText as any, {
            key: "empty",
            x: 0,
            y: props.header ? 2 : 0,
            w: props.w,
            value: props.emptyText,
            style: rowStyle.value,
          }),
        );
      }

      for (let index = 0; index < bodyRows.value.length; index++) {
        const row = bodyRows.value[index]!;
        const y = (props.header ? 2 : 0) + index;
        const selected =
          props.selectedRowKey !== undefined &&
          rowKey(row, index, props.rowKey as any) === props.selectedRowKey;
        children.push(
          h(
            TView as any,
            {
              key: `row:${String(rowKey(row, index, props.rowKey as any))}`,
              x: 0,
              y,
              w: props.w,
              h: 1,
              focusable: true,
              onClick: () => emit("rowClick", { row, index }),
            },
            () => {
              const baseStyle = selected ? selectedRowStyle.value : rowStyle.value;
              const rowChildren: any[] = [
                h(TText as any, {
                  key: "row-line",
                  x: 0,
                  y: 0,
                  w: props.w,
                  value: makeRowLine(props.columns, widths.value, row, index, props.border),
                  style: baseStyle,
                }),
              ];

              let cursor = props.border ? 1 : 0;
              for (let columnIndex = 0; columnIndex < props.columns.length; columnIndex++) {
                const column = props.columns[columnIndex]!;
                const width = widths.value[columnIndex] ?? 1;
                if (column.style) {
                  rowChildren.push(
                    h(TText as any, {
                      key: `cell:${column.key}`,
                      x: cursor,
                      y: 0,
                      w: width,
                      value: fitCellText(cellValue(column, row, index), width, column.align),
                      style: mergeStyle(baseStyle, column.style),
                    }),
                  );
                }
                cursor += width + 1;
              }

              return rowChildren;
            },
          ),
        );
      }

      return h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: props.h, zIndex: props.zIndex },
        () => children,
      );
    };
  },
});
