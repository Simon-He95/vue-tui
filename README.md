# Vue Terminal

用 Vue 组件语法绘制和交互的终端渲染框架。目标是让 “终端” 具备：

- 类终端的写入/删除/更新/尺寸调整能力
- ANSI 样式渲染（颜色、加粗、下划线等）
- 事件机制（点击、移动、滚动、拖拽）
- Vue 组件 + 响应式数据驱动终端界面更新

## 快速开始

## 运行环境

- **Node.js >= 18**
- `@simon_he/vue-tui/markdown` 依赖 `stream-markdown-parser` / `markdown-it-ts` 链路，因此当前包发布面已统一到 Node 18。

### 浏览器渲染

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { TerminalProvider, TBox, TInput, TText, useLayout } from "@simon_he/vue-tui";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 80);
const rows = computed(() => layout.clipRect?.h ?? 24);
const input = ref("");
</script>

<template>
  <TerminalProvider :cols="80" :rows="24" :default-style="{ fg: 'whiteBright' }">
    <TBox
      :x="0"
      :y="0"
      :w="80"
      :h="24"
      border
      title="Demo"
      :padding="1"
      :style="{ fg: 'blueBright' }"
    >
      <TText :x="0" :y="0" :w="78" :value="`cols=${cols} rows=${rows}`" />
      <TInput :x="0" :y="20" :w="78" v-model="input" placeholder="Type..." />
    </TBox>
  </TerminalProvider>
</template>
```

## 组件文档与验收标准

- VitePress 文档站点（本地）：`bun run --filter '@simon_he/vue-tui' docs:dev`（入口 `docs/index.md`）
- 组件使用文档：`docs/components.md`
- 组件 Props/Events（自动生成）：`docs/generated/components-api.md`（脚本：`scripts/generate-component-api-docs.ts`）
- 组件验收标准（可信赖组件定义 + 测试范围）：`docs/components-acceptance.md`
- Terminal 兼容性与颜色一致性：`docs/terminal-compatibility.md`
- 性能关注点与回归策略：`docs/performance.md`

### 终端（真实 CLI）渲染

内置 `vue-terminal run`，直接在真实终端中跑 UI（stdout renderer + stdin driver）：

```bash
pnpm build
node cli.mjs --app basic
```

## 示例工程

```bash
# 浏览器示例（交互测试）
pnpm -C examples/basic dev

# 打包 browser
pnpm build:examples

# 打包成 terminal 产物并运行
pnpm build:examples:terminal
pnpm run:basic:terminal

# 运行完整 experimental TLogView Lab
pnpm run example:tlog-view-lab

# 交互运行 TLogView Lab
pnpm run run:tlog-view-lab
```

terminal 构建产物会生成 `dist-terminal/terminal.js`，可以直接作为 `bin` 入口使用。

## 核心概念

- Buffer: 以 Cell 网格存储字符与样式，负责最小化更新
- Renderer: 将 Buffer diff 渲染为 DOM（后续可扩展 canvas）
- EventManager: DOM 事件 -> cell 坐标 -> 命中测试 -> 派发给组件
- Vue Layer: 提供 `TerminalProvider` 与内置组件 (TText/TBox/TView)
- UI Layer: 通用组件与指令（`select`, `v-if`, `v-show` 等）
- Vue3 对齐: 事件名称/修饰符/行为尽量与浏览器 Vue3 保持一致

## 模块分层（建议结构）

```
src/
  core/
    buffer/       # Cell 网格、dirty 标记、宽字符
    terminal/     # Terminal API（write/clear/resize/batch/commit）
    ansi/         # ANSI 解析 -> Style
  renderer/
    dom/          # 行/Span 渲染、diff 更新
  events/
    manager/      # 坐标映射、hit test、事件派发
  vue/
    components/   # TerminalProvider, TText, TBox, TView
    composables/  # useTerminal, useTerminalNode
    directives/   # v-if, v-show, v-model, v-focus 等
    runtime/      # 动态插入、组件工厂、命令式渲染
```

## 数据流

```
Vue 组件 -> Terminal API -> Buffer -> Diff -> Renderer -> DOM
DOM 事件 -> EventManager -> HitTest -> Vue 组件事件回调
```

## 核心数据结构（设计草案）

```ts
type Style = {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
};

type Cell = {
  ch: string;
  style: Style;
  width: 1 | 2; // 宽字符支持
};

