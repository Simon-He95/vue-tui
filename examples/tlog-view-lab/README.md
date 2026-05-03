# TLogView Lab

这个 example 把 experimental TLogView stack 作为一套可运行组合接起来，覆盖：

- `TLogView`
- `TLogSearchBar`
- `TLogVirtualSearchResults`
- `TLogSearchPager`
- `TLogScrollbar`
- `TLogMinimap`
- `TLogVirtualLinksPanel`
- `useTLogSearchController`
- `useTLogVirtualSearchResults`
- `useTLogLinkController`
- `useTLogRetainedIndex`
- `createAppendOnlyLogStore({ maxLines: 2000 })`
- `createTLogViewSessionStore()`
- `tlog*Preset` theme / keymap helpers

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
- `Ctrl+S` save session state
- `Ctrl+O` restore session state
- `Ctrl+R` reseed
- `Ctrl+T` cycle preset theme/keymap
- `Ctrl+V` toggle `visualIndexMode="exact" | "estimated"`
- `F3` / `Shift+F3` next/previous search
- `Tab` / `Shift+Tab` focus next/previous visible link
- `Enter` activate focused link

## 交互覆盖

- 搜索：text / regex / invalid regex / next / previous / virtualized result select
- Links：pointer click / keyboard focus / keyboard activate / retained-window panel select / panel activate
- Companion UI：scrollbar markers / minimap markers / exact visual index / retained-window indexes / diagnostics density
- Streaming：append burst / retention / mutable tail / chunk append
- Productionization：plugin hooks / session persistence / theme presets / keymap presets
