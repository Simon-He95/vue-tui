import { charCellWidth } from "../../core/buffer/width.js";

interface GraphemeSegment {
  segment: string;
  index: number;
}

let renderPassDepth = 0;
const renderPassTextWidthCache = new Map<string, number>();

export function withTextRenderPass<T>(fn: () => T): T {
  renderPassDepth++;
  try {
    if (renderPassDepth === 1) renderPassTextWidthCache.clear();
    return fn();
  } finally {
    renderPassDepth--;
    if (renderPassDepth === 0) renderPassTextWidthCache.clear();
  }
}

function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function needsGraphemeSegmentation(text: string): boolean {
  // Be conservative: return true if we see characters that commonly participate in multi-codepoint
  // grapheme clusters (combining marks, ZWJ sequences, emoji variation selectors, skin tone modifiers,
  // or regional-indicator flags). If none are present, code-point iteration is generally safe.
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    // ZWJ
    if (cp === 0x200d) return true;
    // Variation selectors (incl. VS16)
    if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return true;
    // Combining diacritics + common marks blocks
    if (
      (cp >= 0x0300 && cp <= 0x036f) ||
      (cp >= 0x1ab0 && cp <= 0x1aff) ||
      (cp >= 0x1dc0 && cp <= 0x1dff) ||
      (cp >= 0x20d0 && cp <= 0x20ff) ||
      (cp >= 0xfe20 && cp <= 0xfe2f)
    ) {
      return true;
    }
    // Emoji modifiers (skin tones)
    if (cp >= 0x1f3fb && cp <= 0x1f3ff) return true;
    // Regional indicator symbols (flags are pairs)
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return true;
  }
  return false;
}

let graphemeSegmenter: Intl.Segmenter | null = null;
try {
  // Some runtimes may not support Intl.Segmenter; fall back to code-point iteration.
  graphemeSegmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
} catch {
  graphemeSegmenter = null;
}

function forEachGrapheme(text: string, cb: (g: string) => void | false): void {
  if (!text) return;
  const seg = graphemeSegmenter;
  if (!seg || !needsGraphemeSegmentation(text)) {
    for (const ch of text) {
      const r = cb(ch);
      if (r === false) return;
    }
    return;
  }
  // segment() returns objects with a `.segment` field; keep types loose for older TS libs.
  for (const part of seg.segment(text) as any as Iterable<GraphemeSegment>) {
    const r = cb(part.segment);
    if (r === false) return;
  }
}

export function graphemeRangeAt(
  text: string,
  index: number,
): { start: number; end: number } | null {
  if (!text) return null;
  const len = text.length;
  if (index < 0 || index >= len) return null;
  if (isAscii(text)) return { start: index, end: index + 1 };

  const seg = graphemeSegmenter;
  if (seg && needsGraphemeSegmentation(text)) {
    let pos = 0;
    for (const part of seg.segment(text) as any as Iterable<GraphemeSegment>) {
      const start = pos;
      const end = start + part.segment.length;
      if (index >= start && index < end) return { start, end };
      pos = end;
    }
    return null;
  }

  let pos = 0;
  for (const ch of text) {
    const start = pos;
    const end = start + ch.length;
    if (index >= start && index < end) return { start, end };
    pos = end;
  }
  return null;
}

export function sanitizeInlineText(text: string): string {
  if (!text) return "";
  // Components that render single-line segments must not emit control chars
  // because terminal.write interprets them as cursor movement.
  // Replace common controls with spaces.
  if (!/[\n\r\t]/.test(text)) return text;
  return text.replace(/[\n\r\t]/g, " ");
}

export function sanitizeTextBlock(text: string): string {
  // Multi-line text is allowed (we render each line via terminal.write without emitting '\n'),
  // but we still need to strip other control chars to avoid terminal cursor movement.
  if (!text) return "";

  // Fast path: if there are no characters that require sanitization, return as-is.
  // We keep '\n' but strip other ASCII control chars + DEL, convert '\t' to ' ', and drop '\r'.
  // eslint-disable-next-line no-control-regex
  if (!/[\t\x00-\x08\x0B-\x1F\x7F]/.test(text)) return text;

  const out: string[] = [];
  out.length = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x0d)
      // '\r'
      continue;
    if (cp === 0x09) {
      // '\t'
      out.push(" ");
      continue;
    }
    // Keep '\n' (0x0A) to preserve explicit newlines; strip other ASCII control chars + DEL.
    if ((cp <= 0x1f && cp !== 0x0a) || cp === 0x7f) continue;
    out.push(ch);
  }
  return out.join("");
}

