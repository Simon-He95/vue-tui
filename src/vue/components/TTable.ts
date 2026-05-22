import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, inject, ref } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { TuiThemeContextKey, tuiDefaultTheme } from "../theme.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { fitCellText, mergeStyle, repeatToCells } from "./simple-utils.js";

export type TTableColumn = Readonly<{
  key: string;
  label?: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  flex?: number;
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

export type TTableRowKeydownPayload = Readonly<{
  row: TTableRow;
  index: number;
  event: unknown;
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
  const mins = columns.map((column) =>
    column.minWidth == null ? 1 : Math.max(0, Math.floor(column.minWidth)),
  );
  const maxes = columns.map((column) =>
    column.maxWidth == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(column.maxWidth)),
  );
  const clampColumn = (index: number, value: number) =>
    Math.min(maxes[index]!, Math.max(Math.min(mins[index]!, maxes[index]!), value));
  const out = columns.map((column, index) =>
    column.width == null
      ? Math.min(mins[index]!, maxes[index]!)
      : clampColumn(index, Math.floor(column.width)),
  );
  const autoIndexes = columns.flatMap((column, index) => (column.width == null ? [index] : []));
  if (autoIndexes.length > 0) {
    let remaining = Math.max(0, available - out.reduce((sum, next) => sum + next, 0));
    const candidates = () => autoIndexes.filter((index) => out[index]! < maxes[index]!);
    while (remaining > 0) {
      const open = candidates();
      if (open.length === 0) break;
      const flexTotal = open.reduce(
        (sum, index) => sum + Math.max(0, columns[index]?.flex ?? 1),
        0,
      );
      const weightTotal = flexTotal || open.length;
      let assigned = 0;
      const order = open
        .map((index) => {
          const flex = Math.max(0, columns[index]?.flex ?? 1);
          const weight = flexTotal ? flex : 1;
          const raw = (remaining * weight) / weightTotal;
          const grant = Math.min(maxes[index]! - out[index]!, Math.floor(raw));
          out[index]! += grant;
          assigned += grant;
          return { index, fraction: raw - grant };
        })
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
      remaining -= assigned;
      for (const { index } of order) {
        if (remaining <= 0) break;
        if (out[index]! >= maxes[index]!) continue;
        out[index]! += 1;
        remaining -= 1;
      }
      if (assigned === 0 && order.every(({ index }) => out[index]! >= maxes[index]!)) break;
    }
  }

  const total = out.reduce((sum, next) => sum + next, 0);
  if (total <= available) return out;
  if (available <= 0 || total <= 0) return out.map(() => 0);

  const clamped = out.map((value) => Math.floor((value / total) * available));
  let remaining = available - clamped.reduce((sum, next) => sum + next, 0);
  const remainders = out.map((value, index) => {
    const raw = (value / total) * available;
    return { index, fraction: raw - Math.floor(raw) };
  });
  remainders.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remaining; i++) clamped[remainders[i]!.index]! += 1;

  return clamped;
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
    /**
     * Rows are rendered from the top of the current viewport; TTable does not own
     * scrollTop or virtualization.
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
    activeRowKey: { type: null as any, default: undefined },
    border: { type: Boolean, default: false },
    header: { type: Boolean, default: true },
    style: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: undefined },
    borderStyle: { type: Object as PropType<Style>, default: undefined },
    selectedStyle: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    emptyText: { type: String, default: "No rows" },
    headerFocusable: { type: Boolean, default: false },
    rowFocusable: { type: Boolean, default: false },
  },
  emits: {
    rowClick: (_payload: TTableRowClickPayload) => true,
    headerClick: (_payload: TTableHeaderClickPayload) => true,
    rowKeydown: (_payload: TTableRowKeydownPayload) => true,
  },
  setup(props, { emit }) {
    const { defaultStyle } = useTerminal();
    const theme = inject(TuiThemeContextKey, ref(tuiDefaultTheme));
    const widths = computed(() => resolveColumnWidths(props.columns, props.w, props.border));
    const headerLine = computed(() => makeHeaderLine(props.columns, widths.value, props.border));
    const separatorLine = computed(() => {
      if (!props.header) return "";
      const cells = widths.value.map((width) => repeatToCells("-", width));
      return props.border ? `+${cells.join("+")}+` : cells.join(" ");
    });
    const headerStyle = computed(() =>
      mergeStyle(defaultStyle.value, theme.value.components.TTable?.headerStyle, props.headerStyle),
    );
    const borderStyle = computed(() =>
      mergeStyle(defaultStyle.value, theme.value.components.TTable?.borderStyle, props.borderStyle),
    );
    const rowStyle = computed(() =>
      mergeStyle(defaultStyle.value, theme.value.components.TTable?.rowStyle, props.style),
    );
    const selectedRowStyle = computed(() =>
      mergeStyle(rowStyle.value, theme.value.components.TTable?.selectedStyle, props.selectedStyle),
    );
    const activeRowStyle = computed(() =>
      mergeStyle(theme.value.components.TTable?.activeStyle, props.activeStyle),
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
              focusable: props.headerFocusable,
              onClick: () => emit("headerClick", { column, index }),
              onKeydown: (event: any) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault?.();
                emit("headerClick", { column, index });
              },
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
        const key = rowKey(row, index, props.rowKey as any);
        const selected =
          (props.selectedRowKey !== undefined && key === props.selectedRowKey) ||
          Boolean(props.selectedRowKeys?.some((candidate) => candidate === key));
        const active = props.activeRowKey !== undefined && key === props.activeRowKey;
        children.push(
          h(
            TView as any,
            {
              key: `row:${String(key)}`,
              x: 0,
              y,
              w: props.w,
              h: 1,
              focusable: props.rowFocusable,
              onClick: () => emit("rowClick", { row, index }),
              onKeydown: (event: any) => {
                emit("rowKeydown", { row, index, event });
                if (event?.defaultPrevented) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault?.();
                emit("rowClick", { row, index });
              },
            },
            () => {
              const baseStyle = active
                ? mergeStyle(
                    selected ? selectedRowStyle.value : rowStyle.value,
                    activeRowStyle.value,
                  )
                : selected
                  ? selectedRowStyle.value
                  : rowStyle.value;
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
