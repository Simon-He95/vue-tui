# Phase 3.3: Overhead Validation - Implementation Plan (v2)

## Status

✅ **Framework Complete (v2)** - Blocking issues fixed  
⚠️ **Benchmarks Pending** - Requires 30-60min execution

**Related Issue**: #119 (remains open until results collected)

---

## Changes from v1 (Review Fixes)

### Critical Fixes ✅

1. **Fixed JSON parsing** - Reads from file output, not stdout
2. **Implemented ABBA ordering** - Multiple paired samples, not single A→B
3. **Added bootstrap 95% CI** - Statistical significance testing
4. **Restored 5% gate** - Per #119 requirement (not 10%)
5. **Isolated worktrees** - No direct git checkout in working directory
6. **Frozen installs** - `--frozen-lockfile` for reproducibility
7. **Full baseline** - warmup=50, samples=500 (not smoke mode)
8. **Fixed bundle logic** - Only fails on positive increases
9. **Per-entry deltas** - No sum of independent entries

### Documentation ✅

- Changed "Closes #119" to "Refs #119"
- Added v2 changelog
- Updated methodology description

---

## What's Implemented

### 1. Runtime Overhead Harness ✅

**Script**: `scripts/bench-instrumentation-overhead.ts`

**Method (per #119)**:

- Isolated worktrees for Commit A and B
- ABBA execution order: A B B A, B A A B, ...
- 10 samples per commit (configurable)
- Full Phase 2 baseline (warmup=50, samples=500)
- Bootstrap 95% confidence interval on p95 ratio
- Decision: FAIL if CI lower bound > 1.05 (5% regression)

**Usage**:

```bash
pnpm run bench:overhead
```

**Output**: `docs/perf/phase3.3-overhead-results.json`

**Scenarios tested**:

- All Phase 2 baseline scenarios
- Includes instrumented paths: textCellWidth, wrapByCells, terminal.write
- Plus non-instrumented controls: charCellWidth, sliceByCells

### 2. Bundle Size Comparison ✅

**Script**: `scripts/bench-bundle-size.ts`

**Method**:

- Isolated worktrees for both commits
- Measures dist/core.js, dist/vue.js, dist/index.js
- Raw and gzip sizes
- **Only fails on positive increases** (reductions are acceptable)
- Per-entry thresholds: +2KB warning, +5KB fail

**Usage**:

```bash
pnpm run bench:bundle-size
```

**Output**: `docs/perf/phase3.3-bundle-sizes.json`

---

## Comparison Points

**Commit A (Pre-Phase-3)**: `697472b0cc5c000fb46baf16e85c60d84ee22471`

- PR #115 merge (Phase 2 baseline complete)
- No instrumentation hooks

**Commit B (Post-Phase-3)**: `4d543ff7042f9c2400fa50a9dff921a0f36f77a3`

- PR #117 merge (Phase 3.1 + 3.2 complete)
- Instrumentation hooks in production paths (disabled by default)

---

## Decision Gates

### Runtime Performance

**Statistical method**: Bootstrap 95% CI on p95 ratio (B/A)

**Gates**:

- ✅ **PASS**: CI lower bound <= 1.05 (no significant regression > 5%)
- ⚠️ **INCONCLUSIVE**: CI too wide (> 20% range), re-run needed
- ❌ **FAIL**: CI lower bound > 1.05 (significant regression > 5%)

**Action if FAIL**: Remediation required per #119

### Bundle Size

**Method**: Per-entry gzip delta

**Gates** (per entry):

- ✅ **ACCEPTABLE**: Δ <= +2KB gzip
- ⚠️ **WARNING**: +2KB < Δ <= +5KB gzip
- ❌ **FAIL**: Δ > +5KB gzip

**Note**: Negative deltas (size reductions) are always acceptable

---

## Why Benchmarks Are Not Included

### Execution Requirements

1. **Time**: 30-60 minutes for full run (10 samples × 2 commits × ABBA)
2. **Clean state**: Fresh worktrees, no system load
3. **Disruption**: Creates/removes worktrees, builds twice
4. **CI integration**: Better as scheduled/manual job

### Recommended Execution

**After tooling merge**:

- Execute in dedicated environment
- Commit results separately
- Update #119 with decision

---

## Remediation Options (If Fails)

Per #119, if p95 regression > 5% with statistical significance:

### Option 1: Reduce Hook Frequency

- Remove hooks from hottest paths
- Keep only critical measurement points
- Consolidate multiple hooks

### Option 2: Compile-Time Stripping

```typescript
if (import.meta.env.BUILD_PROFILING) {
  instrumentHook();
}
```

### Option 3: Separate Profiling Build

- `@simon_he/vue-tui` - production (no instrumentation)
- `@simon_he/vue-tui-profiling` - development (full instrumentation)

### Option 4: Rollback

- Revert Phase 3.1 + 3.2
- Redesign measurement approach

---

## Next Steps

### This PR (Tooling Framework)

1. ✅ Review v2 fixes
2. ✅ Verify methodology compliance with #119
3. ✅ Merge tooling

### Follow-up (Results PR)

1. Execute benchmarks in clean environment
2. Collect runtime and bundle data
3. Analyze against gates
4. Make decision (pass/optimize/remediate)
5. Close #119

---

## Verification Checklist

Framework (this PR):

- [x] JSON parsing fixed (reads files)
- [x] ABBA ordering implemented
- [x] Bootstrap 95% CI implemented
- [x] 5% gate restored per #119
- [x] Isolated worktrees used
- [x] Frozen lockfile installs
- [x] Full baseline (not smoke)
- [x] Bundle logic fixed (positive-only)
- [x] Per-entry deltas (not sum)
- [x] "Closes" changed to "Refs #119"

Results (follow-up PR):

- [ ] Benchmarks executed
- [ ] Results analyzed
- [ ] Decision made
- [ ] #119 closed

---

## Review Response to Blocking Issues

**P0: JSON parsing** ✅ Fixed - reads from file with --output flag

**P1: Statistical method** ✅ Fixed - ABBA, bootstrap CI, multiple samples

**P1: Decision gate** ✅ Fixed - 5% threshold per #119

**P1: Closes #119** ✅ Fixed - changed to "Refs #119"

**P1: Bundle logic** ✅ Fixed - positive-only failures, per-entry

**P2: Checkout safety** ✅ Fixed - isolated worktrees

**P2: Scenario coverage** - Phase 2 suite includes instrumented paths

**P2: CI validation** - Deferred to avoid long-running CI jobs

---

**Framework v2 ready for review** ✅
