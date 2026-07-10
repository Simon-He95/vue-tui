# Phase 4.0: Performance Optimization Decision Report

## Executive Summary

Based on Phase 3.2 instrumentation data from measured profiler workloads, this report evaluates cache optimization proposals for Phase 4.

**Key Finding**: Current cache implementation performs well under the measured workloads. **No cache tuning is justified by current data**.

**Recommendation**: **Do NOT implement cache optimizations at this time**. Keep current implementation and revisit only if production data shows cache pressure.

---

## Scope and Limitations

### What This Report Covers

- 8 profiler workloads from Phase 3.2
- Cell cache hit rates and bucket distribution
- Text cache (textWidthCache, wrapByCells) effectiveness
- Grapheme segmentation costs

### What This Report Does NOT Cover

- Production workload patterns
- Long-running terminal sessions
- Real-world user interaction traces
- `inlineLineCacheByWidth` (not instrumented in Phase 3.2)

### Limitations

- **Data source**: Synthetic profiler workloads, not production traces
- **Workload scope**: Limited to 8 scenarios
- **inlineLineCache**: Not evaluated - scope limited to textWidthCache and wrapByCells
- **Long text**: No unique-long-text pollution test included
- **Heap data**: With GC enabled but registered buckets != exact production memory

**Important**: Decisions should be revisited if production data shows different patterns.

---

## Data Collection Methodology

### Profiler Run Info

```
Command: pnpm run bench:profiler:complete:gc
Node: v24.18.0
GC: Enabled (--expose-gc)
Date: 2026-07-10
Commit: Phase 3.2 merged
Output: docs/perf/phase4-profiler-output.txt
```

### Workload Classification

**Realistic Workloads** (representative of typical usage):
1. Repeated CJK - typical terminal logs
2. Mixed workload - varied log lines
3. Complex grapheme cached - repeated complex strings
4. Complex grapheme uncached - unique complex strings

**Stress Test Workloads** (artificial worst-case):
1. Cell cache overflow w1 - 200 unique chars single style
2. Cell cache overflow w2 - 200 unique CJK single style
3. Many styles - 50 distinct styles simultaneously
4. Wrap width churn - 50 widths (exceeds bucket limit)

---

## Workload Analysis

### Workload 1: Cell Cache Overflow Width=1 (Stress Test)

**Results**:
```
createCell calls: 200
new cells: 200
hit rate: 0.00%
cache clears (w1/w2): 1/0
max observed cache size: 129
```

**Assessment**: ⚠️ Artificial stress test
- Successfully triggered overflow (exceeded MAX=128)
- Not representative of real terminal applications
- Used for instrumentation validation only

---

### Workload 2: Cell Cache Overflow Width=2 (Stress Test)

**Results**:
```
createCell calls: 200
cache clears (w1/w2): 0/1
max observed cache size: 129
```

**Assessment**: ⚠️ Artificial stress test
- Pattern identical to width=1 overflow
- Validates instrumentation, not realistic scenario

---

### Workload 3: Many Styles Many Chars (Stress Test)

**Results**:
```
createCell calls: 500
new cells: 500
cache clears: 0
registered bucket count: 50 (width=2)
bucket P50/P95/Max: 10/10/10
heap delta (GC enabled): ~0.6 MB
```

**Assessment**: ⚠️ Artificial scenario
- 50 unique styles is extreme for typical terminal apps
- All buckets uniform size (10 cells each)
- No cache clears despite 500 unique cells
- Memory cost acceptable but scenario unlikely in practice

---

### Workload 4: Complex Grapheme Cached (Realistic)

**Results**:
```
textCellWidth calls: 2000
text cache hit rate: 99.80%
```

**Assessment**: ✅ Good performance
- High cache hit rate after initial misses
- Textcache effectively avoids repeated segmentation

---

### Workload 5: Complex Grapheme Uncached (Realistic)

**Results**:
```
textCellWidth calls: 1000
text cache hit rate: 0.00%
segmentation required: 1000
Duration: ~1.5ms total = 0.0015ms per string
```

**Assessment**: ✅ Low cost
- Segmentation is fast even without cache
- Cost is negligible (0.0015ms per string)

