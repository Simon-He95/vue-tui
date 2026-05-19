import type { PropType, VNodeChild } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { forEachTextCellSegment, textCellWidth } from "../utils/text.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

export type TUserMessageSegment = Readonly<{
  start: number;
  end: number;
  style?: Style;
  href?: string;
  meta?: unknown;
}>;

export type TUserMessageRow = Readonly<{
  text: string;
  start: number;
  end: number;
  segments?: readonly TUserMessageSegment[];
}>;

export type TUserMessageHeaderSegmentRole = "prefix" | "label" | "meta";

export type TUserMessageHeaderSegment = Readonly<{
  role: TUserMessageHeaderSegmentRole;
  text: string;
  start: number;
  end: number;
  style?: Style;
  meta?: unknown;
}>;

export type TUserMessageViewSlotProps = Readonly<{
  x: number;
  y: number;
  w: number;
  rowIndex: number;
  text: string;
  row: TUserMessageRow;
  style: Style;
  segments: readonly TUserMessageSegment[];
}>;

export type TUserMessageViewModelOptions = Readonly<{
  w: number;
  label?: string;
  prefix?: string;
  meta?: string;
  content: string;
  indent?: number;
  topBlank?: boolean;
  bottomBlank?: boolean;
  segments?: readonly TUserMessageSegment[];
  style?: Style;
  headerStyle?: Style;
  prefixStyle?: Style;
  labelStyle?: Style;
  contentStyle?: Style;
  segmentStyle?: Style;
}>;

export type TUserMessageViewModel = Readonly<{
  width: number;
  indent: number;
  contentWidth: number;
  block: Style;
  header: Style;
  label: Style;
  prefix: Style;
  content: Style;
  segment: Style;
  rows: readonly TUserMessageRow[];
  headerText: string;
  headerSegments: readonly TUserMessageHeaderSegment[];
  topRows: number;
  height: number;
}>;

const DEFAULT_BLOCK_STYLE: Style = Object.freeze({ fg: "whiteBright", bg: "blackBright" });
const DEFAULT_HEADER_STYLE: Style = Object.freeze({
  fg: "white",
  bg: "blackBright",
  dim: true,
});
const DEFAULT_LABEL_STYLE: Style = Object.freeze({
  fg: "greenBright",
  bg: "blackBright",
  bold: true,
});
const DEFAULT_CONTENT_STYLE: Style = Object.freeze({ fg: "whiteBright", bg: "blackBright" });
const DEFAULT_SEGMENT_STYLE: Style = Object.freeze({
  fg: "cyanBright",
  bg: "blackBright",
  underline: true,
});

function wrapRows(text: string, width: number): TUserMessageRow[] {
  const rows: TUserMessageRow[] = [];
  const normalized = String(text ?? "").replace(/\r/g, "");
  const maxWidth = Math.max(1, Math.floor(width));
  if (!normalized) return [{ text: "", start: 0, end: 0 }];

  let lineStart = 0;
  let cells = 0;
  let lastSpaceIndex = -1;
  let cellsIncludingSpace = 0;

  function pushRow(start: number, end: number): void {
    rows.push({ text: normalized.slice(start, end), start, end });
  }

  forEachTextCellSegment(normalized, (segment) => {
    if (segment.text === "\n") {
      pushRow(lineStart, segment.start);
      lineStart = segment.end;
      cells = 0;
      lastSpaceIndex = -1;
      cellsIncludingSpace = 0;
      return;
    }

    const segmentCells = Math.max(1, segment.cells);
    if (segment.text === " ") {
      lastSpaceIndex = segment.start;
      cellsIncludingSpace = cells + segmentCells;
    }

    const nextCells = cells + segmentCells;
    if (nextCells > maxWidth) {
      if (lastSpaceIndex >= lineStart) {
        pushRow(lineStart, lastSpaceIndex);
        lineStart = lastSpaceIndex + 1;
        cells = nextCells - cellsIncludingSpace;
        lastSpaceIndex = -1;
        cellsIncludingSpace = 0;
        return;
      }
      if (cells > 0) {
        pushRow(lineStart, segment.start);
        lineStart = segment.start;
        cells = segmentCells;
        lastSpaceIndex = -1;
        cellsIncludingSpace = 0;
        return;
      }
      pushRow(lineStart, segment.end);
      lineStart = segment.end;
      cells = 0;
      lastSpaceIndex = -1;
      cellsIncludingSpace = 0;
      return;
    }

    cells = nextCells;
  });

  pushRow(lineStart, normalized.length);
  return rows.length ? rows : [{ text: "", start: 0, end: 0 }];
}

