import type { TerminalRenderPlane, TerminalRenderPlanes } from "../../core/render-plane.js";
import type { Terminal } from "../../core/types.js";
import { createDebugLogger, isDebugEnabled } from "../../core/debug-logger.js";
import { TERMINAL_RENDER_PLANES } from "../../core/render-plane.js";
import { resetPlaneRowsForRender, scrollPlaneRows } from "../../core/terminal/create-terminal.js";
import { createTuiProfiler } from "../../observability/tui-profiler.js";
import { clearTextCaches, withTextRenderPass } from "../utils/text.js";

const renderMgrDebugLog = createDebugLogger(isDebugEnabled());

export type RenderRect = Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
}>;

export type RenderStack = Readonly<{
  id: string;
  parent: RenderStack | null;
  zIndex: number;
  order: number;
}>;

export type RenderNode = Readonly<{
  id: string;
  stack: RenderStack;
  plane: TerminalRenderPlane;
  zIndex: number;
  order: number;
  rect: RenderRect | null;
  rectY0: number;
  rectY1: number;
  paint: (dirtyRows?: readonly number[]) => void;
}>;

export type RenderManager = Readonly<{
  rootStack: RenderStack;
  createStack: (parent: RenderStack, zIndex: number) => RenderStack;
  invalidatePlane: (plane: TerminalRenderPlane) => void;
  scrollPlane: (plane: TerminalRenderPlane, startY: number, endY: number, delta: number) => void;
  register: (node: {
    stack: RenderStack;
    plane?: TerminalRenderPlane;
    zIndex?: number;
    rect?: RenderRect | null;
    paint: (dirtyRows?: readonly number[]) => void;
  }) => RenderNode;
  update: (
    id: string,
    next: Partial<{
      stack: RenderStack;
      plane: TerminalRenderPlane;
      zIndex: number;
      rect: RenderRect | null;
      dirtyRowsHint: readonly number[];
      paint: (dirtyRows?: readonly number[]) => void;
    }>,
  ) => void;
  unregister: (id: string) => void;
  render: (options?: { activePlanes?: TerminalRenderPlanes | null }) => RenderStats | null;
}>;

let nextStackId = 0;
let nextNodeId = 0;

type PathSegment = Readonly<{ zIndex: number; order: number; id: string }>;
type RenderRowBuckets = Map<TerminalRenderPlane, Map<number, Set<string>>>;

interface DirtyPlaneState {
  allRowsDirty: boolean;
  dirtyRowBits: Uint8Array;
  dirtyRowCount: number;
  dirtyMinY: number;
  dirtyMaxY: number;
}

export type RenderStats = Readonly<{
  rows: number;
  scannedNodes: number;
  paintedNodes: number;
  candidatePlanes: readonly TerminalRenderPlane[];
}>;

function createDirtyPlaneState(rows: number): DirtyPlaneState {
  return {
    allRowsDirty: false,
    dirtyRowBits: new Uint8Array(rows),
    dirtyRowCount: 0,
    dirtyMinY: Number.POSITIVE_INFINITY,
    dirtyMaxY: -1,
  };
}

function isEmptyRect(rect: RenderRect): boolean {
  return rect.w <= 0 || rect.h <= 0;
}

