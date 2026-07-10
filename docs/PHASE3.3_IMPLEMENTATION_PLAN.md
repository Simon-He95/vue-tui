# Phase 3.3: Implementation Plan (v4 - Final)

## Status

✅ **Framework Complete (v4)** - All decision-quality issues fixed  
⚠️ **Benchmarks Pending** - Ready for execution

**Related**: #119 (remains open)

---

## v4 Changes (Decision-Quality Fixes)

### Gating Scenarios ✅

**Fixed**: Pre-registered primary scenarios

- 8 gating scenarios (instrumented paths)
- Unstable/control scenarios informational only
- Validates all gating scenarios exist

### p50 Analysis ✅

**Fixed**: Both p50 and p95 analyzed

- Paired p50 ratios with bootstrap CI
- Paired p95 ratios with bootstrap CI
- Decision based on p95 only

### Deterministic Bootstrap ✅

**Fixed**: Reproducible CI

- Seed: 0x33120202
- 10,000 iterations
- Deterministic PRNG (LCG)
- Seed/iterations persisted

### Audit Trail ✅

**Fixed**: Complete data preservation

- All paired runs with timestamps
- Raw p50/p95 values per pair
- AB/BA order recorded
- Bootstrap config saved
- No automatic deletion

### Bundle Coverage ✅

**Fixed**: All published entries

- Derives from package.json exports
- Tests all .js and .cjs files
- ~15+ entries (not just 6)

### Cleanup ✅

**Fixed**: Robust worktree cleanup

- Paths determined before try block
- Cleanup even on setup failure
- Prune after removal

---

## Tools (v4)

### Runtime Overhead Harness

**Script**: \`scripts/bench-instrumentation-overhead.ts\`

**Gating scenarios** (pre-registered):

- terminal_write_supplementary_cjk_hot
- terminal_write_supplementary_cjk_cycling_rows
- textCellWidth_ascii_long_fast_path
- textCellWidth_cjk_long_hot
- textCellWidth_cjk_unique
- textCellWidth_complex_grapheme_hot
- wrapByCells_cjk_long_hot
- wrapByCells_cjk_unique

**Analysis**:

- Paired p50 and p95 ratios
- Bootstrap CI for both (separate seeds)
- Decision: p95 gate only
- Gating scenarios determine exit code

**Usage**:
\`\`\`bash
pnpm run bench:overhead
\`\`\`

**Output**: \`docs/perf/phase3.3-overhead-results.json\`

- Complete paired runs
- Both p50 and p95 analysis
- Bootstrap config
- Gating scenario list

### Bundle Size Comparison

**Script**: \`scripts/bench-bundle-size.ts\`

**Method**:

- Reads package.json exports
- Tests all .js and .cjs entries
- Validates export consistency

**Usage**:
\`\`\`bash
pnpm run bench:bundle-size
\`\`\`

**Output**: \`docs/perf/phase3.3-bundle-sizes.json\`

---

## Decision Logic

### Runtime (Gating Scenarios Only)

**p95-based gate**:
\`\`\`
if p95_CI_lower > 1.05:
FAIL
elif p95_CI_upper <= 1.05:
PASS
else:
INCONCLUSIVE
\`\`\`

**Exit codes**:

- 0: All gating PASS
- 1: Any gating FAIL
- 2: Any gating INCONCLUSIVE (no FAIL)

**p50 analysis**: Reported but not used for gate

**Informational scenarios**: Not included in exit code

### Bundle

**Per-entry thresholds**:

- +2KB gzip: WARNING
- +5KB gzip: FAIL

---

## Audit Trail

Complete data preserved:

- All 10 paired runs (AB/BA order)
- Raw p50/p95 values per pair
- Timestamps per run
- Bootstrap seed/iterations
- Gating scenario list
- Environment metadata
- Raw benchmark reports (not deleted)

---

## Review Response (v4)

All P1 decision-quality issues resolved:

1. ✅ **Gating scenarios** - Pre-registered, unstable/control informational
2. ✅ **p50 analysis** - Both p50 and p95 reported
3. ✅ **Deterministic bootstrap** - Seeded PRNG, full provenance
4. ✅ **Bundle coverage** - All package.json exports
5. ✅ **Cleanup** - Robust even on setup failure
6. ✅ **Audit trail** - Complete data preserved

---

**Framework v4 - All decision-quality issues fixed!** ✅
