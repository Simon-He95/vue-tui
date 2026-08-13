---
title: 终端图片渲染（Kitty 图形协议）
description: 在真实终端里渲染像素内容（图片、数学公式、mermaid、视频帧）：Kitty / iTerm2 / Sixel 图形协议、Markdown 图片与 TAgentTerminalGraphic 两种用法、零依赖接入、tmux passthrough 与自动降级。
---

# 终端图片渲染（Kitty 图形协议）

Vue TUI 通过**终端图形协议**把像素内容（PNG 图片、数学公式、mermaid 图、视频帧）直接画进真实终端。协议由终端模拟器提供，渲染链路内置在包里：组件把图片 base64 编码进 `Kitty` / `iTerm2` / `Sixel` escape sequence，在**帧末尾**由 stdout renderer 写入。终端不支持图形协议时自动降级为文本/ASCII，不会报错。

```bash
# 可运行示例
bun run run:image-showcase:terminal     # Markdown 图片（data/http/file/blob/降级）
bun run run:katex-showcase:terminal     # 数学公式（公式图片 + 诊断状态栏）
```

## 支持的协议与终端

| 协议     | 代表终端                                  | 说明                                                            |
| -------- | ----------------------------------------- | --------------------------------------------------------------- |
| `kitty`  | kitty、WezTerm、foot、Ghostty、Konsole    | 推荐；支持像素精确渲染、placement 增量更新与删除                |
| `iterm2` | iTerm2、WezTerm                           | PNG inline image protocol                                       |
| `sixel`  | xterm、mlterm、Windows Terminal（需开启） | 仅 `TAgentTerminalGraphic` 消费；需要宿主提供 `toSixel` encoder |

协议选择按 `kitty > iterm2 > sixel` 优先级自动检测：

- **kitty**：`KITTY_WINDOW_ID`、`GHOSTTY_RESOURCES_DIR`，或 `TERM` / `TERM_PROGRAM` 含 `kitty` / `ghostty`。
- **iterm2**：`TERM_PROGRAM` 含 `iterm` / `wezterm`，或设置了 `WEZTERM_PANE` / `WEZTERM_EXECUTABLE`。
- **sixel**：设置了 `VUE_TUI_SIXEL` / `VUE_TUI_GRAPHICS_SIXEL`，`TERMINAL_GRAPHICS` 含 `sixel`，或 `TERM` 含 `sixel`。

没有命中任何候选时，`preferredProtocol` 为 `null`，所有像素组件走降级路径。

## 依赖安装

**终端图片本身零额外依赖。** PNG/JPEG/GIF/WebP 的 base64 编码、尺寸解析（读文件头）全部内置，宿主只需要提供图片字节（base64 字符串）。可选依赖只在你用到对应能力时才需要：

```bash
# 核心库
pnpm add @simon_he/vue-tui vue

# 可选：数学公式 → 图片（懒加载，按需安装）
pnpm add mathjax-full @resvg/resvg-js

# 可选：Mermaid 图 → 图片（懒加载，按需安装；自适应 TMermaid 与 TMermaidImage 共用 beautiful-mermaid 依赖）
pnpm add beautiful-mermaid @resvg/resvg-js

# 可选：Sixel 终端上渲染图片 —— 宿主提供 toSixel encoder
# （例如 libsixel binding、img2sixel 包装，或自定义 renderer）
```

> `katex` 仍是可选 peer，但只用于旧的文本预览路径；公式图片走 `mathjax-full` + `@resvg/resvg-js`，详见 [Markdown 数学公式渲染](/guide/markdown-math)。

## 快速开始 A：Markdown 图片

`TMarkdownText` / `TVirtualMarkdown` 支持标准 Markdown 图片语法 `![alt](src)`。**`data:` URL 内嵌 base64 时完全零配置**；`http(s)` / `file:` / `blob:` URL 需要传 `imageRenderer` 把 URL 解析成 base64。

```ts
import { TMarkdownText, type TuiMarkdownImageResolver } from "@simon_he/vue-tui/markdown";
import { h } from "vue";

// 1) data URL —— 零配置直接显示
const dataUrl = "data:image/png;base64,iVBORw0KGgo...";

// 2) http / file / blob URL —— 用 imageRenderer 提供 base64
const imageBase64Cache = new Map<string, string | null>(); // URL → base64
const resolveImage: TuiMarkdownImageResolver = (image) => {
  const base64 = imageBase64Cache.get(image.src);
  if (!base64) return null; // 返回 null → 显示 alt 文本
  return { base64, originalBase64: base64, mime: "image/png", originalMime: "image/png" };
};

const content = [
  `Hero image: ![terminal fashion showcase](${dataUrl})`,
  `Remote image: ![showcase http](https://example.com/showcase.png)`,
  `Broken image: ![fallback alt text](https://example.com/missing.png)`,
].join("\n");

