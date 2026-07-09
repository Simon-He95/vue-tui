# Phase 3 Review Fixes - Implementation Plan

## Critical Fixes (Blocking)

### 1. ✅ Zero-Cost / Low-Overhead Fix
**Status**: DONE
**File**: `src/vue/utils/text.ts`
**Fix**: Moved instrumentation checks inside conditional branches to avoid extra `isAscii()` call for function providers

### 2. Documentation Import Path Fix
**Status**: TODO
**Files**: 
- `docs/PHASE3_INSTRUMENTATION.md`
- `README` examples

**Fix**: Change from:
```typescript
import { ... } from '@simon_he/vue-tui/core/perf/instrumentation';
```

To (internal API):
```typescript
import { ... } from "../src/core/perf/instrumentation.js";
```

Add note:
> **Note**: This is an internal development/profiling API and is not exported in the npm package.

### 3. Cell Cache Bucket Distribution Tracking
**Status**: TODO  
**File**: `src/core/perf/instrumentation.ts`, `src/core/buffer/buffer.ts`

**Add to CellCacheMetrics**:
```typescript
cellCacheBucketCountWidth1: number;
cellCacheBucketCountWidth2: number;
estimatedRetainedCells: number;
```

**Implementation**:
```typescript
// In instrumentation.ts
const cellCacheBuckets: Array<{ width: 1 | 2; map: WeakMap<Style, Map<string, Cell>> }> = [];

export const cellInstr = {
  registerCellCacheBucket(width: 1 | 2, map: Map<string, Cell>) {
    if (!instrumentationEnabled) return;
    // Track bucket for distribution analysis
  },
  
  getCacheBucketDistribution(): { width1Sizes: number[]; width2Sizes: number[] } {
    // Calculate P50/P95/max for bucket sizes
  }
};
```

### 4. Wrap/Inline Cache Instrumentation
**Status**: TODO
**File**: `src/vue/utils/text.ts`

**Add metrics**:
```typescript
wrapWidthBucketMapClear: number;  // wrapCacheByWidth.clear()
inlineLineCacheHit: number;
inlineLineCacheMiss: number;
inlineLineCacheSet: number;
inlineLineCacheClear: number;
```

**Add instrumentation to**:
- `getWrapBucket()`: Record when wrapCacheByWidth.clear() happens
- `sliceByCells()`: Record inline cache hit/miss/set/clear

### 5. Fix Profiler Workloads
**Status**: TODO
**File**: `scripts/bench-profiler.ts`

**Fixes needed**:

a) **Workload 2 - Unique CJK Logs**:
```typescript
// Change from log lines to truly unique characters
for (let i = 0; i < 1000; i++) {
  const chars = Array.from({ length: 80 }, (_, j) =>
    String.fromCodePoint(0x4e00 + ((i * 80 + j) % 2000))
  ).join("");
  terminal.write(chars, { x: 0, y: i % 24 });
}
```

b) **Workload 3 - Complex Grapheme**:
- Split into `complex_grapheme_repeated_cached` and `complex_grapheme_unique_uncached`
- Fix combining marks: Use `e\u0301` instead of `é`, `i\u0308` instead of `ï`
- For uncached version, generate unique strings or clear cache between iterations

c) **Workload 4 - Long Text Wrapping**:
- Split into:
  - `long_text_wrapping_repeated`
  - `long_text_wrapping_unique_10k_logs`
  - `long_text_wrapping_width_churn` (test > 32 widths)

d) **New Workload - Cell Cache Overflow**:
```typescript
function workload_cellCacheOverflow(): WorkloadResult {
  // Explicitly test MAX_CACHED_CELLS_PER_STYLE = 128
  // Generate > 128 unique width=2 characters
}
```

### 6. Fix Duration Measurement
**Status**: TODO
**File**: `scripts/bench-profiler.ts`

