# 高吞吐渲染架构规格

这份规格用于把列表、日志、streaming 输出和高频输入从 event-driven 更新改成 frame-driven 更新。目标不是替换 renderer，而是在保留 Vue 组件 API 和 DOM/stdout 双环境的前提下，减少无效计算、降低分配、把渲染范围收敛到可见区和 dirty rows。

## 背景

当前实现已经有这些基础：

- `RenderManager` 维护 plane-local dirty rows，并在 repaint 前判断 render node 是否与 dirty rows 相交。
- `createTerminal()` 支持 plane commit、scroll operation 和 `commit({ sync })` 元数据。
- stdout renderer 已经有 row fingerprint、scroll operation 和 dirty row diff。
- `TDebugOverlay`、trace store、`createTuiProfiler()` 已经能观测部分 dirty rows 和 plane 信息。

当前需要补齐的点：

- partial repaint 时，`RenderManager` 仍然按 plane 扫描全部 `planeNodes`，扫描成本随节点数线性增长。
- 大数据组件如果把数组、临时对象或复杂 computed 放进 `useRenderNode().deps`，Vue effect 成本会先被放大。
- `TList` wheel handler 目前同步更新 `scrollTop`、可能更新 active 和 `update:modelValue`，并直接 invalidate。
- DOM renderer 在 `terminal.commit()` 后再排一次 rAF，可能把一次高优先级输入拆成 buffer render 和 DOM flush 两帧。
- debug 数据缺少统一 frame 级指标，难以判断瓶颈在 Vue、layout、RenderManager、terminal compose 还是 renderer flush。

## 非目标

- 不把性能问题先归因于 JS 或 DOM renderer。
- 不默认引入 native/WASM backend。
- 不重写已有组件层，只在大数据场景新增专用路径，避免把 `TList` 做成复杂的全能组件。
- 不为假设中的未来场景加 feature flag 或兼容 shim。旧 API 可以保留，但新能力只服务明确的大数据和 streaming 场景。

## 目标架构

### 数据流

```txt
input/wheel/stream chunk
  -> frame coalescer
  -> scheduler live/on-demand frame
  -> component applies latest state
  -> RenderManager dirty rows / row buckets
  -> terminal plane buffer and compositor
  -> renderer same-frame or deferred flush
  -> frame perf sample
```

核心原则：

- 高频输入只记录 pending delta，状态更新在 frame 内统一消费。
- 大数据组件只处理 visible window + overscan，不让全量数据进入 Vue deep reactivity。
- 慢速滚动优先使用 `unsafeScrollPlaneRows()` shift，之后只 repaint exposed rows。
- RenderManager 用 dirty rows 查 row buckets 得到候选节点，再按 stack order paint。
- 高优先级输入和滚动允许 DOM renderer 同帧 flush，普通低优先级更新仍可延后。

## Feature 规格

### 1. RenderManager row buckets

实现位置：`src/vue/render/render-manager.ts`

新增内部索引：

```ts
type RenderRowBuckets = Map<TerminalRenderPlane, Map<number, Set<string>>>;
```

注册、更新、卸载节点时维护索引：

- 有 rect 的节点按 `[rectY0, rectY1)` 加入对应 plane 的 row bucket。
- rect 为空的节点视为 plane-global 节点，partial repaint 时仍必须参与 paint。
- rect 变化、plane 变化、unregister 时必须先移除旧索引，再写入新索引。
- resize 时重建 buckets 或按当前 node 快照重新索引。

render 时：

- full plane repaint 仍按排序后的 `planeNodes` 处理。
- partial repaint 使用 dirty rows 查 bucket，合并 candidate ids。
- plane-global 节点加入 candidate ids。
- candidate ids 必须按现有 stack/zIndex/order 排序，保证覆盖顺序不变。
- `scannedNodes` 语义改为本轮候选节点数，不再是 plane 节点总数。

验收测试：

- `test/render-manager.test.ts` 增加大量节点只 dirty 一行的测试：`paintedNodes` 只包含相交节点，`scannedNodes` 小于 plane 总节点数。
- 覆盖 node rect 更新跨行、plane 迁移、unregister 后 bucket 不再命中。
- 覆盖 rect 为 null 的 plane-global 节点在 partial repaint 中仍会 paint。

### 2. Frame-driven scheduler

实现位置：`src/vue/context.ts`、`src/vue/components/TerminalProvider.ts`、`src/create-terminal-app.ts`

