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
| CLI framed burst          | 2,158 ms | 1,080 ms |   410 ms | 80.9% faster |
| Browser framed burst      | 1,875 ms | 1,056 ms |   858 ms | 54.2% faster |
| CLI single-task burst     | 1,776 ms |   737 ms |    76 ms | 95.7% faster |
| Browser single-task burst | 1,526 ms |   663 ms |    36 ms | 97.7% faster |

In C's default Log burst, `mergeGroups` no longer dominates CPU samples. Scenario-specific preludes occur before counters reset and timing starts. Visible Markdown publication is rate-limited to a 32 ms minimum interval through one timer and one fixed-id low-priority frame task; mode exit and disposal cancel both stages. The controlled synthetic producer remains at 64 ms. Three separate product scenarios execute the real `startStream()` / `stopStream()` 12 ms timer for fixed tick counts. Formal benefits use the inner workload `totalElapsedMs`, paired by round; Playwright controller time remains diagnostic only. `validate:agent-console:abc` gates cadence, frames, interaction latency, Long Tasks, DOM/stdout amplification, CPU artifacts, correctness, and provenance. The committed schema-5 baseline retains paired frame, long-frame, Long Task, latency, and amplification evidence for independent checking.

For the canonical Agent Console workload measured here, no evidence justifies changing core Cell/text/wrap/provider caches, renderer architecture, long-text admission, or virtual scrolling. The current initiative closes with those areas unchanged.

## Canonical workloads

All CLI and Browser runners use the same validated config: seed 6,000; append 1,000; steady 400; cadence 64 ms; batch size 10; six paired runs.

Controlled synthetic application workloads:

1. `tail-stream-steady`
2. `tail-append-burst-framed`
3. `tail-append-burst-single-task`
4. `detached-append`
5. `search-large-history`
6. `stream-scroll-interaction`
7. `markdown-toggle-large-history`
8. `markdown-stream-steady`

Real product-timer workloads:

9. `product-tail-stream-12ms`
10. `product-markdown-stream-12ms`
11. `product-stream-scroll-interaction-12ms`

Controller diagnostic (not represented as a complete application workload):

12. `markdown-publication-burst-diagnostic`

Synthetic append indices use an explicit post-seed cursor. Product scenarios call `startStream()` and `stopStream()`, verify the 12 ms product default, stop after exactly 400 timer ticks, preserve input, and account for the connected/paused status events. Prepared and final visual indices must be `exact`; the product Markdown scenario also verifies that the final paused marker was published. Detached append compares the complete visible viewport. Both concurrent interaction workloads record at least 100 fully correlated wheel samples per run; every recorded sample changes scrollTop, matches a `reason: scroll` frame, and—on Browser—matches a subsequent DOM flush. Wheel input runs independently at 16 ms and repeatedly reverses direction.

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
