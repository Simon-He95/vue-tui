import type { Rect } from "../../../events/manager/types.js";

export type ListClipOffsets = Readonly<{
  x: number;
  y: number;
}>;

export type ListVisibleRange = Readonly<{
  start: number;
  end: number;
  h: number;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function clipOffsets(full: Rect, clip: Rect): ListClipOffsets {
  return {
    x: Math.max(0, clip.x - full.x),
    y: Math.max(0, clip.y - full.y),
  };
}

export function maxScrollTop(itemsLength: number, clipY: number, clipH: number): number {
  if (clipH <= 0) return 0;
  return Math.max(0, itemsLength - (clipY + clipH));
}

export function maxScrollTopForClamp(
  fullH: number,
  clipH: number,
  itemsLength: number,
  clipY: number,
): number | null {
  if (fullH <= 0) return 0;
  if (clipH <= 0) return null;
  return maxScrollTop(itemsLength, clipY, clipH);
}

export function clampScrollTop(value: number, max: number | null): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  if (max == null) return Math.max(0, n);
  return clamp(n, 0, max);
}

export function visibleRange(
  scrollTop: number,
  itemsLength: number,
  full: Rect,
  clip: Rect,
): ListVisibleRange {
  const { y: clipY } = clipOffsets(full, clip);
  const start =
    clampScrollTop(scrollTop, maxScrollTopForClamp(full.h, clip.h, itemsLength, clipY)) + clipY;
  return {
    start,
    end: clip.h <= 0 ? start - 1 : start + clip.h - 1,
    h: clip.h,
  };
}

export function hasPaintableViewport(visible: boolean, rect: Rect): boolean {
  return visible && rect.w > 0 && rect.h > 0;
}
