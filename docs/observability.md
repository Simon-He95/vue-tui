# Observability

终端栅格里的 UI 问题，通常不是“状态错了”，而是：

- layout rect 不对
- focus 转移不对
- 某个局部更新意外带动了整轮 redraw
- plane 本来应该隔离，却在同一帧里一起刷新了

这个仓库现在提供 4 类轻量 observability 能力：

- **Frame trace**：按 commit 记录 `dirtyRows`、`planes` 和 `focusedId`
- **FramePerf samples**：按 scheduler frame 记录 `frameMs`、`renderManagerMs`、`commitMs`、renderer flush 和 dirty row/node 统计
- **TUI profiler**：按时间窗口统计 invalidates / renders / writes，并拆分 plane 维度
- **Debug overlay**：可视化 focus ring 和 rect outlines

## Goals

- 降低“发我日志再看”的循环，把关键信息直接暴露出来
- 让 plane/compositor 这类性能优化能被客观验证，而不只靠主观体感
- 保持 observability 可选开启，不影响 deterministic snapshot / replay

## Trace

`createTraceStore()` 记录三类事件：

- `event`
- `focus`
- `commit`

其中 `commit` 记录包含：

- `dirtyRows`
- `planes`
- `focusedId`

这意味着你现在可以直接区分：

- 这次提交只是 `chrome`
- 还是 `transcript` 和 `overlay` 一起参与了更新

## Profiler

设置环境变量：

```bash
VUE_TUI_PROFILE=1
VUE_TUI_FRAME_PERF_LOG_PATH=.dimcode/tui-perf.jsonl
VUE_TUI_PROFILE_COMPONENTS=1
```

会启用 TUI profiler；`DIMCODE_PROFILE_TUI` 仍作为 legacy alias 保留。它会输出：

- `invalidates`
- `renders`
- `writes`
- `avgMs` / `maxMs`
- `avgNodes`
- `avgWriteMs` / `maxWriteMs`
- `planes.invalidate`
- `planes.render`

CLI runtime 还会把 frame samples 写成 JSONL。默认路径是系统临时目录下的 `vue-tui-frame-perf.jsonl`；也可以用 `VUE_TUI_FRAME_PERF_LOG_PATH` 或 legacy `DIMCODE_TUI_PERF_LOG` 指定。若 `VUE_TUI_PROFILE_LOG_PATH` 以 `.jsonl` 结尾，frame JSONL 会复用该路径，聚合 profiler 也会自动输出 JSON 行，避免同一个文件混入文本日志。

应用内也可以直接接入 sink，并按当前窗口生成对外指标：

```ts
import {
  createFramePerfStore,
  createJsonlPerfSink,
  summarizeFramePerf,
} from "@simon_he/vue-tui/observability";

const sink = createJsonlPerfSink({
  write: (line) => console.log(line),
  includeComponents: true,
});

const framePerf = createFramePerfStore(120, {
  enabled: true,
  sink,
});

const summary = framePerf.summary();
const sameSummary = summarizeFramePerf(framePerf.list());
```

对 plane/compositor 改动来说，最有用的不是总 render 次数，而是：

- 某次高频更新是否只命中了目标 plane
- `chrome` 更新时 `transcript` 是否仍被拉进了 render
- stdout 最坏一次写出是否在变大

## FramePerf

`createFramePerfStore()` 使用 bounded ring buffer 保存最近 frame samples。默认不开启；设置 `globalThis.__VT_DEBUG_PERF__ = true` 或挂载 `TDebugOverlay` 后开始采样。

每个 sample 包含：

- `durationMs`
- `renderManagerMs`
- `commitMs`
- `domFlushMs` / `stdoutFlushMs`
- `dirtyRows`
- `activePlanes`
- `scannedNodes` / `paintedNodes`
- `rowBucketFallbacks`
- `coalescedInvalidates`
- `frameTaskCount`
- `coalescedFrameTasks`
- `frameTaskQueueDepthBeforeRun`
- `frameTaskQueueDepthAfterRun`
- `remainingFrameTasks`
- `droppedUpdates`
- `liveReasons`
- `queueDepth`

`FramePerfStore.summary()` / `summarizeFramePerf(samples)` 会把最近样本汇总成适合对外展示或上报的指标：

