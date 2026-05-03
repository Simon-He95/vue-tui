# Components 使用文档（@simon_he/vue-tui）

本文档覆盖 `@simon_he/vue-tui` 当前内置的所有 Vue 组件（TUI 组件层），用于统一「渲染/参数/事件」的契约，便于实现一致的验收与测试。

> 坐标/尺寸单位：所有 `x/y/w/h` 均以「cell（字符格）」为单位，而不是像素。

> 完整的 Props/Events 列表请以自动生成文件为准：`docs/generated/components-api.md`（运行 `bun run --filter '@simon_he/vue-tui' docs:gen` 生成）。

## 组件速读

| 类别          | 组件                                                                      | 典型用途                                        | 适配性判断                                         |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Root          | `TerminalProvider`                                                        | 创建 terminal / renderer / event manager 上下文 | 通用，适合所有宿主                                 |
| Layout        | `TBox` `TView` `TAnchor` `TFlow` `TRenderLayer` `TRenderPlane`            | 布局、裁剪、层级、分层组合                      | 通用，和 CLI 业务无关                              |
| Text / Motion | `TText` `TTransition`                                                     | 文本渲染、状态切换、动画插值                    | 通用                                               |
| Input         | `TInput` `TInputBox` `TJsonEditor`                                        | prompt、表单、结构化文本编辑                    | 通用，但推荐把补全/校验放到插件层                  |
| Pickers       | `TList` `TVirtualList` `TLogView` `TLogScrollbar` `TSelect` `TPathPicker` | palette、列表、日志、路径选择                   | `TPathPicker` 本体可复用，路径语义由 provider 注入 |
| Overlay       | `TDialog` `TMultilineModal` `TDebugOverlay`                               | 对话框、详情查看、调试覆盖层                    | 通用，适合多种宿主                                 |
| Navigation    | `TRouterView` + `createTerminalRouter()`                                  | 多页面 TUI / shell                              | 通用                                               |

如果你更关心“哪些地方还应该继续做插件化”，建议配合阅读：[扩展性与插件化](./extensibility.md)。

## 基础约定

### Style（样式）

`style` 使用 `Style`（ANSI 风格语义）：

- `fg`/`bg`: ANSI 颜色名（例如 `whiteBright`/`blue` 等）
- `bold`/`dim`/`italic`/`underline`/`inverse`: 布尔开关

`TerminalProvider` 提供 `defaultStyle` 作为默认渲染样式；组件的 `style` 传入后会覆盖默认值（通常是整行/整块生效）。

### zIndex（层级）

- 渲染层：同一 stack 内按 `zIndex` 决定覆盖顺序（大者覆盖小者）。
- 事件层：可交互组件会注册到 EventManager，命中测试会偏向 **更高 zIndex** 或 **更小面积** 的节点。

### 事件（点击/键盘/焦点）

可交互组件遵循 Vue 事件命名习惯：

- 监听：`@click` / `@keydown` / `@focus` / `@blur` …
- v-model：`modelValue` + `update:modelValue`

事件 payload 为终端事件（`TerminalPointerEvent` / `TerminalKeyboardEvent`），携带 `cellX/cellY` 等信息。

## TerminalProvider

终端 UI 的根组件：创建 `terminal`、DOM renderer、EventManager、调度器（rAF）。

### Props

- `cols` `(number, required)`: 终端列数
- `rows` `(number, required)`: 终端行数
- `defaultStyle` `(Style)`: 默认样式（默认 `{}`）
- `autoResize` `(boolean)`: 是否根据容器尺寸自动 resize（默认 `false`）
- `minCols`/`minRows` `(number)`: autoResize 下最小尺寸
- `recordEvents` `(fn?)`: 录制事件回调（用于 record/replay）
- `inputPlugins` `(TInputPlugin[])`: 给子树里的 `TInput` / `TInputBox` 注入宿主插件（例如 terminal clipboard、TTY 风格快捷键）
- `pathPickerProvider` `(PathPickerProvider?)`: 给子树里的 `TPathPicker` 注入宿主路径 provider
- `debugIme` `(boolean)`: 输出 IME 调试信息
- `debugTrace` `(boolean)`: 开启 trace（commit/event/focus）
- `domRendererOptions` `(DomRendererOptions?)`: DOM renderer 挂载时配置，例如 `syncFlushMaxRows` / `syncFlushCellBudget`；该选项按 mount-time 使用，修改后需重新挂载 provider

### Slots

- `default`: 渲染你的 TUI 组件树

### Example

```vue
<TerminalProvider :cols="80" :rows="24" :default-style="{ fg: 'whiteBright' }">
  <TBox :x="0" :y="0" :w="80" :h="24" title="Demo" border :padding="1">
    <TText :x="0" :y="0" :w="78" value="Hello" />
  </TBox>
</TerminalProvider>
```

