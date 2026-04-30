import type { InlineHit, LineInfo, WrappedLineInfo } from "./inlineText.js";
import {
  buildInlineRow as buildInlineRowCore,
  buildInlineSelectionSegments as buildInlineSelectionSegmentsCore,
  countMentionTokens as countMentionTokensCore,
  countMultilineTokens as countMultilineTokensCore,
  indexToLineCellColInline as indexToLineCellColInlineCore,
  indexToWrappedCellColFirstWidthInline as indexToWrappedCellColFirstWidthInlineCore,
  lineCellColToIndexInline as lineCellColToIndexInlineCore,
  mentionIndexAt as mentionIndexAtCore,
  tokenIndexAt as tokenIndexAtCore,
  wrapToLinesFirstWidthInline as wrapToLinesFirstWidthInlineCore,
} from "./inlineText.js";

export const MULTILINE_TOKEN = "\uFFFC";
export const MENTION_TOKEN = "\uFFF9";

export function isMultilineToken(value: string, index: number): boolean {
  return value[index] === MULTILINE_TOKEN;
}

export function isMentionToken(value: string, index: number): boolean {
  return value[index] === MENTION_TOKEN;
}

export function countMultilineTokens(value: string, endIndex = value.length): number {
  return countMultilineTokensCore(value, MULTILINE_TOKEN, endIndex);
}

export function countMentionTokens(value: string, endIndex = value.length): number {
  return countMentionTokensCore(value, MENTION_TOKEN, endIndex);
}

export function tokenIndexAt(value: string, index: number): number {
  return tokenIndexAtCore(value, MULTILINE_TOKEN, index);
}

export function mentionIndexAt(value: string, index: number): number {
  return mentionIndexAtCore(value, MENTION_TOKEN, index);
}

export function wrapToLinesFirstWidthInline(
  value: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  firstWidth: number,
  width: number,
): WrappedLineInfo[] {
  return wrapToLinesFirstWidthInlineCore(
    value,
    MULTILINE_TOKEN,
    MENTION_TOKEN,
    multilineTexts,
    mentions,
    firstWidth,
    width,
  );
}

export function indexToWrappedCellColFirstWidthInline(
  value: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  index: number,
  firstWidth: number,
  width: number,
): { line: number; col: number; lines: WrappedLineInfo[] } {
  return indexToWrappedCellColFirstWidthInlineCore(
    value,
    MULTILINE_TOKEN,
    MENTION_TOKEN,
    multilineTexts,
    mentions,
    index,
    firstWidth,
    width,
  );
}

export function indexToLineCellColInline(
  value: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  index: number,
): { line: number; col: number; lines: LineInfo[] } {
  return indexToLineCellColInlineCore(
    value,
    MULTILINE_TOKEN,
    MENTION_TOKEN,
    multilineTexts,
    mentions,
    index,
  );
}

export function lineCellColToIndexInline(
  value: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  lineStart: number,
  lineEnd: number,
  col: number,
): { index: number; hit: InlineHit | null } {
  return lineCellColToIndexInlineCore(
    value,
    MULTILINE_TOKEN,
    MENTION_TOKEN,
    multilineTexts,
    mentions,
    lineStart,
    lineEnd,
    col,
  );
}

export function wrappedCellColToIndexInline(
  value: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  info: WrappedLineInfo,
  col: number,
): { index: number; hit: InlineHit | null } {
  return lineCellColToIndexInlineCore(
    value,
    MULTILINE_TOKEN,
    MENTION_TOKEN,
    multilineTexts,
    mentions,
    info.start,
    info.end,
    col,
  );
}

export function buildInlineRow(
  value: string,
  displayValue: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  lineStart: number,
  lineEnd: number,
  rowTextW: number,
  offX: number,
): ReturnType<typeof buildInlineRowCore> {
  return buildInlineRowCore(
    value,
    displayValue,
    MULTILINE_TOKEN,
    MENTION_TOKEN,
    multilineTexts,
    mentions,
    lineStart,
    lineEnd,
    rowTextW,
    offX,
  );
}

export function buildInlineSelectionSegments(
  value: string,
  displayValue: string,
  multilineTexts: readonly string[] | undefined,
  mentions: readonly string[] | undefined,
  lineStart: number,
  lineEnd: number,
  selection: Readonly<{ start: number; end: number }>,
  rowTextW: number,
  offX: number,
): ReturnType<typeof buildInlineSelectionSegmentsCore> {
  return buildInlineSelectionSegmentsCore(
    value,
    displayValue,
    MULTILINE_TOKEN,
    MENTION_TOKEN,
    multilineTexts,
    mentions,
    lineStart,
    lineEnd,
    selection,
    rowTextW,
    offX,
  );
}
