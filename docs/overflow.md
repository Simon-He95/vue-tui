# Overflow & Sizing Model (P1)

This repo renders into a fixed cell grid (`cols` × `rows`). “Overflow” means **more content than available cells** in a component’s rect.

## Terms

- **wrap**: break long lines into multiple visual lines (cell-width aware).
- **clip**: truncate content that exceeds available width/height (no scroll state).
- **scroll**: keep a viewport with persistent offsets (`scrollX/scrollY`) so content can move within a fixed rect.
- **auto height**: component derives `h` from content; **fixed height**: `h` is provided.

## Current per-component defaults

- `TText`
  - Width: `w` optional; if omitted, computed from the longest line (cell-width).
  - Height: `h` optional; if omitted, derived from rendered line count (incl. explicit `\n` / wrap).
  - Overflow:
    - `wrap=false` (default): **clip** horizontally (cell-width), multi-line via explicit `\n`.
    - `wrap=true`: **wrap** by cell width; never emits control chars to `terminal.write`.

- `TBox`
  - Width/height required (`w`, `h`).
  - Overflow: children paint within the content rect; `TBox` can clear its own rect (`clear=true` default).

- `TInput`
  - Width required; height defaults to `1`.
  - Overflow:
    - `h=1`: horizontal **scroll** (internal `scrollX`) with a fixed single line.
    - `h>1`: wrap-mode editing with vertical **scroll** (internal `scrollY`) and cell-aware cursor mapping.
  - Paste: inserts text as-is (including `\n`). For single-line inputs, sanitize in `@paste`/`@beforeinput`.

- `TSelect` / `TList`
  - Width/height required.
  - Overflow: items are **clipped** per row (cell-width) and vertically **scroll** via `scrollTop`.

- `TDialog`
  - Width/height required.
  - Overflow: content is clipped to its rect; focus/blur and close behavior are managed by the dialog wrapper.

## Auto-height semantics (today)

- Only `TText` supports true “auto height” (content-driven) by omitting `h`.
- Layout containers (`TView`, `TBox`, dialogs, list/select/input) expect explicit sizing; the recommended pattern is:
  - use `TText` to measure/format content (wrap, compute lines),
  - then choose a fixed `h` and render inside a `TBox`/`TView`.

## Why there is no unified overflow prop set (yet)

Some components already have internal scroll models (e.g. `TInput`, `TList`) and others are pure paint (`TText`).
Unifying props like `scrollX/scrollY/maxHeight/truncate` across all components is doable, but it is an API design choice that affects:

- how scroll state is persisted across remounts/route switches
- keyboard/mouse bindings and focus management
- deterministic record/replay parity (important for this repo)

The current approach is to keep behavior explicit per component and document it, then iteratively unify once the shared model is agreed.
