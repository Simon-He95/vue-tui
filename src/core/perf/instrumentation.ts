/**
 * Performance instrumentation for Phase 3 profiling
 *
 * This module provides debug-only metrics collection without affecting production behavior.
 * All instrumentation is designed to be zero-cost when disabled.
 */

export interface CellCacheMetrics {
  createCellCalls: number;
  charCellWidthCallsFromCreateCell: number;
  newCellCount: number;
  cellCacheHitWidth1: number;
  cellCacheHitWidth2: number;
  cellCacheMissWidth1: number;
  cellCacheMissWidth2: number;
  cellCacheClearWidth1: number;
  cellCacheClearWidth2: number;
  blankCellCacheHit: number;
  blankCellCacheMiss: number;
  continuationCellCacheHit: number;
  continuationCellCacheMiss: number;
  maxCacheSizeWidth1: number;
  maxCacheSizeWidth2: number;
  estimatedLiveStyleBuckets: number;
}

export interface TextCacheMetrics {
  textCellWidthCalls: number;
  textWidthCacheHit: number;
  textWidthCacheMiss: number;
  textWidthCacheSet: number;
  textWidthCacheEvict: number;
  renderPassTextWidthCacheHit: number;
  renderPassTextWidthCacheMiss: number;
  wrapByCellsCalls: number;
  wrapCacheHit: number;
  wrapCacheMiss: number;
  wrapCacheSet: number;
  wrapCacheClear: number;
  maxTextLength: number;
  totalTextLength: number;
  asciiCount: number;
  nonAsciiCount: number;
}

export interface GraphemeMetrics {
  segmentedGraphemesCalls: number;
  intlSegmenterUsed: number;
  fallbackSegmenterUsed: number;
  complexGraphemeCount: number;
}

export interface PerformanceMetrics {
  cell: CellCacheMetrics;
  text: TextCacheMetrics;
  grapheme: GraphemeMetrics;
  heapUsedBefore?: number;
  heapUsedAfter?: number;
  gcCount?: number;
}

let instrumentationEnabled = false;

const cellMetrics: CellCacheMetrics = {
  createCellCalls: 0,
  charCellWidthCallsFromCreateCell: 0,
  newCellCount: 0,
  cellCacheHitWidth1: 0,
  cellCacheHitWidth2: 0,
  cellCacheMissWidth1: 0,
  cellCacheMissWidth2: 0,
  cellCacheClearWidth1: 0,
  cellCacheClearWidth2: 0,
  blankCellCacheHit: 0,
  blankCellCacheMiss: 0,
  continuationCellCacheHit: 0,
  continuationCellCacheMiss: 0,
  maxCacheSizeWidth1: 0,
  maxCacheSizeWidth2: 0,
  estimatedLiveStyleBuckets: 0,
};

const textMetrics: TextCacheMetrics = {
  textCellWidthCalls: 0,
  textWidthCacheHit: 0,
  textWidthCacheMiss: 0,
  textWidthCacheSet: 0,
  textWidthCacheEvict: 0,
  renderPassTextWidthCacheHit: 0,
  renderPassTextWidthCacheMiss: 0,
  wrapByCellsCalls: 0,
  wrapCacheHit: 0,
  wrapCacheMiss: 0,
  wrapCacheSet: 0,
  wrapCacheClear: 0,
  maxTextLength: 0,
  totalTextLength: 0,
  asciiCount: 0,
  nonAsciiCount: 0,
};

const graphemeMetrics: GraphemeMetrics = {
  segmentedGraphemesCalls: 0,
  intlSegmenterUsed: 0,
  fallbackSegmenterUsed: 0,
  complexGraphemeCount: 0,
};

/**
 * Enable instrumentation collection
 */
export function enableInstrumentation(): void {
  instrumentationEnabled = true;
}

/**
 * Disable instrumentation collection
 */
export function disableInstrumentation(): void {
  instrumentationEnabled = false;
}

/**
 * Check if instrumentation is enabled
 */
