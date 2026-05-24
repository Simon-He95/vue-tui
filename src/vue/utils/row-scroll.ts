import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Rect } from "../../events/manager/types.js";
import type { RendererCapabilities } from "../../renderer/capabilities.js";
import type { RenderManager } from "../render/render-manager.js";

export type UnsafeFullRowScrollMode = "off" | "unsafe-full-row";

export function exposedRowsForDelta(y0: number, h: number, delta: number): number[] {
  const rows: number[] = [];
  if (delta > 0) {
    for (let i = h - delta; i < h; i++) rows.push(y0 + i);
  } else {
    for (let i = 0; i < -delta; i++) rows.push(y0 + i);
  }
  return rows;
}

export function tryUnsafeFullRowScroll(
  options: Readonly<{
    render: Pick<RenderManager, "unsafeScrollPlaneRows">;
    plane: TerminalRenderPlane;
    rect: Rect;
    terminalSize: Readonly<{ cols: number; rows: number }>;
    delta: number;
    rowScrollMode: UnsafeFullRowScrollMode;
    rendererCapabilities: Pick<RendererCapabilities, "scrollOperations">;
    isClipped: boolean;
    hasPendingDirtyRows: boolean;
    strategy?: "auto" | "viewport-repaint";
  }>,
): readonly number[] | null {
  const r = options.rect;
  const h = r.h;
  const ownsFullRows = Math.floor(r.x) === 0 && Math.floor(r.w) >= options.terminalSize.cols;
  const withinTerminalRows = r.y >= 0 && r.y + h <= options.terminalSize.rows;
  const canUseScrollPlane =
    (options.strategy ?? "auto") === "auto" &&
    options.rowScrollMode === "unsafe-full-row" &&
    options.rendererCapabilities.scrollOperations &&
    ownsFullRows &&
    withinTerminalRows &&
    !options.isClipped &&
    Math.abs(options.delta) < h &&
    !options.hasPendingDirtyRows;

  if (!canUseScrollPlane) return null;

  options.render.unsafeScrollPlaneRows(options.plane, r.y, r.y + h, options.delta);
  return exposedRowsForDelta(r.y, h, options.delta);
}
