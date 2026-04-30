# 性能关注点与回归策略

Vue TUI 的性能瓶颈通常来自三部分：

1. **Vue 更新频率**：状态变化是否导致大量组件重新计算/重绘
2. **Terminal 写入范围**：一次交互是否触发了过大的 dirty rows 或错误的 plane repaint
3. **Renderer 输出成本**：DOM span 更新量 / stdout 输出量是否与真实变化区域成正比

## 当前库已具备的性能设计

- **plane-local dirty rows**：RenderManager 按 `default/transcript/chrome/overlay` 分别维护 dirty rows。
- **plane-scoped compositor**：Terminal commit 时从各 plane row buffer 合成最终可见 buffer，而不是共享一块渲染面反复清空。
- **增量渲染**：RenderManager 会尽量只重绘被请求的 dirty plane，避免无关区域参与本轮 repaint。
- **stdout 原子输出**：StdoutRenderer 单帧合成一次性输出，减少闪烁与撕裂。

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
- `style`/`highlightStyle` 这类对象尽量复用（避免每次都创建新对象导致 watchEffect 触发）。

## 如何排查

- 关注 `dirtyRows`：是否明显偏大（接近全屏）
- 关注 `planes`：一次很小的交互是否错误地带上了 `transcript + chrome + overlay`
- stdout 模式：是否频繁输出大量 `\u001B[row;colH` + 多行文本（说明 repaint 行多）
- DOM 模式：是否每次交互都重建大量 span（说明 repaint 范围大或节点过多）
- 开启 `DIMCODE_PROFILE_TUI=1` 后，重点看：
  - `planes.invalidate`
  - `planes.render`
  - `avgNodes`
  - `maxMs`
  - `maxWriteMs`