**Changes**:
```typescript
// Setup first
const terminal = createTerminal({ cols: 80, rows: 24 });

// Then enable and measure
resetMetrics();
enableInstrumentation();
const startWith = performance.now();

try {
  // workload
} finally {
  const durationWith = performance.now() - startWith;
  const metricsEnabled = getMetrics();
  disableInstrumentation();
}

// Measure without instrumentation
resetMetrics();
const startWithout = performance.now();

try {
  // same workload
} finally {
  const durationWithout = performance.now() - startWithout;
}

return {
  durationWithInstrumentation: durationWith,
  durationWithoutInstrumentation: durationWithout,
  instrumentationOverhead: (durationWith / durationWithout - 1) * 100,
  metrics: metricsEnabled,
};
```

### 7. Fix Heap Metrics
**Status**: TODO
**File**: `src/core/perf/instrumentation.ts`

**Replace**:
```typescript
export function getHeapUsed(): number | null {
  // Try Node first
  if (typeof process !== "undefined" && typeof process.memoryUsage === "function") {
    return process.memoryUsage().heapUsed;
  }

  // Try Chrome/browser
  const memory = (performance as any).memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}
```

**In benchmark**:
```typescript
if (typeof global.gc === "function") global.gc();
const heapBefore = getHeapUsed();

// workload

if (typeof global.gc === "function") global.gc();
const heapAfter = getHeapUsed();
```

### 8. Add Tests
**Status**: TODO
**File**: `test/instrumentation.test.ts` (new)

**Tests needed**:
```typescript
describe("Performance Instrumentation", () => {
  it("keeps metrics at zero when disabled", () => {
    resetMetrics();
    disableInstrumentation();
    
    const terminal = createTerminal({ cols: 10, rows: 1 });
    terminal.write("abc中", { x: 0, y: 0 });
    
    expect(getMetrics().cell.createCellCalls).toBe(0);
  });

  it("records metrics only when enabled", () => {
    resetMetrics();
    enableInstrumentation();
    
    try {
      const terminal = createTerminal({ cols: 10, rows: 1 });
      terminal.write("abc中", { x: 0, y: 0 });
      
      expect(getMetrics().cell.createCellCalls).toBeGreaterThan(0);
    } finally {
      disableInstrumentation();
    }
  });

  it("stops recording after disable", () => {
    resetMetrics();
    enableInstrumentation();
    
    const terminal = createTerminal({ cols: 10, rows: 1 });
    terminal.write("abc", { x: 0, y: 0 });
    
    const countAfterEnable = getMetrics().cell.createCellCalls;
    disableInstrumentation();
    
    terminal.write("def", { x: 0, y: 0 });
    const countAfterDisable = getMetrics().cell.createCellCalls;
    
    expect(countAfterDisable).toBe(countAfterEnable);
  });
});
```

### 9. Update Documentation Language
**Status**: TODO
**Files**: All docs, comments, PR description

**Changes**:
- "zero-cost" → "low-overhead"
- Add note: "When disabled, instrumentation adds minimal overhead (function call + boolean check). For function providers with non-ASCII text, there is no additional isAscii() scan."
- Emphasize this is internal/development API

### 10. Fix Grapheme Metrics Naming
**Status**: TODO
**File**: `src/core/perf/instrumentation.ts`

**Rename**:
```typescript
// Current
segmentedGraphemesCalls  // Misleading - only counts when segmentation needed

// Better
graphemeSegmentationRequiredCalls
```

## Non-Blocking Improvements

### 11. Add Baseline Comparison
**Status**: OPTIONAL
**Action**: Run `bench:perf-baseline:smoke` before and after Phase 3, include results in PR to prove low overhead

### 12. Export Decision
**Status**: DEFERRED
**Decision**: Keep as internal API for now. Can add package export later if needed.

## Summary

- **Critical**: 1, 2, 3, 4, 5, 6, 7, 8
- **Important**: 9, 10
- **Optional**: 11, 12

**Estimated Work**: 4-6 hours for all critical fixes
**Impact**: Makes Phase 3 ready to support Phase 4 data-driven optimization decisions
