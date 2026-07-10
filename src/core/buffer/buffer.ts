import type { Cell, Style } from "../types.js";
import { charCellWidth } from "./width.js";
import type { WidthProvider } from "./width.js";
import { cellInstr } from "../perf/instrumentation.js";

const DEFAULT_STYLE: Style = Object.freeze({});
const styleCache = new WeakMap<object, Style>();
const blankCellCache = new WeakMap<Style, Cell>();
const continuationCellCache = new WeakMap<Style, Cell>();
const cellCacheWidth1 = new WeakMap<Style, Map<string, Cell>>();
const cellCacheWidth2 = new WeakMap<Style, Map<string, Cell>>();
const MAX_CACHED_CELLS_PER_STYLE = 128;

export function normalizeStyle(style?: Style): Style {
  if (!style) return DEFAULT_STYLE;
  if (Object.isFrozen(style)) return style;
  const cached = styleCache.get(style as any);
  if (cached) return cached;
  const frozen = Object.freeze({ ...style });
  styleCache.set(style as any, frozen);
  return frozen;
}

function getOrCreateCellCache(
  map: WeakMap<Style, Map<string, Cell>>,
  style: Style,
  width: 1 | 2,
): Map<string, Cell> {
  const cached = map.get(style);
  if (cached) return cached;
  const next = new Map<string, Cell>();
  map.set(style, next);

  // Register bucket for distribution tracking when instrumentation enabled
  cellInstr.registerCacheBucket(width, next);

  return next;
}

export function createCell(ch: string, style?: Style, widthProvider?: WidthProvider): Cell {
  cellInstr.recordCreateCellCall();

  if (ch === " ") return createBlankCell(style);

  const normalizedStyle = normalizeStyle(style);
  cellInstr.recordCharCellWidthCall();
  const width = charCellWidth(ch, widthProvider);

  const map =
    width === 2
      ? getOrCreateCellCache(cellCacheWidth2, normalizedStyle, 2)
      : getOrCreateCellCache(cellCacheWidth1, normalizedStyle, 1);

  const cached = map.get(ch);
  if (cached) {
    cellInstr.recordCacheHit(width as 1 | 2);
    return cached;
  }

  cellInstr.recordCacheMiss(width as 1 | 2);
  cellInstr.recordNewCell();

  const cell: Cell = { ch, width, style: normalizedStyle };
  map.set(ch, cell);

  cellInstr.updateMaxCacheSize(width as 1 | 2, map.size);

  if (map.size > MAX_CACHED_CELLS_PER_STYLE) {
    cellInstr.recordCacheClear(width as 1 | 2);
    map.clear();
  }

  return cell;
}

export function createBlankCell(style?: Style): Cell {
  const normalizedStyle = normalizeStyle(style);
  const cached = blankCellCache.get(normalizedStyle);
  if (cached) {
    cellInstr.recordBlankCacheHit();
    return cached;
  }

  cellInstr.recordBlankCacheMiss();

  const cell = Object.freeze({
    ch: " ",
    width: 1,
    style: normalizedStyle,
  });
  blankCellCache.set(normalizedStyle, cell);
  return cell;
}

export function createContinuationCell(style?: Style): Cell {
  const normalizedStyle = normalizeStyle(style);
  const cached = continuationCellCache.get(normalizedStyle);
  if (cached) {
    cellInstr.recordContinuationCacheHit();
    return cached;
  }

  cellInstr.recordContinuationCacheMiss();

  const cell = Object.freeze({
    ch: "",
    width: 1,
    continuation: true,
    style: normalizedStyle,
  });
  continuationCellCache.set(normalizedStyle, cell);
  return cell;
}

export type CellFingerprintFn = (ch: string, style: Style) => number;

export interface GridBuffer {
  cols: number;
  rows: number;
  grid: Cell[][];
  gridStart: number;
  dirtyBits: Uint8Array;
  dirtyCount: number;
  dirtyMin: number;
  dirtyMax: number;
  dirtyAll: boolean;
  cursorX: number;
  cursorY: number;
  cursorVisible: boolean;
  cursorStyle: Style;
  scrollback: Cell[][];
  scrollbackLimit: number;
  rowPool: Cell[][];
  // SoA fingerprint array: flat[physicalRow * cols + x] = renderer-provided fingerprint
  // Pre-computed during cell writes when fingerprintFn is set.
  soaFingerprints: Uint32Array | null;
  fingerprintFn: CellFingerprintFn | null;
  widthProvider: WidthProvider;
}

