import type {
  AnsiColorName,
  Cell,
  Style,
  Terminal,
  TerminalScrollOperation,
} from "../../core/types.js";
import type { RendererCapabilities } from "../capabilities.js";
import { Buffer } from "node:buffer";
import { writeSync as fsWriteSync } from "node:fs";
import process from "node:process";
import {
  defaultVueTuiProfileLogPath,
  installNodeFileWriters,
  nodeProfilerFileWriter,
  shouldInstallFileWriters,
} from "../../cli/node-file-writers.js";
import type { ThemePalette } from "../../core/ansi-palette.js";
import { ansiColorRgb, ansiHexToRgb, isAnsiColorName } from "../../core/ansi-palette.js";
import { detectTerminalColorCapability } from "../../core/ansi/capability.js";
import {
  ansi8BgOpen,
  ansi8FgOpen,
  ansi16BgOpen,
  ansi16FgOpen,
  ansi256BgOpen,
  ansi256FgOpen,
  rgbToAnsi16,
  rgbToAnsi256,
  SGR_BOLD,
  SGR_DIM,
  SGR_INVERSE,
  SGR_ITALIC,
  SGR_RESET,
  SGR_UNDERLINE,
  truecolorBgOpen,
  truecolorFgOpen,
} from "../../core/ansi/colors.js";
import { createDebugLogger, isDebugEnabled } from "../../core/debug-logger.js";
import { sanitizeTerminalHref } from "../../core/hyperlink.js";
import { getPlaneRowCoverageKind } from "../../core/terminal/create-terminal.js";
import { getCliLatencyProfiler } from "../../observability/cli-latency-node.js";
import { createTuiProfiler } from "../../observability/tui-profiler.js";
import { firstNonEmptyEnv } from "../../utils/env.js";
import { STDOUT_RENDERER_CAPABILITIES } from "../capabilities.js";
import { recordStdoutFrame } from "./stdout-metrics.js";

// Global debug logger instance (lazy init)
let debugLog: ReturnType<typeof createDebugLogger> | null = null;
function getDebugLog() {
  if (!debugLog) {
    debugLog = createDebugLogger(isDebugEnabled());
  }
  return debugLog;
}

function writeFdSync(fd: number, data: string): void {
  fsWriteSync(fd, Buffer.from(data, "utf8"));
}

// Synchronized output control sequences (DEC Private Mode 2026)
// Prevents terminal from refreshing screen until all output is received
const SYNC_START = "\u001B[?2026h";
const SYNC_END = "\u001B[?2026l";

// Terminal hyperlinks (OSC 8). Terminals that don't support this will ignore it.
const OSC8_OPEN = (href: string) => `\u001B]8;;${href}\u0007`;
const OSC8_CLOSE = "\u001B]8;;\u0007";

export type CliOutput = Readonly<{
  write: (chunk: string) => unknown;
  isTTY?: boolean;
}>;

export type StdoutRenderer = Readonly<{
  capabilities: RendererCapabilities;
  render: () => void;
  dispose: () => void;
  /** Move terminal cursor to specified cell position for IME input */
  setCursor: (x: number, y: number) => void;
  /** Show or hide the terminal cursor */
  showCursor: (visible: boolean) => void;
  /** Update default background without recreating the renderer. */
  updateTheme?: (
    next: Readonly<{
      defaultBg?: string | null;
      palette?: ThemePalette | null;
    }>,
  ) => void;
}>;

export type StdoutColorMode = "auto" | "truecolor" | "ansi256" | "ansi16" | "ansi8";
export type { ThemePalette } from "../../core/ansi-palette.js";