- `durationMs` / `renderManagerMs` / `commitMs` / `domFlushMs` / `stdoutFlushMs`: `avg`、`max`、`min`
- `dirtyRows`: `avg`、`max`、`sampledFrames`、`fullFrames`
- `scannedNodes` / `paintedNodes`: `avg`、`max`、`min`
- `coalescedInvalidates` / `coalescedFrameTasks` / `droppedUpdates`
- `maxQueueDepth`
- `rowBucketFallbacks`
- `reasons` 和 `activePlanes` 计数

建议产品面板展示 summary，排查具体交互时再展开 raw samples。`dirtyRows.fullFrames` 表示该帧是全屏/全 plane dirty，不能和具体 dirty row 数混在一起求平均。

`coalescedInvalidates` 只统计 scheduler invalidate coalescing；`coalescedFrameTasks` 统计 scheduler 层同 id frame task 合并；`droppedUpdates` 统计 producer/mailbox 层没有被单独 apply 的 payload 数。对于 latest-only mailbox，它们是真正被丢弃的中间状态；对于 merge mailbox，它们可能被折叠进最终 apply 的 payload。`droppedUpdates` 是 rendered-frame metric，不是全局 mailbox counter；没有 invalidate 的 mailbox run 可能不会产生 framePerf sample。

当前 wheel burst 指标有两个路径：

- `TList`: 使用 frame mailbox，通常表现为 `droppedUpdates > 0` 且 `coalescedFrameTasks = 0`
- `TVirtualList`: 暂时仍使用 scheduler-level wheel task coalescing，通常表现为 `coalescedFrameTasks > 0`，后续 mailbox 化后会对齐到 `TList`

`frameTaskCount` 是本帧实际执行的 scheduler-owned tasks。`frameTaskQueueDepthBeforeRun` / `frameTaskQueueDepthAfterRun` 是本帧运行前后的 scheduler frame task 数量，用来观察 producer/task pressure；`queueDepth` 仍然是 terminal scheduler 还有多少已安排的 flush/timer/frame handles，不能当作 pending producer 数。`domFlushMs` 只记录与本 scheduler frame 同调用栈完成的 DOM flush；普通 rAF-deferred DOM flush 会体现在 `renderer.debugStats.flush.last`，不会 retroactively 更新已经 push 的 frame sample。DOM renderer flush stats 里的 `planeRows` 是 flushed plane-row line elements，不是去重后的 terminal rows。

开启 `globalThis.__VT_DEBUG_PERF__` 后，如果单帧里有大量 unique high-priority frame tasks，scheduler 会输出 warning。high-priority task 应使用稳定 id 或 `createFrameMailbox()` 合并 latest-only producer；否则 normal/low task 只能在有限 high pressure 停止后继续 drain。

DOM full-row scroll 优化生效时，FramePerf 的 `dirtyRows` 应接近 exposed rows，而不是 viewport height；`renderer.debugStats.flush.last.planeRows` 表示实际 repaint 的 plane-row line elements。`dirtyRows` 反映 terminal commit 语义，`planeRows` 反映 DOM renderer 实际刷新量；line-node shift 本身不会被计入 dirty row 数。

FramePerf samples 只记录发生 render/commit 的 terminal frame；如果 frame task 只做预取或计算、没有调用 `ctx.invalidate()`，它可能被 drain 掉但不会产生 sample。

这让高频输入、滚动和 streaming 输出可以用同一组指标比较，而不是只看体感。

## Debug Overlay

`TDebugOverlay` 适合看：

- focus 现在落在哪个 node
- 命中矩形是否偏移
- 哪块区域的交互边界和视觉边界不一致
- 最近一帧的 `frameMs`、dirty rows、RenderManager nodes 和 DOM flush 数据

这类问题通常和性能问题一起出现，因为“错误的 rect”经常也意味着“错误的重绘范围”。

## 推荐排查顺序

1. 先开 trace，看 `commit.planes` 是否符合预期
2. 再看 FramePerf，确认瓶颈在 scheduler frame、RenderManager、commit 还是 renderer flush
3. 再开 profiler，看 `planes.invalidate` / `planes.render` 是否收敛
4. 如果是点击、焦点、hover 这类问题，再用 `TDebugOverlay` 看 rect 和 focus
