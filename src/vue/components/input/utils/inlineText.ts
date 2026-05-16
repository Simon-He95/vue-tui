import {
  forEachTextCellSegment,
  hasTextWidthAsciiFastPath,
  textCellWidth as baseTextCellWidth,
  spaces,
} from "../../../utils/text.js";
import { mentionLabelFromAbsPath } from "../plugins/mentionUtils.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

export const textCellWidth = baseTextCellWidth;

export function padEndByCells(text: string, width: number): string {
  const cells = textCellWidth(text);
  if (cells >= width) return text;
  return text + spaces(width - cells);
}

export function sliceByCellsWindow(text: string, startCell: number, width: number): string {
  startCell = Math.max(0, Math.floor(startCell));
  width = Math.max(0, Math.floor(width));
  if (width <= 0) return "";
  if (!text) return "";
  if (hasTextWidthAsciiFastPath() && isAscii(text)) return text.slice(startCell, startCell + width);
  let out = "";
  let skipped = 0;
  let used = 0;
  forEachTextCellSegment(text, (segment) => {
    const seg = segment.text;
    const w = segment.cells;
    if (skipped + w <= startCell) {
      skipped += w;
      return;
    }
    if (used + w > width) return false;
    out += seg;
    used += w;
    return undefined;
  });
  return out;
}

export type LineInfo = Readonly<{
  start: number;
  end: number; // exclusive, without '\n'
}>;

export type WrappedLineInfo = Readonly<{
  start: number;
  end: number; // exclusive, without '\n'
}>;

export function computeLines(value: string): LineInfo[] {
  const lines: LineInfo[] = [];
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    if (i === value.length || value[i] === "\n") {
      lines.push({ start, end: i });
      start = i + 1;
    }
  }
  return lines.length ? lines : [{ start: 0, end: 0 }];
}

function tokenLabelAt(multilineTexts: readonly string[] | undefined, tokenIndex: number): string {
  const text = String(multilineTexts?.[tokenIndex] ?? "");
  const lineCount = (text.match(/\n/g) || []).length + 1;
  return `[... ${lineCount} lines]`;
}

function mentionLabelAt(mentions: readonly string[] | undefined, mentionIndex: number): string {
  const absPath = String(mentions?.[mentionIndex] ?? "");
  return mentionLabelFromAbsPath(absPath, { index: mentionIndex });
}

function countTokens(value: string, token: string, endIndex = value.length): number {
  let count = 0;
  const limit = clamp(endIndex, 0, value.length);
  for (let i = 0; i < limit; i++) {
    if (value[i] === token) count++;
  }
  return count;
}

type InlineUnit = Readonly<
  | {
      kind: "text";
      text: string;
      start: number;
      end: number;
      cells: number;
    }
  | {
      kind: "multiline" | "mention";
      text: string;
      start: number;
      end: number;
      cells: number;
      index: number;
      absPath?: string;
    }
>;

function nextInlineBoundary(
  value: string,
  multilineToken: string,
  mentionToken: string,
  start: number,
  end: number,
): number {
  let next = end;
  const newline = value.indexOf("\n", start);
  if (newline >= 0 && newline < next) next = newline;
  const multiline = value.indexOf(multilineToken, start);
  if (multiline >= 0 && multiline < next) next = multiline;
  const mention = value.indexOf(mentionToken, start);
  if (mention >= 0 && mention < next) next = mention;
  return next;
}

