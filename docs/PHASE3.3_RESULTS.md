# Phase 3.3: Instrumentation Overhead Validation - Results

**Status**: ⚠️ Acceptance Criteria Not Met  
**Date**: 2026-07-10  
**Issue**: #119 (remains open)

---

## Executive Summary

### Formal Pre-Registered Result: INCONCLUSIVE

- **p95 gate**: 8 of 9 gating scenarios INCONCLUSIVE (wide CIs), 1 PASS, 0 FAIL
- **Bundle**: INCONCLUSIVE / informational (see limitations below)

### Secondary Exploratory Finding: Node/tsx Source-Path p50 Regression

**Consistent signal detected** in ASCII fast path:

- All 10 paired p50 ratios: 1.133 – 1.157
- Median ratio: 1.1451 (+14.51%)
- Absolute cost: ~38 ns/call overhead
- Bootstrap CI: [1.1417, 1.1503] (very narrow)

**Note**: This was NOT part of the pre-registered decision gate. It is a post-hoc exploratory finding that warrants remediation and confirmatory testing.

### Measurement Scope Limitations

**Critical**: This benchmark measured **Node + tsx executing `src/*` modules**, not the published `dist` ESM/CJS artifacts. Impact on production builds and real application workloads remains unvalidated.

---

## Formal p95 Gate Results (Pre-Registered)

### Configuration

- **What was measured**: Node v24.18.0 + tsx executing source modules
- **NOT measured**: Published dist ESM/CJS, bundled consumer apps, real workloads
- **Commit A** (Pre-Phase-3): `697472b0`
- **Commit B** (Post-Phase-3): `4d543ff7`
- **Pairs**: 10 (AB/BA alternating)
- **Warmup**: 50, **Samples**: 500 per pair
- **Bootstrap**: 10,000 iterations, seed: 0x33120202
- **Environment**: M1 Pro, macOS arm64
- **Date**: 2026-07-10

### Gating Scenarios Results

| Scenario                                      | p95 Ratio | 95% CI             | Status          |
| --------------------------------------------- | --------- | ------------------ | --------------- |
| textCellWidth_ascii_long_fast_path            | 1.033     | [0.970, 1.388]     | ⚠️ INCONCLUSIVE |
| textCellWidth_cjk_long_hot                    | 0.972     | [0.844, 1.493]     | ⚠️ INCONCLUSIVE |
| textCellWidth_cjk_unique                      | 0.964     | [0.862, 1.341]     | ⚠️ INCONCLUSIVE |
| textCellWidth_complex_grapheme_hot            | 1.013     | [0.972, 1.077]     | ⚠️ INCONCLUSIVE |
| textCellWidth_complex_grapheme_unique         | 1.052     | [0.547, 1.114]     | ⚠️ INCONCLUSIVE |
| **wrapByCells_cjk_long_hot**                  | **1.017** | **[0.820, 1.023]** | **✅ PASS**     |
| wrapByCells_cjk_unique                        | 0.915     | [0.747, 1.062]     | ⚠️ INCONCLUSIVE |
| terminal_write_supplementary_cjk_hot          | 1.082     | [0.989, 1.298]     | ⚠️ INCONCLUSIVE |
| terminal_write_supplementary_cjk_cycling_rows | 1.065     | [0.828, 1.208]     | ⚠️ INCONCLUSIVE |

### Summary

- **PASS**: 1 (11%)
- **INCONCLUSIVE**: 8 (89%)
- **FAIL**: 0 (0%)

**Formal interpretation**: No scenario met the pre-registered p95 FAIL criterion (CI lower > 1.05). Eight scenarios could not be proven <= 5% due to wide confidence intervals.

---

## Secondary Exploratory Finding: p50 Analysis

**Status**: Post-hoc / exploratory (not part of pre-registered gate)

### ASCII Fast Path Consistent Signal

**Scenario**: `textCellWidth_ascii_long_fast_path` (100-char ASCII)

**p50 results**:

- All 10 paired ratios: 1.133 – 1.157
- Median ratio: **1.1451** (+14.51% relative)
- Bootstrap 95% CI: **[1.1417, 1.1503]** (narrow, stable)

**Absolute cost** (first pair example):

- Commit A: 264.17 ns/op
- Commit B: 302.08 ns/op
- **Delta: +37.91 ns/call**

**Extrapolated impact** (hypothetical):

