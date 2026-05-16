# Component Acceptance

这页定义 Vue 组件在 1.0 RC 阶段进入对应稳定性层级前需要满足的验收条件。组件的 props、events 和 import entrypoint 仍以 [组件 API（自动生成）](/generated/components-api) 为准；稳定性标签以 [API Maturity](/api-maturity) 为准。

## Public 组件

Public 组件可以从 `@simon_he/vue-tui` 或其他 Public entrypoint 引入。进入 Public 前必须满足：

- props、events、slots、exposed methods 在文档、生成 API 和实现中一致。
- DOM、stdout 和 headless 路径的行为边界清楚；不依赖 renderer private details。
- keyboard、pointer、focus 和 selection 行为有确定测试或示例覆盖。
- 输入、链接、clipboard、file URL、OSC52 等系统边界有显式 opt-in 或 sanitizer。
- packed package smoke 覆盖真实 consumer import，不依赖源码 deep import。
- 1.0 stable 后，1.x patch/minor 不做破坏性改动。

当前 Public 组件包括基础布局、文本、输入、列表、选择和对话框组件。具体列表以 generated API 的 `API maturity: Public` 为准。

## Advanced 组件

Advanced 组件从 `@simon_he/vue-tui/vue`、`@simon_he/vue-tui/runtime` 或 `@simon_he/vue-tui/observability` 引入。它们适合上层集成者使用，但不是 root stable surface。

- 文档化导出按 soft-stable 处理。
- 1.x 内如需破坏性调整，先 deprecate 至少跨一个 minor，或在文档中明确该 API 不受 Public SemVer 保护。
- Internal helper 不属于 consumer contract，不能被应用 deep import。
- 行为变化必须在 changelog 或 migration note 中说明。

## Experimental 组件

Experimental 组件只从 `@simon_he/vue-tui/experimental` 引入。

- 不进入 1.x stable 兼容性承诺。
- props、types、events 和行为可以调整，但必须写 release note。
- 不能被 root entrypoint re-export。
- 升级到 Public 前必须满足 [API Maturity](/api-maturity) 的 graduation 条件。

## RC 验收命令

发布 1.0 RC 前至少运行：

```bash
pnpm run release:dry-run
pnpm run e2e:browser-regressions
```

组件 API 或 public props/events 变化时，还要运行：

```bash
pnpm run docs:gen
pnpm run docs:build
```
