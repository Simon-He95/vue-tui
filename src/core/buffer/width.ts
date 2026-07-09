import { fullWidthRanges, ambiguousWidthRanges } from './eaw-ranges-unicode-17.js';

export type CellWidth = 1 | 2;
export type BuiltinWidthProvider = "default" | "cjk" | "narrow-ambiguous";
export type WidthProvider = BuiltinWidthProvider | ((text: string) => CellWidth);

function isFullWidthCodePoint(codePoint: number): boolean {
  // Unicode 17.0.0: supplementary plane CJK (Planes 2-3) are wide
  // Quick reject only for code points below first range
  if (codePoint < 0x1100) return false;
  // Ranges are sorted — exit as soon as we pass the candidate
  for (const [start, end] of fullWidthRanges) {
    if (codePoint < start) return false;
    if (codePoint <= end) return true;
  }
  return false;
}

function isAmbiguousWidthCodePoint(codePoint: number): boolean {
  if (codePoint < 0x00a1 || codePoint > 0xfffd) return false;
  for (const [start, end] of ambiguousWidthRanges) {
    if (codePoint < start) return false;
    if (codePoint <= end) return true;
  }
  return false;
}

function isVariationSelectorCodePoint(codePoint: number): boolean {
  // Variation Selectors block (U+FE00-U+FE0F) and Variation Selectors Supplement (U+E0100-U+E01EF)
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function isCombiningMarkCodePoint(codePoint: number): boolean {
  // Common combining mark ranges
  // UAX #11 notes that EAW for combining marks doesn't equal advance width
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) || // Combining Diacritical Marks
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) || // Combining Diacritical Marks Extended
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) || // Combining Diacritical Marks Supplement
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) || // Combining Diacritical Marks for Symbols
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)    // Combining Half Marks
  );
}

function isEmojiLike(codePoint: number): boolean {
  // Basic heuristic; we also have an Extended_Pictographic check in charCellWidth.
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) || (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)
  );
}

let extendedPictographicRe: RegExp | null = null;
try {
  // eslint-disable-next-line prefer-regex-literals
  extendedPictographicRe = new RegExp("\\p{Extended_Pictographic}", "u");
} catch {
  extendedPictographicRe = null;
}

let emojiPresentationRe: RegExp | null = null;
try {
  // eslint-disable-next-line prefer-regex-literals
  emojiPresentationRe = new RegExp("\\p{Emoji_Presentation}", "u");
} catch {
  emojiPresentationRe = null;
}

let emojiRe: RegExp | null = null;
try {
  // eslint-disable-next-line prefer-regex-literals
  emojiRe = new RegExp("\\p{Emoji}", "u");
} catch {
  emojiRe = null;
}

function normalizeCustomWidth(width: CellWidth): CellWidth {
  return width === 2 ? 2 : 1;
}

export function charCellWidth(text: string, provider: WidthProvider = "default"): CellWidth {
  if (!text) return 1;

  if (typeof provider === "function") return normalizeCustomWidth(provider(text));

  // Fast path: single BMP character below all full-width / emoji ranges.
  // Covers ASCII, Latin Extended, Greek, Cyrillic, Arabic, Thai, etc.
  // Skips all expensive regex checks.
  if (provider !== "cjk" && text.length === 1) {
    const code = text.charCodeAt(0);
    if (code < 0x1100) return 1;
  }

  const codePoint = text.codePointAt(0);
  if (codePoint == null) return 1;

  // Prefer explicit emoji presentation when available.
  // Many terminals render BMP pictographs (e.g. U+23F1 ⏱) as narrow unless followed by VS16 (U+FE0F).
  // If we treat them as wide unconditionally, the buffer will insert continuation cells (gaps) and
  // borders/layout will appear shifted.
  const hasVs16 = text.includes("\uFE0F");

  if (isFullWidthCodePoint(codePoint)) return 2;

  // Terminal tailoring: Box Drawing (U+2500-U+257F) remains narrow in all modes
  // Even though they are classified as Ambiguous in Unicode EAW
  if (codePoint >= 0x2500 && codePoint <= 0x257F) return 1;

  // Terminal/grapheme tailoring: Variation selectors and combining marks
  // UAX #11 notes that EAW for combining marks doesn't equal advance width
  // These should remain narrow (width 1) even in cjk mode
  if (isVariationSelectorCodePoint(codePoint) || isCombiningMarkCodePoint(codePoint)) {
    return 1;
  }

  if (provider === "cjk" && isAmbiguousWidthCodePoint(codePoint)) return 2;

  if (isEmojiLike(codePoint)) return 2;

  // Some BMP symbols (e.g. ✅ U+2705) have default emoji presentation even without VS16 in the string.
  // Treat these as wide to match most terminals and avoid layout drift in bordered UI (dialogs, boxes).
  if (emojiPresentationRe?.test(text)) return 2;

  // Keycap emoji sequences (e.g. 1️⃣, #️⃣, 1⃣) include U+20E3 COMBINING ENCLOSING KEYCAP.
  // These are typically rendered as a single wide glyph even though the leading code point is ASCII.
  if (text.includes("\u20E3")) return 2;

  // If the cluster explicitly requests emoji presentation (VS16), prefer wide.
  // This covers sequences that are emoji but don't start with a high-plane pictograph (e.g. keycaps).
  if (hasVs16 && emojiRe?.test(text)) return 2;

  // Extended_Pictographic includes many BMP symbols whose width is terminal-dependent.
  // Treat BMP pictographs as narrow unless VS16 requests emoji presentation.
  if (extendedPictographicRe?.test(text)) {
    if (codePoint <= 0xffff) return hasVs16 ? 2 : 1;
    return 2;
  }

  return 1;
}
