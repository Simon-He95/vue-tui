# Agent Console production workload profile

## Final status

Balanced six-run A/B/C audit complete on the clean `harnessRef` recorded in the committed JSON, with one canonical production build, exact visual-index boundaries, and strict correctness/performance gates. Each variant appears once in every position across `ABC/ACB/BAC/BCA/CAB/CBA`.

Variants:

- **A:** copied/deep-reactive replay history + eager Markdown publication.
- **B:** shallow mutable replay backing + eager Markdown publication.
- **C:** shallow replay backing + lazy Markdown publication (final implementation).

The final implementation keeps both measured optimizations. It does not change Cell/text caches, TLogView architecture, long-text admission, renderer architecture, or virtual scrolling.

## Findings and decision

Replay copying was a real application hotspot. Lazy Markdown publication removed a second hidden hotspot: Log mode previously materialized `markdownSource.blocks` after every invisible Markdown delta.

| Workload                  | A median | B median | C median |       C vs A |
| ------------------------- | -------: | -------: | -------: | -----------: |
| CLI framed burst          | 1,500 ms | 1,295 ms |   519 ms | 65.4% faster |
| Browser framed burst      | 1,307 ms | 1,157 ms |   854 ms | 34.7% faster |
| CLI single-task burst     | 1,050 ms |   855 ms |   101 ms | 90.4% faster |
| Browser single-task burst |   909 ms |   740 ms |    54 ms | 94.1% faster |

In C's default Log burst, `mergeGroups` no longer dominates CPU samples. Markdown-visible work remains measured separately: large-history toggle median is 173 ms CLI / 122 ms browser, and steady Markdown streaming keeps the canonical 12 ms cadence. The first CLI Markdown toggle intentionally transfers bounded visible-use work from Log mode; the accepted policy is C/A <= 1.15 and C <= 200 ms. Browser search has a separate bounded policy of C/A <= 1.15 and C <= 120 ms. Both retain frame-p95 and long-frame non-regression gates. Content completeness and live block publication pass in every run.

No remaining evidence supports further runtime/cache changes. The performance initiative ends with C.

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
