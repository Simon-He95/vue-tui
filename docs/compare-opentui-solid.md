---
title: Vue TUI vs OpenTUI Solid
description: Compare Vue TUI with OpenTUI Solid by product fit, runtime target, browser DOM support, CLI rendering path, and benchmark claim boundaries.
---

# Compare With OpenTUI Solid

This page defines how vue-tui can compare itself with `@opentui/solid` without overstating the current data.

## Current Status

As of 2026-05-25, vue-tui does not have a same-machine, same-terminal, same-scenario benchmark report against `@opentui/solid`.

Allowed public claim:

> vue-tui has internal regression budgets for dirty rows, renderer work, mailbox coalescing, DOM flushing, retained logs, search, and markdown/log/agent UI scenarios.

Not allowed without a completed comparison report:

- vue-tui is faster than OpenTUI.
- vue-tui is faster than `@opentui/solid`.
- vue-tui has native-level rendering performance.
- vue-tui is more production-proven than OpenTUI.

## Source Facts

These facts are useful for positioning, not for performance conclusions:

| Source                                                                  | Fact used in comparison                                                                                   | Verified   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| [OpenTUI Getting Started](https://opentui.com/docs/getting-started/)    | OpenTUI describes itself as a native Zig terminal UI core with TypeScript bindings and Bun-first install. | 2026-05-25 |
| [OpenTUI Renderer](https://opentui.com/docs/core-concepts/renderer/)    | `createCliRenderer()` initializes the OpenTUI CLI renderer and loads the native Zig rendering library.    | 2026-05-25 |
| [`@opentui/solid` on npm](https://www.npmjs.com/package/@opentui/solid) | The package is Solid.js support for OpenTUI and documents Bun + Solid JSX setup.                          | 2026-05-25 |
| [OpenTUI Solid plugin docs](https://opentui.com/docs/plugins/solid/)    | The Solid integration includes slot registry and runtime plugin support for Solid JSX UI.                 | 2026-05-25 |

## Product Fit

| Dimension      | vue-tui                                                                  | `@opentui/solid`                                 | Practical reading                                                                      |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Framework      | Vue 3 components, SFC-friendly composition, Vue reactivity               | Solid JSX binding                                | Vue apps should start with vue-tui; Solid apps should start with OpenTUI Solid.        |
| Runtime target | Node package target plus browser DOM, CLI stdout, and headless testing   | Bun-first OpenTUI terminal path                  | vue-tui has the clearer Node/Vite/browser package story today.                         |
| Renderer route | JS terminal buffer, DOM renderer, stdout renderer, headless renderer use | Native Zig renderer exposed through TypeScript   | OpenTUI owns the native terminal renderer story; vue-tui owns cross-host renderer use. |
| Browser DOM    | First-class DOM renderer with browser import and SSR import smoke        | Not the comparable primary path                  | Browser-hosted terminal UI is a vue-tui differentiator.                                |
| Logs/agent UI  | Experimental `TLogView`, markdown block source, agent console example    | OpenTUI has rich native terminal components      | Compare app scenarios, not abstract renderer throughput.                               |
| Stability      | 1.0 contract is documented by entrypoint maturity and release gates      | OpenTUI is also actively documented and evolving | vue-tui should claim contract clarity, not ecosystem dominance.                        |

Positioning sentence:

> vue-tui gives Vue teams one package contract across browser-hosted terminal UIs, CLI stdout apps, and headless tests, with high-throughput primitives for logs, markdown transcripts, and agent-console surfaces.

## Required Test Protocol

Every comparison run must record:

| Field              | Required value                                                                 |
| ------------------ | ------------------------------------------------------------------------------ |
| Machine            | CPU model, memory, OS, kernel/version                                          |
| Runtime            | Node/Bun versions and package manager versions                                 |
| Package versions   | vue-tui, Vue, `@opentui/solid`, Solid, `@opentui/core`                         |
| Terminal           | Terminal emulator name/version, shell, `$TERM`, viewport rows/cols             |
| Build mode         | dev/prod, source/tarball, bundler settings                                     |
| Scenario data      | row counts, viewport size, append rate, event count, ANSI/OSC8/markdown flags  |
| Measurement method | timers, heap collection, stdout byte counter, CPU sample method, warmup policy |
| Raw artifacts      | JSON results, command log, git SHA, tarball SHA256                             |

Do not compare vue-tui browser DOM results against OpenTUI native CLI results as if they are the same category. Browser-hosted terminal should be reported as a vue-tui-only differentiator unless a comparable browser renderer is added to the other side.

## Scenario 1: 100k Virtual List Scroll

Viewport: 120x40 terminal. Dataset: 100000 rows. Input: 100 wheel or key scroll events.

| Metric                     | vue-tui | `@opentui/solid` |
| -------------------------- | ------: | ---------------: |
| cold start ms              |         |                  |
| first paint ms             |         |                  |
| 100 scroll events total ms |         |                  |
| p95 input-to-paint ms      |         |                  |
| p99 input-to-paint ms      |         |                  |
| frames                     |         |                  |
| bytes written to stdout    |         |                  |
| heap delta MB              |         |                  |
| CPU time ms                |         |                  |

Required notes:

- Whether the test is coalesced burst input or spaced input.
- Whether stdout writes are counted before or after terminal escape encoding.
- Whether the renderer paints only visible rows or performs offscreen work.

## Scenario 2: Streaming Log / Transcript

Dataset: 100000 appended lines. Retention: 1000 lines. Viewport: 30 visible log rows. Append rate: 10 lines per tick. Include detached scroll behavior.

| Metric                                   | vue-tui | `@opentui/solid` |
| ---------------------------------------- | ------: | ---------------: |
| append throughput lines/s                |         |                  |
| p95 frame ms                             |         |                  |
| p99 frame ms                             |         |                  |
| render/get calls per visible frame       |         |                  |
| heap after retention MB                  |         |                  |
| detached viewport stability failures     |         |                  |
| bytes written to stdout per append frame |         |                  |

Required notes:

- Whether ANSI SGR, OSC8 links, wrapping, and search are enabled.
- Whether retention is implemented in the data source or renderer layer.
- Whether detached scroll remains stable while new lines append.

## Scenario 3: Agent Console

Layout: transcript, logs, bottom input, overlay command palette, streamed markdown blocks.

| Metric                            | vue-tui | `@opentui/solid` |
| --------------------------------- | ------: | ---------------: |
| streaming markdown update p95     |         |                  |
| input typing p95                  |         |                  |
| overlay open p95                  |         |                  |
| overlay close p95                 |         |                  |
| stdout bytes/frame                |         |                  |
| dropped frames over 60s           |         |                  |
| heap delta after 60s streaming MB |         |                  |

Required notes:

- The markdown parser and syntax features used.
- Whether logs and transcript are separate render planes/regions.
- Whether input latency is measured while streaming is active.

## Scenario 4: Browser-Hosted Terminal

This is a vue-tui-only benchmark unless the comparison target provides a comparable browser DOM renderer.

| Metric                                     | vue-tui DOM |
| ------------------------------------------ | ----------: |
| 80x24 first render ms                      |             |
| 120x40 first render ms                     |             |
| 20 dirty rows DOM flush ms                 |             |
| cache-hit row flush ms                     |             |
| browser Vite import smoke                  |   pass/fail |
| SSR import without `window/document` touch |   pass/fail |

## Interpretation Rules

- If only vue-tui data exists, describe it as a vue-tui baseline.
- If both projects have data but the scenarios differ, describe the difference and do not rank them.
- If OpenTUI wins raw CLI throughput, keep vue-tui's positioning on Vue, browser DOM, Node/Vite, headless tests, and logs/markdown/agent UI reuse.
- If vue-tui wins a same-scenario benchmark, publish the raw artifacts before using the claim in README or release notes.
- Keep `/experimental` and `/agent` clearly labeled when benchmark scenarios use `TVirtualList`, `TLogView`, or agent console aggregation.

## Copy Guidance

Safe:

> vue-tui focuses on Vue 3, browser/CLI/headless reuse, explicit terminal permission boundaries, and high-throughput primitives for logs, markdown transcripts, and agent-console UIs.

Unsafe without comparison data:

> vue-tui is faster than OpenTUI Solid.

> vue-tui delivers native-level performance.

> vue-tui is production-proven compared with OpenTUI.
