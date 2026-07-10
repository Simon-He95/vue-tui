# Phase 3.3: Instrumentation Overhead Validation - Results

**Status**: ⚠️ ACTION REQUIRED  
**Date**: 2026-07-10  
**Issue**: #119 (remains open)

---

## Executive Summary

### ⚠️ Overall: ACTION REQUIRED

**Formal p95 gate**: INCONCLUSIVE  
**Critical p50 finding**: Clear ASCII fast-path regression (~14.5%)  
**Bundle**: Public exports pass, aggregate +9.06 KB, chunk comparison needs correction

**Conclusion**: Instrumentation disabled-path cost must be remediated before Phase 3 can be considered complete.

---

## Critical Finding: ASCII Fast Path Regression

### p50 Analysis

**Scenario**: `textCellWidth_ascii_long_fast_path` (100-char ASCII)

**Results**:

- **All 10 paired p50 ratios**: 1.133 – 1.157 (consistently elevated)
- **Median ratio**: 1.1451 (+14.51%)
- **Bootstrap 95% CI**: [1.1417, 1.1503]
- **Interpretation**: **Stable, clear regression, not measurement noise**

**Comparison**:

- This scenario: p50 +14.5%, CI very narrow
- Other stable scenarios (e.g., wrapByCells_cjk_long_hot): p50 +3.76%, CI [1.0345, 1.0412]

**Root cause**: Disabled instrumentation still executes function calls and branches:

```typescript
// Pre-Phase-3
if (hasAsciiFastPath(provider) && isAscii(text)) return text.length;

// Post-Phase-3 (disabled state)
if (hasAsciiFastPath(provider) && isAscii(text)) {
  if (isInstrumentationEnabled()) {
    // ← Always false in production
    textInstr.recordTextCellWidthCall(text.length, true);
  }
  return text.length;
}
```

**Impact**:

- ASCII text is the most common case
- `textCellWidth` called by multiple components
- 14.5% overhead on fast path is significant

**Remediation required**: See recommendations below.

---

## Formal p95 Gate Results

### Configuration

- **Commit A** (Pre-Phase-3): `697472b0`
- **Commit B** (Post-Phase-3): `4d543ff7`
- **Pairs**: 10 (AB/BA alternating)
- **Warmup**: 50, **Samples**: 500 per pair
- **Bootstrap**: 10,000 iterations, seed: 0x33120202
- **Environment**: Node v24.18.0, V8 13.6, macOS arm64, Apple M1 Pro
- **Date**: 2026-07-10

### Gating Scenarios Results

| Scenario                                      | p95 Ratio | 95% CI         | Status          | Notes                                   |
| --------------------------------------------- | --------- | -------------- | --------------- | --------------------------------------- |
| textCellWidth_ascii_long_fast_path            | 1.033     | [0.970, 1.388] | ⚠️ INCONCLUSIVE | **p50 shows clear +14.5% regression**   |
| textCellWidth_cjk_long_hot                    | 0.972     | [0.844, 1.493] | ⚠️ INCONCLUSIVE | Wide CI                                 |
| textCellWidth_cjk_unique                      | 0.964     | [0.862, 1.341] | ⚠️ INCONCLUSIVE | Wide CI                                 |
| textCellWidth_complex_grapheme_hot            | 1.013     | [0.972, 1.077] | ⚠️ INCONCLUSIVE | Narrow CI, close to threshold           |
| textCellWidth_complex_grapheme_unique         | 1.052     | [0.547, 1.114] | ⚠️ INCONCLUSIVE | Extreme variability (CV 149%)           |
| **wrapByCells_cjk_long_hot**                  | 1.017     | [0.820, 1.023] | ✅ **PASS**     | Only scenario proven <= 5%              |
| wrapByCells_cjk_unique                        | 0.915     | [0.747, 1.062] | ⚠️ INCONCLUSIVE | Wide CI                                 |
| terminal_write_supplementary_cjk_hot          | 1.082     | [0.989, 1.298] | ⚠️ INCONCLUSIVE | Extreme swings (0.74–2.55 across pairs) |
| terminal_write_supplementary_cjk_cycling_rows | 1.065     | [0.828, 1.208] | ⚠️ INCONCLUSIVE | High variability                        |

