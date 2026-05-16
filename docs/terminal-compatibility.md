# Terminal 兼容性与颜色一致性

终端模拟器（macOS Terminal / iTerm2 / kitty / Alacritty / WezTerm / Windows Terminal / VSCode 终端 / tmux / SSH 等）在「颜色能力、字体、宽字符、换行/滚动行为」上存在差异。为了让 GoatChain / vue-tui 在大多数终端中表现一致，我们采用以下策略。

Renderer capability、browser ARIA 和 terminal permission/opt-in 规则见：[Platform Contracts](/platform-contracts)。

## 颜色一致性策略

### 1) 优先使用 Truecolor（24-bit）

`StdoutRenderer` 会在支持的情况下使用 24-bit ANSI 序列（`38;2;r;g;b` / `48;2;r;g;b`）来设置前景/背景色。

- 优点：不依赖终端主题/16 色调色板，跨终端更接近一致。
- 注意：不同终端的显示器色彩配置/色彩管理可能导致“肉眼观感”略有差异，但色值是确定的。

### 2) 回退：ANSI256（可选）

当需要兼容不支持 truecolor 的环境，可使用 ANSI256（`38;5;n` / `48;5;n`）。它比 ANSI16 更稳定（不依赖用户主题），但颜色是近似映射。

### 3) 最后兜底：ANSI16（不推荐用于“颜色一致性”）

ANSI16 颜色会被终端主题重定义，不同终端/不同主题下颜色必然不同，只建议在极老环境或明确希望“跟随用户主题”时使用。

## 如何强制颜色模式

可通过环境变量强制 `StdoutRenderer` 的颜色模式（适用于 GoatChain CLI 与库使用方）：

- `VUE_TUI_COLOR_MODE=truecolor|ansi256|ansi16`
- `DIMCODE_COLOR_MODE=truecolor|ansi256|ansi16`（legacy alias）

示例：

```bash
VUE_TUI_COLOR_MODE=ansi256 pnpm run cli
```

## Palette（调色板）一致性

为确保同一套 UI 在不同终端中更接近一致，建议始终使用仓库内置的固定 palette，并在 CLI 侧显式传入 `palette`（或使用默认的内置 palette 映射到 RGB 序列）。

## Unicode 宽度策略

`createTerminal` 默认使用内置宽度模型：CJK full-width、emoji presentation、keycap 和高位 emoji 按 2 cells，ambiguous-width 符号按 1 cell。需要匹配 CJK locale 或特定终端配置时，可以传入 `widthProvider`：

```ts
createTerminal({
  cols: 80,
  rows: 24,
  widthProvider: "cjk",
});
```

可选值：

| widthProvider      | 行为                                              |
| ------------------ | ------------------------------------------------- |
| `default`          | 默认模型；ambiguous-width 符号按 1 cell           |
| `narrow-ambiguous` | 显式窄 ambiguous-width；等同当前默认语义          |
| `cjk`              | ambiguous-width 符号按 2 cells，适合 CJK 宽度环境 |
| `(text) => 1 \| 2` | 自定义 grapheme 宽度函数；返回值只接受 `1` 或 `2` |

## 常见差异（需要接受/规避）

- **emoji / East Asian 宽度**：部分终端对 emoji、ambiguous-width 符号和字体 fallback 的 cell 宽度判断不同，可能导致对齐轻微偏差；需要固定 CJK ambiguous-width 语义时使用 `widthProvider`。
- **字体与字形**：边框字符（`┌─┐│└┘`）在某些字体下可能不对齐；建议使用等宽字体并开启 box drawing 支持。
- **换行与滚动**：终端可能自动换行或在输出时滚屏；`StdoutRenderer` 渲染时会控制换行与逐行定位，减少滚动跳动。
