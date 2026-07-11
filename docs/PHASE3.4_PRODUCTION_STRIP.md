# Phase 3.4: Production Instrumentation Isolation - Implementation Plan

**Status**: 🚧 In Progress  
**Issue**: Refs #119  
**Type**: Performance remediation (required)

---

## Objective

Remove debug performance instrumentation from standard ESM/CJS production bundles through compile-time dead-code elimination, while preserving source-mode profiling capability.

---

## Current Progress

### ✅ Completed

1. **Build Configuration** (Commit d024498)
   - Added `src/perf-build-globals.d.ts` with compile-time constant declaration
   - Updated `tsdown.config.mjs` with production define
   - Updated `scripts/build-cjs.mjs` with production define

### 🚧 In Progress

2. **Hot-Path Modifications** (Next)
   - Add compile-time guards to all instrumentation calls
   - Restore production code shape (remove instrumentation-only parameters)

### ⏳ Pending

3. **Production Artifact Verification**
4. **Built-Dist A/B/C Benchmarks**
5. **Consumer Bundle Validation**
6. **Documentation & Results**

---

## Remaining Implementation

### Step 2: Hot-Path Modifications

**Files to modify**:

- `src/core/buffer/buffer.ts`
- `src/vue/utils/text.ts`
- `src/utils/grapheme.ts`

**Pattern**:
\`\`\`typescript
// Define at module top
const PERF_INSTRUMENTATION_COMPILED =
typeof **VUE_TUI_PERF_INSTRUMENTATION** === "undefined"
? true
: **VUE_TUI_PERF_INSTRUMENTATION**;

// Guard all instrumentation calls
if (PERF_INSTRUMENTATION_COMPILED && isInstrumentationEnabled()) {
textInstr.recordTextCellWidthCall(text.length, true);
}

// Or for unconditional dispatches
if (PERF_INSTRUMENTATION_COMPILED) {
textInstr.recordWrapByCellsCall();
}
\`\`\`

**Special attention**:

- Remove `width` parameter from `getOrCreateCellCache()` (instrumentation-only)
- Restore production function signatures

### Step 3: Production Artifact Verification

**New file**: `scripts/check-production-instrumentation-strip.mjs`

**Checks**:

- No `recordTextCellWidthCall` etc. in dist files
- No `instrumentationEnabled` in dist files
- No separate instrumentation chunks
- Exit 1 on failure

**Integration**: Add to `release:check` and CI

### Step 4: Built-Dist A/B/C Benchmarks

**New file**: `scripts/bench-instrumentation-overhead-dist.ts`

**Versions**:

- A = 697472b0 (pre-Phase-3)
- B = 4d543ff7 (current instrumentation)
- C = current PR HEAD (compile-time strip)

**Method**:

- Load built `dist/core.js`, `dist/vue.js`, `dist/core.cjs`, `dist/vue.cjs`
- Balanced 3-version ordering (ABC, BCA, CAB, etc.)
- Auto-calibrate sample batches to 2-5ms
- Test both ESM and CJS

**Gates**:

- C/A: p50 CI upper <= 1.05 (non-inferiority)
- C/B: Should show clear improvement
- No INCONCLUSIVE accepted

### Step 5: Consumer Bundle Validation

**New file**: `scripts/bench-consumer-bundle.ts`

**Fixtures**:

1. Core: `import { createTerminal } from "@simon_he/vue-tui/core"`
2. Text utils: `import { textCellWidth, wrapByCells } from "@simon_he/vue-tui/vue"`
3. Components: `import { TerminalProvider, TText } from "@simon_he/vue-tui/vue"`

**Verification**:

- esbuild with tree-shaking, minify, metafile
- Assert no instrumentation in closure
- C/A <= +2KB gzip
- npm pack tarball size (informational)

---

## Acceptance Criteria

### Production Artifacts ✅

- [ ] dist ESM excludes instrumentation collector
- [ ] dist CJS excludes instrumentation collector
- [ ] No instrumentation-related strings in dist files
- [ ] Verification script passes

### Source-Mode Profiler ✅

- [ ] test/instrumentation.test.ts passes
- [ ] pnpm run bench:profiler works
- [ ] enable/disable/reset/getMetrics unchanged

### Runtime Performance ✅

- [ ] C/A all scenarios PASS (ESM + CJS)
- [ ] p50 CI upper <= 1.05
- [ ] No INCONCLUSIVE results

### Bundle Impact ✅

- [ ] Consumer bundles exclude instrumentation
- [ ] C/A <= +2KB gzip
- [ ] C <= B (improvement over current)

### Functional Correctness ✅

- [ ] All tests pass
- [ ] CI green (typecheck, lint, format, build, e2e)

---

## Issue Closure Rule

**PR changes to `Closes #119` only when**:

- All acceptance criteria met
- Built ESM/CJS validation passes
- Consumer bundle validation passes
- No results remain inconclusive

If validation fails, options:

1. Further optimize code structure
2. Use profiling-only build variant
3. Consider Phase 3 rollback

---

## Estimated Timeline

- ✅ Step 1: Build config (Complete)
- 🚧 Step 2: Hot-path mods (2-3 hours)
- ⏳ Step 3: Verification script (30 min)
- ⏳ Step 4: Built-dist benchmark (2-3 hours)
- ⏳ Step 5: Consumer bundle (1-2 hours)
- ⏳ Step 6: Documentation (1 hour)

**Total**: ~8-12 hours implementation + validation time

---

## References

- Issue: #119 (reopened after initial INCONCLUSIVE)
- Initial results: PR #121 (merged)
- Detailed review recommendations: review-final.md (pasted-text)

---

**Phase 3.4 implementation in progress. Build configuration complete.**