export function createGridBuffer(
  cols: number,
  rows: number,
  options: Readonly<{ widthProvider?: WidthProvider }> = {},
): GridBuffer {
  const safeCols = Math.max(0, Math.floor(cols));
  const safeRows = Math.max(0, Math.floor(rows));
  const blank = createBlankCell();
  const grid: Cell[][] = Array.from({ length: safeRows }, () =>
    Array.from({ length: safeCols }, () => blank),
  );
  return {
    cols: safeCols,
    rows: safeRows,
    grid,
    gridStart: 0,
    dirtyBits: new Uint8Array(safeRows),
    dirtyCount: safeRows || 0,
    dirtyMin: safeRows ? 0 : Number.POSITIVE_INFINITY,
    dirtyMax: safeRows ? safeRows - 1 : -1,
    dirtyAll: safeRows > 0,
    cursorX: 0,
    cursorY: 0,
    cursorVisible: true,
    cursorStyle: DEFAULT_STYLE,
    scrollback: [],
    scrollbackLimit: 1000,
    rowPool: [],
    soaFingerprints: null,
    fingerprintFn: null,
    widthProvider: options.widthProvider ?? "default",
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Register or clear a fingerprint function on the buffer. This enables SoA fingerprint
 * pre-computation: cell writes will update fingerprints inline, and the renderer
 * can read them via getRowFingerprints() instead of per-cell hash computation.
 */
export function setFingerprintFn(buffer: GridBuffer, fn: CellFingerprintFn | null): void {
  buffer.fingerprintFn = fn;
  const len = buffer.rows * buffer.cols;
  if (!fn || !len) {
    buffer.soaFingerprints = null;
    return;
  }
  buffer.soaFingerprints = new Uint32Array(len);
  for (let y = 0; y < buffer.rows; y++) {
    const row = getBufferRow(buffer, y);
    const physY = physicalRowIndex(buffer, y);
    const base = physY * buffer.cols;
    for (let x = 0; x < buffer.cols; x++) {
      const cell = row[x]!;
      buffer.soaFingerprints[base + x] = fn(cell.ch, cell.style);
    }
  }
}

/**
 * Get pre-computed fingerprints for a logical row as a TypedArray slice.
 * Returns null if fingerprinting is not enabled on this buffer.
 */
export function getRowFingerprints(buffer: GridBuffer, y: number): Uint32Array | null {
  if (!buffer.soaFingerprints) return null;
  if (buffer.rows <= 0 || buffer.cols <= 0) return null;
  const yy = Math.floor(y);
  if (!Number.isFinite(yy) || yy < 0 || yy >= buffer.rows) return null;
  const physY = physicalRowIndex(buffer, yy);
  const base = physY * buffer.cols;
  return buffer.soaFingerprints.subarray(base, base + buffer.cols);
}

/** Update the SoA fingerprint for a single cell (called inline from putCell/fillRect). */
function updateCellFingerprint(
  buffer: GridBuffer,
  physY: number,
  x: number,
  ch: string,
  style: Style,
): void {
  if (!buffer.soaFingerprints || !buffer.fingerprintFn) return;
  buffer.soaFingerprints[physY * buffer.cols + x] = buffer.fingerprintFn(ch, style);
}

/** Update SoA fingerprints for a range of cells in a physical row. */
function updateRangeFingerprint(
  buffer: GridBuffer,
  physY: number,
  x0: number,
  x1: number,
  ch: string,
  style: Style,
): void {
  if (!buffer.soaFingerprints || !buffer.fingerprintFn) return;
  const fp = buffer.fingerprintFn(ch, style);
  const base = physY * buffer.cols;
  for (let x = x0; x < x1; x++) {
    buffer.soaFingerprints[base + x] = fp;
  }
}

function physicalRowIndex(buffer: GridBuffer, y: number): number {
  return (buffer.gridStart + y) % buffer.rows;
}

export function getBufferRow(buffer: GridBuffer, y: number): Cell[] {
  return buffer.grid[physicalRowIndex(buffer, y)]!;
}

export function getBufferCell(buffer: GridBuffer, x: number, y: number): Cell {
  return getBufferRow(buffer, y)[x]!;
}

export function markAllDirty(buffer: GridBuffer): void {
  if (buffer.rows <= 0) return;
  buffer.dirtyAll = true;
  buffer.dirtyCount = buffer.rows;
  buffer.dirtyMin = 0;
  buffer.dirtyMax = buffer.rows - 1;
}

export function markDirty(buffer: GridBuffer, y: number): void {
  if (buffer.dirtyAll) return;
  if (y < 0 || y >= buffer.rows) return;
  if (buffer.dirtyBits[y]) {
    return;
  }
  buffer.dirtyBits[y] = 1;
  buffer.dirtyCount++;
  if (y < buffer.dirtyMin) buffer.dirtyMin = y;
  if (y > buffer.dirtyMax) buffer.dirtyMax = y;
}

function clearCellRange(row: Cell[], startX: number, endXExclusive: number): void {
  const blank = createBlankCell();
  for (let x = startX; x < endXExclusive; x++) row[x] = blank;
}

function clearWideIfOverwriting(row: Cell[], x: number): void {
  const cell = row[x];
  if (!cell) return;
  if (cell.continuation) {
    if (x - 1 >= 0) row[x - 1] = createBlankCell();
    row[x] = createBlankCell();
    return;
  }
  if (cell.width === 2) {
    row[x] = createBlankCell();
    if (x + 1 < row.length) row[x + 1] = createBlankCell();
  }
}

export function putCell(buffer: GridBuffer, x: number, y: number, ch: string, style?: Style): void {
  if (y < 0 || y >= buffer.rows) return;
  if (x < 0 || x >= buffer.cols) return;

  const row = getBufferRow(buffer, y);
  const width = charCellWidth(ch, buffer.widthProvider);
  const previous = row[x];
  const next = width === 2 && x + 1 < buffer.cols ? row[x + 1] : undefined;
  const previousWideOverlap = Boolean(
    previous?.continuation || previous?.width === 2 || next?.continuation || next?.width === 2,
  );
  clearWideIfOverwriting(row, x);
  if (width === 2 && x + 1 < buffer.cols) clearWideIfOverwriting(row, x + 1);

  if (width === 2 && x + 1 >= buffer.cols) {
    const blank = createBlankCell();
    row[x] = blank;
    if (buffer.soaFingerprints) {
      if (previousWideOverlap) {
        recomputeFingerprintsForRows(buffer, y, y + 1);
      } else {
        const physY = physicalRowIndex(buffer, y);
        updateCellFingerprint(buffer, physY, x, blank.ch, blank.style);
      }
    }
    markDirty(buffer, y);
    return;
  }
  const cell = createCell(ch, style, buffer.widthProvider);
  row[x] = cell;
  if (width === 2 && x + 1 < buffer.cols) row[x + 1] = createContinuationCell(style);

  // Update SoA fingerprints inline
  if (buffer.soaFingerprints) {
    if (previousWideOverlap) {
      recomputeFingerprintsForRows(buffer, y, y + 1);
    } else {
      const physY = physicalRowIndex(buffer, y);
      updateCellFingerprint(buffer, physY, x, cell.ch, cell.style);
      if (width === 2 && x + 1 < buffer.cols) {
        updateCellFingerprint(buffer, physY, x + 1, "", cell.style);
      }
    }
  }

  markDirty(buffer, y);
}

export function fillRect(
  buffer: GridBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  ch = " ",
  style?: Style,
): void {
  if (w <= 0 || h <= 0 || buffer.cols === 0 || buffer.rows === 0) return;
  const x0 = clamp(Math.floor(x), 0, buffer.cols);
  const y0 = clamp(Math.floor(y), 0, buffer.rows);
  const x1 = clamp(Math.floor(x + w), 0, buffer.cols);
  const y1 = clamp(Math.floor(y + h), 0, buffer.rows);
  if (x1 <= x0 || y1 <= y0) return;

  const width = charCellWidth(ch, buffer.widthProvider);
  // Fast path for single-cell fills (most common). Avoid per-cell `createCell()`/`normalizeStyle()`
  // calls by reusing the cached Cell instance and letting the JS engine optimize `Array.fill`.
  if (width === 1) {
    const fillCell = createCell(ch, style, buffer.widthProvider);
    const blank = createBlankCell();
    for (let yy = y0; yy < y1; yy++) {
      const row = getBufferRow(buffer, yy);
      // If we start filling in the middle of a wide glyph (continuation cell),
      // clear its base cell to keep the row model consistent.
      const clearsLeftWideBase = Boolean(row[x0]?.continuation);
      const clearsRightContinuation = Boolean(x1 < buffer.cols && row[x1]?.continuation);
      if (clearsLeftWideBase) clearWideIfOverwriting(row, x0);
      row.fill(fillCell, x0, x1);
      // If we ended right before a continuation cell, clear it to avoid leaving
      // a dangling continuation after overwriting the wide glyph base.
      if (clearsRightContinuation) row[x1] = blank;
      // Update SoA fingerprints for the filled range
      if (buffer.soaFingerprints) {
        if (clearsLeftWideBase || clearsRightContinuation) {
          recomputeFingerprintsForRows(buffer, yy, yy + 1);
        } else {
          const physY = physicalRowIndex(buffer, yy);
          updateRangeFingerprint(buffer, physY, x0, x1, fillCell.ch, fillCell.style);
        }
      }
      markDirty(buffer, yy);
    }
    return;
  }

  const fillCell = createCell(ch, style, buffer.widthProvider);
  const continuationCell = createContinuationCell(style);
  const blank = createBlankCell();

  for (let yy = y0; yy < y1; yy++) {
    const row = getBufferRow(buffer, yy);
    for (let xx = x0; xx < x1; ) {
      clearWideIfOverwriting(row, xx);
      if (xx + 1 >= x1 || xx + 1 >= buffer.cols) {
        row[xx] = blank;
        xx += 1;
        continue;
      }

      clearWideIfOverwriting(row, xx + 1);
      row[xx] = fillCell;
      row[xx + 1] = continuationCell;
      xx += 2;
    }
    recomputeFingerprintsForRows(buffer, yy, yy + 1);
    markDirty(buffer, yy);
  }
}

export function clearRect(
  buffer: GridBuffer,
  x?: number,
  y?: number,
  w?: number,
  h?: number,
): void {
  if (buffer.cols === 0 || buffer.rows === 0) return;

  if (x == null || y == null || w == null || h == null) {
    const blank = createBlankCell();
    for (let yy = 0; yy < buffer.rows; yy++) {
      const row = getBufferRow(buffer, yy);
      row.length = buffer.cols;
      for (let xx = 0; xx < buffer.cols; xx++) row[xx] = blank;
    }
    recomputeFingerprintsForRows(buffer, 0, buffer.rows);
    markAllDirty(buffer);
    buffer.cursorX = 0;
    buffer.cursorY = 0;
    return;
  }

  if (w <= 0 || h <= 0) return;
  const x0 = clamp(Math.floor(x), 0, buffer.cols);
  const y0 = clamp(Math.floor(y), 0, buffer.rows);
  const x1 = clamp(Math.floor(x + w), 0, buffer.cols);
  const y1 = clamp(Math.floor(y + h), 0, buffer.rows);
  if (x1 <= x0 || y1 <= y0) return;

  for (let yy = y0; yy < y1; yy++) {
    const row = getBufferRow(buffer, yy);
    if (row[x0]?.continuation) clearWideIfOverwriting(row, x0);
    clearCellRange(row, x0, x1);
    if (x1 < buffer.cols && row[x1]?.continuation) row[x1] = createBlankCell();
    recomputeFingerprintsForRows(buffer, yy, yy + 1);
    markDirty(buffer, yy);
  }
}

function takePooledRow(buffer: GridBuffer): Cell[] | null {
  const row = buffer.rowPool.pop();
  return row ?? null;
}

function blankRow(buffer: GridBuffer): Cell[] {
  const pooled = takePooledRow(buffer);
  if (!pooled) return Array.from({ length: buffer.cols }, () => createBlankCell());
  pooled.length = buffer.cols;
  const blank = createBlankCell();
  for (let x = 0; x < buffer.cols; x++) pooled[x] = blank;
  return pooled;
}

function recomputeFingerprintsForRows(buffer: GridBuffer, startY: number, endY: number): void {
  if (!buffer.soaFingerprints || !buffer.fingerprintFn) return;
  for (let y = startY; y < endY; y++) {
    const row = getBufferRow(buffer, y);
    const physY = physicalRowIndex(buffer, y);
    const base = physY * buffer.cols;
    for (let x = 0; x < buffer.cols; x++) {
      const cell = row[x]!;
      buffer.soaFingerprints[base + x] = buffer.fingerprintFn(cell.ch, cell.style);
    }
  }
}

function recomputeAllVisibleFingerprints(buffer: GridBuffer): void {
  recomputeFingerprintsForRows(buffer, 0, buffer.rows);
}

export function scrollBuffer(buffer: GridBuffer, lines: number): void {
  const raw = Math.trunc(lines);
  if (raw === 0 || buffer.rows === 0) return;
  const abs = Math.min(Math.abs(raw), buffer.rows);
  const n = raw > 0 ? abs : -abs;

  if (n > 0) {
    for (let i = 0; i < n; i++) {
      const removedIdx = buffer.gridStart;
      const removed = buffer.grid[removedIdx]!;
      if (buffer.scrollbackLimit > 0) {
        buffer.scrollback.push(removed);
        if (buffer.scrollback.length > buffer.scrollbackLimit) {
          const excess = buffer.scrollback.length - buffer.scrollbackLimit;
          const dropped = buffer.scrollback.splice(0, excess);
          buffer.rowPool.push(...dropped);
        }
      } else {
        buffer.rowPool.push(removed);
      }

      buffer.gridStart = (buffer.gridStart + 1) % buffer.rows;
      const bottomIdx = (buffer.gridStart + buffer.rows - 1) % buffer.rows;
      buffer.grid[bottomIdx] = blankRow(buffer);
    }
  } else {
    for (let i = 0; i < -n; i++) {
      const bottomIdx = (buffer.gridStart + buffer.rows - 1) % buffer.rows;
      const removed = buffer.grid[bottomIdx]!;
      buffer.rowPool.push(removed);

      buffer.gridStart = (buffer.gridStart - 1 + buffer.rows) % buffer.rows;
      buffer.grid[buffer.gridStart] = blankRow(buffer);
    }
  }

  const inserted = Math.abs(n);
  if (inserted >= buffer.rows) {
    recomputeAllVisibleFingerprints(buffer);
  } else if (n > 0) {
    recomputeFingerprintsForRows(buffer, buffer.rows - inserted, buffer.rows);
  } else {
    recomputeFingerprintsForRows(buffer, 0, inserted);
  }

  markAllDirty(buffer);
  buffer.cursorY = clamp(buffer.cursorY - n, 0, Math.max(0, buffer.rows - 1));
}

export function scrollBufferRegion(
  buffer: GridBuffer,
  startY: number,
  endY: number,
  lines: number,
): readonly number[] {
  const n = Math.trunc(lines);
  if (n === 0 || buffer.rows === 0) return [];

  const start = clamp(Math.floor(startY), 0, buffer.rows);
  const end = clamp(Math.floor(endY), 0, buffer.rows);
  const height = end - start;
  if (height <= 0) return [];

  const absDelta = Math.abs(n);
  const insertedRows: number[] = [];

  const replaceRegionWithBlankRows = (): void => {
    for (let y = start; y < end; y++) {
      const physY = physicalRowIndex(buffer, y);
      buffer.rowPool.push(buffer.grid[physY]!);
      buffer.grid[physY] = blankRow(buffer);
      markDirty(buffer, y);
      insertedRows.push(y);
    }
  };

  if (absDelta >= height) {
    replaceRegionWithBlankRows();
    recomputeFingerprintsForRows(buffer, start, end);
    if (buffer.cursorY >= start && buffer.cursorY < end)
      buffer.cursorY = clamp(buffer.cursorY - n, start, Math.max(start, end - 1));
    return insertedRows;
  }

  const regionRows: Cell[][] = [];
  for (let y = start; y < end; y++) regionRows.push(getBufferRow(buffer, y));

  const nextRows: Cell[][] = Array.from({ length: height }, () => []);
  if (n > 0) {
    const movedCount = height - n;
    for (let i = 0; i < movedCount; i++) nextRows[i] = regionRows[i + n]!;
    for (let i = 0; i < n; i++) {
      buffer.rowPool.push(regionRows[i]!);
      const y = end - n + i;
      nextRows[movedCount + i] = blankRow(buffer);
      markDirty(buffer, y);
      insertedRows.push(y);
    }
  } else {
    const insertedCount = -n;
    const movedCount = height - insertedCount;
    for (let i = 0; i < insertedCount; i++) {
      buffer.rowPool.push(regionRows[height - insertedCount + i]!);
      const y = start + i;
      nextRows[i] = blankRow(buffer);
      markDirty(buffer, y);
      insertedRows.push(y);
    }
    for (let i = 0; i < movedCount; i++) nextRows[insertedCount + i] = regionRows[i]!;
  }

  for (let i = 0; i < height; i++) {
    const physY = physicalRowIndex(buffer, start + i);
    buffer.grid[physY] = nextRows[i]!;
  }

  recomputeFingerprintsForRows(buffer, start, end);
  if (buffer.cursorY >= start && buffer.cursorY < end)
    buffer.cursorY = clamp(buffer.cursorY - n, start, Math.max(start, end - 1));
  return insertedRows;
}

export function resizeBuffer(buffer: GridBuffer, cols: number, rows: number): void {
  const nextCols = Math.max(0, Math.floor(cols));
  const nextRows = Math.max(0, Math.floor(rows));

  if (nextCols === buffer.cols && nextRows === buffer.rows) return;

  const prevRows = buffer.rows;
  const prevDirtyAll = buffer.dirtyAll;
  const prevDirtyBits = buffer.dirtyBits;
  const blank = createBlankCell();
  const nextGrid: Cell[][] = Array.from({ length: nextRows }, () =>
    Array.from({ length: nextCols }, () => blank),
  );

  const copyRows = Math.min(prevRows, nextRows);
  const copyCols = Math.min(buffer.cols, nextCols);
  for (let y = 0; y < copyRows; y++) {
    const src = getBufferRow(buffer, y);
    const dst = nextGrid[y]!;
    for (let x = 0; x < copyCols; x++) dst[x] = src[x]!;
  }

  // Ensure we don't end on a continuation cell after resizing narrower.
  if (nextCols > 0) {
    for (let y = 0; y < nextGrid.length; y++) {
      const row = nextGrid[y]!;
      for (let x = 0; x < nextCols; x++) {
        const cell = row[x]!;
        if (cell.continuation) {
          if (x === 0 || row[x - 1]?.width !== 2 || row[x - 1]?.continuation) row[x] = blank;
          continue;
        }
        if (cell.width === 2 && (x + 1 >= nextCols || !row[x + 1]?.continuation)) {
          row[x] = blank;
        }
      }
    }
  }

  // Existing rows become eligible for pooling.
  for (let y = 0; y < buffer.rows; y++) buffer.rowPool.push(getBufferRow(buffer, y));

  buffer.grid = nextGrid;
  buffer.gridStart = 0;

  buffer.cols = nextCols;
  buffer.rows = nextRows;
  buffer.dirtyBits = new Uint8Array(nextRows);
  buffer.dirtyCount = 0;
  buffer.dirtyMin = Number.POSITIVE_INFINITY;
  buffer.dirtyMax = -1;
  buffer.dirtyAll = prevDirtyAll && nextRows > 0;
  if (buffer.dirtyAll) {
    buffer.dirtyCount = nextRows;
    buffer.dirtyMin = 0;
    buffer.dirtyMax = nextRows - 1;
  } else {
    for (let y = 0; y < copyRows; y++) {
      if (prevDirtyBits[y] !== 1) continue;
      buffer.dirtyBits[y] = 1;
      buffer.dirtyCount++;
      if (y < buffer.dirtyMin) buffer.dirtyMin = y;
      if (y > buffer.dirtyMax) buffer.dirtyMax = y;
    }
  }
  buffer.cursorX = clamp(buffer.cursorX, 0, Math.max(0, nextCols));
  buffer.cursorY = clamp(buffer.cursorY, 0, Math.max(0, nextRows - 1));

  // Reallocate SoA fingerprints if enabled
  if (buffer.fingerprintFn) {
    const len = nextRows * nextCols;
    if (len > 0) {
      buffer.soaFingerprints = new Uint32Array(len);
      // Recompute fingerprints for the new grid (gridStart is now 0)
      for (let y = 0; y < nextRows; y++) {
        const row = nextGrid[y]!;
        const base = y * nextCols;
        for (let x = 0; x < nextCols; x++) {
          const cell = row[x]!;
          buffer.soaFingerprints[base + x] = buffer.fingerprintFn(cell.ch, cell.style);
        }
      }
    } else {
      buffer.soaFingerprints = null;
    }
  }
}

export function snapshotText(buffer: GridBuffer): string[] {
  const out: string[] = [];
  for (let y = 0; y < buffer.rows; y++) {
    const row = getBufferRow(buffer, y);
    out.push(row.map((cell) => (cell.continuation ? " " : cell.ch || " ")).join(""));
  }
  return out;
}
