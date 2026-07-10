/**
 * Performance instrumentation for Phase 3 profiling
 *
 * This module provides debug-only metrics collection without affecting production behavior.
 * All instrumentation is designed to be low-overhead when disabled.
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
  // Registered bucket metrics (populated when instrumentation enabled)
  // Note: These count buckets registered since last resetMetrics(), not truly "live" buckets
  registeredBucketCountWidth1: number;
  registeredBucketCountWidth2: number;
  registeredBucketSizeP50Width1: number;
  registeredBucketSizeP95Width1: number;
  registeredBucketSizeMaxWidth1: number;
  registeredBucketSizeP50Width2: number;
  registeredBucketSizeP95Width2: number;
  registeredBucketSizeMaxWidth2: number;
  estimatedRegisteredBucketCells: number;
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
  wrapWidthBucketMapClear: number;
  maxTextLength: number;
  totalTextLength: number;
  // Note: asciiFastPathCount only counts when hasAsciiFastPath(provider) && isAscii(text)
  // Other cases (non-ASCII or custom provider) count as nonAsciiOrNoFastPathCount
  asciiFastPathCount: number;
  nonAsciiOrNoFastPathCount: number;
}

export interface GraphemeMetrics {
  graphemeSegmentationRequiredCalls: number;
  intlSegmenterUsed: number;
  fallbackSegmenterUsed: number;
  // Count of inputs that required segmentation (not count of graphemes)
  segmentationRequiredInputCount: number;
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
  registeredBucketCountWidth1: 0,
  registeredBucketCountWidth2: 0,
  registeredBucketSizeP50Width1: 0,
  registeredBucketSizeP95Width1: 0,
  registeredBucketSizeMaxWidth1: 0,
  registeredBucketSizeP50Width2: 0,
  registeredBucketSizeP95Width2: 0,
  registeredBucketSizeMaxWidth2: 0,
  estimatedRegisteredBucketCells: 0,
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
  wrapWidthBucketMapClear: 0,
  maxTextLength: 0,
  totalTextLength: 0,
  // Note: asciiFastPathCount only counts when hasAsciiFastPath(provider) && isAscii(text)
  // Other cases (non-ASCII or custom provider) count as nonAsciiOrNoFastPathCount
  asciiFastPathCount: 0,
  nonAsciiOrNoFastPathCount: 0,
};

const graphemeMetrics: GraphemeMetrics = {
  graphemeSegmentationRequiredCalls: 0,
  intlSegmenterUsed: 0,
  fallbackSegmenterUsed: 0,
  // Count of inputs that required segmentation (not count of graphemes)
  segmentationRequiredInputCount: 0,
};

// Cell cache bucket tracking (only when instrumentation enabled)
const cellCacheBucketsWidth1: Array<Map<string, any>> = [];
const cellCacheBucketsWidth2: Array<Map<string, any>> = [];

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
  cellMetrics.registeredBucketCountWidth1 = 0;
  cellMetrics.registeredBucketCountWidth2 = 0;
  cellMetrics.registeredBucketSizeP50Width1 = 0;
  cellMetrics.registeredBucketSizeP95Width1 = 0;
  cellMetrics.registeredBucketSizeMaxWidth1 = 0;
  cellMetrics.registeredBucketSizeP50Width2 = 0;
  cellMetrics.registeredBucketSizeP95Width2 = 0;
  cellMetrics.registeredBucketSizeMaxWidth2 = 0;
  cellMetrics.estimatedRegisteredBucketCells = 0;

  // Clear bucket tracking
  cellCacheBucketsWidth1.length = 0;
  cellCacheBucketsWidth2.length = 0;

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
  textMetrics.wrapWidthBucketMapClear = 0;
  textMetrics.maxTextLength = 0;
  textMetrics.totalTextLength = 0;
  textMetrics.asciiFastPathCount = 0;
  textMetrics.nonAsciiOrNoFastPathCount = 0;

  // Grapheme metrics
  graphemeMetrics.graphemeSegmentationRequiredCalls = 0;
  graphemeMetrics.intlSegmenterUsed = 0;
  graphemeMetrics.fallbackSegmenterUsed = 0;
  graphemeMetrics.segmentationRequiredInputCount = 0;

  // Clear bucket tracking
  cellCacheBucketsWidth1.length = 0;
  cellCacheBucketsWidth2.length = 0;
}

/**
 * Helper: Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index]!;
}

/**
 * Get cache bucket distribution (Phase 3.2)
 */