## TText

渲染纯文本（可多行、可自动换行），并会对控制字符做清洗，避免写出组件矩形区域。

### Props

- `x`/`y` `(number, required)`
- `zIndex` `(number)`
- `value` `(string, required)`
- `w`/`h` `(number?)`: 不传则按文本实际宽高推导
- `style` `(Style?)`
- `clear` `(boolean)`: 每次 paint 是否先清空区域（默认 `true`）
- `wrap` `(boolean)`: 是否按 `w` 自动换行（默认 `false`）
- `depsKey` `(unknown?)`: 参与 render-node 依赖追踪的可选 key（用于强制 repaint）

### Notes

- `wrap=true` 会保留显式 `\n` 为硬换行，并按 cell 宽度进行自动折行。
- 多字节/宽字符（例如中文）按 cell 宽度计算，不会半个字符被截断。

## TBox

绘制一个矩形容器（可选边框/标题/内边距），并为子节点提供 layout（clipRect + origin 偏移），支持 `scrollX/scrollY`。

### Props

- `x`/`y`/`w`/`h` `(number, required)`
- `zIndex` `(number)`
- `border` `(boolean)`: 是否绘制边框（默认 `true`）
- `title` `(string)`: 标题（会被安全截断）
- `padding` `(number)`: 内边距（会自动 clamp，避免把内容挤没）
- `scrollX`/`scrollY` `(number)`: 内容滚动偏移（单位 cell）
- `style` `(Style?)`
- `clear` `(boolean)`: 是否先清空区域（默认 `true`）

### Slots

- `default`: 内容区子组件

### Events

`TBox` 主要用于绘制与裁剪，但也会对其矩形区域注册 hover 事件：

`@pointerenter` / `@pointerleave`（含 Capture 版本）

## TView

一个可交互的矩形“视口”节点：提供 layout（origin/clipRect）与事件（click/key/focus/blur…），支持 `scrollX/scrollY`。

### Props

- `x`/`y`/`w`/`h` `(number, required)`
- `zIndex` `(number)`
- `scrollX`/`scrollY` `(number)`
- `focusable` `(boolean)`: 是否可获得焦点（默认 `false`）
- `selectable` `(boolean?)`: 是否允许文本选择（默认 `undefined` 由上层决定）
- `autoFocus` `(boolean)`: 可见时自动聚焦（默认 `false`）

### Events

`@click`/`@dblclick`/`@pointerdown`/`@pointerup`/`@pointermove`/`@pointerenter`/`@pointerleave`/`@wheel`/`@keydown`/`@keyup`/`@focus`/`@blur`

> 同时支持对应的 `Capture` 版本（例如 `@clickCapture`）。

## TAnchor

类似 `TView`，但用「定位约束」描述矩形：`left/top/right/bottom/w/h`。用于做相对定位（例如贴右/贴底的浮层）。

### Props

- `left`/`top`/`right`/`bottom` `(number?)`
- `w`/`h` `(number?)`
- `zIndex` `(number)`
- `focusable` `(boolean)`
- `selectable` `(boolean?)`

### Events

`@click`/`@dblclick`/`@pointerdown`/`@pointerup`/`@pointermove`/`@wheel`/`@keydown`/`@keyup`/`@focus`/`@blur`

> 同时支持对应的 `Capture` 版本（例如 `@clickCapture`）。
>
> 注：`TAnchor` 当前不提供 `@pointerenter/@pointerleave`（需要 hover 事件时请用 `TView`）。

## TFlow

按方向把 `items` 映射成若干子视口（每个子项一个 `TView`），用于列表式布局（更偏 layout 工具）。

### Props

- `x`/`y`/`w`/`h` `(number, required)`
- `items` `(unknown[], required)`
- `direction` `('vertical'|'horizontal')`（默认 `vertical`）
- `gap` `(number)`：子项间隔（cell）
- `itemSize` `(number)`：子项主轴尺寸（cell）
- `zIndex` `(number)`

### Slots

- `item`: `({ item, index }) => VNode`

## TInput

单行文本输入框（含光标、选择、剪贴板、IME 组合输入、快捷键），通过 `v-model` 管理值。

### Props（常用）

- `x`/`y`/`w` `(number, required)`
- `h` `(number)`：高度（默认 `1`）
- `modelValue` `(string)` + `update:modelValue`
- `placeholder` `(string?)`
- `placeholderWhenFocused` `(boolean)`：聚焦时是否显示 placeholder（默认 `false`）
- `autoFocus` `(boolean)`
- `cursorBlink` `(boolean)`
- `cursorShape` `('block'|'underline'|'bar')`
- `style` `(Style?)`
- `secret` `(boolean)` / `maskChar` `(string)`：密码模式
- `plugins` `(TInputPlugin[])`：输入增强插件（见下方）

