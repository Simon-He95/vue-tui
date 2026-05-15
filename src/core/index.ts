export {
  TERMINAL_RENDER_PLANES,
  type TerminalRenderPlane,
  type TerminalRenderPlanes,
} from "./render-plane.js";
export { createTerminal } from "./terminal/create-terminal.js";

export type {
  AnsiColorName,
  BufferSnapshot,
  Cell,
  Style,
  Terminal,
  TerminalCommitEvent,
  TerminalEventMap,
  TerminalOptions,
  TerminalResizeEvent,
  TerminalScrollOperation,
  ThemeModeId,
} from "./types.js";
export type { BuiltinWidthProvider, CellWidth, WidthProvider } from "./buffer/width.js";
