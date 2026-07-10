# Phase 3.3: Implementation Plan (v3)

## Status

✅ **Framework Complete (v3)** - All blocking issues fixed  
⚠️ **Benchmarks Pending** - Requires execution

**Related**: #119 (remains open until results)

---

## v3 Changes (Critical Fixes)

### Statistical Method ✅

**Fixed**: Paired bootstrap now matches point estimate

- Point estimate: median of paired p95 ratios
- Bootstrap: resamples pairs, computes median
- Was: independent A/B resampling with outer p95

### Decision Logic ✅

**Fixed**: Non-inferiority three-way gate

- FAIL if CI lower > 1.05 (proven regression > 5%)
- PASS if CI upper <= 1.05 (proven regression <= 5%)
- INCONCLUSIVE if CI crosses 1.05
- Was: PASS if CI lower <= 1.05 (wrong logic)

### Documentation ✅

**Fixed**: All docs now consistent

- Runtime: Non-inferiority gate
- Bundle: Per-entry positive-only
- No 10% threshold anywhere

### Fail-Closed ✅

**Fixed**: Bundle checker throws on missing files

- Was: returned 0 and skipped

### Shell Safety ✅

**Fixed**: Uses execFileSync with argument arrays

- Was: string interpolation in execSync

---

## Tools (v3)

### Runtime Overhead Harness

**Script**: \`scripts/bench-instrumentation-overhead.ts\`

**Method**:

- 10 paired AB/BA runs
- Paired p95 ratios
- Paired bootstrap CI
- Non-inferiority gate

**Usage**:
\`\`\`bash
pnpm run bench:overhead
\`\`\`

**Exit codes**:

- 0: PASS (proven <= 5%)
- 1: FAIL (proven > 5%)
- 2: INCONCLUSIVE

### Bundle Size Comparison

**Script**: \`scripts/bench-bundle-size.ts\`

**Method**:

- Tests ESM and CJS (.js and .cjs)
- Throws on missing bundles
- Positive-only failures

**Usage**:
\`\`\`bash
pnpm run bench:bundle-size
\`\`\`

---

## Decision Gates

### Runtime

**Non-inferiority logic**:
\`\`\`
if CI_lower > 1.05:
FAIL (proven regression > 5%)
elif CI_upper <= 1.05:
PASS (proven regression <= 5%)
else:
INCONCLUSIVE (CI crosses threshold)
\`\`\`

### Bundle

**Per-entry thresholds**:

- +2KB gzip: WARNING
- +5KB gzip: FAIL

---

## Validation

Framework (v3):

- [x] Paired bootstrap matching point estimate
- [x] Non-inferiority decision logic
- [x] Documentation consistent
- [x] Fail-closed on missing bundles
- [x] execFileSync for shell safety
- [x] Environment validation
- [x] Commit SHA validation

Results (pending):

- [ ] Execute benchmarks
- [ ] Analyze results
- [ ] Close #119

---

## Review Response (v3)

All P0/P1 blocking issues resolved:

1. ✅ **Bootstrap CI** - Paired resampling, matches point estimate
2. ✅ **PASS logic** - Non-inferiority three-way gate
3. ✅ **Documentation** - All gates consistent
4. ✅ **Bundle fail-closed** - Throws on missing files
5. ✅ **Shell safety** - execFileSync with arrays
6. ✅ **Validation** - Commit, environment, scenarios
7. ✅ **Cleanup** - Robust finally block

---

**Framework v3 ready for review** ✅
