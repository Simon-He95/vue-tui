import type { GridBuffer } from "../buffer/buffer.js";
import type { TerminalRenderPlane, TerminalRenderPlanes } from "../render-plane.js";
import type {
  BufferSnapshot,
  Cell,
  Style,
  Terminal,
  TerminalEventMap,
  TerminalOptions,
  TerminalScrollOperation,
} from "../types.js";
import type { WidthProvider } from "../buffer/width.js";
import { parseAnsiSgr } from "../ansi/sgr.js";
import {
  clearRect,
  createBlankCell,
  createGridBuffer,
  fillRect,
  getBufferCell,
  getBufferRow,
  getRowFingerprints,
  markAllDirty,
  markDirty,
  putCell,
  resizeBuffer,
  scrollBuffer,
  scrollBufferRegion,
  setFingerprintFn,
  snapshotText,
} from "../buffer/buffer.js";
import { TERMINAL_RENDER_PLANES } from "../render-plane.js";
import { Emitter } from "./emitter.js";

type GraphemeSegment = Readonly<{ segment: string }>;
type GraphemeSegmenter = Readonly<{ segment(input: string): Iterable<GraphemeSegment> }>;
type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: Readonly<{ granularity?: "grapheme" }>,
  ) => GraphemeSegmenter;
};

function isControlChar(ch: string): boolean {
  return ch === "\n" || ch === "\r" || ch === "\t";
}

function mergePlanes(
  prev: TerminalRenderPlanes | null,
  next: TerminalRenderPlanes | null | undefined,
): TerminalRenderPlanes | null {
  if (!prev?.length) return next?.length ? [...next] : null;
  if (!next?.length) return prev;
  const merged = new Set(prev);
  for (const plane of next) merged.add(plane);
  return Array.from(merged);
}

const TERMINAL_PLANE_INTERNALS = Symbol.for("@simon_he/vue-tui:v1:terminal-plane-internals");

interface PlaneBufferState {
  buffer: GridBuffer;
  coverage: Uint8Array[];
}

interface PendingPlaneScrollOperation extends TerminalScrollOperation {
  plane: TerminalRenderPlane;
}

interface PlaneTerminalInternals {
  getPlaneTerminal: (plane: TerminalRenderPlane) => Terminal;
  resetRowsForRender: (plane: TerminalRenderPlane, dirtyRows: readonly number[] | null) => void;
  getRowCoverageKind: (plane: TerminalRenderPlane, y: number) => 0 | 1 | 2;
  getComposedRowBeforePlane: (plane: TerminalRenderPlane, y: number) => readonly Cell[] | null;
  scrollRows: (plane: TerminalRenderPlane, startY: number, endY: number, lines: number) => void;
}

type PlaneAwareTerminal = Terminal & {
  [TERMINAL_PLANE_INTERNALS]?: PlaneTerminalInternals;
};

function createCoverage(cols: number, rows: number): Uint8Array[] {
  return Array.from({ length: rows }, () => new Uint8Array(cols));
}

function resizeCoverage(prev: readonly Uint8Array[], cols: number, rows: number): Uint8Array[] {
  const next = createCoverage(cols, rows);
  const copyRows = Math.min(prev.length, rows);
  for (let y = 0; y < copyRows; y++) {
    const src = prev[y]!;
    const dst = next[y]!;
    dst.set(src.subarray(0, Math.min(src.length, cols)));
  }
  return next;
}

function setBufferClean(buffer: GridBuffer): void {
  buffer.dirtyBits.fill(0);
  buffer.dirtyCount = 0;
  buffer.dirtyMin = Number.POSITIVE_INFINITY;
  buffer.dirtyMax = -1;
  buffer.dirtyAll = false;
}

function createPlaneState(
  cols: number,
  rows: number,
  widthProvider: WidthProvider,
): PlaneBufferState {
  const buffer = createGridBuffer(cols, rows, { widthProvider });
  setBufferClean(buffer);
  buffer.cursorVisible = false;
  return {
    buffer,
    coverage: createCoverage(cols, rows),
  };
}

function collectAndClearDirtyRows(buffer: GridBuffer): readonly number[] | null {
  if (buffer.rows === 0) return [];
  if (buffer.dirtyAll) {
    buffer.dirtyAll = false;
    buffer.dirtyBits.fill(0);
    buffer.dirtyCount = 0;
    buffer.dirtyMin = Number.POSITIVE_INFINITY;
    buffer.dirtyMax = -1;
    return null;
  }
  if (buffer.dirtyCount === 0) return [];
  const out: number[] = [];
  const start = Math.max(0, buffer.dirtyMin);
  const end = Math.min(buffer.rows - 1, buffer.dirtyMax);
  for (let y = start; y <= end; y++) {
    if (buffer.dirtyBits[y]) {
      buffer.dirtyBits[y] = 0;
      out.push(y);
      if (out.length === buffer.dirtyCount) break;
    }
  }
  buffer.dirtyCount = 0;
  buffer.dirtyMin = Number.POSITIVE_INFINITY;
  buffer.dirtyMax = -1;
  return out;
}

function peekDirtyRows(buffer: GridBuffer): readonly number[] | null {
  if (buffer.rows === 0) return [];
  if (buffer.dirtyAll) return null;
  if (buffer.dirtyCount === 0) return [];
  const out: number[] = [];
  const start = Math.max(0, buffer.dirtyMin);
  const end = Math.min(buffer.rows - 1, buffer.dirtyMax);
  for (let y = start; y <= end; y++) {
    if (buffer.dirtyBits[y]) {
      out.push(y);
      if (out.length === buffer.dirtyCount) break;
    }
  }
  return out;
}

