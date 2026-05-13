import type { TerminalColorLevel, TerminalColorMode } from "./colors.js";

export type TerminalColorCapability = Readonly<{
  mode: TerminalColorMode;
  level: TerminalColorLevel;
}>;

function parseColorMode(raw: unknown): TerminalColorMode | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v) return null;
  if (v === "truecolor" || v === "24bit" || v === "rgb") return "truecolor";
  if (v === "ansi256" || v === "256" || v === "xterm256" || v === "xterm-256color") {
    return "ansi256";
  }
  if (v === "ansi16" || v === "16") return "ansi16";
  if (v === "ansi8" || v === "8") return "ansi8";
  return null;
}

function levelForMode(mode: TerminalColorMode): TerminalColorLevel {
  if (mode === "ansi8") return 8;
  if (mode === "ansi16") return 16;
  // Treat truecolor as ">=256" for theme purposes.
  return 256;
}

/**
 * Detect terminal output color capability.
 *
 * - `mode` is the best-effort actual output mode.
 * - `level` is the CLI theme tier (256/16/8). `truecolor` folds into `256`.
 * - Pass `platform` (e.g. `process.platform`) to improve Windows detection.
 *
 * Env overrides:
 * - `VUE_TUI_COLOR_MODE` / legacy `DIMCODE_COLOR_MODE`
 */
export function detectTerminalColorCapability(
  opts?: Readonly<{
    env?: Record<string, unknown>;
    isTTY?: boolean;
    platform?: string;
  }>,
): TerminalColorCapability {
  const env = (opts?.env ?? {}) as Record<string, unknown>;
  const isTTY = opts?.isTTY ?? false;
  const platform = String(opts?.platform ?? "")
    .trim()
    .toLowerCase();
  const isWindows =
    platform === "win32" ||
    String(env.OS ?? "")
      .trim()
      .toLowerCase() === "windows_nt";

  const forced = parseColorMode(env.VUE_TUI_COLOR_MODE ?? env.DIMCODE_COLOR_MODE);
  if (forced) return { mode: forced, level: levelForMode(forced) };

  // Non-TTY outputs (tests, logs) should be deterministic.
  if (!isTTY) return { mode: "truecolor", level: 256 };

  const termProgram = String(env.TERM_PROGRAM ?? "").toLowerCase();
  const isAppleTerminal = termProgram.includes("apple_terminal");

  const colorterm = String(env.COLORTERM ?? "").toLowerCase();
  // Terminal.app may set COLORTERM=truecolor via shell startup scripts while not
  // reliably handling 24-bit color sequences. Avoid this false-positive and fall
  // back to TERM-based detection unless the user explicitly forces color mode.
  if (!isAppleTerminal && (colorterm.includes("truecolor") || colorterm.includes("24bit"))) {
    return { mode: "truecolor", level: 256 };
  }

  if (termProgram.includes("vscode")) return { mode: "truecolor", level: 256 };
  if (
    termProgram.includes("wezterm") ||
    termProgram.includes("alacritty") ||
    termProgram.includes("ghostty") ||
    termProgram.includes("kitty") ||
    termProgram.includes("iterm") ||
    termProgram.includes("windows terminal") ||
    termProgram.includes("windowsterminal") ||
    termProgram.includes("tabby") ||
    termProgram.includes("hyper") ||
    termProgram.includes("rio") ||
    termProgram.includes("contour")
  ) {
    return { mode: "truecolor", level: 256 };
  }

  const term = String(env.TERM ?? "").toLowerCase();
  if (isWindows) {
    const hasWindowsTerminal = "WT_SESSION" in env || "WT_PROFILE_ID" in env || "WT_ID" in env;
    const hasWezterm = "WEZTERM_EXECUTABLE" in env || "WEZTERM_PANE" in env;
    const hasAlacritty = "ALACRITTY_LOG" in env || "ALACRITTY_WINDOW_ID" in env;
    const hasTabby = "TABBY_CONFIG_DIRECTORY" in env;
    if (hasWindowsTerminal || hasWezterm || hasAlacritty || hasTabby)
      return { mode: "truecolor", level: 256 };
    if (term.includes("xterm") && term.includes("256color"))
      return { mode: "truecolor", level: 256 };
  }
  if (term.includes("256color")) return { mode: "ansi256", level: 256 };
  if (term.includes("color")) return { mode: "ansi16", level: 16 };
  if (term.includes("dumb")) return { mode: "ansi8", level: 8 };

  // Default for unknown TTYs: ANSI16 is a reasonable baseline.
  return { mode: "ansi16", level: 16 };
}