- 10,000 calls/frame → ~0.38 ms overhead
- 100,000 calls/frame → ~3.79 ms overhead

**Important caveats**:

1. This is a **Node/tsx source-path** measurement, not published dist
2. Real application call volume per frame is unknown
3. User-perceptible impact has not been validated
4. Other ASCII scenarios (e.g., `textCellWidth_ascii_unique`) show p50 ratio ~0.994

**Interpretation**: Evidence suggests a fixed overhead of ~38 ns that manifests as ~14.5% relative regression in a short, repetitive ASCII microbenchmark. Impact on real workloads remains unmeasured.

### Primary Hypothesis (Not Proven Root Cause)

**Likely direct cause**: Additional branch check in disabled state

```typescript
// Pre-Phase-3
if (hasAsciiFastPath(provider) && isAscii(text)) return text.length;

// Post-Phase-3 (disabled instrumentation)
if (hasAsciiFastPath(provider) && isAscii(text)) {
  if (isInstrumentationEnabled()) {
    // ← Always false, but evaluated
    textInstr.recordTextCellWidthCall(text.length, true);
  }
  return text.length;
}
```

**Note**: This is the most plausible hypothesis based on code diff, but formal attribution requires targeted ablation (A vs B vs C remediated variant).

### Why p50 Shows Signal While p95 Does Not

**p50 is stable** because:

- Median filters scheduler/GC/JIT outliers
- Central tendency less affected by noise
- Fixed overhead manifests consistently

**p95 is unstable** because:

- Measurement window too short (~30 μs for ASCII 100-char microbenchmark)
- Tail dominated by system noise, not instrumentation cost
- Extreme swings observed (terminal_write: 0.74–2.55 across pairs)

**Conclusion**: p95 gate is appropriate for integration workloads (ms-scale), not sub-microsecond microbenchmarks.

---

## Bundle Size Results

### Measurement Limitations

**What was compared**:

- All emitted `dist/**/*.{js,cjs}` files (59 total)
- Per-file gzip size (using hash-based filename matching)
- Aggregate dist gzip sum

**What was NOT measured**:

- Transitive closure per public export (shared chunks not attributed)
- Consumer bundle size (import + tree-shake + minify)
- Package installation footprint (npm pack tarball)

### Observed Data

**Direct entry files** (package.json export targets):

- vue.cjs: +1.30 KB gzip (+0.79%)
- index.cjs: +1.32 KB gzip (+1.03%)
- cli.cjs: +790 B gzip (+0.73%)
- core.cjs: +774 B gzip (+3.51%)

**Aggregate dist gzip**:

- Commit A total: 1648.18 KB
- Commit B total: 1657.24 KB
- **Delta: +9,278 bytes gzip (+0.55%)**

**Known issues**:

- Hash-based filename matching produced incorrect pairs (e.g., width-\*.js)
- Cannot distinguish rename-only from real growth without content hash or bundler metafile
- Some chunks show real size changes (width: 3.37 KB → 4.39 KB gzip)

### Assessment: INCONCLUSIVE / Informational

**Rationale**:

- Direct entry-file deltas are small, but they exclude transitive shared chunks
- Aggregate dist gzip sums ESM + CJS + multiple entry graphs (not equivalent to consumer bundle)
- Logical chunk pairing not implemented

**Proper measurement would require**:

- Consumer bundle per public export (import + tree-shake + minify)
- Bundler metafile for transitive closure
- npm pack tarball size for installation footprint

---

## Overall Status Per #119

### Requirements vs Results

| Requirement                   | Result                                | Status     |
| ----------------------------- | ------------------------------------- | ---------- |
| Bundle size acceptable        | INCONCLUSIVE (measurement incomplete) | ⚠️ Not met |
| Runtime overhead proven <= 5% | p95: INCONCLUSIVE (8/9 scenarios)     | ⚠️ Not met |

### Conclusion

**Initial Phase 3.3 validation run complete.**  
**Acceptance criteria not met.**  
**Issue #119 remains open.**

---

## Why p95 Gate Was INCONCLUSIVE

**Problem**: Microbenchmark measurement windows too short for p95 stability

**Evidence**:

- ASCII 100-char: ~300 ns/op × 100 iterations = ~30 μs total window
- p95 dominated by scheduler/GC/JIT noise, not instrumentation
- Extreme swings: terminal_write pairs ranged from 0.74 to 2.55

