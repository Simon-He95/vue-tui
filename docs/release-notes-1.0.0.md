# 1.0.0 Release Notes Draft Checklist

This draft is the public release note shape for `1.0.0`. Do not publish it with placeholders. Fill the validation records, tarball digest, workflow links, and manual terminal evidence before cutting the stable release.

## Title

```txt
v1.0.0
```

## Summary

`@simon_he/vue-tui` `1.0.0` is the first stable contract release for Vue 3 terminal UI surfaces across browser DOM, CLI stdout, and headless test environments.

This release stabilizes the package entrypoints, terminal core, DOM renderer contract, CLI runtime boundary, markdown APIs, browser-safe defaults, and release validation process. The high-throughput log, virtual list, and agent-console stacks remain available as preview-grade APIs under `/experimental` and `/agent`; they are serious regression-tested surfaces, but they are not part of the root-level 1.x SemVer promise.

## Positioning

Safe public copy:

> vue-tui is a Vue 3 terminal UI toolkit for browser-hosted terminal surfaces and CLI stdout apps, with shared component APIs across DOM, stdout, and headless renderers. It focuses on package stability, browser/CLI compatibility, explicit terminal permission boundaries, and high-throughput primitives for logs, markdown transcripts, and agent-console style UIs.

Do not claim:

- Faster than OpenTUI.
- Faster than `@opentui/solid`.
- Native-level performance.
- Production-proven compared with OpenTUI.

The current benchmark report is a vue-tui regression baseline, not a same-scenario comparison with `@opentui/solid`. Any future comparison must follow [Compare With OpenTUI Solid](/compare-opentui-solid).

## Stable Contract

| Entrypoint                        | Stability    | 1.0 contract                                                                 |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `@simon_he/vue-tui`               | Public       | Browser-safe terminal core, DOM renderer, stable Vue components, input host  |
| `@simon_he/vue-tui/core`          | Public       | Terminal buffer, ANSI/theme/path/hyperlink helpers, buffer-facing types      |
| `@simon_he/vue-tui/renderer/dom`  | Public       | DOM renderer factory, renderer capabilities, accessibility/link contract     |
| `@simon_he/vue-tui/cli`           | Public       | stdout renderer, stdin driver, headless app runtime, Node providers          |
| `@simon_he/vue-tui/markdown`      | Public       | markdown parser, `TMarkdownText`, `TVirtualMarkdown`, streaming block source |
| `@simon_he/vue-tui/vue`           | Advanced     | Extended Vue components, render plane, router/composables                    |
| `@simon_he/vue-tui/runtime`       | Advanced     | Runtime wiring, selection, clipboard abstraction                             |
| `@simon_he/vue-tui/observability` | Advanced     | FramePerf, profiler, trace helpers                                           |
| `@simon_he/vue-tui/experimental`  | Experimental | `TVirtualList`, `TLogView`, log search/link/minimap, append-only log store   |
| `@simon_he/vue-tui/agent`         | Experimental | Agent console aggregation entrypoint                                         |

## What Changed Since The RC Window

Use this section only if there are post-`1.0.0-rc.0` stable changes. If stable `1.0.0` is only a validation promotion, write:

> No additional public API changes after `1.0.0-rc.0`; this stable release promotes the validated contract.

If there are changes, keep them grouped by:

- Breaking
- Migration
- Added
- Changed
- Fixed
- Security
- Performance
- Experimental

## Migration Notes

Carry forward these `1.0.0-rc.0` migration notes:

- The root entrypoint is browser-safe and intentionally narrower.
- Extended Vue components and router/composable helpers live under `@simon_he/vue-tui/vue`.
- Node-aware input host defaults live under `@simon_he/vue-tui/cli`.
- `TList` wheel scrolling changes viewport only; confirmation is represented by `change`.
- `TRenderPlane.plane` is immutable after mount; use keyed remount to move a subtree.
- `scheduler.queueFrameTask()` may return `false`; producers must clear or retry their pending state explicitly.
- DOM renderer link rendering is opt-in and terminal OSC8 hyperlinks are sanitized.
- OSC52 clipboard behavior requires explicit provider opt-in.
- `TVirtualList`, `TLogView`, and agent console aggregation stay outside root.

## Known Boundaries

