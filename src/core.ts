export { ansiStyles } from "./ansi-styles.js";
export {
  ANSI8_COLORS,
  ANSI16_COLORS,
  ANSI256_COLORS,
  ansiColors,
  rgbToAnsi256,
  SGR_RESET,
  type TerminalColorLevel,
  type TerminalColorMode,
  truecolorBgOpen,
  truecolorFgOpen,
} from "./ansi-styles.js";
export {
  detectTerminalColorCapability,
  type TerminalColorCapability,
} from "./core/ansi/capability.js";
export type { ThemePalette } from "./core/ansi-palette.js";
export { parseAnsiSgr } from "./core/ansi/sgr.js";
export { charCellWidth } from "./core/buffer/width.js";
export type { BuiltinWidthProvider, CellWidth, WidthProvider } from "./core/buffer/width.js";
export {
  isSafeRelativeHref,
  sanitizeDomHref,
  sanitizeTerminalHref,
  type SanitizeDomHrefOptions,
  type SanitizeTerminalHrefOptions,
} from "./core/hyperlink.js";
export {
  TERMINAL_RENDER_PLANES,
  type TerminalRenderPlane,
  type TerminalRenderPlanes,
} from "./core/render-plane.js";
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
} from "./core/index.js";
export { createTerminal } from "./core/index.js";
export type {
  FsDirEntry,
  FsEntryKind,
  FsStat,
  PathPickerProvider,
} from "./core/path-provider-types.js";
export {
  type PathPickMode,
  type PathSuggestion,
  parsePathQuery,
  resolveUserPath,
  suggestParentHint,
  suggestPaths,
  type SuggestPathsResult,
} from "./core/path-suggest.js";
export { normalizeNewlines } from "./utils/newlines.js";
