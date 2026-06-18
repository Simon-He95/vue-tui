# Design System (P2)

This repo targets a “terminal-first” design system that can render identically in browser (DOM renderer) and terminal (stdout renderer).

## Tokens

`TerminalProvider.theme` 接收 partial overrides；provider 会用 `createTheme()` 合并默认 token。`createTheme()` 也可作为 public helper 预先生成完整主题对象。当前 token 聚焦公共组件默认样式，不替代局部 `style` props。

```ts
const theme = createTheme({
  colors: {
    link: "cyanBright",
    linkVisited: "magentaBright",
    danger: "redBright",
  },
  components: {
    TLink: { underline: true, hoverUnderline: true },
    TTable: { selectedStyle: { inverse: true }, activeStyle: { underline: true } },
    TFormField: { errorStyle: { fg: "redBright" } },
  },
});
```

## Showcase Presets

`examples/basic/src/showcase-theme.ts` 提供 showcase 专用主题 preset，用来展示组件库的视觉弹性，不作为组件内部默认主题：

- `dark`: 默认深色工程界面，适合日志、dashboard 和 agent console
- `light`: 浅色产品界面，适合 docs/demo 截图
- `matrix`: 高对比绿色终端风格，适合 CLI 宣传图
- `plum`: 紫色产品风格，适合更偏 consumer 的演示

每套 preset 同时提供：

- terminal `defaultStyle`
- DOM/CLI ANSI palette
- `TerminalProvider.theme` token overrides
- showcase 外壳 chrome styles

这保证 browser showcase、terminal showcase 和后续截图/视频素材使用同一套视觉来源，而不是在组件里硬编码审美。

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
