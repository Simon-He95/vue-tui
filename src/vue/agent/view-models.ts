import type { Style } from "../../core/types.js";
import type {
  TToolCallStatus,
  TToolCallViewSegment,
  TToolCallViewStyles,
} from "../components/TToolCallView.js";
import {
  forEachTextCellSegment,
  sanitizeInlineText,
  sanitizeTextBlock,
  sliceByCells,
  textCellWidth,
} from "../utils/text.js";

export type TUserMessageSegment = Readonly<{
  start: number;
  end: number;
  href?: string;
  style?: Style;
  meta?: unknown;
}>;

export type TUserMessageViewModel = Readonly<{
  indent: number;
  headerText: string;
  header: Style;
  content: Style;
  segment: Style;
  headerSegments: readonly Readonly<{
    start: number;
    end: number;
    text: string;
    style: Style;
  }>[];
  rows: readonly Readonly<{
    text: string;
    start: number;
    end: number;
    segments: readonly TUserMessageSegment[];
  }>[];
}>;

export function resolveTUserMessageViewModel(
  opts: Readonly<{
    w: number;
    label: string;
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
  }>,
): TUserMessageViewModel {
  const indent = Math.max(0, Math.floor(opts.indent ?? 0));
  const prefix = sanitizeInlineText(opts.prefix ?? "> ");
  const label = sanitizeInlineText(opts.label);
  const meta = sanitizeInlineText(opts.meta ?? "");
  const headerText = `${prefix}${label}${meta ? ` ${meta}` : ""}`;
  const base = opts.style ?? {};
  const header = { ...base, ...opts.headerStyle };
  const rows = buildUserRows(
    sanitizeTextBlock(opts.content),
    Math.max(1, Math.floor(opts.w) - indent),
    opts.segments ?? [],
  );

  return {
    indent,
    headerText,
    header,
    content: { ...base, ...opts.contentStyle },
    segment: { ...base, ...opts.segmentStyle },
    headerSegments: [
      { start: 0, end: prefix.length, text: prefix, style: { ...header, ...opts.prefixStyle } },
      {
        start: prefix.length,
        end: prefix.length + label.length,
        text: label,
        style: { ...header, ...opts.labelStyle },
      },
    ],
    rows,
  };
}

function buildUserRows(
  content: string,
  width: number,
  segments: readonly TUserMessageSegment[],
): TUserMessageViewModel["rows"] {
  const rows: TUserMessageViewModel["rows"][number][] = [];
  let lineStart = 0;

  for (const rawLine of content.split("\n")) {
    if (!rawLine) {
      rows.push({ text: "", start: lineStart, end: lineStart, segments: [] });
      lineStart += 1;
      continue;
    }

    let rowStart = lineStart;
    let rowText = "";
    let rowCells = 0;
    forEachTextCellSegment(rawLine, (segment) => {
      if (rowText && rowCells + segment.cells > width) {
        const rowEnd = lineStart + segment.start;
        rows.push({
          text: rowText,
          start: rowStart,
          end: rowEnd,
          segments: clipUserSegments(segments, rowStart, rowEnd),
        });
        rowStart = rowEnd;
        rowText = "";
        rowCells = 0;
      }
      rowText += segment.text;
      rowCells += segment.cells;
    });

    const rowEnd = rowStart + rowText.length;
    rows.push({
      text: rowText,
      start: rowStart,
      end: rowEnd,
      segments: clipUserSegments(segments, rowStart, rowEnd),
    });
    lineStart += rawLine.length + 1;
  }

  return rows;
}

function clipUserSegments(
  segments: readonly TUserMessageSegment[],
  start: number,
  end: number,
): TUserMessageSegment[] {
  return segments
    .filter((segment) => segment.end > start && segment.start < end)
    .map((segment) => ({
      ...segment,
      start: Math.max(segment.start, start),
      end: Math.min(segment.end, end),
    }));
}

export type TThinkingViewModel = Readonly<{
  headerText: string;
  bodyRows: readonly string[];
  styles: Readonly<{
    header: Style;
    body: Style;
  }>;
}>;

export function resolveTThinkingViewModel(
  opts: Readonly<{
    w: number;
    title: string;
    content: string;
    collapsed: boolean;
    pulseFrame?: number | null;
    style?: Style;
    headerStyle?: Style;
    markerStyle?: Style;
    titleStyle?: Style;
    bodyStyle?: Style;
  }>,
): TThinkingViewModel {
  const marker = opts.collapsed ? "▸" : "▾";
  const title = pulseTitle(sanitizeInlineText(opts.title), opts.pulseFrame ?? null);
  const headerText = sliceByCells(`${marker} ${title}`, Math.max(1, Math.floor(opts.w)));
  return {
    headerText,
    bodyRows: opts.collapsed ? [] : sanitizeTextBlock(opts.content).split("\n"),
    styles: {
      header: { ...opts.style, ...opts.headerStyle, ...opts.markerStyle, ...opts.titleStyle },
      body: { ...opts.style, ...opts.bodyStyle },
    },
  };
}

function pulseTitle(title: string, frame: number | null): string {
  if (frame == null || title.length === 0) return title;
  const index = Math.abs(Math.floor(frame)) % title.length;
  return `${title.slice(0, index)}${title[index]!.toUpperCase()}${title.slice(index + 1)}`;
}

export type TToolCallViewModel = Readonly<{
  styles: TToolCallViewStyles;
  marker: string;
  suffix: string;
  preview: string;
  previewPrefix: string;
  headerSegments: readonly TToolCallViewSegment[];
  previewSegments: readonly TToolCallViewSegment[];
}>;

