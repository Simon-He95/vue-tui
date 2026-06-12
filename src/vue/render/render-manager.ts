import type { TerminalRenderPlane, TerminalRenderPlanes } from "../../core/render-plane.js";
import type { Terminal } from "../../core/types.js";
import type { WidthProvider } from "../../core/buffer/width.js";
import { createDebugLogger, isDebugEnabled } from "../../core/debug-logger.js";
import { TERMINAL_RENDER_PLANES } from "../../core/render-plane.js";
import { resetPlaneRowsForRender, scrollPlaneRows } from "../../core/terminal/create-terminal.js";
import {
  createTuiProfiler,
  type CreateTuiProfilerOptions,
} from "../../observability/tui-profiler.js";
import { envFlag } from "../../utils/env.js";
import { clearTextCaches, withTextRenderPass } from "../utils/text.js";

const renderMgrDebugLog = createDebugLogger(isDebugEnabled());
const ROW_BUCKET_CANDIDATE_RATIO_FALLBACK = 0.6;
const ROW_BUCKET_DIRTY_RATIO_FALLBACK = 0.6;
const ROW_BUCKET_DIRTY_RATIO_MIN_ROWS = 16;
const LARGE_RECT_BUCKET_RATIO = 0.5;

function warnDev(message: string): void {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
  if (nodeEnv === "production") return;
  console.warn(message);
}

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
  /**
   * dirtyRows are absolute terminal rows for this node's plane.
   * Components must ignore rows outside their rect.
   */
  paint: (dirtyRows?: readonly number[]) => void;
}>;

export type RenderManager = Readonly<{
  rootStack: RenderStack;
  createStack: (parent: RenderStack, zIndex: number) => RenderStack;
  invalidatePlane: (plane: TerminalRenderPlane) => void;
  /**
   * Dangerous escape hatch: shifts whole terminal rows for the target plane, not a
   * component-local region. Only call when the active renderer consumes terminal
   * scrollOperations or when the caller repaints the whole affected viewport.
   */
  unsafeScrollPlaneRows: (
    plane: TerminalRenderPlane,
    startY: number,
    endY: number,
    delta: number,
  ) => void;
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
      /**
       * Consumed synchronously during update() and must not be retained.
       * Callers may pass scratch arrays for hot-path invalidation.
       * Rows are absolute terminal Y coordinates for the node's plane.
       */
      dirtyRowsHint: readonly number[];
      paint: (dirtyRows?: readonly number[]) => void;
    }>,
  ) => void;
  /**
   * Hot-path dirty row marker for stable nodes. Consumed synchronously and does
   * not replace the RenderNode object.
   *
   * rows are absolute terminal Y coordinates, not local component row offsets.
   * For rect-bound nodes, rows outside the node rect are ignored.
   */
  markDirtyRows: (id: string, rows: readonly number[]) => boolean;
  /** For raw terminal graphics, covered means any overlap by a higher node. */
  isRectCoveredByHigherNode: (id: string, rect: RenderRect) => boolean;
  unregister: (id: string) => void;
  render: (options?: { activePlanes?: TerminalRenderPlanes | null }) => RenderStats | null;
  dispose: () => void;
}>;

