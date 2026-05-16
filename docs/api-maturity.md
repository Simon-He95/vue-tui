# API Maturity

这页定义 `@simon_he/vue-tui` 的 API 稳定性标签。发布评审时按这里判断一个符号应该留在当前入口、移动入口，还是继续视为内部实现。

## 标签

| 标签         | 适用范围                                                             | 兼容性承诺                                                                              |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Public       | root、`/core`、`/renderer/dom`、`/cli`、`/markdown` 中已文档化的导出 | patch/minor 不做破坏性改动；需要破坏时进入下一个明确版本窗口                            |
| Advanced     | `/vue`、`/runtime`、`/observability` 中面向集成者的扩展导出          | 0.x 内可调整，但需要 changelog 或 migration note；1.0 RC 前必须明确是否进入 semver 保护 |
| Experimental | `@simon_he/vue-tui/experimental`                                     | 可以在 0.x 内调整 props、types、事件和行为；不属于 stable 兼容性承诺                    |
| Internal     | 未从 package entrypoint 导出的模块、helper、scheduler primitive      | 不承诺兼容；应用代码不应 deep import                                                    |

生成的 [组件 API](/generated/components-api) 会给每个组件标出 `API maturity` 和 import entrypoint。稳定基础组件从 root entrypoint 引入，扩展 Vue 组件从 `/vue` 引入；Experimental 组件只从 `/experimental` 引入。

## Entrypoint 边界

| Entrypoint                        | 标签         | 内容                                                                      | Breaking policy                                       |
| --------------------------------- | ------------ | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `@simon_he/vue-tui`               | Public       | core terminal、DOM renderer、稳定基础 Vue 组件、browser-safe helpers      | 0.x minor 也尽量不破；需要 migration note             |
| `@simon_he/vue-tui/core`          | Public       | terminal core、buffer-facing types、ANSI/theme/path/hyperlink helpers     | 类型或语义变更需要 migration note                     |
| `@simon_he/vue-tui/renderer/dom`  | Public       | DOM renderer factory、renderer capabilities、DOM renderer options         | 文档化 API patch/minor 不做破坏性改动                 |
| `@simon_he/vue-tui/vue`           | Advanced     | 扩展 Vue 组件、composables、router helpers 和 Vue runtime internals       | 可变，但需要 changelog；不保证与 Internal helper 同步 |
| `@simon_he/vue-tui/runtime`       | Advanced     | runtime wiring、selection helpers、clipboard abstraction                  | 可变，但必须保持默认无副作用 contract                 |
| `@simon_he/vue-tui/observability` | Advanced     | trace、frame perf、profiler hooks                                         | 可变；输出 schema 变更需要 release note               |
| `@simon_he/vue-tui/cli`           | Public       | stdout renderer、stdin driver、headless app、Node providers、recording    | Node-only contract；破坏性变更需要 migration note     |
| `@simon_he/vue-tui/markdown`      | Public       | markdown parser / block source / markdown components                      | 文档化 API patch/minor 不做破坏性改动                 |
| `@simon_he/vue-tui/experimental`  | Experimental | `TVirtualList`、`TLogView`、TLog companions、retained index、TLog plugins | 可随 0.x 调整，但必须有 release note                  |

规则：

- Public entrypoint 不能 re-export Experimental 组件或 Node-only CLI helper。
- `/experimental` 不能 re-export `/markdown` 的组件；高吞吐 log stack 和 markdown stack 分开发布。
- Internal helper 只允许在源码内部相对路径引用，不能加入 `exports`、`src/index.ts`、`src/cli.ts`、`src/markdown.ts` 或 `src/experimental.ts`。
- Deep import `@simon_he/vue-tui/dist/...` 不属于支持面。
- Vue injection keys 使用全局 protocol namespace，让同一 protocol 的 root/cli/experimental bundle 可以互通；如果 context shape 发生不兼容变化，必须 bump injection protocol。

## Experimental Graduation

Experimental API 进入 Public entrypoint 前必须同时满足：

| 条件              | 要求                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| API 稳定          | props、events、handle methods、composables 在至少一个 release cycle 内没有破坏性调整               |
| 文档完整          | `docs/components.md`、generated API docs、相关 examples 都描述同一套行为                           |
| Renderer contract | DOM、stdout、headless capability 分支有明确 fallback，不依赖隐藏 renderer 细节                     |
| Accessibility     | browser 使用路径有 ARIA/keyboard/selection 说明，默认不会制造不可退出的焦点陷阱                    |
| Permission model  | clipboard、OSC52、file URL、path provider、external link action 都有显式 opt-in 边界               |
| Consumer smoke    | packed package install smoke 用 pnpm 和 npm 覆盖 root/cli/experimental 的真实组合，而不只是 import |
| Tests             | unit、package exports、example smoke、packed package smoke 全部通过                                |

如果其中一项不满足，API 继续留在 `/experimental`。不要为了发版临时复制到 root entrypoint。

## Internal API

Internal API 包括但不限于：

- row cache、fingerprint、buffer storage layout
- scheduler mailbox、frame task implementation detail
- TLog internal wrapping/cache/search index helpers
- renderer private diffing helpers
- VitePress/demo-only shims

这些可以被 public 或 experimental implementation 使用，但不是 consumer contract。测试可以覆盖 internal 行为；文档只描述外部可依赖的语义。
