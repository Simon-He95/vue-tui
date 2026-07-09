# Performance Baseline Harness

This directory contains the performance baseline harness for vue-tui, implementing Phase 2 of the performance optimization RFC.

## Overview

The baseline harness (`bench-perf-baseline.ts`) provides reproducible performance measurements with statistical analysis. It outputs JSON with complete environment information and statistical metrics (p50/p95/p99, mean, stdev, CV).

## Usage

```bash
# Run and display results
pnpm run bench:perf-baseline

# Save results to JSON file
pnpm run bench:perf-baseline:json
# Output: .tmp/perf-baseline.json
```

## Benchmark Scenarios

The harness covers 11 key scenarios:

### Character Width Calculation
1. **charCellWidth_ascii** - ASCII characters (a, Z, 0)
2. **charCellWidth_bmp_cjk** - BMP CJK characters (中, 文, 字)
3. **charCellWidth_supplementary_cjk** - Supplementary plane CJK (𠮷, Extension E/G)
4. **charCellWidth_non_cjk_supplementary** - Non-CJK supplementary (musical symbols, math)
5. **charCellWidth_emoji_sequence** - Emoji and ZWJ sequences

### Text Operations
6. **textCellWidth_ascii_long** - ASCII text (100 chars)
7. **textCellWidth_cjk_long** - BMP CJK text (100 chars)
8. **textCellWidth_supplementary_cjk_long** - Supplementary CJK text (50 chars)
9. **sliceByCells_supplementary_cjk** - Slicing with supplementary CJK
10. **wrapByCells_cjk_long** - Wrapping CJK text
11. **terminal_write_supplementary_cjk** - Terminal write with supplementary CJK

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
      "p50": 209,
      "p95": 375,
      "p99": 583,
      "mean": 243.294,
      "stdev": 229.78,
      "cv": 0.9444,
      "samples": 1000,
      "min": 41,
      "max": 4000
    }
  }
}
```

## Metrics Explained

- **p50/p95/p99**: 50th/95th/99th percentile (nanoseconds)
- **mean**: Average time (nanoseconds)
- **stdev**: Standard deviation
- **cv**: Coefficient of variation (stdev/mean) - lower is more stable
- **min/max**: Minimum/maximum observed times

## Stability

A stable benchmark should have:
- **CV < 0.1** (10%) - very stable
- **CV < 0.5** (50%) - acceptable
- **CV > 1.0** - high variance, may need more samples or warmup

## Next Steps

This baseline harness establishes the foundation for:
1. **Before/after comparisons** - Measure impact of optimizations
2. **Profiler guidance** - Identify actual bottlenecks
3. **Data-driven decisions** - Only optimize proven bottlenecks

Per the RFC, optimization work (cache tuning, long text strategy, etc.) should only proceed after profiler data confirms bottlenecks.

## References

- RFC: `docs/PERFORMANCE_OPTIMIZATION_RFC.zh-CN.md`
- Phase 1 (Unicode correctness): PR #114 (merged)
- Phase 2 (this baseline): Current PR
