# Terminal Components Best Practices

These practices are based on `vue-tui` package internals plus CLI consumer examples from `/Users/Simon/Github/best-agent/apps/cli/src/dimsdk`.

## Layout And Text

- Compute geometry in terminal cells, not pixels. Keep `x`, `y`, `w`, and `h` integer and non-negative.
- Use package width utilities for any visible text: `textCellWidth`, `sliceByCells`, `sliceByCellsRange`, `wrapByCells`, `spaces`, and the lower-level width provider helpers in `src/vue/utils/text.ts` and `src/core/buffer/width.ts`.
- Do not use string `.length` to size terminal UI. It fails for CJK, emoji, combining marks, continuations, and localized strings.
- Sanitize text before terminal writes when adding new render paths. Follow `sanitizeInlineText` and `sanitizeTextBlock` behavior.
- When a component accepts a width provider or uses render-manager text passes, preserve provider threading through `withTextRenderPass` or existing local utilities.

Useful package files:

- `src/vue/utils/text.ts`
- `src/core/buffer/width.ts`
- `src/vue/components/TText.ts`
- `test/text-newlines.test.ts`
- `test/tmarkdown-components.test.ts`

## Rendering And Planes

- Use `TRenderPlane` and `TRenderLayer` when content belongs on a specific plane. Keep plane names aligned with `TERMINAL_RENDER_PLANES`.
- Invalidate the smallest surface that changed. Pair plane-specific changes with `scheduler.invalidate({ plane, priority })` and render manager plane invalidation when using lower-level APIs.
- Prefer dirty rows or stable node updates over full plane invalidation on hot paths.
- Keep render node rects exact. Empty rects should not paint. Dirty row hints are absolute terminal rows, not local row offsets.
- Use stable node keys and stable style object identities where cache behavior matters.

Useful package files:

- `src/vue/render/render-manager.ts`
- `src/vue/components/terminal-provider/scheduler.ts`
- `src/vue/components/TRenderPlane.ts`
- `src/vue/components/TRenderLayer.ts`
- `src/core/render-plane.ts`

## Components

- Follow the package style: TypeScript modules with `defineComponent` and render functions.
- Use `TText` for text, fills, borders, and separators.
- Use `TView` for layout groups and invisible hitboxes.
- Use `TBox` and `TDialog` for framed surfaces unless the component needs custom chrome.
- Use `TInput` or `TInputBox` for editable text; avoid app-level reimplementation of cursor, selection, IME, paste, mentions, or host plugin behavior.
- Use `TTranscriptView`, `TVirtualRows`, `TLogView`, or related log components for large scrollable content.

Consumer patterns worth preserving:

- `best-agent` draws chat chrome with `TText` fills and border rows.
- It uses `TView` as a large hitbox around a smaller `TInput`.
- It uses `TTranscriptView` with a data source, row key/version functions, changed ranges, and row metadata caches for large chat transcripts.

Useful package files:

- `src/vue/components/TDialog.ts`
- `src/vue/components/TInput.ts`
- `src/vue/components/TCommandPalette.ts`
- `src/vue/components/TTranscriptView.ts`
- `src/vue/components/TVirtualRows.ts`
- `src/vue/components/TLogView.ts`

## Input, Focus, And Events

- Treat focus as part of the API. Preserve `autoFocus`, `focusable`, dialog focus boundaries, IME anchor behavior, and tab behavior.
- Modal components should capture handled keys with `preventDefault()` and `stopPropagation()` so background widgets do not fire.
- Inputs and dialogs should own Escape, Enter, arrows, Home/End, PageUp/PageDown, and printable key behavior when appropriate.
- Pointer behavior should use terminal cell coordinates and event z-index rules. Do not bypass the event manager for app-level shortcuts.
- Preserve selection suppression behavior around modal overlays and pointer events.

Useful package files:

- `src/events/manager/event-manager.ts`
- `src/events/manager/types.ts`
- `src/events/manager/selection-suppression.ts`
- `src/selection/terminal-selection.ts`
- `src/vue/components/TInput.ts`
- `src/vue/components/TDialog.ts`

## Transcript And Large Lists

- Use data-source based rendering for large content. Provide stable row count, row keys, row versions, and changed ranges.
- Keep layout cache identity narrow: row key, row version, width, wrap state, style identity, hover/focus identity, and row index when required.
- Clear only changed ranges when possible. Avoid rebuilding all row metadata for single-row changes.
- Use `markRaw`, `WeakMap`, or local `Map` caches where Vue reactivity would add overhead or break object identity checks.
- Suppress or coalesce purely decorative animation during scroll if it causes frame churn.

Useful package files:

- `src/vue/components/TTranscriptView.ts`
- `src/vue/transcript/layout.ts`
- `src/vue/transcript/types.ts`
- `src/vue/components/TVirtualRows.ts`
- `test/tlog-view.test.ts`
- `test/tlog-scrollbar.test.ts`

## Styling And Themes

- Use `Style` objects from `src/core/types.ts`. Keep renderer-facing style fields compatible with CLI and DOM renderers.
- Avoid hardcoded app-specific colors in package components. Prefer props, theme defaults, or local component defaults already established in nearby files.
- When merging styles, preserve meaningful `href`, `underline`, `inverse`, `bold`, `dim`, `fg`, and `bg` fields.
- Keep style object identity stable on hot render paths when equality or cache checks depend on identity.

Useful package files:

- `src/core/types.ts`
- `src/ansi-styles.ts`
- `src/vue/theme.ts`
- `src/vue/utils/style-cache.ts`

## Testing

- Use `createTerminalApp` from `src/cli.ts` for terminal component tests.
- Flush with the local test helper pattern: Vue `nextTick()` as needed, then `app.scheduler.flush()`.
- Assert visible output with `app.terminal.snapshot().lines`.
- Assert precise rendering with `app.terminal.getCell(x, y).ch`, `.width`, `.continuation`, and `.style`.
- Dispatch interactions through `app.events.dispatch(...)`: `keydown`, `input`, `paste`, `click`, `pointerdown`, `pointerup`, and `wheel`.
- Test resize behavior with `app.terminal.resize(cols, rows)` when geometry depends on viewport size.
- Keep tests deterministic by controlling animation, time, and environment flags when nearby tests already do so.

Useful package files:

- `test/ui-regressions-support.ts`
- `test/p1-p2-components.test.ts`
- `test/tinput-restrict-text.test.ts`
- `test/tlog-search-bar.test.ts`
- `test/tlog-view.test.ts`

## Consumer Example Checklist

When validating a package-level change against `best-agent` usage, check these behaviors:

- Chat header and bottom panel reflow on terminal resize.
- Dialog Escape handling does not leak to the parent chat view.
- Command palette filtering, selection, wheel behavior, and search focus still work.
- `TInput` mentions, skill suggestions, paste handlers, image paste validation, and multiline chips still render.
- `TTranscriptView` rows update through row versions and changed ranges without repainting the full transcript.
