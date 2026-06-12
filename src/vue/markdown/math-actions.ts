import type { TuiMarkdownMathActionPayload, TuiMarkdownVisualRow } from "./types.js";

export function findMarkdownMathActionAt(
  rows: readonly TuiMarkdownVisualRow[],
  point: Readonly<{ cellX: number; cellY: number }>,
  options: Readonly<{
    screenRect: Readonly<{ x: number; y: number; w: number; h: number }>;
    rowOffset: number;
    clipStart: number;
  }>,
): TuiMarkdownMathActionPayload | null {
  const r = options.screenRect;
  if (r.w <= 0 || r.h <= 0) return null;
  if (
    point.cellX < r.x ||
    point.cellY < r.y ||
    point.cellX >= r.x + r.w ||
    point.cellY >= r.y + r.h
  ) {
    return null;
  }

  const clipStart = Math.max(0, Math.floor(options.clipStart));
  const clipEnd = clipStart + r.w;
  const firstRow = Math.max(0, Math.floor(options.rowOffset));
  const lastRow = Math.min(rows.length, firstRow + r.h);

  for (let rowIndex = firstRow; rowIndex < lastRow; rowIndex++) {
    const row = rows[rowIndex];
    if (!row) continue;
    let logicalX = 0;
    for (let segmentIndex = 0; segmentIndex < row.segments.length; segmentIndex++) {
      const segment = row.segments[segmentIndex]!;
      const segmentStart = logicalX;
      const segmentEnd = logicalX + segment.cells;
      logicalX = segmentEnd;
      const math = segment.mathAction;
      if (!math || segmentEnd <= clipStart || segmentStart >= clipEnd) continue;

      const visibleStart = Math.max(segmentStart, clipStart);
      const visibleEnd = Math.min(segmentEnd, clipEnd);
      const rect = {
        x: r.x + visibleStart - clipStart,
        y: r.y + rowIndex - firstRow,
        w: visibleEnd - visibleStart,
        h: 1,
      };
      if (
        point.cellX < rect.x ||
        point.cellY < rect.y ||
        point.cellX >= rect.x + rect.w ||
        point.cellY >= rect.y + rect.h
      ) {
        continue;
      }

      return {
        math,
        rect,
        cellX: point.cellX,
        cellY: point.cellY,
        rowIndex,
        segmentIndex,
      };
    }
  }

  return null;
}
