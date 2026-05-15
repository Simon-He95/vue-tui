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

const ambiguousWidthRanges: Array<[number, number]> = [
  [0x00a1, 0x00a1],
  [0x00a4, 0x00a4],
  [0x00a7, 0x00a8],
  [0x00aa, 0x00aa],
  [0x00ad, 0x00ae],
  [0x00b0, 0x00b4],
  [0x00b6, 0x00ba],
  [0x00bc, 0x00bf],
  [0x00c6, 0x00c6],
  [0x00d0, 0x00d0],
  [0x00d7, 0x00d8],
  [0x00de, 0x00e1],
  [0x00e6, 0x00e6],
  [0x00e8, 0x00ea],
  [0x00ec, 0x00ed],
  [0x00f0, 0x00f0],
  [0x00f2, 0x00f3],
  [0x00f7, 0x00fa],
  [0x00fc, 0x00fc],
  [0x00fe, 0x00fe],
  [0x0101, 0x0101],
  [0x0111, 0x0111],
  [0x0113, 0x0113],
  [0x011b, 0x011b],
  [0x0126, 0x0127],
  [0x012b, 0x012b],
  [0x0131, 0x0133],
  [0x0138, 0x0138],
  [0x013f, 0x0142],
  [0x0144, 0x0144],
  [0x0148, 0x014b],
  [0x014d, 0x014d],
  [0x0152, 0x0153],
  [0x0166, 0x0167],
  [0x016b, 0x016b],
  [0x01ce, 0x01ce],
  [0x01d0, 0x01d0],
  [0x01d2, 0x01d2],
  [0x01d4, 0x01d4],
  [0x01d6, 0x01d6],
  [0x01d8, 0x01d8],
  [0x01da, 0x01da],
  [0x01dc, 0x01dc],
  [0x0251, 0x0251],
  [0x0261, 0x0261],
  [0x02c4, 0x02c4],
  [0x02c7, 0x02c7],
  [0x02c9, 0x02cb],
  [0x02cd, 0x02cd],
  [0x02d0, 0x02d0],
  [0x02d8, 0x02db],
  [0x02dd, 0x02dd],
  [0x02df, 0x02df],
  [0x0391, 0x03a1],
  [0x03a3, 0x03a9],
  [0x03b1, 0x03c1],
  [0x03c3, 0x03c9],
  [0x0401, 0x0401],
  [0x0410, 0x044f],
  [0x0451, 0x0451],
  [0x2010, 0x2015],
  [0x2018, 0x2019],
  [0x201c, 0x201d],
  [0x2020, 0x2022],
  [0x2024, 0x2027],
  [0x2030, 0x2030],
  [0x2032, 0x2033],
  [0x2035, 0x2035],
  [0x203b, 0x203b],
  [0x203e, 0x203e],
  [0x2074, 0x2074],
  [0x207f, 0x207f],
  [0x2081, 0x2084],
  [0x20ac, 0x20ac],
  [0x2103, 0x2103],
  [0x2105, 0x2105],
  [0x2109, 0x2109],
  [0x2113, 0x2113],
  [0x2116, 0x2116],
  [0x2121, 0x2122],
  [0x2126, 0x2126],
  [0x212b, 0x212b],
  [0x2153, 0x2154],
  [0x215b, 0x215e],
  [0x2160, 0x216b],
  [0x2170, 0x2179],
  [0x2189, 0x2189],
  [0x2190, 0x2199],
  [0x21b8, 0x21b9],
  [0x21d2, 0x21d2],
  [0x21d4, 0x21d4],
  [0x21e7, 0x21e7],
  [0x2200, 0x2200],
  [0x2202, 0x2203],
  [0x2207, 0x2208],
  [0x220b, 0x220b],
  [0x220f, 0x220f],
  [0x2211, 0x2211],
  [0x2215, 0x2215],
  [0x221a, 0x221a],
  [0x221d, 0x2220],
  [0x2223, 0x2223],
  [0x2225, 0x2225],
  [0x2227, 0x222c],
  [0x222e, 0x222e],
  [0x2234, 0x2237],
  [0x223c, 0x223d],
  [0x2248, 0x2248],
  [0x224c, 0x224c],
  [0x2252, 0x2252],
  [0x2260, 0x2261],
  [0x2264, 0x2267],
  [0x226a, 0x226b],
  [0x226e, 0x226f],
  [0x2282, 0x2283],
  [0x2286, 0x2287],
  [0x2295, 0x2295],
  [0x2299, 0x2299],
  [0x22a5, 0x22a5],
  [0x22bf, 0x22bf],
  [0x2312, 0x2312],
  [0x2460, 0x24e9],
  [0x24eb, 0x254b],
  [0x2550, 0x2573],
  [0x2580, 0x258f],
  [0x2592, 0x2595],
  [0x25a0, 0x25a1],
  [0x25a3, 0x25a9],
  [0x25b2, 0x25b3],
  [0x25b6, 0x25b7],
  [0x25bc, 0x25bd],
  [0x25c0, 0x25c1],
  [0x25c6, 0x25c8],
  [0x25cb, 0x25cb],
  [0x25ce, 0x25d1],
  [0x25e2, 0x25e5],
  [0x25ef, 0x25ef],
  [0x2605, 0x2606],
  [0x2609, 0x2609],
  [0x260e, 0x260f],
  [0x261c, 0x261c],
  [0x261e, 0x261e],
  [0x2640, 0x2640],
  [0x2642, 0x2642],
  [0x2660, 0x2661],
  [0x2663, 0x2665],
  [0x2667, 0x266a],
  [0x266c, 0x266d],
  [0x266f, 0x266f],
  [0x273d, 0x273d],
  [0x2776, 0x277f],
  [0x2b56, 0x2b56],
  [0xe000, 0xf8ff],
  [0xfffd, 0xfffd],
];

export type CellWidth = 1 | 2;
export type BuiltinWidthProvider = "default" | "cjk" | "narrow-ambiguous";
export type WidthProvider = BuiltinWidthProvider | ((text: string) => CellWidth);

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

function isAmbiguousWidthCodePoint(codePoint: number): boolean {
  if (codePoint < 0x00a1 || codePoint > 0xfffd) return false;
  for (const [start, end] of ambiguousWidthRanges) {
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