function forEachInlineUnit(
  value: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  start: number,
  end: number,
  cb: (unit: InlineUnit) => void | false,
): void {
  const safeStart = clamp(start, 0, value.length);
  const safeEnd = clamp(end, safeStart, value.length);
  let tokenIndex = countMultilineTokens(value, multilineToken, safeStart);
  let mentionIndex = countMentionTokens(value, mentionToken, safeStart);

  for (let i = safeStart; i < safeEnd; ) {
    const ch = value[i]!;
    if (ch === multilineToken) {
      const label = tokenLabelAt(multilineTexts, tokenIndex);
      const result = cb({
        kind: "multiline",
        text: label,
        start: i,
        end: i + 1,
        cells: baseTextCellWidth(label),
        index: tokenIndex,
      });
      tokenIndex++;
      if (result === false) return;
      i += 1;
      continue;
    }
    if (ch === mentionToken) {
      const absPath = String(mentions?.[mentionIndex] ?? "");
      const label = mentionLabelAt(mentions, mentionIndex);
      const result = cb({
        kind: "mention",
        text: label,
        start: i,
        end: i + 1,
        cells: baseTextCellWidth(label),
        index: mentionIndex,
        ...(absPath ? { absPath } : {}),
      });
      mentionIndex++;
      if (result === false) return;
      i += 1;
      continue;
    }

    const next = nextInlineBoundary(value, multilineToken, mentionToken, i, safeEnd);
    if (next === i) {
      const result = cb({
        kind: "text",
        text: value[i]!,
        start: i,
        end: i + 1,
        cells: baseTextCellWidth(value[i]!),
      });
      if (result === false) return;
      i += 1;
      continue;
    }

    let stopped = false;
    const chunkStart = i;
    forEachTextCellSegment(value.slice(chunkStart, next), (segment) => {
      const result = cb({
        kind: "text",
        text: segment.text,
        start: chunkStart + segment.start,
        end: chunkStart + segment.end,
        cells: segment.cells,
      });
      if (result === false) {
        stopped = true;
        return false;
      }
      return undefined;
    });
    if (stopped) return;
    i = next;
  }
}

export function countMultilineTokens(
  value: string,
  multilineToken: string,
  endIndex = value.length,
): number {
  return countTokens(value, multilineToken, endIndex);
}

export function countMentionTokens(
  value: string,
  mentionToken: string,
  endIndex = value.length,
): number {
  return countTokens(value, mentionToken, endIndex);
}

export function tokenIndexAt(value: string, multilineToken: string, index: number): number {
  return countMultilineTokens(value, multilineToken, index);
}

export function mentionIndexAt(value: string, mentionToken: string, index: number): number {
  return countMentionTokens(value, mentionToken, index);
}

export function textCellWidthInline(
  value: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  start: number,
  end: number,
): number {
  const safeStart = clamp(start, 0, value.length);
  const safeEnd = clamp(end, safeStart, value.length);
  let cells = 0;
  forEachInlineUnit(
    value,
    multilineToken,
    mentionToken,
    multilineTexts,
    mentions,
    0,
    safeEnd,
    (unit) => {
      if (unit.end > safeStart) cells += unit.cells;
    },
  );
  return cells;
}

export function wrapToLinesInline(
  value: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  width: number,
): WrappedLineInfo[] {
  width = Math.max(1, Math.floor(width));
  const out: WrappedLineInfo[] = [];
  let start = 0;
  let cells = 0;

  forEachInlineUnit(
    value,
    multilineToken,
    mentionToken,
    multilineTexts,
    mentions,
    0,
    value.length,
    (unit) => {
      if (unit.kind === "text" && unit.text === "\n") {
        out.push({ start, end: unit.start });
        start = unit.end;
        cells = 0;
        return;
      }

      const w = unit.cells;
      if (cells > 0 && cells + w > width) {
        out.push({ start, end: unit.start });
        start = unit.start;
        cells = 0;
      }

      cells += w;

      if (cells >= width) {
        out.push({ start, end: unit.end });
        start = unit.end;
        cells = 0;
      }
    },
  );

  out.push({ start, end: value.length });
  return out.length ? out : [{ start: 0, end: 0 }];
}

