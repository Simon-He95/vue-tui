# CLI Event Encoding

为了支持“录制 → 回放 → 复现交互”，CLI 使用与 `EventManager` 对齐的事件 JSON 编码（`TerminalEventRecord`）。

## 格式

事件文件是 **JSON Lines**：每行一个事件对象。

字段（按事件类型）：

- 键盘：`type: "keydown" | "keyup"`
  - `key`（必填）, `code`（可选）
  - `ctrlKey/shiftKey/altKey/metaKey`（可选）
  - `repeat`（可选）
- 指针：`type: "pointerdown" | "pointerup" | "pointermove" | "click" | "dblclick" | "contextmenu"`
  - `cellX/cellY`（必填，0-based cell 坐标）
  - `button/buttons`（可选）
  - `ctrlKey/shiftKey/altKey/metaKey`（可选）
- 滚轮：`type: "wheel"`
  - `cellX/cellY`（必填）
  - `deltaY`（必填，正=向下滚，负=向上滚）
- 文本/IME：`type: "beforeinput" | "input" | "compositionstart" | "compositionupdate" | "compositionend" | "paste"`
  - `data/inputType/isComposing/text`（可选）

通用：

- `time`（可选，ms，相对录制起点）

## 浏览器录制

- `createEventManager(container, metrics, { record })`：通过 `record(e)` 回调拿到 `TerminalEventRecord`
- `<TerminalProvider :record-events="record" />`：对内置 DOM EventManager 开启录制

## 与 `EventManager` 对齐点

- `cellX/cellY` 与浏览器模式 `TerminalPointerEvent` 一致（命中/冒泡/捕获语义一致）
- 键盘组合键字符串由 `meta/ctrl/alt/shift + key` 组合（参见 `TerminalKeyboardEvent.combo`）
