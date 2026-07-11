# Phase 3.3: Instrumentation Overhead Validation - Results

**Status**: ✅ Closed by production-strip and production-workload validation
**Date**: 2026-07-11
**Issue**: #119 (closed); remediation #122; final workload #123

---

## Executive Summary

### Formal Pre-Registered Result: INCONCLUSIVE

- **p95 gate**: 8 of 9 gating scenarios INCONCLUSIVE (wide CIs), 1 PASS, 0 FAIL
- **Bundle**: INCONCLUSIVE / informational (transitive closure not measured)

### Secondary Exploratory Findings (Post-Hoc)

**Two repeatable paired-p50 signals in Node/tsx source-path harness**:

1. **ASCII fast path**: `textCellWidth_ascii_long_fast_path`
   - Median ratio: 1.1451 (+14.51%)
   - Absolute: ~38 ns/op delta observed in repeated-input benchmark
   - CI: [1.1417, 1.1503] (very narrow)
   - **Note**: Other ASCII scenario shows p50 ~0.994, suggesting workload/JIT-shape dependence

2. **Wrap hot path**: `wrapByCells_cjk_long_hot`
   - Median ratio: 1.0376 (+3.76%)
   - CI: [1.0345, 1.0412] (narrow)

**These were NOT part of pre-registered gate. They are exploratory findings warranting remediation and confirmatory testing.**

### Critical Limitation

**This measured tsx executing \`src/\*\` modules**, NOT published \`dist\` artifacts or real workloads. Production impact remains unvalidated.

---

## Formal p95 Gate Results (Pre-Registered)

### Configuration

- **What was measured**: Node v24.18.0 + tsx executing source modules
- **NOT measured**: Published dist ESM/CJS, bundled apps, real workloads
- **Pairs**: 10 (AB/BA alternating)
- **Bootstrap**: 10,000 iterations, seed: 0x33120202
- **Date**: 2026-07-10

### Summary

- **PASS**: 1 (11%)
- **INCONCLUSIVE**: 8 (89%)
- **FAIL**: 0 (0%)

**Formal interpretation**: No scenario met pre-registered FAIL criterion. Eight could not be proven <= 5% due to short measurement windows (ns-scale operations, μs-scale windows, p95 dominated by system noise).

---

## Secondary Exploratory Findings: p50 Analysis

**Status**: Post-hoc / not part of pre-registered gate

### Combined Interpretation

**Pattern**: Disabled instrumentation dispatch shows measurable cost in short hot-path source-path benchmarks.

**Evidence**:

- ASCII fast path: +14.5% / ~38 ns/op (repeated input)
- Wrap hot path: +3.8% (repeated input)
- ASCII unique: p50 ~0.994 (no regression)
- Control scenarios: p50 near 1.0

**Conclusion**: Cost appears workload/JIT-shape dependent, not universal per-call fixed overhead.

### Primary Hypotheses (Not Proven)

**ASCII fast path**: Additional branch check
**Wrap path**: Unconditional dispatch to internal check

Formal attribution requires targeted ablation tests (A vs B vs C with built artifacts).

---

## Bundle Size: INCONCLUSIVE / Informational

**Observed**: Aggregate dist +9,278 bytes gzip (+0.55%)

**Important notes**:

1. This is the sum of individually compressed emitted ESM/CJS artifacts, NOT a consumer payload
2. Per-file comparisons include content-hash renames (e.g., `width-GqllnV8C.js` → `width-DnZjDPPc.js`) treated as remove/add pairs

**Representative entry deltas**:

- core.cjs: +774 bytes gzip
- index.cjs: +1,352 bytes gzip
- vue.cjs: +1,327 bytes gzip

**Interpretation**: Instrumentation has confirmed non-zero artifact cost (~0.7-1.4 KB per relevant entry), but consumer bundle impact requires transitive analysis.

**Required**: Consumer bundle per export (tree-shake + minify), bundler metafile for logical chunk matching, npm pack tarball.

---

## Overall Status Per #119

**Historical conclusion (2026-07-10)**: The initial source-path run was inconclusive. **Final closure**: #122 compiled instrumentation out of production artifacts, built-dist and packed-consumer A/B/C passed, #119 closed, and #123 completed the production Agent Console workload profile.

---

## Recommended Next Steps

### Priority 1: Remediate and Confirm

**Do NOT merely increase sample count**. Fix: remediate overhead + increase per-sample timed work to ms-scale.

**Required A/B/C test**:

- A = pre-Phase-3
- B = current
- C = remediation candidate(s)

Measure built dist, not tsx source.

### Priority 2: Fix Bundle Measurement

Consumer bundles, transitive closure, npm pack tarball.

### Priority 3: Integration Benchmarks

p95 for complete workloads, not ns-scale operations.

### Priority 4: Real Workload First

Profile real usage before cache tuning.

---

## What This Achieved

| Dimension              | Status          |
| ---------------------- | --------------- |
| Unicode correctness    | **明确提升** ✅ |
| Measurement capability | **明显提升** ✅ |
| Avoided bad decisions  | **正确** ✅     |
| Source-path overhead   | **发现信号** ⚠️ |
| **Production impact**  | **未验证** ❌   |

---

**This audit record documents scope, findings, and next requirements.**

---

## Final closure

The exploratory source-path regression was remediated by #122's production strip. #123 provides the real production workload closure and generated audit summary. Phase 3 instrumentation remains available for source profiling but imposes no standard package cost. The current performance initiative is complete.
