# 1.0 Release Candidate

这页是 `1.0.0-rc.0` 的发布前检查单。目标是确认当前 `main` 可以作为 1.0 候选版本对外验证，而不是在 release prep 阶段继续扩大功能范围。

当前 package 版本：`1.0.0-rc.0`
下一候选版本：`1.0.0-rc.1`
npm prerelease dist-tag：`rc`

## 1.0 Definition

`1.0.0` 定义为 stable contract release，而不是继续扩大功能范围或对外打 raw performance 对比的版本。

稳定承诺：

- 基础 terminal UI 能力、包入口、browser/CLI/headless 运行边界。
- 核心组件行为、renderer capability、安全默认值和发布验证流程。
- Public entrypoint 的文档化 API 在 1.x patch/minor 中不做 breaking change。

不承诺：

- `TVirtualList`、`TLogView`、agent console 聚合入口的全部 API 细节。
- 与 OpenTUI、`@opentui/solid` 或其他 renderer 的性能优势，除非有同机器、同 terminal、同场景的公开 benchmark 报告。
- experimental API 在 1.x 内的 SemVer 稳定性。

对外表述应聚焦：Vue 生态、browser DOM / CLI stdout / headless 三目标、明确 package contract、安全默认值，以及 logs / markdown / agent console 场景的高吞吐基础设施。不要写“比 OpenTUI 更快”“性能优于 Solid”“native 级性能”这类没有同场景数据支撑的结论。

## Scope

- 从最新 `main` 准备 release candidate；未合并 feature PR 不写进 release notes。
- 不把 experimental API 提升到 root entrypoint。
- 不新增 renderer、持久化层或外部 LLM API 集成。
- rc.0 发布前冻结会改变 Node 支持范围、bundler 输出或 publish 流程的 toolchain 更新；除非该更新修复当前 release gate 的明确失败。
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
- GitHub Release workflow 的 `npm_tag` 输入默认为 `rc`，只允许 `next`、`rc`、`beta`、`latest`，并会阻止 prerelease 使用 `latest` 或 stable 使用非 `latest` tag。
- 首选真实发布路径是 GitHub Release workflow，它会发布 workflow 验证过的 tarball：`npm publish "$TARBALL" --access public --provenance --tag "$NPM_TAG"`。
- 如果 workflow token 或 provenance 不可用，本地 fallback 是先跑 `pnpm run release:local:dry-run`，确认 npm dry-run 通过后再跑 `pnpm run release:local`。本地 fallback 发布 `.release/*.tgz`，固定使用 `rc` dist-tag，不生成 npm provenance。

## GitHub Release Template

Stable `1.0.0` 的对外 release notes 草稿见 [1.0.0 Release Notes Draft](/release-notes-1.0.0)。RC release 使用下面模板；stable 发布时不要保留 `rc` dist-tag、RC wording 或未填写的 validation placeholders。

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
- 说明 `/vue`、`/runtime`、`/observability` 是 Advanced entrypoint，soft-stable 但不等同于 root-level SemVer 承诺。

## Known boundaries

- 不要 deep import `dist` 或内部源文件。
- emoji、CJK 和 ambiguous width 仍受 terminal / font 组合影响。
- OSC8 links 默认经过 sanitizer；OSC52 clipboard provider 必须显式 opt-in。
- `/experimental` API 可以在 RC 阶段继续调整，应用代码应把这些 imports 隔离在少量边界文件内。

## Validation

- Local release dry-run: `<pass/fail>` (`pnpm run release:dry-run`, run date, Node version)
- GitHub Release workflow dry-run: `<pass/fail>` (`dry_run=true`, `npm_tag=rc`, run URL)
- Authenticated npm dry-run: `<pass/fail>` (`NPM_TOKEN` configured; `npm publish --dry-run --provenance --tag rc` ran)
- Tarball SHA256: `<sha256>  <tarball>`
- Node/Vue runtime matrix: `<pass/fail>` (Node 16.17.1 / 18 / 20 / 22 / 24 with Vue 3.3.0 / 3.5.33)
- Packed smoke: `<pass/fail>` (package contract, pnpm/npm consumer smoke, packed type smoke, browser Vite smoke)
- Benchmark report: `<pass/fail>` ([Benchmarks](/benchmarks), run date, Node version, behavior gate result, timing-review result if run)
- Post-publish dist-tag verification: `<pass/fail>` (`npm view @simon_he/vue-tui@rc version`, `npm dist-tag ls @simon_he/vue-tui`)
- npm new-project install: `<pass/fail>` (`npm install @simon_he/vue-tui@rc vue`)

## Manual terminal validation

| Target                          | Result      | Evidence                                      |
| ------------------------------- | ----------- | --------------------------------------------- |
| macOS Terminal 或 iTerm2        | pass / fail | terminal、OS、Node version                    |
| Linux xterm-compatible terminal | pass / fail | terminal、distro、Node version                |
| Windows Terminal 或 WSL         | pass / fail | terminal、Windows / WSL version、Node version |
| Resize                          | pass / fail | demo command                                  |
| Ctrl+C cleanup                  | pass / fail | demo command                                  |
| Keyboard input                  | pass / fail | demo command                                  |
| OSC8 links                      | pass / fail | sanitized / disabled by default               |
| OSC52 clipboard                 | pass / fail | explicit opt-in only                          |

