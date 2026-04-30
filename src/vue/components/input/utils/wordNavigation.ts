import { clamp, isWhitespace, isWordChar } from "./primitives.js";

export function findWordLeft(text: string, index: number): number {
  let i = clamp(index, 0, text.length);
  if (i === 0) return 0;
  while (i > 0 && isWhitespace(text[i - 1]!)) i--;
  if (i === 0) return 0;
  const kindWord = isWordChar(text[i - 1]!);
  while (i > 0) {
    const ch = text[i - 1]!;
    if (isWhitespace(ch)) break;
    if (isWordChar(ch) !== kindWord) break;
    i--;
  }
  return i;
}

export function findWordRight(text: string, index: number): number {
  let i = clamp(index, 0, text.length);
  if (i >= text.length) return text.length;
  while (i < text.length && isWhitespace(text[i]!)) i++;
  if (i >= text.length) return text.length;
  const kindWord = isWordChar(text[i]!);
  while (i < text.length) {
    const ch = text[i]!;
    if (isWhitespace(ch)) break;
    if (isWordChar(ch) !== kindWord) break;
    i++;
  }
  return i;
}

export function tokenRangeAt(value: string, index: number): { start: number; end: number } | null {
  if (!value) return null;
  let i = clamp(index, 0, value.length);
  if (i === value.length) i = value.length - 1;
  if (i < 0) return null;

  const ch0 = value[i];
  if (!ch0) return null;

  let start = i;
  let end = i + 1;

  if (isWhitespace(ch0)) {
    while (start > 0 && isWhitespace(value[start - 1]!)) start--;
    while (end < value.length && isWhitespace(value[end]!)) end++;
    return { start, end };
  }

  const kindWord = isWordChar(ch0);
  while (start > 0) {
    const ch = value[start - 1]!;
    if (isWhitespace(ch)) break;
    if (isWordChar(ch) !== kindWord) break;
    start--;
  }
  while (end < value.length) {
    const ch = value[end]!;
    if (isWhitespace(ch)) break;
    if (isWordChar(ch) !== kindWord) break;
    end++;
  }
  return { start, end };
}
