# 1.0 Release Candidate

这页是 `1.0.0-rc.0` 的发布前检查单。目标是确认当前 `main` 可以作为 1.0 候选版本对外验证，而不是在 release prep 阶段继续扩大功能范围。

当前 package 版本：`1.0.0-rc.0`
下一候选版本：`1.0.0-rc.1`
npm prerelease dist-tag：`rc`

## Scope

- 从最新 `main` 准备 release candidate；未合并 feature PR 不写进 release notes。
- 不把 experimental API 提升到 root entrypoint。
- 不新增 renderer、持久化层或外部 LLM API 集成。
- 保持 root、core、runtime、renderer/dom、observability、vue、cli、markdown、experimental entrypoint 的边界清晰。
- API maturity、renderer capability、browser ARIA 和 terminal permission contract 以 [API Maturity](/api-maturity) 与 [Platform Contracts](/platform-contracts) 为准。

## Stability

1.0 RC 的稳定面：

- `@simon_he/vue-tui`
- `@simon_he/vue-tui/core`
- `@simon_he/vue-tui/renderer/dom`
- `@simon_he/vue-tui/cli`
- `@simon_he/vue-tui/markdown`

集成层入口：

- `@simon_he/vue-tui/vue`
- `@simon_he/vue-tui/runtime`
- `@simon_he/vue-tui/observability`

仍然实验性：

- `@simon_he/vue-tui/experimental`
- `TLogView` stack
- `TVirtualList` stack

RC 阶段可以在 `rc.0 -> rc.1` 修正 release blocker，包括必要的破坏性调整。`1.0.0` stable 发布后，Public entrypoint 的文档化 API 不在 patch/minor 中做 breaking change。Experimental API 不属于 stable 兼容性承诺。

## RC Adoption

RC 用户使用 `rc` dist-tag 安装：

```bash
pnpm add @simon_he/vue-tui@rc vue
```

只从公开 entrypoint 引入：

```ts
import { TBox } from "@simon_he/vue-tui";
import { createTerminalApp } from "@simon_he/vue-tui/cli";
```

不要 deep import：

```ts
import { TBox } from "@simon_he/vue-tui/dist/index.js";
```

## Migration Notes

- `TList` wheel scrolling 现在只代表 viewport scroll，不再把 wheel 作为 selection commit。
- `TList` Enter / double click 通过 `change` 表示确认选择；`update:modelValue` 只表示 selection change。
- `TRenderPlane.plane` mount 后按 immutable 处理；需要迁移 plane 时使用 `:key` remount。
- `scheduler.queueFrameTask()` 可能返回 `false`；producer 必须在被拒绝时清理自己的 pending state。
- 高吞吐组件继续从 `@simon_he/vue-tui/experimental` 引入，应用代码应把这些 imports 隔离在少量边界文件内。
- root entrypoint 迁移表见 [Migration to 1.0.0-rc.0](./migration-1.0.0-rc.0.md)。
- root entrypoint 收窄为稳定 browser-safe API；`TAnchor`、`TFlow`、`TInputBox`、`TPathPicker`、`TJsonEditor`、`TRenderPlane`、`TRenderLayer`、`TTransition`、router/composables 改从 `@simon_he/vue-tui/vue` 引入。
- root entrypoint 只导出 browser-safe 的 `createTInputHostPlugin()`；Node-aware 的 `createDefaultTInputHostAdapter()` / `defaultTInputHostPlugin` 继续从 `@simon_he/vue-tui/cli` 引入。
- 自定义 `TLogView` source 仍应通过 `version` 或 `getLineKey(index)` 表达内容变化，避免复用 stale line cache。