function sameRect(a: RenderRect | null, b: RenderRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function createRenderManager(terminal: Terminal): RenderManager {
  let orderCounter = 0;
  const nodes = new Map<string, RenderNode>();
  const planeDirtyStates = new Map<TerminalRenderPlane, DirtyPlaneState>();
  const initialSize = terminal.size();
  let terminalRows = initialSize.rows;
  let allRows = Array.from({ length: terminalRows }, (_, index) => index);
  let sortedNodes: RenderNode[] = [];
  let sortedNodesByPlane = new Map<TerminalRenderPlane, RenderNode[]>();
  let sortedNodeIndexById = new Map<string, number>();
  let sortedPlaneNodeIndexById = new Map<string, number>();
  let sortedDirty = true;
  const rowBuckets: RenderRowBuckets = new Map();
  const globalNodeIdsByPlane = new Map<TerminalRenderPlane, Set<string>>();

  const stackPathCache = new WeakMap<RenderStack, readonly PathSegment[]>();
  const profiler = createTuiProfiler("render-manager");

  terminal.on("resize", ({ rows }) => {
    terminalRows = rows;
    allRows = Array.from({ length: terminalRows }, (_, index) => index);
    for (const state of planeDirtyStates.values()) {
      state.allRowsDirty = true;
      state.dirtyRowBits = new Uint8Array(terminalRows);
      state.dirtyRowCount = 0;
      state.dirtyMinY = Number.POSITIVE_INFINITY;
      state.dirtyMaxY = -1;
    }
    rebuildRowBuckets();
    clearTextCaches();
  });

  const rootStack: RenderStack = Object.freeze({
    id: `s${nextStackId++}`,
    parent: null,
    zIndex: 0,
    order: 0,
  });

  function getDirtyState(plane: TerminalRenderPlane): DirtyPlaneState {
    let state = planeDirtyStates.get(plane);
    if (!state) {
      state = createDirtyPlaneState(terminalRows);
      planeDirtyStates.set(plane, state);
    }
    return state;
  }

  function clearDirtyState(state: DirtyPlaneState): void {
    state.allRowsDirty = false;
    state.dirtyRowBits.fill(0);
    state.dirtyRowCount = 0;
    state.dirtyMinY = Number.POSITIVE_INFINITY;
    state.dirtyMaxY = -1;
  }

  function createStack(parent: RenderStack, zIndex: number): RenderStack {
    return Object.freeze({
      id: `s${nextStackId++}`,
      parent,
      zIndex: Number.isFinite(zIndex) ? zIndex : 0,
      order: ++orderCounter,
    });
  }

  function rectToYBounds(rect: RenderRect | null | undefined): {
    y0: number;
    y1: number;
  } {
    if (!rect) return { y0: 0, y1: 0 };
    const y0 = Math.floor(rect.y);
    const y1 = y0 + Math.max(0, Math.floor(rect.h));
    return { y0, y1 };
  }

  function removeFromRowBuckets(node: RenderNode): void {
    if (!node.rect) {
      const globalIds = globalNodeIdsByPlane.get(node.plane);
      globalIds?.delete(node.id);
      if (globalIds?.size === 0) globalNodeIdsByPlane.delete(node.plane);
      return;
    }

    const buckets = rowBuckets.get(node.plane);
    if (!buckets) return;
    const startY = Math.max(0, node.rectY0);
    const endY = Math.min(terminalRows, node.rectY1);
    for (let y = startY; y < endY; y++) {
      const ids = buckets.get(y);
      ids?.delete(node.id);
      if (ids?.size === 0) buckets.delete(y);
    }
    if (buckets.size === 0) rowBuckets.delete(node.plane);
  }

  function addToRowBuckets(node: RenderNode): void {
    if (!node.rect) {
      let globalIds = globalNodeIdsByPlane.get(node.plane);
      if (!globalIds) {
        globalIds = new Set();
        globalNodeIdsByPlane.set(node.plane, globalIds);
      }
      globalIds.add(node.id);
      return;
    }

    const startY = Math.max(0, node.rectY0);
    const endY = Math.min(terminalRows, node.rectY1);
    if (endY <= startY) return;
    let buckets = rowBuckets.get(node.plane);
    if (!buckets) {
      buckets = new Map();
      rowBuckets.set(node.plane, buckets);
    }
    for (let y = startY; y < endY; y++) {
      let ids = buckets.get(y);
      if (!ids) {
        ids = new Set();
        buckets.set(y, ids);
      }
      ids.add(node.id);
    }
  }

  function rebuildRowBuckets(): void {
    rowBuckets.clear();
    globalNodeIdsByPlane.clear();
    for (const node of nodes.values()) addToRowBuckets(node);
  }

  function markRect(plane: TerminalRenderPlane, rect: RenderRect | null | undefined): void {
    const state = getDirtyState(plane);
    if (!rect) {
      state.allRowsDirty = true;
      return;
    }
    const y0 = Math.floor(rect.y);
    const y1 = y0 + Math.max(0, Math.floor(rect.h));
    const startY = Math.max(0, y0);
    const endY = Math.min(terminalRows, y1);
    const span = endY - startY;
    if (span > 0 && span >= Math.floor(terminalRows * 0.75)) {
      state.allRowsDirty = true;
      return;
    }
    for (let y = startY; y < endY; y++) {
      if (state.dirtyRowBits[y] === 0) {
        state.dirtyRowBits[y] = 1;
        state.dirtyRowCount++;
        if (y < state.dirtyMinY) state.dirtyMinY = y;
        if (y > state.dirtyMaxY) state.dirtyMaxY = y;
      }
    }
  }

  function markRows(plane: TerminalRenderPlane, rows: readonly number[]): void {
    if (!rows.length) return;
    const state = getDirtyState(plane);
    for (let i = 0; i < rows.length; i++) {
      const y = Math.floor(rows[i] ?? -1);
      if (y < 0 || y >= terminalRows) continue;
      if (state.dirtyRowBits[y] === 0) {
        state.dirtyRowBits[y] = 1;
        state.dirtyRowCount++;
        if (y < state.dirtyMinY) state.dirtyMinY = y;
        if (y > state.dirtyMaxY) state.dirtyMaxY = y;
      }
    }
  }

  function scrollPlane(
    plane: TerminalRenderPlane,
    startY: number,
    endY: number,
    delta: number,
  ): void {
    scrollPlaneRows(terminal, plane, startY, endY, delta);
  }

  function invalidatePlane(plane: TerminalRenderPlane): void {
    getDirtyState(plane).allRowsDirty = true;
  }

  function register(node: {
    stack: RenderStack;
    plane?: TerminalRenderPlane;
    zIndex?: number;
    rect?: RenderRect | null;
    paint: (dirtyRows?: readonly number[]) => void;
  }): RenderNode {
    const id = `r${nextNodeId++}`;
    const rect = node.rect ?? null;
    const { y0, y1 } = rectToYBounds(rect);
    const full: RenderNode = Object.freeze({
      id,
      stack: node.stack,
      plane: node.plane ?? "default",
      zIndex: node.zIndex ?? 0,
      order: ++orderCounter,
      rect,
      rectY0: y0,
      rectY1: y1,
      paint: node.paint,
    });
    nodes.set(id, full);
    addToRowBuckets(full);
    markRect(full.plane, full.rect);
    sortedDirty = true;
    return full;
  }

  function update(
    id: string,
    next: Partial<{
      stack: RenderStack;
      plane: TerminalRenderPlane;
      zIndex: number;
      rect: RenderRect | null;
      dirtyRowsHint: readonly number[];
      paint: (dirtyRows?: readonly number[]) => void;
    }>,
  ): void {
    const prev = nodes.get(id);
    if (!prev) return;
    const sortChanged =
      (next.stack && next.stack !== prev.stack) ||
      (typeof next.zIndex === "number" && next.zIndex !== prev.zIndex);
    const nextPlane = next.plane ?? prev.plane;
    const planeChanged = nextPlane !== prev.plane;
    const hasRect = Object.prototype.hasOwnProperty.call(next, "rect");
    const nextRect = hasRect ? (next.rect ?? null) : prev.rect;
    const rectChanged = !sameRect(prev.rect, nextRect);
    const bucketChanged = planeChanged || rectChanged;
    const { y0, y1 } = rectToYBounds(nextRect);
    const dirtyRowsHint = next.dirtyRowsHint;
    const canUseDirtyRowsHint =
      !sortChanged &&
      !rectChanged &&
      nextPlane === prev.plane &&
      dirtyRowsHint != null &&
      dirtyRowsHint.length > 0;
    if (canUseDirtyRowsHint) {
      markRows(nextPlane, dirtyRowsHint);
    } else {
      markRect(prev.plane, prev.rect);
      markRect(nextPlane, nextRect);
    }
    if (bucketChanged) removeFromRowBuckets(prev);
    const full: RenderNode = Object.freeze({
      ...prev,
      stack: next.stack ?? prev.stack,
      plane: nextPlane,
      zIndex: next.zIndex ?? prev.zIndex,
      rect: nextRect,
      rectY0: y0,
      rectY1: y1,
      paint: next.paint ?? prev.paint,
    });
    nodes.set(id, full);
    if (bucketChanged) addToRowBuckets(full);
    if (sortChanged || planeChanged) {
      sortedDirty = true;
    } else if (!sortedDirty) {
      const sortedIndex = sortedNodeIndexById.get(id);
      if (sortedIndex != null) sortedNodes[sortedIndex] = full;
      const planeNodes = sortedNodesByPlane.get(nextPlane);
      const planeIndex = sortedPlaneNodeIndexById.get(id);
      if (planeNodes && planeIndex != null) planeNodes[planeIndex] = full;
    }
  }

  function unregister(id: string): void {
    const prev = nodes.get(id);
    if (prev) {
      markRect(prev.plane, prev.rect);
      removeFromRowBuckets(prev);
    }
    nodes.delete(id);
    sortedDirty = true;
  }

  function getStackPath(stack: RenderStack): readonly PathSegment[] {
    const cached = stackPathCache.get(stack);
    if (cached) return cached;
    const out: PathSegment[] = [];
    let cur: RenderStack | null = stack;
    while (cur) {
      out.push({ zIndex: cur.zIndex, order: cur.order, id: cur.id });
      cur = cur.parent;
    }
    out.reverse();
    stackPathCache.set(stack, out);
    return out;
  }

  function compareNodes(a: RenderNode, b: RenderNode): number {
    if (a.id === b.id) return 0;
    const ap = getStackPath(a.stack);
    const bp = getStackPath(b.stack);
    const stackLen = Math.min(ap.length, bp.length);
    for (let i = 0; i < stackLen; i++) {
      const as = ap[i]!;
      const bs = bp[i]!;
      if (as.id === bs.id) continue;
      if (as.zIndex !== bs.zIndex) return as.zIndex - bs.zIndex;
      return as.order - bs.order;
    }
    if (ap.length !== bp.length) return ap.length - bp.length;
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    return a.order - b.order;
  }

  function hasPendingDirtyWork(requestedPlanes: readonly TerminalRenderPlane[]): boolean {
    for (const plane of requestedPlanes) {
      const state = planeDirtyStates.get(plane);
      if (!state) continue;
      if (state.allRowsDirty || state.dirtyRowCount > 0) return true;
    }
    return false;
  }

  function render(options?: { activePlanes?: TerminalRenderPlanes | null }): RenderStats | null {
    const renderStart = profiler?.now();
    const activePlanes = options?.activePlanes ?? null;
    const requestedPlanes = activePlanes ?? TERMINAL_RENDER_PLANES;
    const env = process?.env;

    if (env?.DIMCODE_DEBUG === "1") renderMgrDebugLog.render("[RENDER-MANAGER] render() called");

    if (!hasPendingDirtyWork(requestedPlanes)) {
      if (env?.DIMCODE_DEBUG === "1")
        renderMgrDebugLog.render("[RENDER-MANAGER] render() skipped (no dirty rows)");
      return null;
    }

    const sortedThisRender = sortedDirty;
    if (sortedDirty) {
      sortedNodes = Array.from(nodes.values()).sort(compareNodes);
      sortedNodesByPlane = new Map<TerminalRenderPlane, RenderNode[]>();
      sortedNodeIndexById = new Map<string, number>();
      sortedPlaneNodeIndexById = new Map<string, number>();
      for (let i = 0; i < sortedNodes.length; i++) {
        const node = sortedNodes[i]!;
        sortedNodeIndexById.set(node.id, i);
        const planeNodes = sortedNodesByPlane.get(node.plane);
        if (planeNodes) {
          sortedPlaneNodeIndexById.set(node.id, planeNodes.length);
          planeNodes.push(node);
        } else {
          sortedPlaneNodeIndexById.set(node.id, 0);
          sortedNodesByPlane.set(node.plane, [node]);
        }
      }
      sortedDirty = false;
    }

    let scannedNodes = 0;
    let paintedNodes = 0;
    let fullRepaint = false;
    const processedPlanes: TerminalRenderPlane[] = [];
    const renderedRows = new Uint8Array(terminalRows);
    let renderedRowCount = 0;

    const markRenderedRows = (rows: readonly number[] | null): void => {
      if (rows === null) {
        renderedRowCount = terminalRows;
        renderedRows.fill(1);
        return;
      }
      for (const y of rows) {
        if (y < 0 || y >= terminalRows || renderedRows[y] === 1) continue;
        renderedRows[y] = 1;
        renderedRowCount++;
      }
    };

    withTextRenderPass(() =>
      terminal.batch(() => {
        for (const plane of requestedPlanes) {
          const state = planeDirtyStates.get(plane);
          if (!state || (!state.allRowsDirty && state.dirtyRowCount === 0)) continue;

          const planeNodes = sortedNodesByPlane.get(plane) ?? [];
          const isFullPlaneRepaint = state.allRowsDirty;
          let rows: number[] = allRows;

          if (!isFullPlaneRepaint) {
            rows = [];
            const startY = Number.isFinite(state.dirtyMinY) ? state.dirtyMinY : 0;
            const endY = state.dirtyMaxY;
            for (let y = startY; y <= endY; y++) {
              if (state.dirtyRowBits[y] === 1) rows.push(y);
            }
          }

          if (!isFullPlaneRepaint && rows.length === 0) {
            clearDirtyState(state);
            continue;
          }

          resetPlaneRowsForRender(terminal, plane, isFullPlaneRepaint ? null : rows);

          const paintRows = isFullPlaneRepaint ? undefined : rows;
          const candidateNodes = isFullPlaneRepaint
            ? planeNodes
            : (() => {
                // TODO: Phase 2 — reuse a scratch set/array across frames to reduce
                // per-frame allocation for high-frequency scroll. A numeric node index
                // with a Uint8Array/generation marker could also eliminate string Set overhead.
                // Row bucket degradation: skip bucket collection when dirty rows cover > 50% of terminal
                const dirtyRatio = rows.length / terminalRows;
                if (dirtyRatio > 0.5) return planeNodes;
                const ids = new Set<string>();
                const buckets = rowBuckets.get(plane);
                for (const y of rows) {
                  const rowIds = buckets?.get(y);
                  if (!rowIds) continue;
                  for (const id of rowIds) ids.add(id);
                }
                const globalIds = globalNodeIdsByPlane.get(plane);
                if (globalIds) for (const id of globalIds) ids.add(id);
                const candidates = Array.from(ids, (id) => nodes.get(id))
                  .filter((node): node is RenderNode => node != null)
                  .sort(
                    (a, b) =>
                      (sortedPlaneNodeIndexById.get(a.id) ?? 0) -
                      (sortedPlaneNodeIndexById.get(b.id) ?? 0),
                  );
                // Row bucket degradation: fall back to planeNodes when bucket candidates exceed 60%
                return candidates.length > planeNodes.length * 0.6 ? planeNodes : candidates;
              })();
          scannedNodes += candidateNodes.length;

          for (const node of candidateNodes) {
            if (!node.rect) {
              node.paint(paintRows);
              paintedNodes++;
              continue;
            }
            if (isEmptyRect(node.rect)) continue;
            node.paint(paintRows);
            paintedNodes++;
          }

          processedPlanes.push(plane);
          fullRepaint ||= isFullPlaneRepaint;
          markRenderedRows(isFullPlaneRepaint ? null : rows);
          clearDirtyState(state);
        }
      }),
    );

    if (processedPlanes.length === 0) return null;

    if (profiler && renderStart != null) {
      profiler.recordRender({
        durationMs: profiler.now() - renderStart,
        rows: renderedRowCount,
        nodes: scannedNodes,
        fullRepaint,
        sorted: sortedThisRender,
        activePlanes: processedPlanes,
      });
    }

    if (env?.DIMCODE_DEBUG === "1")
      renderMgrDebugLog.render("[RENDER-MANAGER] terminal.batch() completed");

    return {
      rows: renderedRowCount,
      scannedNodes,
      paintedNodes,
      candidatePlanes: processedPlanes,
    };
  }

  return {
    rootStack,
    createStack,
    invalidatePlane,
    scrollPlane,
    register,
    update,
    unregister,
    render,
  };
}
