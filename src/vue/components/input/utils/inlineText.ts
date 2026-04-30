import { charCellWidth } from "../../../../core/buffer/width.js";
import { textCellWidth as baseTextCellWidth, spaces } from "../../../utils/text.js";
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
  if (isAscii(text)) return text.slice(startCell, startCell + width);
  let out = "";
  let skipped = 0;
  let used = 0;
  for (let i = 0; i < text.length; ) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) {
      if (skipped < startCell) {
        skipped++;
        i++;
        continue;
      }
      if (used >= width) break;
      out += text[i]!;
      used++;
      i++;
      continue;
    }
    const cp = text.codePointAt(i) ?? 0;
    const seg = String.fromCodePoint(cp);
    const w = charCellWidth(seg);
    if (skipped + w <= startCell) {
      skipped += w;
      i += seg.length;
      continue;
    }
    if (used + w > width) break;
    out += seg;
    used += w;
    i += seg.length;
  }
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
  let tokenIndex = 0;
  let mentionIndex = 0;
  for (let i = 0; i < safeEnd; ) {
    const ch = value[i]!;
    if (ch === multilineToken) {
      if (i >= safeStart) {
        const label = tokenLabelAt(multilineTexts, tokenIndex);
        cells += baseTextCellWidth(label);
      }
      tokenIndex++;
      i += 1;
      continue;
    }
    if (ch === mentionToken) {
      if (i >= safeStart) {
        const label = mentionLabelAt(mentions, mentionIndex);
        cells += baseTextCellWidth(label);
      }
      mentionIndex++;
      i += 1;
      continue;
    }
    const code = value.charCodeAt(i);
    if (code <= 0x7f) {
      if (i >= safeStart) cells += 1;
      i += 1;
      continue;
    }
    const cp = value.codePointAt(i) ?? 0;
    const seg = String.fromCodePoint(cp);
    if (i >= safeStart) cells += charCellWidth(seg);
    i += seg.length;
  }
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
  let tokenIndex = 0;
  let mentionIndex = 0;

  for (let i = 0; i < value.length; ) {
    const ch = value[i]!;
    if (ch === "\n") {
      out.push({ start, end: i });
      i += 1;
      start = i;
      cells = 0;
      continue;
    }

    let segLen = 0;
    let w = 0;
    if (ch === multilineToken) {
      const label = tokenLabelAt(multilineTexts, tokenIndex);
      w = baseTextCellWidth(label);
      segLen = 1;
      tokenIndex++;
    } else if (ch === mentionToken) {
      const label = mentionLabelAt(mentions, mentionIndex);
      w = baseTextCellWidth(label);
      segLen = 1;
      mentionIndex++;
    } else {
      const code = value.charCodeAt(i);
      if (code <= 0x7f) {
        segLen = 1;
        w = 1;
      } else {
        const cp = value.codePointAt(i) ?? 0;
        const seg = String.fromCodePoint(cp);
        segLen = seg.length;
        w = charCellWidth(seg);
      }
    }

    if (cells > 0 && cells + w > width) {
      out.push({ start, end: i });
      start = i;
      cells = 0;
    }

    cells += w;
    i += segLen;

    if (cells >= width) {
      out.push({ start, end: i });
      start = i;
      cells = 0;
    }
  }

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
  let tokenIndex = 0;
  let mentionIndex = 0;

  for (let i = 0; i < value.length; ) {
    const ch = value[i]!;
    if (ch === "\n") {
      out.push({ start, end: i });
      i += 1;
      start = i;
      cells = 0;
      isFirstLine = false;
      currentWidth = width;
      continue;
    }

    let segLen = 0;
    let w = 0;
    if (ch === multilineToken) {
      const label = tokenLabelAt(multilineTexts, tokenIndex);
      w = baseTextCellWidth(label);
      segLen = 1;
      tokenIndex++;
    } else if (ch === mentionToken) {
      const label = mentionLabelAt(mentions, mentionIndex);
      w = baseTextCellWidth(label);
      segLen = 1;
      mentionIndex++;
    } else {
      const code = value.charCodeAt(i);
      if (code <= 0x7f) {
        segLen = 1;
        w = 1;
      } else {
        const cp = value.codePointAt(i) ?? 0;
        const seg = String.fromCodePoint(cp);
        segLen = seg.length;
        w = charCellWidth(seg);
      }
    }

    if (cells > 0 && cells + w > currentWidth) {
      out.push({ start, end: i });
      start = i;
      cells = 0;
      if (isFirstLine) {
        isFirstLine = false;
        currentWidth = width;
      }
      continue;
    }

    cells += w;
    i += segLen;

    if (cells >= currentWidth) {
      out.push({ start, end: i });
      start = i;
      cells = 0;
      if (isFirstLine) {
        isFirstLine = false;
        currentWidth = width;
      }
    }
  }

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
  let tokenIndex = countMultilineTokens(value, multilineToken, lineStart);
  let mentionIndex = countMentionTokens(value, mentionToken, lineStart);
  for (let i = lineStart; i < lineEnd; ) {
    const ch = value[i]!;
    if (ch === multilineToken) {
      const label = tokenLabelAt(multilineTexts, tokenIndex);
      const w = baseTextCellWidth(label);
      if (cells + w > target) return { index: i, hit: { kind: "multiline", index: tokenIndex } };
      cells += w;
      if (cells >= target) return { index: i + 1, hit: null };
      tokenIndex++;
      i += 1;
      continue;
    }
    if (ch === mentionToken) {
      const label = mentionLabelAt(mentions, mentionIndex);
      const w = baseTextCellWidth(label);
      if (cells + w > target) return { index: i, hit: { kind: "mention", index: mentionIndex } };
      cells += w;
      if (cells >= target) return { index: i + 1, hit: null };
      mentionIndex++;
      i += 1;
      continue;
    }
    const code = value.charCodeAt(i);
    if (code <= 0x7f) {
      if (cells + 1 > target) return { index: i, hit: null };
      cells += 1;
      i += 1;
      if (cells >= target) return { index: i, hit: null };
      continue;
    }
    const cp = value.codePointAt(i) ?? 0;
    const seg = String.fromCodePoint(cp);
    const w = charCellWidth(seg);
    if (cells + w > target) return { index: i, hit: null };
    cells += w;
    i += seg.length;
    if (cells >= target) return { index: i, hit: null };
  }
  return { index: lineEnd, hit: null };
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
  let tokenIndex = countMultilineTokens(value, multilineToken, lineStart);
  let mentionIndex = countMentionTokens(value, mentionToken, lineStart);
  let out = "";
  let outCells = 0;
  const chips: InlineChipRender[] = [];

  for (let i = lineStart; i < lineEnd; ) {
    const ch = value[i]!;
    if (ch === "\n") {
      i += 1;
      continue;
    }

    let seg = "";
    let w = 0;
    let segLen = 0;
    let isToken = false;
    let tokenKind: InlineChipRender["kind"] | null = null;
    let token = 0;
    let tokenAbsPath: string | undefined;
    if (ch === multilineToken) {
      seg = tokenLabelAt(multilineTexts, tokenIndex);
      w = baseTextCellWidth(seg);
      segLen = 1;
      tokenKind = "multiline";
      token = tokenIndex;
      tokenIndex++;
      isToken = true;
    } else if (ch === mentionToken) {
      seg = mentionLabelAt(mentions, mentionIndex);
      w = baseTextCellWidth(seg);
      segLen = 1;
      tokenKind = "mention";
      token = mentionIndex;
      tokenAbsPath = String(mentions?.[mentionIndex] ?? "");
      mentionIndex++;
      isToken = true;
    } else {
      const code = value.charCodeAt(i);
      if (code <= 0x7f) {
        seg = displayValue[i] ?? value[i]!;
        segLen = 1;
        w = 1;
      } else {
        const cp = value.codePointAt(i) ?? 0;
        const rawSeg = String.fromCodePoint(cp);
        seg = displayValue.slice(i, i + rawSeg.length);
        segLen = rawSeg.length;
        w = charCellWidth(seg);
      }
    }

    const unitStart = cells;
    const unitEnd = cells + w;
    if (unitEnd <= windowStart) {
      cells = unitEnd;
      i += segLen;
      continue;
    }
    if (unitStart >= windowEnd) break;

    const visibleStart = Math.max(0, windowStart - unitStart);
    const visibleCells = Math.min(unitEnd, windowEnd) - Math.max(unitStart, windowStart);
    if (visibleCells > 0) {
      let visibleText = sliceByCellsWindow(seg, visibleStart, visibleCells);
      if (!visibleText && w > 1 && visibleStart > 0 && w <= rowTextW) visibleText = seg;

      out += visibleText;
      if (visibleText === seg) outCells += w;
      else outCells += visibleCells;
      if (isToken) {
        const chipStart = Math.max(unitStart, windowStart) - windowStart;
        chips.push({
          startCell: chipStart,
          label: visibleText,
          kind: tokenKind!,
          index: token,
          ...(tokenAbsPath ? { absPath: tokenAbsPath } : {}),
        });
      }
    }

    cells = unitEnd;
    i += segLen;
  }

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
  let tokenIndex = countMultilineTokens(value, multilineToken, lineStart);
  let mentionIndex = countMentionTokens(value, mentionToken, lineStart);
  const segments: InlineSelectionSegment[] = [];

  for (let i = lineStart; i < lineEnd; ) {
    const ch = value[i]!;
    if (ch === "\n") {
      i += 1;
      continue;
    }

    let seg = "";
    let w = 0;
    let segLen = 0;
    if (ch === multilineToken) {
      seg = tokenLabelAt(multilineTexts, tokenIndex);
      w = textCellWidth(seg);
      segLen = 1;
      tokenIndex++;
    } else if (ch === mentionToken) {
      seg = mentionLabelAt(mentions, mentionIndex);
      w = textCellWidth(seg);
      segLen = 1;
      mentionIndex++;
    } else {
      const cp = value.codePointAt(i) ?? 0;
      const rawSeg = String.fromCodePoint(cp);
      seg = displayValue.slice(i, i + rawSeg.length);
      segLen = rawSeg.length;
      w = charCellWidth(seg);
    }

    if (i >= selection.end || i + segLen <= selection.start) {
      cells += w;
      i += segLen;
      continue;
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
    i += segLen;
  }

  return segments;
}