**Conclusion**: p95 appropriate for integration workloads (ms-scale), not for sub-microsecond operations.

---

## Recommended Next Steps

### Priority 1: Remediate and Confirm with Ablation

**Do NOT immediately increase sample size**. Problem is overhead existence, not measurement precision.

#### Remediation Options

**Option A: Optional Hook Binding** (Recommended)

```typescript
// perf-hooks.ts - minimal dispatcher only
export let perfHooks: PerfHooks | undefined;

export function installPerfHooks(next: PerfHooks | undefined): void {
  perfHooks = next;
}

// Hot paths - single nullable check
const hooks = perfHooks;
hooks?.recordTextCellWidthCall(text.length, true);
```

**Benefits**:

- Disabled: single nullable binding check (~1-2 ns)
- Production bundle: no metrics collector (tree-shaken)
- Enabled: full profiling works

**Option B: Compile-Time Stripping**

```typescript
if (import.meta.env.PROFILING) {
  recordTextCellWidthCall();
}
```

**Benefits**: Zero disabled-path cost

**Option C: Remove ASCII Fast-Path Hook**

Don't instrument trivial fast paths.

#### Confirmatory A/B/C Test

```text
A = pre-Phase-3
B = current instrumentation
C = remediated implementation
```

Required measurements:

- Built dist ESM/CJS (not tsx source)
- ASCII lengths: 1, 8, 32, 100 chars
- p50 ratio + absolute ns/op delta
- Real integration workload

### Priority 2: Fix Bundle Measurement

**Required for proper assessment**:

1. Consumer bundle per public export (import + tree-shake + minify + gzip)
2. Bundler metafile for transitive closure attribution
3. npm pack tarball size for installation footprint

**Don't**: Attempt to fix hash-based filename matching

### Priority 3: Add Integration Benchmarks

**p95 gate should apply to**:

- Complete terminal render + commit cycle
- TLogView append burst
- VirtualList scroll frame
- Real browser DOM frame

**Not**: Sub-microsecond microbenchmarks

### Priority 4: Stop Cache Tuning Until Real Workload

**Current evidence does NOT support**:

- Increasing cache size
- Changing eviction policy
- Adding long-text admission

**Correct next step**: Pick real user workload (e.g., Agent console), profile it, then optimize only proven hotspots.

---

## What This Work Achieved

### Valuable Outcomes ✅

1. **Unicode correctness** (#114): Supplementary plane CJK fixed
2. **Measurement infrastructure** (#115): Baseline harness established
3. **Avoided premature optimization** (#118): Recognized insufficient evidence
4. **Exposed methodological limitations** (#120, #121):
   - p95 gate inappropriate for μs-scale microbenchmarks
   - Need to measure built artifacts, not source
   - Bundle comparison needs transitive closure
5. **Detected potential overhead** (#121): Consistent p50 signal in source-path benchmark

### Honest Assessment

| Dimension                  | Status              |
| -------------------------- | ------------------- |
| Unicode correctness        | **明确提升** ✅     |
| User-perceived performance | **未证明提升** ⚠️   |
| Cache tuning justification | **无证据支持**      |
| Measurement capability     | **明显提升** ✅     |
| Node/tsx source-path cost  | **发现固定开销** ⚠️ |
| Production dist impact     | **未测量** ⚠️       |
| Consumer bundle impact     | **未测量** ⚠️       |

---

## Files Included

- **This document**: `docs/PHASE3.3_RESULTS.md` (audit record)
- **Runtime results**: `docs/perf/phase3.3-overhead-results.json` (207KB, raw data)
- **Bundle results**: `docs/perf/phase3.3-bundle-sizes.json` (18KB, raw data)

---

## Conclusion

**Status**: Initial Phase 3.3 validation run complete; acceptance criteria not met.

**Formal result**: INCONCLUSIVE (p95 gate: 8/9 scenarios, bundle: measurement incomplete)

**Exploratory finding**: Consistent Node/tsx source-path p50 regression (~14.5% relative, ~38 ns absolute) in ASCII fast path

**Next required work**:

1. Remediate instrumentation (optional hooks or compile-time strip)
2. Revalidate with built dist artifacts
3. Fix bundle measurement (consumer bundles, not dist aggregate)
4. Add integration workload benchmarks
5. Targeted ablation for attribution

**Issue #119**: Remains open pending remediation and proper validation

---

**This is an audit record of measurement work that exposed scope limitations and methodological requirements.**
