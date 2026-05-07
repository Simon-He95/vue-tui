# Agent Console Example

`examples/agent-console` 是发布前的端到端场景，用来验证 renderer、log view、markdown、overlay、input 和 stdout runner 能组合成真实 agent UI，而不是只在单组件 demo 中成立。

## 覆盖范围

- 高频 token streaming 和 markdown 段落增量更新
- `TLogView` 日志模式和 `TVirtualMarkdown` markdown 模式
- `TRenderPlane` 拆分 transcript、chrome、input 和 overlay
- 带背景色的 user bubble、ANSI tool log、代码块背景、inline markdown highlight、OSC8/link metadata
- `best-agent` 风格的 `Thinking ▸/▾`、`▾ ● Run 3 commands`、`in:/out:` shell 输出、changed-files 边框卡片和 token bar
- 用户离开底部后的 scroll detachment，以及 Jump to bottom 恢复
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
pnpm run example:agent-console:terminal
```

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
  "bestAgentFixtureRowsRendered": true
}
```

## Markdown Streaming

示例保留完整 markdown string 作为 transcript state，同时用 `createMarkdownBlockSource()` 为 `TVirtualMarkdown` 提供 `blocks`。这样当前 streaming tail 仍能逐 chunk 更新，已经 finalize 的 user message、assistant paragraph 和 tool fence 不会在每次 append 时重新 parse。
