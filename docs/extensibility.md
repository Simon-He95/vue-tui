<script setup lang="ts">
import DocsExtensibilityTerminal from './.vitepress/components/DocsExtensibilityTerminal.vue'
</script>

# 扩展性与插件化

这页重点回答两个问题：

1. 当前这套组件是不是已经能脱离具体宿主 CLI 单独成立？
2. 哪些能力应该继续做成插件或适配器，而不是写死在组件层？

<ClientOnly>
  <DocsExtensibilityTerminal />
</ClientOnly>

## 结论先说

- `packages/tui/src/core/*`、`renderer/*`、大部分 `src/vue/components/*` 已经是通用能力，不是 CLI 私货。
- 当前最明显的“可继续插件化”区域不是基础布局，而是输入增强、消息渲染、宿主动作和数据提供者。

## 组件适配性评估

| 分组           | 组件/模块                                                      | 适配更多场景的能力 | 当前耦合点                                        |
| -------------- | -------------------------------------------------------------- | ------------------ | ------------------------------------------------- |
| Foundation     | `TerminalProvider` `TText` `TBox` `TView` `TAnchor` `TFlow`    | 很高               | 几乎无业务耦合                                    |
| Interaction    | `TInput` `TInputBox` `TList` `TSelect` `TDialog` `TTransition` | 高                 | 只有少量默认行为偏 chat/CLI                       |
| Advanced       | `TJsonEditor` `TRouterView` `TRenderLayer`                     | 高                 | 更像通用上层能力                                  |
| Adapter-shaped | `TPathPicker`                                                  | 高                 | 路径语义已经能外置到 provider，剩下是宿主接入选择 |

## 已经存在的注入点

### 输入侧

- `TInput.plugins`
  已经支持自定义插件注入，适合做 mention、slash command、文本过滤、快捷键拦截、chip 样式等。
- `TerminalProvider.inputPlugins` / `createTerminalApp({ inputPlugins })`
  宿主现在可以把 `TInput` 的平台能力作为 plugin 注入，而不是让组件自己静态依赖某个运行时。
- `createPromptMentionPlugin()`
  说明“补全弹层”已经不是组件硬编码，而是插件化扩展。
- `createPromptMentionPlugin({ mentionPathProvider })`
  `@路径` 这类补全能力也开始走 provider 注入，而不是继续留在默认输入实现里。
- `createTextRestrictionPlugin()`
  说明“输入校验/替换规则”也已经能作为独立注入层。

### 数据提供侧

- `TPathPicker.provider`
  路径选择器并没有强制绑定本地文件系统；现在既可以局部传入 provider，也可以由宿主统一注入。后续完全可以接对象存储、远程 workspace、项目索引服务。

### 宿主应用侧

- `createTerminalApp(...).app.use(...)`
  可以在 headless/CLI 宿主里安装 Pinia 或其他 Vue 插件。

## 更值得继续插件化的地方

### 1. 消息渲染器注册表

宿主应用里的 chat message renderer 更像产品层的消息 DSL。如果要适配 IDE、监控面板、workflow console 等多种宿主，建议把 `assistant part renderer` 提升为注册表：

- `markdown`
- `tool_call`
- `tool_result`
- `approve`
- `todo`
- 自定义业务块

这样可以让不同产品替换 message part，而不必 fork 整个 chat 页面。

### 2. Suggestion / command providers

现在输入增强已经有插件机制，但 suggestion 数据源还可以再抽一层 provider：

- slash commands provider
- mention provider
- workspace/entity provider
- remote search provider

这样 `TInput` 负责交互壳，实际候选来源由宿主注入。

### 3. Tool / approval / session action adapters

这些动作属于产品层，不属于基础 UI 层。更好的边界是：

- UI 组件只关心“展示一个需要确认的动作”
- 宿主适配器负责“如何执行工具、如何审批、如何持久化 session”

### 4. Theme packs

现在 ANSI style 已经是统一协议，下一步可以把消息类型色板、dialog/button preset、状态文案做成 theme pack，而不是散落在宿主应用里。