---

### Workload 6: Wrap Width Churn (Stress Test)

**Results**:
```
wrap cache hit rate: 0.00%
wrap width bucket clears: 1
```

**Assessment**: ⚠️ Artificial scenario
- 50 widths exceeds typical window drag (5-10 widths)
- Validates bucket churn detection
- Not representative of real resize patterns

---

### Workload 7: Repeated CJK (Realistic)

**Results**:
```
createCell calls: 50,000
new cells: 10
hit rate: 99.98%
cache clears: 0
registered bucket count: 1
bucket size: 10
```

**Assessment**: ✅ Excellent performance
- Very high hit rate for typical repeated content
- Minimal unique cells needed
- No overflow pressure

---

### Workload 8: Mixed Workload (Realistic)

**Results**:
```
createCell calls: 27,390
new cells: 14,620
hit rate: 37.49%
cache clears: 0
registered bucket count: 2000 (1000 w1 + 1000 w2)
bucket P50: 9 (w1), 6 (w2)
bucket P95: 10 (w1), 6 (w2)
bucket P95: 10 (w1), 6 (w2)
```

**Assessment**: ✅ Acceptable performance
- Moderate hit rate (37.49%)
- Bucket sizes far below MAX=128 (P95: 10 vs 128)
- No cache clears despite varied content
- Note: Creates unique style per log line - more extreme than typical apps

---

## Key Findings

### Cache Hit Rates

| Workload | Type | Hit Rate | Assessment |
|----------|------|----------|------------|
| Repeated CJK | Realistic | 99.98% | Excellent |
| Mixed | Realistic | 37.49% | Acceptable |
| Overflow tests | Stress | 0% | Expected |

**Conclusion**: Cache performs well for measured realistic workloads

### Cache Overflow Behavior

| Workload | Clears | Realistic? |
|----------|--------|------------|
| W1 overflow | 1 | ❌ No |
| W2 overflow | 1 | ❌ No |
| Wrap churn | 1 | ❌ No |
| Repeated CJK | 0 | ✅ Yes |
| Mixed | 0 | ✅ Yes |

**Conclusion**: Measured realistic workloads do not trigger overflow

### Bucket Distribution

**Mixed workload** (most varied realistic scenario):
- Width=1: P95=10 (vs MAX=128) - 92% margin
- Width=2: P95=6 (vs MAX=128) - 95% margin

**Conclusion**: Current MAX_CACHED_CELLS_PER_STYLE=128 provides large safety margin

---

## Optimization Proposals Evaluation

### Proposal 1: Increase MAX_CACHED_CELLS_PER_STYLE from 128 to 512

**Decision**: ❌ **Not justified by current data**

**Rationale**:
- Bucket P95 sizes: 10 (w1), 6 (w2) - far below current limit
- No overflow in measured realistic workloads
- Would increase memory footprint for no demonstrated benefit

**Gate Evaluation**: ❌ FAILED
- ❌ No realistic workload shows cache clears
- ❌ No demonstrated performance impact from current limit
- ❌ Large safety margin already exists

---

### Proposal 2: Implement Partial Eviction (LRU/LFU)

**Decision**: ❌ **Not justified by current data**

**Rationale**:
- Current clear-all strategy never triggered in realistic workloads
- Would add implementation complexity
- No evidence of performance degradation from current approach

**Gate Evaluation**: ❌ FAILED
- ❌ No realistic workload hits cache limit
- ❌ No demonstrated benefit over clear-all

---

### Proposal 3: Grapheme Segment Caching

**Decision**: ❌ **Not justified by current data**

**Rationale**:
- Segmentation cost: 0.0015ms per unique string (negligible)
- Text cache already provides 99.80% hit rate for repeated strings
- Would add memory overhead (retain segment arrays)
- Segmentation is not a measured hotspot

**Gate Evaluation**: ❌ FAILED
- ❌ Segmentation cost is low (not a bottleneck)
- ❌ Text cache already mitigates repeated segmentation
- ❌ No production evidence of segmentation being expensive

---

### Proposal 4: Text Cache Size Tuning

**Decision**: ❌ **Not justified by current data**