function clearPlaneCoverageRow(state: PlaneBufferState, y: number): void {
  if (y < 0 || y >= state.buffer.rows) return;
  const row = getBufferRow(state.buffer, y);
  const blank = createBlankCell();
  row.length = state.buffer.cols;
  for (let x = 0; x < state.buffer.cols; x++) row[x] = blank;
  state.coverage[y]?.fill(0);
  markDirty(state.buffer, y);
}

function markPlaneCoverageRange(
  state: PlaneBufferState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: 0 | 1,
): void {
  for (let y = y0; y < y1; y++) {
    const row = state.coverage[y];
    if (!row) continue;
    row.fill(value, x0, x1);
  }
}

function markPlaneCoverageForPut(
  state: PlaneBufferState,
  x: number,
  y: number,
  ch: string,
  prevCell: Cell | null,
): void {
  const row = state.coverage[y];
  if (!row) return;
  if (prevCell?.continuation && x > 0) row[x - 1] = 1;
  if (prevCell?.width === 2 && x + 1 < row.length) row[x + 1] = 1;
  row[x] = 1;
  if (ch !== " " && x + 1 < row.length) {
    const next = getBufferCell(state.buffer, x, y);
    if (next.width === 2) row[x + 1] = 1;
  }
}

function scrollPlaneCoverage(state: PlaneBufferState, lines: number): void {
  const n = Math.trunc(lines);
  if (n === 0 || state.coverage.length === 0) return;
  const rows = state.coverage.length;
  const cols = state.buffer.cols;
  if (Math.abs(n) >= rows) {
    for (const row of state.coverage) row.fill(0);
    return;
  }
  if (n > 0) {
    state.coverage.splice(0, n);
    for (let i = 0; i < n; i++) state.coverage.push(new Uint8Array(cols));
    return;
  }
  state.coverage.splice(rows + n, -n);
  for (let i = 0; i < -n; i++) state.coverage.unshift(new Uint8Array(cols));
}

function scrollPlaneCoverageRegion(
  state: PlaneBufferState,
  startY: number,
  endY: number,
  lines: number,
): void {
  const n = Math.trunc(lines);
  if (n === 0 || state.coverage.length === 0) return;
  const start = Math.max(0, Math.min(state.coverage.length, Math.floor(startY)));
  const end = Math.max(0, Math.min(state.coverage.length, Math.floor(endY)));
  const height = end - start;
  if (height <= 0) return;

  const cols = state.buffer.cols;
  if (Math.abs(n) >= height) {
    for (let y = start; y < end; y++) state.coverage[y] = new Uint8Array(cols);
    return;
  }

  const region = state.coverage.slice(start, end);
  const next: Uint8Array[] = Array.from({ length: height }, () => new Uint8Array(0));
  if (n > 0) {
    const movedCount = height - n;
    for (let i = 0; i < movedCount; i++) next[i] = region[i + n]!;
    for (let i = 0; i < n; i++) next[movedCount + i] = new Uint8Array(cols);
  } else {
    const insertedCount = -n;
    const movedCount = height - insertedCount;
    for (let i = 0; i < insertedCount; i++) next[i] = new Uint8Array(cols);
    for (let i = 0; i < movedCount; i++) next[insertedCount + i] = region[i]!;
  }

  for (let i = 0; i < height; i++) state.coverage[start + i] = next[i]!;
}

function resizePlaneState(state: PlaneBufferState, cols: number, rows: number): void {
  resizeBuffer(state.buffer, cols, rows);
  state.coverage = resizeCoverage(state.coverage, state.buffer.cols, state.buffer.rows);
}

function normalizeDirtyRows(
  rows: readonly number[] | null,
  totalRows: number,
): readonly number[] | null {
  if (rows === null) return null;
  if (rows.length === 0) return rows;
  const out: number[] = [];
  for (const y of rows) {
    const yy = Math.floor(y);
    if (yy < 0 || yy >= totalRows) continue;
    if (out[out.length - 1] === yy) continue;
    out.push(yy);
  }
  return out;
}

// Shared Intl.Segmenter instance for grapheme cluster iteration
let sharedGraphemeSegmenter: GraphemeSegmenter | null = null;
try {
  const Segmenter = (Intl as IntlWithSegmenter).Segmenter;
  sharedGraphemeSegmenter = Segmenter
    ? new Segmenter(undefined, { granularity: "grapheme" })
    : null;
} catch {
  // Fall back to code point iteration if Intl.Segmenter is not available
}

function needsGraphemeSegmentation(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x200d) return true;
    if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return true;
    if (
      (cp >= 0x0300 && cp <= 0x036f) ||
      (cp >= 0x1ab0 && cp <= 0x1aff) ||
      (cp >= 0x1dc0 && cp <= 0x1dff) ||
      (cp >= 0x20d0 && cp <= 0x20ff) ||
      (cp >= 0xfe20 && cp <= 0xfe2f)
    ) {
      return true;
    }
    if (cp >= 0x1f3fb && cp <= 0x1f3ff) return true;
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return true;
  }
  return false;
}

export function getPlaneTerminal(terminal: Terminal, plane: TerminalRenderPlane): Terminal {
  const internals = (terminal as PlaneAwareTerminal)[TERMINAL_PLANE_INTERNALS];
  return internals?.getPlaneTerminal(plane) ?? terminal;
}

export function resetPlaneRowsForRender(
  terminal: Terminal,
  plane: TerminalRenderPlane,
  dirtyRows: readonly number[] | null,
): void {
  const internals = (terminal as PlaneAwareTerminal)[TERMINAL_PLANE_INTERNALS];
  internals?.resetRowsForRender(plane, dirtyRows);
}

