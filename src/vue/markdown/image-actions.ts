import type {
  TuiMarkdownImageActionPayload,
  TuiMarkdownVisualRow,
  TuiMarkdownVisualSegment,
} from "./types.js";

function imageDisplayWidth(segment: TuiMarkdownVisualSegment): number {
  return Math.max(1, Math.floor(segment.graphic?.displayWidth ?? segment.cells));
}

function imageDisplayHeight(segment: TuiMarkdownVisualSegment): number {
  return Math.max(1, Math.floor(segment.graphic?.displayHeight ?? 1));
}

export function findMarkdownImageActionAt(
  rows: readonly TuiMarkdownVisualRow[],
  point: Readonly<{ cellX: number; cellY: number }>,
  options: Readonly<{
    screenRect: Readonly<{ x: number; y: number; w: number; h: number }>;
    rowOffset: number;
    clipStart: number;
  }>,
): TuiMarkdownImageActionPayload | null {
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
      const image = segment.graphic;
      if (!image) continue;
      if (segmentEnd <= clipStart || segmentStart >= clipEnd) continue;

      const imageX = r.x + segmentStart - clipStart;
      const imageY = r.y + rowIndex - firstRow;
      const imageRect = {
        x: imageX,
        y: imageY,
        w: imageDisplayWidth(segment),
        h: imageDisplayHeight(segment),
      };
      const visibleLeft = Math.max(r.x, imageRect.x);
      const visibleTop = Math.max(r.y, imageRect.y);
      const visibleRight = Math.min(r.x + r.w, imageRect.x + imageRect.w);
      const visibleBottom = Math.min(r.y + r.h, imageRect.y + imageRect.h);
      if (
        point.cellX < visibleLeft ||
        point.cellY < visibleTop ||
        point.cellX >= visibleRight ||
        point.cellY >= visibleBottom
      ) {
        continue;
      }

      return {
        image,
        rect: imageRect,
        cellX: point.cellX,
        cellY: point.cellY,
        rowIndex,
        segmentIndex,
      };
    }
  }

  return null;
}