function getCacheBucketDistribution() {
  const width1Sizes = cellCacheBucketsWidth1.map((b) => b.size).sort((a, b) => a - b);
  const width2Sizes = cellCacheBucketsWidth2.map((b) => b.size).sort((a, b) => a - b);

  const estimatedRegisteredBucketCells =
    width1Sizes.reduce((sum, s) => sum + s, 0) + width2Sizes.reduce((sum, s) => sum + s, 0);

  return {
    bucketCountWidth1: width1Sizes.length,
    bucketCountWidth2: width2Sizes.length,
    sizeP50Width1: percentile(width1Sizes, 0.5),
    sizeP95Width1: percentile(width1Sizes, 0.95),
    sizeMaxWidth1: Math.max(...width1Sizes, 0),
    sizeP50Width2: percentile(width2Sizes, 0.5),
    sizeP95Width2: percentile(width2Sizes, 0.95),
    sizeMaxWidth2: Math.max(...width2Sizes, 0),
    estimatedRegisteredBucketCells,
  };
}

/**
 * Get current metrics snapshot
 */
export function getMetrics(): PerformanceMetrics {
  const cellMetricsSnapshot = { ...cellMetrics };

  // Populate bucket distribution if instrumentation enabled
  if (instrumentationEnabled) {
    const distribution = getCacheBucketDistribution();
    cellMetricsSnapshot.registeredBucketCountWidth1 = distribution.bucketCountWidth1;
    cellMetricsSnapshot.registeredBucketCountWidth2 = distribution.bucketCountWidth2;
    cellMetricsSnapshot.registeredBucketSizeP50Width1 = distribution.sizeP50Width1;
    cellMetricsSnapshot.registeredBucketSizeP95Width1 = distribution.sizeP95Width1;
    cellMetricsSnapshot.registeredBucketSizeMaxWidth1 = distribution.sizeMaxWidth1;
    cellMetricsSnapshot.registeredBucketSizeP50Width2 = distribution.sizeP50Width2;
    cellMetricsSnapshot.registeredBucketSizeP95Width2 = distribution.sizeP95Width2;
    cellMetricsSnapshot.registeredBucketSizeMaxWidth2 = distribution.sizeMaxWidth2;
    cellMetricsSnapshot.estimatedRegisteredBucketCells =
      distribution.estimatedRegisteredBucketCells;
  }

  return {
    cell: cellMetricsSnapshot,
    text: { ...textMetrics },
    grapheme: { ...graphemeMetrics },
  };
}

/**
 * Get heap used bytes (Node.js or Chrome)
 */
export function getHeapUsed(): number | null {
  // Try Node.js first
  if (typeof process !== "undefined" && typeof process.memoryUsage === "function") {
    return process.memoryUsage().heapUsed;
  }

  // Try Chrome/browser
  const memory = (performance as any).memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

/**
 * Get metrics with heap information
 *
 * Note: heapUsedBefore/After measures GC impact, not workload memory.
 * To measure workload memory, call getHeapUsed() before/after your workload.
 */
export function getMetricsWithHeap(): PerformanceMetrics {
  const metrics = getMetrics();

  const heapBefore = getHeapUsed();
  if (heapBefore !== null) {
    metrics.heapUsedBefore = heapBefore;
  }

  // Only try GC if available - safe for browser and Node
  const maybeGc = (globalThis as any).gc;
  if (typeof maybeGc === "function") {
    maybeGc();
    const heapAfter = getHeapUsed();
    if (heapAfter !== null) {
      metrics.heapUsedAfter = heapAfter;
    }
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

  registerCacheBucket(width: 1 | 2, bucket: Map<string, any>) {
    if (!instrumentationEnabled) return;
    if (width === 1) {
      cellCacheBucketsWidth1.push(bucket);
    } else {
      cellCacheBucketsWidth2.push(bucket);
    }
  },

  updateBucketCounts(width1Count: number, width2Count: number) {
    if (!instrumentationEnabled) return;
    cellMetrics.registeredBucketCountWidth1 = width1Count;
    cellMetrics.registeredBucketCountWidth2 = width2Count;
  },

  updateEstimatedRetainedCells(count: number) {
    if (!instrumentationEnabled) return;
    cellMetrics.estimatedRegisteredBucketCells = count;
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
      textMetrics.asciiFastPathCount++;
    } else {
      textMetrics.nonAsciiOrNoFastPathCount++;
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

  recordWrapWidthBucketMapClear() {
    if (!instrumentationEnabled) return;
    textMetrics.wrapWidthBucketMapClear++;
  },
};

// Grapheme instrumentation helpers
export const graphemeInstr = {
  recordSegmentedGraphemesCall() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.graphemeSegmentationRequiredCalls++;
  },

  recordIntlSegmenterUsed() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.intlSegmenterUsed++;
  },

  recordFallbackSegmenterUsed() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.fallbackSegmenterUsed++;
  },

  recordSegmentationRequiredInput() {
    if (!instrumentationEnabled) return;
    graphemeMetrics.segmentationRequiredInputCount++;
  },
};