## RC feedback format

- OS and terminal:
- Node version:
- Vue version:
- Package version:
- Import entrypoint:
- Renderer: CLI stdout / browser DOM / both
- Reproduction:
```

## Validation

快捷入口：

```bash
pnpm run release:dry-run
pnpm run release:check
pnpm run release:bench
pnpm run release:smoke
pnpm run release:pack-smoke
pnpm run release:local:dry-run
pnpm run test:ssr-import:package
```

`release:dry-run` 是发布前最后一道本地 gate。它会跑 `release:check`、`release:bench`、`release:smoke` 和 packed package install smoke，确认当前构建可以从 `.tgz` 安装到外部项目后使用。实际发布首选 GitHub Release workflow；如果 CI token 或 provenance 不可用，可以用 `release:local:dry-run` / `release:local` 发布同一个本地验证过的 tarball。

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

`test:package-contract` 会对 packed tarball 跑 `publint` 和 ATTW package type analysis。`release:pack-smoke` 会把当前 tarball 安装到临时外部项目，并用 pnpm 和 npm 分别运行 root/cli/experimental 的真实 consumer 组合 smoke；它不是只检查 import 是否存在。packed smoke 还会输出 tarball size、unpacked size、largest JS 和 largest d.ts，作为 RC 体积基线。

SSR/import-only smoke 会用 packed tarball 创建一个 Vite SSR consumer，导入 root、core、runtime、renderer/dom、observability、vue、markdown 和 experimental entrypoint，确认这些入口不会在 import-time 触发 `document` / `window`。

Benchmark gate 策略：

- `release:bench` 跑行为稳定的 baseline 检查，是 release gate。
- timing budget 只通过 `bench:baseline:timing` 手动确认，不作为默认 release gate，避免 CI timing 波动阻断行为正确的 RC。
- 公开 benchmark 口径见 [Benchmarks](/benchmarks)。release notes 必须说明测试日期、Node 版本、机器/OS、tarball digest、行为 gate 是否通过，以及 timing 是否手动复核。没有同场景横向报告时，不写竞品性能结论。

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
pnpm run run:agent-console:terminal
```

## Manual Terminal Validation

RC 发布记录至少说明这些手工验收结果，不要只保留 checklist：

发布前把表格填成真实结果；空白结果表示当前 RC 还不能发布。

| Target                                   | Result | Evidence |
| ---------------------------------------- | ------ | -------- |
| macOS Terminal 或 iTerm2                 |        |          |
| Linux xterm-compatible terminal          |        |          |
| Windows Terminal 或 WSL                  |        |          |
| resize                                   |        |          |
| Ctrl+C cleanup                           |        |          |
| keyboard input                           |        |          |
| OSC8 links disabled/sanitized by default |        |          |
| OSC52 provider requires explicit opt-in  |        |          |

## Release Handoff

1. 合并目标 feature / fix PR 后，从 `main` 创建 release candidate 分支。
2. Bump `package.json`、`CHANGELOG.md` 和这页的目标版本。
3. 确认 [Examples Index](/examples) 中的 browser、terminal、smoke 路径仍能运行。
4. 跑 `pnpm run release:dry-run`。
5. 如果 `docs:build` 更新 generated API，提交 generated docs；否则保持工作区干净。
6. GitHub Release title 使用 `v1.0.0-rc.0`；body 摘录 `CHANGELOG.md` 的同版本内容，并保留 Experimental API 不稳定说明。
7. 跑 GitHub Release workflow dry-run；仓库必须配置 `NPM_TOKEN`，否则 workflow 会失败，避免跳过 authenticated `npm publish --dry-run`。
8. 如果 GitHub Release workflow 可用，只在发布验证完成后通过 workflow 发布已验证的 tarball；prerelease 的 `npm_tag` 保持 `rc`。
9. 如果 workflow token 或 provenance 不可用，确认 `pnpm run release:local:dry-run` 通过后跑 `pnpm run release:local`。本地发布使用当前 npm 登录态；如果账号开启 publish 2FA，用 `NPM_CONFIG_OTP=<code> pnpm run release:local`。
10. 发布后验证 `npm view @simon_he/vue-tui@rc version`、`npm dist-tag ls @simon_he/vue-tui`，并在临时新项目里用 npm 安装一次 `@simon_he/vue-tui@rc`。
11. 如果发布错 tag，先用 `npm dist-tag add @simon_he/vue-tui@<stable-version> latest` 修正默认 tag；如果 tarball 本身有问题，deprecate 该版本并发布新的 RC。

`pnpm run release:ci` 只做 dry-run 验证。`pnpm run release:local:dry-run` 和 `pnpm run release:local` 是本地 fallback 发布路径；`pnpm run release` 和 `pnpm run release:workflow-only` 仍会阻止裸发布入口。

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