## 当前进展与残余风险

这轮改造之后，`TInput` 已经先往“组件更纯、宿主能力由插件注入”的方向走了一步：

- `TInput.ts` 本体不再直接静态 import `node:path` / `node:url` / `node:process` / `node:child_process`
- terminal clipboard、TTY 判定、copy toast、路径 href 这些宿主行为已经被收进 host plugin
- runtime / app 层可以通过显式 `ClipboardApi` 或 `createOsc52ClipboardProvider()` 接入 clipboard；terminal runtime 默认仍不启用 clipboard
- browser 默认 host plugin 不携带 Node 能力；CLI 默认 host plugin 保留底层宿主能力；像 copy toast 这种 UI 反馈需要由宿主显式通过 `createTInputHostPlugin({ showToast })` 注入
- prompt mention 的路径补全/路径类型识别也已经可以通过 `mentionPathProvider` 注入；Node 宿主可显式接入 `createNodeMentionPathProvider()`
- `TPathPicker` 也不再在组件本体里兜底 Node provider；宿主可以通过 `TerminalProvider.pathPickerProvider`、`createTerminalApp({ pathPickerProvider })` 或局部 `provider` 显式接入
- 宿主可以通过 `TerminalProvider.inputPlugins`、`createTerminalApp({ inputPlugins })` 或局部 `TInput.plugins` 自定义接入

但这件事还没有完全收口，残余风险主要转移到了两个地方：

- CLI 默认 host plugin 里的 terminal clipboard 读取仍然会在 Node 宿主里动态触达 `node:child_process`
- 如果宿主希望保留“复制成功/失败”这类 UI 反馈，需要显式提供 `showToast`，默认实现不会再偷读全局 hook
- Node/gitignore 语义现在主要收口在宿主侧的 Node provider，而不是组件本体；如果 browser/docs 宿主也想要真实路径选择，仍需要显式注入自己的 provider

### 更合适的下一步

如果目标是把这套输入能力真正打磨成可复用在更多宿主的平台接口，下一步更值得继续推进的是：

- 继续把剩余的 path/file-system 语义往 provider/plugin 下沉，而不是让组件默认实现继续背宿主差异
- 继续梳理 path provider 的宿主变体（browser mock、remote workspace、project index）
- 让 docs/browser 宿主显式提供 browser/no-op host plugin，而不是继续依赖 bundler shim 兜底
- 把宿主动作沿着同样思路抽成 adapter/plugin，而不是往基础组件回灌业务 props

## 推荐的分层方式

| 层级                | 应该放什么                                                   | 不应该放什么                 |
| ------------------- | ------------------------------------------------------------ | ---------------------------- |
| Core / Renderer     | buffer、scroll、ANSI、renderer parity                        | 业务状态、tool 审批语义      |
| Vue Components      | layout、input、overlay、focus、router                        | 特定产品的消息模型           |
| Plugins / Providers | suggestions、validation、path data source、message renderers | 与 renderer 强耦合的底层逻辑 |
| Host App            | tool runner、agent bridge、session store、theme pack         | 重新实现基础组件             |

## 一个最小的自定义插件写法

```ts
import type { TInputPlugin } from "@simon_he/vue-tui";

export const routePlugin: TInputPlugin = {
  name: "route-normalizer",
  install(ctx) {
    ctx.registerTextFilter(({ text }) =>
      text
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9/_-]+/g, "")
        .toLowerCase(),
    );
  },
};
```

然后直接传给 `TInput`：

```vue
<TInput v-model="route" :plugins="[routePlugin]" />
```

## 对当前仓库的建议

1. 保持 `packages/tui` 继续做通用框架和 docs/live demo 基座。
2. 宿主应用里的 message renderer、theme pack、action adapters 应沿着 plugin/provider 边界逐步抽离，而不是塞回基础组件。
3. 对外优先暴露“插件接口”和“provider 接口”，而不是继续向基础组件里塞业务 props。
