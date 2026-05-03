# TLogView Lab

这个 example 把 experimental TLogView stack 作为一套可运行组合接起来，覆盖：

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

## 运行

```bash
pnpm run example:tlog-view-lab
```

这个命令默认跑 release-readiness 用的 smoke mount 并退出。要在真实终端里保持交互运行，使用：

```bash
pnpm run run:tlog-view-lab
```

## Hotkeys

- `Ctrl+1` append 200 lines
- `Ctrl+2` append 1000 lines
- `Ctrl+3` clear
- `Ctrl+4` replace tail
- `Ctrl+5` append chunk
- `Ctrl+R` reseed
- `Ctrl+V` toggle `visualIndexMode="exact" | "estimated"`

## 交互覆盖

- 搜索：text / regex / invalid regex / next / previous / select result
- Links：pointer click / keyboard focus / keyboard activate / panel select / panel activate
- Companion UI：scrollbar markers / minimap markers / exact visual index / retained-window metrics
- Streaming：append burst / retention / mutable tail / chunk append
