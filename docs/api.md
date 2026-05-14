# API

本文件描述当前实现的核心 API 与事件对齐约定，目标是让你“像写浏览器里的 Vue3”一样写 terminal UI。

## Core

### `createTerminal({ cols, rows })`

创建一个内存终端实例（buffer + cursor + scrollback）。

主要方法：

- `write(text, { x, y, style })`：写入文本（可省略 `x/y` 使用 cursor）
- `writeAnsi(text, { x, y })`：写入 ANSI 文本（支持 16/256/truecolor）
- `put(x, y, ch, style)` / `fill(x, y, w, h, ch, style)` / `clear(...)`
- `resize(cols, rows)` / `scroll(lines)`
- `batch(fn)` / `commit({ planes? })`：批量更新与提交
- `snapshot()`：获取可视区域文本快照
- `getScrollbackLines(count?)` / `setScrollbackLimit(limit)`：scrollback 基础能力

补充说明：

- `commit()` 的返回值仍然是 `dirtyRows`
- `commit` 事件现在还会带上 `planes`
- 如果不传 `planes`，等价于提交所有 plane

### `TERMINAL_RENDER_PLANES` / `TerminalRenderPlane`

框架内置 4 个 plane：

- `default`
- `transcript`
- `chrome`
- `overlay`

对应导出：

- `TERMINAL_RENDER_PLANES`
- `TerminalRenderPlane`
- `TerminalRenderPlanes`

这是 TUI 当前 plane-scoped compositor 的公共语义边界。更完整的架构说明见：[Planes 与 Compositor](/planes-and-compositor)。

### `Style`

```ts
type Style = {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  href?: string;
};
```

`fg` / `bg` 推荐使用 `AnsiColorName`（16 色，如 `whiteBright` / `blue`）、hex（如 `#79c0ff`）或 `transparent`。未知颜色会被 renderer 忽略或回退到默认颜色。

`href` 表示 hyperlink 目标。stdout renderer 会在通过 `sanitizeTerminalHref()` 后输出 OSC8 链接；DOM renderer 默认只把 `http:`、`https:`、`mailto:` 渲染为 `<a>`，并阻止原生导航。若宿主需要打开链接，可传 `links.onActivate` 或设置 `links.activation: "native"`。相对 href 会按普通文本渲染；若宿主信任内容并希望启用相对链接，可传 `<TerminalProvider :dom-renderer-options="{ links: { allowRelative: true } }" />`；unsafe href 始终按普通文本渲染。

## Renderer (DOM)

### `createDomRenderer(terminal, container)`

将 `terminal` 渲染到 DOM 容器：

- 行级 diff + span 合并
- rAF 合并 dirtyRows 渲染
- 字体度量（cellWidth/cellHeight）+ resize 重建
- container 默认写入 browser accessibility contract（`role="application"`、`aria-label="Terminal"`、`aria-live="off"`）；可通过 `DomRendererOptions.accessibility` 覆盖或关闭
- renderer instance 暴露 `capabilities`，组件只能通过 capability 判断 DOM row、scroll operation、sync flush 支持

更完整的 renderer / ARIA / terminal permission 边界见：[Platform Contracts](/platform-contracts)。

## Events

### `createEventManager(container, metrics)`

负责把 DOM 事件映射为 terminal 事件并派发到注册节点：

- 命中测试：rect + zIndex
- 支持冒泡/捕获（通过 `*Capture` handler）
- `stopPropagation()` / `preventDefault()` 行为与 DOM 一致
- `keydown/keyup` 事件提供 `combo`（如 `Meta+Shift+ArrowLeft`）

### selectable vs focusable

- `focusable: true` 的节点默认禁用原生文本选择（避免影响交互）
- `selectable: true` 可显式允许在交互节点内选择文本

## Vue Layer

### `<TerminalProvider />`

提供 `terminal/renderer/events/runtime` 注入：

