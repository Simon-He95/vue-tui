# Phase 3.2: Complete Instrumentation for Phase 4 Readiness

## Overview

Phase 3.2 completes the instrumentation work started in Phase 3.1, adding the missing pieces needed to support Phase 4 cache tuning decisions.

## Goals

1. **Enable cache tuning decisions**: Provide bucket size distribution data
2. **Validate cache limits**: Add workloads that stress cache overflow
3. **Measure true costs**: Separate cached vs uncached paths
4. **Quantify overhead**: Measure instrumentation impact
5. **Track memory**: Heap delta measurement

## What Phase 3.2 Adds

### 1. Cell Cache Bucket Distribution Tracking

**Problem**: Phase 3.1 can tell us cache hit rate, but not:

- How many Style buckets exist
- Size distribution of each bucket (P50/P95/max)
- Estimated retained Cell count
- Whether increasing `MAX_CACHED_CELLS_PER_STYLE` would help

**Solution**: Lightweight bucket registry when instrumentation enabled

```typescript
// Only when instrumentation is enabled
const cellCacheBucketsWidth1: WeakMap<Style, Map<string, Cell>>[] = [];
const cellCacheBucketsWidth2: WeakMap<Style, Map<string, Cell>>[] = [];

// Register buckets as they're created
function getOrCreateCellCache(map, style, width) {
  const cached = map.get(style);
  if (cached) return cached;

  const next = new Map();
  map.set(style, next);

  if (isInstrumentationEnabled()) {
    // Track this bucket
    if (width === 1) cellCacheBucketsWidth1.push(next);
    else cellCacheBucketsWidth2.push(next);
  }

  return next;
}

// Calculate distribution on demand
function getCacheBucketDistribution() {
  const width1Sizes = cellCacheBucketsWidth1.map((b) => b.size);
  const width2Sizes = cellCacheBucketsWidth2.map((b) => b.size);

  return {
    bucketCountWidth1: width1Sizes.length,
    bucketCountWidth2: width2Sizes.length,
    sizeP50Width1: percentile(width1Sizes, 0.5),
    sizeP95Width1: percentile(width1Sizes, 0.95),
    sizeMaxWidth1: Math.max(...width1Sizes, 0),
    sizeP50Width2: percentile(width2Sizes, 0.5),
    sizeP95Width2: percentile(width2Sizes, 0.95),
    sizeMaxWidth2: Math.max(...width2Sizes, 0),
    estimatedRetainedCells: sum(width1Sizes) + sum(width2Sizes),
  };
}
```

**Impact**: Can now answer "should we increase MAX_CACHED_CELLS_PER_STYLE?"

### 2. True Cache Overflow Workloads

**Problem**: Phase 3.1 workloads don't stress cache limits

**New Workloads**:

```typescript
// Workload: Cell Cache Overflow Width=1
// Generate > 128 unique ASCII chars under same style
function workload_cellCacheOverflowWidth1() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  // Write 200 unique ASCII/Latin-1 chars
  for (let i = 0; i < 200; i++) {
    const ch = String.fromCharCode(0x21 + (i % 94)); // Printable ASCII
    terminal.write(ch, { x: i % 80, y: 0 });
  }
}

// Workload: Cell Cache Overflow Width=2
// Generate > 128 unique CJK chars under same style
function workload_cellCacheOverflowWidth2() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  // Write 200 unique CJK chars
  for (let i = 0; i < 200; i++) {
    const ch = String.fromCodePoint(0x4e00 + i);
    terminal.write(ch, { x: (i * 2) % 80, y: (i * 2) / 80 });
  }
}

// Workload: Many Styles Many Chars
// Stress bucket count limit
function workload_manyStylesManyChars() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  // 50 unique styles × 10 unique chars each
  for (let styleIdx = 0; styleIdx < 50; styleIdx++) {
    const style = { fg: styleIdx };
    for (let charIdx = 0; charIdx < 10; charIdx++) {
      const ch = String.fromCodePoint(0x4e00 + styleIdx * 10 + charIdx);
      terminal.write(ch, { x: charIdx * 2, y: styleIdx % 24, style });
    }
  }
}
```

**Expected**: See `cellCacheClearWidth1/2` increment, bucket sizes hit 128

### 3. Cached vs Uncached Grapheme Workloads

**Problem**: Phase 3.1 complex grapheme workload mostly hits cache

**Solution**: Split into two workloads

```typescript
// Workload: Complex Grapheme Cached (baseline)
function workload_complexGraphemeCached() {
  const lines = [
    "👩\u200d💻 Developer",
    "👨\u200d👩\u200d👧\u200d👦 Family",
    "🇺🇸 Flag",
    "e\u0301 café",
  ];

  // Call 500 times - should mostly hit cache
  for (let i = 0; i < 500; i++) {
    for (const line of lines) {
      textCellWidth(line);
    }
  }
}

// Workload: Complex Grapheme Uncached (true cost)
function workload_complexGraphemeUncached() {
  // Generate 2000 unique complex strings
  for (let i = 0; i < 2000; i++) {
    const text = `👨\u200d💻-${i} e\u0301-${i}`;
    textCellWidth(text);
  }
}
```