export function textCellWidth(text: string): number {
  if (!text) return 0;
  // Fast path: ASCII is always single-cell and doesn't require grapheme segmentation.
  if (isAscii(text)) return text.length;
  if (renderPassDepth > 0) {
    const cached = renderPassTextWidthCache.get(text);
    if (cached != null) return cached;
  }
  const cached = textWidthCacheGet(text);
  if (cached != null) return cached;
  let cells = 0;
  forEachGrapheme(text, (g) => {
    cells += charCellWidth(g);
  });
  if (renderPassDepth > 0) renderPassTextWidthCache.set(text, cells);
  textWidthCacheSet(text, cells);
  return cells;
}

const spaceCache = new Map<number, string>();
const MAX_CACHED_SPACES = 256;

export function spaces(count: number): string {
  count = Math.max(0, Math.floor(count));
  if (count === 0) return "";
  const cached = spaceCache.get(count);
  if (cached) return cached;
  const v = " ".repeat(count);
  // Avoid unbounded growth if callers pass many unique widths.
  if (spaceCache.size >= MAX_CACHED_SPACES) spaceCache.clear();
  spaceCache.set(count, v);
  return v;
}

const repeatCharCache = new Map<string, Map<number, string>>();
const MAX_REPEAT_CHAR_KEYS = 8;
const MAX_CACHED_REPEAT_CHAR = 256;

export function repeatChar(ch: string, count: number): string {
  count = Math.max(0, Math.floor(count));
  if (count === 0) return "";
  if (!ch) return "";
  let bucket = repeatCharCache.get(ch);
  if (!bucket) {
    if (repeatCharCache.size >= MAX_REPEAT_CHAR_KEYS) repeatCharCache.clear();
    bucket = new Map<number, string>();
    repeatCharCache.set(ch, bucket);
  }
  const cached = bucket.get(count);
  if (cached) return cached;
  const v = ch.repeat(count);
  if (bucket.size >= MAX_CACHED_REPEAT_CHAR) bucket.clear();
  bucket.set(count, v);
  return v;
}

export function sliceByCells(text: string, maxCells: number): string {
  maxCells = Math.max(0, Math.floor(maxCells));
  if (maxCells <= 0) return "";
  if (text && isAscii(text)) return text.slice(0, maxCells);
  const out: string[] = [];
  let cells = 0;
  forEachGrapheme(text, (g) => {
    const w = charCellWidth(g);
    if (cells + w > maxCells) return false;
    out.push(g);
    cells += w;
    return undefined;
  });
  return out.length ? out.join("") : "";
}

export function sliceByCellsRange(text: string, startCells: number, endCells: number): string {
  startCells = Math.max(0, Math.floor(startCells));
  endCells = Math.max(0, Math.floor(endCells));
  if (endCells <= startCells) return "";
  if (!text) return "";
  if (isAscii(text)) return text.slice(startCells, endCells);

  const out: string[] = [];
  let cells = 0;
  forEachGrapheme(text, (g) => {
    const w = charCellWidth(g);
    const next = cells + w;
    if (cells >= endCells) return false;
    // If this grapheme is fully before the start, skip it.
    if (next <= startCells) {
      cells = next;
      return undefined;
    }
    // If the start cuts through a wide grapheme, skip it (can't render half a cell).
    if (cells < startCells && next > startCells) {
      cells = next;
      return undefined;
    }
    if (next > endCells) return false;
    out.push(g);
    cells = next;
    return undefined;
  });
  return out.length ? out.join("") : "";
}

export function padEndByCells(text: string, width: number): string {
  width = Math.max(0, Math.floor(width));
  const cells = text && isAscii(text) ? text.length : textCellWidth(text);
  if (cells >= width) return text;
  return `${text}${spaces(width - cells)}`;
}

const inlineLineCacheByWidth = new Map<number, Map<string, string>>();
const MAX_INLINE_LINE_CACHE_BUCKETS = 32;
const MAX_INLINE_LINE_CACHE_PER_WIDTH = 512;

function getInlineLineBucket(width: number): Map<string, string> {
  let bucket = inlineLineCacheByWidth.get(width);
  if (bucket) return bucket;
  if (inlineLineCacheByWidth.size >= MAX_INLINE_LINE_CACHE_BUCKETS) inlineLineCacheByWidth.clear();
  bucket = new Map<string, string>();
  inlineLineCacheByWidth.set(width, bucket);
  return bucket;
}