export function wrapToLinesFirstWidthInline(
  value: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  firstWidth: number,
  width: number,
): WrappedLineInfo[] {
  firstWidth = Math.max(1, Math.floor(firstWidth));
  width = Math.max(1, Math.floor(width));
  if (firstWidth >= width) {
    return wrapToLinesInline(value, multilineToken, mentionToken, multilineTexts, mentions, width);
  }

  const out: WrappedLineInfo[] = [];
  let start = 0;
  let cells = 0;
  let currentWidth = firstWidth;
  let isFirstLine = true;

  forEachInlineUnit(
    value,
    multilineToken,
    mentionToken,
    multilineTexts,
    mentions,
    0,
    value.length,
    (unit) => {
      if (unit.kind === "text" && unit.text === "\n") {
        out.push({ start, end: unit.start });
        start = unit.end;
        cells = 0;
        isFirstLine = false;
        currentWidth = width;
        return;
      }

      const w = unit.cells;
      if (cells > 0 && cells + w > currentWidth) {
        out.push({ start, end: unit.start });
        start = unit.start;
        cells = 0;
        if (isFirstLine) {
          isFirstLine = false;
          currentWidth = width;
        }
      }

      cells += w;

      if (cells >= currentWidth) {
        out.push({ start, end: unit.end });
        start = unit.end;
        cells = 0;
        if (isFirstLine) {
          isFirstLine = false;
          currentWidth = width;
        }
      }
    },
  );

  out.push({ start, end: value.length });
  return out.length ? out : [{ start: 0, end: 0 }];
}

export function indexToWrappedCellColFirstWidthInline(
  value: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  index: number,
  firstWidth: number,
  width: number,
): { line: number; col: number; lines: WrappedLineInfo[] } {
  const safe = clamp(index, 0, value.length);
  const lines = wrapToLinesFirstWidthInline(
    value,
    multilineToken,
    mentionToken,
    multilineTexts,
    mentions,
    firstWidth,
    width,
  );
  for (let i = 0; i < lines.length; i++) {
    const info = lines[i]!;
    if (safe <= info.end) {
      const col = textCellWidthInline(
        value,
        multilineToken,
        mentionToken,
        multilineTexts,
        mentions,
        info.start,
        safe,
      );
      return { line: i, col, lines };
    }
  }
  const last = lines[lines.length - 1]!;
  return {
    line: lines.length - 1,
    col: textCellWidthInline(
      value,
      multilineToken,
      mentionToken,
      multilineTexts,
      mentions,
      last.start,
      last.end,
    ),
    lines,
  };
}

export function indexToLineCellColInline(
  value: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  index: number,
): { line: number; col: number; lines: LineInfo[] } {
  const safe = clamp(index, 0, value.length);
  const lines = computeLines(value);
  for (let i = 0; i < lines.length; i++) {
    const info = lines[i]!;
    if (safe <= info.end) {
      const col = textCellWidthInline(
        value,
        multilineToken,
        mentionToken,
        multilineTexts,
        mentions,
        info.start,
        safe,
      );
      return { line: i, col, lines };
    }
  }
  const last = lines[lines.length - 1]!;
  return {
    line: lines.length - 1,
    col: textCellWidthInline(
      value,
      multilineToken,
      mentionToken,
      multilineTexts,
      mentions,
      last.start,
      last.end,
    ),
    lines,
  };
}

export type InlineHit = Readonly<{
  kind: "multiline" | "mention";
  index: number;
}>;

export function lineCellColToIndexInline(
  value: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  lineStart: number,
  lineEnd: number,
  col: number,
): { index: number; hit: InlineHit | null } {
  const target = Math.max(0, Math.floor(col));
  let cells = 0;
  let result: { index: number; hit: InlineHit | null } | null = null;
  forEachInlineUnit(
    value,
    multilineToken,
    mentionToken,
    multilineTexts,
    mentions,
    lineStart,
    lineEnd,
    (unit) => {
      if (unit.kind === "text" && unit.text === "\n") return;
      const w = unit.cells;
      if (cells + w > target) {
        result = {
          index: unit.start,
          hit: unit.kind === "text" ? null : { kind: unit.kind, index: unit.index },
        };
        return false;
      }
      cells += w;
      if (cells >= target) {
        result = { index: unit.end, hit: null };
        return false;
      }
      return undefined;
    },
  );
  return result ?? { index: lineEnd, hit: null };
}

