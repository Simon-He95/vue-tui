import type { TerminalRenderPlanes } from "./render-plane.js";
import type { WidthProvider } from "./buffer/width.js";

export type ThemeModeId = "dark" | "light";

export type AnsiColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "blackBright"
  | "redBright"
  | "greenBright"
  | "yellowBright"
  | "blueBright"
  | "magentaBright"
  | "cyanBright"
  | "whiteBright";

export type Style = Readonly<{
  /**
   * Foreground color. Accepts:
   * - `AnsiColorName` (e.g. `'cyanBright'`) — resolved via palette or standard ANSI codes
   * - Hex string (e.g. `'#a9dc76'`) — converted to truecolor/ansi256 RGB
   * - `'transparent'` — resets to terminal default (`\e[39m`)
   */
  fg?: string;
  /**
   * Background color. Same value space as `fg`.
   * `'transparent'` resets to terminal default (`\e[49m`).
   */
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  /**
   * Optional hyperlink target associated with this styled text.
   *
   * Renderer behavior:
   * - stdout renderer may emit OSC 8 hyperlinks after sanitization.
   * - DOM renderer may render <a> elements when DomRendererOptions.links is enabled.
   *
   * Unsafe protocols/control characters are ignored by renderers.
   */
  href?: string;
}>;

export type Cell = Readonly<{
  ch: string;
  width: 1 | 2;
  continuation?: true;
  style: Style;
}>;

export type BufferSnapshot = Readonly<{
  cols: number;
  rows: number;
  lines: readonly string[];
}>;

export type TerminalSize = Readonly<{
  cols: number;
  rows: number;
}>;

export type TerminalOptions = Readonly<{
  cols: number;
  rows: number;
  widthProvider?: WidthProvider;
}>;

export type TerminalScrollOperation = Readonly<{
  startY: number;
  endY: number;
  delta: number;
}>;

export type TerminalCommitEvent = Readonly<{
  dirtyRows: readonly number[] | null;
  planes: TerminalRenderPlanes | null;
  /** Renderer hint: try same-frame flush within backend budget; large DOM work may defer. */
  sync?: boolean;
  scrollOperations?: readonly TerminalScrollOperation[] | null;
}>;

export type TerminalResizeEvent = Readonly<{
  cols: number;
  rows: number;
}>;

export interface TerminalEventMap {
  commit: TerminalCommitEvent;
  resize: TerminalResizeEvent;
}

export interface Terminal {
  resize: (cols: number, rows: number) => void;
  clear: (x?: number, y?: number, w?: number, h?: number) => void;
  write: (text: string, opts?: { x?: number; y?: number; style?: Style }) => void;
  writeAnsi: (text: string, opts?: { x?: number; y?: number }) => void;
  put: (x: number, y: number, ch: string, style?: Style) => void;
  fill: (x: number, y: number, w: number, h: number, ch?: string, style?: Style) => void;
  scroll: (lines: number) => void;
  setCursor: (x: number, y: number, visible?: boolean) => void;
  batch: <T>(fn: () => T) => T;
  commit: (meta?: {
    planes?: TerminalRenderPlanes | null;
    sync?: boolean;
  }) => readonly number[] | null;
  on: <K extends keyof TerminalEventMap>(
    event: K,
    cb: (payload: TerminalEventMap[K]) => void,
  ) => () => void;
  dispose: () => void;
  size: () => TerminalSize;
  snapshot: () => BufferSnapshot;
  getCell: (x: number, y: number) => Cell;
  getRow: (y: number) => readonly Cell[];
  setScrollbackLimit: (limit: number) => void;
  getScrollbackLines: (count?: number) => readonly string[];
  /** Register fingerprint function for SoA pre-computation on the composite buffer. */
  setFingerprintFn: (fn: ((ch: string, style: Style) => number) | null) => void;
  /** Get pre-computed fingerprints for a composite buffer row (null if not enabled). */
  getRowFingerprints: (y: number) => Uint32Array | null;
}