完整行为变更列表以 [CHANGELOG](https://github.com/Simon-He95/vue-tui/blob/main/CHANGELOG.md) 的 `1.0.0-rc.0` 为准。

## Package Exports

发布前确认：

- `package.json` 的 `files` 仍只发布 `dist`。
- README 的 entrypoint 表必须覆盖 `package.json` 的全部公开 subpath export。
- root entrypoint 不导出 `TVirtualList`、`TLogView`、log companion 或 markdown-only 组件。
- `@simon_he/vue-tui/core` 承载 terminal core、ANSI/theme/path/hyperlink helpers。
- `@simon_he/vue-tui/renderer/dom` 承载 DOM renderer factory 和 renderer capabilities。
- `@simon_he/vue-tui/vue` 承载扩展 Vue 组件、composables、router helpers 和 Vue runtime internals。
- `@simon_he/vue-tui/runtime` 承载 runtime wiring、selection helpers 和 clipboard abstraction。
- `@simon_he/vue-tui/observability` 承载 frame perf、profiler 和 trace helpers。
- `@simon_he/vue-tui/cli` 承载 stdout renderer、stdin driver、headless app、Node providers 和 recording。
- `@simon_he/vue-tui/markdown` 只承载 markdown parser / renderer API。
- `@simon_he/vue-tui/experimental` 承载 `TVirtualList`、`TLogView`、search/link/minimap companions 和 log plugins。
- ESM、CJS、types 三套 built export 都通过 `test:package-exports` 验证。

## Publish Tags

- Prerelease 版本必须用 `rc` dist-tag 发布，例如 `1.0.0-rc.0`。
- Stable 版本必须用 `latest` dist-tag 发布。
- GitHub Release workflow 的 `npm_tag` 输入默认为 `rc`，并会阻止 prerelease 使用 `latest` 或 stable 使用非 `latest` tag。
- 真实发布命令必须发布 workflow 验证过的 tarball：`npm publish "$TARBALL" --access public --provenance --tag "$NPM_TAG"`。

## GitHub Release Template

Title:

```txt
v1.0.0-rc.0
```

Body:

```md
## Summary

- 复制 CHANGELOG 中该版本的用户可见变更。
- 明确这是 1.0 release candidate，npm dist-tag 是 `rc`。
- 说明 `/experimental` 仍是 preview，不属于 stable 兼容性承诺。

## Validation

- `pnpm run release:dry-run`
- GitHub Release workflow dry-run
- `npm dist-tag ls @simon_he/vue-tui`
- npm 新项目安装 `@simon_he/vue-tui@rc`
```

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
pnpm run test:package-contract
pnpm run release:pack-smoke
pnpm run bench:baseline
pnpm run docs:build
```

`test:package-contract` 会对 packed tarball 跑 `publint` 和 ATTW package type analysis。`release:pack-smoke` 会把当前 tarball 安装到临时外部项目，并用 pnpm 和 npm 分别运行 root/cli/experimental 的真实 consumer 组合 smoke；它不是只检查 import 是否存在。

Benchmark gate 策略：

- `release:bench` 跑行为稳定的 baseline 检查，是 release gate。
- timing budget 只通过 `bench:baseline:timing` 手动确认，不作为默认 release gate，避免 CI timing 波动阻断行为正确的 RC。

示例 smoke：

```bash
pnpm run example:tlog-view-lab
pnpm run example:agent-console:smoke
pnpm run example:agent-console:terminal:smoke
```

真实终端交互验证按需手动跑，并在 release notes 里记录 terminal / OS：

```bash
pnpm run run:basic:terminal
pnpm run run:tlog-view-lab
pnpm run example:agent-console:terminal
```

## Manual Terminal Validation

RC 发布记录至少说明这些手工验收结果：

- macOS Terminal 或 iTerm2。
- Linux xterm-compatible terminal。
- Windows Terminal 或 WSL。
- resize。
- Ctrl+C cleanup。
- keyboard input。
- OSC8 links disabled/sanitized by default。
- OSC52 provider requires explicit opt-in。

## Release Handoff

1. 合并目标 feature / fix PR 后，从 `main` 创建 release candidate 分支。
2. Bump `package.json`、`CHANGELOG.md` 和这页的目标版本。
3. 确认 [Examples Index](/examples) 中的 browser、terminal、smoke 路径仍能运行。
4. 跑 `pnpm run release:dry-run`。
5. 如果 `docs:build` 更新 generated API，提交 generated docs；否则保持工作区干净。
6. GitHub Release title 使用 `v1.0.0-rc.0`；body 摘录 `CHANGELOG.md` 的同版本内容，并保留 Experimental API 不稳定说明。
7. 只在发布验证完成后通过 GitHub Release workflow 发布已验证的 tarball；prerelease 的 `npm_tag` 保持 `rc`。
8. 发布后验证 `npm view @simon_he/vue-tui@rc version`、`npm dist-tag ls @simon_he/vue-tui`，并在临时新项目里用 npm 安装一次 `@simon_he/vue-tui@rc`。
9. 如果发布错 tag，先用 `npm dist-tag add @simon_he/vue-tui@<stable-version> latest` 修正默认 tag；如果 tarball 本身有问题，deprecate 该版本并发布新的 RC。

`pnpm run release:ci` 只做 dry-run 验证，`pnpm run release`、`pnpm run release:local` 和 `pnpm run release:workflow-only` 会阻止本地手动发布。

## Rollback / Deprecate

不要覆盖已发布版本；npm package version 是不可变的。

如果只是 dist-tag 错误：

```bash
npm dist-tag add @simon_he/vue-tui@<stable-version> latest
npm dist-tag add @simon_he/vue-tui@<rc-version> rc
npm dist-tag ls @simon_he/vue-tui
```

如果 tarball 本身有问题：

```bash
npm deprecate @simon_he/vue-tui@<bad-version> "Deprecated release candidate; use @simon_he/vue-tui@rc"
```

然后修复问题、发布新的 RC 版本，并在 GitHub Release notes 里说明替代版本。