export function getPlaneRowCoverageKind(
  terminal: Terminal,
  plane: TerminalRenderPlane,
  y: number,
): 0 | 1 | 2 {
  const internals = (terminal as PlaneAwareTerminal)[TERMINAL_PLANE_INTERNALS];
  return internals?.getRowCoverageKind(plane, y) ?? 0;
}

export function getComposedRowBeforePlane(
  terminal: Terminal,
  plane: TerminalRenderPlane,
  y: number,
): readonly Cell[] | null {
  const internals = (terminal as PlaneAwareTerminal)[TERMINAL_PLANE_INTERNALS];
  return internals?.getComposedRowBeforePlane(plane, y) ?? null;
}

export function scrollPlaneRows(
  terminal: Terminal,
  plane: TerminalRenderPlane,
  startY: number,
  endY: number,
  lines: number,
): void {
  const internals = (terminal as PlaneAwareTerminal)[TERMINAL_PLANE_INTERNALS];
  internals?.scrollRows(plane, startY, endY, lines);
}

export function createTerminal(opts: TerminalOptions): Terminal {
  const widthProvider = opts.widthProvider ?? "default";
  const emitter = new Emitter<TerminalEventMap>();
  const compositeBuffer = createGridBuffer(opts.cols, opts.rows, {
    widthProvider,
  });
  const planeStates = new Map<TerminalRenderPlane, PlaneBufferState>();
  let disposed = false;
  let batchingDepth = 0;
  let pendingCommit = false;
  let pendingCommitAllPlanes = false;
  let pendingCommitPlanes: TerminalRenderPlanes | null = null;
  const pendingPlaneScrollOps = new Map<TerminalRenderPlane, TerminalScrollOperation[]>();
  const planeTerminals = new Map<TerminalRenderPlane, Terminal>();
  let base!: PlaneAwareTerminal;

  compositeBuffer.cursorVisible = false;

  function assertNotDisposed(): void {
    if (disposed) throw new Error("Terminal is disposed");
  }

  function getPlaneState(plane: TerminalRenderPlane): PlaneBufferState {
    let state = planeStates.get(plane);
    if (!state) {
      state = createPlaneState(compositeBuffer.cols, compositeBuffer.rows, widthProvider);
      planeStates.set(plane, state);
    }
    return state;
  }

  function setCursorForPlane(
    plane: TerminalRenderPlane,
    x: number,
    y: number,
    visible = true,
  ): void {
    const state = getPlaneState(plane);
    state.buffer.cursorX = Math.max(0, Math.min(state.buffer.cols, Math.floor(x)));
    state.buffer.cursorY = Math.max(
      0,
      Math.min(state.buffer.rows ? state.buffer.rows - 1 : 0, Math.floor(y)),
    );
    state.buffer.cursorVisible = visible;
    markDirty(state.buffer, state.buffer.cursorY);
  }

  function putForPlane(
    plane: TerminalRenderPlane,
    x: number,
    y: number,
    ch: string,
    style?: Style,
  ): void {
    const state = getPlaneState(plane);
    if (y < 0 || y >= state.buffer.rows || x < 0 || x >= state.buffer.cols) return;
    const prevCell = getBufferCell(state.buffer, x, y);
    putCell(state.buffer, x, y, ch, style);
    markPlaneCoverageForPut(state, x, y, ch, prevCell);
  }

  function writeAtForPlane(
    plane: TerminalRenderPlane,
    text: string,
    x: number,
    y: number,
    style?: Style,
  ): { x: number; y: number } {
    const state = getPlaneState(plane);
    let cx = x;
    let cy = y;
    if (state.buffer.cols === 0 || state.buffer.rows === 0) return { x: cx, y: cy };

    const writeChar = (ch: string): boolean => {
      if (isControlChar(ch)) {
        if (ch === "\n") {
          cx = 0;
          cy += 1;
          if (cy >= state.buffer.rows) {
            scrollBuffer(state.buffer, 1);
            scrollPlaneCoverage(state, 1);
            cy = state.buffer.rows - 1;
          }
        } else if (ch === "\r") {
          cx = 0;
        } else if (ch === "\t") {
          const tabSize = 4;
          const next = Math.min(state.buffer.cols, cx + (tabSize - (cx % tabSize)));
          for (; cx < next; cx++) putForPlane(plane, cx, cy, " ", style);
        }
        return true;
      }

      if (cy < 0 || cy >= state.buffer.rows) return false;
      if (cx >= state.buffer.cols) {
        cx = 0;
        cy += 1;
      }
      if (cy >= state.buffer.rows) {
        scrollBuffer(state.buffer, 1);
        scrollPlaneCoverage(state, 1);
        cy = state.buffer.rows - 1;
      }

      putForPlane(plane, cx, cy, ch, style);
      const width = ch === " " ? 1 : getBufferCell(state.buffer, cx, cy).width || 1;
      cx += width;
      return true;
    };

    if (needsGraphemeSegmentation(text)) {
      if (sharedGraphemeSegmenter) {
        for (const seg of sharedGraphemeSegmenter.segment(text)) {
          if (!writeChar(seg.segment)) break;
        }
      } else {
        for (const ch of text) {
          if (!writeChar(ch)) break;
        }
      }
      return { x: cx, y: cy };
    }

    let i = 0;
    for (; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 0x7f) break;
      if (!writeChar(text[i]!)) return { x: cx, y: cy };
    }

    if (i < text.length) {
      const rest = text.slice(i);
      if (sharedGraphemeSegmenter) {
        for (const seg of sharedGraphemeSegmenter.segment(rest)) {
          if (!writeChar(seg.segment)) break;
        }
      } else {
        for (const ch of rest) {
          if (!writeChar(ch)) break;
        }
      }
    }

    return { x: cx, y: cy };
  }

  function clearForPlane(
    plane: TerminalRenderPlane,
    x?: number,
    y?: number,
    w?: number,
    h?: number,
  ): void {
    const state = getPlaneState(plane);
    clearRect(state.buffer, x, y, w, h);
    if (x == null || y == null || w == null || h == null) {
      for (const row of state.coverage) row.fill(1);
      return;
    }
    if (w <= 0 || h <= 0) return;
    const x0 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x)));
    const y0 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y)));
    const x1 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x + w)));
    const y1 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y + h)));
    if (x1 <= x0 || y1 <= y0) return;
    markPlaneCoverageRange(state, x0, y0, x1, y1, 1);
  }

  function fillForPlane(
    plane: TerminalRenderPlane,
    x: number,
    y: number,
    w: number,
    h: number,
    ch?: string,
    style?: Style,
  ): void {
    const state = getPlaneState(plane);
    fillRect(state.buffer, x, y, w, h, ch ?? " ", style);
    if (w <= 0 || h <= 0 || state.buffer.cols === 0 || state.buffer.rows === 0) return;
    const x0 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x)));
    const y0 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y)));
    const x1 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x + w)));
    const y1 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y + h)));
    if (x1 <= x0 || y1 <= y0) return;
    markPlaneCoverageRange(state, x0, y0, x1, y1, 1);
  }

  function scrollForPlane(plane: TerminalRenderPlane, lines: number): void {
    const state = getPlaneState(plane);
    scrollBuffer(state.buffer, lines);
    scrollPlaneCoverage(state, lines);
  }

  function normalizeScrollOperation(
    startY: number,
    endY: number,
    delta: number,
    totalRows: number,
  ): TerminalScrollOperation | null {
    const start = Math.max(0, Math.min(totalRows, Math.floor(startY)));
    const end = Math.max(0, Math.min(totalRows, Math.floor(endY)));
    const height = end - start;
    const lines = Math.trunc(delta);
    if (height <= 0 || lines === 0 || Math.abs(lines) >= height) return null;
    return { startY: start, endY: end, delta: lines };
  }

  function recordPendingScrollOp(plane: TerminalRenderPlane, op: TerminalScrollOperation): void {
    const list = pendingPlaneScrollOps.get(plane) ?? [];
    const last = list[list.length - 1];

    if (
      last &&
      last.startY === op.startY &&
      last.endY === op.endY &&
      Math.sign(last.delta) === Math.sign(op.delta)
    ) {
      const next = normalizeScrollOperation(
        op.startY,
        op.endY,
        last.delta + op.delta,
        compositeBuffer.rows,
      );
      if (next) list[list.length - 1] = next;
      else list.push(op);
    } else {
      list.push(op);
    }

    pendingPlaneScrollOps.set(plane, list);
  }

  function takePendingScrollOps(
    planes: TerminalRenderPlanes | null | undefined,
  ): readonly PendingPlaneScrollOperation[] | null {
    const planesToTake = planes?.length ? planes : TERMINAL_RENDER_PLANES;
    const out: PendingPlaneScrollOperation[] = [];
    for (const plane of planesToTake) {
      const ops = pendingPlaneScrollOps.get(plane);
      if (!ops?.length) continue;
      pendingPlaneScrollOps.delete(plane);
      for (const op of ops) out.push({ plane, ...op });
    }
    return out.length ? out : null;
  }

  function higherPlanesFor(plane: TerminalRenderPlane): readonly TerminalRenderPlane[] {
    const planeIndex = TERMINAL_RENDER_PLANES.indexOf(plane);
    if (planeIndex < 0) return [];
    return TERMINAL_RENDER_PLANES.slice(planeIndex + 1);
  }

  function higherPlaneCoverageKind(plane: TerminalRenderPlane, y: number): 0 | 1 | 2 {
    const higherPlanes = higherPlanesFor(plane);
    if (!higherPlanes.length || y < 0 || y >= compositeBuffer.rows) return 0;

    let covered = 0;
    for (let x = 0; x < compositeBuffer.cols; x++) {
      let cellCovered = false;
      for (const higherPlane of higherPlanes) {
        const state = planeStates.get(higherPlane);
        if (state?.coverage[y]?.[x]) {
          cellCovered = true;
          break;
        }
      }
      if (cellCovered) covered++;
    }

    if (covered === 0) return 0;
    if (covered >= compositeBuffer.cols) return 2;
    return 1;
  }

  function addAffectedRows(out: Set<number>, op: Readonly<{ startY: number; endY: number }>): void {
    for (let y = op.startY; y < op.endY; y++) out.add(y);
  }

  function areDisjointSorted(ops: readonly TerminalScrollOperation[]): boolean {
    for (let i = 1; i < ops.length; i++) {
      if (ops[i - 1]!.endY > ops[i]!.startY) return false;
    }
    return true;
  }

  function groupedPendingScrollOps(
    pendingOps: readonly PendingPlaneScrollOperation[],
  ): Map<TerminalRenderPlane, TerminalScrollOperation[]> {
    const grouped = new Map<TerminalRenderPlane, TerminalScrollOperation[]>();
    for (const pending of pendingOps) {
      const list = grouped.get(pending.plane) ?? [];
      list.push({
        startY: pending.startY,
        endY: pending.endY,
        delta: pending.delta,
      });
      grouped.set(pending.plane, list);
    }
    return grouped;
  }

  function prepareCompositeScrollOps(
    pendingOps: readonly PendingPlaneScrollOperation[] | null,
  ): Readonly<{
    scrollOperations: readonly TerminalScrollOperation[] | null;
    extraDirtyRows: readonly number[];
  }> {
    if (!pendingOps?.length) {
      return {
        scrollOperations: null,
        extraDirtyRows: [],
      };
    }

    const scrollOperations: TerminalScrollOperation[] = [];
    const extraDirtyRows = new Set<number>();

    const grouped = groupedPendingScrollOps(pendingOps);

    for (const [plane, ops] of grouped) {
      const sorted = [...ops].sort((a, b) => a.startY - b.startY || a.endY - b.endY);
      if (!areDisjointSorted(sorted)) {
        for (const op of ops) addAffectedRows(extraDirtyRows, op);
        continue;
      }

      for (const op of sorted) {
        const blockedRows = new Set<number>();
        const partiallyBlockedRows = new Set<number>();
        for (let y = op.startY; y < op.endY; y++) {
          const coverageKind = higherPlaneCoverageKind(plane, y);
          if (coverageKind === 0) continue;
          blockedRows.add(y);
          if (coverageKind === 1) partiallyBlockedRows.add(y);
        }

        if (!blockedRows.size) {
          scrollOperations.push({
            startY: op.startY,
            endY: op.endY,
            delta: op.delta,
          });
          continue;
        }

        const absDelta = Math.abs(op.delta);
        for (let y = op.startY; y < op.endY; y++) {
          if (partiallyBlockedRows.has(y)) extraDirtyRows.add(y);
        }

        let bandStart = -1;
        const flushBand = (bandEnd: number) => {
          if (bandStart < 0 || bandEnd <= bandStart) return;
          const bandHeight = bandEnd - bandStart;
          if (absDelta >= bandHeight) {
            for (let y = bandStart; y < bandEnd; y++) extraDirtyRows.add(y);
            bandStart = -1;
            return;
          }

          scrollOperations.push({
            startY: bandStart,
            endY: bandEnd,
            delta: op.delta,
          });

          if (op.delta > 0) {
            for (let y = bandEnd - absDelta; y < bandEnd; y++) extraDirtyRows.add(y);
          } else {
            for (let y = bandStart; y < bandStart + absDelta; y++) extraDirtyRows.add(y);
          }
          bandStart = -1;
        };

        for (let y = op.startY; y < op.endY; y++) {
          if (blockedRows.has(y)) {
            flushBand(y);
            continue;
          }
          if (bandStart < 0) bandStart = y;
        }
        flushBand(op.endY);
      }
    }

    return {
      scrollOperations: scrollOperations.length ? scrollOperations : null,
      extraDirtyRows: Array.from(extraDirtyRows).sort((a, b) => a - b),
    };
  }

  function dirtyRowsCoverRange(
    rows: readonly number[] | null,
    startY: number,
    endY: number,
  ): boolean {
    if (rows === null) return true;
    if (!rows.length) return false;
    let idx = 0;
    while (idx < rows.length && (rows[idx] ?? -1) < startY) idx++;
    for (let y = startY; y < endY; y++) {
      if (rows[idx] !== y) return false;
      idx++;
    }
    return true;
  }

  function dropScrollOpsCoveredByDirtyRows(
    ops: readonly TerminalScrollOperation[] | null,
    dirtyRows: readonly number[] | null,
  ): readonly TerminalScrollOperation[] | null {
    if (!ops?.length) return null;
    const next = ops.filter((op) => !dirtyRowsCoverRange(dirtyRows, op.startY, op.endY));
    return next.length ? next : null;
  }

  function scrollRowsForPlane(
    plane: TerminalRenderPlane,
    startY: number,
    endY: number,
    lines: number,
  ): void {
    const state = getPlaneState(plane);
    const op = normalizeScrollOperation(startY, endY, lines, state.buffer.rows);
    if (!op) return;
    scrollBufferRegion(state.buffer, op.startY, op.endY, op.delta);
    scrollPlaneCoverageRegion(state, op.startY, op.endY, op.delta);
    recordPendingScrollOp(plane, op);
  }

  function composeRows(rows: readonly number[] | null): void {
    const blank = createBlankCell();
    const fpFn = compositeBuffer.fingerprintFn;
    const fpArr = compositeBuffer.soaFingerprints;
    const rowList = rows ?? Array.from({ length: compositeBuffer.rows }, (_, index) => index);
    for (const y of rowList) {
      if (y < 0 || y >= compositeBuffer.rows) continue;
      const dst = getBufferRow(compositeBuffer, y);
      dst.length = compositeBuffer.cols;
      for (let x = 0; x < compositeBuffer.cols; x++) dst[x] = blank;
      for (const plane of TERMINAL_RENDER_PLANES) {
        const state = planeStates.get(plane);
        if (!state) continue;
        const src = getBufferRow(state.buffer, y);
        const coverage = state.coverage[y];
        if (!coverage) continue;
        for (let x = 0; x < compositeBuffer.cols; x++) {
          if (coverage[x]) dst[x] = src[x]!;
        }
      }

      // Fix wide characters that were split across plane boundaries.
      // When a higher-priority plane overwrites only the continuation half
      // of a width-2 cell (or only the primary half), the composite row
      // becomes inconsistent and the renderer would produce shifted output.
      const cols = compositeBuffer.cols;
      for (let x = 0; x < cols; x++) {
        const cell = dst[x];
        if (cell.width === 2 && !cell.continuation) {
          if (x + 1 >= cols || !dst[x + 1].continuation) {
            dst[x] = blank;
          }
        } else if (cell.continuation) {
          if (x === 0 || dst[x - 1].width !== 2 || dst[x - 1].continuation) {
            dst[x] = blank;
          }
        }
      }

      // Update SoA fingerprints for the composed row (inline with composition
      // to avoid a separate pass). Uses physical row index for flat array.
      if (fpFn && fpArr) {
        const physY = (compositeBuffer.gridStart + y) % compositeBuffer.rows;
        const base = physY * cols;
        for (let x = 0; x < cols; x++) {
          const cell = dst[x]!;
          fpArr[base + x] = fpFn(cell.ch, cell.style);
        }
      }

      markDirty(compositeBuffer, y);
    }
  }

  function composeRowBeforePlane(plane: TerminalRenderPlane, y: number): readonly Cell[] | null {
    const stop = TERMINAL_RENDER_PLANES.indexOf(plane);
    if (stop <= 0 || y < 0 || y >= compositeBuffer.rows) return null;
    const blank = createBlankCell();
    const row = Array.from({ length: compositeBuffer.cols }, () => blank);

    for (const lowerPlane of TERMINAL_RENDER_PLANES.slice(0, stop)) {
      const state = planeStates.get(lowerPlane);
      if (!state) continue;
      const src = getBufferRow(state.buffer, y);
      const coverage = state.coverage[y];
      if (!coverage) continue;
      for (let x = 0; x < compositeBuffer.cols; x++) {
        if (coverage[x]) row[x] = src[x]!;
      }
    }

    for (let x = 0; x < compositeBuffer.cols; x++) {
      const cell = row[x]!;
      if (cell.width === 2 && !cell.continuation) {
        if (x + 1 >= compositeBuffer.cols || !row[x + 1]!.continuation) row[x] = blank;
      } else if (cell.continuation) {
        if (x === 0 || row[x - 1]!.width !== 2 || row[x - 1]!.continuation) row[x] = blank;
      }
    }

    return row;
  }

  function syncCompositeCursor(): void {
    const prevVisible = compositeBuffer.cursorVisible;
    const prevY = compositeBuffer.cursorY;
    let nextPlane: PlaneBufferState | null = null;
    for (const plane of ["overlay", "chrome", "transcript", "default"] as const) {
      const state = planeStates.get(plane);
      if (state?.buffer.cursorVisible) {
        nextPlane = state;
        break;
      }
    }

    compositeBuffer.cursorVisible = Boolean(nextPlane);
    compositeBuffer.cursorX = nextPlane?.buffer.cursorX ?? 0;
    compositeBuffer.cursorY = nextPlane?.buffer.cursorY ?? 0;
    if (prevVisible) markDirty(compositeBuffer, prevY);
    if (compositeBuffer.cursorVisible) markDirty(compositeBuffer, compositeBuffer.cursorY);
  }

  function syncCompositeForRead(planes?: TerminalRenderPlanes | null): void {
    const planesToCompose = planes?.length ? planes : TERMINAL_RENDER_PLANES;
    let composeAllRows = false;
    const dirtyRows = new Set<number>();
    for (const plane of planesToCompose) {
      const state = planeStates.get(plane);
      if (!state) continue;
      const rows = peekDirtyRows(state.buffer);
      if (rows === null) {
        composeAllRows = true;
        break;
      }
      for (const y of rows) dirtyRows.add(y);
    }
    if (composeAllRows || dirtyRows.size > 0)
      composeRows(composeAllRows ? null : Array.from(dirtyRows).sort((a, b) => a - b));
    syncCompositeCursor();
  }

  function pendingDirtyRowsForPlanes(
    planes: TerminalRenderPlanes | null | undefined,
  ): readonly number[] | null {
    const planesToCheck = planes?.length ? planes : TERMINAL_RENDER_PLANES;
    let full = false;
    const rows = new Set<number>();
    for (const plane of planesToCheck) {
      const state = planeStates.get(plane);
      if (!state) continue;
      const dirty = peekDirtyRows(state.buffer);
      if (dirty === null) {
        full = true;
        break;
      }
      for (const y of dirty) rows.add(y);
    }
    if (full) return null;
    return Array.from(rows).sort((a, b) => a - b);
  }

  function createPlaneTerminalApi(plane: TerminalRenderPlane): Terminal {
    const existing = planeTerminals.get(plane);
    if (existing) return existing;
    const api: Terminal = {
      resize(cols, rows) {
        assertNotDisposed();
        base.resize(cols, rows);
      },
      clear(x?: number, y?: number, w?: number, h?: number) {
        assertNotDisposed();
        clearForPlane(plane, x, y, w, h);
      },
      write(text: string, opts?: { x?: number; y?: number; style?: Style }) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        const x = opts?.x;
        const y = opts?.y;
        const style = opts?.style;
        if (x == null || y == null) {
          const next = writeAtForPlane(
            plane,
            text,
            state.buffer.cursorX,
            state.buffer.cursorY,
            style ?? state.buffer.cursorStyle,
          );
          state.buffer.cursorX = next.x;
          state.buffer.cursorY = next.y;
        } else {
          writeAtForPlane(plane, text, x, y, style);
        }
      },
      writeAnsi(text: string, opts?: { x?: number; y?: number }) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        const x = opts?.x;
        const y = opts?.y;
        const positionedWrite = x != null && y != null;
        let cx = positionedWrite ? x : state.buffer.cursorX;
        let cy = positionedWrite ? y : state.buffer.cursorY;
        let style: Style = positionedWrite ? {} : state.buffer.cursorStyle;

        for (const seg of parseAnsiSgr(text, style)) {
          const next = writeAtForPlane(plane, seg.text, cx, cy, seg.style);
          cx = next.x;
          cy = next.y;
          style = seg.style;
        }

        if (!positionedWrite) {
          state.buffer.cursorX = cx;
          state.buffer.cursorY = cy;
          state.buffer.cursorStyle = style;
        }
      },
      put(x: number, y: number, ch: string, style?: Style) {
        assertNotDisposed();
        putForPlane(plane, x, y, ch, style);
      },
      fill(x: number, y: number, w: number, h: number, ch?: string, style?: Style) {
        assertNotDisposed();
        fillForPlane(plane, x, y, w, h, ch, style);
      },
      scroll(lines: number) {
        assertNotDisposed();
        scrollForPlane(plane, lines);
      },
      setCursor(x: number, y: number, visible?: boolean) {
        assertNotDisposed();
        setCursorForPlane(plane, x, y, visible);
      },
      batch(fn) {
        assertNotDisposed();
        return base.batch(fn);
      },
      commit(meta) {
        assertNotDisposed();
        return base.commit({ planes: meta?.planes ?? [plane], sync: meta?.sync });
      },
      on(event, cb) {
        assertNotDisposed();
        return base.on(event, cb as any);
      },
      dispose() {
        base.dispose();
      },
      size() {
        assertNotDisposed();
        return base.size();
      },
      snapshot(): BufferSnapshot {
        assertNotDisposed();
        const state = getPlaneState(plane);
        return {
          cols: state.buffer.cols,
          rows: state.buffer.rows,
          lines: snapshotText(state.buffer),
        };
      },
      getCell(x: number, y: number): Cell {
        assertNotDisposed();
        const state = getPlaneState(plane);
        if (y < 0 || y >= state.buffer.rows || x < 0 || x >= state.buffer.cols)
          throw new RangeError("Cell out of bounds");
        return getBufferCell(state.buffer, x, y);
      },
      getRow(y: number): readonly Cell[] {
        assertNotDisposed();
        const state = getPlaneState(plane);
        if (y < 0 || y >= state.buffer.rows) throw new RangeError("Row out of bounds");
        return getBufferRow(state.buffer, y);
      },
      setScrollbackLimit(limit: number): void {
        assertNotDisposed();
        const state = getPlaneState(plane);
        state.buffer.scrollbackLimit = Math.max(0, Math.floor(limit));
        if (state.buffer.scrollback.length > state.buffer.scrollbackLimit) {
          state.buffer.scrollback.splice(
            0,
            state.buffer.scrollback.length - state.buffer.scrollbackLimit,
          );
        }
      },
      getScrollbackLines(count?: number): readonly string[] {
        assertNotDisposed();
        const state = getPlaneState(plane);
        const all = state.buffer.scrollback.map((row) =>
          row.map((cell) => (cell.continuation ? " " : cell.ch || " ")).join(""),
        );
        if (count == null) return all;
        return all.slice(Math.max(0, all.length - Math.max(0, Math.floor(count))));
      },
      setFingerprintFn(fn: (ch: string, style: Style) => number): void {
        assertNotDisposed();
        base.setFingerprintFn(fn);
      },
      getRowFingerprints(y: number): Uint32Array | null {
        assertNotDisposed();
        return base.getRowFingerprints(y);
      },
    };
    planeTerminals.set(plane, api);
    return api;
  }

  base = {
    resize(cols, rows) {
      assertNotDisposed();
      const prevCols = compositeBuffer.cols;
      const prevRows = compositeBuffer.rows;
      resizeBuffer(compositeBuffer, cols, rows);
      for (const state of planeStates.values()) resizePlaneState(state, cols, rows);
      if (compositeBuffer.cols !== prevCols || compositeBuffer.rows !== prevRows)
        emitter.emit("resize", { cols: compositeBuffer.cols, rows: compositeBuffer.rows });
    },

    clear(x?: number, y?: number, w?: number, h?: number) {
      assertNotDisposed();
      clearForPlane("default", x, y, w, h);
    },

    write(text: string, opts?: { x?: number; y?: number; style?: Style }) {
      assertNotDisposed();
      createPlaneTerminalApi("default").write(text, opts);
    },

    writeAnsi(text: string, opts?: { x?: number; y?: number }) {
      assertNotDisposed();
      createPlaneTerminalApi("default").writeAnsi(text, opts);
    },

    put(x: number, y: number, ch: string, style?: Style) {
      assertNotDisposed();
      putForPlane("default", x, y, ch, style);
    },

    fill(x: number, y: number, w: number, h: number, ch?: string, style?: Style) {
      assertNotDisposed();
      fillForPlane("default", x, y, w, h, ch, style);
    },

    scroll(lines: number) {
      assertNotDisposed();
      scrollForPlane("default", lines);
    },

    setCursor(x: number, y: number, visible = true) {
      assertNotDisposed();
      setCursorForPlane("default", x, y, visible);
    },

    batch(fn) {
      assertNotDisposed();
      batchingDepth++;
      try {
        return fn();
      } finally {
        batchingDepth--;
        if (batchingDepth === 0 && pendingCommit) {
          pendingCommit = false;
          const planes = pendingCommitAllPlanes ? null : pendingCommitPlanes;
          pendingCommitAllPlanes = false;
          pendingCommitPlanes = null;
          base.commit({ planes });
        }
      }
    },

    commit(meta) {
      assertNotDisposed();
      if (batchingDepth > 0) {
        pendingCommit = true;
        if (!meta?.planes?.length) {
          pendingCommitAllPlanes = true;
          pendingCommitPlanes = null;
        } else if (!pendingCommitAllPlanes) {
          pendingCommitPlanes = mergePlanes(pendingCommitPlanes, meta.planes);
        }
        return pendingDirtyRowsForPlanes(meta?.planes ?? null);
      }

      const planesToCompose = meta?.planes?.length ? meta.planes : TERMINAL_RENDER_PLANES;
      const pendingScrollOps = takePendingScrollOps(planesToCompose);
      const preparedScroll = prepareCompositeScrollOps(pendingScrollOps);
      let scrollOperations = preparedScroll.scrollOperations;
      let composeAllRows = false;
      const dirtyRows = new Set<number>();
      for (const plane of planesToCompose) {
        const state = planeStates.get(plane);
        if (!state) continue;
        const rows = collectAndClearDirtyRows(state.buffer);
        if (rows === null) {
          composeAllRows = true;
          break;
        }
        for (const y of rows) dirtyRows.add(y);
      }
      for (const y of preparedScroll.extraDirtyRows) dirtyRows.add(y);

      const normalizedDirtyRows = composeAllRows
        ? null
        : Array.from(dirtyRows).sort((a, b) => a - b);
      scrollOperations = dropScrollOpsCoveredByDirtyRows(scrollOperations, normalizedDirtyRows);

      if (scrollOperations) {
        for (const op of scrollOperations)
          scrollBufferRegion(compositeBuffer, op.startY, op.endY, op.delta);
      }

      if (normalizedDirtyRows !== null && normalizedDirtyRows.length === 0) {
        const pendingCompositeRows = collectAndClearDirtyRows(compositeBuffer);
        if (pendingCompositeRows !== null && pendingCompositeRows.length === 0)
          return pendingCompositeRows;
        emitter.emit("commit", {
          dirtyRows: pendingCompositeRows,
          planes: meta?.planes ?? null,
          sync: meta?.sync,
          scrollOperations,
        });
        return pendingCompositeRows;
      }

      composeRows(normalizedDirtyRows);
      if (normalizedDirtyRows === null) markAllDirty(compositeBuffer);
      syncCompositeCursor();
      const committedRows = collectAndClearDirtyRows(compositeBuffer);
      if (committedRows !== null && committedRows.length === 0) return committedRows;
      emitter.emit("commit", {
        dirtyRows: committedRows,
        planes: meta?.planes ?? null,
        sync: meta?.sync,
        scrollOperations,
      });
      return committedRows;
    },

    on(event, cb) {
      assertNotDisposed();
      return emitter.on(event, cb as any);
    },

    dispose() {
      disposed = true;
      emitter.clear();
    },

    size() {
      assertNotDisposed();
      return { cols: compositeBuffer.cols, rows: compositeBuffer.rows };
    },

    snapshot(): BufferSnapshot {
      assertNotDisposed();
      if (batchingDepth === 0) syncCompositeForRead();
      const source = batchingDepth > 0 ? getPlaneState("default").buffer : compositeBuffer;
      return {
        cols: source.cols,
        rows: source.rows,
        lines: snapshotText(source),
      };
    },

    getCell(x: number, y: number): Cell {
      assertNotDisposed();
      if (batchingDepth === 0) syncCompositeForRead();
      const source = batchingDepth > 0 ? getPlaneState("default").buffer : compositeBuffer;
      if (y < 0 || y >= source.rows || x < 0 || x >= source.cols)
        throw new RangeError("Cell out of bounds");
      return getBufferCell(source, x, y);
    },

    getRow(y: number): readonly Cell[] {
      assertNotDisposed();
      if (batchingDepth === 0) syncCompositeForRead();
      const source = batchingDepth > 0 ? getPlaneState("default").buffer : compositeBuffer;
      if (y < 0 || y >= source.rows) throw new RangeError("Row out of bounds");
      return getBufferRow(source, y);
    },

    setScrollbackLimit(limit: number): void {
      assertNotDisposed();
      const state = getPlaneState("default");
      state.buffer.scrollbackLimit = Math.max(0, Math.floor(limit));
      if (state.buffer.scrollback.length > state.buffer.scrollbackLimit) {
        state.buffer.scrollback.splice(
          0,
          state.buffer.scrollback.length - state.buffer.scrollbackLimit,
        );
      }
    },

    getScrollbackLines(count?: number): readonly string[] {
      assertNotDisposed();
      const state = getPlaneState("default");
      const all = state.buffer.scrollback.map((row) =>
        row.map((cell) => (cell.continuation ? " " : cell.ch || " ")).join(""),
      );
      if (count == null) return all;
      return all.slice(Math.max(0, all.length - Math.max(0, Math.floor(count))));
    },

    setFingerprintFn(fn: (ch: string, style: Style) => number): void {
      assertNotDisposed();
      setFingerprintFn(compositeBuffer, fn);
    },

    getRowFingerprints(y: number): Uint32Array | null {
      assertNotDisposed();
      return getRowFingerprints(compositeBuffer, y);
    },
  };

  base[TERMINAL_PLANE_INTERNALS] = {
    getPlaneTerminal: createPlaneTerminalApi,
    resetRowsForRender(plane, dirtyRows) {
      const state = getPlaneState(plane);
      const rows = normalizeDirtyRows(dirtyRows, state.buffer.rows);
      if (rows === null) {
        for (let y = 0; y < state.buffer.rows; y++) clearPlaneCoverageRow(state, y);
        return;
      }
      for (const y of rows) clearPlaneCoverageRow(state, y);
    },
    getRowCoverageKind(plane, y) {
      const state = getPlaneState(plane);
      if (y < 0 || y >= state.coverage.length) return 0;
      const row = state.coverage[y];
      if (!row?.length) return 0;
      let covered = 0;
      for (let x = 0; x < row.length; x++) {
        if (row[x]) covered++;
      }
      if (covered === 0) return 0;
      if (covered >= row.length) return 2;
      return 1;
    },
    getComposedRowBeforePlane: composeRowBeforePlane,
    scrollRows(plane, startY, endY, lines) {
      scrollRowsForPlane(plane, startY, endY, lines);
    },
  };

  return base;
}
