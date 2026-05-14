# 0.x Release Candidate

这页是 0.x release candidate 的发布前检查单。目标是确认当前 `main` 可以作为候选版本验证，而不是在 release prep 阶段继续扩大功能范围。

当前 npm 版本：`0.0.8`
下一候选版本：`0.1.0-rc.0`

## Scope

- 从最新 `main` 准备 release candidate；未合并 feature PR 不写进 release notes。
- 不把 experimental API 提升到 root entrypoint。
- 不新增 renderer、持久化层或外部 LLM API 集成。
- 保持 root、markdown、experimental 三个 entrypoint 的边界清晰。
- API maturity、renderer capability、browser ARIA 和 terminal permission contract 以 [API Maturity](/api-maturity) 与 [Platform Contracts](/platform-contracts) 为准。

## Migration Notes

- `TList` wheel scrolling 现在只代表 viewport scroll，不再把 wheel 作为 selection commit。
- `TList` Enter / double click 通过 `change` 表示确认选择；`update:modelValue` 只表示 selection change。
- `TRenderPlane.plane` mount 后按 immutable 处理；需要迁移 plane 时使用 `:key` remount。
- `scheduler.queueFrameTask()` 可能返回 `false`；producer 必须在被拒绝时清理自己的 pending state。
- 高吞吐组件继续从 `@simon_he/vue-tui/experimental` 引入，应用代码应把这些 imports 隔离在少量边界文件内。
- root entrypoint 只导出 browser-safe 的 `createTInputHostPlugin()`；Node-aware 的 `createDefaultTInputHostAdapter()` / `defaultTInputHostPlugin` 继续从 `@simon_he/vue-tui/cli` 引入。
- 自定义 `TLogView` source 仍应通过 `version` 或 `getLineKey(index)` 表达内容变化，避免复用 stale line cache。

完整行为变更列表以 [CHANGELOG](https://github.com/Simon-He95/vue-tui/blob/main/CHANGELOG.md) 的 `0.1.0-rc.0` 为准。

## Package Exports

发布前确认：

- `package.json` 的 `files` 仍只发布 `dist`。
- root entrypoint 不导出 `TVirtualList`、`TLogView`、log companion 或 markdown-only 组件。
- `@simon_he/vue-tui/markdown` 只承载 markdown parser / renderer API。
- `@simon_he/vue-tui/experimental` 承载 `TVirtualList`、`TLogView`、search/link/minimap companions 和 log plugins。
- ESM、CJS、types 三套 built export 都通过 `test:package-exports` 验证。

## Validation

快捷入口：

```bash
pnpm run release:dry-run
pnpm run release:check
pnpm run release:bench
pnpm run release:smoke
pnpm run release:pack-smoke
```

`release:dry-run` 是发布前最后一道本地 gate。它会跑 `release:check`、`release:bench`、`release:smoke` 和 packed package install smoke，确认当前构建可以从 `.tgz` 安装到外部项目后使用。实际发布只走 GitHub Release workflow。

展开命令：

```bash
pnpm run check:hidden-unicode
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:package-exports
pnpm run release:pack-smoke
pnpm run bench:baseline
pnpm run docs:build
```

`release:pack-smoke` 会把当前 tarball 安装到临时外部项目，并运行 root/cli/experimental 的真实 consumer 组合 smoke；它不是只检查 import 是否存在。

示例 smoke：

```bash
pnpm run example:tlog-view-lab
pnpm run example:agent-console:smoke
pnpm run example:agent-console:terminal:smoke
```

真实终端交互验证按需手动跑：

```bash
pnpm run run:basic:terminal
pnpm run run:tlog-view-lab
pnpm run example:agent-console:terminal
```

## Release Handoff

1. 合并目标 feature / fix PR 后，从 `main` 创建 release candidate 分支。
2. 确认 [Examples Index](/examples) 中的 browser、terminal、smoke 路径仍能运行。
3. 跑 `pnpm run release:dry-run`。
4. 如果 `docs:build` 更新 generated API，提交 generated docs；否则保持工作区干净。
5. 更新 `CHANGELOG.md`，把 `Unreleased` 的内容整理成目标版本。
6. 只在发布验证完成后通过 GitHub Release workflow 发布已验证的 tarball；`pnpm run release:ci` 只做 dry-run 验证，`pnpm run release`、`pnpm run release:local` 和 `pnpm run release:workflow-only` 会阻止本地手动发布。
