# Phase 2 Baseline Results Summary

> **Note**: This is a sample baseline snapshot from one machine configuration.
> Results will vary across different hardware, Node versions, and V8 engines.
> Use this as a reference for the expected output format and stability patterns,
> not as an absolute performance comparison target.

**Generated**: 2026-07-09  
**Mode**: Full baseline (warmup=100, samples=1000)  
**Machine**: Apple M1 Pro, macOS arm64  
**Runtime**: Node v24.16.0, V8 13.6.233.17  
**Unicode**: EAW 17.0.0, Runtime 15.1.0, ICU 75.1

## Stability Distribution

- **Stable (CV < 10%)**: 7 scenarios ✓
- **Noisy (CV 10-50%)**: 8 scenarios ~
- **Unstable (CV > 50%)**: 3 scenarios ⚠

## Stable Scenarios (Reliable for Unicode/Text Micro-benchmark Comparisons)

| Scenario                             | p50      | p95      | p99      | CV    |
| ------------------------------------ | -------- | -------- | -------- | ----- |
| charCellWidth_bmp_cjk                | 141.88   | 151.75   | 160.51   | 2.72% |
| charCellWidth_supplementary_cjk      | 292.53   | 307.14   | 323.81   | 2.09% |
| charCellWidth_non_cjk_supplementary  | 271.81   | 291.17   | 305.77   | 2.74% |
| charCellWidth_emoji_sequence         | 203.17   | 217.56   | 224.69   | 2.60% |
| textCellWidth_cjk_unique             | 22566.60 | 26320.90 | 32116.70 | 9.23% |
| sliceByCells_supplementary_cjk       | 1326.67  | 1469.58  | 1741.81  | 5.47% |
| terminal_write_supplementary_cjk_hot | 2801.25  | 3195.42  | 3638.75  | 6.90% |

## Noisy Scenarios (Use for Relative Comparisons)

| Scenario                                      | p50      | p95      | CV     |
| --------------------------------------------- | -------- | -------- | ------ |
| charCellWidth_ascii                           | 4.74     | 8.76     | 33.18% |
| textCellWidth_ascii_long_fast_path            | 267.08   | 314.17   | 12.94% |
| textCellWidth_cjk_long_hot                    | 134.58   | 207.08   | 28.76% |
| textCellWidth_complex_grapheme_hot            | 2272.92  | 4074.59  | 49.67% |
| harness_blackhole_overhead                    | 1.94     | 1.99     | 28.07% |
| wrapByCells_cjk_long_hot                      | 107.92   | 144.58   | 18.96% |
| wrapByCells_cjk_unique                        | 13641.60 | 15875.00 | 12.55% |
| terminal_write_supplementary_cjk_cycling_rows | 3679.20  | 4283.30  | 24.52% |

## Unstable Scenarios (Informational Only)

| Scenario                                 | p50     | p95     | CV      |
| ---------------------------------------- | ------- | ------- | ------- |
| textCellWidth_ascii_unique               | 725.00  | 937.50  | 53.33%  |
| textCellWidth_supplementary_cjk_long_hot | 2384.59 | 4283.33 | 72.76%  |
| textCellWidth_complex_grapheme_unique    | 6191.70 | 8129.20 | 177.27% |

## Key Observations

1. **Character width operations** are generally stable (CV < 3% for BMP CJK, supplementary CJK, emoji)
2. **ASCII operations** show higher variance due to extremely small ns/op (4-5ns) where timer noise dominates
3. **CJK unique text** (cache-miss path) is stable at ~23µs/op, suitable for optimization baseline
4. **Complex grapheme unique** shows high variance - needs investigation (GC? segmentation overhead?)
5. **Terminal write hot** is stable, but only tests buffer write (no commit/render)

## Limitations (Critical)

This baseline measures **Unicode width/text micro-operations only**. It does NOT:

- ❌ Prove Cell cache tuning is beneficial (no Cell allocation metrics)
- ❌ Prove virtual scroll optimization is needed (no rendering workload)
- ❌ Prove long text strategy is required (no cache size/GC metrics)
- ❌ Model real application workloads (DOM, events, composition)

**Phase 3 Requirements**: Before any optimization PR, must provide:

- Cell allocation/cache hit/miss counts
- GC pressure measurements
- Live Style distribution
- Profiler evidence showing actual bottleneck

## Full Data

Full JSON can be regenerated locally via: `pnpm run bench:perf-baseline:json` (output: `.tmp/perf-baseline.json`)

Schema version: 1  
Benchmark suite: unicode-width-text-v1  
Total scenarios: 18  
Blackhole sink: 757297308
