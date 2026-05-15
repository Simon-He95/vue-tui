# 性能关注点与回归策略

Vue TUI 的性能瓶颈通常来自三部分：

1. **Vue 更新频率**：状态变化是否导致大量组件重新计算/重绘
2. **Terminal 写入范围**：一次交互是否触发了过大的 dirty rows 或错误的 plane repaint
3. **Renderer 输出成本**：DOM span 更新量 / stdout 输出量是否与真实变化区域成正比

大列表、日志、streaming 输出和高频滚动的后续架构与验收标准见 [高吞吐渲染架构规格](/high-throughput-rendering)。

## 当前库已具备的性能设计

- **plane-local dirty rows**：RenderManager 按 `default/transcript/chrome/overlay` 分别维护 dirty rows。
- **plane-scoped compositor**：Terminal commit 时从各 plane row buffer 合成最终可见 buffer，而不是共享一块渲染面反复清空。
- **增量渲染**：RenderManager 会尽量只重绘被请求的 dirty plane，避免无关区域参与本轮 repaint。
- **DOM scrollOperations**：DOM renderer 可消费 terminal commit 里的 `scrollOperations`，通过移动 line nodes 优化 full-row 慢滚；`dirtyRows` 仍由 terminal/compositor 决定。
- **stdout 原子输出**：StdoutRenderer 单帧合成一次性输出，减少闪烁与撕裂。

## DOM scrollOperations

DOM renderer 的 `scrollOperations` 是输出层优化：terminal/compositor 先完成 buffer scroll、dirty rows 和 exposed rows 计算，DOM renderer 只按 commit hint 移动对应 plane 的整行 line nodes，然后 repaint commit 给出的 dirty rows。

这不是组件局部 rect scroll。`TVirtualList rowScrollMode="unsafe-full-row"` 只有在 full-row、unclipped、rows 在 terminal bounds 内且 renderer capability 开启时才会使用；如果存在 pending rows overlap 或不安全条件，DOM 端会回退到 repaint affected rows / viewport。

## 性能“验收”建议（可量化）

### 1) 单次输入不应带动无关 plane

例如：`chrome` 里的输入框、loading 或 footer 文本更新，只应影响 `chrome` 自己，不应该顺带重绘 `transcript`。

理想观测：

- `scheduler.invalidate({ plane: 'chrome' })`
- `render-manager` 的 active planes 只有 `chrome`
- `commit` 的 `planes` 只有 `chrome`

对应回归测试：`packages/tui/test/perf-budgets.test.ts`

### 2) 大内容场景必须可控

- `TText wrap` 大文本：渲染应被 `w/h` 裁剪，且不会越界写入
- 列表/选择器：长列表应只 repaint 可视窗口行
- 长正文 streaming：`transcript` 大量追加时，`chrome` 的刷新 cadence 不应明显恶化

## 使用建议（避免性能坑）

- 正文、状态栏、弹层如果更新节奏不同，优先拆到不同 `TRenderPlane`
- 对于会频繁变化的文本：尽量把变化限制在小 rect 内（例如固定输入框区域）。
- 避免在一个 tick 内创建/销毁大量节点（频繁 `v-if` / 动态 key 重建）。
- 长列表用“视口”思路渲染（只渲染可见行），避免一次性生成上千 `TText`。
- append-only / streaming 日志用 experimental `TLogView` + `createAppendOnlyLogStore({ maxLines })`，不要把大数组传进组件，也不要每次 chunk 都重建全文字符串。
- 自定义 `TLogView` source 建议提供 `getLineKey(index)`；completed lines 的 key 保持稳定，mutable tail 或变更行的 key 随文本变化，才能复用 line-level render cache。
- 长期 streaming 日志应设置 `maxLines`；`source.firstLineIndex()` 表示 retained window 起点，`scrollTop` 相对于当前 retained window。
- `TLogView wrap=true` 会按 visual row 滚动，并按 `getLineKey(index) + width` 缓存 wrap 结果；`ansi=true` 会解析并缓存 ANSI SGR styled rows，但不支持 OSC8/highlight/rich span wrap。scroll payload 暴露的是 `estimatedVisualRowCount`，不是精确全量 wrap 后总行数。
- `TVirtualList rowScrollMode="unsafe-full-row"` 只用于 unclipped full-row 且独占 plane rows 的场景；DOM renderer 会只 repaint exposed dirty rows，pending rows 或不安全条件会回退到 viewport repaint。
- `TLogView` 用户离底后 append 不会抢 `scrollTop`；如果需要实时 tail，按 End 回到底部后会恢复 stick-to-bottom。
- `style`/`highlightStyle` 这类对象按 immutable 使用：热路径复用稳定对象，需要改变样式时传入新对象。

## 如何排查

- 关注 `dirtyRows`：是否明显偏大（接近全屏）
- 关注 `planes`：一次很小的交互是否错误地带上了 `transcript + chrome + overlay`
- 关注 FramePerf：`frameMs`、`renderManagerMs`、`commitMs`、`domFlushMs`、`scannedNodes` 和 `paintedNodes`
- stdout 模式：是否频繁输出大量 `\u001B[row;colH` + 多行文本（说明 repaint 行多）
- DOM 模式：是否每次交互都重建大量 span（说明 repaint 范围大或节点过多）
- 开启 `VUE_TUI_PROFILE=1` 后，重点看（`DIMCODE_PROFILE_TUI` 仍作为 legacy alias 保留）：
  - `planes.invalidate`
  - `planes.render`
  - `avgNodes`
  - `maxMs`
  - `maxWriteMs`

## Benchmark baseline

Phase 2 baseline 使用：

```bash
pnpm run bench:phase2
```

发布 gate 使用：

```bash
pnpm run bench:baseline
```

`bench:baseline` 会运行现有 benchmark，并用 `scripts/bench-baselines.json` 里的预算检查 dirty rows、scanned nodes 和 coalescing 等行为指标。
需要检查耗时预算时运行 `pnpm run bench:baseline:timing`。

脚本输出 JSON，覆盖：

- 1000 render nodes / dirty 1 row
- `TVirtualList` 10k / 100k rows spaced wheel 100 ticks
- `TVirtualList` 10k / 100k rows burst wheel 100 ticks through scheduler frame-task coalescing
- DOM sync flush 1 / 5 / 20 / 40 dirty rows
- append-only 1000 lines simulated path
- `TLogView` append 1000 lines at bottom / while detached from bottom / burst append
- `TLogView` long-line append 1000 lines at bottom / while detached from bottom / burst append
- `TLogView wrap=true` long-line append at bottom / detached / burst append
- `TLogView ansi=true` short-line append / long-line wrap / retention scenarios
- `TLogView` retention append 100k lines with max 1000 retained lines
- `TLogView` retained-window search: 100k plain lines, ANSI visible text, and wrapped long lines
- `TLogView Lab` smoke scenario: full companion wiring with search, links, markers and exact-index toggle

`bench:phase2` 使用 happy-dom synthetic baseline，适合做相同环境下的回归对比，不代表真实浏览器 FPS。
