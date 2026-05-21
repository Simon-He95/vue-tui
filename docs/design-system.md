# Design System (P2)

This repo targets a “terminal-first” design system that can render identically in browser (DOM renderer) and terminal (stdout renderer).

## Tokens

`createTheme()` 是 public token helper，返回可传给 `TerminalProvider.theme` 的对象。当前 token 聚焦公共组件默认样式，不替代局部 `style` props。

```ts
const theme = createTheme({
  colors: {
    link: "cyanBright",
    linkVisited: "magentaBright",
    danger: "redBright",
  },
  components: {
    TLink: { underline: true, hoverUnderline: true },
    TTable: { selectedStyle: { inverse: true } },
    TFormField: { errorStyle: { fg: "redBright" } },
  },
});
```

### Spacing

- `space.0 = 0`
- `space.1 = 1 cell`
- `space.2 = 2 cells`

### Borders

- `border.default = single-line box`
- `border.subtle = no border, padded container`

### Overlay / z-index

- `z.base = 0`
- `z.overlay = 10`
- `z.modal = 20`
- `z.debug = 90`

### Status colors (ANSI palette)

- `status.info = cyanBright`
- `status.success = greenBright`
- `status.warn = yellowBright`
- `status.error = redBright`

## Primitives

### Header / status bar

- Fixed height (1–2 rows), clear left/right sections, minimal color.

### Sidebar

- Left column with selectable items, consistent selection/focus styling.

### Toast

- Small box in a corner, auto-dismiss (but avoid timers in parity tests; allow manual dismiss in demos).

### Command palette

- Modal list with fuzzy search input and keyboard navigation.

### Modal / dialog

- Focus trap (future) + focus restore.
- Buttons navigable by `←/→`; `Enter` activates.

### List / select

- Deterministic clipping/wrapping behavior for long items.

### Progress

- Deterministic progress rendering (avoid time-based animation in parity gates).

## Accessibility baseline

- Visible focus ring (or focus-highlight) in both renderers.
- Keyboard-only navigation for all interactive controls.
- Sufficient contrast using palette-restricted colors.