扩展 scheduler 能力：

```ts
type TerminalSchedulerMode = "on-demand" | "live";

interface TerminalScheduler {
  invalidate(options?: TerminalSchedulerInvalidateOptions): void;
  flush(): void;
  flushNow(): void;
  queueFrameTask(task: TerminalFrameTask): boolean | void;
  configure(options: { targetFps?: number; maxFps?: number; frameBudgetMs?: number }): void;
  requestLive(reason: string): () => void;
  dropLive(reason: string): void;
  isInsideFrame(): boolean;
}
```

行为：

- 默认 `on-demand`，只有 invalidate 才 render。
- `queueFrameTask()` 把 wheel/input/stream 这类高频任务排到下一帧；同 `id` 任务只保留最新 `run`，priority 取更高值，reason 合并，`sync` 只要任一任务为 `true` 就保留。返回 `false` 表示 scheduler 显式拒绝任务；返回 `true` 或旧实现的 `undefined` 都表示接受。
- `requestLive(reason)` 使用引用计数进入 live mode，直到对应 `dropLive(reason)` 后退出。
- live mode 按 `targetFps` 运行，但不超过 `maxFps`。
- 高优先级 invalidation 可同帧 flush，普通 invalidation 继续 rAF 合并。
- frame task 内部的 `invalidate()` 不递归 flush；任务 drain 完成本帧才 render/commit。`flushNow()` 会先 drain 当前 pending frame tasks，再同步 commit。
- frame 内暴露 `frameBudgetMs`，供 stream coalescer 或虚拟组件决定本帧处理量。

验收测试：

- `test/scheduler-priority.test.ts` 覆盖 high priority 仍立即 flush。
- `test/scheduler-frame-tasks.test.ts` 覆盖同 id coalesce、priority 顺序、reason merge、frame 内 invalidate、`flushNow()` drain、live lease 和 frame budget。
- 覆盖同一 frame 内多个 invalidate 合并成一次 render。

### 3. DOM renderer same-frame flush

实现位置：`src/renderer/dom/dom-renderer.ts`

commit handler 需要读取 `sync`：

```ts
terminal.on("commit", ({ dirtyRows, planes, sync }) => {
  collectPendingRows(dirtyRows, planes);
  if (sync || scheduler.isInsideFrame()) flushPending();
  else requestAnimationFrame(flushPending);
});
```

实际接入可以先只支持 `sync`，`scheduler.isInsideFrame()` 随 scheduler 扩展落地。

验收测试：

- DOM renderer unit test 使用同步 rAF 计数，`terminal.commit({ sync: true })` 不应创建新的 rAF。
- 普通 `commit()` 仍合并到下一帧，避免大量低优先级 DOM 更新同步阻塞。
- `commit({ sync: true })` 只应用于输入、光标、滚动这类小范围高优先级更新；大范围/full repaint sync flush 在 debug perf 模式下需要可观测告警。
- DOM renderer 的 `sync: true` 是 budgeted sync：表示允许在预算内同帧 flush，不表示强制所有 DOM work 在调用返回前完成。默认预算可通过 `createDomRenderer(..., { syncFlushMaxRows, syncFlushCellBudget })` 或 `TerminalProvider.domRendererOptions` 调整，调用方不应依赖 `sync: true` 一定同步。

### 4. `TVirtualList`

实现位置：新增 `src/vue/components/TVirtualList.ts`

`TList` 保留小数据和简单选择语义。大数据使用 `TVirtualList`，避免把现有组件堆成全能组件。
`TVirtualList` 当前通过 `@simon_he/vue-tui/experimental` 暴露，暂不进入 root export。

建议 props：

```ts
interface TVirtualListProps<T> {
  x: number;
  y: number;
  w: number;
  h: number;
  itemCount: number;
  itemVersion: number;
  getItem: (index: number) => T;
  getKey?: (index: number) => string | number;
  renderItem?: (item: T, index: number) => string;
  modelValue?: number;
  overscan?: number;
  style?: Style;
  activeStyle?: Style;
  autoFocus?: boolean;
  rowScrollMode?: "off" | "unsafe-full-row";
}
```

deps 只允许包含：

```ts
[
  visible.value,
  fullRect.value,
  clipRect.value,
  itemCount.value,
  props.itemVersion,
  props.getItem,
  props.renderItem,
  active.value,
  focused.value,
  props.style,
  props.activeStyle,
  defaultStyle.value,
];
```

