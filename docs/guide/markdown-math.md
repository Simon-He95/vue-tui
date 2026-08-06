---
title: Markdown 数学公式渲染
description: 在终端里渲染 LaTeX/KaTeX 数学公式：块级公式输出为 Kitty 图形协议图片，行内公式混排进文字行，无图形能力时回退为 box 包裹或原始文本。
---

# Markdown 数学公式渲染

Vue TUI 的 markdown 渲染器支持 `$...$` 行内公式和 `$$...$$` 块级公式。在支持图形协议的终端（Kitty / Ghostty / WezTerm / iTerm2）里，公式会**渲染成图片**显示；在不支持的终端里自动回退为文本。

## 渲染策略

| 公式           | 有图形能力 + 渲染栈           | 无图形能力 / 渲染栈缺失 |
| -------------- | ----------------------------- | ----------------------- |
| 块级 `$$...$$` | Kitty/iTerm2 图片（替换 box） | box 包裹原始 TeX        |

| 行内 `$...---
title: Markdown 数学公式渲染
description: 在终端里渲染 LaTeX/KaTeX 数学公式：块级公式输出为 Kitty 图形协议图片，行内公式混排进文字行，无图形能力时回退为 box 包裹或原始文本。

---

# Markdown 数学公式渲染

Vue TUI 的 markdown 渲染器支持 `$...$` 行内公式和 `$$...$$` 块级公式。在支持图形协议的终端（Kitty / Ghostty / WezTerm / iTerm2）里，公式会**渲染成图片**显示；在不支持的终端里自动回退为文本。

## 渲染策略

| 公式           | 有图形能力 + 渲染栈           | 无图形能力 / 渲染栈缺失 |
| -------------- | ----------------------------- | ----------------------- |
| 块级 `$$...$$` | Kitty/iTerm2 图片（替换 box） | box 包裹原始 TeX        |
| （≤2 行高）    | 混排进文字行的 1 行图片       | 原始 `$...---           |

title: Markdown 数学公式渲染
description: 在终端里渲染 LaTeX/KaTeX 数学公式：块级公式输出为 Kitty 图形协议图片，行内公式混排进文字行，无图形能力时回退为 box 包裹或原始文本。

---

# Markdown 数学公式渲染

Vue TUI 的 markdown 渲染器支持 `$...$` 行内公式和 `$$...$$` 块级公式。在支持图形协议的终端（Kitty / Ghostty / WezTerm / iTerm2）里，公式会**渲染成图片**显示；在不支持的终端里自动回退为文本。

## 渲染策略

| 公式                   | 有图形能力 + 渲染栈           | 无图形能力 / 渲染栈缺失 |
| ---------------------- | ----------------------------- | ----------------------- |
| 块级 `$$...$$`         | Kitty/iTerm2 图片（替换 box） | box 包裹原始 TeX        |
| 文本                   |
| 行内超高公式（矩阵等） | 保持原始 `$...$` 文本         | 原始 `$...$` 文本       |

任何形态的公式（图片或文本）都可以点击，触发 `mathAction` 事件，携带原始 TeX 便于复制。

## 安装依赖

公式转图片依赖两个**可选 peer**（不装也能用，只是公式以文本/bx 形式显示）：

```bash
# 核心库
pnpm add @simon_he/vue-tui vue

# 可选：数学公式图片渲染栈（懒加载，按需安装）
pnpm add mathjax-full @resvg/resvg-js
```

- `mathjax-full`：TeX → SVG（纯 JS，字形路径内嵌，无需任何字体文件）。
- `@resvg/resvg-js`：SVG → PNG 光栅化。

> 说明：`katex` 仍是可选 peer，但只用于旧的文本预览路径；公式图片渲染使用上面的 `mathjax-full` + `@resvg/resvg-js`（KaTeX 只能输出 HTML/MathML，无法直接生成 SVG）。

## 快速开始

```vue
<script setup lang="ts">
import { TVirtualMarkdown } from "@simon_he/vue-tui/markdown";

const content = [
  "欧拉公式：$e^{i\\pi}+1=0$",
  "",
  "块级积分：",
  "$$",
  "\\int_0^1 x^2\\,dx + \\frac{1}{2}\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{12}",
  "$$",
  "",
  "点击公式复制 TeX：$\\frac{a}{b}$",
].join("\n");
</script>

<template>
  <TVirtualMarkdown
    :x="0"
    :y="0"
    :w="100"
    :h="28"
    :content="content"
    :math-actions="true"
    @math-action="onMathAction"
  />
</template>
```