> `TInput` 功能较多，完整参数以源码为准：`packages/tui/src/vue/components/TInput.ts`。
>
> 跨宿主注意：`TInput` 本体已经开始把 terminal clipboard、TTY 判定、路径 href 这类宿主行为往 plugin 边界迁移。现在更推荐通过 `TerminalProvider.inputPlugins`、`createTerminalApp({ inputPlugins })` 或局部 `plugins` 注入宿主能力，而不是继续把平台差异写死到组件里。像 copy toast 这种 UI 反馈也应由宿主显式提供，不再依赖默认全局 hook。

### Events（补充）

- `input` / `change` / `keydown` / `focus` / `blur`
- `update:mentions` / `mentionClick`：`collectMentions=true` 时（见 `createPromptMentionPlugin()`）
- `update:multilineTexts` / `multilineClick`：多行 token 相关
- `validationError`：文本过滤/校验插件上报

## TInput Plugins

用于扩展 `TInput` 的输入体验：通过 `:plugins="[...]"` 注入。

宿主级插件也可以统一从上层注入：

- `TerminalProvider.inputPlugins`
- `createTerminalApp({ inputPlugins })`

### `createTInputHostPlugin()`

把宿主能力封装成 `TInput` 插件。适合注入：

- `readClipboardText` / `writeClipboardText`
- `showToast`
- `resolvePath` / `pathToHref`
- `isTerminalLike`

默认 host plugin 只负责 Node-like 的 clipboard / path 行为，不会自动附带 UI toast；如果宿主希望保留 `Copied` / `Copy failed` 这类提示，需要显式提供 `showToast`。

一个最小宿主接线示例：

```ts
import {
  createDefaultTInputHostAdapter,
  createTInputHostPlugin,
  createTerminalApp,
} from "@simon_he/vue-tui";

const baseHost = createDefaultTInputHostAdapter();

const app = createTerminalApp({
  cols: 80,
  rows: 24,
  component: App,
  inputPlugins: [
    createTInputHostPlugin({
      ...baseHost,
      showToast(message) {
        toastStore.show(message);
      },
    }),
  ],
});
```

### `createPromptMentionPlugin()`

提供 prompt/mention 的浮层补全：

- prompt：基于 `promptSuggestions` + `promptTrigger`（默认 `/`）匹配并弹出列表
- mention：基于 `mentionTrigger`（默认 `@`）匹配；配合 `collectMentions=true` 会把选择结果写入 `mentions`（通过 `update:mentions`）
- mention 数据源既可以来自 `mentionSuggestions` / `mentionSuggestionProviders`，也可以通过 `mentionPathProvider` 注入路径补全能力
- 如果宿主就是 Node / 本地文件系统语义，可以直接用 `createNodeMentionPathProvider()`
- 键盘：`↑/↓` 选择，`Tab`/`Enter` 接受，`Esc` 关闭浮层

### `createTextRestrictionPlugin({ rules })`

注册输入过滤规则（allow/deny/replace/filter），用于限制字符集、替换非法字符或做整体校验。

- 命中过滤/拒绝时会触发 `TInput` 的 `validationError` 事件（payload 含 `originalText/acceptedText` 等）

### `TInputPluginsContextKey`

高级宿主如果希望按子树组合/覆盖输入插件，可以直接用公开导出的 `TInputPluginsContextKey` 做 `provide/inject`。

- 适合像 reference app 那样，在某个页面根节点统一补一个局部 host plugin
- 比起给每个 `TInput` 单独传 `plugins`，更适合做“页面级宿主接线”

## TInputBox

带边框的输入框组合组件（内部是 `TBox` + `TInput`）。

### Props（常用）

- `x`/`y`/`w`/`h` `(number, required)`
- `modelValue` `(string)` + `update:modelValue`
- `title` `(string?)`
- `placeholder` `(string?)`
- `autoFocus` `(boolean)`
- `plugins` `(TInputPlugin[])`

## TList

可滚动列表（单选）：支持点击/双击、键盘导航、滚轮滚动，`v-model` 维护选中 index。

`TList` 适合小数据选择器。大数据选择/浏览场景请使用 `TVirtualList`，日志、streaming transcript、append-only output 场景请使用 experimental `TLogView`，避免把大数组直接传进 Vue deep reactivity。

### Props

- `x`/`y`/`w`/`h` `(number, required)`
- `items` `(string[], required)`
- `modelValue` `(number)` + `update:modelValue`
- `style` `(Style?)`
- `autoFocus` `(boolean)`
- `closeOnBlur` `(boolean)`