### Summary

- **PASS**: 1 (11%)
- **INCONCLUSIVE**: 8 (89%)
- **FAIL**: 0 (0%)

**Interpretation**:

- **Formal result**: No scenario met the pre-registered p95 FAIL criterion (CI lower > 1.05)
- **Engineering reality**: p50 analysis reveals clear ASCII fast-path regression
- **Decision**: Cannot proceed without remediation

---

## Bundle Size Results

### Configuration

- Same commits as runtime test
- All emitted JS/CJS files scanned (59 total)
- Per-file and aggregate analysis

### Public Exports (24 files): Pass Per-Entry Gate

**All public exports < +2KB threshold** ✅

Largest increases:

- `vue.cjs`: +1.30 KB (+0.79%)
- `index.cjs`: +1.32 KB (+1.03%)
- `cli.cjs`: +790 B (+0.73%)
- `core.cjs`: +774 B (+3.51%)

### Aggregate: +9.06 KB gzip (+0.55%)

- **Total files**: 59
- **Commit A total**: 1648.18 KB gzip
- **Commit B total**: 1657.24 KB gzip
- **Delta**: +9,278 bytes gzip

### Non-Export Chunk Comparison: Needs Correction

**Issue**: Hash-named chunks compared by filename, not logical content:

- `create-terminal-DXuZ2fci.js` (A) vs `create-terminal-D4mGjAYO.js` (B)
- `width-GqllnV8C.js` (A) vs `width-DnZjDPPc.js` (B)

**Observed**:

- Some chunks show real size growth (e.g., width: 3.37 KB → 4.39 KB gzip)
- Others are rename-only

**Conclusion**: Cannot definitively classify all non-export chunk changes without logical pairing.

### Bundle Decision: Provisionally Acceptable / Manual Review Required

**Rationale**:

- ✅ Public export gate: **PASS**
- ✅ Aggregate growth: **+9.06 KB is acceptable for instrumentation framework**
- ⚠️ Non-export logical chunk matching: **Needs bundler metafile or content hash pairing**

---

## Overall Decision Per #119

### Requirements vs Results

| Requirement                   | Result                                                        | Status               |
| ----------------------------- | ------------------------------------------------------------- | -------------------- |
| Bundle size acceptable        | Public exports pass, aggregate +9.06 KB                       | ⚠️ Pass with caveats |
| Runtime overhead proven <= 5% | p95 gate: INCONCLUSIVE<br/>p50: Clear ASCII +14.5% regression | ❌ Not met           |

### Status: ⚠️ ACTION REQUIRED

**#119 remains open** pending:

1. Remediation of ASCII fast-path overhead
2. Re-validation after remediation
3. Bundle chunk logical comparison fix

---

## Root Cause Analysis

### Why p95 Gate is INCONCLUSIVE

**Problem**: Measurement windows too short for sub-microsecond operations

- ASCII 100-char: ~300 ns/op
- Sample window: 100 iterations × 300 ns = ~30 μs
- p95 dominated by scheduler/GC/JIT noise, not instrumentation cost

**Evidence**: Extreme swings in p95 ratios

- `terminal_write` pairs range from 0.74 to 2.55
- `textCellWidth_cjk_unique` single pair reached 3.07

**Conclusion**: p95 gate appropriate for integration workloads (ms-scale), not microbenchmarks (μs-scale)

### Why p50 Shows Clear Signal

**p50 is stable** because:

- Median filters outliers
- Central tendency less affected by scheduler noise
- ASCII fast-path regression is consistent (+14.5%)

---

## Recommendations

### Priority 1: Remediate Disabled-Path Overhead

**Do NOT immediately increase pairs to 20**. Problem is overhead, not sample size.

#### Option A: Optional Hook Binding (Recommended)

```typescript
// perf-hooks.ts - minimal module
export let perfHooks: PerfHooks | undefined;

export function installPerfHooks(hooks: PerfHooks | undefined): void {
  perfHooks = hooks;
}

// Hot paths - single nullable check
const hooks = perfHooks;
hooks?.recordTextCellWidthCall(text.length, true);
```