- Do not deep import from `@simon_he/vue-tui/dist/...` or source internals.
- Emoji, CJK, and ambiguous-width rendering still depend on terminal and font behavior.
- Browser DOM and CLI stdout are different renderer hosts; browser DOM benchmark results are not raw terminal renderer results.
- `/experimental` and `/agent` APIs can change in 1.x, with release notes.
- `TVirtualMarkdown` full-string `content` parsing remains suitable for moderate input; high-throughput transcript apps should prefer `createMarkdownBlockSource()` plus finalized blocks.
- Regex search can still block on one pathological long line.

## Validation Record

Fill every row before publishing. Blank evidence means the release is not ready.

| Check                       | Result      | Evidence                                                                  |
| --------------------------- | ----------- | ------------------------------------------------------------------------- |
| Local release dry-run       | pass / fail | `pnpm run release:dry-run`, date, Node version                            |
| GitHub workflow dry-run     | pass / fail | workflow run URL, `dry_run=true`, `npm_tag=latest`                        |
| Authenticated npm dry-run   | pass / fail | `npm publish --dry-run --provenance --tag latest`, run log                |
| Tarball SHA256              | pass / fail | `<sha256>  <tarball>`                                                     |
| Node/Vue matrix             | pass / fail | Node 16.17.1 / 18 / 20 / 22 / 24 with Vue 3.3.0 / 3.5.33                  |
| Packed package smoke        | pass / fail | package contract, pnpm/npm consumer smoke, type smoke, browser smoke      |
| SSR import smoke            | pass / fail | root/core/runtime/renderer/dom/observability/vue/markdown/experimental    |
| Benchmark behavior gate     | pass / fail | `pnpm run bench:baseline`, date, Node version                             |
| Benchmark timing review     | pass / fail | `pnpm run bench:baseline:timing` or explicit not-run explanation          |
| Docs build                  | pass / fail | `pnpm run docs:build`                                                     |
| New project npm install     | pass / fail | `npm install @simon_he/vue-tui@latest vue`                                |
| Post-publish dist-tag check | pass / fail | `npm view @simon_he/vue-tui version`, `npm dist-tag ls @simon_he/vue-tui` |
| Manual terminal validation  | pass / fail | table below completed                                                     |

## Manual Terminal Validation

| Target                                   | Result      | Evidence                                      |
| ---------------------------------------- | ----------- | --------------------------------------------- |
| macOS Terminal or iTerm2                 | pass / fail | terminal, macOS version, Node version         |
| Linux xterm-compatible terminal          | pass / fail | terminal, distro, Node version                |
| Windows Terminal or WSL                  | pass / fail | terminal, Windows / WSL version, Node version |
| Resize                                   | pass / fail | demo command                                  |
| Ctrl+C cleanup                           | pass / fail | demo command                                  |
| Keyboard input                           | pass / fail | demo command                                  |
| OSC8 links disabled/sanitized by default | pass / fail | sanitized / disabled evidence                 |
| OSC52 provider requires explicit opt-in  | pass / fail | opt-in-only evidence                          |

Suggested manual commands:

```bash
pnpm run run:basic:terminal
pnpm run run:tlog-view-lab
pnpm run run:agent-console:terminal
```

## Benchmark Summary

Use [Benchmarks](/benchmarks) for the detailed report. For release notes, keep the summary short:

- Behavior gate: `<pass/fail>` (`pnpm run bench:baseline`, date, Node version)
- Timing review: `<pass/fail/not run>` (`pnpm run bench:baseline:timing`, date, Node version)
- Current coverage: dirty rows, scanned nodes, painted nodes, mailbox coalescing, DOM flush behavior, retained logs, search, exact index, agent/log lab smoke.
- Not yet covered: real terminal input-to-paint, long streaming heap, stdout bytes/frame, same-scenario `@opentui/solid` comparison.

## Publish Commands

Stable releases must publish with `latest`, not `rc`.

Preferred path: GitHub Release workflow with `npm_tag=latest`.

Fallback path only when workflow token/provenance is unavailable:

```bash
pnpm run release:dry-run
VUE_TUI_ALLOW_DIRECT_PUBLISH=1 npm publish .release/*.tgz --access public --dry-run --tag latest
VUE_TUI_ALLOW_DIRECT_PUBLISH=1 npm publish .release/*.tgz --access public --tag latest
```

## Post-Publish Checks

```bash
npm view @simon_he/vue-tui version
npm dist-tag ls @simon_he/vue-tui
mkdir /tmp/vue-tui-1.0-smoke && cd /tmp/vue-tui-1.0-smoke
npm init -y
npm install @simon_he/vue-tui@latest vue
```

If the dist-tag is wrong, fix the tag. If the tarball is wrong, deprecate that version and release a new patch; do not overwrite an npm version.