### Events

- `change`: `{ index, value }`
- `scroll`: `scrollTop`（number）
- `close` / `focus` / `blur` / `keydown`

## TVirtualList

大数据选择/浏览列表：使用 `itemCount` / `itemVersion` / `getItem` 从外部数据源读取可见行，避免把大数组本体放进 Vue deep reactivity。它不是日志/streaming 组件；append-only 输出请使用 `TLogView`。

> Phase 1 experimental API：当前从 `@simon_he/vue-tui/experimental` 导出，暂不进入 root 入口。API 仍可能在 scheduler frame task、controlled scrollTop、overscan、TLogView 等后续能力落地前调整。

### Props

- `x`/`y`/`w`/`h` `(number, required)`
- `itemCount` `(number, required)`
- `itemVersion` `(number, required)`：数据变更版本号
- `getItem` `((index: number) => unknown, required)`
- `renderItem` `((item, index) => unknown)`
- `modelValue` `(number)` + `update:modelValue`
- `style` / `activeStyle` `(Style?)`
- `autoFocus` `(boolean)`
- `rowScrollMode` `("off" | "unsafe-full-row")`：full-row 场景的 opt-in unsafe row-scroll 优化

### Data source

`getItem` 和 `renderItem` 应保持稳定引用，数据变化用 `itemVersion` 通知组件。`style` / `activeStyle` 对象也应按 immutable 方式使用；样式变化时替换对象 identity。

```ts
const items = markRaw(bigArray);
const itemVersion = ref(0);
const getItem = (index: number) => items[index];
const renderItem = (item: Row) => item.title;
```

避免在模板里传 inline function：

```vue
<TVirtualList :get-item="(index) => items[index]" />
```

### Row scroll

`rowScrollMode` 是危险优化开关，不是列表内部局部滚动。它会 shift 当前 render plane 的整行区域，只能用于该 plane 的这些 rows 被 `TVirtualList` 独占且列表没有被裁剪的场景；同 plane 其它内容会被一起移动。DOM renderer 支持通过移动 line nodes 消费 terminal `scrollOperations`，但只有列表占满终端整行、列表 rect 未被裁剪、rows 在 terminal bounds 内且 renderer capability 开启时才会走 exposed-row repaint；其它场景会退回 viewport repaint。debug perf 模式会对这些被忽略的场景发出一次 warning。

### Selection model

`modelValue` 使用 optimistic controlled 语义：键盘和点击会先更新组件内部 active row 并 emit `update:modelValue`。如果父组件稍后接受、延迟应用或改成其它 `modelValue`，组件会在 prop 同步时跟随；如果父组件完全忽略 update，组件会保留本地 optimistic active state。

### Events

- `change`: `{ index, value }`
- `scroll`: `scrollTop`（number）
- `focus` / `blur` / `keydown`

## TLogView

Append-only / streaming 日志视图：从 `source` / `version` 数据源读取可见窗口，不接收大数组，也不把日志内容放进 Vue deep reactivity。

> Experimental API：当前从 `@simon_he/vue-tui/experimental` 导出，暂不进入 root 入口。`ansi=true` 支持 ANSI SGR styling，并可配合 `links=true` 解析 OSC8 hyperlinks；minimap 和 arbitrary variable-height rich rows 仍不是当前能力。

### Props

- `x`/`y`/`w`/`h` `(number, required)`
- `source` `(TLogDataSource, required)`：提供 `lineCount()`、`getLine(index)`，可选提供 `getLineKey(index)`、`firstLineIndex()`
- `version` `(number, required)`：数据变化版本号；template 里 `Ref<number>` 会自动 unwrap
- `scrollTop` `(number?)`：受控 visual-row scrollTop；省略时由组件内部维护
- `defaultScrollTop` `(number?)`：非受控模式初始 visual-row scrollTop；省略时初始显示底部
- `style` `(Style?)`
- `autoFocus` `(boolean)`
- `autoStickToBottom` `(boolean)`：在底部时 append 自动贴底，默认 `true`
- `overscan` `(number)`：`wrap=true` 底部窗口预先测量的额外 visual rows，默认 `2`
- `wrap` `(boolean)`：长逻辑行按 cell width 拆成多个 visual rows，默认 `false`
- `visualIndexMode` `("estimated" | "exact")`：wrapped visual row 总数的索引模式，默认 `"estimated"`
- `visualIndexOptions` `(TLogViewVisualIndexOptions?)`：`measureBudgetMs` 默认 `4`；`maxMeasuredLines` 可限制 retained-window exact scan 范围
- `ansi` `(boolean)`：解析每条 logical line 中的 ANSI SGR styling，默认 `false`
- `links` `(boolean)`：`ansi=true` 时解析 OSC8 hyperlinks，默认 `false`
- `linkStyle` `(Style)`：OSC8 link text 叠加样式，默认 `{ underline: true }`
- `searchQuery` `(string)`：在当前 retained source window 内搜索 visible text，默认 `""`
- `searchOptions` `(TLogViewSearchOptions?)`：`caseSensitive` / `wholeWord` 默认 `false`，`maxMatches` 默认 `10_000`，`scanBudgetMs` 默认 `4`
- `highlightMatches` `(boolean)`：是否绘制 search matches，默认 `true`
- `matchStyle` `(Style)`：普通 match 高亮，默认 `{ inverse: true }`
- `currentMatchStyle` `(Style)`：当前 match 高亮，默认 `{ inverse: true, bold: true }`
- `rowScrollMode` `("off" | "unsafe-full-row")`：full-row append 的 opt-in unsafe row-scroll 优化，默认 `"off"`

