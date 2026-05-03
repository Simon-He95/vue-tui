# TLogView Lab

这页现在对应一个**可运行**的 lab example，而不再只是 blueprint。目标很直接：把整套 experimental log-view stack 放进同一个屏幕，证明它已经从“功能完成”进入“可交付 / 可回归验证”状态。

## 覆盖范围

- `TLogView`
- `TLogSearchBar`
- `TLogSearchResults`
- `TLogSearchPager`
- `TLogScrollbar`
- `TLogMinimap`
- `TLogLinksPanel`
- `useTLogSearchController`
- `useTLogLinkController`
- `createAppendOnlyLogStore({ maxLines: 2000 })`

## 运行入口

```bash
pnpm run example:tlog-view-lab
```

如果要在真实终端里保持交互运行：

```bash
pnpm run run:tlog-view-lab
```

相关源码：

- `examples/tlog-view-lab/App.ts`
- `examples/tlog-view-lab/main.ts`
- `examples/tlog-view-lab/README.md`
- `examples/tlog-view-lab.ts`

完整 release checklist 见：[TLogView Release Readiness](./tlog-view-release-readiness.md)

## Lab 里实际验证的内容

### 1. Streaming / retention

lab 使用：

```ts
createAppendOnlyLogStore({ maxLines: 2000 });
```

并且提供这些操作：

- `Ctrl+1` append 200 lines
- `Ctrl+2` append 1000 lines
- `Ctrl+3` clear
- `Ctrl+4` replace tail
- `Ctrl+5` append chunk
- `Ctrl+R` reseed

### 2. Mixed log content

示例数据会混合这些场景：

- 普通日志
- ANSI `ERROR` / `WARN` / `INFO`
- dim timestamp
- 长 JSON payload
- 宽字符 / emoji
- OSC8 hyperlink
- wrapped long line

### 3. Full search UX

lab 会把 search bar、results、pager、scrollbar markers、minimap markers 和 search controller 全部接起来，重点观察：

- text search
- regex search
- invalid regex
- caseSensitive / wholeWord
- next / previous
- select result
- marker click

### 4. Full link UX

lab 会同时接 visible-link panel 和 link controller，重点观察：

- pointer click link
- panel select / panel activate
- visible link focus / activate
- scroll 后 visible links refresh

### 5. Exact visual index

lab 保留 `visualIndexMode="exact" | "estimated"` 切换：

```txt
Ctrl+V
```

用来确认 retained-window metrics、scrollbar、minimap marker 和搜索结果定位在两种索引模式下都不会漂。

## 布局

lab 采用固定终端布局，把核心组合关系直接暴露出来：

```txt
+------------------------------------------------------------------------------------------------------------+
| [T]/[R] [Aa] [W]  query ...                                                                  SB MM        |
+---------------------------------------------------------------------------+----------------------+-------+
|                                                                           | Results              |       |
|                                                                           | Results              |       |
|                                 TLogView                                  | Results              |       |
|                                                                           | Pager                |       |
|                                                                           | Visible links        |       |
|                                                                           | Visible links        |       |
+---------------------------------------------------------------------------+----------------------+-------+
| hotkeys / status / metrics / recent actions                                                                    |
+------------------------------------------------------------------------------------------------------------+
```

## Wiring 要点

- `useTLogSearchController()` 和 `useTLogLinkController()` 仍然是 setup-time config；如果 page size / preview width / action wiring 要变，直接重建 controller。
- `TLogView` 只负责 retained-window render / search / visible-link state；scrollbar、minimap、results、links panel 都只消费外部 metrics / markers / page/window 数据。
- `refreshSearch()` / `refreshLinks()` 需要跟着 `scroll`、`visualIndex`、`search`、`searchMatch`、`searchMarkers`、`linkFocus`、`linkClick`、`linkActivate` 这些事件维持同步。
- `TLogLinksPanel.activeChange` 给的是 panel-local row；同步回 `TLogView` 时仍然应该使用 `payload.item.visibleIndex`。

## 验收步骤

1. 运行 `pnpm run example:tlog-view-lab`。
2. 保持默认 `wrap + ansi + links + keyboardLinks + visualIndexMode="exact"`，确认滚动、搜索高亮、visible links、scrollbar、minimap 一起更新。
3. 在 search bar 里切 `regex`，输入 `ERROR\\s+job-\\d+`，再输入非法 regex `[`，确认 search state 稳定。
4. 点 results / scrollbar markers / minimap markers / visible links / links panel，确认 current match 与 last action 会更新。
5. 连续执行 append burst、append chunk、replace tail、clear、reseed，确认 retention 和 companion metrics 仍然同步。

## Smoke coverage

`test/tlog-view-lab-smoke.test.ts` 会以轻量方式验证：

1. full lab mount
2. text / regex / invalid regex
3. search result selection
4. scrollbar marker selection
5. link click / visible link focus+activate / panel activate
6. append burst 后 metrics、markers、visible rows 继续可用

这个 smoke 不做 brittle 的 cell-perfect 快照，而是只断言 stack 级组合状态。

## Known limitations

- experimental API，暂不承诺长期稳定
- 不做 URL auto-detect
- 不做 global link index
- 不做 result virtualization
- 不做 saved search persistence
- exact visual index 仍然是 retained-window scoped
- regex evaluation 在单条极端长行上仍可能阻塞一次 scan slice
