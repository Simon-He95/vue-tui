# Phase 3.3: Instrumentation Overhead Validation - Results

**Status**: ⚠️ INCONCLUSIVE  
**Date**: 2026-01-09  
**Issue**: #119

---

## Executive Summary

### ✅ Bundle Size: PASS
**All 24 public exports < +2KB threshold**

### ⚠️ Runtime Overhead: INCONCLUSIVE  
**8 of 9 gating scenarios INCONCLUSIVE (wide CI), 1 PASS, 0 FAIL**

**Key Finding**: No evidence of significant regression > 5%, but CIs too wide to conclusively prove <= 5%

---

## Runtime Overhead Results

### Configuration

- **Commit A** (Pre-Phase-3): `697472b0` 
- **Commit B** (Post-Phase-3): `4d543ff7`
- **Pairs**: 10 (AB/BA alternating)
- **Warmup**: 50 iterations per sample
- **Samples**: 500 iterations per sample
- **Bootstrap**: 10,000 iterations, seed: 0x33120202
- **Environment**: Node v24.18.0, V8 13.6, macOS arm64, Apple M1 Pro

### Gating Scenarios Results

| Scenario | Status | p95 Ratio | 95% CI | Regression % |
|----------|--------|-----------|--------|--------------|
| textCellWidth_ascii_long_fast_path | ⚠️ INCONCLUSIVE | 1.033 | [0.970, 1.388] | +3.26% |
| textCellWidth_cjk_long_hot | ⚠️ INCONCLUSIVE | 0.972 | [0.844, 1.493] | -2.84% |
| textCellWidth_cjk_unique | ⚠️ INCONCLUSIVE | 0.964 | [0.862, 1.341] | -3.61% |
| textCellWidth_complex_grapheme_hot | ⚠️ INCONCLUSIVE | 1.013 | [0.972, 1.077] | +1.26% |
| textCellWidth_complex_grapheme_unique | ⚠️ INCONCLUSIVE | 1.052 | [0.547, 1.114] | +5.18% |
| **wrapByCells_cjk_long_hot** | ✅ **PASS** | 1.017 | [0.820, 1.023] | +1.71% |
| wrapByCells_cjk_unique | ⚠️ INCONCLUSIVE | 0.915 | [0.747, 1.062] | -8.50% |
| terminal_write_supplementary_cjk_hot | ⚠️ INCONCLUSIVE | 1.082 | [0.989, 1.298] | +8.16% |
| terminal_write_supplementary_cjk_cycling_rows | ⚠️ INCONCLUSIVE | 1.065 | [0.828, 1.208] | +6.48% |

### Summary Statistics

- **Total gating scenarios**: 9
- **PASS**: 1 (11%)
- **FAIL**: 0 (0%) ✅
- **INCONCLUSIVE**: 8 (89%)

### Analysis

**Positive findings**:
1. ✅ **No failures**: No scenario proven > 5% regression
2. ✅ **One definitive pass**: wrapByCells_cjk_long_hot proven <= 5%
3. ✅ **Most point estimates acceptable**: 7/9 scenarios have p95 ratio < 1.05
4. ✅ **No major regressions**: Largest point estimate +8.16%

**Challenges**:
1. ⚠️ **Wide confidence intervals**: CI ranges span both sides of 1.05 threshold
2. ⚠️ **High variability**: Especially in terminal_write and grapheme_unique scenarios
3. ⚠️ **Inconclusive for certification**: Cannot conclusively prove <= 5% overhead

**Root causes of INCONCLUSIVE**:
- High inherent variability in some workloads (CV 40-150% from Phase 2)
- Only 10 paired samples
- System noise (background processes, thermal throttling)
- Measurement precision for sub-microsecond operations

---

## Bundle Size Results

### Configuration

- Same commits as runtime test
- All emitted JS/CJS files scanned
- Per-file and aggregate analysis

### Public Exports (24 files)

**All exports ACCEPTABLE (< +2KB)**

Largest increases:
- `vue.cjs`: +1.30 KB (+0.79%)
- `index.cjs`: +1.32 KB (+1.03%)
- `cli.cjs`: +790 B (+0.73%)
- `core.cjs`: +774 B (+3.51%)

### Aggregate

- **Total files**: 59 (24 exports + 35 chunks)
- **Total gzip increase**: +9.06 KB
- **Per-export average**: ~0.38 KB

### Non-Export Files Note

9 files flagged as "fail" are actually **hash-renamed chunks** (rolldown behavior):
- TTree, TSelect, TMermaidText, etc. - same content, different hash
- Not actual size regressions

### Bundle Size Decision: ✅ PASS

**Rationale**:
- All public exports well under threshold
- Total increase reasonable for instrumentation framework
- No unexpected bloat

---

## Overall Decision

### Per #119 Requirements

**Decision gates**:
1. **Bundle size**: ✅ PASS - All entries acceptable
2. **Runtime overhead**: ⚠️ INCONCLUSIVE - Cannot conclusively prove <= 5%

### Status: ⚠️ INCONCLUSIVE (Not Ready to Close #119)

**Next steps required**:

#### Option 1: Increase Sample Size (Recommended)
```bash
# Increase pairs to narrow CI
# Target: 20-30 pairs for more statistical power
pnpm run bench:overhead -- --pairs 20
```

#### Option 2: Targeted Stable Scenarios
- Create dedicated stable grapheme workload
- Focus on lower-variance terminal_write scenarios
- Remove or downgrade highly unstable scenarios

#### Option 3: Accept INCONCLUSIVE with Justification
- Document that no evidence of >5% regression found
- Bundle size clearly acceptable
- Instrumentation overhead likely minimal but not proven
- Proceed to Phase 4 with monitoring

### Recommendation

**Proceed with Option 1**: Run extended benchmark (20 pairs) to narrow CIs.

**Rationale**:
- Point estimates look good (7/9 < 1.05)
- No failures detected
- Just needs more statistical power
- Worth investment for conclusive result

---

## Detailed Files

- Runtime results: `docs/perf/phase3.3-overhead-results.json`
- Bundle results: `docs/perf/phase3.3-bundle-sizes.json`

---

## Conclusion

**Phase 3.3 validation**: ⚠️ **INCONCLUSIVE**

**Bundle**: ✅ **PASS**  
**Runtime**: ⚠️ **INCONCLUSIVE** (needs more samples)

**#119 status**: Remains open pending conclusive runtime results

**Recommended action**: Increase sample size (20+ pairs) for conclusive validation
