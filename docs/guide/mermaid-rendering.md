---
title: Mermaid 图渲染（自适应 TMermaid）
description: 在终端里渲染 Mermaid 图：支持 Kitty/iTerm2 图形协议的终端出 PNG 图片，否则回退 beautiful-mermaid 的 ASCII 文本图，再否则显示原始源码。零配置、source-first、流式友好。
---

# Mermaid 图渲染（自适应 TMermaid）

`TMermaid`（`@simon_he/vue-tui/mermaid` / `@simon_he/vue-tui/agent/mermaid`）是自适应 Mermaid 组件，按终端能力自动选择最佳呈现：

```text
raw source（默认，pending 阶段一直显示）
   │  final=true 后
   ├─ 终端支持 Kitty / iTerm2 图形协议
   │    └─ PNG 渲染成功 → 图片
   │        └─ 失败/不支持 → 尝试 ANSI 文本图
   │            └─ 太复杂/失败/超时 → 保持 raw source
   └─ 终端不支持图片
        └─ 尝试 ANSI 文本图
            └─ 太复杂/失败/超时 → 保持 raw source
```

- **默认 raw content**：任何 pipeline 未完成前都显示原始源码，区域永远不会空白。
- **性能**：图片与 ANSI 都只在 `final=true` 后才启动；PNG 按 `(源码, cell 尺寸, 颜色)` 全局缓存并 in-flight 去重；streaming 更新走低优先级 frame task。
- **图片优先**：支持图形协议的终端直接出图（`beautiful-mermaid` SVG → `@resvg/resvg-js` PNG），避免 ANSI 文本图在宽图上错位。
- **ANSI 回退**：非图片终端渲染 `beautiful-mermaid` 的 ASCII 文本图，默认只用 `isSimpleMermaidFlowchartSource` 限制为简单 flowchart，避免复杂图错乱。
- **再回退 raw**：ANSI renderer 缺失、guard 拒绝、失败、超时或返回空白时保持源码显示。

## 依赖安装

```bash
pnpm add @simon_he/vue-tui vue

# 可选：内置 beautiful-mermaid 渲染桥（ANSI + SVG）
pnpm add beautiful-mermaid

# 可选：图片模式需要（SVG → PNG）
pnpm add @resvg/resvg-js
```

> 未安装 `beautiful-mermaid` / `@resvg/resvg-js` 时组件优雅降级（图片/ANSI 不可用 → 源码），不会报错。
>
> `@simon_he/vue-tui/vue` / `@simon_he/vue-tui/agent` 导出的 `TMermaid` / `TMermaidText` 是 renderer-agnostic primitive，不会自动 import `beautiful-mermaid`，也不检测图形能力；需要零配置 adaptive 行为时请从 `/mermaid` 或 `/agent/mermaid` 导入。

## 快速开始：零配置

```vue
<script setup lang="ts">
import { TMermaid } from "@simon_he/vue-tui/agent/mermaid";

const diagram = `graph TD
  Prompt --> Plan
  Plan --> ToolCall
  ToolCall --> Answer`;
</script>

<template>
  <TMermaid :x="0" :y="0" :w="72" :content="diagram" />
</template>
```

浏览器 / DOM 场景从 `@simon_he/vue-tui/mermaid` 导入。Kitty 或 iTerm2 终端会直接显示图片；其他终端显示 ASCII 图；都不行时显示源码。

## 流式 Mermaid（AI 输出场景）

AI 输出 Mermaid fence 时经常先产生不完整源码：

```vue
<TMermaid
  :x="0"
  :y="0"
  :w="72"
  :content="diagram"
  :streaming="message.streaming"
  :final="message.final"
/>
```

策略是 **source-first**：

- `streaming=true && final=false` 时只显示源码，不启动图片 / ANSI 渲染。
- `final=true` 后先尝试图片，再尝试 ANSI，都失败保持源码。