export function createStdoutRenderer(
  terminal: Terminal,
  options?: Readonly<{
    output?: CliOutput;
    clear?: boolean;
    hideCursor?: boolean;
    altScreen?: boolean;
    /** Fallback background color when a cell has no explicit bg. `null` = transparent (terminal default). */
    defaultBg?: string | null;
    /** Optional ANSI-name palette used when emitting ansi256/truecolor sequences. */
    palette?: ThemePalette | null;
    /** Track TTY resize events (process.stdout 'resize') and call terminal.resize(). */
    trackResize?: boolean;
    /** Color mode for ANSI output (auto detects truecolor via env). */
    colorMode?: StdoutColorMode;
    /** Optional function to get IME cursor position, included in render output for atomic write */
    getImeAnchor?: () => { cellX: number; cellY: number } | null;
    /** Use DEC 2026 synchronized output mode (default: false for compatibility) */
    useSyncOutput?: boolean;
    allowFileUrls?: boolean;
    profileFileWriter?: { appendFileSync?: (path: string, data: string) => void };
  }>,
): StdoutRenderer {
  const env = (process?.env ?? {}) as Record<string, unknown>;
  if (shouldInstallFileWriters(env)) installNodeFileWriters();

  const output: CliOutput | undefined = options?.output ?? (process.stdout as any);
  if (!output) throw new Error("createStdoutRenderer requires a Node stdout-like output");
  const out = output;
  const clear = options?.clear ?? true;
  const hideCursor = options?.hideCursor ?? true;
  const altScreen = options?.altScreen ?? Boolean(out.isTTY);
  let defaultBg: string | undefined =
    options?.defaultBg == null || options?.defaultBg === "transparent"
      ? undefined
      : (options?.defaultBg ?? "black");
  let palette: ThemePalette | null = options?.palette ?? null;
  const trackResize = options?.trackResize ?? true;
  const getImeAnchor = options?.getImeAnchor;
  const allowFileUrls = options?.allowFileUrls ?? false;
  const cliLatency = getCliLatencyProfiler();
  const profiler = createTuiProfiler("stdout-renderer", {
    fileWriter: options?.profileFileWriter ?? nodeProfilerFileWriter,
    defaultLogDest: "file",
    defaultLogPath: defaultVueTuiProfileLogPath(),
  });

  // Resolve whether to use synchronized output mode (DEC 2026)
  // Disabled by default for terminal compatibility (ghostty, etc.)
  function resolveUseSyncOutput(): boolean {
    // Explicit option takes precedence
    if (options?.useSyncOutput != null) return options.useSyncOutput;

    // Detect terminal type and disable for known incompatible terminals
    const term = String(env.TERM ?? "").toLowerCase();
    const termProgram = String(env.TERM_PROGRAM ?? "").toLowerCase();
    const termProgramVersion = env.TERM_PROGRAM_VERSION;

    // Ghostty detection: GHOSTTY_RESOURCES_DIR is always set in ghostty
    const isGhostty = "GHOSTTY_RESOURCES_DIR" in env;

    // Other known problematic terminals
    const isProblematicTerminal =
      isGhostty ||
      termProgram.includes("apple_terminal") ||
      (term.includes("screen") && !term.includes("tmux"));

    if (isProblematicTerminal) {
      return false;
    }

    // Known good terminals that support DEC 2026
    const isGoodTerminal =
      termProgram.includes("iterm") &&
      termProgramVersion &&
      // iTerm2 3.5+ supports DEC 2026
      compareVersion(String(termProgramVersion), "3.5.0") >= 0;

    if (isGoodTerminal) {
      return true;
    }

    // Disable by default for compatibility with terminals like ghostty
    return false;
  }

  /**
   * Compare two version strings (e.g., "3.5.0" vs "3.4.0")
   * Returns: > 0 if a > b, < 0 if a < b, 0 if equal
   */
  function compareVersion(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);
    const maxLen = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLen; i++) {
      const numA = partsA[i] ?? 0;
      const numB = partsB[i] ?? 0;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  }

  const useSyncOutput = resolveUseSyncOutput();

  // Detect if running in ghostty for special handling
  const isGhostty = "GHOSTTY_RESOURCES_DIR" in (process?.env ?? {});

  const chunkSize = 8 * 1024;
  const chunkThresholdBytes = 64 * 1024;
  const syncMaxBytes = 128 * 1024;
  const dirtyFullThreshold = 0.6;

  const disableCursorPos = false;
  const termProgram = String(env.TERM_PROGRAM ?? "")
    .trim()
    .toLowerCase();
  const isVscodeTerminal =
    termProgram === "vscode" || "VSCODE_PID" in env || "VSCODE_IPC_HOOK_CLI" in env;
  const enableOsc8Links = out.isTTY !== false && !isVscodeTerminal;

  let disposed = false;
  let lastFrameTime = 0;
  let pendingRender = false;
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let writeEmaMs = 0;
  let lastCursorX: number | null = null;
  let lastCursorY: number | null = null;
  // Accumulated dirty rows while waiting for next frame.
  // Use a bitset to avoid per-frame Set allocations and Array.from().
  let accumulatedAllRows = false;
  let accumulatedDirtyBits: Uint8Array | null = null;
  let accumulatedDirtyCount = 0;
  let accumulatedDirtyMin = Number.POSITIVE_INFINITY;
  let accumulatedDirtyMax = -1;
  let accumulatedScrollOperations: TerminalScrollOperation[] | null = null;
  // Minimum frame interval for stdout rendering (16ms = ~60fps max).
  // For non-TTY outputs (tests/logs), render immediately for determinism.
  const MIN_FRAME_MS = !out.isTTY ? 0 : 16;

  function clampCellToViewport(
    cell: Readonly<{ cellX: number; cellY: number }>,
    size: Readonly<{ cols: number; rows: number }>,
  ): { x: number; y: number } {
    const maxX = Math.max(0, Math.floor(size.cols) - 1);
    const maxY = Math.max(0, Math.floor(size.rows) - 1);
    const x0 = Math.floor(cell.cellX);
    const y0 = Math.floor(cell.cellY);
    const x = Math.min(maxX, Math.max(0, x0));
    const y = Math.min(maxY, Math.max(0, y0));
    return { x, y };
  }

  function resolveColorMode(): Exclude<StdoutColorMode, "auto"> {
    const opt = options?.colorMode ?? "auto";
    if (opt !== "auto") return opt;
    const env = (process?.env ?? {}) as Record<string, unknown>;
    return detectTerminalColorCapability({
      env,
      isTTY: Boolean(out.isTTY),
      platform: String((process as any)?.platform ?? ""),
    }).mode;
  }

  const colorMode = resolveColorMode();
  const enableDim = colorMode === "truecolor";

  // Numeric style key encoding (22 bits):
  // Bits 0-7: fg color index (0=none, 1-16=AnsiColorName, 17+=dynamic hex)
  // Bits 8-15: bg color index
  // Bit 16: bold, Bit 17: dim, Bit 18: italic, Bit 19: underline, Bit 20: inverse, Bit 21: hasHref
  // 8 bits per color → max 255 distinct colors. Fingerprint = (styleKey << 10) | charHash10.
  const COLOR_INDEX: Record<string, number> = {
    black: 1,
    red: 2,
    green: 3,
    yellow: 4,
    blue: 5,
    magenta: 6,
    cyan: 7,
    white: 8,
    blackBright: 9,
    redBright: 10,
    greenBright: 11,
    yellowBright: 12,
    blueBright: 13,
    magentaBright: 14,
    cyanBright: 15,
    whiteBright: 16,
  };
  const BUILTIN_COLOR_INDEX: Record<string, number> = { ...COLOR_INDEX };
  let nextColorIdx = 17;
  const MAX_COLOR_INDEX = 255; // 8-bit limit
  function colorIndex(color: string | undefined): number {
    if (!color) return 0;
    let idx = COLOR_INDEX[color];
    if (idx !== undefined) return idx;
    if (nextColorIdx > MAX_COLOR_INDEX) return MAX_COLOR_INDEX; // saturate to avoid overflow
    idx = nextColorIdx++;
    COLOR_INDEX[color] = idx;
    return idx;
  }

  let styleKeyCache = new WeakMap<Style, number>();
  const normalizedHrefCache = new Map<string, string | null>();
  const MAX_HREF_CACHE = 2048;
  const HREF_STYLE_FLAG = 1 << 21;
  function styleKey(style: Style): number {
    const cached = styleKeyCache.get(style);
    if (cached !== undefined) return cached;
    const href = normalizeHref(style.href);
    const key =
      colorIndex(style.fg) |
      (colorIndex(style.bg ?? defaultBg) << 8) |
      (style.bold ? 1 << 16 : 0) |
      (enableDim && style.dim ? 1 << 17 : 0) |
      (style.italic ? 1 << 18 : 0) |
      (style.underline ? 1 << 19 : 0) |
      (style.inverse ? 1 << 20 : 0) |
      (href ? HREF_STYLE_FLAG : 0);
    styleKeyCache.set(style, key);
    return key;
  }

  function styleKeyFromParts(
    style: Readonly<{
      fg?: string;
      bg?: string;
      bold?: boolean;
      dim?: boolean;
      italic?: boolean;
      underline?: boolean;
      inverse?: boolean;
      href?: string;
    }>,
  ): number {
    return (
      colorIndex(style.fg) |
      (colorIndex(style.bg ?? defaultBg) << 8) |
      (style.bold ? 1 << 16 : 0) |
      (enableDim && style.dim ? 1 << 17 : 0) |
      (style.italic ? 1 << 18 : 0) |
      (style.underline ? 1 << 19 : 0) |
      (style.inverse ? 1 << 20 : 0) |
      (normalizeHref(style.href) ? HREF_STYLE_FLAG : 0)
    );
  }

  function normalizeHref(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const cached = normalizedHrefCache.get(value);
    if (cached !== undefined) return cached;

    const normalized = sanitizeTerminalHref(value, { allowFileUrls });
    normalizedHrefCache.set(value, normalized);

    if (normalizedHrefCache.size > MAX_HREF_CACHE) {
      const oldest = normalizedHrefCache.keys().next().value;
      if (oldest != null) normalizedHrefCache.delete(oldest);
    }

    return normalized;
  }

  function resolveAnsiColorRgb(name: string) {
    return ansiColorRgb(name, palette);
  }

  function openColor(fg?: string): string {
    if (!fg) return "";
    // 'transparent' → reset to terminal default foreground
    if (fg === "transparent") return "\x1B[39m";
    // Hex color → direct RGB conversion (bypasses palette)
    if (fg.startsWith("#")) {
      const rgb = ansiHexToRgb(fg);
      if (!rgb) return "";
      if (colorMode === "ansi8") return ansi8FgOpen(rgbToAnsi16(rgb));
      if (colorMode === "ansi16") return ansi16FgOpen(rgbToAnsi16(rgb));
      if (colorMode === "ansi256") return ansi256FgOpen(rgbToAnsi256(rgb));
      return truecolorFgOpen(rgb);
    }
    // AnsiColorName path (fallback layer + legacy themes)
    if (!isAnsiColorName(fg)) return "";
    if (colorMode === "ansi8") return ansi8FgOpen(fg as AnsiColorName);
    if (colorMode === "ansi16") return ansi16FgOpen(fg as AnsiColorName);
    const rgb = resolveAnsiColorRgb(fg);
    if (!rgb) return "";
    if (colorMode === "ansi256") return ansi256FgOpen(rgbToAnsi256(rgb));
    return truecolorFgOpen(rgb);
  }

  function openBg(bg?: string): string {
    if (!bg) return defaultBg == null ? "\x1B[49m" : "";
    // 'transparent' → reset to terminal default background
    if (bg === "transparent") return "\x1B[49m";
    // Hex color → direct RGB conversion
    if (bg.startsWith("#")) {
      const rgb = ansiHexToRgb(bg);
      if (!rgb) return "";
      if (colorMode === "ansi8") return ansi8BgOpen(rgbToAnsi16(rgb));
      if (colorMode === "ansi16") return ansi16BgOpen(rgbToAnsi16(rgb));
      if (colorMode === "ansi256") return ansi256BgOpen(rgbToAnsi256(rgb));
      return truecolorBgOpen(rgb);
    }
    // AnsiColorName path (fallback layer + legacy themes)
    if (!isAnsiColorName(bg)) return "";
    if (colorMode === "ansi8") return ansi8BgOpen(bg as AnsiColorName);
    if (colorMode === "ansi16") return ansi16BgOpen(bg as AnsiColorName);
    const rgb = resolveAnsiColorRgb(bg);
    if (!rgb) return "";
    if (colorMode === "ansi256") return ansi256BgOpen(rgbToAnsi256(rgb));
    return truecolorBgOpen(rgb);
  }

  function openStyle(style: Style): string {
    let result = "";
    result += openColor(style.fg);
    result += openBg(style.bg ?? defaultBg);
    if (style.bold) result += SGR_BOLD;
    if (enableDim && style.dim) result += SGR_DIM;
    if (style.italic) result += SGR_ITALIC;
    if (style.underline) result += SGR_UNDERLINE;
    if (style.inverse) result += SGR_INVERSE;
    return result;
  }

  // Track last known terminal size to detect shrinking
  let lastRenderedRows = 0;
  // Typed-array row fingerprints: double-buffered for frame-to-frame diffing.
  // Each cell is encoded as (numericStyleKey << 10) | charHash10.
  let fpCols = 0;
  let fpRows = 0;
  let currentFP = new Uint32Array(0);
  let prevFP = new Uint32Array(0);
  let currentHrefIds = new Uint32Array(0);
  let prevHrefIds = new Uint32Array(0);
  let fpPrevValid = false;
  let prevOverlayBlockedRows: readonly number[] = [];
  let prevOverlayPartialRows: readonly number[] = [];
  const hrefIndex = new Map<string, number>();
  let nextHrefId = 1;
  const MAX_HREF_IDS = 8192;
  let hrefIndexResetRequiresBaseline = false;
  function resetHrefIndex(): void {
    hrefIndex.clear();
    nextHrefId = 1;
    fpPrevValid = false;
    hrefIndexResetRequiresBaseline = true;
  }
  function ensureFingerprints(cols: number, rows: number): void {
    if (cols === fpCols && rows === fpRows) return;
    fpCols = cols;
    fpRows = rows;
    const len = cols * rows;
    currentFP = new Uint32Array(len);
    prevFP = new Uint32Array(len);
    currentHrefIds = new Uint32Array(len);
    prevHrefIds = new Uint32Array(len);
    fpPrevValid = false;
    prevOverlayBlockedRows = [];
    prevOverlayPartialRows = [];
  }
  function charHash10(ch: string): number {
    if (ch.length <= 1) return (ch.charCodeAt(0) || 0) & 0x3ff;
    let h = 0x811c;
    for (let i = 0; i < ch.length; i++) {
      h ^= ch.charCodeAt(i);
      h = (h * 0x0101) & 0xffff;
    }
    return h & 0x3ff;
  }

  function hrefId(href: string | null): number {
    if (!href) return 0;
    const cached = hrefIndex.get(href);
    if (cached != null) return cached;
    if (hrefIndex.size >= MAX_HREF_IDS || nextHrefId >= 0xffff_ffff) {
      resetHrefIndex();
    }
    const id = nextHrefId++;
    hrefIndex.set(href, id);
    return id;
  }

  function cellFingerprint(ch: string, style: Style): number {
    return (styleKey(style) << 10) | charHash10(ch);
  }

  function fingerprintRow(row: readonly Cell[], y: number, cols: number): void {
    // Fast path: use pre-computed SoA fingerprints from composite buffer.
    // This is a TypedArray.set() copy instead of per-cell property access + hash.
    const rowFP = terminal.getRowFingerprints(y);
    const base = y * fpCols;
    if (rowFP && rowFP.length >= cols) {
      currentFP.set(rowFP.subarray(0, cols), base);
    } else {
      // Fallback: compute per-cell fingerprints
      for (let x = 0; x < cols; x++) {
        const cell = row[x]!;
        currentFP[base + x] = cellFingerprint(cell.ch, cell.style);
      }
    }
    for (let x = 0; x < cols; x++) {
      const cell = row[x]!;
      currentHrefIds[base + x] = hrefId(normalizeHref(cell.style.href));
    }
  }
  const rowCursorToCol1: string[] = [];
  const rowClearToEol: string[] = [];
  const rowTextPartsScratch: string[] = [];

  let zeroWidthRiskRe: RegExp | null = null;
  try {
    // eslint-disable-next-line prefer-regex-literals
    zeroWidthRiskRe = new RegExp("^(?:\\p{Mark}|\\p{Default_Ignorable_Code_Point})+$", "u");
  } catch {
    zeroWidthRiskRe = null;
  }

  let extendedPictographicRe: RegExp | null = null;
  try {
    // eslint-disable-next-line prefer-regex-literals
    extendedPictographicRe = new RegExp("\\p{Extended_Pictographic}", "u");
  } catch {
    extendedPictographicRe = null;
  }

  let emojiPresentationRe: RegExp | null = null;
  try {
    // eslint-disable-next-line prefer-regex-literals
    emojiPresentationRe = new RegExp("\\p{Emoji_Presentation}", "u");
  } catch {
    emojiPresentationRe = null;
  }

  const isZeroWidthRiskCodePoint = (codePoint: number): boolean =>
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0xe0000 && codePoint <= 0xe0fff);

  const isZeroWidthRiskGrapheme = (ch: string): boolean => {
    if (!ch || ch === " ") return false;
    if (zeroWidthRiskRe?.test(ch)) return true;
    let hasRiskCodePoint = false;
    for (const part of ch) {
      const codePoint = part.codePointAt(0);
      if (codePoint === 0x20) continue;
      if (codePoint == null || !isZeroWidthRiskCodePoint(codePoint)) return false;
      hasRiskCodePoint = true;
    }
    return hasRiskCodePoint;
  };

  const isHighRiskWideGrapheme = (ch: string): boolean => {
    if (!ch || ch === " ") return false;
    if (ch.includes("\uFE0F") || ch.includes("\u200D") || ch.includes("\u20E3")) return true;
    if (extendedPictographicRe?.test(ch) || emojiPresentationRe?.test(ch)) return true;
    for (const part of ch) {
      const codePoint = part.codePointAt(0);
      if (codePoint == null) continue;
      if (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) return true;
      if (codePoint >= 0x1f300 && codePoint <= 0x1faff) return true;
      if (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) return true;
      if (codePoint >= 0xe0000 && codePoint <= 0xe007f) return true;
    }
    return false;
  };

  // Some terminals disagree on rendered glyph widths. If the terminal advances fewer columns
  // than our buffer model, subsequent glyphs can shift left and visually corrupt borders.
  const needsCursorFix = (cell: Cell, ch: string): boolean => {
    const w = cell.width ?? 1;
    return (w === 2 && isHighRiskWideGrapheme(ch)) || (w === 1 && isZeroWidthRiskGrapheme(ch));
  };

  const ensureRowEscapes = (rows: number): void => {
    if (rowCursorToCol1.length >= rows) return;
    const start = rowCursorToCol1.length;
    rowCursorToCol1.length = rows;
    rowClearToEol.length = rows;
    for (let y = start; y < rows; y++) {
      rowCursorToCol1[y] = `\u001B[${y + 1};1H`;
      rowClearToEol[y] = `\u001B[${y + 1};1H\u001B[K`;
    }
  };

  // ensureRenderedRowCache removed — replaced by typed-array fingerprints

  const rowHasNonDefaultBlankCell = (source: Uint32Array, y: number, cols: number): boolean => {
    if (!fpCols || y < 0 || y >= fpRows) return false;
    const blankFP = (styleKeyFromParts({ bg: defaultBg }) << 10) | charHash10(" ");
    const base = y * fpCols;
    const limit = Math.min(cols, fpCols);
    for (let x = 0; x < limit; x++) {
      if (source[base + x] !== blankFP) return true;
    }
    return false;
  };

  function overlayPlaneCoverageRows(totalRows: number): Readonly<{
    blockedRows: readonly number[];
    partialRows: readonly number[];
  }> {
    const blockedRows: number[] = [];
    const partialRows: number[] = [];
    for (let y = 0; y < totalRows; y++) {
      const kind = getPlaneRowCoverageKind(terminal, "overlay", y);
      if (!kind) continue;
      blockedRows.push(y);
      if (kind === 1) partialRows.push(y);
    }
    return { blockedRows, partialRows };
  }

  // Terminal scroll regions: use DECSTBM + \e[S/\e[T to let the terminal shift
  // content natively instead of redrawing the entire viewport on scroll.
  // Disable via VUE_TUI_SCROLL_REGIONS=0 (or legacy DIMCODE_TUI_SCROLL_REGIONS=0) for debugging.
  const enableScrollRegions = (() => {
    const raw = String(
      firstNonEmptyEnv(env, "VUE_TUI_SCROLL_REGIONS", "DIMCODE_TUI_SCROLL_REGIONS") ?? "",
    ).trim();
    if (raw === "0" || raw === "false") return false;
    // Ghostty has issues with DECSTBM in some versions; disable by default
    if (isGhostty || isVscodeTerminal) return false;
    return out.isTTY !== false;
  })();

  interface ScrollShift {
    regionStart: number;
    regionEnd: number;
    delta: number;
    newRowStart: number;
    newRowEnd: number;
    extraDirtyRows: number[];
  }

  interface PreparedExplicitScroll {
    operations: readonly TerminalScrollOperation[] | null;
    hiddenRows: ReadonlySet<number>;
    trimmed: boolean;
    blockedInterior: boolean;
  }

  function prepareExplicitScrollOperations(
    operations: readonly TerminalScrollOperation[],
    blockedRows: ReadonlySet<number> | null,
  ): PreparedExplicitScroll {
    if (!operations.length || !blockedRows?.size) {
      return {
        operations,
        hiddenRows: new Set<number>(),
        trimmed: false,
        blockedInterior: false,
      };
    }

    const hiddenRows = new Set<number>();
    const prepared: TerminalScrollOperation[] = [];
    let trimmed = false;

    for (const op of operations) {
      let startY = op.startY;
      let endY = op.endY;

      while (startY < endY && blockedRows.has(startY)) {
        hiddenRows.add(startY);
        startY++;
        trimmed = true;
      }
      while (endY > startY && blockedRows.has(endY - 1)) {
        hiddenRows.add(endY - 1);
        endY--;
        trimmed = true;
      }

      for (let y = startY; y < endY; y++) {
        if (!blockedRows.has(y)) continue;
        return {
          operations: null,
          hiddenRows,
          trimmed,
          blockedInterior: true,
        };
      }

      if (endY <= startY || Math.abs(op.delta) >= endY - startY) {
        return {
          operations: null,
          hiddenRows,
          trimmed,
          blockedInterior: false,
        };
      }

      prepared.push(
        startY === op.startY && endY === op.endY ? op : { startY, endY, delta: op.delta },
      );
    }

    return {
      operations: prepared,
      hiddenRows,
      trimmed,
      blockedInterior: false,
    };
  }

  /**
   * Detect if the current frame represents a pure vertical scroll by comparing
   * current fingerprints against previous fingerprints with various shift offsets.
   * Returns the shift delta and which rows are newly revealed, or null if no
   * scroll pattern is detected.
   */
  function largestDirtyBand(
    rows: readonly number[],
    blockedRows?: readonly number[],
  ): Readonly<{
    start: number;
    end: number;
    outsideRows: number[];
  }> | null {
    if (rows.length === 0) return null;

    const blocked = blockedRows?.length ? new Set(blockedRows) : null;
    let bestStart = -1;
    let bestEnd = -1;
    let bandStart = -1;
    let prev = -1;

    for (let i = 0; i < rows.length; i++) {
      const y = rows[i]!;
      if (blocked?.has(y)) {
        if (bandStart !== -1 && prev + 1 - bandStart > bestEnd - bestStart) {
          bestStart = bandStart;
          bestEnd = prev + 1;
        }
        bandStart = -1;
        prev = -1;
        continue;
      }
      if (bandStart === -1) {
        bandStart = y;
        prev = y;
        if (bestStart === -1) {
          bestStart = y;
          bestEnd = y + 1;
        }
        continue;
      }
      if (y === prev + 1) {
        prev = y;
        continue;
      }
      if (prev + 1 - bandStart > bestEnd - bestStart) {
        bestStart = bandStart;
        bestEnd = prev + 1;
      }
      bandStart = y;
      prev = y;
    }

    if (bandStart !== -1 && prev + 1 - bandStart > bestEnd - bestStart) {
      bestStart = bandStart;
      bestEnd = prev + 1;
    }

    if (bestStart === -1) return null;

    const outsideRows: number[] = [];
    for (const y of rows) {
      if (blocked?.has(y) || y < bestStart || y >= bestEnd) {
        outsideRows.push(y);
      }
    }
    return { start: bestStart, end: bestEnd, outsideRows };
  }

  function detectScrollShift(
    cols: number,
    dirtyRows: readonly number[],
    blockedRows?: readonly number[],
  ): ScrollShift | null {
    if (!fpPrevValid || !fpCols || cols !== fpCols) return null;
    const band = largestDirtyBand(dirtyRows, blockedRows);
    if (!band || band.end - band.start < 3) return null;

    // Try scroll deltas large enough to cover coalesced wheel ticks.
    // In practice we often see 3-line wheel steps batched into 6-line shifts.
    const maxDelta = Math.min(12, Math.max(5, band.end - band.start - 1));
    for (let delta = -maxDelta; delta <= maxDelta; delta++) {
      if (delta === 0) continue;

      let matches = 0;
      let checked = 0;
      let mismatches = 0;

      for (let y = band.start; y < band.end; y++) {
        const srcY = y + delta; // where this row's content came from in prev frame
        if (srcY < band.start || srcY >= band.end) continue;
        const informative =
          rowHasNonDefaultBlankCell(currentFP, y, cols) ||
          rowHasNonDefaultBlankCell(prevFP, srcY, cols);
        if (!informative) continue;
        checked++;

        const curBase = y * fpCols;
        const prevBase = srcY * fpCols;
        let rowMatch = true;
        for (let x = 0; x < cols; x++) {
          if (
            currentFP[curBase + x] !== prevFP[prevBase + x] ||
            currentHrefIds[curBase + x] !== prevHrefIds[prevBase + x]
          ) {
            rowMatch = false;
            break;
          }
        }
        if (rowMatch) {
          matches++;
        } else {
          mismatches++;
        }
      }

      // Require 80%+ of checkable rows to match the shift pattern,
      // and at least 3 matching rows to avoid false positives
      if (checked > 0 && matches >= 3 && mismatches <= Math.ceil(checked * 0.2)) {
        const absDelta = Math.abs(delta);
        let newRowStart: number;
        let newRowEnd: number;
        if (delta > 0) {
          // Content scrolled up — new rows appear at bottom
          newRowStart = Math.max(band.start, band.end - absDelta);
          newRowEnd = band.end;
        } else {
          // Content scrolled down — new rows appear at top
          newRowStart = band.start;
          newRowEnd = Math.min(band.end, band.start + absDelta);
        }
        const extraDirty: number[] = [...band.outsideRows];
        for (let y = band.start; y < band.end; y++) {
          const srcY = y + delta;
          if (srcY < band.start || srcY >= band.end) continue;
          const curBase = y * fpCols;
          const prevBase = srcY * fpCols;
          let rowMatch = true;
          for (let x = 0; x < cols; x++) {
            if (
              currentFP[curBase + x] !== prevFP[prevBase + x] ||
              currentHrefIds[curBase + x] !== prevHrefIds[prevBase + x]
            ) {
              rowMatch = false;
              break;
            }
          }
          if (!rowMatch) extraDirty.push(y);
        }
        return {
          regionStart: band.start,
          regionEnd: band.end,
          delta,
          newRowStart,
          newRowEnd,
          extraDirtyRows: extraDirty,
        };
      }
    }
    return null;
  }

  /**
   * Write data in chunks to avoid overwhelming terminal buffers.
   * This is especially important for ghostty which can hang on large writes.
   *
   * CRITICAL: In ghostty, setTimeout callbacks don't execute, so we must use
   * synchronous chunked writes. We break large writes into smaller chunks to
   * reduce the chance of terminal hangs.
   */
  function writeChunked(data: string): void {
    if (!isGhostty) {
      // Non-ghostty: direct write
      if (data.length <= chunkSize) {
        out.write(data);
        return;
      }
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        out.write(chunk);
      }
      return;
    }

    // Ghostty: synchronous chunked write (setTimeout doesn't work in ghostty)
    if (isDebugEnabled()) {
      getDebugLog().render(`writeChunked: sync chunked write of ${data.length} bytes`);
    }

    try {
      if (data.length <= chunkSize) {
        out.write(data);
      } else {
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          out.write(chunk);
        }
      }

      if (isDebugEnabled()) getDebugLog().render(`writeChunked: chunked write completed`);
    } catch (e) {
      if (isDebugEnabled()) getDebugLog().error(`writeChunked: write error`, e);
    }
  }

  /**
   * Internal function that actually renders the frame to stdout.
   * When dirtyRows is provided, only those rows are repainted.
   */
  function doRender(
    dirtyRows?: readonly number[] | null,
    scrollOperations?: readonly TerminalScrollOperation[] | null,
  ): void {
    if (isDebugEnabled()) {
      getDebugLog().render(`doRender() START: dirtyRows=${dirtyRows?.length ?? "null"}`);
    }

    if (disposed) return;
    cliLatency?.recordStdoutRenderStart();
    pendingRender = false;
    accumulatedAllRows = false;
    accumulatedDirtyBits = null;
    accumulatedDirtyCount = 0;
    accumulatedDirtyMin = Number.POSITIVE_INFINITY;
    accumulatedDirtyMax = -1;
    accumulatedScrollOperations = null;
    lastFrameTime = Date.now();

    const renderStart = performance.now();

    const size = terminal.size();
    ensureRowEscapes(Math.max(size.rows, lastRenderedRows));
    ensureFingerprints(size.cols, size.rows);
    const bgSeq = openBg(defaultBg);
    const bgOnlyStyle: Style = { bg: defaultBg };
    const bgKey = styleKeyFromParts({ bg: defaultBg });
    const blankFP = (bgKey << 10) | charHash10(" ");
    let dirtySorted = true;
    const forceFullRender = hrefIndexResetRequiresBaseline;
    if (forceFullRender) hrefIndexResetRequiresBaseline = false;
    const normalizedScrollOperations = (() => {
      if (!scrollOperations?.length) return null;
      const outOps: TerminalScrollOperation[] = [];
      for (const op of scrollOperations) {
        const startY = Math.max(0, Math.min(size.rows, Math.floor(op.startY)));
        const endY = Math.max(0, Math.min(size.rows, Math.floor(op.endY)));
        const delta = Math.trunc(op.delta);
        if (endY <= startY || delta === 0 || Math.abs(delta) >= endY - startY) continue;
        outOps.push({ startY, endY, delta });
      }
      if (!outOps.length) return null;
      return outOps;
    })();
    let rowsToRender = (() => {
      if (forceFullRender) return null;
      if (!dirtyRows || dirtyRows.length === 0) return null;
      const outRows: number[] = [];
      outRows.length = dirtyRows.length;
      let outLen = 0;
      let sorted = true;
      let prev = -1;
      for (let i = 0; i < dirtyRows.length; i++) {
        const y = Math.floor(dirtyRows[i] ?? -1);
        if (y < 0 || y >= size.rows) continue;
        if (y <= prev) sorted = false;
        prev = y;
        outRows[outLen++] = y;
      }
      outRows.length = outLen;
      if (!outRows.length) return null;
      dirtySorted = sorted;
      if (!sorted) outRows.sort((a, b) => a - b);
      return outRows;
    })();
    if (fpPrevValid && rowsToRender) {
      // Preserve untouched rows so the next frame still compares against the
      // full previous screen, not just the rows repainted in this frame.
      currentFP.set(prevFP);
      currentHrefIds.set(prevHrefIds);
    }
    // Build entire frame as a single string - NO async, NO multiple writes.
    // Use synchronized output mode (DEC 2026) to prevent flickering (if enabled).
    // Disable line wrap to prevent auto-wrapping from causing vertical jumps.
    // NOTE: In ghostty, we avoid SYNC_START/END and use chunked writes instead.
    const frameParts: string[] = [];
    frameParts.push(!isGhostty && useSyncOutput ? SYNC_START : "");
    frameParts.push("\u001B[?7l");
    // Reset once at the start so we can avoid repeated resets for common style changes.
    frameParts.push(SGR_RESET, bgSeq);

    // Track consecutive row cursor optimization state
    let lastRenderedY = -1;
    let lastRenderWasFullRow = false;
    let hasFrameOutput = false;

    // Track current style to avoid redundant SGR sequences
    let activeStyleKey: number | null = null;
    let activeStyle: Readonly<{
      fg: string | null;
      bg: string | undefined;
      bold: boolean;
      dim: boolean;
      italic: boolean;
      underline: boolean;
      inverse: boolean;
      href: string | null;
    }> = {
      fg: null,
      bg: defaultBg,
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      inverse: false,
      href: null,
    };

    const normalizeStyle = (style: Style): typeof activeStyle => {
      return {
        fg: style.fg ?? null,
        bg: style.bg ?? defaultBg,
        bold: Boolean(style.bold),
        dim: enableDim && Boolean(style.dim),
        italic: Boolean(style.italic),
        underline: Boolean(style.underline),
        inverse: Boolean(style.inverse),
        href: normalizeHref(style.href),
      };
    };

    const emitStyle = (nextStyle: Style, nextKey: number): void => {
      const next = normalizeStyle(nextStyle);
      if (activeStyleKey === nextKey && activeStyle.href === next.href) return;

      if (enableOsc8Links && activeStyle.href !== next.href) {
        if (activeStyle.href) frameParts.push(OSC8_CLOSE);
        if (next.href) frameParts.push(OSC8_OPEN(next.href));
      }

      // If we need to disable any attribute or return to default fg, a reset is simplest and correct.
      const requiresReset =
        (activeStyle.bold && !next.bold) ||
        (activeStyle.dim && !next.dim) ||
        (activeStyle.italic && !next.italic) ||
        (activeStyle.underline && !next.underline) ||
        (activeStyle.inverse && !next.inverse) ||
        (activeStyle.fg != null && next.fg == null);

      if (requiresReset) {
        frameParts.push(SGR_RESET, openStyle(nextStyle));
        activeStyleKey = nextKey;
        activeStyle = next;
        return;
      }

      if (activeStyle.fg !== next.fg && next.fg != null) frameParts.push(openColor(next.fg));
      if (activeStyle.bg !== next.bg) frameParts.push(openBg(next.bg));
      if (!activeStyle.bold && next.bold) frameParts.push(SGR_BOLD);
      if (!activeStyle.dim && next.dim) frameParts.push(SGR_DIM);
      if (!activeStyle.italic && next.italic) frameParts.push(SGR_ITALIC);
      if (!activeStyle.underline && next.underline) frameParts.push(SGR_UNDERLINE);
      if (!activeStyle.inverse && next.inverse) frameParts.push(SGR_INVERSE);

      activeStyleKey = nextKey;
      activeStyle = next;
    };

    const shouldEmitStyle = (style: Style, key: number): boolean =>
      activeStyleKey !== key || activeStyle.href !== normalizeHref(style.href);

    const renderRow = (
      y: number,
      row: readonly Cell[],
      startX = 0,
      endXExclusive = row.length,
      clearToEol = true,
    ) => {
      const spanStart = Math.max(0, Math.min(row.length, Math.floor(startX)));
      const spanEnd = Math.max(spanStart, Math.min(row.length, Math.floor(endXExclusive)));
      if (spanStart >= spanEnd && !clearToEol) {
        return;
      }
      hasFrameOutput = true;

      // Skip cursor positioning if disabled (ghostty workaround)
      if (!disableCursorPos) {
        if (spanStart === 0 && lastRenderWasFullRow && y === lastRenderedY + 1) {
          frameParts.push("\r\n");
        } else {
          frameParts.push(
            spanStart === 0 ? rowCursorToCol1[y]! : `\u001B[${y + 1};${spanStart + 1}H`,
          );
        }
      }
      let currentKey: number | null = null;
      let currentStyle: Style | null = null;
      const currentTextParts = rowTextPartsScratch;
      currentTextParts.length = 0;

      for (let x = spanStart; x < spanEnd; x++) {
        const cell = row[x]!;
        if (cell.continuation) continue;
        const ch = cell.ch || " ";
        const nextStyle = cell.style;
        const key: number =
          nextStyle === currentStyle && currentKey != null ? currentKey : styleKey(nextStyle);

        if (currentKey == null) {
          currentKey = key;
          currentStyle = nextStyle;
          currentTextParts.push(ch);
          if (needsCursorFix(cell, ch)) {
            currentTextParts.push(`\u001B[${y + 1};${x + 1 + (cell.width ?? 1)}H`);
          }
          continue;
        }
        if (
          key === currentKey &&
          normalizeHref(nextStyle.href) === normalizeHref(currentStyle?.href)
        ) {
          currentTextParts.push(ch);
          if (needsCursorFix(cell, ch)) {
            currentTextParts.push(`\u001B[${y + 1};${x + 1 + (cell.width ?? 1)}H`);
          }
          continue;
        }
        // Only emit SGR if style actually changed from what's active
        if (shouldEmitStyle(currentStyle!, currentKey)) {
          emitStyle(currentStyle!, currentKey);
        }
        frameParts.push(currentTextParts.join(""));
        currentKey = key;
        currentStyle = nextStyle;
        currentTextParts.length = 0;
        currentTextParts.push(ch);
        if (needsCursorFix(cell, ch))
          currentTextParts.push(`\u001B[${y + 1};${x + 1 + (cell.width ?? 1)}H`);
      }

      if (currentKey != null) {
        if (shouldEmitStyle(currentStyle!, currentKey)) {
          emitStyle(currentStyle!, currentKey);
        }
        frameParts.push(currentTextParts.join(""));
      }

      if (clearToEol) {
        // Clear to end-of-line using the UI background color (not the terminal theme).
        // Only reset if we need a different background for the EOL clear
        if (activeStyleKey !== bgKey) {
          emitStyle(bgOnlyStyle, bgKey);
        }
        frameParts.push("\u001B[K");
      }
      lastRenderedY = y;
      lastRenderWasFullRow = spanStart === 0 && clearToEol;
    };

    // Detect scroll pattern: if dirty rows represent a pure vertical shift,
    // use DECSTBM scroll regions to let the terminal shift content natively,
    // then only render the newly revealed rows. This reduces ANSI output from
    // O(viewport) to O(scrolled_lines) — ~97% reduction for single-line scrolls.
    const overlayCoverage = overlayPlaneCoverageRows(size.rows);
    const overlayRows = Array.from(
      new Set([...overlayCoverage.blockedRows, ...prevOverlayBlockedRows]),
    ).sort((a, b) => a - b);
    const overlayRowSet = overlayRows.length ? new Set(overlayRows) : null;
    const overlayPartialRows = Array.from(
      new Set([...overlayCoverage.partialRows, ...prevOverlayPartialRows]),
    ).sort((a, b) => a - b);
    const overlayPartialRowSet = overlayPartialRows.length ? new Set(overlayPartialRows) : null;
    const overlayTouchedRowSet = (() => {
      if (!overlayRowSet && !overlayPartialRowSet) return null;
      return new Set<number>([
        ...(overlayRowSet ? Array.from(overlayRowSet) : []),
        ...(overlayPartialRowSet ? Array.from(overlayPartialRowSet) : []),
      ]);
    })();
    let explicitScrollOperations: readonly TerminalScrollOperation[] | null =
      normalizedScrollOperations;
    let hiddenExplicitDirtyRows: ReadonlySet<number> | null = null;
    let allowInferredScrollRegions = true;
    if (explicitScrollOperations && overlayRows.length) {
      const preparedExplicit = prepareExplicitScrollOperations(
        explicitScrollOperations,
        overlayRowSet,
      );
      hiddenExplicitDirtyRows = preparedExplicit.hiddenRows.size
        ? preparedExplicit.hiddenRows
        : null;
      if (preparedExplicit.operations) {
        explicitScrollOperations = preparedExplicit.operations;
        if (preparedExplicit.trimmed && isDebugEnabled()) {
          getDebugLog().render(
            ` Explicit scroll ops clipped around overlay rows: ${normalizedScrollOperations!.map((op, index) => `${op.startY}-${op.endY - 1}:${op.delta}->${explicitScrollOperations![index]!.startY}-${explicitScrollOperations![index]!.endY - 1}:${explicitScrollOperations![index]!.delta}`).join(", ")}`,
          );
        }
      } else {
        allowInferredScrollRegions = false;
        const expandedRows = new Set(rowsToRender ?? []);
        for (const op of explicitScrollOperations) {
          for (let y = op.startY; y < op.endY; y++) expandedRows.add(y);
        }
        rowsToRender = Array.from(expandedRows).sort((a, b) => a - b);
        dirtySorted = true;
        explicitScrollOperations = null;
        hiddenExplicitDirtyRows = null;
        if (isDebugEnabled()) {
          getDebugLog().render(
            preparedExplicit.blockedInterior
              ? " Explicit scroll ops split by interior overlay rows; falling back to region repaint"
              : " Explicit scroll ops could not be clipped safely; falling back to region repaint",
          );
        }
      }
    }
    const scrollRowsCandidate = rowsToRender;
    if (explicitScrollOperations && rowsToRender && (!enableScrollRegions || !fpPrevValid)) {
      const expandedRows = new Set<number>(rowsToRender);
      for (const op of explicitScrollOperations) {
        for (let y = op.startY; y < op.endY; y++) {
          if (hiddenExplicitDirtyRows?.has(y)) continue;
          expandedRows.add(y);
        }
      }
      rowsToRender = Array.from(expandedRows).sort((a, b) => a - b);
      dirtySorted = true;
      explicitScrollOperations = null;
      hiddenExplicitDirtyRows = null;
      if (isDebugEnabled()) {
        getDebugLog().render(
          enableScrollRegions
            ? " Explicit scroll ops fell back to region repaint because previous fingerprints are unavailable"
            : " Explicit scroll ops fell back to region repaint because scroll regions are disabled",
        );
      }
    }
    const denseDirtyRows = Boolean(
      rowsToRender && rowsToRender.length >= size.rows * dirtyFullThreshold,
    );
    if (denseDirtyRows) {
      rowsToRender = null;
    }
    let profiledRowCount = rowsToRender ? rowsToRender.length : size.rows;
    const useScrollRegions =
      enableScrollRegions &&
      fpPrevValid &&
      scrollRowsCandidate &&
      scrollRowsCandidate.length >= 3 &&
      allowInferredScrollRegions;

    let scrollHandled = false;
    if (enableScrollRegions && explicitScrollOperations && scrollRowsCandidate && fpPrevValid) {
      if (currentFP.length === prevFP.length) {
        currentFP.set(prevFP);
        currentHrefIds.set(prevHrefIds);
      }

      const explicitRowsToRender = new Set<number>();
      for (const y of scrollRowsCandidate) {
        if (hiddenExplicitDirtyRows?.has(y)) continue;
        explicitRowsToRender.add(y);
      }
      if (isDebugEnabled()) {
        getDebugLog().render(
          ` Explicit scroll ops: ${explicitScrollOperations.map((op) => `${op.startY}-${op.endY - 1}:${op.delta}`).join(", ")}`,
        );
      }

      for (const op of explicitScrollOperations) {
        hasFrameOutput = true;
        frameParts.push(`\u001B[${op.startY + 1};${op.endY}r`);
        if (op.delta > 0) {
          frameParts.push(`\u001B[${op.endY};1H`);
          frameParts.push(`\u001B[${op.delta}S`);
          for (let y = op.startY; y < op.endY - op.delta; y++) {
            const dstBase = y * fpCols;
            const srcBase = (y + op.delta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x]!;
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x]!;
            }
          }
          for (let y = op.endY - op.delta; y < op.endY; y++) {
            const base = y * fpCols;
            explicitRowsToRender.add(y);
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        } else {
          const absDelta = -op.delta;
          frameParts.push(`\u001B[${op.startY + 1};1H`);
          frameParts.push(`\u001B[${absDelta}T`);
          for (let y = op.endY - 1; y >= op.startY + absDelta; y--) {
            const dstBase = y * fpCols;
            const srcBase = (y - absDelta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x]!;
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x]!;
            }
          }
          for (let y = op.startY; y < op.startY + absDelta; y++) {
            const base = y * fpCols;
            explicitRowsToRender.add(y);
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        }
        frameParts.push("\u001B[r");
      }

      const explicitDirtyRows = Array.from(explicitRowsToRender).sort((a, b) => a - b);
      const overlayDirtyRows = overlayTouchedRowSet
        ? explicitDirtyRows.filter((y) => overlayTouchedRowSet.has(y))
        : [];
      const paintedExplicitRows: number[] = [];
      for (const y of explicitDirtyRows) {
        const row = terminal.getRow(y) as Cell[];
        fingerprintRow(row, y, size.cols);
        renderRow(y, row);
        paintedExplicitRows.push(y);
      }

      if (isDebugEnabled() && overlayDirtyRows.length) {
        getDebugLog().render(` Explicit scroll ops overlay rows: [${overlayDirtyRows.join(", ")}]`);
      }
      profiledRowCount = explicitDirtyRows.length;
      scrollHandled = true;
    } else if (useScrollRegions && scrollRowsCandidate) {
      // Fingerprint ALL rows (not just dirty ones) so detectScrollShift has
      // complete data. After the double-buffer swap, currentFP for non-dirty rows
      // contains stale values from frame N-2, not frame N-1.
      for (let y = 0; y < size.rows; y++) {
        fingerprintRow(terminal.getRow(y) as Cell[], y, size.cols);
      }
      const shift = detectScrollShift(size.cols, scrollRowsCandidate, overlayRows);
      if (shift) {
        if (currentFP.length === prevFP.length) {
          currentFP.set(prevFP);
          currentHrefIds.set(prevHrefIds);
        }

        hasFrameOutput = true;
        if (isDebugEnabled()) {
          getDebugLog().render(
            ` Scroll region: delta=${shift.delta}, region=${shift.regionStart}-${shift.regionEnd - 1}, new rows=${shift.newRowStart}-${shift.newRowEnd - 1}`,
          );
        }
        // Set scroll region (DECSTBM, 1-based)
        frameParts.push(`\u001B[${shift.regionStart + 1};${shift.regionEnd}r`);
        if (shift.delta > 0) {
          // Content scrolled up — new content appears at bottom
          frameParts.push(`\u001B[${shift.regionEnd};1H`);
          frameParts.push(`\u001B[${shift.delta}S`);
        } else {
          // Content scrolled down — new content appears at top
          frameParts.push(`\u001B[${shift.regionStart + 1};1H`);
          frameParts.push(`\u001B[${-shift.delta}T`);
        }
        // Reset scroll region
        frameParts.push("\u001B[r");

        if (shift.delta > 0) {
          for (let y = shift.regionStart; y < shift.regionEnd - shift.delta; y++) {
            const dstBase = y * fpCols;
            const srcBase = (y + shift.delta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x]!;
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x]!;
            }
          }
          for (let y = shift.regionEnd - shift.delta; y < shift.regionEnd; y++) {
            const base = y * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        } else {
          const absDelta = -shift.delta;
          for (let y = shift.regionEnd - 1; y >= shift.regionStart + absDelta; y--) {
            const dstBase = y * fpCols;
            const srcBase = (y - absDelta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x]!;
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x]!;
            }
          }
          for (let y = shift.regionStart; y < shift.regionStart + absDelta; y++) {
            const base = y * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        }

        // Render only the newly revealed rows
        for (let y = shift.newRowStart; y < shift.newRowEnd; y++) {
          const row = terminal.getRow(y) as Cell[];
          // Fingerprint if not already done (rows outside dirty set)
          fingerprintRow(row, y, size.cols);
          renderRow(y, row);
        }
        const extraDirtyRows = overlayRowSet
          ? shift.extraDirtyRows.filter(
              (y) => !overlayRowSet.has(y) || Boolean(overlayPartialRowSet?.has(y)),
            )
          : shift.extraDirtyRows;

        // Also render any dirty rows that don't match the scroll pattern
        // (e.g., scrollbar column changes)
        for (const y of extraDirtyRows) {
          const row = terminal.getRow(y) as Cell[];
          fingerprintRow(row, y, size.cols);
          renderRow(y, row);
        }
        for (let y = shift.newRowStart; y < shift.newRowEnd; y++) {
          fingerprintRow(terminal.getRow(y) as Cell[], y, size.cols);
        }

        const renderedRows = new Set<number>();
        for (let y = shift.newRowStart; y < shift.newRowEnd; y++) renderedRows.add(y);
        for (const y of extraDirtyRows) renderedRows.add(y);
        profiledRowCount = renderedRows.size;
        scrollHandled = true;
      }
    }

    if (!scrollHandled && denseDirtyRows && scrollRowsCandidate && useScrollRegions) {
      rowsToRender = scrollRowsCandidate;
      profiledRowCount = rowsToRender.length;
      if (isDebugEnabled()) {
        getDebugLog().render(
          ` Dense dirty rows fell back to partial render: ${rowsToRender.length} rows`,
        );
      }
    }

    // Render all rows (address each row directly to avoid scrolling)
    if (scrollHandled) {
      // Already handled by scroll region above
    } else if (!rowsToRender) {
      if (isDebugEnabled()) getDebugLog().render(` Full render: ${size.rows} rows`);
      for (let y = 0; y < size.rows; y++) {
        const row = terminal.getRow(y) as Cell[];
        fingerprintRow(row, y, size.cols);
        renderRow(y, row);
      }
    } else {
      const overlayDirtyRows = overlayTouchedRowSet
        ? rowsToRender.filter((y) => overlayTouchedRowSet.has(y))
        : [];
      if (isDebugEnabled()) {
        getDebugLog().render(
          ` Partial render: ${rowsToRender.length} dirty rows: [${rowsToRender.join(", ")}]${overlayDirtyRows.length ? ` (overlay-full-row: [${overlayDirtyRows.join(", ")}])` : ""}`,
        );
      }
      for (const y of rowsToRender) {
        const row = terminal.getRow(y) as Cell[];
        fingerprintRow(row, y, size.cols);
        renderRow(y, row);
      }
    }

    // If terminal shrank, we need to clear the old extra rows.
    // But instead of using \u001B[J which causes flash, we fill with empty lines.
    // Only do this when the terminal actually shrank.
    if (!rowsToRender && lastRenderedRows > size.rows) {
      const extraRows = lastRenderedRows - size.rows;
      if (activeStyleKey !== bgKey) {
        frameParts.push(SGR_RESET, bgSeq);
        activeStyleKey = bgKey;
      }
      for (let i = 0; i < extraRows; i++) {
        hasFrameOutput = true;
        frameParts.push(rowClearToEol[size.rows + i]!);
      }
    }
    if (!rowsToRender) lastRenderedRows = size.rows;
    // Swap fingerprint buffers for next frame diff (zero-copy)
    const tmpFP = prevFP;
    prevFP = currentFP;
    currentFP = tmpFP;
    const tmpHrefIds = prevHrefIds;
    prevHrefIds = currentHrefIds;
    currentHrefIds = tmpHrefIds;
    fpPrevValid = !hrefIndexResetRequiresBaseline;
    prevOverlayBlockedRows = overlayCoverage.blockedRows;
    prevOverlayPartialRows = overlayCoverage.partialRows;

    // Include cursor position in the same frame if getImeAnchor is provided
    // This eliminates the need for a separate setCursor() call after render
    let emittedCursorPos: { x: number; y: number } | null = null;
    if (getImeAnchor) {
      const anchor = getImeAnchor();
      if (anchor) {
        const { x, y } = clampCellToViewport(anchor, size);
        if (hasFrameOutput || x !== lastCursorX || y !== lastCursorY) {
          hasFrameOutput = true;
          emittedCursorPos = { x, y };
          // ANSI cursor position is 1-based: ESC [ row ; col H
          frameParts.push(`\u001B[${y + 1};${x + 1}H`);
        }
      }
    }

    if (!hasFrameOutput) {
      if (isDebugEnabled()) getDebugLog().render(" No-op frame skipped");
      cliLatency?.recordStdoutNoOutput();
      return;
    }

    // Reset style at end to leave terminal in clean state
    if (enableOsc8Links && activeStyle.href) frameParts.push(OSC8_CLOSE);
    frameParts.push(SGR_RESET);
    // Re-enable line wrap and end synchronized output (if enabled and not ghostty)
    frameParts.push("\u001B[?7h");
    frameParts.push(!isGhostty && useSyncOutput ? SYNC_END : "");

    const frame = frameParts.join("");
    if (profiler) {
      profiler.recordRender({
        durationMs: profiler.now() - renderStart,
        rows: profiledRowCount,
        nodes: 0,
        fullRepaint: !rowsToRender && !scrollHandled,
        sorted: dirtySorted,
      });
    }

    // Log frame info before write
    if (isDebugEnabled()) {
      const countResets = (s: string): number => {
        let count = 0;
        let i = 0;
        while (true) {
          i = s.indexOf("\u001B[0m", i);
          if (i === -1) return count;
          count++;
          i += 4;
        }
      };

      const countCursorMoves = (s: string): number => {
        let count = 0;
        for (let i = 0; i < s.length; i++) {
          if (s.charCodeAt(i) !== 0x1b) continue;
          if (s[i + 1] !== "[") continue;
          let j = i + 2;
          let hasDigits = false;
          while (j < s.length) {
            const c = s.charCodeAt(j);
            if (c >= 48 && c <= 57) {
              hasDigits = true;
              j++;
              continue;
            }
            break;
          }
          if (!hasDigits || s[j] !== ";") continue;
          j++;
          hasDigits = false;
          while (j < s.length) {
            const c = s.charCodeAt(j);
            if (c >= 48 && c <= 57) {
              hasDigits = true;
              j++;
              continue;
            }
            break;
          }
          if (hasDigits && s[j] === "H") {
            count++;
            i = j;
          }
        }
        return count;
      };

      const frameSize = frame.length;
      const cursorSeqCount = countCursorMoves(frame);
      const resetCount = countResets(frame);
      const buildTime = (performance.now() - renderStart).toFixed(2);
      getDebugLog().render(
        ` Frame built: ${frameSize} bytes, ${cursorSeqCount} cursor sequences, ${resetCount} resets, ${buildTime}ms`,
      );
      getDebugLog().render(
        ` Terminal: ${isGhostty ? "GHOSTTY" : "other"}, useSyncOutput: ${useSyncOutput}`,
      );
    }

    // Write the frame to stdout.
    // For ghostty, use chunked writes to avoid terminal hang on large frames.
    // For other terminals, prefer writeSync when available for atomic output.
    const writeStart = performance.now();
    const resolveWriteMode = (frameSizeBytes: number): "stream" | "sync" | "chunked" => {
      if (isGhostty) return "chunked";

      const canWriteSync = (out as any).fd === 1;
      const preferChunked = frameSizeBytes >= chunkThresholdBytes || writeEmaMs >= 24;
      if (preferChunked) return "chunked";
      if (canWriteSync && frameSizeBytes <= syncMaxBytes) return "sync";
      return "stream";
    };
    const writeMode = resolveWriteMode(frame.length);

    if (isDebugEnabled()) getDebugLog().render(`Before write()`);

    try {
      if (writeMode === "chunked") {
        if (isDebugEnabled()) {
          getDebugLog().render(
            ` Using chunked write (chunkSize=${chunkSize}, threshold=${chunkThresholdBytes}, emaMs=${writeEmaMs.toFixed(2)})`,
          );
        }
        writeChunked(frame);
      } else if (writeMode === "sync" && (out as any).fd === 1) {
        if (isDebugEnabled()) getDebugLog().render(` Using writeSync`);
        try {
          writeFdSync(1, frame);
        } catch {
          // Fall back to stream write if sync fails
          if (isDebugEnabled()) {
            getDebugLog().render(` writeSync failed, falling back to stream write`);
          }
          out.write(frame);
        }
      } else {
        if (isDebugEnabled()) getDebugLog().render(` Using stream write`);
        out.write(frame);
      }
      if (isDebugEnabled()) {
        const writeTime = (performance.now() - writeStart).toFixed(2);
        getDebugLog().render(` Write completed in ${writeTime}ms`);
      }
    } catch (writeError) {
      if (isDebugEnabled()) getDebugLog().error(`Write ERROR:`, writeError);
      // If ALL write methods fail, attempt to restore terminal to safe state
      // This prevents terminal from being stuck in synchronized output mode
      if (!isGhostty && useSyncOutput) {
        try {
          out.write(`\u001B[?7h${SYNC_END}`);
        } catch {
          // Terminal may be in bad state, but we tried our best
        }
      }
      throw writeError;
    }
    {
      const writeMs = performance.now() - writeStart;
      writeEmaMs = writeEmaMs === 0 ? writeMs : writeEmaMs * 0.85 + writeMs * 0.15;
      if (emittedCursorPos) {
        lastCursorX = emittedCursorPos.x;
        lastCursorY = emittedCursorPos.y;
      } else {
        lastCursorX = null;
        lastCursorY = null;
      }
      recordStdoutFrame({
        at: Date.now(),
        bytes: frame.length,
        writeMs,
        writeEmaMs,
        writeMode: writeMode === "sync" ? "sync" : writeMode === "chunked" ? "chunked" : "stream",
      });
      if (profiler) {
        profiler.recordWrite({
          durationMs: writeMs,
          bytes: frame.length,
          mode: writeMode === "sync" ? "sync" : writeMode === "chunked" ? "chunked" : "stream",
        });
      }
      cliLatency?.recordStdoutWrite({
        durationMs: writeMs,
        bytes: frame.length,
        mode: writeMode === "sync" ? "sync" : writeMode === "chunked" ? "chunked" : "stream",
      });
    }
    if (isDebugEnabled()) {
      const totalTime = (performance.now() - renderStart).toFixed(2);
      getDebugLog().render(` Total render time: ${totalTime}ms`);
      getDebugLog().render(`doRender() END`);
    }
  }

  /**
   * Public render function with frame rate limiting.
   * Prevents excessive renders that cause flickering in Bun binaries.
   * Accumulates dirty rows while waiting for next frame to ensure no updates are lost.
   */
  function render(
    dirtyRows?: readonly number[] | null,
    sync?: boolean,
    scrollOperations?: readonly TerminalScrollOperation[] | null,
  ): void {
    if (disposed) return;

    if (isDebugEnabled()) {
      getDebugLog().render(
        `render() called: dirtyRows=${dirtyRows?.length ?? "null"}, pending=${pendingRender}, elapsed=${Date.now() - lastFrameTime}ms`,
      );
    }

    const ensureDirtyBits = (rowCount: number): Uint8Array => {
      if (!accumulatedDirtyBits || accumulatedDirtyBits.length !== rowCount) {
        accumulatedDirtyBits = new Uint8Array(rowCount);
        accumulatedDirtyCount = 0;
        accumulatedDirtyMin = Number.POSITIVE_INFINITY;
        accumulatedDirtyMax = -1;
      }
      return accumulatedDirtyBits;
    };

    const buildAccumulatedRows = (): readonly number[] | null => {
      if (accumulatedAllRows) return null;
      if (!accumulatedDirtyBits || accumulatedDirtyCount === 0) return dirtyRows ?? null;
      const out: number[] = [];
      out.length = accumulatedDirtyCount;
      let outLen = 0;
      const minY = Math.max(0, accumulatedDirtyMin);
      const maxY = Math.min(accumulatedDirtyBits.length - 1, accumulatedDirtyMax);
      for (let y = minY; y <= maxY; y++) {
        if (accumulatedDirtyBits[y]) {
          out[outLen++] = y;
        }
      }
      out.length = outLen;
      return outLen ? out : null;
    };

    const buildAccumulatedScrollOperations = (): readonly TerminalScrollOperation[] | null => {
      return accumulatedScrollOperations?.length ? accumulatedScrollOperations : null;
    };

    const normalizeAccumulatedScrollOperation = (
      startY: number,
      endY: number,
      delta: number,
      rowCount: number,
    ): TerminalScrollOperation | null => {
      const start = Math.max(0, Math.min(rowCount, Math.floor(startY)));
      const end = Math.max(0, Math.min(rowCount, Math.floor(endY)));
      const lines = Math.trunc(delta);
      const height = end - start;
      if (height <= 0 || lines === 0 || Math.abs(lines) >= height) return null;
      return { startY: start, endY: end, delta: lines };
    };

    const markAccumulatedDirtyRow = (y: number, rowCount: number): void => {
      if (accumulatedAllRows) return;
      if (y < 0 || y >= rowCount) return;
      const bits = ensureDirtyBits(rowCount);
      if (bits[y]) return;
      bits[y] = 1;
      accumulatedDirtyCount++;
      if (y < accumulatedDirtyMin) accumulatedDirtyMin = y;
      if (y > accumulatedDirtyMax) accumulatedDirtyMax = y;
    };

    const markAccumulatedDirtyRange = (startY: number, endY: number, rowCount: number): void => {
      const start = Math.max(0, Math.min(rowCount, Math.floor(startY)));
      const end = Math.max(0, Math.min(rowCount, Math.floor(endY)));
      for (let y = start; y < end; y++) markAccumulatedDirtyRow(y, rowCount);
    };

    const shiftAccumulatedDirtyRowsForScrollOperation = (
      op: TerminalScrollOperation,
      rowCount: number,
    ): void => {
      if (accumulatedAllRows) return;
      if (!accumulatedDirtyBits || accumulatedDirtyCount === 0) return;

      const bits = accumulatedDirtyBits;
      const nextBits = new Uint8Array(rowCount);
      let nextCount = 0;
      let nextMin = Number.POSITIVE_INFINITY;
      let nextMax = -1;

      const markNext = (y: number): void => {
        if (y < 0 || y >= rowCount) return;
        if (nextBits[y]) return;
        nextBits[y] = 1;
        nextCount++;
        if (y < nextMin) nextMin = y;
        if (y > nextMax) nextMax = y;
      };

      const minY = Math.max(0, accumulatedDirtyMin);
      const maxY = Math.min(rowCount - 1, accumulatedDirtyMax);
      const delta = Math.trunc(op.delta);

      for (let y = minY; y <= maxY; y++) {
        if (!bits[y]) continue;

        let nextY = y;
        if (y >= op.startY && y < op.endY) {
          if (delta > 0) {
            if (y < op.startY + delta) continue;
            nextY = y - delta;
          } else {
            const absDelta = -delta;
            if (y >= op.endY - absDelta) continue;
            nextY = y + absDelta;
          }
        }

        markNext(nextY);
      }

      accumulatedDirtyBits = nextBits;
      accumulatedDirtyCount = nextCount;
      accumulatedDirtyMin = nextMin;
      accumulatedDirtyMax = nextMax;
    };

    const canMergeScrollOperations = (
      prev: TerminalScrollOperation,
      next: TerminalScrollOperation,
    ): boolean => {
      return (
        prev.startY === next.startY &&
        prev.endY === next.endY &&
        Math.sign(prev.delta) === Math.sign(next.delta)
      );
    };

    const rangesOverlap = (a: TerminalScrollOperation, b: TerminalScrollOperation): boolean =>
      a.startY < b.endY && b.startY < a.endY;

    const markScrollOperationDirty = (op: TerminalScrollOperation, rowCount: number): void => {
      markAccumulatedDirtyRange(op.startY, op.endY, rowCount);
    };

    const mergeScrollOperations = (
      next: readonly TerminalScrollOperation[] | null | undefined,
    ): void => {
      if (!next?.length || accumulatedAllRows) return;

      const rowCount = terminal.size().rows;
      ensureDirtyBits(rowCount);
      const merged = accumulatedScrollOperations ? accumulatedScrollOperations.slice() : [];

      for (const raw of next) {
        const op = normalizeAccumulatedScrollOperation(raw.startY, raw.endY, raw.delta, rowCount);
        if (!op) continue;

        const last = merged[merged.length - 1];
        if (last && canMergeScrollOperations(last, op)) {
          const combined = normalizeAccumulatedScrollOperation(
            last.startY,
            last.endY,
            last.delta + op.delta,
            rowCount,
          );

          if (combined) {
            shiftAccumulatedDirtyRowsForScrollOperation(op, rowCount);
            merged[merged.length - 1] = combined;
            continue;
          }

          // Once accumulated scroll distance covers the whole region, repaint is safer.
          merged.pop();
          markScrollOperationDirty(last, rowCount);
          markScrollOperationDirty(op, rowCount);
          continue;
        }

        const firstOverlappingIndex = merged.findIndex((prev) => rangesOverlap(prev, op));
        if (firstOverlappingIndex >= 0) {
          // Overlapping non-mergeable scrolls are order-sensitive; repaint keeps
          // the fingerprint buffer aligned with the live terminal.
          const dropped = merged.splice(firstOverlappingIndex);
          for (const prev of dropped) markScrollOperationDirty(prev, rowCount);
          markScrollOperationDirty(op, rowCount);
          continue;
        }

        shiftAccumulatedDirtyRowsForScrollOperation(op, rowCount);
        merged.push(op);
      }

      accumulatedScrollOperations = merged.length ? merged : null;
    };

    // Accumulate dirty rows for pending renders. `null/undefined/[]` means full repaint.
    if (!dirtyRows || dirtyRows.length === 0) {
      accumulatedAllRows = true;
      accumulatedDirtyBits = null;
      accumulatedDirtyCount = 0;
      accumulatedDirtyMin = Number.POSITIVE_INFINITY;
      accumulatedDirtyMax = -1;
      accumulatedScrollOperations = null;
    } else if (!accumulatedAllRows) {
      const rowCount = terminal.size().rows;
      mergeScrollOperations(scrollOperations);

      const bits = ensureDirtyBits(rowCount);
      for (let i = 0; i < dirtyRows.length; i++) {
        const y = Math.floor(dirtyRows[i] ?? -1);
        if (y < 0 || y >= rowCount) continue;
        if (!bits[y]) {
          bits[y] = 1;
          accumulatedDirtyCount++;
          if (y < accumulatedDirtyMin) accumulatedDirtyMin = y;
          if (y > accumulatedDirtyMax) accumulatedDirtyMax = y;
        }
      }
    }

    const now = Date.now();
    const elapsed = now - lastFrameTime;
    const queuedDelayMs = Math.max(0, MIN_FRAME_MS - elapsed);

    // If already pending, let the scheduled render handle accumulated rows
    // (unless this is a sync render which should flush immediately)
    if (pendingRender && !sync) {
      cliLatency?.recordStdoutQueued(queuedDelayMs);
      return;
    }

    if (sync) {
      if (pendingRender) {
        pendingRender = false;
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
      }
      const rows = buildAccumulatedRows();
      const pendingScrolls = buildAccumulatedScrollOperations();
      cliLatency?.recordStdoutQueued(0);
      doRender(rows, pendingScrolls);
      return;
    }

    if (elapsed >= MIN_FRAME_MS) {
      // Enough time has passed, render immediately
      const rows = buildAccumulatedRows();
      const pendingScrolls = buildAccumulatedScrollOperations();
      cliLatency?.recordStdoutQueued(0);
      doRender(rows, pendingScrolls);
    } else {
      // Too soon, schedule render for later
      pendingRender = true;
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        renderTimer = null;
        if (!disposed) {
          const rows = buildAccumulatedRows();
          const pendingScrolls = buildAccumulatedScrollOperations();
          doRender(rows, pendingScrolls);
        }
      }, queuedDelayMs);
      cliLatency?.recordStdoutQueued(queuedDelayMs);
    }
  }

  function installFingerprintFn(): void {
    terminal.setFingerprintFn((ch: string, style: Style) => {
      return cellFingerprint(ch, style);
    });
  }

  // Register fingerprint function on the terminal's composite buffer.
  // This enables SoA pre-computation: fingerprints are computed during composeRows()
  // and fingerprintRow() becomes a TypedArray copy instead of per-cell hash computation.
  installFingerprintFn();

  // Initial setup - these are one-time writes, not part of render loop
  if (altScreen && out.isTTY) out.write("\u001B[?1049h");
  if (hideCursor) out.write("\u001B[?25l");
  if (clear) {
    out.write(`${SGR_RESET}${openBg(defaultBg)}\u001B[2J\u001B[H${SGR_RESET}`);
  }

  const off = terminal.on("commit", ({ dirtyRows, scrollOperations, sync }) => {
    if (isDebugEnabled()) {
      getDebugLog().render(
        `Commit event: dirtyRows=${dirtyRows?.length ?? "null"}, rows=${dirtyRows?.join(",") ?? "all"}${scrollOperations?.length ? `, scrollOps=${scrollOperations.map((op) => `${op.startY}-${op.endY - 1}:${op.delta}`).join("|")}` : ""}${sync ? " (sync)" : ""}`,
      );
    }
    render(dirtyRows, sync, scrollOperations);
  });

  const resizeSource: any = (options?.output as any) ?? process.stdout;
  const canTrackResize = Boolean(
    trackResize && out.isTTY && typeof resizeSource?.on === "function",
  );
  const onResize = () => {
    const cols = Number(resizeSource?.columns);
    const rows = Number(resizeSource?.rows);
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
    const size = terminal.size();
    if (cols === size.cols && rows === size.rows) return;
    terminal.resize(cols, rows);
    // Force a full render after resize to avoid stale rows.
    render();
  };
  if (canTrackResize) {
    try {
      resizeSource.on("resize", onResize);
      onResize();
    } catch {
      // ignore
    }
  }

  // Initial paint.
  render();

  /** Move terminal cursor to specified cell position (1-based ANSI coordinates) */
  function setCursor(x: number, y: number): void {
    if (disposed) return;
    const size = terminal.size();
    const { x: cx, y: cy } = clampCellToViewport(
      { cellX: x, cellY: y },
      { cols: size.cols, rows: size.rows },
    );
    // ANSI cursor position is 1-based: ESC [ row ; col H
    out.write(`\u001B[${cy + 1};${cx + 1}H`);
    lastCursorX = cx;
    lastCursorY = cy;
  }

  /** Show or hide the terminal cursor */
  function showCursor(visible: boolean): void {
    if (disposed) return;
    out.write(visible ? "\u001B[?25h" : "\u001B[?25l");
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }
    accumulatedAllRows = false;
    accumulatedDirtyBits = null;
    accumulatedDirtyCount = 0;
    accumulatedDirtyMin = Number.POSITIVE_INFINITY;
    accumulatedDirtyMax = -1;
    off();
    if (canTrackResize && typeof resizeSource?.off === "function") {
      try {
        resizeSource.off("resize", onResize);
      } catch {
        // ignore
      }
    } else if (canTrackResize && typeof resizeSource?.removeListener === "function") {
      try {
        resizeSource.removeListener("resize", onResize);
      } catch {
        // ignore
      }
    }
    if (hideCursor) out.write("\u001B[?25h");
    if (altScreen && out.isTTY) out.write("\u001B[?1049l");
    profiler?.dispose();
  }

  const updateTheme = (
    next: Readonly<{
      defaultBg?: string | null;
      palette?: ThemePalette | null;
    }>,
  ): void => {
    if (disposed) return;
    if ("defaultBg" in next) {
      const nextBg =
        next.defaultBg === null
          ? undefined
          : next.defaultBg === "transparent"
            ? undefined
            : next.defaultBg;
      if (nextBg !== defaultBg) defaultBg = nextBg;
    }
    if ("palette" in next) palette = next.palette ?? null;
    styleKeyCache = new WeakMap<Style, number>();
    // Reset dynamic color indices so theme changes get fresh slots. The color
    // index uses 8 bits: built-in ANSI colors occupy 1-16, dynamic colors use
    // 17-255. Resetting avoids stale cache entries and fingerprint collisions
    // after theme/palette changes.
    for (const key of Object.keys(COLOR_INDEX)) {
      if (!(key in BUILTIN_COLOR_INDEX)) delete COLOR_INDEX[key];
    }
    nextColorIdx = 17;
    installFingerprintFn();
    fpRows = 0;
    fpPrevValid = false;
    prevOverlayBlockedRows = [];
    prevOverlayPartialRows = [];
    render();
  };

  return {
    capabilities: STDOUT_RENDERER_CAPABILITIES,
    render,
    dispose,
    setCursor,
    showCursor,
    updateTheme,
  };
}