```ts
import { createOsc52ClipboardProvider } from "@simon_he/vue-tui";

const clipboard = createOsc52ClipboardProvider();

async function onMathAction(payload: { math: { raw: string } }): Promise<void> {
  await clipboard.writeText(payload.math.raw);
}
```

> 终端必须是 TTY 且被识别为支持图形协议，图片路径才会启用；否则自动显示文本/bx 回退，无需改代码。

## Props

`TMarkdownText` 与 `TVirtualMarkdown` 共用以下数学相关 props：

| Prop                | 类型      | 默认           | 说明                                                            |
| ------------------- | --------- | -------------- | --------------------------------------------------------------- |
| `mathImages`        | `boolean` | `true`         | 是否尝试把公式渲染为图片。`false` 时始终显示文本/bx             |
| `mathCellWidthPx`   | `number`  | `8`            | 终端单元格宽度（px），用于公式像素 → 格子换算                   |
| `mathCellHeightPx`  | `number`  | `16`           | 终端单元格高度（px）                                            |
| `mathScale`         | `number`  | `2`            | 光栅化 DPI 倍率（不影响格子大小，越高越清晰）                   |
| `mathColor`         | `string`  | 跟随文字前景色 | 公式颜色（hex）。默认取 `defaultStyle.fg`，浅色主题自动用深色字 |
| `mathMaxWidthCells` | `number`  | 容器宽度       | 块级公式最大宽度（格子），超宽会等比缩小                        |
| `mathBaselineRatio` | `number`  | `0.78`         | 行内公式基线在格高中的位置（0~1），用于和文字基线对齐           |

`mathScale` 只影响 PNG 分辨率；`mathCellWidthPx` / `mathCellHeightPx` 影响公式映射到多少个格子。字体偏大/偏小时先调这两个。

## 主题

公式文本与 box 的样式通过 markdown 主题的 `math` token 控制：

```ts
{
  theme: {
    math: { fg: "cyanBright" }, // 公式 box 与 raw 文本颜色
  },
}
```

## 编程接口

`@simon_he/vue-tui/markdown` 也导出底层 API，便于自建渲染管线或排查问题：

- `loadMarkdownMathImageRenderer(): Promise<boolean>` — 确保光栅化栈加载完成，返回是否可用。
- `isMarkdownMathImageRendererReady(): boolean` — 同步查询渲染栈是否就绪。
- `getMarkdownMathImage(tex, mode, options)` — 解析单个公式为 `{ base64, widthCells, heightCells }`（带缓存）。
- `setMarkdownMathRasterizer(fn)` — 注入自定义 TeX→PNG 光栅化器（已有自家管线的消费者可零依赖接入）。
- `clearMarkdownMathImageCache()` — 清空公式图片缓存。
- `resolveMarkdownMathColor(fg)` — 把终端前景色映射为 hex（供自定义渲染器复用）。

## 常见问题

### 终端里只显示 box / 原始文本，没有图片

按优先级检查：

1. **终端不支持图形协议**：Kitty、Ghostty、WezTerm、iTerm2 支持；纯 xterm、CI 输出不支持。
2. **在 tmux / screen / zellij 里运行**：多路复用器下图形协议默认关闭。退出复用器直接运行，或开启 passthrough：`VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH=1`（需要终端支持转发）。
3. **渲染栈未安装**：确认安装了 `mathjax-full` 与 `@resvg/resvg-js`。
4. **stdout 不是 TTY**：管道/重定向/CI 下不会启用图片。

运行诊断脚本，一条命令输出全部状态：

```bash
npx tsx scripts/check-math-graphics.ts
```

它会打印检测到的协议、原因、渲染栈状态和一个示例公式的渲染结果。也可运行示例 `bun run run:katex-showcase:terminal`，底部的黄色状态栏会显示 `graphics=kitty supported=yes raster=ready` 之类的诊断信息。

### 图片有但看不清楚 / 位置不对

- 公式颜色和背景接近：设置 `mathColor`，或确认 `defaultStyle.fg` 正确（默认会跟随文字前景色）。
- 行内公式偏高/偏低：调 `mathBaselineRatio`（0.65~0.9 之间试）。
- 公式太大/太小：调 `mathCellWidthPx` / `mathCellHeightPx`；DPI 不够清晰调 `mathScale`。

### 块级公式宽了 / 换行被截断

块级公式默认限制在容器宽度内（`mathMaxWidthCells`），超宽会等比缩小。超长表达式建议拆行或改用行内展示。

## Related Pages

- [Markdown Transcript](/guide/markdown-transcript)
- [Components](/components)
- [Terminal Compatibility](/terminal-compatibility)