### Data source

```ts
import { createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

const log = createAppendOnlyLogStore({ maxLines: 10_000 });

log.appendChunk("hello");
log.appendChunk(" world\nnext line");
```

```vue
<TLogView :source="log.source" :version="log.version" :x="0" :y="0" :w="80" :h="20" />
```

`createAppendOnlyLogStore({ maxLines })` 使用普通 store 和单独的 `version` ref。不要把日志行做成 reactive array，也不要每次 append 都重建全文字符串。`maxLines` 省略时不限制；设置后只保留最近的 logical lines，completed lines 和当前 mutable tail 都计入保留窗口。

`createAppendOnlyLogStore()` 保存 completed lines 和一个 mutable tail。`appendChunk()` 会追加到 tail，并按 `\n` 拆出 completed lines；`appendLine()` 如果存在 tail，会先完成 `tail + line`，否则追加一条 completed line；`replaceTail()` 只替换 mutable tail，不会修改最后一条 completed line。

启用 retention 时，`log.source.firstLineIndex()` 返回 source index `0` 对应的绝对 logical line number。`clear()` 会把 retained window 和 `firstLineIndex()` 一起重置为 `0`。

`appendLine()` / `appendLines()` 期望调用方传入单行文本；需要处理包含 newline 的 streaming 输入时，请使用 `appendChunk()`。

`TLogView` 会按行缓存 fixed one-line 的最终 render string。`wrap=true` 时还会按 `getLineKey(index) + width` 缓存每条逻辑行拆出的 visual rows。`ansi=true` 时会单独缓存 ANSI parsed segments、ANSI wrapped visual rows 和 clipped styled row 结果。`createAppendOnlyLogStore()` 会为 completed lines 提供稳定 key，并在 tail 文本变化时更换 tail key，让 streaming / append-only 场景复用已完成历史行的 clipped/padded 输出和 wrap 结果。

自定义 source 如果能提供稳定身份，建议实现：

```ts
type TLogDataSource = {
  lineCount(): number;
  getLine(index: number): string;
  getLineKey?: (index: number) => string | number;
  firstLineIndex?: () => number;
};
```

`getLineKey(index)` 应在同一行文本不变时保持稳定；mutable tail 或可见历史行文本变化时必须改变。source identity 也应尽量稳定；如果替换整个 source 对象，`TLogView` 会清空实例内 render cache。

未提供 `getLineKey` 时，`TLogView` 会退回到 `version + index`，确保 `version` 变化后不会出现 stale text，但跨 version 的缓存复用会受限。

`TLogView` 仍按 append-only / tail-only mutation 优化。`getLineKey(index)` 用于缓存正确性和 append/tail 场景；它不是任意历史行 diff 机制。自定义 source 如果会修改任意可见历史行，应替换 source identity，或等待后续 explicit viewport refresh API。

`wrap=false` 是默认行为，超出宽度的行会被 clip。`wrap=true` 时，一个 logical source line 可以渲染成多个 visual rows，`scrollTop` 也按 visual row 计数。`ansi=false` 是默认行为，日志行按纯文本 fast path 渲染。`ansi=true` 时，`source.getLine(index)` 可以包含 ANSI SGR escape sequences；TLogView 会解析 fg/bg/bold/dim/italic/underline/inverse 等 style，并在 fixed clip 和 `wrap=true` visual rows 中保留样式。ANSI reset 会回到 TLogView base style（`style` prop 或 terminal default style）。

`links=true` 只在 `ansi=true` 时生效。TLogView 会解析 OSC8 opener/closer，忽略 params，把 visible link text 渲染为带 `Style.href` 的 cells，并叠加 `linkStyle`。BEL 和 ST terminator 都支持。组件不会自动打开链接、不会做 URL auto-detect、不会解析 Markdown link，也不会提供 hover tooltip；点击 visible link cell 时只 emit `linkClick`，由应用层决定如何处理。

