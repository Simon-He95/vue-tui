# Benchmarks

这页记录 vue-tui 当前公开 benchmark 口径。它用于 1.0 release quality bar 和后续回归对比，不用于宣称对 `@opentui/solid` 或其他 TUI renderer 的横向性能优势。

## Scope

当前 benchmark 覆盖的是 vue-tui 自身的可复现回归指标：

- dirty rows、scanned nodes、painted nodes
- frame task coalescing、dropped updates、commit count
- DOM renderer cache hit、span reuse、segment reuse
- `TVirtualList` wheel burst
- `TLogView` append、retention、wrap、ANSI、OSC8 links、search、exact visual index

当前 benchmark 不覆盖：

- 真实 terminal emulator input-to-paint latency
- 长时间 streaming 后的 GC heap 曲线
- stdout bytes per frame
- 与 `@opentui/solid` 的同机器、同 terminal、同场景横向结果

这些缺口必须在 release notes 中明确说明，不能用现有 baseline 推导出 raw throughput 或竞品性能结论。

## Reproduce

```bash
pnpm run bench:dom-renderer
pnpm run bench:scroll-mailbox
pnpm run bench:phase2
pnpm run bench:baseline
pnpm run bench:baseline:timing
```

`bench:baseline` 是 release gate，默认只检查行为预算。`bench:baseline:timing` 会额外检查 timing budget，适合本地 release review 或 nightly，不作为默认 CI blocker。

## Environment

Latest recorded local run:

| Field   | Value                                                                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date    | 2026-05-25                                                                                                                                                                                                |
| Package | `@simon_he/vue-tui@1.0.0-rc.0`                                                                                                                                                                            |
| Host    | Darwin arm64, `Darwin Kernel Version 23.5.0`                                                                                                                                                              |
| Node    | `v23.11.0`                                                                                                                                                                                                |
| pnpm    | `10.33.4`                                                                                                                                                                                                 |
| Bun     | `1.3.13`                                                                                                                                                                                                  |
| DOM env | `happy-dom` synthetic benchmark                                                                                                                                                                           |
| Note    | This sample was collected outside the release matrix. Stable release notes should use Node 20 or another runtime-matrix Node version, and record the exact release machine, tarball digest, and run URLs. |

## Release Gate Budgets

These budgets come from `scripts/bench-baselines.json`.

| Scenario                                    | Budget                                                                                 | Release gate     |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| 1000 render nodes, dirty 1 row              | `dirtyRows = 1`, `scannedNodes = 1`, `paintedNodes = 1`                                | yes              |
| 1000 render nodes, dirty 1 row timing       | `durationMs <= 10`                                                                     | manual / nightly |
| `TVirtualList` 100k rows, wheel burst 100   | `frames = 1`, `coalescingRatio >= 100`, `avgScannedNodes <= 1`, `avgPaintedNodes <= 1` | yes              |
| `TVirtualList` 100k rows timing             | `maxFrameMs <= 5`                                                                      | manual / nightly |
| DOM sync flush 20 dirty rows                | `dirtyRows = 20`                                                                       | yes              |
| DOM sync flush 20 dirty rows timing         | `domFlushMs <= 10`                                                                     | manual / nightly |
| `TLogView` 1000 lines burst                 | `frames <= 2`, `getLineCalls <= 30`, `dirtyRows <= 10`, `domFlushRows <= 20`           | yes              |
| `TLogView` 1000 lines burst timing          | `maxFrameMs <= 10`                                                                     | manual / nightly |
| `TLogView` retention 100k, max 1000         | `retainedLineCount = 1000`, `getLineCalls <= 30`                                       | yes              |
| `TLogView` retention timing                 | `maxFrameMs <= 10`                                                                     | manual / nightly |
| `TLogView` retained search, wrapped lines   | `matchCount = 2000`, `getLineCalls <= 25000`                                           | yes              |
| `TLogView` retained search timing           | `maxFrameMs <= 10`                                                                     | manual / nightly |
| `TLogView` exact index retention append     | `measuredLineCount = 1000`                                                             | yes              |
| `TList` / `TLogView` / `TVirtualList` burst | `frameTaskCount = 1`, `droppedUpdates >= 999`, `dirtyRows <= 20`, `commits = 1`        | yes              |

## Latest Sample Results

Timing values below are examples from the local run above. Treat them as context, not as portable guarantees across machines.