export function resolveTToolCallViewModel(
  opts: Readonly<{
    w: number;
    title: string;
    collapsed: boolean;
    selected?: boolean;
    nested?: boolean;
    status?: TToolCallStatus;
    suffix?: string;
    preview?: string;
    markerCollapsed?: string;
    markerExpanded?: string;
    statusDot?: string;
    previewPrefix?: string;
    style?: Style;
    mutedStyle?: Style;
    headerStyle?: Style;
    collapsedStyle?: Style;
    expandedStyle?: Style;
    markerStyle?: Style;
    statusStyle?: Style;
    titleStyle?: Style;
    suffixStyle?: Style;
    previewStyle?: Style;
  }>,
): TToolCallViewModel {
  const width = Math.max(0, Math.floor(opts.w));
  const base = opts.style ?? { fg: "yellowBright", bg: "black" };
  const muted = opts.mutedStyle ?? { fg: "white", bg: base.bg, dim: true };
  const status = opts.status ?? "pending";
  const collapsed = Boolean(opts.collapsed);
  const header = collapsed
    ? mergeStyle(base, { dim: true }, opts.collapsedStyle, opts.headerStyle)
    : mergeStyle(
        base,
        opts.selected ? { bold: true } : undefined,
        opts.expandedStyle,
        opts.headerStyle,
      );
  const markerStyle = opts.markerStyle ? mergeStyle(header, opts.markerStyle) : header;
  const statusStyle = mergeStyle(resolveStatusStyle(status, base, muted), opts.statusStyle);
  const titleStyle = mergeStyle(
    base,
    { dim: false },
    opts.selected ? { bold: true } : undefined,
    opts.titleStyle,
  );
  const suffixStyle = mergeStyle(base, muted, opts.suffixStyle);
  const previewStyle = mergeStyle(base, { dim: true }, opts.previewStyle);
  const styles: TToolCallViewStyles = {
    base,
    header,
    marker: markerStyle,
    status: statusStyle,
    title: titleStyle,
    suffix: suffixStyle,
    preview: previewStyle,
  };

  const segments: TToolCallViewSegment[] = [];
  let x = 0;
  const nestedLead = opts.nested ? "    " : "";
  const marker = collapsed ? (opts.markerCollapsed ?? "▸") : (opts.markerExpanded ?? "▾");
  x = pushToolSegment(segments, "marker", x, `${nestedLead}${marker} `, markerStyle);
  const statusDot = opts.statusDot ?? "●";
  if (statusDot) {
    x = pushToolSegment(segments, "status", x, statusDot, statusStyle);
    x = pushToolSegment(segments, "separator", x, " ", header);
  }
  x = pushToolSegment(
    segments,
    "title",
    x,
    fitText(opts.title, Math.max(0, width - x)),
    titleStyle,
  );
  if (collapsed) {
    pushToolSegment(
      segments,
      "suffix",
      x,
      fitSuffix(opts.suffix ?? "", Math.max(0, width - x)),
      suffixStyle,
    );
  }

  const previewPrefix = `${nestedLead}${opts.previewPrefix ?? "  ⎿ "}`;
  const previewText =
    collapsed && opts.preview
      ? fitText(opts.preview, Math.max(0, width - textCellWidth(previewPrefix)))
      : "";
  const previewSegments: TToolCallViewSegment[] = [];
  if (previewText) {
    let previewX = 0;
    previewX = pushToolSegment(
      previewSegments,
      "preview-prefix",
      previewX,
      previewPrefix,
      previewStyle,
    );
    pushToolSegment(previewSegments, "preview", previewX, previewText, previewStyle);
  }

  return {
    styles,
    marker,
    suffix: segments.find((segment) => segment.role === "suffix")?.text ?? "",
    preview: previewText,
    previewPrefix,
    headerSegments: segments,
    previewSegments,
  };
}

function mergeStyle(base: Style, ...overrides: readonly (Style | undefined)[]): Style {
  let out = base;
  for (const next of overrides) {
    if (next) out = { ...out, ...next };
  }
  return out;
}

function fitText(text: string, width: number): string {
  const safe = sanitizeInlineText(text);
  if (width <= 0) return "";
  if (textCellWidth(safe) <= width) return safe;
  const marker = "…";
  const markerCells = textCellWidth(marker);
  if (width <= markerCells) return sliceByCells(safe, width);
  return `${sliceByCells(safe, width - markerCells)}${marker}`;
}

function fitSuffix(text: string, width: number): string {
  const safe = sanitizeInlineText(text);
  if (!safe || width <= 0) return "";
  const suffix = safe.startsWith(" ") ? safe : ` ${safe}`;
  if (textCellWidth(suffix) <= width) return suffix;
  const prefix = " ";
  const marker = "…";
  const bodyWidth = width - textCellWidth(prefix) - textCellWidth(marker);
  if (bodyWidth <= 0) return "";
  return `${prefix}${sliceByCells(suffix.trimStart(), bodyWidth)}${marker}`;
}

function resolveStatusStyle(status: TToolCallStatus, base: Style, muted: Style): Style {
  if (status === "success") return mergeStyle(base, { fg: "greenBright", bold: true });
  if (status === "error") return mergeStyle(base, { fg: "redBright", bold: true });
  if (status === "warning") return mergeStyle(base, { fg: "yellowBright", bold: true });
  return mergeStyle(base, muted);
}

function pushToolSegment(
  out: TToolCallViewSegment[],
  role: TToolCallViewSegment["role"],
  x: number,
  text: string,
  style: Style,
): number {
  if (!text) return x;
  const cells = textCellWidth(text);
  out.push({ role, x, text, cells, style });
  return x + cells;
}
