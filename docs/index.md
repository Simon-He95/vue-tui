---
title: Vue TUI
description: Vue 3 terminal UI toolkit for browser DOM and CLI stdout renderers.
---

<script setup lang="ts">
import DocsLandingTerminal from './.vitepress/components/DocsLandingTerminal.vue'
</script>

# Vue TUI

Vue TUI 是面向 Vue 3 的 terminal UI toolkit。你可以用同一套组件模型渲染到浏览器 DOM，也可以渲染到真实终端 stdout；适合构建 CLI、terminal-style dashboard、日志视图、markdown transcript 和 agent console。

<ClientOnly>
  <DocsLandingTerminal />
</ClientOnly>

## 适合什么场景

- 浏览器里的 terminal UI、playground、文档 demo 和视觉验收页面
- 真实终端里的 Vue 组件式 CLI
- 需要 DOM renderer、stdout renderer 和 headless tests 共用一套 UI 逻辑的项目
- 大列表、append-only log、streaming markdown、agent transcript 这类高吞吐界面

## 安装

```bash
pnpm add @simon_he/vue-tui vue
```

Vue 是 peer dependency。当前发布包支持 Vue `>=3.3.0 <4`。

## 入口选择

| 入口                             | 稳定性       | 主要用途                                                                       |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `@simon_he/vue-tui`              | Core         | Browser-safe terminal runtime、基础组件、DOM renderer、events、router、runtime |
| `@simon_he/vue-tui/cli`          | Node/CLI     | headless app、stdin driver、stdout renderer、Node path provider、recording     |
| `@simon_he/vue-tui/markdown`     | Focused      | `TMarkdownText`、`TVirtualMarkdown`、markdown parser、block source             |
| `@simon_he/vue-tui/experimental` | Experimental | `TVirtualList`、`TLogView`、TLog companions、append-only log store             |

`/experimental` API 仍可能在下一个 stable release 前变化。生产应用建议把这些 import 隔离在少量边界文件内。

## 快速路径

| 目标         | 先读这些页面                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 了解能力边界 | [Live Showcase](/showcase)、[组件总览](/components)、[核心 API](/api)                                                                  |
| 跑示例       | [Examples Index](/examples)、[Agent Console 示例](/agent-console)                                                                      |
| 做 CLI       | [Runtime](/runtime)、[CLI Events](/cli-events)、[Platform Contracts](/platform-contracts)                                              |
| 做高吞吐 UI  | [Performance](/performance)、[高吞吐渲染](/high-throughput-rendering)、[TLogView Lab](/tlog-view-lab)                                  |
| 准备发布     | [API Maturity](/api-maturity)、[0.x Release Candidate](/release-candidate)、[TLogView Release Readiness](/tlog-view-release-readiness) |

完整 props / events 以 [组件 API（自动生成）](/generated/components-api) 为准。

## 核心模型

| 层级      | 内容                                                    |
| --------- | ------------------------------------------------------- |
| Core      | `createTerminal()`、buffer、planes、ANSI、scrollback    |
| Renderer  | DOM renderer、stdout renderer、row cache、ANSI output   |
| Vue Layer | `TerminalProvider`、布局组件、交互组件、runtime、router |
| Events    | pointer / keyboard / wheel 映射、capture/bubble、focus  |

常见组合是把 transcript、chrome、input 和 overlay 分到不同 `TRenderPlane`，让高频正文更新和低频 UI chrome 拆开 repaint。

## 示例命令

```bash
pnpm -C examples/basic dev
pnpm run run:basic:terminal
pnpm run example:tlog-view-lab
pnpm run example:agent-console
pnpm run example:agent-console:smoke
```

发布前完整验证：

```bash
pnpm run release:dry-run
```

## 反馈

- [提交 bug](https://github.com/Simon-He95/vue-tui/issues/new?template=bug_report.yml)
- [提交 feature request](https://github.com/Simon-He95/vue-tui/issues/new?template=feature_request.yml)
- [提交文档问题](https://github.com/Simon-He95/vue-tui/issues/new?template=docs.yml)
- [查看已有 issues](https://github.com/Simon-He95/vue-tui/issues)