| Scenario                                  | Result                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| 1000 render nodes, dirty 1 row            | `durationMs = 0.42`, `dirtyRows = 1`, `scannedNodes = 1`, `paintedNodes = 1`        |
| `TVirtualList` 100k rows, wheel burst 100 | `frames = 1`, `maxFrameMs = 0.326`, `coalescingRatio = 100`, `avgScannedNodes = 1`  |
| DOM sync flush 20 dirty rows              | `dirtyRows = 20`, `domFlushMs = 0.252`                                              |
| `TLogView` 1000 lines burst               | `frames = 2`, `maxFrameMs = 0.45`, `getLineCalls = 20`, `dirtyRows = 10`            |
| `TLogView` long-line burst                | `frames = 2`, `maxFrameMs = 1.877`, `getLineCalls = 20`, `dirtyRows = 10`           |
| `TLogView` wrapped long-line burst        | `frames = 2`, `maxFrameMs = 0.463`, `getLineCalls = 1`, `dirtyRows = 10`            |
| `TLogView` retention 100k, max 1000       | `frames = 1`, `maxFrameMs = 0.457`, `retainedLineCount = 1000`, `getLineCalls = 20` |
| `TLogView` ANSI retention, max 1000       | `frames = 1`, `maxFrameMs = 3.253`, `retainedLineCount = 1000`, `getLineCalls = 20` |
| `TLogView` OSC8 links retained            | `frames = 1`, `maxFrameMs = 7.964`, `retainedLineCount = 1000`, `getLineCalls = 20` |
| `TLogView` retained search wrapped lines  | `matchCount = 2000`, `getLineCalls = 20000`, `maxFrameMs = 2.449`                   |
| `TLogView` exact index retention append   | `measuredLineCount = 1000`, `visualRowCount = 4000`, `maxFrameMs = 0.6`             |
| `TLogView Lab` smoke                      | `lineCount = 600`, `visibleLinks = 14`, `matchCount = 67`, `maxFrameMs = 16.042`    |

## DOM Renderer Cache Sample

| Scenario                        | Result                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Cache-hit plain rows            | `cacheHits = 100`, `secondFlushDurationMs = 0.884`                             |
| Changed plain rows              | `plainTextRows = 100`, `secondFlushDurationMs = 0.592`                         |
| Single styled row reuse         | `spansReused = 100`, `secondFlushDurationMs = 2.961`                           |
| Changed multi-segment row reuse | `segmentReuseRows = 100`, `spansReused = 200`, `secondFlushDurationMs = 7.920` |
| Mixed row-key prepass           | `rowKeyPrepassChecks = 100`, `cacheHits = 55`, `secondFlushDurationMs = 1.597` |

## Mailbox Sample

| Component      | Scenario     | Result                                                                        |
| -------------- | ------------ | ----------------------------------------------------------------------------- |
| `TList`        | wheel burst  | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |
| `TLogView`     | wheel burst  | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |
| `TLogView`     | append burst | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |
| `TVirtualList` | wheel burst  | `frameTaskCount = 1`, `droppedUpdates = 999`, `dirtyRows = 20`, `commits = 1` |

## User-Perceived Metrics Still Needed

The next benchmark report should add real terminal/browser runs for:

| Metric              | Target                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| input-to-paint p95  | Small chrome/input updates at 80x24 and 120x40, with p95 and p99 latency                        |
| long streaming heap | 100k line append with retention, GC-after-run heap, and no sustained growth across repeated run |
| stdout bytes/frame  | ANSI bytes written per frame for scroll, input, and append scenarios                            |

These should be measured before using performance claims in external comparison copy.

## `@opentui/solid` Comparison Status

There is no professional same-scenario comparison yet.

OpenTUI's public docs describe OpenTUI as a native Zig terminal UI core with TypeScript bindings and currently Bun-first installation. The `@opentui/solid` npm page describes Solid.js support for OpenTUI, and the OpenTUI renderer docs say `createCliRenderer()` loads the native Zig rendering library.

That means the credible comparison today is product fit, not raw speed:

| Dimension      | vue-tui                                                                 | `@opentui/solid`                                       |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Framework      | Vue 3 components and Vue reactivity                                     | Solid JSX binding                                      |
| Runtime target | Node runtime package target plus browser DOM, CLI stdout, and headless  | Bun-first OpenTUI terminal app path                    |
| Renderer route | JS terminal buffer with DOM renderer, stdout renderer, and headless use | OpenTUI native Zig renderer through TypeScript binding |
| Strong story   | Vue, browser-hosted terminal, Node/Vite install, logs/markdown/agent UI | Solid JSX plus native OpenTUI terminal rendering       |
| Claim to avoid | Do not claim faster raw renderer throughput without same-scenario data  | Not applicable                                         |

If vue-tui compares against `@opentui/solid`, use the same machine, same terminal, same viewport, same runtime constraints, and application-level scenarios. The full comparison protocol lives in [Compare With OpenTUI Solid](/compare-opentui-solid).

| Scenario                   | Metrics                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 100k virtual list scroll   | cold start, first paint, 100 scroll events total, p95 input-to-paint, frames, stdout bytes, heap delta, CPU  |
| streaming log / transcript | append throughput, p95/p99 frame time, render calls per visible frame, heap after retention, detached scroll |
| agent console              | markdown update p95, input typing p95, overlay open/close p95, stdout bytes/frame, dropped frames over 60s   |
| browser-hosted terminal    | vue-tui-only DOM renderer data: first render, dirty row flush, cache-hit flush, Vite import, SSR import      |