不允许把大数组或每行对象数组放进 deps。数据本体由外部 `shallowRef`、`markRaw` 或普通 store 管理。`getItem` 和 `renderItem` 应保持稳定引用，数据变化通过 `itemVersion` 驱动。`scrollTop` 不进入 deps；滚动由组件内部 `render.markDirtyRows(renderNodeId, rows)` 标记 dirty rows，否则会退化成每次滚动都整块 repaint。`markDirtyRows()` 接收的是 terminal absolute Y，不是组件内 local row；它标记 node 所在 plane 的行，render 时也会 repaint 同 plane 中与这些行相交的其他 nodes。

wheel 行为：

- wheel 只改变 `scrollTop`。
- wheel 不同步改变 active。
- wheel 不 emit `update:modelValue`。
- `scroll` event 每 frame 最多 emit 一次。
- 小 delta 且 `abs(delta) < viewportHeight` 时，**仅当 `rowScrollMode: "unsafe-full-row"`**、当前 renderer capability 明确支持 `scrollOperations`、且 ownsFullRows 时使用 `render.unsafeScrollPlaneRows(plane, y, y + h, delta)`，只 dirty exposed rows。
- 不满足 `rowScrollMode` 条件、DOM renderer 关闭 `enableScrollOperations`、list 非 full-row 或被 clip 时，wheel 直接 repaint viewport。
- PageUp/PageDown/Home/End 或大跳转直接 repaint viewport。

> **`rowScrollMode` 语义**：`unsafeScrollPlaneRows()` 会 shift 该 plane 的完整 row region，只适合 TVirtualList 独占这些 rows 的 full-row 场景；如果同一 plane 上还有其它内容覆盖这些 rows，请保持默认 `rowScrollMode: "off"`（repaint viewport）。调用 `render.unsafeScrollPlaneRows()` 前也必须确认当前 renderer 会消费 terminal `scrollOperations`；DOM renderer 会通过移动 line nodes 消费该 hint，但这仍然不是组件内部的局部 rect scroll。

Frame mailbox 语义：

`createFrameMailbox()` 是 at-most-once 的 frame coalescing primitive，不是 durable queue。它适合 wheel `scrollTop`、resize sample、cursor blink、latest-only highlight 这类只关心最新状态的渲染工作。`apply()` 抛错时，pending payload 已被清空，不会重试，也不会上报这次 coalesced `droppedUpdates`；需要可靠处理的数据必须保存在 owner/source/store 里，mailbox 只合并“下一帧要 repaint 到哪个状态”。如果某类任务需要 retry，调用方应在 `apply()` 内捕获错误并保留可重试状态。

键盘和点击行为：

- 键盘导航改变 active，并保证 active visible。
- 点击改变 active 和 modelValue。
- Enter 触发 change。
- `modelValue` 是 optimistic controlled：键盘/点击会先更新内部 active 并 emit `update:modelValue`，后续如果父组件接受、延迟或覆盖 prop，组件会跟随新的 prop；父组件完全忽略 update 时会保留本地 active。

验收测试：

- wheel 连续触发多次，只产生一次 frame scroll update。
- wheel 滚动不会 emit `update:modelValue`。
- 单行慢滚时 commit dirty rows 只包含 exposed row。
- 大跳转 repaint viewport rows，不走 `unsafeScrollPlaneRows()`。
- `itemVersion` 变化只重绘 visible window，不因数据总量扩大导致全量 render。

### 5. `TLogView` streaming path

实现位置：`src/vue/components/TLogView.ts`、`src/vue/log/append-only-log-store.ts`。
`TLogView` 当前通过 `@simon_he/vue-tui/experimental` 暴露，暂不进入 root export。

数据接口：

```ts
interface TLogDataSource {
  lineCount(): number;
  getLine(index: number): string;
  getLineKey?: (index: number) => string | number;
  firstLineIndex?: () => number;
}
```

append-only store：

```ts
const log = createAppendOnlyLogStore({ maxLines: 10_000 });

log.appendLine("ready");
log.appendChunk("hello");
log.appendChunk(" world\nnext line");
log.replaceTail("next line...");
```

组件 API：

```vue
<TLogView :source="log.source" :version="log.version" />
```

策略：

