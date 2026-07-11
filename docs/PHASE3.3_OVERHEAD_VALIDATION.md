# Phase 3.3: Instrumentation Overhead Validation

**Status**: ✅ Complete — production strip validated and merged
**Related**: #119 (closed), #122 (merged), #123 (real workload closure)
**Type**: Performance validation (complete)

---

## Objective

Validate that Phase 3 instrumentation hooks do not introduce unacceptable runtime or bundle-size overhead in the disabled state (production mode).

---

## Comparison Points

**Baseline (Commit A)**: `697472b0cc5c000fb46baf16e85c60d84ee22471`

- PR #115 merge (Phase 2 complete, before Phase 3)

**Current (Commit B)**: `4d543ff7042f9c2400fa50a9dff921a0f36f77a3`

- PR #117 merge (Phase 3.1 + 3.2 complete, instrumentation disabled)

---

## Methodology

### Runtime Performance

**Approach**: Paired AB/BA benchmarks with bootstrap CI

**Execution**:

```bash
pnpm run bench:overhead  # 30-60min
```

**Method**:

- 10 paired AB/BA runs in alternating order
- Full Phase 2 baseline per run (warmup=50, samples=500)
- Extract p50 and p95 from each run
- Compute paired ratios per metric (B/A)
- Bootstrap 95% CI on paired ratios (10,000 iterations, seeded)
- Point estimate: median of paired ratios

**Gating scenarios** (9 pre-registered):

- terminal_write_supplementary_cjk_hot
- terminal_write_supplementary_cjk_cycling_rows
- textCellWidth_ascii_long_fast_path
- textCellWidth_cjk_long_hot
- textCellWidth_cjk_unique
- textCellWidth_complex_grapheme_hot
- textCellWidth_complex_grapheme_unique (grapheme instrumentation)
- wrapByCells_cjk_long_hot
- wrapByCells_cjk_unique

**Decision gate** (non-inferiority, p95-based):

- **FAIL**: p95 CI lower bound > 1.05 (proven regression > 5%)
- **PASS**: p95 CI upper bound <= 1.05 (proven regression <= 5%)
- **INCONCLUSIVE**: p95 CI crosses 1.05 threshold

**Exit codes**:

- 0: All gating scenarios PASS
- 1: Any gating scenario FAIL
- 2: Any gating scenario INCONCLUSIVE (no FAIL)

**p50 analysis**: Reported but not used for gate decision

**Informational scenarios**: Reported but don't determine exit code

### Bundle Size

**Approach**: Complete dist/ file comparison

**Execution**:

```bash
pnpm run bench:bundle-size  # 5-10min
```

**Measured**:

- All emitted JS/CJS files in dist/
- Public exports (from package.json)
- Non-export runtime files (if any)
- Aggregate total size

**Decision gate** (per export entry):

- **ACCEPTABLE**: Δ <= +2KB gzip
- **WARNING**: +2KB < Δ <= +5KB gzip
- **FAIL**: Δ > +5KB gzip

**Note**: Negative deltas (size reductions) are always acceptable.

---

## Audit Trail

Complete data preserved for reproducibility:

**Runtime results**:

- All 10 paired runs (index, order, timestamps)
- Raw p50/p95 values per scenario per pair
- Bootstrap seed and iterations
- Gating scenario list
- Environment metadata

**Bundle results**:

- Per-export comparisons
- Aggregate totals
- Non-export files (if any)

---

## Remediation Options (If Fails)

Per #119, if runtime regression > 5% proven:

1. **Reduce hooks**: Remove from hottest paths
2. **Compile-time strip**: Build flag to remove instrumentation
3. **Separate build**: `@simon_he/vue-tui-profiling` package
4. **Rollback**: Revert Phase 3 instrumentation

---

## Results

> **Status**: ⚠️ Initial Run Complete; Acceptance Criteria Not Met

**Initial validation executed**: 2026-07-10

**Formal result**: INCONCLUSIVE

- p95 gate: 8/9 scenarios INCONCLUSIVE (wide CIs), 1 PASS, 0 FAIL
- Bundle: INCONCLUSIVE (transitive closure not measured)

**Exploratory findings** (post-hoc):

- Two stable Node/tsx source-path p50 signals detected
- ASCII fast path: +14.5% / ~38 ns/op (workload-dependent)
- Wrap hot path: +3.8%

**Critical limitation**: Measured tsx executing `src/*`, NOT published dist or real workloads.

**Detailed analysis**: See `docs/PHASE3.3_RESULTS.md`
**Raw data**: `docs/perf/phase3.3-overhead-results.json`, `docs/perf/phase3.3-bundle-sizes.json`

**Next required**:

- Remediate instrumentation overhead
- Validate built dist artifacts
- Proper consumer bundle measurement
- Integration workload benchmarks

**Issue status**: #119 reopened pending remediation and proper validation

---

## Execution Log

### Environment (Initial Run)

- **Node**: v24.18.0
- **V8**: 13.6
- **OS**: macOS arm64
- **CPU**: Apple M1 Pro
- **Date**: 2026-07-10

### Steps

- [x] Framework validated
- [x] Benchmarks executed
- [x] Results analyzed
- [ ] Decision made (acceptance criteria not met)

---

## Conclusion

**Status**: ⚠️ Initial Run Complete; Acceptance Criteria Not Met

- [x] ⚠️ INCONCLUSIVE - p95: 8/9 scenarios, bundle: measurement incomplete
- [ ] ✅ PASS
- [ ] ❌ FAIL

**Decision**: Cannot proceed without remediation and proper validation

**Next Steps**: See `docs/PHASE3.3_RESULTS.md` for detailed recommendations

---

## References

- Issue: #119 (Phase 3.3 overhead validation)
- Phase 4.0: #118 (identified this as required)
- Phase 3.1: #116, Phase 3.2: #117
- Phase 2: #115 (baseline harness)

---

## Final closure (2026-07-11)

PR #122 validated that standard ESM/CJS and packed consumers contain no instrumentation collector, no no-op stub, and no hot-path dispatch. PR #123 then exercised the production Agent Console package in CLI and Chromium. The only accepted follow-up is the measured Agent Console replay-history publication optimization. No cache, long-text, provider, renderer-architecture, or virtual-scroll change is justified by this workload.
