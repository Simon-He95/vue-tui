# Benchmark Result: 2026-05-25 Darwin arm64 Node 23.11.0

This is a non-release local sample collected outside the release matrix. It is kept to make the sample values in `docs/benchmarks.md` traceable, not to define the 1.0.0 release benchmark record.

| Field   | Value                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Date    | 2026-05-25                                                                                                                                 |
| Git SHA | `1b36fb4a3b80b8165aa09443f008604440e854f9`                                                                                                 |
| Package | `@simon_he/vue-tui@1.0.0-rc.0`                                                                                                             |
| Host    | `Darwin 23.5.0 arm64`                                                                                                                      |
| Node    | `v23.11.0`                                                                                                                                 |
| pnpm    | `10.33.4`                                                                                                                                  |
| Bun     | `1.3.13`                                                                                                                                   |
| DOM env | `happy-dom` synthetic benchmark                                                                                                            |

## Validation

`BENCH_TIMING=1 pnpm exec tsx scripts/check-bench-baselines.ts`

```txt
[bench:baseline] passed
```

## Raw Artifact

JSON: [2026-05-25-darwin-arm64-node23.11.0.json](./2026-05-25-darwin-arm64-node23.11.0.json)

## Sample Results

| Scenario                                  | Result                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| 1000 render nodes, dirty 1 row            | `durationMs = 0.361`, `dirtyRows = 1`, `scannedNodes = 1`, `paintedNodes = 1`       |
| `TVirtualList` 100k rows, wheel burst 100 | `frames = 1`, `maxFrameMs = 0.323`, `coalescingRatio = 100`, `avgScannedNodes = 1`  |
| DOM sync flush 20 dirty rows              | `dirtyRows = 20`, `domFlushMs = 0.218`                                              |
| `TLogView` 1000 lines burst               | `frames = 2`, `maxFrameMs = 0.486`, `getLineCalls = 20`, `dirtyRows = 10`           |
| `TLogView` long-line burst                | `frames = 2`, `maxFrameMs = 1.611`, `getLineCalls = 20`, `dirtyRows = 10`           |
| `TLogView` wrapped long-line burst        | `frames = 2`, `maxFrameMs = 0.439`, `getLineCalls = 1`, `dirtyRows = 10`            |
| `TLogView` retention 100k, max 1000       | `frames = 1`, `maxFrameMs = 0.444`, `retainedLineCount = 1000`, `getLineCalls = 20` |
| `TLogView` ANSI retention, max 1000       | `frames = 1`, `maxFrameMs = 2.622`, `retainedLineCount = 1000`, `getLineCalls = 20` |
| `TLogView` OSC8 links retained            | `frames = 1`, `maxFrameMs = 8.919`, `retainedLineCount = 1000`, `getLineCalls = 20` |
| `TLogView` retained search wrapped lines  | `matchCount = 2000`, `getLineCalls = 20000`, `maxFrameMs = 0.432`                   |
| `TLogView` exact index retention append   | `measuredLineCount = 1000`, `visualRowCount = 4000`, `maxFrameMs = 0.513`           |
| `TLogView Lab` smoke                      | `lineCount = 600`, `visibleLinks = 14`, `matchCount = 67`, `maxFrameMs = 16.196`    |

## DOM Renderer Cache Sample

| Scenario                        | Result                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Cache-hit plain rows            | `cacheHits = 100`, `secondFlushDurationMs = 0.599`                             |
| Changed plain rows              | `plainTextRows = 100`, `secondFlushDurationMs = 0.942`                         |
| Single styled row reuse         | `spansReused = 100`, `secondFlushDurationMs = 2.86`                            |
| Changed multi-segment row reuse | `segmentReuseRows = 100`, `spansReused = 200`, `secondFlushDurationMs = 8.304` |
| Mixed row-key prepass           | `rowKeyPrepassChecks = 100`, `cacheHits = 55`, `secondFlushDurationMs = 1.443` |

## Mailbox Sample

| Component      | Scenario     | Result                                                                        |
| -------------- | ------------ | ----------------------------------------------------------------------------- |
| `TList`        | wheel burst  | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |
| `TLogView`     | wheel burst  | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |
| `TLogView`     | append burst | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |
| `TVirtualList` | wheel burst  | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |
