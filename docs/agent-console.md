# Agent Console Example

`examples/agent-console` 是发布前的端到端场景，用来验证 renderer、log view、markdown、overlay、input 和 stdout runner 能组合成真实 agent UI，而不是只在单组件 demo 中成立。

## 覆盖范围

- 高频 token streaming 和 markdown 段落增量更新
- `TLogView` 日志模式和 `TVirtualMarkdown` markdown 模式
- `TRenderPlane` 拆分 transcript、chrome、input 和 overlay
- `TUserMessageView` 的 best-agent 风格 user message block、ANSI tool log、代码块背景、inline markdown highlight、OSC8/link metadata
- `best-agent` 风格的 `TThinkingView` `Thinking ▸/▾`、`TToolCallView` 的 `▾/▸ ● Run 3 commands`、collapsed suffix/preview、`in:/out:` shell 输出、changed-files 边框卡片和 token bar
- 用户离开底部后的 scroll detachment，以及 Jump to bottom 恢复
- 示例默认 paused，用户可以先滚动检查；`Resume stream` 或 `/stream` 再开启 streaming
- terminal 里可直接点击 `Thinking` / `Run 3` 控件，动态折叠 transcript mock 内容
- command palette 可由 `TCommandPalette` 承担过滤、匹配高亮、键盘和点击选择，宿主只保留 command 数据与执行逻辑
- log 模式用精确 visual index，避免 wrapped rows 在滚动途中重新测量造成回弹感
- streaming 中输入框继续响应，focus/cursor 不被 transcript repaint 影响
- `/` 搜索、`Tab` link focus、`Ctrl+K` command palette、`Esc` overlay close
- overlay 打开时继续 append / wheel，并切换 thinking 与 tool_call 展开折叠

## 运行

Browser DOM 版本：

```bash
pnpm run example:agent-console
```

Smoke：

```bash
pnpm run example:agent-console:smoke
```

Stdout smoke：

```bash
pnpm run example:agent-console:terminal:smoke
```

真实终端 runner：

```bash
pnpm run run:agent-console:terminal
```

这个 runner 默认暂停 streaming，方便先滚动、选中复制、点击 `Thinking` / `Run 3` 展开折叠，并检查 best-agent 风格边框、按钮下划线和 link underline。按 `Resume stream` 或输入 `/stream` 后再观察 streaming 场景下的 scroll detachment、overlay 和输入稳定性。

## 样式和扩展边界

示例中的 user message、thinking、tool_call chrome 和 command palette 来自 `@simon_he/vue-tui/agent` 的 `TUserMessageView`、`TThinkingView`、`TToolCallView`、`TCommandPalette`。这些组件只接收通用渲染语义，不接收 agent/provider/session/tool schema；宿主可以通过 style props 改背景和文字样式，也可以通过 `header`、`row`、`preview` slots 完全替换局部行内容。非 Vue 行渲染器可以直接复用 `resolveTUserMessageViewModel()`、`resolveTThinkingViewModel()` 和 `resolveTToolCallViewModel()`，保证 wrapper 和组件走同一套 cell wrapping 与 segment 规则。

## Smoke 输出

Smoke 不做 timing gate，只检查行为和 repaint 边界：

```json
{
  "chunks": 1000,
  "frames": 37,
  "maxDirtyRows": 24,
  "maxPaintedNodes": 3,
  "droppedUpdates": 16,
  "inputStable": true,
  "scrollDetachedPreserved": true,
  "searchMatches": 280,
  "visibleLinks": 4,
  "logHasStyledBackground": true,
  "markdownHasStyledBackground": true,
  "overlayMaxDirtyRows": 29,
  "overlayMaxPaintedNodes": 15,
  "overlayInputStable": true,
  "expandableRowsRendered": true,
  "bestAgentToolCallChrome": true,
  "bestAgentChangedFilesBoxClosed": true,
  "chromeButtonUnderlineFollowsText": true,
  "thinkingClickCollapsedTranscript": true,
  "toolCallClickCollapsedTranscript": true,
  "ghosttyWheelDownMonotonic": true,
  "linksUnderlineFollowsText": true,
  "bestAgentFixtureRowsRendered": true
}
```

## Markdown Streaming

示例保留完整 markdown string 作为 transcript state，同时用 `createMarkdownBlockSource()` 为 `TVirtualMarkdown` 提供 `blocks`。这样当前 streaming tail 仍能逐 chunk 更新，已经 finalize 的 user message、assistant paragraph 和 tool fence 不会在每次 append 时重新 parse。