**Rationale**:
- Text cache hit rate: 99.80% for complex graphemes in measured workloads
- No evidence of premature eviction or pollution

**Scope Note**: This evaluation covers `textWidthCache` and `wrapByCells` cache. `inlineLineCacheByWidth` was not instrumented in Phase 3.2 and is not evaluated here.

**Gate Evaluation**: ❌ FAILED
- ❌ Current hit rates are high
- ❌ No measured cache pressure

---

### Proposal 5: Long Text Admission Policy

**Decision**: ⏸️ **Insufficient data - not implemented**

**Rationale**:
- Current workloads do not include unique-long-text pollution test
- No evidence of long text causing cache issues
- But also no specific data proving long text is handled optimally

**Limitation**: Would need additional workload:
```typescript
// Unique long text pollution test
for (let i = 0; i < 2000; i++) {
  textCellWidth(`long-${i}-${"content".repeat(2000)}`);
}
```

**Decision**: Do not implement without additional evidence. Remains a future candidate if production traces show many unique long wrapped lines.

---

### Proposal 6: Wrap Cache Tuning

**Decision**: ❌ **Not justified by current data**

**Rationale**:
- Width bucket clear only in artificial 50-width stress test
- Real window resize: ~5-10 widths (well below MAX=32)
- No evidence of wrap cache being a bottleneck

**Gate Evaluation**: ❌ FAILED
- ❌ Bucket clear only in unrealistic scenario
- ❌ No performance impact from current limits

---

## Phase 4 Decision

### Summary

**No cache optimizations will be implemented in Phase 4.**

Based on the measured Phase 3.2 profiler workloads:
- Repeated and cached workloads show very high cache hit rates (99.98%, 99.80%)
- Mixed workloads do not approach MAX_CACHED_CELLS_PER_STYLE=128
- Bucket P95 sizes have 90%+ safety margin
- No realistic workload shows cache overflow pressure

### What This Means

**Keep current implementation**:
- MAX_CACHED_CELLS_PER_STYLE = 128 (unchanged)
- Clear-all eviction strategy (unchanged)
- Current text/wrap cache limits (unchanged)
- No grapheme segment caching (not added)
- No long text admission policy (not added)

**Revisit if**:
- Production traces show frequent cache clears
- Production traces show performance degradation
- Real-world profiling reveals cache pressure
- Additional targeted workloads show different patterns

---

## Instrumentation Overhead Note

Profiler output shows overhead percentages (often negative). These are **smoke signals only** and **not used** to justify optimization decisions. The profiler script itself notes:

> Overhead percentages are smoke signals only.  
> For rigorous performance measurement, use Phase 2 baseline harness.

Negative overhead typically indicates measurement noise, not actual performance benefit from instrumentation.

---

## Alternative Phase 4 Focus

Since cache optimization is not justified by current data, Phase 4 development effort could focus on:

### Option A: Feature Development
- Additional terminal components
- Enhanced capabilities
- Expanded examples and documentation

### Option B: Code Quality
- Refactoring for maintainability
- Test coverage improvements
- Type safety enhancements

### Option C: Bundle Size
- Tree-shaking optimization
- Optional feature bundling
- Runtime size reduction

### Option D: Developer Experience
- Improved error messages
- Enhanced debugging tools
- Better TypeScript types

---

## Conclusion

**Phase 4.0 Status**: ✅ Complete (Decision: No cache optimization needed)

**Value Delivered**: Phase 3 instrumentation enabled a **data-driven decision** to **not optimize prematurely**.

**Result**: Avoided adding complexity without demonstrated benefit. Current cache implementation performs well for measured workloads.

**Next Steps**: Monitor production usage. Revisit optimization decisions if real-world data shows different patterns.

---

## Appendix: Raw Data Reference

**Complete profiler output**: `docs/perf/phase4-profiler-output.txt`

**Run metadata**:
```
Command: pnpm run bench:profiler:complete:gc
Node: v24.18.0
GC: Enabled (--expose-gc)
Generated: 2026-07-10
Commit: Phase 3.2 merged (main branch)
Platform: darwin (macOS)
```

**All 8 workloads completed successfully with GC-enabled heap measurements.**
