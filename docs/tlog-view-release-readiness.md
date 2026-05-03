# TLogView Release Readiness

这份清单对应 Phase 2 的收尾标准：重点不是继续加 feature，而是确认 experimental log-view stack 已经具备发布前的完整性。

## Checklist

| Area            | What to confirm                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| API exports     | `TLogView`、search companions、link companions、`createAppendOnlyLogStore()`、controllers 仍然全部从 `@simon_he/vue-tui/experimental` 暴露    |
| Docs            | `docs/components.md`、`docs/tlog-view-lab.md`、generated API docs 对 lab wiring 和 companion 关系描述一致                                     |
| Generated docs  | `pnpm run docs:gen` 可更新组件 API 文档且不引入额外漂移                                                                                       |
| Package exports | `pnpm run test:package-exports` 继续保持 experimental-only 边界                                                                               |
| Tests           | unit / smoke / package exports 全链路继续通过                                                                                                 |
| Bench           | `pnpm run bench:phase2` 继续覆盖 stream / retention / wrap / ansi / links / search / regex / exact-index / UI companion 这些 Phase 2 关键场景 |
| Demo            | `pnpm run example:tlog-view-lab` 可做 smoke mount；`pnpm run run:tlog-view-lab` 可在真实终端交互运行                                          |
| Scope control   | 不在这个阶段继续扩展 search engine、URL auto-detect、saved search persistence、result virtualization 或 global link index                     |

## Recommended validation

```bash
pnpm vitest run \
  test/tlog-view-lab-smoke.test.ts \
  test/tlog-view.test.ts \
  test/tlog-search-bar.test.ts \
  test/tlog-search-controller.test.ts \
  test/tlog-search-results.test.ts \
  test/tlog-search-pager.test.ts \
  test/tlog-links-panel.test.ts \
  test/tlog-link-controller.test.ts \
  test/tlog-scrollbar.test.ts \
  test/tlog-minimap.test.ts \
  test/package-exports.test.ts

pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:package-exports
pnpm run bench:phase2
pnpm run docs:build
pnpm run example:tlog-view-lab
```

## Known limitations

- experimental API
- no URL auto-detect
- no global link index
- no result virtualization
- no saved search persistence
- exact visual index is retained-window scoped
- regex evaluation can still block on one pathological long line