export function isInstrumentationEnabled(): boolean {
  return instrumentationEnabled;
}

/**
 * Reset all metrics to zero
 */
export function resetMetrics(): void {
  // Cell metrics
  cellMetrics.createCellCalls = 0;
  cellMetrics.charCellWidthCallsFromCreateCell = 0;
  cellMetrics.newCellCount = 0;
  cellMetrics.cellCacheHitWidth1 = 0;
  cellMetrics.cellCacheHitWidth2 = 0;
  cellMetrics.cellCacheMissWidth1 = 0;
  cellMetrics.cellCacheMissWidth2 = 0;
  cellMetrics.cellCacheClearWidth1 = 0;
  cellMetrics.cellCacheClearWidth2 = 0;
  cellMetrics.blankCellCacheHit = 0;
  cellMetrics.blankCellCacheMiss = 0;
  cellMetrics.continuationCellCacheHit = 0;
  cellMetrics.continuationCellCacheMiss = 0;
  cellMetrics.maxCacheSizeWidth1 = 0;
  cellMetrics.maxCacheSizeWidth2 = 0;
  cellMetrics.estimatedLiveStyleBuckets = 0;

  // Text metrics
  textMetrics.textCellWidthCalls = 0;
  textMetrics.textWidthCacheHit = 0;
  textMetrics.textWidthCacheMiss = 0;
  textMetrics.textWidthCacheSet = 0;
  textMetrics.textWidthCacheEvict = 0;
  textMetrics.renderPassTextWidthCacheHit = 0;
  textMetrics.renderPassTextWidthCacheMiss = 0;
  textMetrics.wrapByCellsCalls = 0;
  textMetrics.wrapCacheHit = 0;
  textMetrics.wrapCacheMiss = 0;
  textMetrics.wrapCacheSet = 0;
  textMetrics.wrapCacheClear = 0;
  textMetrics.maxTextLength = 0;
  textMetrics.totalTextLength = 0;
  textMetrics.asciiCount = 0;
  textMetrics.nonAsciiCount = 0;

  // Grapheme metrics
  graphemeMetrics.segmentedGraphemesCalls = 0;
  graphemeMetrics.intlSegmenterUsed = 0;
  graphemeMetrics.fallbackSegmenterUsed = 0;
  graphemeMetrics.complexGraphemeCount = 0;
}

/**
 * Get current metrics snapshot
 */
export function getMetrics(): PerformanceMetrics {
  return {
    cell: { ...cellMetrics },
    text: { ...textMetrics },
    grapheme: { ...graphemeMetrics },
  };
}

/**
 * Get metrics with heap information (requires --expose-gc and Chrome/Node)
 */
export function getMetricsWithHeap(): PerformanceMetrics {
  const metrics = getMetrics();

  // Only available in Chrome/Node with performance.memory extension
  const perf = performance as any;
  if (typeof global.gc === "function" && perf.memory) {
    metrics.heapUsedBefore = perf.memory.usedJSHeapSize;
    global.gc();
    metrics.heapUsedAfter = perf.memory.usedJSHeapSize;
  }

  return metrics;
}