`searchQuery` 只搜索 visible text。`ansi=true` 时，ANSI escape sequences 不参与搜索，也不会污染 match offset；match highlight 会叠加在 ANSI style 上。match 坐标使用 terminal cell offset，因此宽字符会按 cell width 定位。`wrap=true` 时，`findNext()` / `findPrevious()` 会滚动到 match 所在 visual row。搜索范围始终是当前 retained source window；retention trim、append、tail mutation、source 或 version 变化后会基于当前窗口重新扫描。

`searchOptions.wholeWord` 使用 ASCII word boundary：`[A-Za-z0-9_]`。例如 `error-1` 中的 `error` 会被视为 whole-word match，而 `_error` 不会。

`clearSearch()` 会 emit `update:searchQuery`，并等待父组件把 `searchQuery` 回写为空后清除 matches；如果父组件不回写，当前 search state 和 highlight 不会提前改变。

搜索扫描通过 scheduler frame task 分帧执行，默认每帧最多使用约 `4ms`，不会在 `searchQuery` 变化时同步读取全部 retained lines。`maxMatches` 默认限制为 `10_000`。

当前不支持 regex/fuzzy/semantic search、cursor movement、clear screen、alternate buffer、syntax highlight、URL auto-detect、markdown/rich text 或 arbitrary variable-height row model。

### Scroll behavior

- `scrollTop` 始终是 visual-row 语义：`wrap=false` 时 visual row 等于 logical line；`wrap=true` 时一条 logical line 可能占多个 visual rows。
- `scrollTop` 相对于当前 retained source window；启用 retention 后，旧 head lines 被 trim 时 `firstLineIndex()` 会增加。
- 非受控模式：省略 `scrollTop`，`TLogView` 内部维护滚动位置；`defaultScrollTop` 只在初始 mount 使用一次，省略时初始显示底部。
- 受控模式：传入 `scrollTop` 并监听 `update:scrollTop`。`TLogView` 会 emit 期望的 next `scrollTop`，但不会在父组件回写 prop 前改变渲染出来的 rows。
- 受控模式下 `scrollTop` 是 source of truth；`autoStickToBottom` 只会在贴底 append 时 emit 新底部位置，不会绕过父组件直接改变视图。
- retention trim 发生时，非受控模式会尽量调整 `scrollTop` 保持当前可见内容锚定；受控模式只 emit 调整后的 `update:scrollTop`，等待父组件回写。
- 建议不要在同一个 `TLogView` 生命周期中切换 controlled/uncontrolled 模式；需要切换时重新挂载组件或显式管理 `scrollTop`。
- `appendLine` / `appendChunk` / `replaceTail` 通过 `scheduler.queueFrameTask()` 合并为 stream frame。
- `TLogView` 每次 paint 只读取当前 visible rows；命中 line-level render cache 的行不会再次调用 `source.getLine()`。
- `wrap=true` 初始底部和 append-only streaming 路径只测量 bottom/visible window 加 overscan，不会为了计算 wrap 结果全量读取大日志。
- `visualIndexMode="estimated"` 是默认行为：`wrap=true` 时只对 bottom/visible path lazy-measure visual rows。bottom stickiness、append 和 visible-window rendering 是准确路径；全量 scrollbar / jump-to-percent 所需的 total visual rows 在大日志上是估计值，除非所有行都被测量。
- `visualIndexMode="exact"` 会在 scheduler frame task 中分帧构建 retained-window exact visual index，不会同步全量 wrap。`scroll` payload 和 `getScrollMetrics()` 会额外暴露 `visualIndexStatus` / `visualRowCount` / `measuredLineCount` 等 metrics。
- `measureVisualIndex()` 可以在默认 estimated 模式下手动触发一次后台 exact measurement；measurement 过程中 `visualIndexStatus` 会从 `estimated` 进入 `measuring`，完成后变为 `exact`。
- `scrollToLine()` 会测量目标 logical line，并定位到该行的第一个 visual row；`wrap=true` 下目标行之前尚未测量的 wrapped rows 仍按 lazy visual index 估计。
- 初始 mount 默认显示当前底部；`autoStickToBottom=false` 只影响后续 append 是否继续贴底，不改变初始定位。
- 用户在底部时 append 会贴底；用户滚离底部后 append 不改变当前 `scrollTop`，也不会 repaint 当前 viewport。
- `rowScrollMode="unsafe-full-row"` 只有在组件占满整行、未被裁剪、renderer 支持 `scrollOperations` 时才会用 exposed-row repaint；其它情况回退到 viewport repaint。

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { TLogViewHandle } from "@simon_he/vue-tui/experimental";

