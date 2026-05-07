# Changelog

## Unreleased

### 0.0.x Breaking Behavior Changes

- `TList` treats `update:modelValue` as selection-change, not selection-confirm.
- `TList` wheel scrolling is now viewport-only. It emits `scroll`, but no longer mutates active selection or emits `update:modelValue`.
- `TList` keyboard, click, double click, and Enter reattach selection to the visible viewport after wheel detachment.
- `TList` Enter and double click emit `change`; they do not emit `update:modelValue` when committing the already-active item.
- `TList` keyboard-driven and external-model-driven viewport changes no longer emit `scroll`.
- `TList` `scroll` now represents viewport-driven scroll changes, especially wheel scrolling and programmatic clamp.
- `TList` cancels a pending wheel frame if the viewport is hidden or fully clipped before the frame runs.
- `TList` same-length item text updates require replacing the `items` array reference or bumping `itemVersion` to schedule repaint.
- `TRenderPlane.plane` is immutable after mount. Use `:key="plane"` to move a subtree to another plane.
- `scheduler.queueFrameTask()` may return `false` when rejected; `true` or `undefined` means accepted.
- `scheduler.cancelFrameTask()` is best-effort. Frame task callbacks must still guard stale or disposed local state.
- `TerminalFrameContext` now includes optional `reportDroppedUpdates()` for coalesced producer metrics.
- `sliceByCellsRange()` preserves cell occupancy with spaces when a range cuts through a wide grapheme. This affects `TList`, `TLogView`, Markdown, `TVirtualMarkdown`, and direct text utility users.

### Added

- Internal `createFrameMailbox()` coalesces latest-only producer updates into one scheduler frame task. It is not exported from the package root or experimental entrypoint.
- `RenderManager.markDirtyRows(id, rows)` marks absolute terminal rows for the node's plane and repaints same-plane overlapping nodes in z-order.
- Agent Console example covering streaming transcript, log/markdown modes, split render planes, input stability, search, links, command palette overlay, browser smoke, and stdout smoke.
- `createMarkdownBlockSource()` in the markdown entrypoint lets streaming transcript apps finalize markdown blocks and pass `blocks` to `TVirtualMarkdown` without reparsing finalized history.
- `TVirtualMarkdown` accepts external markdown `blocks` in addition to the existing `content` string path.
- 0.x release candidate docs covering validation commands, package export boundaries, examples, migration notes, and experimental API warnings.
- Release validation scripts split 0.x checks into `release:check`, `release:bench`, and `release:smoke`.

### Migration Notes

- Treat `@simon_he/vue-tui/experimental` as an opt-in boundary. Keep `TVirtualList`, `TLogView`, log companions, and log plugins isolated from root-entry application code.
- For `TLogView`, custom mutable sources should bump `version` or return changing `getLineKey(index)` values for rows whose content changes.
- Browser and terminal examples now have separate smoke paths; release validation should run headless smoke in CI and reserve real terminal runners for manual checks.

### Fixed

- DOM renderer span fast paths now work in Node DOM environments that do not expose `HTMLSpanElement` globally.
- Basic browser example build avoids bundling Node-only terminal/event/profiler modules while keeping terminal builds on the root package entry.