- `appendLine` / `appendLines` / `appendChunk` / `replaceTail` 只更新普通 store 和 `version` ref，不把日志数组放进 Vue deep reactivity。
- chunk append 不重建全文字符串。
- `createAppendOnlyLogStore({ maxLines })` 用 head pointer 保留最近 logical lines，completed lines 和 mutable tail 都计入窗口；`source.firstLineIndex()` 暴露 retained window 的绝对起点。
- `TLogView` paint 只读取 visible window；默认 fixed one-line rows 不做 wrap、ANSI parse 或 highlight。
- `wrap=true` 时，logical source line 会按 cell width 映射为多个 visual rows；scrollTop、wheel 和 keyboard scroll 都按 visual row 计数。
- `TLogView` 在 source 提供 `getLineKey(index)` 时缓存 fixed one-line 的 clipped/padded render string；`wrap=true` 还会按 `getLineKey(index) + width` 缓存每条 logical line 的 wrapped visual rows。`ansi=true` 额外缓存 ANSI parsed segments、ANSI wrapped visual rows 和 clipped styled row 结果。`createAppendOnlyLogStore()` 为 completed lines 提供稳定 key，为 tail mutation 提供变化 key。
- 未提供 `getLineKey` 时使用 `version + index` 作为 fallback，保证正确性但限制跨 version 复用。
- `version` 不进入 render deps；source 变化通过 scheduler frame task 以 `reason: "stream"` 合并。
- 用户在底部时 stick-to-bottom；离开底部后 append 不抢 scrollTop，也不 repaint 当前 viewport。
- retention trim 旧 head lines 时，非受控 `TLogView` 会按 visual-row 调整 scrollTop 以保持 detached viewport 锚点；受控模式只 emit 调整后的 `update:scrollTop`，等待父组件回写。
- `TLogView` 优先服务 append-only 或 tail-only mutation。`getLineKey(index)` 用于缓存正确性和 append/tail 场景；它不是任意历史行 diff 机制。自定义 source 如果会修改任意可见历史行，应替换 source identity，或等待后续 explicit viewport refresh API。
- `wrap=true` 的大日志初始底部和 append-only streaming 路径只测量 bottom/visible window 加 overscan，不做全量 wrap。`ansi=true` 支持 ANSI SGR style spans；OSC8 hyperlink、highlight、rich span metadata 和 arbitrary variable-height rows 仍不是该路径能力。
- `wrap=true` 下，`scroll` payload 的 `estimatedVisualRowCount` 和内部 scroll range 基于已测量 visual rows + 未测量行的 1-row estimate；bottom stickiness、append、visible-window rendering 是准确路径，精确 total visual rows 只有在所有行都被测量后才成立。
- full-row 且 `rowScrollMode="unsafe-full-row"` 时，单行 append 可以使用 `unsafeScrollPlaneRows()` + exposed dirty rows；非 full-row、clipped 或 renderer 不支持 `scrollOperations` 时回退 viewport repaint。

验收测试：

- `getLine()` 调用量随 viewport 高度增长，不随总行数增长。
- append at bottom 在 full-row unsafe 场景只 dirty exposed rows。
- 用户离开底部后 append 不改变当前 visible top。
- clear/shrink 会 clamp scrollTop 并 repaint viewport。
- stream frame 在 FramePerf 中记录 `reason: "stream"`、`frameTaskCount` 和 coalescing 数据。

### 6. Style interning

实现位置：`src/core/` 或 `src/vue/utils/`，先服务组件 paint 循环。

规则：

- paint 循环中不要每行创建 `{ ...base, inverse: true }`。
- `Style` interning 返回 frozen stable object，但不要为了缓存冻结公开的 `defaultStyle` ref；空样式由 style-cache 内部归一到 frozen singleton。
- key 使用稳定字段顺序，覆盖现有 style 字段。

### 6.1 Wide-cell clipping

`sliceByCellsRange()` 在 range start/end 落进宽字符内部时，用空格保留被占用的 cells，而不是把后续字符左移。这个语义会影响 `TList`、`TLogView`、`TVirtualMarkdown`、markdown renderer 和所有直接使用 text utils 的调用点。带 style 或 href 的宽字符占位空格保留原 segment style，调用方仍需要确保下一 cell/row 不泄漏旧 style 或 OSC8 href。

验收测试：

- 相同 style 多次 intern 返回同一个对象。
- `TList`/`TVirtualList` 选中行 style 不因每次 paint 产生新对象。

