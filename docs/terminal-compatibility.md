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

- `DIMCODE_COLOR_MODE=truecolor|ansi256|ansi16`
- `VUE_TUI_COLOR_MODE=truecolor|ansi256|ansi16`

示例：

```bash
DIMCODE_COLOR_MODE=ansi256 bun run cli
```

## Palette（调色板）一致性

为确保同一套 UI 在不同终端中更接近一致，建议始终使用仓库内置的固定 palette，并在 CLI 侧显式传入 `palette`（或使用默认的内置 palette 映射到 RGB 序列）。

## 常见差异（需要接受/规避）

- **emoji / East Asian 宽度**：部分终端对 emoji 的 cell 宽度判断不同，可能导致对齐轻微偏差；尽量避免用 emoji 做布局关键字符。
- **字体与字形**：边框字符（`┌─┐│└┘`）在某些字体下可能不对齐；建议使用等宽字体并开启 box drawing 支持。
- **换行与滚动**：终端可能自动换行或在输出时滚屏；`StdoutRenderer` 渲染时会控制换行与逐行定位，减少滚动跳动。
