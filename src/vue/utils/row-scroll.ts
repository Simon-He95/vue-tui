import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Rect } from "../../events/manager/types.js";
import type { RendererCapabilities } from "../../renderer/capabilities.js";
import type { RenderManager } from "../render/render-manager.js";

export type UnsafeFullRowScrollMode = "off" | "unsafe-full-row";

export type UnsafeFullRowScrollPlan = Readonly<{
  exposedRows: readonly number[];
  apply: () => void;
}>;

export function exposedRowsForDelta(y0: number, h: number, delta: number): number[] {
  const startY = Math.floor(y0);
  const height = Math.max(0, Math.floor(h));
  const lines = Math.trunc(delta);
  const rows: number[] = [];

  if (height <= 0 || lines === 0 || Math.abs(lines) >= height) return rows;

  if (lines > 0) {
    for (let i = height - lines; i < height; i++) rows.push(startY + i);
  } else {
    for (let i = 0; i < -lines; i++) rows.push(startY + i);
  }

  return rows;
}

export function prepareUnsafeFullRowScroll(
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
): UnsafeFullRowScrollPlan | null {
  const r = options.rect;
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  const w = Math.floor(r.w);
  const h = Math.floor(r.h);
  const rows = Math.floor(options.terminalSize.rows);
  const cols = Math.floor(options.terminalSize.cols);
  const delta = Math.trunc(options.delta);

  if (delta === 0 || h <= 0 || cols <= 0 || rows <= 0) return null;

  const ownsFullRows = x === 0 && w >= cols;
  const withinTerminalRows = y >= 0 && y + h <= rows;
  const canUseScrollPlane =
    (options.strategy ?? "auto") === "auto" &&
    options.rowScrollMode === "unsafe-full-row" &&
    options.rendererCapabilities.scrollOperations &&
    ownsFullRows &&
    withinTerminalRows &&
    !options.isClipped &&
    Math.abs(delta) < h &&
    !options.hasPendingDirtyRows;

  if (!canUseScrollPlane) return null;

  const exposedRows = exposedRowsForDelta(y, h, delta);
  if (!exposedRows.length) return null;

  return {
    exposedRows,
    apply: () => {
      options.render.unsafeScrollPlaneRows(options.plane, y, y + h, delta);
    },
  };
}
