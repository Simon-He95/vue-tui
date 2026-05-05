import type { Style, Terminal } from "../../core/types.js";
import { forEachTextCellSegment, spaces } from "../utils/text.js";
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
  let used = 0;
  for (const segment of row.segments) {
    if (used >= options.w || !segment.text) {
      logicalX += segment.cells;
      continue;
    }
    const segmentStart = logicalX;
    const segmentEnd = logicalX + segment.cells;
    logicalX += segment.cells;
    if (segmentEnd <= clipStart || segmentStart >= clipEnd) continue;

    let pieceStart = segmentStart;
    forEachTextCellSegment(segment.text, (piece) => {
      if (used >= options.w) return false;
      const pieceEnd = pieceStart + piece.cells;
      const visibleStart = Math.max(pieceStart, clipStart);
      const visibleEnd = Math.min(pieceEnd, clipEnd);
      pieceStart = pieceEnd;
      if (visibleEnd <= visibleStart) return;

      const expectedUsed = visibleStart - clipStart;
      if (expectedUsed > used) {
        const pad = Math.min(expectedUsed - used, options.w - used);
        terminal.write(spaces(pad), {
          x: options.x + used,
          y: options.y,
          style: options.baseStyle,
        });
        used += pad;
      }

      if (visibleStart === pieceStart - piece.cells && visibleEnd === pieceEnd) {
        terminal.write(piece.text, {
          x: options.x + used,
          y: options.y,
          style: mergeStyle(options.baseStyle, segment.style),
        });
        used += piece.cells;
        return;
      }

      const pad = Math.min(visibleEnd - visibleStart, options.w - used);
      if (pad > 0) {
        terminal.write(spaces(pad), {
          x: options.x + used,
          y: options.y,
          style: options.baseStyle,
        });
        used += pad;
      }
    });
  }
  if (used < options.w && options.clear !== false) {
    terminal.write(spaces(options.w - used), {
      x: options.x + used,
      y: options.y,
      style: options.baseStyle,
    });
  }
}