h(TMarkdownText, {
  x: 1,
  y: 1,
  w: 96,
  content,
  imageRenderer: resolveImage,
  imageActions: true, // 点击图片触发 imageAction（可做下载/放大等）
  imageMinWidth: 24,
  imageMaxWidth: 72,
  imageMinHeight: 12, // 不设 minHeight 时默认只有 1 行高，务必设置
  imageMaxHeight: 36,
  imagePreserveAspectRatio: true,
});
```

要点：

- `data:` URL 支持 `png` / `jpeg` / `gif` / `webp`，base64 由解析器自动提取，不需要 `imageRenderer`。
- `imageRenderer` 返回值：base64 字符串，或 `{ base64, originalBase64?, mime?, originalMime? }`，或 `null` / `undefined`（显示 alt 文本）。
- `imageActions` 开启后点击图片触发 `imageAction`，payload 带 `image`（含 `base64` / `originalBase64`，可用于下载保存）和 `rect`（图片所在 cell 区域，可定位菜单）。
- 尺寸 props 作用于该块内**所有**图片，做等比缩放；`imagePreserveAspectRatio: false` 时按格子拉伸。

## 快速开始 B：TAgentTerminalGraphic（通用图形组件）

需要直接控制一张图片/一个图形的渲染时用 `TAgentTerminalGraphic`（从 `@simon_he/vue-tui/agent` 引入）。它在 TUI buffer 里占用指定 cell rect，通过 `createStdoutRenderer()` 注册的 terminal graphics output 在帧末尾写入 raw escape payload。

```ts
import { TAgentTerminalGraphic, createPngTerminalGraphicRenderer } from "@simon_he/vue-tui/agent";

// 组合 Kitty / iTerm2 序列的 PNG renderer；sixel 需要额外 toSixel encoder
const pngRenderer = createPngTerminalGraphicRenderer({
  async toPngBase64(content, ctx) {
    // content：kind="image" 时是图片数据/引用；kind="math" 时是 TeX
    // ctx 里有 preferredProtocol、capabilities、imageId、placementId、signal
    return { base64: "iVBORw0KGgo...", cols: 72, rows: 12 };
  },
  fallback: (content) => "[image]", // 无图形协议时显示
});
```

```vue
<TAgentTerminalGraphic
  :x="0"
  :y="2"
  :w="72"
  :h="12"
  kind="image"
  content="..."
  fallback="[image]"
  :renderer="pngRenderer"
/>
```

要点：

- `renderer(content, context)` 返回 `{ type: "sequence", protocol, sequence, fallback?, clearSequence?, resizeSequence?, rows?, cols? }` 作为可信 escape，或 `{ type: "text", text }` 作为降级文本；返回 `null` / `undefined` / 抛错都显示 `fallback`（不进入错误态）。
- **安全边界**：组件只信任 renderer 返回的 `sequence`；bare string 一律按普通文本 fallback 处理，不会作为 raw escape 写入 stdout。
- `kind="math"` 可配合 KaTeX/LaTeX 渲染器（见 [Markdown 数学公式渲染](/guide/markdown-math)）。
- 滚动/懒渲染场景：`deferRenderUntilVisible`、`suspendRenderWhileScrolling` / `suspended`、`createTerminalGraphicRenderQueue()` 控制并发、缓存与取消。

## 快速开始 C：Mermaid 图片（TMermaidImage）

`TMermaidImage` 把 mermaid 源码渲染成 PNG 并通过图形协议显示，实现方式与 KaTeX 数学公式图片一致：`beautiful-mermaid`（`renderMermaidSVGAsync`，零 DOM 依赖）→ `@resvg/resvg-js` → PNG → Kitty / iTerm2 sequence。依赖都是 optional peer，懒加载。

```ts
import { TMermaidImage } from "@simon_he/vue-tui/agent/mermaid";
import { h } from "vue";