### 7. Frame perf 和 debug overlay

实现位置：`src/observability/`、`src/vue/components/TDebugOverlay.ts`

统一 frame sample：

```ts
type FramePerf = {
  frameId: number;
  reason: "scroll" | "input" | "stream" | "resize" | "data" | "unknown";
  inputToPaintMs?: number;
  vueEffectMs?: number;
  layoutMs?: number;
  renderManagerMs: number;
  terminalWriteMs?: number;
  composeMs?: number;
  commitMs: number;
  domFlushMs?: number;
  stdoutFlushMs?: number;
  dirtyRows: number | null;
  dirtyCells?: number;
  scannedNodes: number;
  paintedNodes: number;
  rowBucketFallbacks?: Array<{
    plane: string;
    reason: "dirty-ratio" | "candidate-ratio";
    dirtyRows: number;
    planeNodes: number;
    candidates?: number;
  }>;
  droppedUpdates: number;
  coalescedInvalidates: number;
  heapUsed?: number;
};
```

`TDebugOverlay` 至少展示：

- `frameMs`
- `dirtyRows`
- `scannedNodes`
- `paintedNodes`
- `queueDepth`
- `coalescedInvalidates`
- `droppedUpdates`

验收测试：

- profiler 接收 `RenderStats` 并输出 `scannedNodes/paintedNodes`。
- debug overlay 能在启用时显示最近 frame stats。
- 默认关闭时不产生额外 Vue reactive churn。

## 落地阶段

### Phase 1: 两周内

目标是降低滚动卡顿和一帧延迟，尽量少改公共 API。

| 项目                                                                | 状态         |
| ------------------------------------------------------------------- | ------------ |
| DOM renderer `commit({ sync: true })` same-frame flush              | ✅ done      |
| RenderManager row buckets (partial repaint)                         | ✅ done      |
| `TVirtualList` data-source API (`itemCount/getItem/itemVersion`)    | ✅ done      |
| Full-row `rowScrollMode` exposed rows                               | ✅ done      |
| DOM renderer consume `scrollOperations`                             | ✅ done      |
| DOM `TVirtualList` full-row exposed rows                            | ✅ done      |
| DOM non-full-row/clipped/disabled fallback                          | ✅ done      |
| DOM sync flush scoped to current commit rows/planes                 | ✅ done      |
| Row bucket degradation threshold (50%/60%)                          | ✅ done      |
| `TVirtualList.rowScrollMode` opt-in for unsafe row-scroll fast path | ✅ done      |
| Scheduler-owned frame tasks / live mode                             | ✅ Phase 2.1 |
| Experimental `TLogView` append-only streaming path                  | ✅ Phase 2.2 |
| `TLogView` fixed one-line line-level render cache                   | ✅ Phase 2.5 |
| `TLogView` plain-text wrap with line-level wrap cache               | ✅ Phase 2.6 |
| `TList` wheel 行为修改（不再同步更新 active/modelValue）            | ✅ done      |
| Debug overlay 展示 `scannedNodes/paintedNodes/dirtyRows/frameMs`    | ✅ Phase 2.0 |

> **注意**：`TVirtualList` 的 `rowScrollMode` 默认为 `"off"`。这是危险优化开关，只有显式设置 `rowScrollMode: "unsafe-full-row"`、当前 renderer 支持 `scrollOperations`、且 list 是 unclipped full-row 并独占这些 plane rows 时，才会使用 `unsafeScrollPlaneRows()` + exposed dirty rows。DOM renderer 的优化只移动 line nodes 并 repaint exposed dirty rows，不改变 terminal buffer/compositor 语义。

> **当前范围**：本轮完成 `TList` wheel burst mailbox、RenderManager dirty-row primitive 和 frame task metrics；`TVirtualList` / `TLogView` 的 fast/slow scroll mailbox 化仍是后续工作。

验收命令：

```bash
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm exec vitest run \
  test/frame-mailbox.test.ts \
  test/list-wheel-mailbox.test.ts \
  test/list-selection-semantics.test.ts \
  test/list-data-geometry.test.ts \
  test/list-clipping.test.ts \
  test/render-manager.test.ts \
  test/render-plane-frame-mailbox.test.ts \
  test/scheduler-frame-tasks.test.ts \
  test/style-cache.test.ts \
  test/text-utils.test.ts \
  test/tlog-view.test.ts \
  test/tmarkdown-layout.test.ts \
  test/tmarkdown-components.test.ts \
  test/tvirtual-markdown-perf.test.ts \
  test/tvirtual-markdown-streaming.test.ts \
  test/virtual-list.test.ts \
  test/ui-regressions.test.ts \
  test/index.test.ts
pnpm run bench:scroll-mailbox
pnpm run bench:phase2
pnpm run check:hidden-unicode
pnpm exec tsx scripts/generate-component-api-docs.ts
git diff --exit-code docs/generated/components-api.md
pnpm run build
pnpm run test:package-exports
```

