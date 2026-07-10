# Phase 3.3: Instrumentation Overhead Validation

**Status**: ⚠️ Framework Complete (v3)  
**Related**: #119 (remains open until results collected)  
**Type**: Performance validation (required)

---

## Objective

Validate that Phase 3 instrumentation hooks do not introduce unacceptable runtime or bundle-size overhead in the disabled state (production mode).

---

## Comparison Points

**Baseline (Commit A)**: \`697472b0cc5c000fb46baf16e85c60d84ee22471\`

- PR #115 merge (Phase 2 complete, before Phase 3)

**Current (Commit B)**: \`4d543ff7042f9c2400fa50a9dff921a0f36f77a3\`

- PR #117 merge (Phase 3.1 + 3.2 complete, instrumentation disabled)

---

## Methodology

### Runtime Performance

**Approach**: Paired AB/BA benchmarks with bootstrap CI

**Execution**:
\`\`\`bash
pnpm run bench:overhead
\`\`\`

**Method**:

- 10 paired AB/BA runs in alternating order
- Full Phase 2 baseline per run (warmup=50, samples=500)
- Extract p95 from each run
- Compute paired p95 ratio (B/A) per pair
- Bootstrap 95% CI on paired ratios
- Point estimate: median of paired ratios

**Decision gate** (non-inferiority per #119):

- **FAIL**: 95% CI lower bound > 1.05 (proven regression > 5%)
- **PASS**: 95% CI upper bound <= 1.05 (proven regression <= 5%)
- **INCONCLUSIVE**: CI crosses 1.05 threshold

### Bundle Size

**Approach**: Per-entry gzip comparison

**Execution**:
\`\`\`bash
pnpm run bench:bundle-size
\`\`\`

**Measured**:

- dist/core.js, dist/core.cjs
- dist/vue.js, dist/vue.cjs
- dist/index.js, dist/index.cjs

**Decision gate** (per entry):

- **ACCEPTABLE**: Δ <= +2KB gzip
- **WARNING**: +2KB < Δ <= +5KB gzip
- **FAIL**: Δ > +5KB gzip

**Note**: Negative deltas (size reductions) are always acceptable.

---

## Remediation Options (If Fails)

Per #119, if runtime regression > 5% proven:

1. **Reduce hooks**: Remove from hottest paths
2. **Compile-time strip**: Build flag to remove instrumentation
3. **Separate build**: \`@simon_he/vue-tui-profiling\` package
4. **Rollback**: Revert Phase 3 instrumentation

---

## Results

> **Status**: Pending execution (30-60min)

See: \`docs/perf/phase3.3-overhead-results.json\`  
See: \`docs/perf/phase3.3-bundle-sizes.json\`

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

- [ ] ✅ PASS - Proven regression <= 5%
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
