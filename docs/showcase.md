<script setup lang="ts">
import DocsShowcaseTerminal from './.vitepress/components/DocsShowcaseTerminal.vue'
</script>

# Live Showcase

这页不是 mock 图，而是直接在文档站里挂载 `TerminalProvider` 和真实组件树。换句话说，网站本身就是框架的一个宿主环境。

<ClientOnly>
  <DocsShowcaseTerminal />
</ClientOnly>

## 这页覆盖了什么

- `Layout + copy`
  重点看 `TBox`、`TFlow`、`TText` 这类基础构件如何组织复杂屏幕。
- `Forms + editing`
  重点看 `TInput`、`TInputBox`、`TSelect`、`TList`、`TJsonEditor` 这类交互组件。
- `Overlay + focus`
  重点看 `TDialog`、`TTransition` 这类需要 runtime / focus / layering 支撑的组件。
- `Agent console`
  真实复合场景在 [Agent Console 示例](/agent-console) 中覆盖 streaming transcript、输入响应、搜索、链接和 overlay plane。

## 组件导航

| 类别       | 组件                                            | 常见用途                                |
| ---------- | ----------------------------------------------- | --------------------------------------- |
| Root       | `TerminalProvider`                              | 创建终端上下文、renderer、event manager |
| Layout     | `TBox` `TView` `TAnchor` `TFlow` `TRenderLayer` | 结构、裁剪、层级、布局                  |
| Text       | `TText` `TTransition`                           | 内容呈现、状态切换、动画插值            |
| Input      | `TInput` `TInputBox` `TJsonEditor`              | prompt、表单、结构化文本                |
| Picker     | `TList` `TSelect` `TPathPicker`                 | palette、列表、路径选择                 |
| Overlay    | `TDialog` `TMultilineModal` `TDebugOverlay`     | modal、详情查看、调试辅助               |
| Navigation | `TRouterView` + `createTerminalRouter()`        | 多页面 TUI、shell 导航                  |

## 为什么比“单独做一个官网”更合适

- 文档站、浏览器 demo、终端运行时共享同一套组件协议，减少二次实现
- 可以直接拿这页做视觉回归和组件验收，而不是维护一组额外的 marketing mock
- 当组件契约变化时，网站会第一时间暴露问题，天然成为一个真实宿主

## 继续看哪里

- 参数和事件请看 [组件 API（自动生成）](/generated/components-api)
- 组件分层、适用场景和限制请看 [组件总览](/components)
- Agent / chat / log console 场景请看 [Agent Console 示例](/agent-console)
- 是否适合脱离当前 CLI 继续扩展，请看 [扩展性与插件化](/extensibility)
