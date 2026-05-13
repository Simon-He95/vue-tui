# Changelog

## 0.1.0-rc.0 - Unreleased

### Added

- Agent Console browser example for streaming transcript, log/markdown modes, split render planes, input stability, search, links, and command palette overlay.
- Agent Console terminal runner, terminal smoke path, and replay log.
- `TLogView` explicit invalidation APIs: `refreshViewport()`, `invalidateLine()`, and `invalidateRange()`.
- `TVirtualMarkdown` external block source support and block-level cache reuse.
- `createMarkdownBlockSource()` in the markdown entrypoint for streaming transcript apps that finalize markdown blocks.
- stdout renderer custom palette support.
- Examples index covering browser, terminal, and smoke entrypoints.
- Release candidate docs covering validation commands, package export boundaries, examples, migration notes, and experimental API warnings.
- Release validation scripts for `release:check`, `release:bench`, `release:smoke`, `release:pack`, `release:pack-smoke`, and `release:dry-run`.
- Packed package dry-run smoke that installs the generated `.tgz` into an external project and verifies ESM, CJS, and type export targets.
- Internal `createFrameMailbox()` for coalescing latest-only producer updates into one scheduler frame task.
- `RenderManager.markDirtyRows(id, rows)` for absolute dirty-row repaint within the node's plane.
- `TerminalFrameContext.reportDroppedUpdates()` for coalesced producer metrics.

### Changed

- `TList` wheel scrolling is viewport-only. It emits `scroll`, but no longer mutates active selection or emits `update:modelValue`.
- `TList` now splits selection updates from confirmation: `update:modelValue` represents selection changes, while `change` represents confirmation.
- `TList` keyboard, click, double click, and Enter reattach selection to the visible viewport after wheel detachment.
- `TList` keyboard-driven and external-model-driven viewport changes no longer emit `scroll`.
- `TList` `scroll` now represents viewport-driven scroll changes, especially wheel scrolling and programmatic clamp.
- `TList` cancels a pending wheel frame if the viewport is hidden or fully clipped before the frame runs.
- `TList` same-length item text updates require replacing the `items` array reference or bumping `itemVersion` to schedule repaint.
- `TRenderPlane.plane` is immutable after mount.
- `scheduler.queueFrameTask()` may return `false` when rejected; `true` or `undefined` means accepted.
- `scheduler.cancelFrameTask()` remains best-effort, so frame task callbacks should still guard stale or disposed local state.
- DOM renderer rowKey prepass now supports automatic/default adaptive behavior.
- `sliceByCellsRange()` preserves cell occupancy with spaces when a range cuts through a wide grapheme. This affects `TList`, `TLogView`, Markdown, `TVirtualMarkdown`, and direct text utility users.
- README was rewritten into user-facing docs for entrypoints, examples, validation, and performance guidance.
- Vue peer dependency range now allows Vue 3.3 through Vue 3.x.
- Package exports were tightened around root, markdown, and experimental entrypoints.

### Fixed

- `TDialog` selected button underline rendering.
- `TDialog` pointerup/click double confirm behavior.
- `EventManager` stale same-rect remount bubbling.
- DOM renderer span fast paths now work in Node DOM environments that do not expose `HTMLSpanElement` globally.
- Basic browser example build avoids bundling Node-only terminal/event/profiler modules while keeping terminal builds on the root package entry.
- `TLogView` wrap scroll fast path is disabled when it is unsafe.
- CI now runs the VitePress docs build during verification so broken docs links fail before release.

### Performance

- Frame mailbox for `TList`, `TLogView`, and `TVirtualList`.
- Dirty-row repaint primitive for same-plane repaint.
- `TLogView` data and wheel coalescing.
- `TLogView` append/tail dirty-row refinement.
- `TVirtualList` controlled `scrollTop` and mailbox path.
- DOM renderer plain text fast path.
- DOM renderer single styled row fast path.
- DOM renderer multi-segment span reuse.
- DOM renderer row render stats.
- DOM renderer rowKey prepass and adaptive decision.
- Markdown block-level cache reuse.
- `bench:scroll-mailbox`.
- `bench:dom-renderer`.
- `bench:phase2`.

### Experimental

- `TVirtualList`.
- `TLogView`.
- TLog search, link, scrollbar, and minimap companions.
- Append-only log store.
- TLog plugins.
- Agent Console example stack.

Experimental APIs remain under `@simon_he/vue-tui/experimental` and may change before the next stable release.

### Breaking / Migration Notes

- `TList` wheel events now update viewport scroll only. They no longer mutate active selection or emit `update:modelValue`.
- `TList` confirmation is represented by `change`; `update:modelValue` represents selection changes.
- `TList` Enter and double click emit `change`; they do not emit `update:modelValue` when committing the already-active item.
- `TRenderPlane.plane` is immutable after mount. Use a keyed remount to move a subtree to another plane.
- `scheduler.queueFrameTask()` may return `false` when rejected. Producers should clear pending state or retry explicitly.
- `TLogView` custom mutable sources should bump `version`, provide changing `getLineKey(index)`, or call `refreshViewport()` / `invalidateLine()` / `invalidateRange()`.
- Browser and terminal examples now have separate smoke paths. Run headless smoke in CI and reserve real terminal runners for manual checks.
- High-throughput APIs remain outside the root entrypoint.

### Release Validation

Run the full local release gate before publishing:

```bash
pnpm run release:dry-run
```

`release:dry-run` includes:

- `release:check`
- `release:bench`
- `release:smoke`
- `release:pack-smoke`

The release validation flow also covers `release:pack` through the packed package smoke.