type Buffer = {
  rows: Cell[][];
  cols: number;
  rowsCount: number;
  dirtyRows: boolean[];
};
```

## 终端语义范围（初版约束）

- `write()` 默认不解析 ANSI，仅做“就地写入”，越界裁剪
- `writeAnsi()` 解析 ANSI 样式与基础控制序列
- 光标与换行：`write()` 未提供 `x/y` 时使用内部 cursor，带 `x/y` 不更新全局 cursor
- `scroll()` 仅滚动可视区域（是否保留 scrollback 由实现决定）

## Viewport 与 Scrollback（建议）

- Buffer 区分 viewport（可视区域）与 scrollback（历史区域）
- cursor 驱动写入在底部时超出触发滚动
- `scroll(lines)` 只移动 viewport，不影响 buffer 内容
- 支持 `scrollTo()` 与 scrollback 上限（内存可控）

## Terminal API（设计草案）

```ts
interface Terminal {
  resize(cols: number, rows: number): void;
  clear(x?: number, y?: number, w?: number, h?: number): void;
  write(text: string, opts?: { x?: number; y?: number; style?: Style }): void;
  writeAnsi(text: string, opts?: { x?: number; y?: number }): void;
  put(x: number, y: number, ch: string, style?: Style): void;
  fill(x: number, y: number, w: number, h: number, ch?: string, style?: Style): void;
  scroll(lines: number): void;
  setCursor(x: number, y: number, visible?: boolean): void;
  batch(fn: () => void): void;
  commit(): void;
  on(event: TerminalEvent, cb: (e: TerminalEventPayload) => void): () => void;
  dispose(): void;
}
```

## 事件模型（设计草案）

- 事件名称与 Vue3 DOM 事件对齐（`@click`, `@keydown`, `@input` 等）
- DOM 事件转换为 cell 坐标 (cellX/cellY)
- hit test 查找当前坐标命中的节点 (支持 zIndex)

```ts
type TerminalEvent =
  | "click"
  | "dblclick"
  | "contextmenu"
  | "pointerdown"
  | "pointerup"
  | "pointermove"
  | "pointerenter"
  | "pointerleave"
  | "mousedown"
  | "mouseup"
  | "mousemove"
  | "mouseenter"
  | "mouseleave"
  | "wheel"
  | "keydown"
  | "keyup"
  | "input"
  | "change"
  | "compositionstart"
  | "compositionupdate"
  | "compositionend"
  | "focus"
  | "blur"
  | "drag";

type TerminalBaseEvent = {
  type: TerminalEvent;
  target: TerminalNode | null;
  currentTarget: TerminalNode | null;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  timeStamp: number;
  stopPropagation(): void;
  preventDefault(): void;
  nativeEvent?: Event;
};

type TerminalPointerEvent = TerminalBaseEvent & {
  clientX: number;
  clientY: number;
  cellX: number;
  cellY: number;
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  deltaY?: number;
};

type TerminalKeyboardEvent = TerminalBaseEvent & {
  key: string;
  code: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
};
```

## 事件派发与冒泡（建议）

- 默认冒泡，支持 `stopPropagation()`/`preventDefault()`，语义与 DOM 一致
- 支持捕获阶段（可选），用于全局拦截（与 `.capture` 对齐）
- 拖拽使用 pointer capture，保证按下后持续命中
- 支持 `contextmenu` 事件（右键菜单）

## 事件桥接（建议）

- Terminal 事件与 Vue 组件事件做统一归一化
- 事件路径包含命中节点链，便于冒泡与拦截
- `pointer` 事件优先于 `mouse`，便于兼容触控

## Vue3 浏览器事件对齐（约定）

- 事件名称：与浏览器 DOM 事件一致（`click`, `keydown`, `input`, `focus` 等）
- 事件修饰符：支持 `.stop` `.prevent` `.capture` `.once` `.passive` `.self` `.exact`
- 键盘修饰符：`.ctrl` `.shift` `.alt` `.meta` `.enter` `.esc` 等与 Vue3 行为一致
- 指针/鼠标：`pointer*` 优先，`mouse*` 兼容；`clientX/clientY` 保留
- 事件对象：保留原生字段，并额外提供 `cellX/cellY` 与 `nativeEvent`
- `v-model`：保持 `modelValue` + `update:modelValue` 的 Vue3 约定

## 事件映射表（核心字段）

```
DOM Mouse/Pointer Event -> TerminalPointerEvent
- clientX/clientY 保留，额外提供 cellX/cellY
- button/buttons/ctrlKey/shiftKey/altKey/metaKey 保留
DOM Keyboard Event -> TerminalKeyboardEvent
- key/code/repeat/ctrlKey/shiftKey/altKey/metaKey 保留
DOM Input/Composition Event -> TerminalBaseEvent
- inputType/data 通过 nativeEvent 获取
```

## `@input` / `@change` 触发规则（建议）

- `TInput` 输入过程中触发 `input`，提交时触发 `change`
- `compositionstart/update/end` 与浏览器一致，结束后触发一次 `input`
- `v-model` 绑定：`input` 时更新 `modelValue`，`change` 作为提交确认

## Pointer Capture / Focus / Blur 规则（建议）

- `pointerdown` 后启用捕获，直到 `pointerup` 释放
- `focus` 由点击或 `v-focus` 触发，`blur` 由切换焦点或卸载触发
- `focusin/focusout` 可选支持，用于冒泡式焦点事件

## Vue 组件层（设计草案）

```vue
<TerminalProvider :cols="80" :rows="24">
  <TView :x="2" :y="2" :w="20" :h="5" @click="onClick">
    <TText :value="title" :style="{ fg: 'green' }" />
    <TBox border />
  </TView>
