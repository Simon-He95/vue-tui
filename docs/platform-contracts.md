# Platform Contracts

这页把 browser DOM、stdout terminal 和 headless renderer 的边界写成可发布的 contract。目标是让组件只依赖公开能力，而不是猜测当前 renderer 的内部实现。

## Browser Accessibility

DOM renderer 会把 terminal container 当成一个 focusable terminal surface：

- 默认 `tabIndex=0`
- 默认 `role="application"`
- 默认 `aria-label="Terminal"`
- 默认 `aria-live="off"`
- 保留 native text selection；交互节点可由 event manager 暂时禁止 selection

宿主可以通过 `createDomRenderer(terminal, container, { accessibility })` 或 `TerminalProvider.domRendererOptions.accessibility` 覆盖这层 contract：

```ts
createDomRenderer(terminal, container, {
  accessibility: {
    role: "region",
    label: "Build output",
    describedBy: "build-output-help",
    live: "polite",
  },
});
```

可选角色：

| role          | 使用场景                                                                      |
| ------------- | ----------------------------------------------------------------------------- |
| `application` | 默认 terminal-like 应用区域，需要组件处理 keyboard/pointer                    |
| `region`      | 只读或弱交互 output panel，由页面外层提供主要 keyboard flow                   |
| `textbox`     | 文本输入/日志阅读器语义更强的宿主；默认补 `aria-multiline` 和 `aria-readonly` |

如果宿主已经有自己的 accessible wrapper，可以传 `accessibility: false`，renderer 不再写 ARIA 属性。

当前 ARIA contract 不承诺把每个 terminal cell 映射成 DOM grid。DOM renderer 的 DOM rows 是 renderer implementation detail；屏幕阅读器 contract 是 container 级语义、focusability、label/live-region 选择，以及应用层提供的 keyboard flow。

## Renderer Capabilities

组件通过 `RendererCapabilities` 判断 renderer 能力：

```ts
type RendererCapabilities = Readonly<{
  syncFlush: boolean;
  scrollOperations: boolean;
  domRows: boolean;
}>;
```

| capability         | 含义                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| `syncFlush`        | renderer 可以在 `commit({ sync: true })` 请求下做同调用栈 flush；仍可受预算限制   |
| `scrollOperations` | renderer 可以消费 terminal `scrollOperations` hint；不支持时必须 repaint fallback |
| `domRows`          | renderer 暴露真实 DOM row nodes；只有 browser DOM renderer 为 `true`              |

当前常量：

| Renderer | Constant                         | syncFlush | scrollOperations | domRows |
| -------- | -------------------------------- | --------- | ---------------- | ------- |
| DOM      | `DOM_RENDERER_CAPABILITIES`      | true      | true             | true    |
| Stdout   | `STDOUT_RENDERER_CAPABILITIES`   | true      | true             | false   |
| Headless | `HEADLESS_RENDERER_CAPABILITIES` | false     | true             | false   |

组件规则：

- 需要 DOM node 的行为必须检查 `domRows`，不能从 renderer 类型或环境变量推断。
- row-scroll 优化必须检查 `scrollOperations`，失败时 repaint affected rows 或 viewport。
- `syncFlush` 是 request capability，不是强制同步保证；DOM renderer 仍会按 `syncFlushMaxRows` / `syncFlushCellBudget` defer。
- 新 renderer 必须声明 capability 常量，并让 renderer instance 暴露同一份 `capabilities`。

## Terminal Permissions

terminal 环境没有浏览器权限弹窗，所以所有外部副作用都走显式 opt-in：

| 能力                     | 默认行为                                                          | Opt-in 边界                                                                    |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Clipboard write/read     | terminal runtime 默认 unsupported                                 | `createRuntime("terminal", { clipboard })`、`createTerminalApp({ clipboard })` |
| OSC52 clipboard          | 不自动启用                                                        | `createOsc52ClipboardProvider()` 显式传入                                      |
| Node path lookup         | root/browser entrypoint 不绑定 Node provider                      | `/cli` 的 `createNodePathPickerProvider()`、`createNodeMentionPathProvider()`  |
| File URL detection       | TLog URL detector 默认不识别 `file://`                            | `allowFileUrls: true`                                                          |
| OSC8 / external href     | 只允许 safe `http:` / `https:` / `mailto:`，file URL 需显式 allow | `sanitizeTerminalHref()` 和 retained-index sanitizer                           |
| Link activation          | 组件只 emit / dispatch action，不直接 open external URL           | 宿主 `useTLogLinkController` / plugin action handler                           |
| ANSI synchronized output | stdout renderer 默认保守关闭                                      | `createStdoutRenderer({ useSyncOutput: true })`                                |

新增 terminal 能力时按这个规则落地：

1. capability detection 可以自动做，但副作用必须默认关闭或无害。
2. 会读写系统资源、启动进程、打开 URL、写 clipboard 的能力必须有显式 provider/options。
3. public docs 要说明默认值、opt-in 入口和失败语义。
4. release smoke 至少覆盖默认无副作用路径；高风险 opt-in 只用 fake provider 测试。