## 缩放 + 拖拽平移（Kitty 图形协议）

支持图片的终端（kitty / wezterm / ghostty / foot / konsole）可以：

- **`Ctrl`（或浏览器里 `Cmd`）+ 滚轮**：以鼠标位置为中心缩放，范围被限制在容器区域内（越界裁剪，不撑破布局）。
- **直接拖拽图片**：放大后可拖动平移（点击仍复制源码；拖拽结束的 click 会被抑制，不会误复制）。
- **不带修饰键的滚轮**：透传给外层滚动容器——浏览历史消息时鼠标经过 mermaid 不会阻止正常滚动。

实现走 Kitty `a=p` placement resize + source crop，**不重新发送 PNG**，连续缩放/拖拽开销极小。iTerm2 没有 in-place resize 序列，自动禁用。

> 注意：终端鼠标上报只带 `Shift` / `Alt` / `Ctrl` 修饰位，`Cmd`（meta）在真实终端里拿不到，所以终端里用 **Ctrl**；浏览器 DOM 里 `Cmd` / `Ctrl` 都可以。可用 `zoomModifier` 调整。

关闭：`:zoom-on-wheel="false"`；调范围：`:min-zoom="1" :max-zoom="8"`。

## 固定呈现方式

需要固定行为时使用专用组件：

| 组件                                       | 行为                                             |
| ------------------------------------------ | ------------------------------------------------ |
| `TMermaid`（/mermaid、/agent/mermaid）     | **adaptive**：图片 → ANSI → raw                  |
| `TMermaidText`（/mermaid、/agent/mermaid） | ANSI 文本图 → raw（原行为，不检测图形能力）      |
| `TMermaidText`（/vue、/agent）             | renderer-agnostic primitive，需显式传 `renderer` |
| `TMermaidImage`                            | 图片优先；传 `textRenderer` 后 ANSI 回退 → raw   |

## 自定义 renderer

`TMermaid` 支持自定义图片 rasterizer 与 ANSI renderer：

```vue
<script setup lang="ts">
import { TMermaid } from "@simon_he/vue-tui/agent/mermaid";

// 自定义 mermaid → PNG rasterizer（图片路径）
const imageRenderer = async (code, options) => {
  const png = await myMermaidPngService(code);
  return png ? { base64: png.base64, widthCells: 40, heightCells: 12 } : null;
};

// 自定义 ANSI renderer（文本路径）
const textRenderer = async (code, options) => "┌───┐\n│ A │\n└───┘";
</script>

<template>
  <TMermaid
    :x="0"
    :y="0"
    :w="72"
    :content="diagram"
    :renderer="imageRenderer"
    :textRenderer="textRenderer"
  />
</template>
```

> 兼容说明：`TMermaid` 的 `renderer` prop 沿用旧语义，即 **ANSI 文本 renderer**（映射到内部 `textRenderer`）；自定义图片 rasterizer 请用 `renderer` 搭配 `TMermaidImage`，或用 `setMermaidImageRasterizer()` 注入全局。

## Props

