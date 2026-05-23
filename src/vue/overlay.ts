export type TOverlayPlacement =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type TOverlayRect = Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
}>;

export type TOverlayPlacementOptions = Readonly<{
  viewport: Pick<TOverlayRect, "w" | "h">;
  size: Pick<TOverlayRect, "w" | "h">;
  placement?: TOverlayPlacement;
  offsetX?: number;
  offsetY?: number;
  anchor?: TOverlayRect;
  shift?: boolean;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function resolveOverlayPlacement(opts: TOverlayPlacementOptions): { x: number; y: number } {
  const cols = Math.max(0, Math.floor(opts.viewport.w));
  const rows = Math.max(0, Math.floor(opts.viewport.h));
  const w = Math.max(0, Math.floor(opts.size.w));
  const h = Math.max(0, Math.floor(opts.size.h));
  const placement = opts.placement ?? "center";
  const dx = Math.floor(opts.offsetX ?? 0);
  const dy = Math.floor(opts.offsetY ?? 0);
  const maxX = Math.max(0, cols - w);
  const maxY = Math.max(0, rows - h);
  const anchor = opts.anchor;

  let x = Math.floor((cols - w) / 2);
  let y = Math.floor((rows - h) / 2);

  if (anchor) {
    switch (placement) {
      case "top":
        x = anchor.x + Math.floor((anchor.w - w) / 2);
        y = anchor.y - h;
        break;
      case "bottom":
        x = anchor.x + Math.floor((anchor.w - w) / 2);
        y = anchor.y + anchor.h;
        break;
      case "left":
        x = anchor.x - w;
        y = anchor.y + Math.floor((anchor.h - h) / 2);
        break;
      case "right":
        x = anchor.x + anchor.w;
        y = anchor.y + Math.floor((anchor.h - h) / 2);
        break;
      case "top-left":
        x = anchor.x;
        y = anchor.y - h;
        break;
      case "top-right":
        x = anchor.x + anchor.w - w;
        y = anchor.y - h;
        break;
      case "bottom-left":
        x = anchor.x;
        y = anchor.y + anchor.h;
        break;
      case "bottom-right":
        x = anchor.x + anchor.w - w;
        y = anchor.y + anchor.h;
        break;
      case "center":
        x = anchor.x + Math.floor((anchor.w - w) / 2);
        y = anchor.y + Math.floor((anchor.h - h) / 2);
        break;
    }
  } else {
    switch (placement) {
      case "top":
        x = Math.floor((cols - w) / 2);
        y = 0;
        break;
      case "bottom":
        x = Math.floor((cols - w) / 2);
        y = maxY;
        break;
      case "left":
        x = 0;
        y = Math.floor((rows - h) / 2);
        break;
      case "right":
        x = maxX;
        y = Math.floor((rows - h) / 2);
        break;
      case "top-left":
        x = 0;
        y = 0;
        break;
      case "top-right":
        x = maxX;
        y = 0;
        break;
      case "bottom-left":
        x = 0;
        y = maxY;
        break;
      case "bottom-right":
        x = maxX;
        y = maxY;
        break;
    }
  }

  x += dx;
  y += dy;
  return opts.shift === false ? { x, y } : { x: clamp(x, 0, maxX), y: clamp(y, 0, maxY) };
}

export type TOverlayFocusStack = {
  push: (id: string | null) => void;
  pop: () => string | null;
  peek: () => string | null;
  clear: () => void;
};

export function createOverlayFocusStack(): TOverlayFocusStack {
  const stack: Array<string | null> = [];
  return {
    push(id) {
      stack.push(id);
    },
    pop() {
      return stack.pop() ?? null;
    },
    peek() {
      return stack.length ? (stack[stack.length - 1] ?? null) : null;
    },
    clear() {
      stack.length = 0;
    },
  };
}
