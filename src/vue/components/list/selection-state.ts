import type { ListVisibleRange } from "./list-geometry.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeListIndex(value: unknown, itemsLength: number): number {
  const last = itemsLength - 1;
  if (last < 0) return 0;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return clamp(n, 0, last);
}

export function isActiveVisible(active: number, range: ListVisibleRange): boolean {
  return range.h > 0 && active >= range.start && active <= range.end;
}

export function anchorActiveToViewport(
  active: number,
  itemsLength: number,
  range: ListVisibleRange,
  direction: -1 | 1,
): number {
  if (range.h <= 0) return active;
  if (active < range.start) return range.start;
  if (active > range.end) return range.end;
  return clamp(active + direction, 0, Math.max(0, itemsLength - 1));
}

export function pageAnchor(
  active: number,
  itemsLength: number,
  range: ListVisibleRange,
  direction: -1 | 1,
): number {
  const last = Math.max(0, itemsLength - 1);
  if (range.h <= 0) return active;
  if (!isActiveVisible(active, range)) {
    return direction > 0
      ? clamp(range.end + range.h, 0, last)
      : clamp(range.start - range.h, 0, last);
  }
  return clamp(active + direction * range.h, 0, last);
}

export function nearestVisibleActive(
  active: number,
  itemsLength: number,
  range: ListVisibleRange,
): number {
  const last = Math.max(0, itemsLength - 1);
  if (range.h <= 0) return clamp(active, 0, last);
  if (!isActiveVisible(active, range)) return clamp(range.start, 0, last);
  return clamp(active, 0, last);
}
