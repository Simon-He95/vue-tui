# Phase 3.3: Overhead Validation - Implementation Plan

## Status

✅ **Framework Complete** - Ready for execution  
⚠️ **Benchmarks Pending** - Requires dedicated execution environment

---

## What's Implemented

### 1. Runtime Overhead Harness ✅

**Script**: `scripts/bench-instrumentation-overhead.ts`

**Features**:

- Automated git checkout and build at both commits
- Uses existing Phase 2 baseline harness
- Compares p50/p95/p99 across scenarios
- 5%/10% regression thresholds
- JSON output for analysis

**Usage**:

```bash
pnpm run bench:overhead
```

### 2. Bundle Size Comparison ✅

**Script**: `scripts/bench-bundle-size.ts`

**Features**:

- Automated build at both commits
- Measures raw and gzip sizes
- Compares core.js, vue.js, index.js
- +2KB/+5KB thresholds
- JSON output

**Usage**:

```bash
pnpm run bench:bundle-size
```

### 3. Documentation Template ✅

**Document**: `docs/PHASE3.3_OVERHEAD_VALIDATION.md`

**Includes**:

- Methodology
- Decision gates
- Remediation options
- Results template

---

## Comparison Points

**Commit A (Pre-Phase-3)**: `697472b0cc5c000fb46baf16e85c60d84ee22471`

- PR #115 merge (Phase 2 baseline complete)
- No instrumentation hooks

**Commit B (Post-Phase-3)**: `4d543ff7042f9c2400fa50a9dff921a0f36f77a3`

- PR #117 merge (Phase 3.1 + 3.2 complete)
- Instrumentation hooks in production paths (disabled by default)

---

## Why Benchmarks Are Not Included Yet

### Execution Requirements

1. **Time-consuming**: Each full benchmark cycle takes 30-60 minutes
2. **Git state changes**: Scripts checkout different commits
3. **Clean environment**: Requires fresh Node processes
4. **Multiple iterations**: Need statistical significance

### Recommended Execution Approach

**Option A: Dedicated CI Job**

- Run on merge to main
- Clean environment
- Automated reporting
- Historical tracking

**Option B: Local Execution**

- Developer runs manually
- Results committed separately
- Verified by reviewers

**Option C: Separate Validation PR**

- This PR: Framework and tooling
- Next PR: Actual benchmark results

---

## Expected Results (Prediction)

Based on Phase 4.0 analysis:

### Runtime Performance

**Likely outcome**: Minor overhead (< 5%)

- Instrumentation hooks are simple boolean checks + no-ops
- Disabled path: `if (!enabled) return`
- Main cost: Function call overhead

**Risk areas**:

- `createCell()` - called very frequently
- `textCellWidth()` - ASCII fast path
- Multiple hook calls per operation

### Bundle Size

**Likely outcome**: Small increase (< 2KB gzip per entry)

- Instrumentation module statically imported
- Tree-shaking may help
- Helper functions are small

**Risk areas**:

- WeakMap/array registry code
- Type definitions
- Export surface expansion

---

## Decision Matrix

| Scenario   | p95 Ratio | Bundle Δ     | Decision                      |
| ---------- | --------- | ------------ | ----------------------------- |
| Best case  | < 1.05    | < +2KB       | ✅ Keep instrumentation       |
| Acceptable | 1.05-1.10 | +2KB to +5KB | ⚠️ Review, minor optimization |
| Concerning | > 1.10    | > +5KB       | ❌ Remediate required         |

---

## Remediation Options

If overhead is unacceptable:

### Option 1: Reduce Hook Frequency

- Keep only critical measurement points
- Remove hooks from hottest paths
- Merge multiple measurements

### Option 2: Compile-Time Stripping

```typescript
if (process.env.BUILD_PROFILING) {
  // Include instrumentation
} else {
  // Strip completely
}
```

### Option 3: Separate Profiling Build

- `@simon_he/vue-tui` - production (no instrumentation)
- `@simon_he/vue-tui-profiling` - development (full instrumentation)

### Option 4: Rollback

- Revert Phase 3.1 + 3.2
- Redesign measurement approach
- Consider external profiling tools

---

## Next Steps

### This PR

1. ✅ Create harness scripts
2. ✅ Add package.json commands
3. ✅ Document methodology
4. ✅ Define decision gates
5. ⏳ Submit PR for review
6. ⏳ Merge tooling

### Follow-up Work

**After this PR merges**:

1. **Execute benchmarks** in clean environment
2. **Collect data** (overhead + bundle size)
3. **Analyze results** against gates
4. **Make decision**:
   - If PASS: Document and close #119
   - If WARNING: Minor optimization PR
   - If FAIL: Execute remediation

5. **Update docs** with actual results
6. **Close issue #119**

---

## Verification Checklist

- [x] Harness scripts created
- [x] Package scripts added
- [x] Documentation template ready
- [x] Methodology documented
- [x] Decision gates defined
- [x] Remediation options outlined
- [ ] Benchmarks executed (post-merge)
- [ ] Results analyzed (post-merge)
- [ ] Decision made (post-merge)

---

## PR Summary

This PR provides the **tooling and methodology** for Phase 3.3 overhead validation.

**Includes**:

- Automated runtime comparison harness
- Bundle size comparison tool
- Clear decision gates and thresholds
- Remediation playbook

**Does NOT include**:

- Actual benchmark results (requires dedicated execution)
- Final decision (pending data)

**Next**: Execute benchmarks in clean environment after tooling review

---

**Ready for review and merge of tooling framework** ✅