export type InlineChipRender = Readonly<{
  startCell: number;
  label: string;
  kind: "multiline" | "mention";
  index: number;
  absPath?: string;
}>;

export function buildInlineRow(
  value: string,
  displayValue: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  lineStart: number,
  lineEnd: number,
  rowTextW: number,
  offX: number,
): { text: string; chips: InlineChipRender[] } {
  const windowStart = Math.max(0, Math.floor(offX));
  const windowEnd = windowStart + Math.max(0, Math.floor(rowTextW));
  let cells = 0;
  let out = "";
  let outCells = 0;
  const chips: InlineChipRender[] = [];

  forEachInlineUnit(
    value,
    multilineToken,
    mentionToken,
    multilineTexts,
    mentions,
    lineStart,
    lineEnd,
    (unit) => {
      if (unit.kind === "text" && unit.text === "\n") return;
      const seg = unit.kind === "text" ? displayValue.slice(unit.start, unit.end) : unit.text;
      const w = unit.kind === "text" ? baseTextCellWidth(seg) : unit.cells;

      const unitStart = cells;
      const unitEnd = cells + w;
      if (unitEnd <= windowStart) {
        cells = unitEnd;
        return;
      }
      if (unitStart >= windowEnd) return false;

      const visibleStart = Math.max(0, windowStart - unitStart);
      const visibleCells = Math.min(unitEnd, windowEnd) - Math.max(unitStart, windowStart);
      if (visibleCells > 0) {
        let visibleText = sliceByCellsWindow(seg, visibleStart, visibleCells);
        if (!visibleText && w > 1 && visibleStart > 0 && w <= rowTextW) visibleText = seg;

        out += visibleText;
        if (visibleText === seg) outCells += w;
        else outCells += visibleCells;
        if (unit.kind !== "text") {
          const chipStart = Math.max(unitStart, windowStart) - windowStart;
          chips.push({
            startCell: chipStart,
            label: visibleText,
            kind: unit.kind,
            index: unit.index,
            ...(unit.absPath ? { absPath: unit.absPath } : {}),
          });
        }
      }

      cells = unitEnd;
      return undefined;
    },
  );

  if (outCells < rowTextW) out += spaces(rowTextW - outCells);

  return { text: out, chips };
}

export type InlineSelectionSegment = Readonly<{
  startCell: number;
  text: string;
}>;

export function buildInlineSelectionSegments(
  value: string,
  displayValue: string,
  multilineToken: string,
  mentionToken: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  lineStart: number,
  lineEnd: number,
  selection: Readonly<{ start: number; end: number }>,
  rowTextW: number,
  offX: number,
): InlineSelectionSegment[] {
  const windowStart = Math.max(0, Math.floor(offX));
  const windowEnd = windowStart + Math.max(0, Math.floor(rowTextW));
  let cells = 0;
  const segments: InlineSelectionSegment[] = [];

  forEachInlineUnit(
    value,
    multilineToken,
    mentionToken,
    multilineTexts,
    mentions,
    lineStart,
    lineEnd,
    (unit) => {
      if (unit.kind === "text" && unit.text === "\n") return;
      const seg = unit.kind === "text" ? displayValue.slice(unit.start, unit.end) : unit.text;
      const w = unit.kind === "text" ? baseTextCellWidth(seg) : unit.cells;

      if (unit.start >= selection.end || unit.end <= selection.start) {
        cells += w;
        return;
      }

      const unitStart = cells;
      const unitEnd = cells + w;
      const visibleStart = Math.max(0, windowStart - unitStart);
      const visibleCells = Math.min(unitEnd, windowEnd) - Math.max(unitStart, windowStart);
      const inWindow = unitEnd > windowStart && unitStart < windowEnd;
      if (inWindow && visibleCells > 0) {
        const visibleText = sliceByCellsWindow(seg, visibleStart, visibleCells);
        const segStartCell = Math.max(unitStart, windowStart) - windowStart;
        if (visibleText) segments.push({ startCell: segStartCell, text: visibleText });
      }

      cells = unitEnd;
      return undefined;
    },
  );

  return segments;
}