const logView = ref<TLogViewHandle | null>(null);
const query = ref("ERROR");
const metrics = ref(logView.value?.getScrollMetrics());

function jumpBottom() {
  logView.value?.scrollToBottom();
}

function nextError() {
  logView.value?.findNext();
}

function measureRows() {
  logView.value?.measureVisualIndex();
}
</script>

<TLogView
  ref="logView"
  :source="log.source"
  :version="log.version"
  :search-query="query"
  wrap
  visual-index-mode="exact"
  :visual-index-options="{ measureBudgetMs: 4 }"
  :ansi="true"
  :links="true"
  @visualIndex="metrics = logView?.getScrollMetrics?.()"
  @linkClick="(payload) => console.log(payload.href)"
  :x="0"
  :y="0"
  :w="80"
  :h="20"
/>
```

### TLogScrollbar

`TLogScrollbar` 是一个 terminal-rendered 的 experimental companion 组件，消费 `TLogViewScrollMetrics` 渲染 1-cell 宽滚动条。它不持有滚动状态，也不会直接调用 `TLogView` 内部逻辑；父组件负责把 `scrollTo` / `scrollBy` 接到 `TLogViewHandle` 上。

- `metrics` 可以直接来自 `logView.value?.getScrollMetrics()`，也可以由 `@scroll` / `@visualIndex` 事件在外部维护
- `visualIndexStatus="estimated" | "measuring" | "exact"` 会分别用不同 thumb 状态渲染，方便区分估算值、后台测量中和精确 visual-row index
- 点击 track 会 emit 目标 visual-row `scrollTo`
- wheel 会 emit 简单的 `scrollBy(+/-1)` delegation
- `showArrows=true` 时首尾两行会渲染 `▲` / `▼`，点击后按一个 viewport 高度翻动

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  TLogScrollbar,
  TLogView,
  type TLogViewHandle,
  type TLogViewScrollMetrics,
} from "@simon_he/vue-tui/experimental";

const logView = ref<TLogViewHandle | null>(null);
const metrics = ref<TLogViewScrollMetrics | null>(null);

function refreshMetrics() {
  metrics.value = logView.value?.getScrollMetrics() ?? null;
}

function scrollTo(top: number) {
  logView.value?.scrollToVisualRow(top);
  refreshMetrics();
}

function scrollBy(delta: number) {
  logView.value?.scrollBy(delta);
  refreshMetrics();
}

onMounted(refreshMetrics);
</script>

<TLogView
  ref="logView"
  :x="0"
  :y="0"
  :w="79"
  :h="20"
  :source="log.source"
  :version="log.version"
  wrap
  visual-index-mode="exact"
  @scroll="refreshMetrics"
  @visualIndex="refreshMetrics"
/>

<TLogScrollbar
  :x="79"
  :y="0"
  :h="20"
  :metrics="metrics"
  @scrollTo="scrollTo"
  @scrollBy="scrollBy"
/>
```

### Events

- `scroll`: `{ scrollTop, atBottom, lineCount, estimatedVisualRowCount, firstLineIndex }`
- `update:scrollTop`: `scrollTop`（visual row）
- `update:searchQuery`: `searchQuery`
- `search`: `{ query, status, matchCount }`
- `searchMatch`: `{ match, currentMatchIndex, matchCount }`
- `linkClick`: `{ href, text, absoluteLineIndex, index, startCell, endCell, cellX, cellY }`
- `focus` / `blur` / `keydown`

## TSelect

选择器：单选/多选两种模式，支持点击、键盘 `↑/↓/Enter/Esc`，多选支持 `Space` 切换。

### Props（核心）

- `x`/`y`/`w`/`h` `(number, required)`
- `options` `((string | { label, detail? })[], required)`
- `modelValue` `(number | number[])` + `update:modelValue`
- `multiple` `(boolean)`
- `multipleEmit` `('value'|'index'|'both')`
- `style`/`highlightStyle` `(Style?)`
- `autoFocus` `(boolean)`
- `closeOnBlur` `(boolean)`

### Events

- `change` / `confirm` / `close` / `focus` / `blur` / `keydown`

## TPathPicker

路径输入 + 自动补全（Tab completion），用于 CLI 场景选择文件路径。

### Props

- `x`/`y`/`w`/`h` `(number, required)`
- `workspace` `(string, required)`: 工作区绝对路径（用于解析与补全）
- `mode` `('any'|'file'|'directory')`
- `modelValue` `(string)` + `update:modelValue`
- `placeholder` `(string?)`
- `showHidden` `(boolean)`
- `maxSuggestions` `(number)`
- `provider` `(PathPickerProvider?)`: 局部覆盖路径 provider；也可通过 `TerminalProvider.pathPickerProvider` 或 `createTerminalApp({ pathPickerProvider })` 统一注入
- `style` `(Style?)`
- `autoFocus` `(boolean)`