h(TMermaidImage, {
  x: 0,
  y: 0,
  w: 72,
  content: `graph TD
  Prompt --> Plan
  Plan --> ToolCall
  ToolCall --> Answer`,
  // 可选：h 省略时按图片宽高比自适应；maxWidthCells / maxHeightCells 限制最大格数
});
```

要点：

- 终端不支持图形协议、stdout 非 TTY、tmux/screen/zellij 未开 passthrough、或 rasterizer 缺失时，自动降级：传了 `textRenderer` 则尝试 **ANSI 文本图**，否则显示**原始 mermaid 源码**（不会报错）。
- **Kitty 图形协议下支持缩放 + 拖拽平移**：`Ctrl`（浏览器里 `Cmd` 也可）+ 滚轮以鼠标为中心缩放，放大后可直接拖拽平移；不带修饰键的滚轮透传给外层滚动容器，不拦截历史消息滚动。
- **点击图片区域或 header 的 copy 按钮，复制完整 mermaid raw content**（触发 `copy` 事件，payload 带 `text`）。
- 自定义渲染管线：传 `renderer`（`TuiMermaidImageRasterizer`），返回 `{ base64, widthCells, heightCells, naturalWidth?, naturalHeight? }` 或 `null`。
- 模块级缓存/门控 API（`getMermaidImage` / `getCachedMermaidImage` / `loadMermaidImageRenderer` / `isMermaidImageRendererReady` / `setMermaidImageRasterizer` / `clearMermaidImageCache` / `subscribeMermaidImage`）与 math-image 对齐，便于在 markdown 等宿主里复用同一张缓存图。
- 仅支持 kitty / iterm2；sixel 终端会走源码降级（`createTerminalGraphicPngSequence` 不产 sixel）。

## 能力检测与诊断

```ts
import { detectTerminalGraphicsCapabilities } from "@simon_he/vue-tui/agent";