- `cols/rows`：初始尺寸
- `autoResize/minCols/minRows`：可选，基于 `ResizeObserver` 自动 resize
- `selection`：开启 DOM terminal cell selection / mouseup auto-copy
- `clipboard`：为 selection auto-copy 注入自定义 `ClipboardApi`；未传时 browser 使用 `navigator.clipboard`，terminal/runtime 默认不启用
- `inputPlugins`：给子树中的 `TInput` 统一注入宿主/平台插件
  - 默认 host plugin 只负责 clipboard / TTY / path 这类底层能力；toast 之类 UI 反馈应由宿主通过 `createTInputHostPlugin({ showToast })` 显式补充
- `pathPickerProvider`：给子树中的 `TPathPicker` 统一注入宿主路径 provider

补充说明：

- `scheduler.invalidate()` 现在支持 `plane`
- `scheduler.queueFrameTask()` 用于把同一帧内的 wheel/input/stream 高频任务按 `id` 合并后再执行
- `scheduler.requestLive(reason)` 返回 release 函数；也可以用 `dropLive(reason)` 释放 live lease
- `runtime.mount()` 现在支持 `{ plane }`
- `debugTrace` 打开后，trace 中的 `commit` 记录会带 `planes`

### `createTerminalApp()`

提供一个 headless Vue App（用于 CLI / 测试），并注入与 `<TerminalProvider />` 一致的 `terminal/events/scheduler/runtime`：

- `createTerminalApp({ cols, rows, component, props?, defaultStyle?, clipboard?, inputPlugins?, pathPickerProvider? })`
- 返回：`{ app, terminal, events, scheduler, mount(), dispose() }`

可在 `mount()` 前安装插件（如 Pinia）：

```ts
import { createTerminalApp } from "@simon_he/vue-tui/cli";

const pinia = createPinia();
const t = createTerminalApp({ cols: 80, rows: 24, component: App });
t.app.use(pinia);
t.mount();
```

多终端共存：

- 共享 store：多个 `createTerminalApp()` 使用同一个 pinia 实例
- 隔离 store：每个 `createTerminalApp()` 使用不同 pinia 实例

plane 相关：

- `scheduler.invalidate({ plane })`：把本轮刷新归到指定 plane
- `scheduler.queueFrameTask(task)`：下一帧先执行 task，再根据 task 内的 `ctx.invalidate()` render/commit；`flushNow()` 会先 drain pending frame tasks；返回 `false` 表示 scheduler 显式拒绝，producer 必须清理本地 pending state；返回 `true` 或 `undefined` 都表示已接受，其中 `undefined` 用于兼容旧 scheduler
- `scheduler.cancelFrameTask(id)`：best-effort 取消。task 可能已被当前 frame snapshot 取走，所以 `run()` 内仍要 guard stale/disposed state。
- `queueFrameTask()` 的 `task.id` 是整个 `TerminalProvider` / `createTerminalApp` scheduler 级别的全局 coalescing key，不会因为 `TRenderPlane` 自动加 namespace。跨 plane 使用相同 id 会互相覆盖；如需 plane-local coalescing，请自行把 plane 写入 id。
- frame task context 里的 `reportDroppedUpdates(count)` 是内部观测 hook，用于把 mailbox / producer 合并掉的中间态计入 frame perf；它不表示数据可靠送达。
- `runtime.mount(Component, props, { plane })`：命令式挂载到指定 plane
- `terminal.commit({ planes })`：只提交某些 plane 的变化

### RenderManager dirty rows

`render.markDirtyRows(id, rows)` 是热路径 repaint primitive：

- `rows` 必须是 terminal absolute Y，不是组件局部 row index。
- dirty rows 只作用于该 render node 当前所在 plane。
- 对有 rect 的 node，rect 外 rows 会被忽略；`NaN`、`Infinity` 和 terminal bounds 外 rows 也会被忽略。
- partial repaint 会重绘同 plane 中与 dirty rows 相交的 nodes，并按原 z-order paint，不只是重绘调用 `markDirtyRows()` 的 node。
- `dirtyRowsHint` 和 `paint(dirtyRows)` 的 rows 必须同步消费，组件不能保存数组引用，因为 RenderManager 可以传入 scratch buffer。
- `paint(dirtyRows)` 收到 `undefined` 表示 full repaint；收到数组表示只 repaint 这些 absolute terminal rows。

