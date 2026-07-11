# Phase 3.4 Status - Session Ended Due to Token Limit

**Last Commit**: 469ceb2  
**Date**: 2026-07-11  
**Status**: 🚧 Step 3 In Progress - Technical Blocker

---

## ✅ Completed (Steps 1-2)

### Step 1: Build Configuration
- ✅ Added `__VUE_TUI_PERF_INSTRUMENTATION__` compile-time constant
- ✅ Updated tsdown.config.mjs with define
- ✅ Updated build-cjs.mjs with define

### Step 2: Hot-Path Guards
- ✅ buffer.ts: 12 Cell instrumentation calls guarded
- ✅ text.ts: 24 Text/Wrap instrumentation calls guarded
- ✅ grapheme.ts: 4 Grapheme instrumentation calls guarded
- ✅ Removed instrumentation-only parameters
- **Total**: 40 hot-path calls wrapped with `PERF_INSTRUMENTATION_COMPILED` guards

---

## 🚧 Step 3: In Progress - DCE Blocker

### Problem Discovered

**Compile-time guards alone insufficient**:
- Constants correctly set to `false` in builds
- But `if (false) { instr...() }` blocks NOT eliminated
- Full instrumentation module still imported and bundled
- Method names preserved even with minification

### Attempted Solutions

1. ✅ **Enable tree-shaking** - Not sufficient
2. ✅ **Enable minification** - Compresses but doesn't remove
3. ✅ **Created no-op stub** (`instrumentation-noop.ts`)
4. ⚠️ **Import replacement via alias** - Partial success

### Current Technical Blocker

**Bundler configuration mismatch**:
- **tsdown (rolldown)**: ESM builds, doesn't support relative path alias syntax
- **esbuild**: CJS builds, plugin working but ESM still has instrumentation
- Need unified approach that works for both bundlers

### Files Created

- `src/core/perf/instrumentation-noop.ts` - No-op stub
- `scripts/check-production-instrumentation-strip.mjs` - Verification script
- Marker added to instrumentation.ts

---

## 📋 Remaining Work

### Immediate (Step 3 completion)

1. **Fix bundler configuration**:
   - Either: Find alias syntax that works for both bundlers
   - Or: Use esbuild for all builds
   - Or: Custom rollup plugin for tsdown

2. **Verify production artifacts clean**

### After Step 3

4. **Step 4**: Built-dist A/B/C benchmarks (not started)
5. **Step 5**: Consumer bundle validation (not started)  
6. **Step 6**: Integration workload (not started)
7. **Step 7**: Documentation & results (not started)

---

## 🔍 Technical Details

### What Works

- Source mode (tsx, vitest): Full instrumentation available
- Compile-time constant correctly replaced
- Guards syntactically correct
- esbuild plugin functional for CJS

### What Doesn't Work

- ESM builds (tsdown/rolldown): Still include full instrumentation
- Dead-code elimination not triggered
- Tree-shaking doesn't remove guarded blocks

### Root Cause

Bundlers need explicit module replacement, not just conditional code.
Guards prevent *execution* but don't prevent *inclusion* in bundle.

---

## 💡 Recommended Next Steps

### Option A: Switch to esbuild for ESM

Replace tsdown with esbuild for all builds. esbuild plugin already works.

**Pros**: Unified config, proven to work  
**Cons**: Lose tsdown-specific features

### Option B: Custom Rolldown Plugin

Create rolldown plugin similar to esbuild one.

**Pros**: Keep tsdown  
**Cons**: Need to learn rolldown plugin API

### Option C: Build-time File Generation

Generate separate dist files with/without instrumentation.

**Pros**: No bundler tricks needed  
**Cons**: Complex build process

---

## 📊 Progress Summary

- **Steps completed**: 2/7 (29%)
- **Token usage**: ~165k (session limit reached)
- **Time invested**: ~4 hours
- **Technical complexity**: Higher than anticipated

---

## 🎯 For Next Session

1. **Decide on bundler strategy** (Option A/B/C above)
2. **Implement chosen solution**
3. **Verify builds clean**
4. **Continue with Steps 4-7**

The core work (guards, stub, verification) is complete. Only bundler configuration remains for Step 3.

---

**Session ended at token limit. Ready to continue in fresh session.**
