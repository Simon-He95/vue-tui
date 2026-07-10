# Phase 4.0: Cache Tuning Checkpoint

## Status

**Phase 4.0 checkpoint complete: no runtime cache change proposed.**

**Comprehensive cache validation is not complete.**

---

## Core Decision

The current synthetic measurements do not provide sufficient evidence to justify changing the per-style Cell cache capacity or eviction policy.

**Therefore**:

- Keep `MAX_CACHED_CELLS_PER_STYLE = 128` (unchanged)
- Keep the current clear-all eviction policy (unchanged)
- Do not introduce LRU/LFU at this time

**Important**: This is a status-quo decision based on insufficient evidence for change, not validation that the current cache is globally optimal.

---

## What Was Measured

**Data source**: 8 synthetic profiler workloads from Phase 3.2 instrumentation

**Workloads**:

1. Cell cache overflow (width=1) - stress test
2. Cell cache overflow (width=2) - stress test
3. Many styles - stress test
4. Complex grapheme cached - 4 unique strings, 500 repetitions
5. Complex grapheme uncached - 1000 unique strings
6. Wrap width churn - 51 widths (stress test)
7. Repeated CJK - stable content
8. Mixed workload - fresh Style object per line

**Metrics collected**:

- createCell calls and cache hit rates
- Bucket distribution (P50/P95/Max per width)
- Cache clear counts
- Text cache hit rates
- Registered bucket counts (instrumentation cumulative)

---

## Evaluation Results

### Per-Style Cell Capacity (MAX_CACHED_CELLS_PER_STYLE)

**Decision**: No change justified by current synthetic evidence.

**Observations**:

- Repeated CJK: 99.98% hit rate, 0 clears, bucket size=10
- Mixed workload: 37.49% hit rate, 0 clears, bucket P95=10/6

**Limitations**:

- Mixed workload creates fresh Style object per line → 1000 small buckets
- Does not validate MAX=128 for reused/default styles
- No workload tests stable style with >128 unique characters
- No second-pass evaluation after clear

**Conclusion**: The repeated-CJK and mixed workloads did not overflow their per-style buckets. The two dedicated overflow stress workloads did trigger one clear each, as intended. None of these workloads validates behavior under eviction-sensitive reuse.

---

### Clear-All vs Partial Eviction

**Decision**: Inconclusive; no eviction-sensitive reuse workload.

**Observations**:

- Overflow workloads trigger clear counter
- Single-pass unique scans (no post-clear reuse)

**Limitations**:

- Cannot evaluate clear-all vs LRU/LFU effectiveness
- No workload with hot-set reuse near capacity threshold

**Conclusion**: No evidence that partial eviction would provide benefit, but also no data showing clear-all is acceptable under working-set pressure.

---

### Text Cache Capacity

**Decision**: Inconclusive; capacity threshold not exercised.

**Observations**:

- Cached: 99.80% hit rate (4 unique keys, 500 repetitions)
- Uncached: 1000 unique strings

**Limitations**:

- 1000 < MAX_TEXT_WIDTH_CACHE=1024 (no eviction)
- Capacity limit not reached
- Long text admission not tested

**Conclusion**: Cannot validate current capacity or eviction behavior.

---

### Wrap Cache

**Decision**: Per-width capacity not measured; outer bucket instrumentation validated.

**Observations**:

- Width bucket clear triggered at 51 widths (exceeds MAX=32)

**Limitations**:

- Only exercises outer width-bucket limit
- Does not test MAX_WRAP_CACHE_PER_WIDTH=256
- Each width has only one text entry
- No unique vs repeated long wrapped text

**Conclusion**: Instrumentation functions correctly; production relevance unknown.

---

### Grapheme Optimization

**Decision**: Inconclusive; current timing is advisory and unstable.

**Observations**:

- Uncached workload: ~8.5-8.9ms for 1000 unique strings (single-run, end-to-end)
- Cached workload: 99.80% hit rate

**Limitations**:

- Timing includes string construction, cache operations, not isolated segmentation
- Single-run, no warmup or p50/p95 sampling
- Phase 2 reports CV=177.27% for unique complex grapheme (unstable)
- Environment-specific (Node v24.18.0 / V8 13.6 / arm64)

**Conclusion**: No stable evidence that segmentation is or is not a bottleneck. No optimization implemented.

---

### Long Text Admission

**Decision**: Not measured.

**Status**: No workload provided.

---

### inlineLineCacheByWidth

**Decision**: Not measured.

**Status**: Not instrumented in Phase 3.2.

---

### Style Cardinality / Live Buckets

**Decision**: Not measured by current strong-reference registry.

**Observations**:

- Mixed workload: 2000 registered buckets (cumulative instrumentation)

**Limitations**:

- Registered buckets are strongly retained by instrumentation
- Not equivalent to live Style count in production
- Cannot infer production style-cardinality or retained memory

**Conclusion**: Registry count is useful for workload characterization but does not measure production behavior.

---

## Measurement Limitations

### Heap Measurements

