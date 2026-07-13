# Agent Console production workload profile

## Final status

Balanced six-run A/B/C audit complete on the clean `measurementRef` recorded in the committed JSON, with one canonical production build, exact visual-index boundaries, and strict correctness/performance gates. Each variant appears twice in every ordinal position across all six permutations: `ABC/ACB/BAC/BCA/CAB/CBA`.

Variants:

- **A:** copied/deep-reactive replay history + eager Markdown publication.
- **B:** shallow mutable replay backing + eager Markdown publication.
- **C:** shallow replay backing + lazy Markdown publication (final implementation).

The final implementation keeps all three measured application-level optimizations. It does not change Cell/text caches, TLogView architecture, long-text admission, renderer architecture, or virtual scrolling.

## Findings and decision

Replay copying was a real application hotspot. Lazy Markdown publication removed a second hidden hotspot: Log mode previously materialized `markdownSource.blocks` after every invisible Markdown delta.

| Workload                  | A median | B median | C median |       C vs A |
| ------------------------- | -------: | -------: | -------: | -----------: |
| CLI framed burst          | 2,237 ms | 1,149 ms |   434 ms | 81.0% faster |
| Browser framed burst      | 1,961 ms | 1,080 ms |   856 ms | 56.3% faster |
| CLI single-task burst     | 1,928 ms |   745 ms |    82 ms | 95.6% faster |
| Browser single-task burst | 1,569 ms |   687 ms |    39 ms | 97.5% faster |

In C's default Log burst, `mergeGroups` no longer dominates CPU samples. Scenario-specific preludes occur before counters reset and timing starts. Visible Markdown publication is frame-coalesced, and Markdown steady is included in CPU diagnostics. The canonical synthetic producer target is 64 ms; the product stream default remains 12 ms and is covered separately: C producer median is 25.601 s CLI (interval p95 65.7 ms, 18 median misses, 114.9 ms max lateness) and 25.600 s Browser (65.6 ms, 0 misses, 3.0 ms lateness), all run-level medians within absolute budgets; per-run maxima remain diagnostic. Formal benefits use the inner workload `totalElapsedMs`, paired by round; Playwright controller time remains diagnostic only. `validate:agent-console:abc` is the complete raw gate for cadence, paired frame/latency, Long Tasks, CPU artifacts, correctness and provenance. `check:agent-console-profile-baseline` is intentionally the cheap committed provenance/summary consistency checker.

For the canonical Agent Console workload measured here, no evidence justifies changing core Cell/text/wrap/provider caches, renderer architecture, long-text admission, or virtual scrolling. The current initiative closes with those areas unchanged.

## Canonical workloads

All CLI and Browser runners use the same validated config: seed 6,000; append 1,000; steady 400; cadence 64 ms; batch size 10; six paired runs.

1. `tail-stream-steady`
2. `tail-append-burst-framed`
3. `tail-append-burst-single-task`
4. `detached-append`
5. `search-large-history`
6. `stream-scroll-interaction`
7. `markdown-toggle-large-history`
8. `markdown-append-burst-framed`
9. `markdown-stream-steady`

Synthetic append indices use an explicit post-seed cursor. Prepared and final visual indices must be `exact`. Detached append compares the complete visible viewport. The concurrent interaction workload records at least 100 fully correlated wheel samples per run; every recorded sample changes scrollTop, matches a `reason: scroll` frame, and—on Browser—matches a subsequent DOM flush. It drives wheel input independently at 16 ms while the synthetic producer runs at 64 ms and repeatedly reverses direction.

## Production and diagnostics

- CLI loads built package exports in a fresh Node child for each run.
- Browser uses a Vite production build and the Vite preview JS API, with a fresh BrowserContext/Page per run and deterministic shutdown.
- CPU diagnostics are separately collected for typed registered scenarios; every expected `.cpuprofile` and hotspot summary is validated.
- CPU shares use all sampled time as the denominator (`shareOfAllSamples`); top-N-relative share is separately named.
- Memory values are explicitly marked `includesProfilerBuffers: true` and are diagnostic only, not clean retained-app evidence.
- Browser Long Task collection drains `takeRecords()` before disconnect.
- Environment, commit/dirty state, artifact hashes, corpus, correctness, frames, DOM/stdout, latency, memory, and CPU summaries are retained for A/B/C.
- CPU URLs in committed evidence are normalized to `<repo>/...`.

## Evidence and commands

The complete machine-readable summary is [`agent-console-profile-baseline.json`](./agent-console-profile-baseline.json). Raw frames and CPU profiles remain workflow artifacts.

```bash
pnpm run profile:agent-console:smoke
pnpm run profile:agent-console
pnpm run profile:agent-console:abc
pnpm run validate:agent-console:abc
pnpm run profile:agent-console:record
pnpm run check:agent-console-profile-baseline
```

The validator requires six passing runs, clean provenance, non-empty artifact hashes and CPU diagnostics, identical canonical corpus/config, exact prepared/final indices, and fully correlated input samples.