</TerminalProvider>
```

- `TerminalProvider`: 创建 terminal、绑定 renderer 和 event manager
- `TView`: 提供局部坐标系、事件区域、zIndex
- `TText`: 响应式写入文字
- `TBox`: 绘制边框、标题

## 通用组件与指令

- 通用组件：`TSelect`, `TInput`, `TList`, `TTable`, `TDialog`
- 指令：
  - `v-if`: 条件渲染/卸载组件，释放 buffer 区域
  - `v-show`: 仅隐藏展示，保持节点存在以保留事件与状态
  - `v-model`: 绑定 `TInput` 文本与光标状态
  - `v-focus`: 让组件获得焦点（键盘输入）

## 动态插入组件（命令式）

支持在事件回调中插入组件，例如监听 `input` 后插入 `TSelect`。
通过 `useTerminalRuntime()` 或 `createPortal()` 提供命令式入口。

```ts
const { mount } = useTerminalRuntime();

function onInputCommit(value: string) {
  if (value.startsWith("/")) {
    mount(TSelect, {
      x: 2,
      y: 10,
      w: 20,
      h: 6,
      options: ["a", "b", "c"],
      onSelect: (v) => console.log(v),
    });
  }
}
```

约束：

- 动态插入的组件必须显式提供布局 (x/y/w/h) 或依赖父容器布局
- 插入/卸载会触发局部重绘，不影响其它区域

## 命令式渲染协议（建议）

- `mount()` 返回 handle，包含 `update()` / `unmount()` / `move()` 等操作
- 允许传入 `key` 复用实例，避免频繁销毁
- `TerminalProvider` 卸载时自动清理所有命令式节点

```ts
type TerminalHandle = {
  update: (props: Record<string, unknown>) => void;
  move: (x: number, y: number) => void;
  unmount: () => void;
};
```

## 组件生命周期与资源管理（建议）

- 挂载：注册事件节点、占用 buffer 区域、写入初始内容
- 更新：清理旧区域 + 写入新内容，保持最小 dirty 范围
- 卸载：释放事件节点、清理 buffer 区域、移除焦点/输入绑定

对 `v-if`/`v-show` 的行为约定：

- `v-if`: 触发卸载与资源释放（清 buffer、解绑事件）
- `v-show`: 仅隐藏渲染，保留节点与状态（不解绑事件）

## 焦点与输入协议（建议）

- 引入 focus manager，维护当前焦点组件
- `v-focus`/`focus()` 触发焦点切换，自动更新光标样式
- 键盘事件仅派发给焦点组件
- `TInput` 需要处理：
  - 文本插入、删除、移动光标
  - 组合输入（IME）阶段的暂存显示
  - Enter/Escape 行为（提交/取消）

## 键盘与快捷键（建议）

- 统一规范化键名（如 `Enter`/`Esc`/`ArrowUp`）
- 仅焦点组件接收输入，支持全局快捷键注册
- 支持组合键与平台差异（macOS/Windows/Linux）

## 常见组件交互约定（示例）

- `TSelect`:
  - 上下键切换选项，Enter 确认，Esc 取消
  - `onOpen`/`onClose` 用于显示/隐藏下拉
- `TList`:
  - 支持滚动、虚拟化（列表过长时）
- `TDialog`:
  - 居中布局、遮罩区域、阻止底层事件

## 响应式与尺寸变化（建议）

- `TerminalProvider` 监听容器尺寸变化，触发 `resize(cols, rows)` 并广播 `resize` 事件
- 组件接收 `onResize` 或 `useTerminalSize()` 响应尺寸变化
- 布局建议：
  - `TView` 支持 `w/h` 为百分比或 `auto`（依赖父容器）
  - resize 时触发局部重排，避免全量重绘

## 布局与坐标系统（建议）

- 坐标系基于 cell 网格，所有位置/尺寸以整数为主
- 布局模式：
  - `absolute`: `x/y/w/h` 明确指定
  - `flow`: 垂直/水平流布局（简化版）
  - `anchor`: 支持 `left/right/top/bottom` 锚定
- 约束：`minW/maxW/minH/maxH`，超出时裁剪
- 容器提供 `padding` 与 `clip`，子组件默认裁剪到内容区域

## 布局计算（简版规则）

- 先计算父容器 contentRect，再计算子组件布局
- `absolute` 优先：有明确 `x/y/w/h` 时直接裁剪
- `anchor` 次之：根据边距计算剩余空间
- `flow` 最后：按方向累积尺寸，支持 `gap` 与 `wrap`
- `auto` 尺寸：基于内容测量（文本/子组件）得到

## 带边框 Box 的内容保护

当 `TBox` 带边框时，需要保护内容区域不被破坏：

- 外框占 1 cell 边距，内容区域为 `(x+1, y+1, w-2, h-2)`
- 内容写入必须裁剪到内容区域，避免覆盖边框
- 当内容超出时，支持 `overflow: clip | scroll`
- 建议 `TBox` 内部提供 `padding` 与 `contentRect`，子组件写入基于 `contentRect`

## 渲染策略（初版）

- 以行 (row) 为单位进行 dirty 标记
- 每行合并相同样式为 span，减少 DOM 节点数
- `batch()` + `commit()` 合并更新

## 渲染调度（建议）

- 所有写入走调度器聚合到下一帧（`requestAnimationFrame`）
- `batch()` 在同一帧内合并多个写入，减少 diff 次数
- 支持 `flush()` 立即渲染（用于调试或关键交互）

## 字体度量与像素映射（建议）

- 统一使用等宽字体，测量 `cellWidth`/`cellHeight`
- 设备像素比变化时重新测量并触发重排
- 支持固定 `cellSize` 覆盖测量结果（用于稳定布局）

## ANSI 支持

- `writeAnsi()` 接受 ANSI 字符串，解析后写入 Buffer
- 可先实现轻量解析器，后续切换到更完整的 ANSI 样式库（如 `ansis`）

## 文本分段与宽字符策略（建议）

- 使用 grapheme 分段，避免组合字符被拆分
- 宽字符占用 2 cell，后续 cell 标记为 continuation
- 无法渲染的字符使用占位符（如 `?`）并记录告警

## 主题与样式系统（建议）

- 提供 `Theme` 对象（默认 fg/bg、16/256 色板、字体设置）
- ANSI 颜色映射依赖主题，可热更新
- 允许组件局部覆盖主题（如 `TDialog`）

## 光标、选择与剪贴板（建议）

- 光标形态：`block`/`underline`/`bar`，支持闪烁
- 选择：鼠标拖拽选区，支持跨行
- 剪贴板：复制/粘贴基于 Buffer 内容而非 DOM 文本

## 设计注意事项

- 文本宽度：需支持 grapheme + wcwidth，避免 emoji/组合字符错位
- 组合模型：建议引入容器裁剪与 zIndex，避免组件相互覆盖
- 调度机制：统一 batch/commit，避免组件更新引发频繁重绘
- 事件映射：需基于字体度量映射 cell 坐标，resize 时重算
- 滚动与 resize：需要明确 scrollback 与重排策略

## 后续计划（草案）

- 基础组件库完善 (TList/TInput/TTable)
- Canvas 渲染器
- 虚拟滚动和大 buffer 支持

## License

[MIT](./license)
