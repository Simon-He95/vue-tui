import type { Style, Terminal } from "../../core/types.js";
import { sliceByCellsRange, spaces, textCellWidth } from "../utils/text.js";
import type { TuiMarkdownVisualRow } from "./types.js";

function mergeStyle(base: Style, overlay?: Style): Style {
  return overlay ? { ...base, ...overlay } : base;
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
    const text = sliceByCellsRange(segment.text, clippedStart, clippedEnd);
    const cells = textCellWidth(text);
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
