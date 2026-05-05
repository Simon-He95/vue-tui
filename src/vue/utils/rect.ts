import type { Rect } from "../../events/index.js";

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}

export function normalizeCellRect(rect: Rect): Rect {
  const x0 = Math.floor(rect.x);
  const y0 = Math.floor(rect.y);
  const x1 = Math.floor(rect.x + rect.w);
  const y1 = Math.floor(rect.y + rect.h);
  return {
    x: x0,
    y: y0,
    w: Math.max(0, x1 - x0),
    h: Math.max(0, y1 - y0),
  };
}
