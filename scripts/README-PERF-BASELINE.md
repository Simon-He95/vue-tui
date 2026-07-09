# Performance Baseline Harness

This directory contains the performance baseline harness for vue-tui, implementing Phase 2 of the performance optimization RFC.

## Overview

The baseline harness (`bench-perf-baseline.ts`) provides reproducible performance measurements with statistical analysis. It outputs JSON with complete environment information and statistical metrics (p50/p95/p99, mean, stdev, CV, stability) in **ns/op** (nanoseconds per operation).

## Usage

```bash
# Run and display results
pnpm run bench:perf-baseline

# Save results to JSON file
pnpm run bench:perf-baseline:json
# Output: .tmp/perf-baseline.json
```

## Benchmark Scenarios (15 Total)

### Character Width Calculation (5 scenarios)
1. **charCellWidth_ascii** - ASCII characters (a, Z, 0)
2. **charCellWidth_bmp_cjk** - BMP CJK characters (中, 文, 字)
3. **charCellWidth_supplementary_cjk** - Supplementary plane CJK (𠮷, Extension E/G)
4. **charCellWidth_non_cjk_supplementary** - Non-CJK supplementary (musical symbols, math)
5. **charCellWidth_emoji_sequence** - Emoji and ZWJ sequences

### Text Width Operations (5 scenarios)
6. **textCellWidth_ascii_long_fast_path** - ASCII text (100 chars, uses fast path, no cache)
7. **textCellWidth_ascii_unique** - Unique ASCII text (simulates unique log lines)
8. **textCellWidth_cjk_long_hot** - BMP CJK text (100 chars, hot cache)
9. **textCellWidth_cjk_unique** - Unique CJK text (simulates unique log lines)
10. **textCellWidth_supplementary_cjk_long_hot** - Supplementary CJK (50 chars, hot cache)

### Text Operations (3 scenarios)
11. **sliceByCells_supplementary_cjk** - Slicing with supplementary CJK
12. **wrapByCells_cjk_long_hot** - Wrapping CJK text (hot cache)
13. **wrapByCells_cjk_unique** - Wrapping unique CJK text (no cache)

### Terminal Integration (2 scenarios)
14. **terminal_write_supplementary_cjk_hot** - Write to same position (hot Cell cache)
15. **terminal_write_supplementary_cjk_unique_rows** - Write to different rows

## Key Design Decisions

### Blackhole Sink
All benchmark results are consumed by a blackhole sink to prevent V8 from optimizing away computations. Without this, micro-benchmarks could measure "nothing" instead of actual work.

### Hot Cache vs Unique Input
Two approaches to avoid cache pollution:
- **Hot cache**: Repeated input, measures cache hit performance
- **Unique input**: Pre-generated corpus (2048 entries), each iteration uses different input

**Why unique input instead of `clearTextCaches()`?**

Early versions used `beforeEach: clearTextCaches`, but this gave misleading results. With `iterationsPerSample: 100`, the first iteration was cold but the next 99 were hot (same input). The result was a "1 cold + 99 hot" mix, not true cold cache.

Unique corpus solves this: each iteration gets different text, so cache never hits.

### ASCII Fast Path
`textCellWidth` has a direct fast path for ASCII that doesn't use the text cache:
```typescript
if (hasAsciiFastPath(provider) && isAscii(text)) return text.length;
```

So `textCellWidth_ascii_long_fast_path` doesn't test cache behavior - it tests the fast path itself.

### Iterations Per Sample
Instead of measuring single operations (prone to timer noise), we use inner loops:
- Character width: 1000 iterations/sample × 2-3 operations
- Text operations: 10-100 iterations/sample × 1 operation

This reduces CV (coefficient of variation) to acceptable levels.

### ns/op (Nanoseconds per Operation)
Results are reported as **ns/op**, calculated as:
```
ns/op = total_time_ns / (iterations_per_sample × operations_per_iteration)
```

This makes before/after comparisons meaningful.

## Output Format

