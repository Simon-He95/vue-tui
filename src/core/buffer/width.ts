const fullWidthRanges: Array<[number, number]> = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
];

function isFullWidthCodePoint(codePoint: number): boolean {
  // Quick reject: below first or above last full-width range
  if (codePoint < 0x1100 || codePoint > 0xffe6) return false;
  // Ranges are sorted — exit as soon as we pass the candidate
  for (const [start, end] of fullWidthRanges) {
    if (codePoint < start) return false;
    if (codePoint <= end) return true;
  }
  return false;
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

export function charCellWidth(text: string): 1 | 2 {
  if (!text) return 1;

  // Fast path: single BMP character below all full-width / emoji ranges.
  // Covers ASCII, Latin Extended, Greek, Cyrillic, Arabic, Thai, etc.
  // Skips all expensive regex checks.
  if (text.length === 1) {
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
