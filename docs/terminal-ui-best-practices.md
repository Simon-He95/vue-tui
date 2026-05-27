---
title: Terminal UI Best Practices
description: Practical guidance for building terminal Vue interfaces with vue-tui.
---

# Terminal UI Best Practices

This page collects practical patterns for building `vue-tui` interfaces that behave well in both browser DOM renderers and real CLI/stdout renderers.

## Cell-First Layout

All coordinates and dimensions are terminal cells. Treat every `x`, `y`, `w`, and `h` as an integer cell value, not a pixel value.

- Clamp geometry before rendering: `Math.floor(...)`, `Math.max(0, ...)`, and local `clamp(...)` helpers prevent negative rectangles.
- Derive layout from the viewport or parent clip rect, then pass final cell coordinates to components.
- Reserve fixed regions explicitly: header rows, separators, transcript area, input panel, footer, and overlay space should be accounted for before children render.
- Use `TRenderPlane` to separate high-volume content from chrome and overlays when different regions update at different frequencies.

## Text Width And Wrapping

Do not use string `.length` for terminal layout. CJK text, emoji, combining marks, continuation cells, and localized strings can occupy different cell widths.

Use the package text helpers instead:

- `textCellWidth(...)` for visible width.
- `sliceByCells(...)` and `sliceByCellsRange(...)` for clipping without cutting wide glyphs.
- `wrapByCells(...)` for wrapping text to a terminal width.
- `spaces(...)` for predictable cell fills.

When adding lower-level render paths, keep text sanitization consistent with `TText`: inline text must not write terminal control characters, and multiline text should preserve `\n` while stripping unsafe controls.

## Components And Surfaces

Prefer existing primitives before creating custom drawing code:

- `TText` for labels, fills, borders, separators, and fixed text.
- `TView` for grouped layout and invisible interactive hitboxes.
- `TBox` and `TDialog` for framed surfaces.
- `TInput` and `TInputBox` for editable text, cursor behavior, IME, paste, mentions, and host plugins.
- `TCommandPalette`, `TSelect`, `TList`, and `TPathPicker` for choice flows.
- `TTranscriptView`, `TVirtualRows`, `TLogView`, and related log components for large scrollable content.

Use stable keys and stable style object identities on hot paths. Pass a new object only when the visual style actually changes.

## Render Invalidation

Invalidate the smallest surface that changed.

- Use plane-specific invalidation for chrome, transcript, input, and overlay updates.
- Prefer dirty rows or stable render node updates over full-plane invalidation on scroll and streaming paths.
- Keep dirty row hints in absolute terminal rows; component-local row offsets are a common source of stale or over-broad paints.
- Batch clustered updates through the scheduler instead of forcing a flush per state change.

For large regions, keep row keys and versions narrow. Include only state that changes visual output, such as row content, width, wrapping, hover/focus state, and relevant style identity.

## Input, Focus, And Events

Focus behavior is part of the public UX contract.

- Use `autoFocus` and `focusable` deliberately.
- Modal components should capture handled keys with `preventDefault()` and `stopPropagation()` so background widgets do not fire.
- Own `Escape`, `Enter`, arrows, `Home`/`End`, `PageUp`/`PageDown`, and printable keys inside dialogs and inputs when those keys have local meaning.
- Use terminal cell coordinates from pointer events. Do not bypass the event manager for app-level shortcuts.
- Preserve selection suppression around modal overlays and pointer gestures.

When a visible target is small but the expected click area is larger, place a `TView` hitbox behind or above the drawn text rather than stretching the text component.

## Large Transcripts And Logs

For transcripts, retained logs, and streaming agent consoles, avoid rendering every row as a full Vue subtree on every frame.

- Use `TTranscriptView`, `TVirtualRows`, or `TLogView`.
- Provide stable row count, row key, row version, and changed range functions.
- Cache row metadata and clear only affected ranges.
- Use `markRaw`, `Map`, or `WeakMap` caches where Vue reactivity would add overhead or break object identity checks.
- Coalesce decorative animation during scroll if it causes frame churn.

## Styling

Use `Style` objects as renderer-facing data. Keep package components renderer-agnostic unless the file is explicitly DOM or CLI specific.

- Avoid app-specific hardcoded colors in reusable package components.
- Preserve meaningful style fields when merging: `fg`, `bg`, `bold`, `dim`, `italic`, `underline`, `inverse`, and `href`.
- Keep link semantics aligned with `TLink`, `TLinkifyText`, DOM renderer link options, and stdout OSC8 boundaries.

## Testing

Use `createTerminalApp` for deterministic terminal component tests.

Common assertions:

- `app.terminal.snapshot().lines` for visible output.
- `app.terminal.getCell(x, y).ch`, `.width`, `.continuation`, and `.style` for precise rendering.
- `app.events.dispatch(...)` for `keydown`, `input`, `paste`, `click`, `pointerdown`, `pointerup`, and `wheel`.
- `app.terminal.resize(cols, rows)` for viewport-sensitive layout.
- `app.scheduler.flush()` after Vue ticks or dispatched events.

Keep tests deterministic by controlling animation, time, environment flags, and cursor blinking when nearby tests already do so.

## Related Reading

- [Components](./components.md)
- [Planes and compositor](./planes-and-compositor.md)
- [Performance](./performance.md)
- [High-throughput rendering](./high-throughput-rendering.md)
- [CLI Events](./cli-events.md)
- [Agent Console](./agent-console.md)
