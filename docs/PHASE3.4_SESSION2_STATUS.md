# Phase 3.4 - Token Budget Exhausted Summary

**Session 2 Status**: Context limit reached  
**Last Commit**: 7b982af  
**Progress**: Step 3 partial - ESM ✅ CJS ❌

---

## ✅ Breakthrough: ESM Working!

**ESM builds now successfully strip instrumentation:**
- Rollup plugin in tsdown.config.mjs working correctly
- No-op stub being used in all ESM chunks
- Bundle size reduced (width chunk: 17.20 KB → 12.78 KB)

---

## ❌ Remaining Issue: CJS Still Has Instrumentation

**CJS builds still include full instrumentation:**
- esbuild plugin not intercepting imports
- Regex pattern may be wrong
- Need to debug plugin resolution

---

## Current Plugin Implementations

### Working (tsdown/rollup):
```js
const instrumentationStripPlugin = {
  name: "instrumentation-strip",
  resolveId(id, importer) {
    if (id.includes("/perf/instrumentation")) {
      return resolve(rootDir, "src/core/perf/instrumentation-noop.ts");
    }
    return null;
  },
};
```

### Not Working (esbuild):
```js
const instrumentationStripPlugin = {
  name: "instrumentation-strip",
  setup(build) {
    build.onResolve(
      { filter: /\/perf\/instrumentation(\.js|\.ts)?$/ },
      (args) => {
        return {
          path: resolve(rootDir, "src/core/perf/instrumentation-noop.ts"),
        };
      },
    );
  },
};
```

---

## Next Session TODO

1. **Fix esbuild plugin** - Debug why it's not catching imports
2. **Consider alternatives**:
   - Use rollup for CJS too
   - Manual path replacement
   - Different filter pattern
3. **Once CJS fixed**, verification should pass
4. **Continue Steps 4-7**

---

## Verification Results So Far

- ESM: ✅ Clean (no instrumentation found)
- CJS: ❌ Has instrumentation
- Type declarations: ⚠️ Contains .d.ts files (may be OK)

---

**Ready to continue in fresh session. ESM success proves approach works!**