### `<TRenderPlane />`

为一整棵子树切换 render plane，并自动把下列能力绑定到该 plane：

- `terminal`
- `scheduler.invalidate()` / frame task 中的 `ctx.invalidate()`
- `runtime.mount()`

最常见的用法是把正文、状态栏和弹层分开：

```vue
<TerminalProvider :cols="80" :rows="24">
  <TRenderPlane plane="transcript">
    <ChatMessages />
  </TRenderPlane>

  <TRenderPlane plane="chrome">
    <FooterStatus />
  </TRenderPlane>

  <TRenderPlane plane="overlay">
    <TDialog v-model="open" :w="48" :h="12" />
  </TRenderPlane>
</TerminalProvider>
```

`TRenderPlane` 本身不负责布局，只负责切换子树所处的 plane。

`TRenderPlane.plane` 在 mount 后按 immutable 处理；如果需要移动子树，请用 plane 作为 key 重新挂载：

```vue
<TRenderPlane :key="activePlane" :plane="activePlane">
  <PaneBody />
</TRenderPlane>
```

不要依赖动态修改 `plane` prop 迁移已 mount subtree；tab switching、dialog migration 或 animation plane 迁移都应 key remount。frame task / mailbox id 仍是 scheduler-global，不会自动加 plane namespace。

frame task 中的 `ctx.invalidate()` 默认绑定到 mounted plane。显式传入 `plane: undefined` 会跳出 mounted plane，在 root scheduler 中按 all-plane invalidate 处理。

### `createTInputHostPlugin(adapter)`

把宿主能力打包成 `TInput` 插件，交给 `inputPlugins` 或局部 `plugins` 注入。

`adapter` 常见可实现的能力：

- `readClipboardText()` / `writeClipboardText(text)`
- `showToast(message)`
- `resolvePath({ workspace, input, preserveBackslash, homeDir })`
- `pathToHref(pathLike)`
- `isTerminalLike`

补充说明：

- `createDefaultTInputHostAdapter()` 从 `@simon_he/vue-tui/cli` 导出，提供默认的 Node-like clipboard/path 行为
- 默认 host plugin 不再附带 UI toast；`Copied` 这类反馈应由宿主显式实现 `showToast`
- 高级宿主如果希望在子树范围内组合输入插件，也可以直接使用公开导出的 `TInputPluginsContextKey`

一个常见组合方式：

```ts
import { createTInputHostPlugin } from "@simon_he/vue-tui";
import { createDefaultTInputHostAdapter } from "@simon_he/vue-tui/cli";
import { createTerminalApp } from "@simon_he/vue-tui/cli";

const baseHost = createDefaultTInputHostAdapter();

const app = createTerminalApp({
  cols: 80,
  rows: 24,
  component: App,
  inputPlugins: [
    createTInputHostPlugin({
      ...baseHost,
      showToast: (message) => toastStore.show(message),
    }),
  ],
});
```

### Clipboard providers

`ClipboardApi` 可由宿主显式注入到 runtime、DOM provider 或 terminal app：

```ts
import { createOsc52ClipboardProvider, createTerminalApp } from "@simon_he/vue-tui/cli";

const app = createTerminalApp({
  cols: 80,
  rows: 24,
  component: App,
  clipboard: createOsc52ClipboardProvider(),
});
```

默认 terminal runtime 不会自动执行系统剪贴板命令；OSC52 也只有在显式使用 `createOsc52ClipboardProvider()` 时才会写入 stdout。

### 布局组件

- `<TView x y w h />`：绝对布局容器（提供局部坐标系）
- `<TAnchor left/top/right/bottom w h />`：锚定布局（依赖父 clipRect）
- `<TFlow :items ...>`：基础 flow 布局（基于 itemSize/gap 生成子 view）

### 基础绘制组件

- `<TText />`：响应式写入
- `<TBox />`：边框 + padding + contentRect 裁剪

### `<TTransition />`