### Events

- `select`: `absPath`（string）
- `invalid`: `{ reason, absPath }`（reason: `not_found|not_file|not_directory|provider_missing`）
- `keydown` / `focus` / `blur`

### Keyboard

- `Tab`: 应用当前补全项
- `↑/↓` / `Ctrl+P` / `Ctrl+N`: 选择补全项
- `Enter`: 提交（若当前输入/选中项可用则触发 `select`；file 模式下目录会进入该目录）

> 跨宿主注意：`TPathPicker` 不再在组件本体里兜底 Node 文件系统实现。更推荐由宿主显式传入 `provider`，或通过 `TerminalProvider.pathPickerProvider` / `createTerminalApp({ pathPickerProvider })` 注入；CLI 宿主可直接复用 `createNodePathPickerProvider()`。
>
> 细节以实现与回归测试为准：`packages/tui/src/vue/components/TPathPicker.ts`。

## TDialog

对话框/模态层：常用于 confirm/cancel、内容滚动、按钮组与焦点管理。

### Props（核心）

- `modelValue` `(boolean)` + `update:modelValue`
- `w`/`h` `(number, required)`
- `title` `(string)` / `padding` `(number)`
- `zIndex` `(number)` / `style` `(Style?)`
- `placement`：`center|top|bottom|left|right|top-left|top-right|bottom-left|bottom-right`
- `offsetX`/`offsetY` `(number)`
- `backdrop` `(boolean)`：是否有遮罩层
- `closeOnBackdrop` / `closeOnEsc` / `closeOnBlur` `(boolean)`
- `teleport` `(boolean)`：通过 runtime portal 挂载到根层（避免被父 clip）
- `buttons` `(DialogButton[])`: 底部按钮（支持 `kind/default/value/id`）
- `closeOnConfirm` `(boolean)`

### Events

- `close` / `focus` / `blur` / `keydown`
- `confirm`: `{ label, value?, id?, kind?, default?, index }`

## TTransition

终端版的过渡封装：`show` 改变时执行 enter/leave 钩子与时间插值，并通过 `VisibilityContext` 控制子树可见性。

### Props

- `show` `(boolean, required)`
- `duration` `(number)`
- `beforeEnter`/`enter`/`afterEnter` `(hook?)`
- `beforeLeave`/`leave`/`afterLeave` `(hook?)`

### Slots

- `default`: `({ phase, progress }) => VNode`

## TDebugOverlay

调试覆盖层：可绘制 focus rect / 所有节点 rect，并显示 trace/dirtyRows 等信息。

### Props

- `mode` `('focus'|'all')`
- `panel` `(boolean)`
- `maxRects` `(number)`
- `zIndex` `(number)`

## TMultilineModal

用于展示多行文本的简单模态层（带遮罩与边框），常见于“查看详细内容/日志”。

### Props

- `visible` `(boolean, required)`
- `content` `(string, required)`
- `title` `(string)`（默认 `Multiline Text`）
- `style` `(Style?)`
- `zIndex` `(number)`（默认 `1000`）

### Events

- `close`: 点击遮罩或按 `Esc` 时触发

### Notes

- 尺寸：默认按终端 `80%` 宽、`70%` 高居中渲染
- 当前实现不支持滚动（内容会按可视区域截断）

## TRouterView

终端版 RouterView：配合 `createTerminalRouter()` 使用，用于根据当前 route 渲染匹配的页面组件。

### Props

- `routes` `(TerminalRouteRecord[], required)`: 路由表
- `forceRemount` `(boolean)`: route 变化时是否强制 remount（默认 `true`）

## TRenderLayer

渲染层级容器：为子树创建一个新的 render stack，从而把整棵子树整体抬升/降低 `zIndex`（不影响事件 zIndex）。

### Props

- `zIndex` `(number)`：相对父 stack 的偏移（默认 `0`）

### Slots

- `default`

## TRenderPlane

plane 分层容器：为子树切换到指定 render plane，并把 `terminal`、`scheduler.invalidate()`、`runtime.mount()` 自动绑定到该 plane。

### Props

- `plane` `('default'|'transcript'|'chrome'|'overlay')`（默认 `default`）

### Slots

- `default`

### Notes

- `TRenderPlane` 不改变布局矩形，也不创建新的 render stack
- 它解决的是“这棵子树属于哪个 plane”，不是“这棵子树的 zIndex 是多少”
- 典型用法是把正文放进 `transcript`，把 footer/loading 放进 `chrome`，把 dialog 放进 `overlay`
