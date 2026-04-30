# Observability

终端栅格里的 UI 问题，通常不是“状态错了”，而是：

- layout rect 不对
- focus 转移不对
- 某个局部更新意外带动了整轮 redraw
- plane 本来应该隔离，却在同一帧里一起刷新了

这个仓库现在提供 3 类轻量 observability 能力：

- **Frame trace**：按 commit 记录 `dirtyRows`、`planes` 和 `focusedId`
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
DIMCODE_PROFILE_TUI=1
```

会启用 TUI profiler。它会输出：

- `invalidates`
- `renders`
- `writes`
- `avgMs` / `maxMs`
- `avgNodes`
- `avgWriteMs` / `maxWriteMs`
- `planes.invalidate`
- `planes.render`

对 plane/compositor 改动来说，最有用的不是总 render 次数，而是：

- 某次高频更新是否只命中了目标 plane
- `chrome` 更新时 `transcript` 是否仍被拉进了 render
- stdout 最坏一次写出是否在变大

## Debug Overlay

`TDebugOverlay` 适合看：

- focus 现在落在哪个 node
- 命中矩形是否偏移
- 哪块区域的交互边界和视觉边界不一致

这类问题通常和性能问题一起出现，因为“错误的 rect”经常也意味着“错误的重绘范围”。

## 推荐排查顺序

1. 先开 trace，看 `commit.planes` 是否符合预期
2. 再开 profiler，看 `planes.invalidate` / `planes.render` 是否收敛
3. 如果是点击、焦点、hover 这类问题，再用 `TDebugOverlay` 看 rect 和 focus
