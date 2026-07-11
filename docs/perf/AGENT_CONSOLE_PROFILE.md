# Agent Console real-workload profile

## Purpose

This profile establishes a repeatable baseline for the existing `examples/agent-console` application. It measures; it does not optimize. Raw frame samples are written below `.tmp/perf/agent-console/` and are not committed.

## Workloads

1. `tail-stream-steady`: seeded history, tail-following stream at the app's 12 ms cadence.
2. `tail-append-burst`: 1,000 events in batches of ten with asynchronous yield between batches.
3. `detached-append`: scroll roughly 200 visual rows away from the tail, append 1,000 events, and assert the viewport remains detached.
4. `search-large-history`: search `ERROR` across a large mixed ANSI/CJK/link history and wait for completion.
5. `stream-scroll-interaction`: append/stream while alternating scroll input, exercising mailbox coalescing and input responsiveness.

The harness validates final content/count state, bottom/detached state, search completion, and visible console chrome. A failed correctness condition invalidates the timing result.

## Metrics

Per scenario the summary reports frame count and p50/p95/p99/max for:

- frame duration
- render-manager duration
- commit duration
- DOM or stdout flush duration
- dirty rows
- scanned and painted nodes

It also reports coalesced invalidates/tasks, dropped updates, maximum queue depth, elapsed workload time, and scenario diagnostics.

The primary application-level signal is frame duration p95. Other metrics are diagnostic and should not independently motivate an optimization.

## Commands

```bash
pnpm run profile:agent-console:cli
pnpm run profile:agent-console:browser
pnpm run profile:agent-console
```

Use `scripts/summarize-agent-console-profile.ts` to regenerate summaries from raw JSON when needed. Chromium profiling uses the real browser and the built example, not happy-dom.

## Artifacts

```text
.tmp/perf/agent-console/
  cli/
    <scenario>.json
    all.json
  browser-raw.json
  summary.json
```

CI/manual workflows should upload this directory as an artifact when retaining a run. Do not commit raw frame samples.

## Initial baseline

Environment: macOS arm64, Node 24.18.0, headless Chromium. These numbers are a local baseline, not cross-machine release gates.

| Runtime  | Scenario                  | Frame p95 | Frame max | RAF interval p95 | Dropped/coalesced updates |
| -------- | ------------------------- | --------: | --------: | ---------------: | ------------------------: |
| CLI      | tail-stream-steady        |   1.82 ms |   5.36 ms |                — |                         0 |
| CLI      | tail-append-burst         |   2.51 ms |   3.06 ms |                — |                         0 |
| CLI      | detached-append           |   2.31 ms |   4.68 ms |                — |                         0 |
| CLI      | search-large-history      |   4.98 ms |   7.48 ms |                — |                         0 |
| CLI      | stream-scroll-interaction |   1.97 ms |   3.26 ms |                — |                         0 |
| Chromium | tail-stream-steady        |   1.30 ms |   1.50 ms |          9.60 ms |                         0 |
| Chromium | tail-append-burst         |   0.30 ms |   1.50 ms |         16.50 ms |                        99 |
| Chromium | detached-append           |   1.50 ms |   2.60 ms |          9.30 ms |                        99 |
| Chromium | search-large-history      |   1.40 ms |   3.40 ms |          9.10 ms |                         0 |
| Chromium | stream-scroll-interaction |   1.20 ms |   1.30 ms |          9.60 ms |                         0 |

The burst and detached browser workloads intentionally coalesce intermediate mailbox updates; correctness assertions verify final content and viewport state. One workload-local long task was observed in each of those two scenarios. No scenario currently demonstrates a repeatable frame-duration hotspot above the optimization threshold, so this profile does not justify cache, long-text, or virtual-scroll changes.

## Decision rule

After obtaining stable CLI and Chromium baselines:

- If frame p95 is within budget, memory remains stable, and no single subsystem dominates, stop the performance initiative.
- If a repeatable hotspot dominates, open one targeted PR using the same workload before/after.
- Do not tune Cell cache capacity, eviction, long-text admission, or virtual scrolling without that workload evidence.