function normalizedOffsetForRawContent(text: string, offset: number): number {
  const rawOffset = Math.floor(offset);
  const limit = Math.min(Math.max(0, rawOffset), text.length);
  let removed = 0;
  for (let index = 0; index < limit; index++) {
    if (text[index] === "\r") removed++;
  }
  return rawOffset - removed;
}

function normalizeSegments(
  text: string,
  segments: readonly TUserMessageSegment[],
): readonly TUserMessageSegment[] {
  if (!text.includes("\r")) return segments;
  return segments.map((segment) => ({
    ...segment,
    start: normalizedOffsetForRawContent(text, segment.start),
    end: normalizedOffsetForRawContent(text, segment.end),
  }));
}

function rowSegments(
  row: TUserMessageRow,
  segments: readonly TUserMessageSegment[],
): TUserMessageSegment[] {
  const out: TUserMessageSegment[] = [];
  for (const segment of segments) {
    const start = Math.max(row.start, Math.floor(segment.start));
    const end = Math.min(row.end, Math.floor(segment.end));
    if (end <= start) continue;
    out.push({ ...segment, start, end });
  }
  return out;
}

export function resolveTUserMessageViewModel(
  options: TUserMessageViewModelOptions,
): TUserMessageViewModel {
  const width = Math.max(1, Math.floor(options.w));
  const indent = Math.max(0, Math.floor(options.indent ?? 2));
  const contentWidth = Math.max(1, width - indent);
  const block = { ...DEFAULT_BLOCK_STYLE, ...options.style };
  const header = { ...DEFAULT_HEADER_STYLE, bg: block.bg, ...options.headerStyle };
  const label = { ...DEFAULT_LABEL_STYLE, bg: block.bg, ...options.labelStyle };
  const prefix = { ...label, ...options.prefixStyle };
  const content = { ...DEFAULT_CONTENT_STYLE, bg: block.bg, ...options.contentStyle };
  const segment = { ...DEFAULT_SEGMENT_STYLE, bg: block.bg, ...options.segmentStyle };
  const rawContent = String(options.content ?? "");
  const segments = normalizeSegments(rawContent, options.segments ?? []);
  const rows = wrapRows(options.content, contentWidth).map((row) => ({
    ...row,
    segments: rowSegments(row, segments),
  }));
  const labelText = options.label ?? "user";
  const prefixText = options.prefix ?? "> ";
  const metaText = options.meta ?? "";
  const headerText = `${prefixText}${labelText}${metaText ? ` ${metaText}` : ""}`;
  const headerSegments: TUserMessageHeaderSegment[] = [];
  if (prefixText) {
    headerSegments.push({
      role: "prefix",
      text: prefixText,
      start: 0,
      end: prefixText.length,
      style: prefix,
    });
  }
  headerSegments.push({
    role: "label",
    text: labelText,
    start: prefixText.length,
    end: prefixText.length + labelText.length,
    style: label,
  });
  if (metaText) {
    const start = prefixText.length + labelText.length + 1;
    headerSegments.push({
      role: "meta",
      text: metaText,
      start,
      end: start + metaText.length,
      style: header,
    });
  }
  const topRows = (options.topBlank ?? true) ? 1 : 0;
  const height = topRows + 1 + rows.length + ((options.bottomBlank ?? true) ? 1 : 0);
  return {
    width,
    indent,
    contentWidth,
    block,
    header,
    label,
    prefix,
    content,
    segment,
    rows,
    headerText,
    headerSegments,
    topRows,
    height,
  };
}