| Prop                                            | 类型                                       | 默认         | 说明                                                                  |
| ----------------------------------------------- | ------------------------------------------ | ------------ | --------------------------------------------------------------------- |
| `x` / `y` / `w`                                 | `number`（必填）                           | —            | 渲染区域左上角与宽度                                                  |
| `h`                                             | `number`                                   | 自适应       | 固定高度；不传时按当前呈现（图片宽高比 / ANSI 行数 / 源码行数）自适应 |
| `content` / `code`                              | `string`                                   | —            | Mermaid source；同时传入时 `code` 优先                                |
| `final`                                         | `boolean`                                  | `true`       | source 是否已结束；`streaming=true && final=false` 只显示源码         |
| `streaming`                                     | `boolean`                                  | `false`      | streaming 更新时用低优先级 frame task 合并重算                        |
| `renderer`                                      | `TuiMermaidImageRasterizer`                | —            | 自定义图片 rasterizer（`TMermaid` 上仍映射为 ANSI renderer，见上）    |
| `textRenderer`                                  | `TMermaidRenderer`                         | —            | ANSI 文本 renderer；不传时 `TMermaid` 默认 `beautifulMermaidRenderer` |
| `shouldRenderSource`                            | `TMermaidRenderEligibility`                | 见下         | ANSI 回退 guard；`TMermaid` 默认 `isSimpleMermaidFlowchartSource`     |
| `textOptions`                                   | `TMermaidAsciiOptions`                     | —            | 传给 ANSI renderer 的 spacing/theme options；强制 `colorMode: "none"` |
| `cellWidthPx` / `cellHeightPx` / `scale`        | `number`                                   | 8 / 16 / 2   | PNG 像素 → cell 换算参数                                              |
| `bg` / `fg`                                     | `string`                                   | —            | 图片主题色；`fg` 未传时从 terminal 样式解析                           |
| `maxWidthCells` / `maxHeightCells`              | `number`                                   | —            | 图片最大占用格数，超范围等比缩放                                      |
| `padding`                                       | `number`                                   | 40           | SVG 画布内边距                                                        |
| `ascii`                                         | `boolean`                                  | `false`      | ASCII 边框字符（同时透传给 ANSI renderer）                            |
| `box` / `title` / `copyButton` / `copyOnClick`  | —                                          | —            | 外框与复制交互（与 `TMermaidText` 一致）                              |
| `previewOnClick`                                | `true`                                     | —            | 图片模式下点击图片打开全屏预览；`false` 恢复点击复制                  |
| `maxRenderSourceChars` / `maxRenderSourceLines` | `number`                                   | 20000 / 400  | 超大源码跳过渲染，直接显示源码                                        |
| `zoomOnWheel`                                   | `boolean`                                  | `true`       | Kitty 图形协议下缩放 + 拖拽平移；iTerm2 自动禁用                      |
| `zoomModifier`                                  | `"meta" \| "ctrl" \| "metaCtrl" \| "none"` | `"metaCtrl"` | 缩放需要的修饰键；不带修饰键的滚轮透传给滚动容器                      |
| `minZoom` / `maxZoom`                           | `number`                                   | 1 / 6        | 缩放范围（相对 fit 的倍率）                                           |
| `zoomSensitivity`                               | `number`                                   | 0.002        | 缩放灵敏度                                                            |

## 模块级 rasterizer API

从 `@simon_he/vue-tui/mermaid` / `@simon_he/vue-tui/agent/mermaid` 导出：

- `getMermaidImage(code, options?)`：rasterize 并按 `(code, cell metrics, colors)` 缓存；in-flight 去重；完成时通知订阅者
- `getCachedMermaidImage(code, options?)`：同步缓存查询（未命中返回 `null`）
- `loadMermaidImageRenderer()` / `isMermaidImageRendererReady()`：确保 / 查询内置 rasterizer 是否可用
- `setMermaidImageRasterizer(rasterizer | null)`：注入自定义图片 rasterizer
- `clearMermaidImageCache()`：清空 PNG 与失败缓存
- `subscribeMermaidImage(listener)`：图片完成后收到通知，用于重建布局
- `resolveMermaidSvgForResvg(svg, bg, fg)`：把 beautiful-mermaid 输出的 CSS 变量 / `color-mix()` 内联成 hex 色值（resvg 不支持这些 CSS，否则 PNG 会全黑）

## Related Pages

- [终端图片渲染（Kitty 图形协议）](/guide/terminal-image-rendering)
- [Markdown 数学公式图片渲染（KaTeX 路径）](/guide/markdown-math)
- [Markdown Transcript](/guide/markdown-transcript)
- [Components](/components)（`TMermaid` / `TMermaidText` / `TMermaidImage` 段）
- [Agent Console](/agent-console)
