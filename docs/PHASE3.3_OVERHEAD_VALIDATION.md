# Phase 3.3: Instrumentation Overhead Validation

**Status**: ✅ Framework Complete (v5)  
**Related**: #119 (remains open until results collected)  
**Type**: Performance validation (required)

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

> **Status**: Pending execution

See: `docs/perf/phase3.3-overhead-results.json`  
See: `docs/perf/phase3.3-bundle-sizes.json`

---

## Execution Log

### Environment

- **Node**: TBD
- **V8**: TBD
- **OS**: TBD
- **CPU**: TBD
- **Date**: TBD

### Steps

- [ ] Framework validated
- [ ] Benchmarks executed
- [ ] Results analyzed
- [ ] Decision made

---

## Conclusion

> **To be determined after benchmarks complete**

**Status**: TBD

- [ ] ✅ PASS - Proven regression <= 5% (all gating)
- [ ] ⚠️ INCONCLUSIVE - CI crosses threshold, more samples needed
- [ ] ❌ FAIL - Proven regression > 5%, remediation required

**Decision**: TBD

**Next Steps**: TBD

---

## References

- Issue: #119 (Phase 3.3 overhead validation)
- Phase 4.0: #118 (identified this as required)
- Phase 3.1: #116, Phase 3.2: #117
- Phase 2: #115 (baseline harness)