**Expected**: Uncached shows much higher `graphemeSegmentationRequiredCalls`

### 4. Width Churn Workload

**Problem**: Phase 3.1 only tests 5 widths, doesn't trigger bucket map clear

**Solution**: Test > 32 widths

```typescript
// Workload: Wrap Width Churn
// Test MAX_WRAP_CACHE_BUCKETS = 32 limit
function workload_wrapWidthChurn() {
  const longLine = "这是一个很长的中文文本行。".repeat(20);

  // Wrap at 50 different widths (exceeds bucket limit)
  for (let width = 20; width <= 70; width++) {
    wrapByCells(longLine, width);
  }
}
```

**Expected**: See `wrapWidthBucketMapClear` > 0

### 5. Duration With/Without Instrumentation

**Problem**: Phase 3.1 duration includes setup and doesn't show overhead

**Solution**: Measure both and calculate ratio

```typescript
function measureWorkload(workloadFn, name) {
  // Setup first
  const setup = setupWorkload();

  // Without instrumentation
  disableInstrumentation();
  const startDisabled = performance.now();
  workloadFn(setup);
  const durationDisabled = performance.now() - startDisabled;

  // With instrumentation
  resetMetrics();
  enableInstrumentation();
  const startEnabled = performance.now();
  try {
    workloadFn(setup);
    const durationEnabled = performance.now() - startEnabled;
    const metrics = getMetrics();

    return {
      name,
      durationWithoutInstrumentation: durationDisabled,
      durationWithInstrumentation: durationEnabled,
      overheadRatio: (durationEnabled / durationDisabled - 1) * 100,
      metrics,
    };
  } finally {
    disableInstrumentation();
  }
}
```

**Expected**: Overhead < 10% for most workloads

### 6. Heap Before/After Measurement

**Problem**: Phase 3.1 has heap helpers but doesn't use them

**Solution**: Measure heap delta per workload

```typescript
function measureWithHeap(workloadFn) {
  // Force GC if available
  if (typeof globalThis.gc === "function") globalThis.gc();

  const heapBefore = getHeapUsed();

  resetMetrics();
  enableInstrumentation();
  try {
    workloadFn();

    const metrics = getMetrics();

    // Force GC again
    if (typeof globalThis.gc === "function") globalThis.gc();
    const heapAfter = getHeapUsed();

    if (heapBefore !== null && heapAfter !== null) {
      metrics.heapDelta = heapAfter - heapBefore;
    }

    return metrics;
  } finally {
    disableInstrumentation();
  }
}
```

**Expected**: Can see retained memory per workload

### 7. Robust Error Handling

**Problem**: Phase 3.1 workloads don't use try/finally

**Solution**: Ensure cleanup

```typescript
// All workloads wrapped in try/finally
try {
  enableInstrumentation();
  resetMetrics();

  // workload

  return getMetrics();
} finally {
  disableInstrumentation();
  terminal?.dispose();
}
```

## Implementation Plan

### Step 1: Bucket Tracking Infrastructure

- Add bucket registry arrays
- Update `getOrCreateCellCache` to register buckets
- Implement `getCacheBucketDistribution()`
- Update `getMetrics()` to populate bucket fields

### Step 2: New Workloads

- Add 3 cache overflow workloads
- Add 2 grapheme workloads (cached/uncached)
- Add width churn workload
- Update benchmark runner

### Step 3: Enhanced Measurement

- Implement `measureWorkload` with/without instrumentation
- Add heap measurement to runner
- Add try/finally to all workloads

### Step 4: Output Format

- Update `formatMetrics()` to show bucket distribution
- Add overhead ratio to output
- Add heap delta to output

### Step 5: Documentation

- Update metrics documentation
- Add workload descriptions
- Document how to interpret bucket distribution

## Success Criteria

Phase 3.2 is complete when:

- ✅ Bucket distribution populated and accurate
- ✅ Cache overflow workloads trigger clears
- ✅ Uncached grapheme shows segmentation cost
- ✅ Width churn triggers bucket map clear
- ✅ Overhead ratio < 10% for typical workloads
- ✅ Heap delta measured (when --expose-gc available)
- ✅ All workloads have error handling
- ✅ Can answer "should we tune MAX_CACHED_CELLS_PER_STYLE?"

## Non-Goals

Phase 3.2 is still **observation only**:

- ❌ No cache parameter changes
- ❌ No optimization implementation
- ❌ No behavior changes
- ❌ Only adds measurement capability

Phase 4 will use Phase 3.2 data to make optimization decisions.
