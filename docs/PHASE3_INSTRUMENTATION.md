# Phase 3: Performance Instrumentation

> **⚠️ SUPERSEDED BY PHASE 4.0 CHECKPOINT**
>
> This document describes the Phase 3 instrumentation foundation completed in PR #116 and #117.
>
> **Important updates from Phase 4.0**:
>
> - Disabled-path runtime overhead has not yet been validated against the pre-Phase-3 implementation
> - Previous overhead and heap conclusions from single-shot profiler must not be used
> - See `docs/PHASE4.0_CHECKPOINT.md` for current status and required follow-ups

## Overview

Phase 3 adds **observation-only instrumentation** to measure cache behavior, allocation patterns, and grapheme processing costs. This phase does NOT include any optimizations - it only collects metrics to identify actual bottlenecks.

> **Note**: This is an **internal development/profiling API** and is not exported in the npm package. It is intended for performance analysis during development and benchmarking.

## What Phase 3 Does

### ✅ Instrumentation Added

- **Cell Cache Metrics**: createCell calls, cache hit/miss rates, allocation counts, cache clears
- **Text Cache Metrics**: textCellWidth calls, text width cache hit/miss, wrap cache behavior
- **Grapheme Metrics**: segmentation calls, Intl.Segmenter vs fallback usage

### ✅ Low-Overhead When Disabled

- All instrumentation checks `isInstrumentationEnabled()` first
- When disabled: minimal overhead (function call + boolean check) when instrumentation disabled
- Enable only for profiling/benchmarking

### ✅ Profiler Benchmark

- 6 targeted workloads covering realistic scenarios
- Detailed metrics output for each workload
- Duration measurements

## What Phase 3 Does NOT Do

### ❌ No Optimizations

- Does NOT change `MAX_CACHED_CELLS_PER_STYLE`
- Does NOT implement partial eviction
- Does NOT add long text cache cap
- Does NOT implement provider-aware caching
- Does NOT add virtual scroll optimization

### ❌ No Behavior Changes

- All existing functionality unchanged
- Performance impact should be verified by baseline benchmarks (when instrumentation disabled)
- Only adds observation capability

## Usage

### Enable Instrumentation

```typescript
import {
enableInstrumentation,
resetMetrics,
getMetrics
} from "../src/core/perf/instrumentation.js";

// Enable instrumentation
enableInstrumentation();

// Reset counters
resetMetrics();

// Run your workload
terminal.write("test", { x: 0, y: 0 });

// Get metrics
const metrics = getMetrics();
console.log('Cell cache hit rate:',
(metrics.cell.cellCacheHitWidth1 /
(metrics.cell.cellCacheHitWidth1 + metrics.cell.cellCacheMissWidth1)) \* 100
);
```

### Run Profiler Benchmark

```bash
pnpm run bench:profiler
```

## Workloads

### 1. Repeated CJK Text

- **Scenario**: 1000 writes of same CJK line
- **Expected**: High Cell cache hit rate (>90%)
- **Purpose**: Validate cache effectiveness for repeated content

### 2. Unique CJK Logs

- **Scenario**: 1000 unique CJK log lines
- **Expected**: Low cache hit rate, many misses and evictions
- **Purpose**: Measure cache-miss path and eviction behavior

### 3. Complex Grapheme Text

- **Scenario**: 2000 textCellWidth calls with ZWJ emoji, combining marks
- **Expected**: High segmentedGraphemes call count
- **Purpose**: Measure grapheme segmentation cost

### 4. Long Text Wrapping

- **Scenario**: 500 wrapByCells calls on long CJK text at varying widths
- **Expected**: Wrap cache behavior, potential clears
- **Purpose**: Understand wrap cache effectiveness

### 5. Mixed Workload

- **Scenario**: 1000 log lines with repeated prefixes + unique content
- **Expected**: Mixed cache behavior (some hits, some misses)
- **Purpose**: Realistic log viewer scenario

### 6. Supplementary CJK

- **Scenario**: 500 writes of supplementary plane CJK
- **Expected**: width=2 cache behavior
- **Purpose**: Validate supplementary plane handling

## Metrics Collected

### Cell Cache Metrics

- `createCellCalls`: Total createCell() invocations
- `charCellWidthCallsFromCreateCell`: Width calculations in createCell
- `newCellCount`: New Cell object allocations
- `cellCacheHitWidth1`: Cache hits for width=1 chars
- `cellCacheHitWidth2`: Cache hits for width=2 chars
- `cellCacheMissWidth1`: Cache misses for width=1 chars
- `cellCacheMissWidth2`: Cache misses for width=2 chars
- `cellCacheClearWidth1`: Cache clears for width=1
- `cellCacheClearWidth2`: Cache clears for width=2
- `maxCacheSizeWidth1`: Peak cache size for width=1
- `maxCacheSizeWidth2`: Peak cache size for width=2

### Text Cache Metrics

- `textCellWidthCalls`: Total textCellWidth() calls
- `textWidthCacheHit`: Text width cache hits
- `textWidthCacheMiss`: Text width cache misses
- `textWidthCacheSet`: Cache insertions
- `textWidthCacheEvict`: LRU evictions
- `renderPassTextWidthCacheHit`: Render pass cache hits
- `renderPassTextWidthCacheMiss`: Render pass cache misses
- `wrapByCellsCalls`: Total wrapByCells() calls
- `wrapCacheHit`: Wrap cache hits
- `wrapCacheMiss`: Wrap cache misses
- `wrapCacheSet`: Wrap cache insertions
- `wrapCacheClear`: Wrap cache clears
- `maxTextLength`: Longest text processed
- `totalTextLength`: Cumulative text length
- `asciiCount`: ASCII text count
- `nonAsciiCount`: Non-ASCII text count

### Grapheme Metrics

- `graphemeSegmentationRequiredCalls`: segmentedGraphemes() calls
- `intlSegmenterUsed`: Intl.Segmenter path usage
- `fallbackSegmenterUsed`: Fallback segmenter usage
- `complexGraphemeCount`: Complex grapheme detections

## Next Steps (Phase 4+)

Only after analyzing instrumentation data:

1. **If Cell cache shows high miss rate or frequent clears**:
   - Consider adjusting `MAX_CACHED_CELLS_PER_STYLE`
   - Consider partial eviction strategy
   - Requires profiler evidence showing bottleneck

2. **If text cache shows retention issues**:
   - Consider long text admission policy
   - Consider cache size tuning
   - Requires profiler evidence showing bottleneck

3. **If grapheme segmentation shows high cost**:
   - Consider grapheme computation optimization
   - Consider segment caching
   - Requires profiler evidence showing bottleneck

4. **If virtual scroll needed**:
   - Must first add rendering workload measurements
   - Must show frame duration impact
   - Requires real browser profiling

## Important Notes

- **Data-Driven Only**: No optimization without profiler evidence
- **Observation Phase**: This PR only measures, does not optimize
- **Low-Overhead When Disabled**: Instrumentation disabled by default
- **Targeted Workloads**: Each workload tests specific behavior

## Files Modified

- `src/core/perf/instrumentation.ts`: New instrumentation module
- `src/core/buffer/buffer.ts`: Cell cache instrumentation
- `src/vue/utils/text.ts`: Text cache instrumentation
- `src/utils/grapheme.ts`: Grapheme instrumentation
- `scripts/bench-profiler.ts`: New profiler benchmark
- `package.json`: Added `bench:profiler` script

## Verification

```bash

# Type check

pnpm run typecheck

# Run profiler

pnpm run bench:profiler

# Verify low-overhead when disabled (same performance as Phase 2)

pnpm run bench:perf-baseline:smoke
```