const caps = detectTerminalGraphicsCapabilities();
console.log(caps.protocol); // "kitty" | "iterm2" | "sixel" | "unicode" | "none"
console.log(caps.supported); // boolean
console.log(caps.preferredProtocol);
console.log(caps.reason); // 为什么走了当前路径
console.log(caps.stdoutIsTTY, caps.multiplexer, caps.passthrough);
```

一条命令输出完整诊断（协议、原因、环境变量、以及数学公式渲染栈状态）：

```bash
npx tsx scripts/check-math-graphics.ts
```

### 环境变量

| 变量                                                                          | 值                                                        | 说明                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| `VUE_TUI_TERMINAL_GRAPHICS` / `VUE_TUI_GRAPHICS_PROTOCOL`                     | `auto` / `off` / `kitty` / `iterm2` / `sixel` / `unicode` | 手动指定协议；`off` 禁用，`unicode` 强制文本     |
| `VUE_TUI_GRAPHICS_FORCE`                                                      | `1`                                                       | 强制启用（跳过 TTY / CI / 复用器检查，用于调试） |
| `VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH` / `VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH` | `1`                                                       | 在 tmux 里开启 passthrough 转发                  |
| `VUE_TUI_SIXEL` / `VUE_TUI_GRAPHICS_SIXEL`                                    | `1`                                                       | 手动声明 sixel 能力                              |

## 降级与多路复用器

像素组件在以下情况自动降级为文本，不会报错：

| 场景                         | 行为                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 终端不支持图形协议           | `TAgentTerminalGraphic` / Markdown 内嵌图形显示 `fallback` / alt 文本                                                                        |
| stdout 不是 TTY（管道/CI）   | 同上                                                                                                                                         |
| 在 tmux / screen / zellij 中 | 图形协议默认关闭（复用器不转发）。tmux 可开 passthrough：`VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH=1`；screen/zellij 退出复用器或使用支持转发的终端 |
| 只有 sixel 终端              | `TVideo` / `T3DViewport` 像素帧路径不支持 sixel，降级为 `gray8` ASCII art；`TAgentTerminalGraphic` 仍可用（需 `toSixel` encoder）            |

生产环境建议同时 smoke test 有/无图形协议两种终端（Kitty 原生、iTerm2 inline image、tmux passthrough、CI/非 TTY）。

## Markdown 图片 Props

`TMarkdownText` 与 `TVirtualMarkdown` 共用以下图片相关 props：

| Prop                                | 类型                       | 默认        | 说明                                                    |
| ----------------------------------- | -------------------------- | ----------- | ------------------------------------------------------- |
| `imageRenderer`                     | `TuiMarkdownImageResolver` | `undefined` | 把 `http(s)` / `file:` / `blob:` 图片 URL 解析为 base64 |
| `imageMinWidth` / `imageMaxWidth`   | `number`                   | `undefined` | 图片显示宽度范围（格子），超范围等比缩放                |
| `imageMinHeight` / `imageMaxHeight` | `number`                   | `undefined` | 图片显示高度范围（格子）；建议 `imageMinHeight` ≥ 3     |
| `imagePreserveAspectRatio`          | `boolean`                  | `true`      | 按原始宽高比缩放；`false` 时拉伸到限制范围              |
| `imageActions`                      | `boolean`                  | `false`     | 开启后点击图片触发 `imageAction`                        |
| `imageOcclusionRects`               | `Rect[]`                   | `undefined` | 遮盖区域（如悬浮菜单），图片点击命中会跳过这些区域      |

## TAgentTerminalGraphic 关键 Props

| Prop                                                       | 类型                            | 默认            | 说明                                                              |
| ---------------------------------------------------------- | ------------------------------- | --------------- | ----------------------------------------------------------------- |
| `x` / `y` / `w` / `h`                                      | `number`                        | —（x/y/w 必填） | 图片占用的 cell rect；`h` 省略时用 renderer 返回的 `rows` 推导    |
| `kind`                                                     | `"image"` / `"math"`            | `"image"`       | 图形类型                                                          |
| `content`                                                  | `string`                        | —（必填）       | 传给 renderer 的内容（图片数据 / TeX）                            |
| `renderer`                                                 | `TAgentTerminalGraphicRenderer` | `undefined`     | 返回可信 escape 序列或降级文本                                    |
| `fallback`                                                 | `string`                        | `undefined`     | 无协议 / renderer 返回空 / 抛错时显示；`kind="image"` 默认空文本  |
| `deferRenderUntilVisible`                                  | `boolean`                       | `true`          | 滚动/隐藏时不渲染                                                 |
| `suspendRenderWhileScrolling` / `suspendRawWhileScrolling` | `boolean`                       | `true`          | 滚动期间暂停渲染/暂停 raw 重绘                                    |
| `placementMoveWithoutClear`                                | `boolean`                       | `false`         | 高级 Kitty-only opt-in；仅用于同一图片和可复用 placement sequence |
| `zIndex`                                                   | `number`                        | `0`             | Kitty placement z-index                                           |
| `trace`                                                    | `(event) => void`               | `undefined`     | 渲染过程 trace 事件（调试用）                                     |

Markdown 图片和 `TMermaidImage` 会在 Kitty 协议下自动使用 placement-only 移动，调用这些组件时不需要传 `placementMoveWithoutClear`。直接使用 `TAgentTerminalGraphic` 时该 prop 默认仍是 `false`；只有自定义 renderer 在内容未变化时保持相同 Kitty image id，并提供可复用的 placement/resize sequence，才应显式开启。`TVideo`、GIF 帧和 `T3DViewport` 等内容持续变化的场景不应为了这次优化打开它。

## 常见问题

### 终端里只显示 alt 文本 / fallback，没有图片

按优先级检查：

1. **终端不支持图形协议**：Kitty、Ghostty、WezTerm、foot、iTerm2 支持；纯 xterm、CI 输出不支持。用 `detectTerminalGraphicsCapabilities()` 看 `reason`。
2. **在 tmux / screen / zellij 里运行**：退出复用器，或 tmux 开 `VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH=1`。
3. **stdout 不是 TTY**：管道 / 重定向 / CI 下不会启用。
4. **`imageRenderer` 返回了 `null`**（Markdown 图片）：确认 URL 在缓存里、字节读取成功、返回的是合法 base64。
5. **Sixel 终端缺 encoder**：`TAgentTerminalGraphic` 需要 `toSixel`；`TVideo` / `T3DViewport` 不支持 sixel 像素帧。
6. **图片高为 1 格**（Markdown）：没有设置 `imageMinHeight`，默认高度只有 1 行，设置 `imageMinHeight` ≥ 3。

### 图片太大 / 太小 / 变形

- 设置 `imageMinWidth` / `imageMaxWidth` / `imageMinHeight` / `imageMaxHeight` 约束格子范围。
- 变形时确认 `imagePreserveAspectRatio` 为 `true`（默认），并确认 PNG 文件头可读（内置尺寸解析失败会回退为 1:1 格子）。
- `TAgentTerminalGraphic` 场景调 `createPngTerminalGraphicRenderer` 里 `toPngBase64` 返回的 `cols` / `rows`，或传 `h` 显式指定占用高度。

### 图片是旧的 / 不更新

- PNG 转换、renderer 结果有缓存：`createPngTerminalGraphicRenderer` 的默认 cache key 覆盖 kind、尺寸、`final`、content/组件 `cacheKey` 和 renderer `cacheSalt`。内容变化请更新组件 `cacheKey`；fallback 依赖协议/主题/字体等时传 `cacheSalt` 或自定义 `cacheKey()`。

### 安全

- 组件只把 renderer 返回的 `{ type: "sequence" }` 当作 raw escape 写入 stdout；bare string 只作为文本 fallback，杜绝 escape injection。
- 图片 URL 会经过 `sanitizeMarkdownImageSource` 校验（仅 `png` / `jpeg` / `gif` / `webp` 的 `data:` URL 被接受，`blob:` / `file:` 走 URL 规范化），并限制 base64 与序列长度。

## Related Pages

- [Markdown 数学公式渲染](/guide/markdown-math)（公式 → 图片，同一图形协议链路）
- [终端视频渲染](/guide/terminal-video)（同一图形协议链路下的视频帧）
- [Mermaid 图渲染](/guide/mermaid-rendering)
- [Platform Contracts](/platform-contracts)（协议矩阵、组件降级表）
- [Markdown Transcript](/guide/markdown-transcript)
- [Components](/components)（`TAgentTerminalGraphic`、`TVideo`）