export const TUserMessageView = defineComponent({
  name: "TUserMessageView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    label: { type: String, default: "user" },
    prefix: { type: String, default: "> " },
    meta: { type: String, default: "" },
    content: { type: String, required: true },
    indent: { type: Number, default: 2 },
    topBlank: { type: Boolean, default: true },
    bottomBlank: { type: Boolean, default: true },
    segments: { type: Array as PropType<TUserMessageSegment[]>, default: () => [] },
    style: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: undefined },
    prefixStyle: { type: Object as PropType<Style>, default: undefined },
    labelStyle: { type: Object as PropType<Style>, default: undefined },
    contentStyle: { type: Object as PropType<Style>, default: undefined },
    segmentStyle: { type: Object as PropType<Style>, default: undefined },
    focusable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: undefined },
  },
  setup(props, { slots }) {
    const model = computed(() => resolveTUserMessageViewModel(props));

    function textNode(key: string, x: number, y: number, value: string, style: Style): VNodeChild {
      return h(TText, {
        key,
        x,
        y,
        w: textCellWidth(value),
        value,
        style,
        clear: false,
      });
    }

    return () => {
      const state = model.value;
      const height = Math.max(0, Math.floor(props.h ?? state.height));
      const children: VNodeChild[] = [];

      for (let y = 0; y < height; y++) {
        children.push(
          h(TText, {
            key: `bg:${y}`,
            x: 0,
            y,
            w: state.width,
            value: "",
            style: state.block,
          }),
        );
      }

      const headerY = state.topRows;
      if (headerY < height) {
        const fullHeader = `${" ".repeat(state.indent)}${state.headerText}`;
        if (slots.header) {
          children.push(
            ...(slots.header({
              x: 0,
              y: headerY,
              w: state.width,
              text: state.headerText,
              style: state.header,
            }) ?? []),
          );
        } else {
          children.push(textNode("header", 0, headerY, fullHeader, state.header));
          for (let index = 0; index < state.headerSegments.length; index++) {
            const segment = state.headerSegments[index]!;
            children.push(
              textNode(
                `header-segment:${index}`,
                state.indent + textCellWidth(state.headerText.slice(0, segment.start)),
                headerY,
                segment.text,
                segment.style ?? state.header,
              ),
            );
          }
        }
      }

      const contentStartY = headerY + 1;
      for (let index = 0; index < state.rows.length; index++) {
        const y = contentStartY + index;
        if (y >= height) break;
        const row = state.rows[index]!;
        const segments = row.segments ?? [];
        const slotProps: TUserMessageViewSlotProps = {
          x: 0,
          y,
          w: state.width,
          rowIndex: index,
          text: row.text,
          row,
          style: state.content,
          segments,
        };

        if (slots.row) {
          children.push(...(slots.row(slotProps) ?? []));
        } else {
          const fullText = `${" ".repeat(state.indent)}${row.text}`;
          children.push(textNode(`row:${index}`, 0, y, fullText, state.content));
          for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
            const segment = segments[segmentIndex]!;
            const localStart = Math.max(0, segment.start - row.start);
            const localEnd = Math.max(localStart, segment.end - row.start);
            const before = row.text.slice(0, localStart);
            const text = row.text.slice(localStart, localEnd);
            if (!text) continue;
            children.push(
              textNode(
                `row:${index}:segment:${segmentIndex}`,
                state.indent + textCellWidth(before),
                y,
                text,
                { ...state.segment, ...segment.style, href: segment.href ?? segment.style?.href },
              ),
            );
          }
        }
      }

      return h(
        TView,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: height,
          zIndex: props.zIndex,
          focusable: props.focusable,
          selectable: props.selectable,
        },
        () => children,
      );
    };
  },
});
