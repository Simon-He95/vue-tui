# Phase 3.2 Review Fixes - Status and Plan

> **⚠️ SUPERSEDED BY PHASE 4.0 CHECKPOINT**
>
> This document is a historical review-fix plan from Phase 3.2.
> Its Phase 4 readiness conclusions are no longer valid.
>
> **Important updates from Phase 4.0**:
>
> - Current data does not validate MAX=128 capacity
> - Current data cannot compare clear-all against LRU/LFU
> - Timing and heap conclusions are not decision-grade
> - Bucket distribution is snapshot, not peak
> - See `docs/PHASE4.0_CHECKPOINT.md` for current status

## Review Feedback Summary

Reviewer identified 6 critical issues affecting Phase 4 readiness. This document tracks progress.

---

## ✅ FIXED (Part 1 - Commit 69bade0)

### Issue #4: Misleading Bucket Metrics Names

**Problem**: `cellCacheBucketCountWidth1/2` and `estimatedRetainedCells` imply "live" Style count, but are actually strong-referenced registered buckets

**Fix**: Renamed all metrics to `registered*`:

- `registeredBucketCountWidth1/2`
- `estimatedRegisteredBucketCells`

**Impact**: Clear semantics prevent misinterpreting as production memory

---

## ⏳ TODO (Part 2 - Next Commit)

### Issue #1: Cache Pollution Between Runs (CRITICAL)

**Problem**:

```typescript
// Current: without runs first, then with
disableInstrumentation();
measure(workload); // Populates text/wrap cache, creates cell buckets

enableInstrumentation();
measure(workload); // Gets polluted cache hits, may not register buckets
```

**Impact**:

- Text cache hits hide true grapheme segmentation cost
- Cell buckets created in disabled run won't be registered
- Bucket distribution data incomplete/wrong

**Fix Required**:

```typescript
// Clear caches between runs
clearTextCaches();
forceGC();

// Use unique styles per run to isolate buckets
const style = { href: `perf:${runId}` };
```

---

### Issue #2: W1 Overflow Workload Invalid (CRITICAL)

**Problem**:

```typescript
const ch = String.fromCharCode(0x21 + (i % 94)); // Only 94 unique!
```

Only generates 94 printable ASCII, can't exceed MAX=128

**Impact**: Can't test width=1 cache overflow behavior

**Fix Required**:

```typescript
// Use 200 truly unique width=1 chars
const ch = String.fromCharCode(0x0100 + i); // Latin Extended-A
```

---

### Issue #3: P50/P95 Distribution Not Exposed (CRITICAL)

**Problem**: `getCacheBucketDistribution()` calculates P50/P95/Max but doesn't expose them

**Current**:

```typescript
interface CellCacheMetrics {
  registeredBucketCountWidth1: number;
  // ... but no P50/P95/Max fields
}
```

**Impact**: Can't answer "typical bucket size" or "is 128 limit appropriate for most?"

**Fix Required**:

```typescript
interface CellCacheMetrics {
  // Add distribution fields
  registeredBucketSizeP50Width1: number;
  registeredBucketSizeP95Width1: number;
  registeredBucketSizeMaxWidth1: number;
  registeredBucketSizeP50Width2: number;
  registeredBucketSizeP95Width2: number;
  registeredBucketSizeMaxWidth2: number;
}

// Update getMetrics() to populate from distribution
```

---

### Issue #5: Cleanup Not Robust

**Problem**: `measureWorkload` has `terminal` variable but never uses it

**Impact**: Terminal not disposed if workload throws

**Fix Required**:

```typescript
function withTerminal<T>(options, fn: (terminal) => T): T {
  const terminal = createTerminal(options);
  try {
    return fn(terminal);
  } finally {
    terminal.dispose();
  }
}

// Then use in workloads
withTerminal({ cols: 80, rows: 24 }, (terminal) => {
  // workload
});
```

---

### Issue #6: Style Type Issues (MINOR)

**Problem**: `{ fg: styleIdx }` where `fg` expects string

**Impact**: Type-unsafe but doesn't break at runtime

**Fix Required**:

```typescript
const style = { href: `perf:style:${runId}:${styleIdx}` };
```

---

## Implementation Plan

### Part 2 Commit (All Remaining Fixes)

**Files to modify**:

1. `src/core/perf/instrumentation.ts`:
   - Add P50/P95/Max fields to interface
   - Update initialization
   - Update resetMetrics
   - Update getMetrics() to populate from distribution

2. `scripts/bench-profiler-complete.ts`:
   - Add `withTerminal()` helper
   - Add `clearTextCaches()` between runs
   - Add unique `runId` to context
   - Use unique styles per run (`href: perf:${runId}:...`)
   - Fix w1 overflow (use 0x0100+ chars)
   - Fix all style types
   - Update output format for P50/P95

**Testing**:

```bash
pnpm run typecheck
pnpm run bench:profiler:complete
```

**Expected outcomes**:

- ✅ W1 overflow triggers cache clears
- ✅ Bucket counts populated correctly
- ✅ P50/P95/Max显示 in output
- ✅ No cross-run cache pollution
- ✅ Robust cleanup even with errors

---

## Phase 4 Readiness

**After Part 2 fixes**:

- ✅ Can trust bucket distribution data
- ✅ Can identify典型 vs extreme bucket sizes
- ✅ Can evaluate if MAX=128 is appropriate
- ✅ Can measure true uncached grapheme cost
- ✅ Can safely proceed with Phase 4 decisions

**Current State (after Part 1 only)**:

- ⚠️ Data may be inaccurate due to cache pollution
- ⚠️ W1 overflow not testing correctly
- ⚠️ Missing P50/P95 for distribution analysis
- ❌ **NOT ready for Phase 4 implementation yet**

---

## Recommendation

**Before Phase 4**: Complete Part 2 fixes and re-run profiler

**Phase 4 can start**: Design and planning, but NOT implementation/tuning until Part 2 完成

---

**Status**: Part 1 complete (renamed metrics), Part 2 in progress
