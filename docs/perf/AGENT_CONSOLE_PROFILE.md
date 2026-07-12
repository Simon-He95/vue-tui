# Agent Console production workload profile

## Final status

Balanced six-run A/B/C audit complete on the clean `measurementRef` recorded in the committed JSON, with one canonical production build, exact visual-index boundaries, and strict correctness/performance gates. Each variant appears once in every position across `ABC/ACB/BAC/BCA/CAB/CBA`.

Variants:

- **A:** copied/deep-reactive replay history + eager Markdown publication.
- **B:** shallow mutable replay backing + eager Markdown publication.
- **C:** shallow replay backing + lazy Markdown publication (final implementation).

The final implementation keeps both measured optimizations. It does not change Cell/text caches, TLogView architecture, long-text admission, renderer architecture, or virtual scrolling.

## Findings and decision

Replay copying was a real application hotspot. Lazy Markdown publication removed a second hidden hotspot: Log mode previously materialized `markdownSource.blocks` after every invisible Markdown delta.

| Workload                  | A median | B median | C median |       C vs A |
| ------------------------- | -------: | -------: | -------: | -----------: |
| CLI framed burst          | 2,692 ms | 1,229 ms |   478 ms | 81.7% faster |
| Browser framed burst      | 2,050 ms | 1,126 ms |   855 ms | 57.0% faster |
| CLI single-task burst     | 2,164 ms |   795 ms |    87 ms | 95.9% faster |
| Browser single-task burst | 1,669 ms |   703 ms |    38 ms | 96.7% faster |

In C's default Log burst, `mergeGroups` no longer dominates CPU samples. Scenario-specific preludes now occur before counters reset and timing starts: detached timing contains append work only, and Markdown steady excludes first-toggle materialization. Markdown steady reports producer/action/settle separately. With a 12 ms target, C's producer median is 8.90 s CLI (append interval p95 26.1 ms) and 6.90 s Browser (19.3 ms); it does not sustain 12 ms under visible Markdown rendering, but it improves materially over A and passes the predeclared paired producer/deadline non-regression gates. First Markdown toggle is 138 ms CLI / 123 ms Browser; paired C/A medians are +4.5% / +2.4%. Search is +1.9% / +3.2%. Non-target decisions require paired median <=1.10 and bootstrap upper <=1.15; toggle additionally requires <=200 ms and <=1.15. Frame p95 uses a ratio gate with a 1 ms absolute tolerance for sub-frame quantization, and paired Browser Long Task totals are gated. Formal benefits use paired per-round medians and CIs; absolute A/B/C medians are shown for readability.

For the canonical Agent Console workload measured here, no evidence justifies changing core Cell/text/wrap/provider caches, renderer architecture, long-text admission, or virtual scrolling. The current initiative closes with those areas unchanged.

## Canonical workloads

All CLI and Browser runners use the same validated config: seed 6,000; append 1,000; steady 400; cadence 12 ms; batch size 10; six paired runs.

1. `tail-stream-steady`
2. `tail-append-burst-framed`
3. `tail-append-burst-single-task`
4. `detached-append`
5. `search-large-history`
6. `stream-scroll-interaction`
7. `markdown-toggle-large-history`
8. `markdown-stream-steady`

Synthetic append indices use an explicit post-seed cursor. Prepared and final visual indices must be `exact`. Detached append compares the complete visible viewport. Every wheel sample must change scrollTop, match a `reason: scroll` frame, and—on Browser—match a subsequent DOM flush.

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
