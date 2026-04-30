---
title: Vue TUI
---

<script setup lang="ts">
import DocsLandingTerminal from './.vitepress/components/DocsLandingTerminal.vue'
</script>

# Vue TUI

用 Vue 3 组件语法开发终端 UI，同时保留两套渲染落点：

- 浏览器里的 `DOM renderer`，适合文档站、playground、视觉验收
- 真实终端里的 `stdout renderer`，适合 CLI、snapshot replay、record/replay parity

<ClientOnly>
  <DocsLandingTerminal />
</ClientOnly>

## 这个站点现在解决什么问题

- 直接在网站里渲染真实的 TUI 组件，而不是另外做一层“静态截图式官网”
- 把组件清单、参数、用法、自动生成 API 和 live demo 放到同一个入口
- 把 `GoatChain` / `dimcode` 参考实现和框架能力拆开来看，避免误把 reference app 当成框架边界

## 快速入口

- [Live Showcase](/showcase)
- [组件总览](/components)
- [组件 API（自动生成）](/generated/components-api)
- [核心 API](/api)
- [Planes 与 Compositor](/planes-and-compositor)
- [扩展性与插件化](/extensibility)

## 架构速览

| 层级      | 主要内容                                                | 是否通用 |
| --------- | ------------------------------------------------------- | -------- |
| Core      | `createTerminal()`、buffer、ANSI、scrollback            | 高       |
| Renderer  | DOM renderer / stdout renderer                          | 高       |
| Vue Layer | `TerminalProvider`、布局组件、交互组件、router、runtime | 高       |

## 推荐阅读顺序

1. 先看 [Live Showcase](/showcase)，确认这套组件在网页里如何真实渲染。
2. 再看 [组件总览](/components) 和 [组件 API（自动生成）](/generated/components-api)，查 props / events / usage。
3. 如果你关心 CLI 级性能和分层渲染，接着看 [Planes 与 Compositor](/planes-and-compositor)。
4. 最后看 [扩展性与插件化](/extensibility)，判断哪些能力已经能注入，哪些还值得继续抽象。
