# Changelog

## Unreleased

### Breaking / Behavior Changes

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