**Benefits**:

- Disabled: single nullable binding check (~1-2 ns)
- Production bundle: no metrics collector
- Enabled: full instrumentation works

#### Option B: Compile-Time Stripping

```typescript
// Normal build: strips instrumentation
// Profiling build: includes hooks
if (import.meta.env.PROFILING) {
  recordTextCellWidthCall();
}
```

**Benefits**:

- Zero disabled-path cost
- Cleanest final state

#### Option C: Remove ASCII Fast-Path Hook

```typescript
// Don't instrument trivial fast paths
if (hasAsciiFastPath(provider) && isAscii(text)) {
  return text.length; // No hook
}
```

**Trade-off**: Loses ASCII call count data

### Priority 2: Fix Validation Method

**Microbenchmark gate changes**:

- Use **p50 ratio + absolute ns/op delta**, not p95
- Auto-calibrate sample batch to 1-5 ms duration
- Add ASCII length variations (1, 8, 32, 100 chars)

**Integration gate changes**:

- Use p95 for complete workloads:
  - Full render pass
  - Terminal frame update
  - TLogView append burst
  - VirtualList scroll frame

**Bundle gate changes**:

- Logical chunk pairing (bundler metafile or content hash)
- Pre-register aggregate threshold
- Don't rely on hash-based filename matching

### Priority 3: Re-validate After Remediation

Only run extended benchmark (20+ pairs) after:

- ASCII p50 regression eliminated
- Bundle logical comparison fixed
- CI green

### Priority 4: Stop Cache Tuning

**Current evidence does NOT support**:

- Increasing cache size from 128 to 512
- Changing clear-all to LRU
- Adding long-text admission policy
- Provider-aware cache separation

**Correct next step**: Pick real user workload for profiling, not synthetic optimization.

---

## What This Work Achieved

### Clear Wins ✅

1. **Unicode correctness** (#114): Supplementary plane CJK width fixed
2. **Measurement capability** (#115): Baseline harness with stability classification
3. **Avoided premature optimization** (#118): Recognized insufficient evidence for cache tuning
4. **Exposed real cost** (#120, #121): Discovered instrumentation overhead

### Current Status ⚠️

| Dimension                  | Conclusion                          |
| -------------------------- | ----------------------------------- |
| Unicode correctness        | **明确提升** ✅                     |
| User-perceived performance | **尚无证明提升**                    |
| Cache tuning               | **没有证据支持，未实施是正确的** ✅ |
| Measurement capability     | **明显提升** ✅                     |
| Production runtime         | **发现 ASCII fast path 回归** ⚠️    |
| Bundle size                | **存在小幅但真实增长** ⚠️           |
| Engineering complexity     | **已经明显增加** ⚠️                 |

---

## Detailed Files

- **This document**: `docs/PHASE3.3_RESULTS.md`
- **Runtime results**: `docs/perf/phase3.3-overhead-results.json` (207KB, full data)
- **Bundle results**: `docs/perf/phase3.3-bundle-sizes.json` (18KB)

---

## Conclusion

**Phase 3.3 validation**: ⚠️ **ACTION REQUIRED**

**Key findings**:

1. ✅ **No p95 FAIL**: No scenario proven > 5% under formal gate
2. ⚠️ **Clear p50 regression**: ASCII fast path +14.5% (stable, not noise)
3. ⚠️ **Bundle acceptable**: Public exports pass, aggregate +9KB, chunk comparison needs fix
4. ⚠️ **Method refinement needed**: p95 gate inappropriate for μs-scale microbenchmarks

**Recommended actions**:

1. Remediate disabled instrumentation cost (optional hook binding or compile-time strip)
2. Fix bundle chunk logical pairing
3. Refine validation method (p50 for microbenchmarks, p95 for integration)
4. Re-validate after remediation
5. Stop cache tuning pending real workload evidence

**#119 status**: **Remains open** pending remediation and re-validation

---

**This is an audit record of valuable measurement work that exposed real engineering trade-offs requiring resolution.**
