# Agent Console production workload profile

## Status and decision

Decision-grade baseline complete. The profiler runs production artifacts, five fresh runs per runtime/scenario, and records frame, renderer/stdout, CPU, memory, retention, and input-latency evidence.

The corrected CPU profile identified one application-level hotspot: `eventLog.value = [...eventLog.value, event]` repeatedly copied and deeply proxied the complete replay history. This PR replaces it with a shallow ref over a mutable backing array while preserving replay API behavior. On the same five-run CLI framed-burst workload, median elapsed time fell from 2,944 ms to 1,595 ms (about 46%), deep Vue reactivity frames disappeared from the top CPU samples, and median retained heap growth fell by roughly 3%. Frame p95 remained low and correctness passed.

No remaining evidence supports changes to Cell cache capacity/eviction, text/wrap caches, renderer architecture, long-text admission, or virtual scrolling. This closes the current performance initiative after the contained Agent Console optimization.

## Production runtimes

- CLI: root `build:checked`, package export `@simon_he/vue-tui/cli`, one fresh Node child per run, `--expose-gc`, real stdout renderer with counting sink.
- Browser: root `build:checked`, Agent Console Vite production build with dist aliases, `vite preview`, real Chromium, one fresh BrowserContext/Page per run.
- Every artifact records commit/dirty state, Node/V8, browser, OS/CPU, and SHA-256 artifact hashes.

## Shared workloads

1. `tail-stream-steady`: 12 ms production cadence at the tail.
2. `tail-append-burst-framed`: 1,000 events in batches of ten, yielding a real task and frame between batches.
3. `tail-append-burst-single-task`: 1,000 synchronous appends; blocking stress measured by elapsed/Long Task rather than FramePerf alone.
4. `detached-append`: exact scrollTop, first-line index, and visible anchor preservation while appending.
5. `search-large-history`: completed `ERROR` search over the retained history.
6. `stream-scroll-interaction`: streaming plus wheel input with input-to-paint samples.

Synthetic indices continue monotonically after the seed corpus. Results include corpus version, seed, append start, final replay/line counts, first line index, and correctness assertions.

## Metrics and artifacts

FramePerf p50/p95/p99/max, actual DOM flush/row-render diagnostics, stdout writes/bytes/cursor movement, RAF intervals, Long Tasks, input-to-paint, process/browser heap, retention metadata, and sampled CPU self time are recorded. Full mode uses five independent runs and reports run-level median/min/max/range/CV. Smoke mode uses one reduced run.

Raw JSON and `.cpuprofile` files stay under `.tmp/perf/agent-console/` and are uploaded by CI; they are not committed. The summarizer writes `.tmp/perf/agent-console/summary.json`.

```bash
pnpm run profile:agent-console:smoke
pnpm run profile:agent-console
pnpm run profile:agent-console:summarize
```

## Final five-run frame baseline

Local environment: macOS arm64, Node 24.18.0, production package/example, headless Chromium. Values are machine-local evidence, not release gates.

| Runtime  | Scenario                      | Frame p95 median | Five-run range |   CV |
| -------- | ----------------------------- | ---------------: | -------------: | ---: |
| CLI      | tail-stream-steady            |          2.39 ms |      2.31–3.01 | 0.10 |
| CLI      | tail-append-burst-framed      |          2.67 ms |      2.43–2.86 | 0.06 |
| CLI      | tail-append-burst-single-task |          0.31 ms |      0.25–0.70 | 0.44 |
| CLI      | detached-append               |          2.33 ms |      2.00–2.47 | 0.08 |
| CLI      | search-large-history          |          3.47 ms |      3.27–3.53 | 0.03 |
| CLI      | stream-scroll-interaction     |          2.45 ms |      2.28–2.64 | 0.06 |
| Chromium | tail-stream-steady            |          0.90 ms |      0.80–0.90 | 0.06 |
| Chromium | tail-append-burst-framed      |          1.00 ms |      1.00–1.10 | 0.05 |
| Chromium | tail-append-burst-single-task |          1.10 ms |      1.10–1.20 | 0.04 |
| Chromium | detached-append               |          0.90 ms |      0.90–0.90 | 0.00 |
| Chromium | search-large-history          |          1.00 ms |      0.90–1.20 | 0.10 |
| Chromium | stream-scroll-interaction     |          1.00 ms |      0.90–1.00 | 0.04 |

The single-task FramePerf values exclude the synchronous blocking interval by design; its elapsed time, Long Task, CPU, and memory fields are authoritative for that stress scenario.
