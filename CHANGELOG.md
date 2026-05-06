# Changelog

## Unreleased

### Breaking / Behavior Changes

- `TList` treats `update:modelValue` as selection-change, not selection-confirm.
- `TList` wheel scrolling is now viewport-only. It emits `scroll`, but no longer mutates active selection or emits `update:modelValue`.
- `TList` keyboard, click, double click, and Enter reattach selection to the visible viewport after wheel detachment.
- `TList` Enter and double click emit `change`; they do not emit `update:modelValue` when committing the already-active item.
- `TList` keyboard-driven and external-model-driven viewport changes no longer emit `scroll`.
- `TList` `scroll` now represents viewport-driven scroll changes, especially wheel scrolling and programmatic clamp.
- `TRenderPlane.plane` is immutable after mount. Use `:key="plane"` to move a subtree to another plane.
- `scheduler.queueFrameTask()` may return `false` when rejected; `true` or `undefined` means accepted.