export type CreateRenderManagerOptions = Readonly<{
  profiler?: CreateTuiProfilerOptions;
  widthProvider?: WidthProvider;
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

export type RowBucketFallback = Readonly<{
  plane: TerminalRenderPlane;
  reason: "dirty-ratio" | "candidate-ratio";
  dirtyRows: number;
  planeNodes: number;
  candidates?: number;
}>;

export type RenderStats = Readonly<{
  rows: number;
  scannedNodes: number;
  paintedNodes: number;
  candidatePlanes: readonly TerminalRenderPlane[];
  rowBucketFallbacks?: readonly RowBucketFallback[];
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

function rectsIntersect(a: RenderRect, b: RenderRect): boolean {
  if (isEmptyRect(a) || isEmptyRect(b)) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createRenderManager(
  terminal: Terminal,
  options: CreateRenderManagerOptions = {},
): RenderManager {
  const widthProvider = options.widthProvider ?? "default";
  const withRenderTextPass = <T>(fn: () => T): T => withTextRenderPass(fn, widthProvider);
  let orderCounter = 0;
  const nodes = new Map<string, RenderNode>();
  const planeDirtyStates = new Map<TerminalRenderPlane, DirtyPlaneState>();
  const initialSize = terminal.size();
  let terminalCols = initialSize.cols;
  let terminalRows = initialSize.rows;
  let allRows = Array.from({ length: terminalRows }, (_, index) => index);
  let sortedNodes: RenderNode[] = [];
  let sortedNodesByPlane = new Map<TerminalRenderPlane, RenderNode[]>();
  let sortedNodeIndexById = new Map<string, number>();
  let sortedPlaneNodeIndexById = new Map<string, number>();
  let sortedDirty = true;
  const rowBuckets: RenderRowBuckets = new Map();
  const globalNodeIdsByPlane = new Map<TerminalRenderPlane, Set<string>>();
  const largeNodeIdsByPlane = new Map<TerminalRenderPlane, Set<string>>();
  let renderedRowsScratch = new Uint8Array(terminalRows);
  const touchedRenderedRowsScratch: number[] = [];
  const dirtyRowsScratch: number[] = [];
  let candidateMarksScratch = new Uint32Array(0);
  let candidateGeneration = 1;
  const candidateNodesScratch: RenderNode[] = [];
  const warnedLocalDirtyRows = new Set<string>();
  let disposed = false;

  const stackPathCache = new WeakMap<RenderStack, readonly PathSegment[]>();
  const profiler = createTuiProfiler("render-manager", options.profiler);

  const offResize = terminal.on("resize", ({ cols, rows }) => {
    if (disposed) return;
    const colsChanged = cols !== terminalCols;
    terminalCols = cols;
    terminalRows = rows;
    allRows = Array.from({ length: terminalRows }, (_, index) => index);
    for (const state of planeDirtyStates.values()) {
      const prevBits = state.dirtyRowBits;
      state.dirtyRowBits = new Uint8Array(terminalRows);
      state.dirtyRowCount = 0;
      state.dirtyMinY = Number.POSITIVE_INFINITY;
      state.dirtyMaxY = -1;
      const limit = Math.min(terminalRows, prevBits.length);
      for (let y = 0; y < limit; y++) {
        if (prevBits[y] !== 1) continue;
        state.dirtyRowBits[y] = 1;
        state.dirtyRowCount++;
        if (y < state.dirtyMinY) state.dirtyMinY = y;
        if (y > state.dirtyMaxY) state.dirtyMaxY = y;
      }
    }
    rebuildRowBuckets();
    if (colsChanged) clearTextCaches();
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
    const y1 = Math.max(y0, Math.floor(rect.y + rect.h));
    return { y0, y1 };
  }

  function removeFromRowBuckets(node: RenderNode): void {
    const largeIds = largeNodeIdsByPlane.get(node.plane);
    largeIds?.delete(node.id);
    if (largeIds?.size === 0) largeNodeIdsByPlane.delete(node.plane);

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
    if (endY - startY >= terminalRows * LARGE_RECT_BUCKET_RATIO) {
      let largeIds = largeNodeIdsByPlane.get(node.plane);
      if (!largeIds) {
        largeIds = new Set();
        largeNodeIdsByPlane.set(node.plane, largeIds);
      }
      largeIds.add(node.id);
      return;
    }

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
    largeNodeIdsByPlane.clear();
    for (const node of nodes.values()) addToRowBuckets(node);
  }

  function shouldPromoteToFullPlaneDirty(dirtyRows: number, planeNodes: number): boolean {
    return (
      planeNodes > 1 &&
      dirtyRows >= ROW_BUCKET_DIRTY_RATIO_MIN_ROWS &&
      terminalRows > 0 &&
      dirtyRows / terminalRows >= ROW_BUCKET_DIRTY_RATIO_FALLBACK &&
      dirtyRows >= planeNodes * ROW_BUCKET_DIRTY_RATIO_FALLBACK
    );
  }

  function ensureRenderedRowsScratch(): Uint8Array {
    if (renderedRowsScratch.length !== terminalRows) {
      renderedRowsScratch = new Uint8Array(terminalRows);
      touchedRenderedRowsScratch.length = 0;
    }
    return renderedRowsScratch;
  }

  function clearRenderedRowsScratch(rows: Uint8Array): void {
    for (const y of touchedRenderedRowsScratch) rows[y] = 0;
    touchedRenderedRowsScratch.length = 0;
  }

  function markRenderedRow(rows: Uint8Array, y: number): boolean {
    if (y < 0 || y >= terminalRows || rows[y] === 1) return false;
    rows[y] = 1;
    touchedRenderedRowsScratch.push(y);
    return true;
  }

  function warnIfRowsLookLocal(node: RenderNode, rows: readonly number[]): void {
    if (!node.rect || node.rectY0 === 0 || warnedLocalDirtyRows.has(node.id)) return;
    const height = node.rectY1 - node.rectY0;
    if (height <= 0) return;
    let sawRow = false;
    let sawAboveRect = false;
    for (let i = 0; i < rows.length; i++) {
      const y = Math.floor(rows[i] ?? -1);
      if (!Number.isFinite(y) || y < 0 || y >= height) return;
      sawRow = true;
      if (y < node.rectY0) sawAboveRect = true;
    }
    if (!sawRow || !sawAboveRect) return;
    warnedLocalDirtyRows.add(node.id);
    warnDev(
      `[vue-tui] RenderManager markDirtyRows()/dirtyRowsHint rows must be absolute terminal rows for the node's plane. ` +
        `Received rows that look local to a node at y=${node.rectY0}; these rows will be ignored for this node. ` +
        `Add the node y offset before marking dirty rows.`,
    );
  }

  function ensureCandidateMarks(size: number): Uint32Array {
    if (candidateMarksScratch.length < size) {
      candidateMarksScratch = new Uint32Array(size);
    }
    return candidateMarksScratch;
  }

  function beginCandidateCollection(planeNodes: readonly RenderNode[]): Uint32Array {
    candidateNodesScratch.length = 0;
    const marks = ensureCandidateMarks(planeNodes.length);
    candidateGeneration++;
    if (candidateGeneration === 0xffffffff) {
      marks.fill(0);
      candidateGeneration = 1;
    }
    return marks;
  }

  function markCandidateNode(
    planeNodes: readonly RenderNode[],
    marks: Uint32Array,
    node: RenderNode | undefined,
  ): void {
    if (!node) return;
    const index = sortedPlaneNodeIndexById.get(node.id);
    if (index == null || planeNodes[index]?.id !== node.id) return;
    if (marks[index] === candidateGeneration) return;
    marks[index] = candidateGeneration;
    candidateNodesScratch.push(node);
  }

  function sortCandidateNodesByPlaneOrder(): void {
    for (let i = 1; i < candidateNodesScratch.length; i++) {
      const node = candidateNodesScratch[i]!;
      const nodeIndex = sortedPlaneNodeIndexById.get(node.id) ?? 0;
      let j = i - 1;
      while (
        j >= 0 &&
        (sortedPlaneNodeIndexById.get(candidateNodesScratch[j]!.id) ?? 0) > nodeIndex
      ) {
        candidateNodesScratch[j + 1] = candidateNodesScratch[j]!;
        j--;
      }
      candidateNodesScratch[j + 1] = node;
    }
  }

  function markRect(plane: TerminalRenderPlane, rect: RenderRect | null | undefined): void {
    const state = getDirtyState(plane);
    if (!rect) {
      state.allRowsDirty = true;
      return;
    }
    const y0 = Math.floor(rect.y);
    const y1 = Math.max(y0, Math.floor(rect.y + rect.h));
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

  function markRowRange(plane: TerminalRenderPlane, startY: number, endY: number): void {
    const state = getDirtyState(plane);
    const start = Math.max(0, Math.min(terminalRows, Math.floor(startY)));
    const end = Math.max(start, Math.min(terminalRows, Math.floor(endY)));

    for (let y = start; y < end; y++) {
      if (state.dirtyRowBits[y] === 1) continue;
      state.dirtyRowBits[y] = 1;
      state.dirtyRowCount++;
      if (y < state.dirtyMinY) state.dirtyMinY = y;
      if (y > state.dirtyMaxY) state.dirtyMaxY = y;
    }
  }

  function markRectHeightDelta(
    plane: TerminalRenderPlane,
    prev: RenderRect | null,
    next: RenderRect | null,
  ): boolean {
    if (!prev || !next) return false;
    if (prev.x !== next.x || prev.y !== next.y || prev.w !== next.w) return false;

    const prevBounds = rectToYBounds(prev);
    const nextBounds = rectToYBounds(next);
    if (prevBounds.y0 !== nextBounds.y0) return false;

    if (nextBounds.y1 > prevBounds.y1) {
      markRowRange(plane, prevBounds.y1, nextBounds.y1);
    } else if (prevBounds.y1 > nextBounds.y1) {
      markRowRange(plane, nextBounds.y1, prevBounds.y1);
    }
    return true;
  }

  function markRowsForNode(node: RenderNode, rows: readonly number[]): boolean {
    if (!rows.length) return false;
    warnIfRowsLookLocal(node, rows);
    const state = getDirtyState(node.plane);
    let accepted = false;

    for (let i = 0; i < rows.length; i++) {
      const y = Math.floor(rows[i] ?? -1);
      if (!Number.isFinite(y)) continue;
      if (y < 0 || y >= terminalRows) continue;
      if (node.rect && (y < node.rectY0 || y >= node.rectY1)) continue;

      accepted = true;
      if (state.dirtyRowBits[y] === 0) {
        state.dirtyRowBits[y] = 1;
        state.dirtyRowCount++;
        if (y < state.dirtyMinY) state.dirtyMinY = y;
        if (y > state.dirtyMaxY) state.dirtyMaxY = y;
      }
    }

    return accepted;
  }

  function unsafeScrollPlaneRows(
    plane: TerminalRenderPlane,
    startY: number,
    endY: number,
    delta: number,
  ): void {
    if (disposed) return;
    scrollPlaneRows(terminal, plane, startY, endY, delta);
  }

  function invalidatePlane(plane: TerminalRenderPlane): void {
    if (disposed) return;
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
    if (disposed) return full;
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
    if (disposed) return;
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
    // dirtyRowsHint is consumed synchronously here and must use absolute
    // terminal rows for this plane.
    const dirtyRowsHint = next.dirtyRowsHint;
    const canUseDirtyRowsHint =
      !sortChanged &&
      !rectChanged &&
      nextPlane === prev.plane &&
      dirtyRowsHint != null &&
      dirtyRowsHint.length > 0;
    if (canUseDirtyRowsHint) {
      markRowsForNode(prev, dirtyRowsHint);
    } else if (
      rectChanged &&
      !sortChanged &&
      !planeChanged &&
      markRectHeightDelta(prev.plane, prev.rect, nextRect)
    ) {
      // Only the clipped bottom changed; repaint/clear the tail rows, not the stable overlap.
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

  function markDirtyRows(id: string, rows: readonly number[]): boolean {
    if (disposed) return false;
    if (!rows.length) return false;
    const node = nodes.get(id);
    if (!node) return false;
    return markRowsForNode(node, rows);
  }

  function isRectCoveredByHigherNode(id: string, rect: RenderRect): boolean {
    if (disposed || isEmptyRect(rect)) return false;
    const owner = nodes.get(id);
    if (!owner) return false;
    const ownerPlaneIndex = TERMINAL_RENDER_PLANES.indexOf(owner.plane);
    if (ownerPlaneIndex < 0) return false;

    for (const candidate of nodes.values()) {
      if (candidate.id === id || !candidate.rect || isEmptyRect(candidate.rect)) continue;
      if (!rectsIntersect(rect, candidate.rect)) continue;

      const candidatePlaneIndex = TERMINAL_RENDER_PLANES.indexOf(candidate.plane);
      if (candidatePlaneIndex > ownerPlaneIndex) return true;
      if (candidatePlaneIndex === ownerPlaneIndex && compareNodes(owner, candidate) < 0)
        return true;
    }

    return false;
  }

  function unregister(id: string): void {
    if (disposed) return;
    const prev = nodes.get(id);
    if (prev) {
      markRect(prev.plane, prev.rect);
      removeFromRowBuckets(prev);
      warnedLocalDirtyRows.delete(id);
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
    if (disposed) return null;
    const renderStart = profiler?.now();
    const activePlanes = options?.activePlanes ?? null;
    const requestedPlanes = activePlanes ?? TERMINAL_RENDER_PLANES;
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;

    function intersectsDirtyRows(y0: number, y1: number, rows: readonly number[]): boolean {
      if (y1 <= y0 || rows.length === 0) return false;
      let lo = 0;
      let hi = rows.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((rows[mid] ?? 0) < y0) lo = mid + 1;
        else hi = mid;
      }
      const y = rows[lo];
      return y != null && y < y1;
    }

    if (envFlag(env, "VUE_TUI_DEBUG", "DIMCODE_DEBUG"))
      renderMgrDebugLog.render("[RENDER-MANAGER] render() called");

    if (!hasPendingDirtyWork(requestedPlanes)) {
      if (envFlag(env, "VUE_TUI_DEBUG", "DIMCODE_DEBUG"))
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
    const rowBucketFallbacks: RowBucketFallback[] = [];
    const renderedRows = ensureRenderedRowsScratch();
    clearRenderedRowsScratch(renderedRows);
    let renderedRowCount = 0;

    const markRenderedRows = (rows: readonly number[] | null): void => {
      if (rows === null) {
        for (let y = 0; y < terminalRows; y++) {
          if (markRenderedRow(renderedRows, y)) renderedRowCount++;
        }
        return;
      }
      for (const y of rows) {
        if (markRenderedRow(renderedRows, y)) renderedRowCount++;
      }
    };

    withRenderTextPass(() =>
      terminal.batch(() => {
        for (const plane of requestedPlanes) {
          const state = planeDirtyStates.get(plane);
          if (!state || (!state.allRowsDirty && state.dirtyRowCount === 0)) continue;

          const planeNodes = sortedNodesByPlane.get(plane) ?? [];
          let isFullPlaneRepaint = state.allRowsDirty;
          let rows: number[] = allRows;

          if (
            !isFullPlaneRepaint &&
            shouldPromoteToFullPlaneDirty(state.dirtyRowCount, planeNodes.length)
          ) {
            isFullPlaneRepaint = true;
            state.allRowsDirty = true;
            rowBucketFallbacks.push({
              plane,
              reason: "dirty-ratio",
              dirtyRows: state.dirtyRowCount,
              planeNodes: planeNodes.length,
            });
          }

          if (!isFullPlaneRepaint) {
            dirtyRowsScratch.length = 0;
            rows = dirtyRowsScratch;
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
          // Track whether candidateNodes need dirty-row intersection filtering.
          // Row bucket candidates are already pre-filtered to only include nodes
          // that touch dirty rows, so they don't need intersection checks.
          // But when we fall back to planeNodes (degradation threshold), we must
          // still filter out nodes whose rects don't intersect any dirty rows.
          let needsIntersectFilter = false;
          const candidateNodes = isFullPlaneRepaint
            ? planeNodes
            : (() => {
                const marks = beginCandidateCollection(planeNodes);
                const buckets = rowBuckets.get(plane);
                for (const y of rows) {
                  const rowIds = buckets?.get(y);
                  if (!rowIds) continue;
                  for (const id of rowIds) {
                    markCandidateNode(planeNodes, marks, nodes.get(id));
                  }
                }
                const largeIds = largeNodeIdsByPlane.get(plane);
                if (largeIds) {
                  for (const id of largeIds) {
                    const node = nodes.get(id);
                    if (!node) continue;
                    if (intersectsDirtyRows(node.rectY0, node.rectY1, rows)) {
                      markCandidateNode(planeNodes, marks, node);
                    }
                  }
                }
                const globalIds = globalNodeIdsByPlane.get(plane);
                if (globalIds) {
                  for (const id of globalIds) markCandidateNode(planeNodes, marks, nodes.get(id));
                }
                sortCandidateNodesByPlaneOrder();
                // Row bucket degradation: fall back to planeNodes when bucket candidates exceed 60%
                if (
                  candidateNodesScratch.length < planeNodes.length &&
                  candidateNodesScratch.length >
                    planeNodes.length * ROW_BUCKET_CANDIDATE_RATIO_FALLBACK
                ) {
                  needsIntersectFilter = true;
                  rowBucketFallbacks.push({
                    plane,
                    reason: "candidate-ratio",
                    dirtyRows: rows.length,
                    planeNodes: planeNodes.length,
                    candidates: candidateNodesScratch.length,
                  });
                  return planeNodes;
                }
                return candidateNodesScratch;
              })();
          scannedNodes += candidateNodes.length;

          for (const node of candidateNodes) {
            if (!node.rect) {
              node.paint(paintRows);
              paintedNodes++;
              continue;
            }
            if (isEmptyRect(node.rect)) continue;
            // When falling back to full plane scan, skip nodes whose rects
            // don't intersect any dirty rows — this avoids painting nodes
            // that the bucket path would have naturally excluded.
            if (needsIntersectFilter && !intersectsDirtyRows(node.rectY0, node.rectY1, rows)) {
              continue;
            }
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

    if (envFlag(env, "VUE_TUI_DEBUG", "DIMCODE_DEBUG"))
      renderMgrDebugLog.render("[RENDER-MANAGER] terminal.batch() completed");

    const stats: RenderStats = {
      rows: renderedRowCount,
      scannedNodes,
      paintedNodes,
      candidatePlanes: processedPlanes,
    };
    if (rowBucketFallbacks.length) {
      return {
        ...stats,
        rowBucketFallbacks,
      };
    }
    return stats;
  }

  return {
    rootStack,
    createStack,
    invalidatePlane,
    unsafeScrollPlaneRows,
    register,
    update,
    markDirtyRows,
    isRectCoveredByHigherNode,
    unregister,
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      offResize();
      profiler?.dispose();
    },
  };
}