```json
{
  "commit": "...",
  "eawUnicodeVersion": "17.0.0",
  "runtimeUnicodeVersion": "15.1.0",
  "icu": "75.1",
  "node": "v24.16.0",
  "v8": "13.6.233.17",
  "os": "darwin-arm64",
  "cpu": "Apple M1 Pro",
  "arch": "arm64",
  "warmup": 100,
  "samples": 1000,
  "clock": "process.hrtime.bigint",
  "timestamp": "2026-07-09T10:27:22.455Z",
  "blackhole": 12345,
  "results": {
    "charCellWidth_ascii": {
      "p50": 4.12,
      "p95": 8.30,
      "p99": 12.45,
      "mean": 5.23,
      "stdev": 1.87,
      "cv": 0.36,
      "stability": "noisy",
      "samples": 1000,
      "min": 3.21,
      "max": 15.67,
      "unit": "ns/op",
      "iterationsPerSample": 1000,
      "operationsPerIteration": 3
    }
  }
}
```

## Metrics Explained

- **p50/p95/p99**: 50th/95th/99th percentile (ns/op)
- **mean**: Average time per operation
- **stdev**: Standard deviation
- **cv**: Coefficient of variation (stdev/mean) - **lower is more stable**
- **stability**: Automatic classification based on CV
  - `stable`: CV < 10% - Excellent, reliable baseline
  - `noisy`: CV 10-50% - Acceptable for comparisons
  - `unstable`: CV > 50% - High variance, use cautiously
- **min/max**: Minimum/maximum observed times
- **unit**: Always "ns/op" (nanoseconds per operation)
- **blackhole**: Sink value (prevents optimization elimination)
- **eawUnicodeVersion**: Unicode version for EAW generated tables (17.0.0)
- **runtimeUnicodeVersion**: Node/V8/ICU Unicode version (affects emoji regex)

## Stability Guidelines

Per RFC Phase 2 acceptance criteria:
- **CV < 0.1** (10%): Excellent - stable baseline, **preferred for optimization decisions**
- **CV < 0.5** (50%): Acceptable - usable for comparisons
- **CV > 0.5** (50%): High variance - informational only, do not base optimization decisions on these

Many micro-benchmarks naturally have higher CV due to timer noise, JIT, GC. Focus on:
1. Scenarios with `stability: "stable"` for critical decisions
2. Relative comparisons (before/after) rather than absolute numbers
3. p95/p99 (less affected by outliers) rather than mean

## Limitations

This harness covers **Unicode width/text operation micro-benchmarks**. It does NOT fully cover:
- Cache tuning workloads (need Cell allocation/GC instrumentation)
- Virtual scroll scenarios (need rendering workloads)
- Real application workloads (need integration benchmarks)

**Per RFC**: Phase 3 optimization PRs must provide **targeted baseline + profiler evidence** for their specific optimization area. This harness establishes general correctness/sanity baseline only.

## Before/After Comparison Workflow

```bash
# 1. Establish baseline
pnpm run bench:perf-baseline:json
cp .tmp/perf-baseline.json baseline-before.json

# 2. Apply optimization

# 3. Measure again
pnpm run bench:perf-baseline:json
cp .tmp/perf-baseline.json baseline-after.json

# 4. Manual comparison
# Focus on:
# - p95 improvement in optimized scenarios
# - stability unchanged or improved
# - no regressions in unrelated scenarios
```

## Next Steps

This baseline harness establishes the foundation for:
1. **Before/after comparisons** - Validate optimization impact
2. **Profiler guidance** - Identify actual bottlenecks (not guesses)
3. **Data-driven decisions** - Only optimize proven bottlenecks

Per the RFC, optimization work (cache tuning, long text strategy, etc.) should:
1. Run this baseline
2. Profile to confirm bottleneck
3. Implement optimization
4. Re-run baseline
5. Provide before/after data in PR

## References

- RFC: `docs/PERFORMANCE_OPTIMIZATION_RFC.zh-CN.md`
- Phase 1 (Unicode correctness): PR #114 (merged)
- Phase 2 (this baseline): PR #115
