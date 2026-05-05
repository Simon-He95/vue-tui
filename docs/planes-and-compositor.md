# Planes 与 Compositor

`@simon_he/vue-tui` 现在的终端渲染不是“所有内容共享一块 buffer 再一起重绘”，而是 **plane-scoped retained row compositor**：

- 调度按 plane 收集 invalidation
- render manager 按 plane 维护 dirty rows
- terminal 在 commit 时把各 plane 的 row buffer 合成到最终可见 buffer

这套模型的目标很直接：让 footer / loading / overlay 这类高频更新，不再把 transcript 正文一起拖进同一轮重绘。

## Plane 模型

框架公开了 4 个 plane：

- `default`
- `transcript`
- `chrome`
- `overlay`

含义约定：

- `default`：不显式分层时的默认平面
- `transcript`：正文、消息列表、长文本主体
- `chrome`：header、footer、loading、input、状态栏
- `overlay`：dialog、popover、approval、调试层

导出入口：

- `TERMINAL_RENDER_PLANES`
- `TerminalRenderPlane`
- `TerminalRenderPlanes`

## 为什么要分 plane

在长正文 streaming 的 CLI 场景里，最常见的卡顿不是“没有内容”，而是“内容已经到了，但 footer/loading 的动画和正文重绘互相阻塞”。

plane compositing 解决的是这个耦合问题：

- `chrome` 更新时，不必扫描 `transcript` 的节点
- `overlay` 打开关闭时，不必让正文参与本轮 render
- `transcript` 大量追加时，`chrome` 仍然可以保持自己的刷新节奏

它优化的是“无关区域根本不要参与渲染”，而不只是把一次全局渲染做得更快。

## 公开 API

### `createTerminal().commit({ planes })`

`Terminal.commit()` 现在支持显式提交某些 plane：

```ts
terminal.commit({ planes: ["chrome"] });
```

多数应用代码不需要直接手动传 `planes`，因为 `TerminalProvider` / `createTerminalApp()` 会自动根据本轮 invalidation 收集 active planes。

对应的 `commit` 事件也会带上：

- `dirtyRows`
- `planes`

### `scheduler.invalidate({ plane })`

调度器支持 plane-aware invalidation：

```ts
scheduler.invalidate({ plane: "overlay" });
```

如果不传，行为等价于普通 invalidation；但对高频区域，显式指定 plane 可以让框架只刷新对应平面。

### `runtime.mount(component, props, { plane })`

命令式挂载的运行时 portal 也支持指定 plane：

```ts
runtime.mount(DialogLike, { open: true }, { plane: "overlay" });
```

这让 runtime-mounted 节点也能参与同一套 plane 调度和 compositor 合成。

## `TRenderPlane`

`TRenderPlane` 是 plane model 最常用的 Vue 入口。它会为整棵子树切换到指定 plane，并把：

- `terminal`
- `scheduler.invalidate()`
- `runtime.mount()`

都自动绑定到当前 plane。

```vue
<TerminalProvider :cols="80" :rows="24">
  <TRenderPlane plane="transcript">
    <ChatMessages />
  </TRenderPlane>

  <TRenderPlane plane="chrome">
    <FooterStatus />
  </TRenderPlane>

  <TRenderPlane plane="overlay">
    <TDialog v-model="open" :w="48" :h="12" />
  </TRenderPlane>
</TerminalProvider>
```

使用建议：

- 普通组件库 demo 可以继续停留在 `default`
- 只有当你明确想把正文、状态栏、弹层解耦时，再引入 `TRenderPlane`
- `overlay` 适合所有“应该盖住下面内容”的节点
- `TRenderPlane.plane` 在 mount 后按 immutable 处理；需要移动子树时，用 `<TRenderPlane :key="activePlane" :plane="activePlane">` 重新挂载
- `ctx.invalidate({ plane: undefined })` 会跳出当前 `TRenderPlane`，在 root scheduler 中按 all-plane invalidate 处理

## 渲染顺序

最终合成顺序是：

1. `default`
2. `transcript`
3. `chrome`
4. `overlay`

高层 plane 可以覆盖低层 plane，也可以用空格显式擦除下层内容。也就是说：

- `overlay` 不只是“画在上面”，它还能真正遮住下面的文本
- `chrome` 可以只更新 footer 行，而不破坏正文其余区域

## 性能含义

这套设计带来的主要收益不是“平均 render 时间看起来更漂亮”，而是：

- `invalidates` 更少
- `render-manager` 扫描的节点更少
- `chrome` 的 commit cadence 更稳定
- stdout 单次大写出更少出现

更具体的验收口径见：

- [Performance](/performance)
- [Observability](/observability)

## 什么时候值得用

下列场景非常适合 plane compositing：

- 长文本 streaming，同时 footer 还有 loading / thinking 动画
- 正文区和底部输入框同时频繁变化
- overlay 打开关闭时，希望正文完全不参与本轮重绘
- 宿主需要把 runtime portal 和普通组件树放进同一套终端渲染体系

如果你的界面很小、更新也很少，那么继续用默认 plane 就够了，不必为了“架构完整”强行拆分。