- `show`：控制子树挂载/卸载（leave 完成后卸载）
- `duration`：过渡时长（ms）
- hooks：`beforeEnter/enter/afterEnter/beforeLeave/leave/afterLeave`
- slot：`{ phase, progress }`（`phase: enter|leave|idle`, `progress: 0..1`）

### 交互组件

- `<TInput v-model />`：
  - 光标移动：方向键、Option/Alt 跳词、Cmd/Ctrl 行首行尾
  - Shift 扩展选区
  - 支持 IME（composition）与 paste
  - paste 语义：按原样插入（包括多行 `\n`）；如需单行输入，请在 `@paste`/`@beforeinput` 中自行 sanitize
  - 受控模型规则（`modelValue` 为真值源）：
    - composing 期间只展示临时 composition 文本，不会在 `compositionupdate` 时修改 `modelValue`
    - composing 期间若外部更新了 `modelValue`（Pinia/props），会取消本次 composition 并忽略后续 composition 事件，避免双写/错位
  - `cursorBlink/cursorShape` 控制 caret
  - 宿主能力（例如 terminal clipboard、TTY 风格快捷键）推荐通过 `inputPlugins` 注入，而不是写死在组件本体
  - `Copied` 这类 UI toast 不属于默认宿主能力；如果需要，宿主应显式注入 `showToast`
  - prompt / mention 浮层推荐通过 `createPromptMentionPlugin({ mentionSuggestionProviders, mentionPathProvider })` 注入；Node 宿主可直接复用 `createNodeMentionPathProvider()`
- `<TPathPicker />`：
  - 本体只负责输入、列表和导航，路径解析/补全/文件系统语义推荐通过 `provider` 或 `pathPickerProvider` 注入
  - CLI / Node 宿主可直接复用 `createNodePathPickerProvider()`
- `<TSelect />` / `<TList />`：
  - `autoFocus` 打开后自动接收键盘
  - `<TSelect />`：上下键切换，Enter 选择
  - `<TSelect multiple />`：上下键移动光标，Space 切换勾选，Enter confirm；`v-model` 使用 `number[]`；`multipleEmit='value|index|both'` 控制 `@change/@confirm` 参数（默认 `value`）
  - `<TList />`：上下键切换，wheel 滚动

### 事件对齐（关键点）

- 事件名与 Vue3 DOM 风格一致：`@click`, `@keydown` 等
- `.capture`：映射到 `*Capture`（例如 `@click.capture` -> `clickCapture`）
- `.stop/.prevent/.once`：由 Vue 包装调用，对应 `stopPropagation/preventDefault`

## Observability

### `createTraceStore()`

trace store 会记录：

- event
- focus
- commit

其中 `commit` 记录现在包含：

- `dirtyRows`
- `planes`
- `focusedId`

### TUI profiler

开启 `VUE_TUI_PROFILE=1` 后，profiler 会输出；`DIMCODE_PROFILE_TUI` 仍作为 legacy alias 保留：

- invalidates
- renders
- writes
- `planes.invalidate`
- `planes.render`

这让你可以区分：

- 是 `chrome` 在刷新
- 还是 `transcript` 在刷新
- 某次 render 是否真的只命中了目标 plane

## Utilities

### `ansiStyles`

框架导出 `ansiStyles`（内置轻量实现）用于生成 ANSI 片段字符串，配合 `writeAnsi()` 使用。

### `detectTerminalColorCapability({ env, isTTY, platform })`

用于检测终端颜色能力（供 CLI/TUI 共用），返回：

```ts
type TerminalColorMode = "truecolor" | "ansi256" | "ansi16" | "ansi8";
type TerminalColorLevel = 256 | 16 | 8;
type TerminalColorCapability = {
  mode: TerminalColorMode;
  level: TerminalColorLevel;
};
```

- 环境覆盖：`VUE_TUI_COLOR_MODE` / legacy `DIMCODE_COLOR_MODE`
- 主题分档按 `level`（`truecolor` 折算为 `level=256`）
- `platform` 可传 `process.platform`，用于 Windows 终端能力的更准确判断
