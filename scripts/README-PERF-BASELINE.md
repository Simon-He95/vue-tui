# Performance Baseline Harness

This directory contains the performance baseline harness for vue-tui, implementing Phase 2 of the performance optimization RFC.

## Overview

The baseline harness (`bench-perf-baseline.ts`) provides reproducible performance measurements with statistical analysis. It outputs JSON with complete environment information and statistical metrics (p50/p95/p99, mean, stdev, CV) in **ns/op** (nanoseconds per operation).

## Usage

```bash
# Run and display results
pnpm run bench:perf-baseline

# Save results to JSON file
pnpm run bench:perf-baseline:json
# Output: .tmp/perf-baseline.json
```

## Benchmark Scenarios (17 Total)

### Character Width Calculation (5 scenarios)
1. **charCellWidth_ascii** - ASCII characters (a, Z, 0)
2. **charCellWidth_bmp_cjk** - BMP CJK characters (中, 文, 字)
3. **charCellWidth_supplementary_cjk** - Supplementary plane CJK (𠮷, Extension E/G)
4. **charCellWidth_non_cjk_supplementary** - Non-CJK supplementary (musical symbols, math)
5. **charCellWidth_emoji_sequence** - Emoji and ZWJ sequences

### Text Width Operations (7 scenarios)
6. **textCellWidth_ascii_long_hot** - ASCII text (100 chars, hot cache)
7. **textCellWidth_ascii_long_cold** - ASCII text (100 chars, cold cache)
8. **textCellWidth_cjk_long_hot** - BMP CJK text (100 chars, hot cache)
9. **textCellWidth_cjk_long_cold** - BMP CJK text (100 chars, cold cache)
10. **textCellWidth_unique_text** - Unique text each iteration (simulates log lines)
11. **textCellWidth_supplementary_cjk_long_hot** - Supplementary CJK (50 chars, hot cache)
12. **textCellWidth_supplementary_cjk_long_cold** - Supplementary CJK (50 chars, cold cache)

### Text Operations (2 scenarios)
13. **sliceByCells_supplementary_cjk** - Slicing with supplementary CJK
14. **wrapByCells_cjk_long_hot** - Wrapping CJK text (hot cache)
15. **wrapByCells_cjk_long_cold** - Wrapping CJK text (cold cache)

### Terminal Integration (2 scenarios)
16. **terminal_write_supplementary_cjk_hot** - Write to same position (hot Cell cache)
17. **terminal_write_supplementary_cjk_unique_rows** - Write to different rows

## Key Design Decisions

### Hot vs Cold Cache
Many operations use caches:
- `textCellWidth` → `textWidthCache`
- `wrapByCells` → `wrapCacheByWidth`
- `terminal.write` → Cell cache

We measure both:
- **Hot cache**: Repeated operations, measures cache hit performance
- **Cold cache**: `clearTextCaches()` before each sample, measures actual computation

This distinction is critical - without it, benchmarks measure `Map.get()` speed, not width calculation speed.

### Iterations Per Sample
Instead of measuring single operations (prone to timer noise), we use inner loops:
- Character width: 1000 iterations/sample × 2-3 operations
- Text operations: 100 iterations/sample × 1 operation
- Terminal operations: 10-100 iterations/sample

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
  "unicodeVersion": "17.0.0",
  "node": "v24.16.0",
  "v8": "13.6.233.17",
  "os": "darwin-arm64",
  "cpu": "Apple M1 Pro",
  "arch": "arm64",
  "warmup": 100,
  "samples": 1000,
  "clock": "process.hrtime.bigint",
  "timestamp": "2026-07-09T10:27:22.455Z",
  "results": {
    "charCellWidth_ascii": {
      "p50": 0.12,
      "p95": 0.15,
      "p99": 0.18,
      "mean": 0.13,
      "stdev": 0.02,
      "cv": 0.15,
      "samples": 1000,
      "min": 0.10,
      "max": 0.25,
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
- **min/max**: Minimum/maximum observed times
- **unit**: Always "ns/op" (nanoseconds per operation)
- **iterationsPerSample**: Inner loop size
- **operationsPerIteration**: Operations per inner loop iteration

## Stability Guidelines

Per RFC Phase 2 acceptance criteria:
- **CV < 0.1** (10%): Excellent - stable baseline
- **CV < 0.5** (50%): Acceptable - usable for comparisons
- **CV > 1.0** (100%): High variance - investigate or increase iterations

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

# 4. Compare (manual or with a comparison script)
# Look for: p95 improvement, CV stability, no regressions in unrelated scenarios
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
