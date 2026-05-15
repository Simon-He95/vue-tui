export type {
  Rect,
  TerminalBaseEvent,
  TerminalDebugNode,
  TerminalEventHandlerMap,
  TerminalEventType,
  TerminalInputEvent,
  TerminalKeyboardEvent,
  TerminalNode,
  TerminalPointerEvent,
} from "./events/manager/types.js";
export type { EventManager } from "./events/manager/event-manager.js";
export { createEventManager } from "./events/manager/event-manager.js";
export type { TerminalEventRecord } from "./events/recording.js";
export type {
  ClipboardApi,
  RafApi,
  Runtime,
  RuntimeEnv,
  RuntimeOptions,
  TimerApi,
} from "./runtime/index.js";
export { createRuntime } from "./runtime/index.js";
export type {
  CreateTerminalSelectionControllerOptions,
  SelectionTextProvider,
  TerminalSelectionConfig,
  TerminalSelectionController,
  TerminalSelectionCopyPayload,
  TerminalSelectionOptions,
  TerminalSelectionPoint,
  TerminalSelectionRange,
  TerminalSelectionRefreshOptions,
  TerminalSelectionState,
} from "./selection/terminal-selection.js";
export type { SelectedRowSpan } from "./selection/terminal-selection.js";
export {
  createTerminalSelectionController,
  terminalSelectionRowSpans,
  terminalSelectionVisibleRowSpans,
} from "./selection/terminal-selection.js";
