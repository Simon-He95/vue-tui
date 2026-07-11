# Agent Console production workload profile

## Status and decision

Decision-grade baseline complete. The profiler runs production artifacts, five fresh runs per runtime/scenario, and records frame, renderer/stdout, CPU, memory, retention, and input-latency evidence.

The corrected CPU profile identified one application-level hotspot: `eventLog.value = [...eventLog.value, event]` repeatedly copied and deeply proxied the complete replay history. This PR replaces it with a shallow ref over a mutable backing array while preserving replay API behavior. Using exact corrected-harness commits (`dc02b03` before, `e481e1c` after), the same five-run CLI framed-burst median fell from 2,358 ms to 1,202 ms (49.0%). Deep Vue reactivity samples disappeared from the top CPU functions. Frame, correctness, memory, DOM/stdout, and latency evidence is recorded in the generated schema-v2 audit; raw CPU profiles remain workflow artifacts.

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
| CLI      | tail-stream-steady            |          1.89 ms |      1.86–2.01 | 0.03 |
| CLI      | tail-append-burst-framed      |          2.46 ms |      2.00–2.65 | 0.11 |
| CLI      | tail-append-burst-single-task |          0.31 ms |      0.28–0.41 | 0.14 |
| CLI      | detached-append               |          2.22 ms |      1.85–2.40 | 0.10 |
| CLI      | search-large-history          |          3.46 ms |      3.16–4.79 | 0.17 |
| CLI      | stream-scroll-interaction     |          2.06 ms |      1.86–2.71 | 0.15 |
| Chromium | tail-stream-steady            |          0.80 ms |      0.80–0.90 | 0.05 |
| Chromium | tail-append-burst-framed      |          1.00 ms |      0.90–1.00 | 0.05 |
| Chromium | tail-append-burst-single-task |          0.30 ms |      0.30–0.60 | 0.31 |
| Chromium | detached-append               |          0.90 ms |      0.80–0.90 | 0.05 |
| Chromium | search-large-history          |          0.90 ms |      0.90–0.90 | 0.00 |
| Chromium | stream-scroll-interaction     |          0.80 ms |      0.80–0.90 | 0.05 |

The single-task FramePerf values exclude the synchronous blocking interval by design; its elapsed time, Long Task, CPU, and memory fields are authoritative for that stress scenario. Timing runs do not enable CPU or the extra TUI profiler; CPU attribution comes from separate diagnostic runs. Browser wheel input travels through native `WheelEvent` and the terminal EventManager: commit latency p95 was 8.7 ms, DOM-flush latency p95 was 17.1 ms, and the documented post-flush paint-opportunity upper bound p95 was 23.9 ms, with non-empty samples and all correctness checks passing.