// Cell cache instrumentation helpers
export const cellInstr = {
  recordCreateCellCall() {
    if (!instrumentationEnabled) return;
    cellMetrics.createCellCalls++;
  },

  recordCharCellWidthCall() {
    if (!instrumentationEnabled) return;
    cellMetrics.charCellWidthCallsFromCreateCell++;
  },

  recordNewCell() {
    if (!instrumentationEnabled) return;
    cellMetrics.newCellCount++;
  },

  recordCacheHit(width: 1 | 2) {
    if (!instrumentationEnabled) return;
    if (width === 1) {
      cellMetrics.cellCacheHitWidth1++;
    } else {
      cellMetrics.cellCacheHitWidth2++;
    }
  },

  recordCacheMiss(width: 1 | 2) {
    if (!instrumentationEnabled) return;
    if (width === 1) {
      cellMetrics.cellCacheMissWidth1++;
    } else {
      cellMetrics.cellCacheMissWidth2++;
    }
  },

  recordCacheClear(width: 1 | 2) {
    if (!instrumentationEnabled) return;
    if (width === 1) {
      cellMetrics.cellCacheClearWidth1++;
    } else {
      cellMetrics.cellCacheClearWidth2++;
    }
  },

  recordBlankCacheHit() {
    if (!instrumentationEnabled) return;
    cellMetrics.blankCellCacheHit++;
  },

  recordBlankCacheMiss() {
    if (!instrumentationEnabled) return;
    cellMetrics.blankCellCacheMiss++;
  },

  recordContinuationCacheHit() {
    if (!instrumentationEnabled) return;
    cellMetrics.continuationCellCacheHit++;
  },

  recordContinuationCacheMiss() {
    if (!instrumentationEnabled) return;
    cellMetrics.continuationCellCacheMiss++;
  },

  updateMaxCacheSize(width: 1 | 2, size: number) {
    if (!instrumentationEnabled) return;
    if (width === 1) {
      cellMetrics.maxCacheSizeWidth1 = Math.max(cellMetrics.maxCacheSizeWidth1, size);
    } else {
      cellMetrics.maxCacheSizeWidth2 = Math.max(cellMetrics.maxCacheSizeWidth2, size);
    }
  },

  estimateLiveStyleBuckets(count: number) {
    if (!instrumentationEnabled) return;
    cellMetrics.estimatedLiveStyleBuckets = count;
  },
};

// Text cache instrumentation helpers
export const textInstr = {
  recordTextCellWidthCall(textLength: number, isAscii: boolean) {
    if (!instrumentationEnabled) return;
    textMetrics.textCellWidthCalls++;
    textMetrics.totalTextLength += textLength;
    textMetrics.maxTextLength = Math.max(textMetrics.maxTextLength, textLength);
    if (isAscii) {
      textMetrics.asciiCount++;
    } else {
      textMetrics.nonAsciiCount++;
    }
  },

  recordTextWidthCacheHit() {
    if (!instrumentationEnabled) return;
    textMetrics.textWidthCacheHit++;
  },

  recordTextWidthCacheMiss() {
    if (!instrumentationEnabled) return;
    textMetrics.textWidthCacheMiss++;
  },

  recordTextWidthCacheSet() {
    if (!instrumentationEnabled) return;
    textMetrics.textWidthCacheSet++;
  },

  recordTextWidthCacheEvict() {
    if (!instrumentationEnabled) return;
    textMetrics.textWidthCacheEvict++;
  },

  recordRenderPassCacheHit() {
    if (!instrumentationEnabled) return;
    textMetrics.renderPassTextWidthCacheHit++;
  },

  recordRenderPassCacheMiss() {
    if (!instrumentationEnabled) return;
    textMetrics.renderPassTextWidthCacheMiss++;
  },

  recordWrapByCellsCall() {
    if (!instrumentationEnabled) return;
    textMetrics.wrapByCellsCalls++;
  },

  recordWrapCacheHit() {
    if (!instrumentationEnabled) return;
    textMetrics.wrapCacheHit++;
  },

  recordWrapCacheMiss() {
    if (!instrumentationEnabled) return;
    textMetrics.wrapCacheMiss++;
  },

  recordWrapCacheSet() {
    if (!instrumentationEnabled) return;
    textMetrics.wrapCacheSet++;
  },

  recordWrapCacheClear() {
    if (!instrumentationEnabled) return;
    textMetrics.wrapCacheClear++;
  },
};

// Grapheme instrumentation helpers
export const graphemeInstr = {
  recordSegmentedGraphemesCall() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.segmentedGraphemesCalls++;
  },

  recordIntlSegmenterUsed() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.intlSegmenterUsed++;
  },

  recordFallbackSegmenterUsed() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.fallbackSegmenterUsed++;
  },

  recordComplexGrapheme() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.complexGraphemeCount++;
  },
};
