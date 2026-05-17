import type {
  TTranscriptAction,
  TTranscriptHitRegion,
  TTranscriptRow,
  TTranscriptSegment,
  TTranscriptVisualRow,
  TTranscriptVisualSegment,
} from "./types.js";
import type { Style } from "../../core/types.js";
import { forEachTextCellSegment, sanitizeInlineText, textCellWidth } from "../utils/text.js";
import { plainTextForTranscriptRow } from "./plain-text.js";

export type TTranscriptRowLayoutOptions = Readonly<{
  row: TTranscriptRow;
  rowIndex: number;
  rowKey: string | number;
  width: number;
  baseStyle: Style;
  hoverRegionId?: string | null;
  focusedRegionId?: string | null;
  hoverStyle?: Style;
  focusStyle?: Style;
  wrap?: boolean;
}>;

function styleForAction(action: TTranscriptAction): Style {
  if (action.style) return action.style;
  if (action.kind === "danger") return { fg: "redBright", bold: true };
  if (action.kind === "primary") return { fg: "cyanBright", bold: true };
  return { fg: "whiteBright" };
}

function mergeStyle(base: Style, next?: Style): Style {
  return next ? { ...base, ...next } : base;
}

function sameVisualSegment(
  segment: TTranscriptVisualSegment | undefined,
  style: Style,
  selectable: boolean | undefined,
  sourceSegmentIndex: number | undefined,
): boolean {
  return (
    Boolean(segment) &&
    segment!.style === style &&
    segment!.selectable === selectable &&
    segment!.sourceSegmentIndex === sourceSegmentIndex
  );
}

function rowSourceSegments(row: TTranscriptRow): readonly TTranscriptSegment[] {
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

export function layoutTranscriptRow(options: TTranscriptRowLayoutOptions): TTranscriptVisualRow[] {
  const width = Math.max(1, Math.floor(options.width));
  const visualRows: Array<{
    rowIndex: number;
    rowKey: string | number;
    partIndex: number;
    startCell: number;
    segments: TTranscriptVisualSegment[];
    hitRegions: TTranscriptHitRegion[];
    selectableText?: string;
    text: string;
  }> = [];
  let current = createVisualRow(0, 0);
  let x = 0;
  let absoluteCell = 0;

  function createVisualRow(partIndex: number, startCell: number) {
    return {
      rowIndex: options.rowIndex,
      rowKey: options.rowKey,
      partIndex,
      startCell,
      segments: [] as TTranscriptVisualSegment[],
      hitRegions: [] as TTranscriptHitRegion[],
      selectableText: undefined as string | undefined,
      text: "",
    };
  }

  function pushCurrentIfNeeded(force = false): void {
    if (!force && !current.segments.length && !current.hitRegions.length) return;
    current.selectableText = plainTextForTranscriptRow(options.row);
    visualRows.push(current);
    current = createVisualRow(visualRows.length, absoluteCell);
    x = 0;
  }

  function appendPiece(
    text: string,
    cells: number,
    style: Style,
    selectable: boolean | undefined,
    sourceSegmentIndex: number | undefined,
    region?: Omit<TTranscriptHitRegion, "x0" | "x1" | "visualRow">,
  ): void {
    if (cells <= 0 || !text) return;
    if (options.wrap !== false && x > 0 && x + cells > width) pushCurrentIfNeeded(true);
    const clippedCells = cells;

    const last = current.segments[current.segments.length - 1];
    if (sameVisualSegment(last, style, selectable, sourceSegmentIndex)) {
      current.segments[current.segments.length - 1] = {
        ...last!,
        text: `${last!.text}${text}`,
        cells: last!.cells + clippedCells,
      };
    } else {
      current.segments.push({ text, cells: clippedCells, style, selectable, sourceSegmentIndex });
    }
    if (region) {
      current.hitRegions.push({
        ...region,
        visualRow: current.partIndex,
        x0: x,
        x1: x + clippedCells,
      });
    }
    current.text += text;
    x += clippedCells;
    absoluteCell += clippedCells;
    if (options.wrap !== false && x >= width) pushCurrentIfNeeded(true);
  }

  function appendTextSegment(segment: TTranscriptSegment, sourceSegmentIndex: number): void {
    const raw = sanitizeInlineText(segment.text);
    if (!raw) return;
    const style = mergeStyle(options.baseStyle, segment.style);
    const regionBase =
      segment.href != null
        ? {
            id: segment.tokenId ?? `link:${options.rowKey}:${sourceSegmentIndex}`,
            kind: "link" as const,
            rowIndex: options.rowIndex,
            payload: { href: segment.href, segment, row: options.row },
            hoverStyle: options.hoverStyle,
            focusStyle: options.focusStyle,
          }
        : undefined;
    const activeStyle =
      regionBase?.id && regionBase.id === options.focusedRegionId
        ? mergeStyle(style, regionBase.focusStyle ?? options.focusStyle)
        : regionBase?.id && regionBase.id === options.hoverRegionId
          ? mergeStyle(style, regionBase.hoverStyle ?? options.hoverStyle)
          : style;

    if (options.wrap === false) {
      const cells = textCellWidth(raw);
      appendPiece(raw, cells, activeStyle, segment.selectable, sourceSegmentIndex, regionBase);
      return;
    }

    forEachTextCellSegment(raw, (piece) => {
      appendPiece(
        piece.text,
        piece.cells,
        activeStyle,
        segment.selectable,
        sourceSegmentIndex,
        regionBase,
      );
    });
  }

  function appendAction(action: TTranscriptAction): void {
    if (x > 0) appendPiece(" ", 1, options.baseStyle, false, undefined);
    const text = sanitizeInlineText(`[${action.label}]`);
    const baseStyle = mergeStyle(options.baseStyle, styleForAction(action));
    const regionBase = {
      id: action.id,
      kind: "action" as const,
      rowIndex: options.rowIndex,
      payload: { action, row: options.row },
      hoverStyle: action.hoverStyle ?? options.hoverStyle,
      focusStyle: action.focusStyle ?? options.focusStyle,
    };
    const activeStyle =
      action.id === options.focusedRegionId
        ? mergeStyle(baseStyle, regionBase.focusStyle)
        : action.id === options.hoverRegionId
          ? mergeStyle(baseStyle, regionBase.hoverStyle)
          : baseStyle;
    appendPiece(text, textCellWidth(text), activeStyle, false, undefined, regionBase);
  }

  const segments = rowSourceSegments(options.row);
  for (let i = 0; i < segments.length; i++) appendTextSegment(segments[i]!, i);
  if ("actions" in options.row) {
    for (const action of options.row.actions ?? []) appendAction(action);
  }
  pushCurrentIfNeeded(true);
  return visualRows.length ? visualRows : [createVisualRow(0, 0)];
}

export function layoutTranscriptRows(
  rows: readonly TTranscriptRow[],
  options: Omit<TTranscriptRowLayoutOptions, "row" | "rowIndex" | "rowKey">,
): TTranscriptVisualRow[] {
  const out: TTranscriptVisualRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    out.push(...layoutTranscriptRow({ ...options, row, rowIndex: i, rowKey: row.key }));
  }
  return out;
}
