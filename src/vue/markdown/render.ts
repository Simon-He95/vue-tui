import type { Style, Terminal } from "../../core/types.js";
import { sliceByCellsRange, spaces, textCellWidth } from "../utils/text.js";
import type { TuiMarkdownVisualRow } from "./types.js";

const mergedStyleCache = new WeakMap<Style, WeakMap<Style, Style>>();

function mergeStyle(base: Style, overlay?: Style): Style {
  if (!overlay) return base;
  let bucket = mergedStyleCache.get(base);
  if (!bucket) {
    bucket = new WeakMap<Style, Style>();
    mergedStyleCache.set(base, bucket);
  }
  const cached = bucket.get(overlay);
  if (cached) return cached;
  const merged = Object.freeze({ ...base, ...overlay });
  bucket.set(overlay, merged);
  return merged;
}

export function paintMarkdownVisualRow(
  terminal: Terminal,
  row: TuiMarkdownVisualRow | undefined,
  options: Readonly<{
    x: number;
    y: number;
    w: number;
    clipStart?: number;
    baseStyle: Style;
    clear?: boolean;
  }>,
): void {
  const clipStart = Math.max(0, Math.floor(options.clipStart ?? 0));
  const clipEnd = clipStart + options.w;
  if (!row) {
    if (options.clear !== false) {
      terminal.write(spaces(options.w), { x: options.x, y: options.y, style: options.baseStyle });
    }
    return;
  }

  let logicalX = 0;
  let drawX = options.x;
  let used = 0;
  for (const segment of row.segments) {
    if (used >= options.w || !segment.text) {
      logicalX += segment.cells;
      continue;
    }
    const clippedStart = Math.max(0, clipStart - logicalX);
    const clippedEnd = Math.min(segment.cells, clipEnd - logicalX);
    logicalX += segment.cells;
    if (clippedEnd <= clippedStart) continue;
    const clippedPrefix = sliceByCellsRange(segment.text, 0, clippedStart);
    const leftPad = Math.max(0, clippedStart - textCellWidth(clippedPrefix));
    const text = sliceByCellsRange(segment.text, clippedStart, clippedEnd);
    const cells = textCellWidth(text);
    if (leftPad > 0 && used < options.w) {
      const pad = Math.min(leftPad, options.w - used);
      terminal.write(spaces(pad), {
        x: drawX,
        y: options.y,
        style: options.baseStyle,
      });
      drawX += pad;
      used += pad;
    }
    if (!text || cells <= 0) continue;
    terminal.write(text, {
      x: drawX,
      y: options.y,
      style: mergeStyle(options.baseStyle, segment.style),
    });
    drawX += cells;
    used += cells;
  }
  if (used < options.w && options.clear !== false) {
    terminal.write(spaces(options.w - used), {
      x: drawX,
      y: options.y,
      style: options.baseStyle,
    });
  }
}