export function formatInlineCellLine(text: string, width: number): string {
  width = Math.max(0, Math.floor(width));
  if (width === 0) return "";
  if (!text) return spaces(width);

  const bucket = getInlineLineBucket(width);
  const cached = bucket.get(text);
  if (cached != null) return cached;

  const sanitized = sanitizeInlineText(text);
  if (sanitized && isAscii(sanitized)) {
    const out =
      sanitized.length >= width
        ? sanitized.slice(0, width)
        : `${sanitized}${spaces(width - sanitized.length)}`;
    if (bucket.size >= MAX_INLINE_LINE_CACHE_PER_WIDTH) bucket.clear();
    bucket.set(text, out);
    return out;
  }

  const out = padEndByCells(sliceByCells(sanitized, width), width);
  if (bucket.size >= MAX_INLINE_LINE_CACHE_PER_WIDTH) bucket.clear();
  bucket.set(text, out);
  return out;
}

const wrapCacheByWidth = new Map<number, Map<string, readonly string[]>>();
const MAX_WRAP_CACHE_BUCKETS = 32;
const MAX_WRAP_CACHE_PER_WIDTH = 256;

function getWrapBucket(width: number): Map<string, readonly string[]> {
  let bucket = wrapCacheByWidth.get(width);
  if (bucket) return bucket;
  // Guard against terminals that resize through many widths (e.g. dragging window).
  if (wrapCacheByWidth.size >= MAX_WRAP_CACHE_BUCKETS) wrapCacheByWidth.clear();
  bucket = new Map<string, readonly string[]>();
  wrapCacheByWidth.set(width, bucket);
  return bucket;
}

const textWidthCache = new Map<string, number>();
const MAX_TEXT_WIDTH_CACHE = 1024;

function textWidthCacheGet(text: string): number | null {
  const cached = textWidthCache.get(text);
  if (cached == null) return null;
  // Simple LRU: refresh insertion order.
  textWidthCache.delete(text);
  textWidthCache.set(text, cached);
  return cached;
}

function textWidthCacheSet(text: string, cells: number): void {
  textWidthCache.set(text, cells);
  if (textWidthCache.size > MAX_TEXT_WIDTH_CACHE) {
    const firstKey = textWidthCache.keys().next().value as string | undefined;
    if (firstKey != null) textWidthCache.delete(firstKey);
  }
}

export function clearTextCaches(): void {
  wrapCacheByWidth.clear();
  spaceCache.clear();
  repeatCharCache.clear();
  textWidthCache.clear();
  inlineLineCacheByWidth.clear();
}

export function wrapByCells(text: string, width: number): readonly string[] {
  width = Math.max(1, Math.floor(width));
  const bucket = getWrapBucket(width);
  if (text && isAscii(text)) {
    const cached = bucket.get(text);
    if (cached) return cached;

    const out: string[] = [];
    for (const rawLine of text.replace(/\r/g, "").split("\n")) {
      if (rawLine.length === 0) {
        out.push("");
        continue;
      }
      for (let i = 0; i < rawLine.length; i += width) out.push(rawLine.slice(i, i + width));
    }

    if (bucket.size >= MAX_WRAP_CACHE_PER_WIDTH) bucket.clear();
    bucket.set(text, out);
    return out;
  }

  const cached = bucket.get(text);
  if (cached) return cached;

  const out: string[] = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    if (rawLine.length === 0) {
      out.push("");
      continue;
    }

    // Use index tracking + slice instead of array push + join.
    // Avoids intermediate array allocations per line break.
    const seg = graphemeSegmenter;
    if (seg && needsGraphemeSegmentation(rawLine)) {
      let lineStart = 0;
      let cells = 0;
      for (const part of seg.segment(rawLine) as any as Iterable<GraphemeSegment>) {
        const g = part.segment;
        const gIdx = part.index;
        const w = charCellWidth(g);
        if (cells > 0 && cells + w > width) {
          out.push(rawLine.slice(lineStart, gIdx));
          lineStart = gIdx;
          cells = 0;
        }
        cells += w;
        if (cells >= width) {
          const end = gIdx + g.length;
          out.push(rawLine.slice(lineStart, end));
          lineStart = end;
          cells = 0;
        }
      }
      if (lineStart < rawLine.length) out.push(rawLine.slice(lineStart));
    } else {
      // Code-point iteration (no grapheme segmentation needed).
      // Use slice-based output instead of array accumulation.
      let lineStart = 0;
      let pos = 0;
      let cells = 0;
      for (const ch of rawLine) {
        const w = charCellWidth(ch);
        if (cells > 0 && cells + w > width) {
          out.push(rawLine.slice(lineStart, pos));
          lineStart = pos;
          cells = 0;
        }
        pos += ch.length;
        cells += w;
        if (cells >= width) {
          out.push(rawLine.slice(lineStart, pos));
          lineStart = pos;
          cells = 0;
        }
      }
      if (lineStart < rawLine.length) out.push(rawLine.slice(lineStart));
    }
  }
  const res = out.length ? out : [""];
  if (bucket.size >= MAX_WRAP_CACHE_PER_WIDTH) bucket.clear();
  bucket.set(text, res);
  return res;
}
