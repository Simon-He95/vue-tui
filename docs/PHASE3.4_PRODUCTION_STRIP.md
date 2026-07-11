# Phase 3.4: Production Instrumentation Isolation

**Status**: ✅ Implementation and built-dist runtime validation complete  
**Issue**: #119  
**PR**: #122

## Result

Standard ESM and CJS builds compile out all Cell, Text/Wrap, and Grapheme instrumentation hot-path dispatches. Source-mode profiling through Vitest/tsx remains available.

## Structural evidence

`pnpm run check:production-instrumentation-strip` reads first-build metafiles emitted by tsdown/Rolldown and esbuild. It requires both modules to contribute zero output bytes:

- `src/core/perf/instrumentation.ts`: 0 bytes
- `src/core/perf/instrumentation-noop.ts`: 0 bytes

The same command runs a build-level control:

- B-style instrumentation-enabled build: real collector contributes 9,090 bytes and the control fails.
- C-style stripped build: real collector and no-op stub contribute 0 bytes and the control passes.

Missing ESM or CJS metafiles are hard failures.

## Built-dist A/B/C runtime evidence

`scripts/validate-built-dist-abc.ts` uses isolated worktrees and actual built `dist/vue.js`, `dist/core.js`, `dist/vue.cjs`, and `dist/core.cjs` artifacts:

- A: `697472b0cc5c000fb46baf16e85c60d84ee22471`
- B: `4d543ff7042f9c2400fa50a9dff921a0f36f77a3`
- C: PR implementation commit

Each measurement runs in a fresh Node child process. All six A/B/C permutations are used, timed batches calibrate toward 3 ms, and the primary C/A gate is the seeded bootstrap 95% CI of paired p50 ratios with upper bound `<= 1.05`.

All twelve ESM/CJS gates passed. The widest passing upper bound was `1.0462` for ESM terminal write.

Detailed raw observations and analysis: `docs/perf/phase3.4-built-dist-abc.json`.

## Permanent release gates

`release:check` runs, after `build:checked`:

1. `check:production-instrumentation-strip`
2. `check:consumer-bundle`

The packed consumer A/B/C validator compares the same core, text utility, and Vue component fixtures from independently packed A/B/C worktrees, reports minified/raw/gzip/brotli sizes and module closure, and enforces the registered size gates.

## Source-mode correctness

The existing instrumentation API and tests continue to use the real collector when source files are loaded directly. Production stripping is deterministic and does not depend on environment variables.

## Non-goals

This work does not change Cell cache capacity, eviction, long-text admission, provider caches, or virtual scrolling. Future optimization remains dependent on a real application workload profile.