### Phase 2: 一个月内

目标是让大数据追加和 streaming 输出可控。

1. scheduler 增加 `queueFrameTask/requestLive/dropLive/configure/isInsideFrame`，`TVirtualList` wheel 已迁移到 scheduler frame task。
2. 新增 `TLogView` append-only store + visible-window streaming path。
3. 后续 stream coalescer 再按 `frameBudgetMs` drain 更复杂输入。
4. `TLogView` fixed one-line render cache、plain-text wrap cache 和 ANSI SGR styled row cache 已落地；highlight / rich span / arbitrary variable-height rows 仍是后续能力。
5. 补 benchmark 脚本：10k/100k rows 滚动、短行和长行 log append。

验收命令：

```bash
pnpm vitest run test/render-manager.test.ts test/perf-budgets.test.ts
pnpm run bench:vfor
pnpm run typecheck
```

### Phase 3: 长期

目标是统一 DOM/stdout 的 diff 能力，并为可选 backend 留边界。

1. 抽出 JS `FrameBuffer` 和 `DiffEngine`。
2. DOM renderer 和 stdout renderer 共用 row/span diff。
3. 只把重计算热点做成可选 WASM/native backend，例如 wcwidth、ANSI parse、row diff、plane compose。
4. 与 OpenTUI 做同场景 benchmark 对照，但 native backend 不作为默认依赖。

## 测试矩阵

| 场景                          | 断言                                                   | 文件                                            |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| dirty 一行但 plane 有大量节点 | `scannedNodes` 低于 plane 总节点数，paint 顺序不变     | `test/render-manager.test.ts`                   |
| node rect 跨行更新            | 旧行和新行 bucket 都正确更新                           | `test/render-manager.test.ts`                   |
| full-row wheel 慢滚一行       | `dirtyRows` 等于 exposed row；DOM 只 flush exposed row | `test/virtual-list.test.ts`                     |
| DOM renderer scrollOperations | line nodes 被移动；pending overlap 回退 repaint        | `test/dom-renderer-scroll-operations.test.ts`   |
| wheel 连续输入                | 多个 wheel event 合成一次 frame update                 | 新增 `test/virtual-list.test.ts`                |
| wheel 不改 selection          | 不触发 `update:modelValue`                             | 新增 `test/virtual-list.test.ts`                |
| DOM sync commit               | `commit({ sync: true })` 不排第二个 rAF                | `test/dom-renderer-sync-flush.test.ts`          |
| high priority invalidate      | 仍同 tick flush                                        | `test/scheduler-priority.test.ts`               |
| live mode 引用计数            | 全部 drop 后停止 loop                                  | `test/scheduler-priority.test.ts`               |
| stream append                 | 只 dirty tail rows，离底部不 auto-scroll               | 新增 `test/tlog-view.test.ts`                   |
| debug stats                   | overlay 展示 `scannedNodes/paintedNodes/dirtyRows`     | `test/perf-budgets.test.ts` 或新增 overlay test |

## 文档要求

功能落地时同步更新：

- `docs/performance.md`：性能策略、推荐组件和验收命令。
- `docs/observability.md`：FramePerf 字段、debug overlay 显示项。
- `docs/components.md`：新增 `TVirtualList`、`TLogView` 的使用场景。
- `docs/generated/components-api.md`：公共组件 API 变更后运行 `pnpm run docs:gen`。

## Definition of Done

每个阶段结束时必须满足：

- 有对应 Vitest 覆盖结构性行为，不只依赖手感。
- 高优先级滚动或输入没有 buffer render 与 DOM flush 的额外帧。
- 大数据组件的 deps 不包含大数组身份。
- `RenderStats.scannedNodes` 能证明 dirty rows 没有退化为 plane 全扫描。
- debug overlay 或 profiler 能看到 dirty rows、painted nodes、scanned nodes 和 frame duration。
