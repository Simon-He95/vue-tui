# Changelog

## Unreleased

### Breaking / Behavior Changes

- `TList` wheel scrolling is now viewport-only. It emits `scroll`, but no longer mutates active selection or emits `update:modelValue`.
- Keyboard, click, double click, and Enter reattach selection to the visible viewport after wheel detachment.
- `TRenderPlane.plane` is immutable after mount. Use `:key="plane"` to move a subtree to another plane.
- `scheduler.queueFrameTask()` may return `false` when rejected; `true` or `undefined` means accepted.