**Issue**: `heapBefore` captured before `resetMetrics()`, which releases previous workload's bucket registry. Heap deltas include memory from prior workload cleanup.

**Impact**: All heap delta values are advisory only and cannot be used to infer production retained memory.

**Status**: Heap-based conclusions removed from this report.

---

### Instrumentation Disabled-Path Overhead

**Issue**: The "without instrumentation" arm disables metric collection, but still executes the instrumentation hook functions added in Phase 3.

**Impact**: This benchmark does not measure the production cost of adding the instrumentation foundation itself (pre-Phase-3 vs post-Phase-3).

**Additional**: The fixed disabled-first/enabled-second order makes the single-run timing unsuitable for overhead estimates. Negative overhead values are measurement noise.

---

### Workload Coverage

**Gaps**:

- No reused/default style with high character diversity
- No post-clear second-pass evaluation
- No capacity-threshold testing (text/wrap)
- No long text pollution testing
- No production traces or long-running sessions

**Synthetic only**: All workloads are profiler scenarios, not production patterns.

---

## What This Report Does NOT Claim

**NOT supported by current data**:

- ❌ "Current cache implementation is validated"
- ❌ "Current cache performs well" (globally)
- ❌ "90%+ safety margin" for reused styles
- ❌ "Segmentation is cheap / not a hotspot"
- ❌ "Text cache sizing is adequate"
- ❌ "Wrap cache strategy is validated"
- ❌ "All optimization gates have failed"
- ❌ "Cache performance work is complete"

---

## Required Follow-up: Disabled-Path Instrumentation Overhead

**This is mandatory** because Phase 3 instrumentation hooks are already present in production hot paths (`createCell`, `textCellWidth`, `wrapByCells`).

### Problem

The current "without instrumentation" arm disables metric collection, but still executes all instrumentation hook functions. Therefore, it does not measure the production cost of adding the instrumentation foundation itself (pre-Phase-3 vs post-Phase-3).

### Required Validation

Compare:

- Commit immediately before Phase 3 instrumentation
- Current main with instrumentation disabled

**Requirements**:

- Isolated processes or separate worktrees
- Identical Node/V8/hardware
- Alternating or randomized execution order
- Warmup + multiple samples
- p50/p95 comparison
- Use Phase 2 baseline harness

**Workloads**:

- createCell hit/miss scenarios
- Repeated CJK terminal.write
- textCellWidth ASCII/non-ASCII
- wrapByCells workloads

**This validation is required independently of cache tuning decisions.**

---

## Optional Follow-up: Targeted Cache Workload Coverage

Phase 4.1 is optional only if cache optimization is explicitly deferred.

It is required before:

- Claiming the current cache strategy is validated
- Changing cache capacity or eviction
- Closing cache-performance evaluation as complete

### Phase 4.1: Targeted Workload Coverage (If Pursued)

Before claiming comprehensive cache validation, add:

1. **Stable/reused style workload**: DEFAULT_STYLE or frozen style objects, working set near or exceeding 128 unique characters, multiple passes

2. **Eviction-sensitive workload**: Insert 128 hot + periodic cold characters, observe clear frequency and hit-rate impact

3. **Text cache capacity**: >1024 unique text entries, observe eviction and post-eviction hit rates

4. **Wrap per-width capacity**: >256 unique wrapped strings per width

5. **Long text scenarios**: Unique vs repeated long non-ASCII text through textCellWidth, wrapByCells, formatInlineCellLine

6. **Realistic workload replay**: Offline replay of sanitized terminal/session traces

   **Important**: Do not enable the current strong-reference bucket registry for an unbounded production session. The instrumentation retains all registered buckets until `resetMetrics()`, which will alter GC and retained-memory behavior.

   **Recommended approaches**:
   - Bounded capture windows
   - `resetMetrics()` for counter-only capture windows (not for bucket-distribution profiling, as existing buckets do not re-register)
   - Maximum registered-bucket sampling
   - Offline trace replay (preferred)
   - For bucket-distribution profiling: isolated processes, fresh Style objects per capture, or redesigned bounded/weak registry

---

## Conclusion

**Phase 4.0 serves as a checkpoint, not comprehensive validation.**

**Engineering decision**: Keep current implementation unchanged because current measurements do not provide sufficient evidence to justify modification.

**Not claimed**: Current cache is proven optimal or adequate for all scenarios.

**Next step**: Either proceed with other work, or optionally add Phase 4.1 targeted workloads before closing cache evaluation.

---

## Appendix: Data Source

**Profiler run**:

- Command: `pnpm run bench:profiler:complete:gc`
- Node: v24.18.0
- V8: 13.6.233.17-node.50
- Platform: darwin (macOS)
- Arch: arm64
- CPU: Apple M1 Pro
- GC: enabled
- Date: 2026-07-10
- Code commit: c4182b6c2f449423739851c335feb5932f9d5b40

**Note**: Profiler data collected at c4182b6c. Subsequent commits are documentation updates only.

**Output**: `docs/perf/phase4-profiler-output-c4182b6c-annotated.txt` (annotated with environment metadata)
