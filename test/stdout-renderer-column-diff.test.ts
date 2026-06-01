import { describe, expect, it } from "vitest";
import { charCellWidth } from "../src/core.js";
import { createTerminal, scrollPlaneRows } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
import { getStdoutRendererMetrics } from "../src/renderer/cli/stdout-metrics.js";
import type { CliOutput } from "../src/renderer/cli/stdout-renderer.js";

type BufferedOutput = CliOutput & {
  take: () => string;
  clear: () => void;
};

const TERMINAL_ENV_KEYS = [
  "GHOSTTY_RESOURCES_DIR",
  "KITTY_WINDOW_ID",
  "ALACRITTY_WINDOW_ID",
  "ALACRITTY_LOG",
  "WEZTERM_PANE",
  "WEZTERM_EXECUTABLE",
  "TERM_PROGRAM",
  "TERM",
  "VSCODE_PID",
  "VSCODE_IPC_HOOK_CLI",
  "VUE_TUI_DIRTY_ROW_PATCH_MODE",
  "DIMCODE_TUI_DIRTY_ROW_RENDER_MODE",
  "DIMCODE_TUI_DIRTY_ROW_PATCH_MODE",
  "VUE_TUI_DIRTY_SPAN_MAX_CELLS",
  "DIMCODE_TUI_DIRTY_SPAN_MAX_CELLS",
] as const;

function withTerminalEnv<T>(
  next: Partial<Record<(typeof TERMINAL_ENV_KEYS)[number], string | undefined>>,
  fn: () => T,
): T {
  const prev: Partial<Record<(typeof TERMINAL_ENV_KEYS)[number], string | undefined>> = {};

  for (const key of TERMINAL_ENV_KEYS) {
    prev[key] = process.env[key];
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(next)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const key of TERMINAL_ENV_KEYS) {
      const value = prev[key];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createBufferedOutput(isTTY = false): BufferedOutput {
  const chunks: string[] = [];

  return {
    isTTY,
    write(chunk: string) {
      chunks.push(String(chunk));
    },
    take() {
      const out = chunks.join("");
      chunks.length = 0;
      return out;
    },
    clear() {
      chunks.length = 0;
    },
  };
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

type TestScreen = {
  cols: number;
  rows: number;
  cells: string[][];
  x: number;
  y: number;
};

function createTestScreen(cols: number, rows: number): TestScreen {
  return {
    cols,
    rows,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => " ")),
    x: 0,
    y: 0,
  };
}

function screenLine(screen: TestScreen, y: number): string {
  return screen.cells[y]!.join("");
}

type TestGraphemeSegment = { segment: string };
type TestGraphemeSegmenter = { segment(input: string): Iterable<TestGraphemeSegment> };
type TestIntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: Readonly<{ granularity?: "grapheme" }>,
  ) => TestGraphemeSegmenter;
};

const graphemeSegmenter = (() => {
  try {
    const Segmenter =
      typeof Intl !== "undefined" ? (Intl as TestIntlWithSegmenter).Segmenter : undefined;
    return Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null;
  } catch {
    return null;
  }
})();

function nextGrapheme(input: string, start: number): string {
  if (graphemeSegmenter) {
    const iterator = graphemeSegmenter.segment(input.slice(start))[Symbol.iterator]();
    const next = iterator.next();

    if (!next.done && next.value?.segment) {
      return next.value.segment;
    }
  }

  return Array.from(input.slice(start))[0] ?? input[start] ?? "";
}

function applyAnsiFrame(screen: TestScreen, frame: string): void {
  let i = 0;

  const clampCursor = () => {
    screen.x = Math.max(0, Math.min(screen.cols - 1, screen.x));
    screen.y = Math.max(0, Math.min(screen.rows - 1, screen.y));
  };

  while (i < frame.length) {
    const ch = frame[i]!;

    if (ch === "\x1B") {
      // CSI
      if (frame[i + 1] === "[") {
        let j = i + 2;
        while (j < frame.length) {
          const code = frame.charCodeAt(j);
          if (code >= 0x40 && code <= 0x7e) break;
          j++;
        }

        const final = frame[j];
        const params = frame.slice(i + 2, j);

        if (final === "H") {
          const [rowRaw, colRaw] = params.split(";");
          const row = Math.max(1, Number(rowRaw || 1));
          const col = Math.max(1, Number(colRaw || 1));
          screen.y = row - 1;
          screen.x = col - 1;
          clampCursor();
        } else if (final === "K") {
          for (let x = screen.x; x < screen.cols; x++) {
            screen.cells[screen.y]![x] = " ";
          }
        } else if (final === "J") {
          for (let y = screen.y; y < screen.rows; y++) {
            const startX = y === screen.y ? screen.x : 0;
            for (let x = startX; x < screen.cols; x++) {
              screen.cells[y]![x] = " ";
            }
          }
        }

        i = j + 1;
        continue;
      }

      // OSC 8 hyperlink or other OSC: skip until BEL/ST.
      if (frame[i + 1] === "]") {
        let j = i + 2;
        while (j < frame.length && frame[j] !== "\x07") {
          if (frame[j] === "\x1B" && frame[j + 1] === "\\") {
            j += 2;
            break;
          }
          j++;
        }
        i = j + 1;
        continue;
      }
    }

    if (ch === "\r") {
      screen.x = 0;
      i++;
      continue;
    }

    // Skip common C0 controls.
    if (ch < " ") {
      i++;
      continue;
    }

    const grapheme = nextGrapheme(frame, i);
    const width = Math.max(1, charCellWidth(grapheme));

    screen.cells[screen.y]![screen.x] = grapheme;
    for (let fillX = screen.x + 1; fillX < Math.min(screen.cols, screen.x + width); fillX++) {
      screen.cells[screen.y]![fillX] = " ";
    }

    screen.x += width;
    if (screen.x >= screen.cols) {
      screen.x = screen.cols - 1;
    }

    i += grapheme.length;
  }
}

function mountRow(
  text: string,
  options: Readonly<{
    cols?: number;
    isTTY?: boolean;
    columnDiff?: boolean | "auto";
    dirtyRowPatchMode?: "auto" | "row" | "span";
    dirtySpanConservativeMaxCells?: number;
  }> = {},
) {
  const cols = options.cols ?? 120;
  const terminal = createTerminal({ cols, rows: 1 });
  const output = createBufferedOutput(options.isTTY ?? false);
  const renderer = createStdoutRenderer(terminal, {
    output,
    clear: false,
    hideCursor: false,
    altScreen: false,
    useSyncOutput: false,
    ...(options.columnDiff !== undefined ? { columnDiff: options.columnDiff } : {}),
    ...(options.dirtyRowPatchMode !== undefined
      ? { dirtyRowPatchMode: options.dirtyRowPatchMode }
      : {}),
    ...(options.dirtySpanConservativeMaxCells !== undefined
      ? { dirtySpanConservativeMaxCells: options.dirtySpanConservativeMaxCells }
      : {}),
  });

  terminal.write(text, { x: 0, y: 0 });
  terminal.commit({ sync: true });

  const initialFrame = output.take();

  return {
    terminal,
    output,
    renderer,
    initialFrame,
  };
}

const inverseStyle = "\x1B[7m";

describe("stdout renderer column diff", () => {
  it("patches only the spinner cell when the trailing label is unchanged", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("⠋ Installing dependencies...", {
        cols: 40,
        dirtyRowPatchMode: "span",
      });

      output.clear();

      terminal.write("⠙", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain("⠙");
      expect(frame).not.toContain("Installing dependencies");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not treat an ordinary blank after ASCII text as a previous wide-glyph continuation", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("A       ", {
        cols: 8,
        dirtyRowPatchMode: "span",
      });

      output.clear();

      terminal.write("Z", { x: 1, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;2H");
      expect(frame).toContain("Z");
      expect(frame).not.toContain("\x1B[1;1HAZ");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("rejects invalid runtime dirtyRowPatchMode values", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 40, rows: 1 });
      const output = createBufferedOutput(false);

      expect(() =>
        createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          useSyncOutput: false,
          dirtyRowPatchMode: "cell" as any,
        }),
      ).toThrow(/Invalid dirtyRowPatchMode=.*auto.*row.*span/);

      terminal.dispose();
    });
  });

  it("rejects invalid runtime dirtySpanConservativeMaxCells values", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 40, rows: 1 });
      const output = createBufferedOutput(false);

      expect(() =>
        createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          useSyncOutput: false,
          dirtySpanConservativeMaxCells: 0,
        }),
      ).toThrow(/Invalid dirtySpanConservativeMaxCells=.*positive finite number/);

      terminal.dispose();
    });
  });

  it("releases renderer-owned fingerprint function on dispose", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 20, rows: 1 });
      const output = createBufferedOutput(false);
      const installed: unknown[] = [];
      const originalSetFingerprintFn = terminal.setFingerprintFn!.bind(terminal);

      (terminal as any).setFingerprintFn = (fn: unknown) => {
        installed.push(fn);
        return originalSetFingerprintFn(fn as any);
      };

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      expect(installed.some((fn) => typeof fn === "function")).toBe(true);

      renderer.dispose();

      expect(installed[installed.length - 1]).toBe(null);

      terminal.dispose();
    });
  });

  it("does not let a second stdout renderer override an active renderer fingerprint provider", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 20, rows: 1 });
      const outputA = createBufferedOutput(false);
      const outputB = createBufferedOutput(false);
      const installed: unknown[] = [];
      const originalSetFingerprintFn = terminal.setFingerprintFn!.bind(terminal);

      (terminal as any).setFingerprintFn = (fn: unknown) => {
        installed.push(fn);
        return originalSetFingerprintFn(fn as any);
      };

      const rendererA = createStdoutRenderer(terminal, {
        output: outputA,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });
      const rendererB = createStdoutRenderer(terminal, {
        output: outputB,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      expect(installed.filter((fn) => typeof fn === "function")).toHaveLength(1);

      rendererB.dispose();
      expect(installed[installed.length - 1]).not.toBe(null);

      rendererA.dispose();
      expect(installed[installed.length - 1]).toBe(null);

      terminal.dispose();
    });
  });

  it("falls back when a Terminal-like implementation does not expose fingerprint hooks", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 20, rows: 1 });
      delete (terminal as any).setFingerprintFn;
      delete (terminal as any).getRowFingerprints;

      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal as any, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      output.clear();
      terminal.write("abc", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      expect(output.take()).toContain("abc");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("still uses row-internal spans when fingerprint hooks are missing", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 80, rows: 1 });

      terminal.write("A static suffix that must not be rewritten", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      delete (terminal as any).setFingerprintFn;
      delete (terminal as any).getRowFingerprints;

      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal as any, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      output.take();

      terminal.put(0, 0, "B");
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain("B");
      expect(frame).not.toContain("static suffix that must not be rewritten");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("lets a secondary stdout renderer acquire fingerprints after the owner is disposed", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 20, rows: 1 });
      const outputA = createBufferedOutput(false);
      const outputB = createBufferedOutput(false);
      const installed: unknown[] = [];
      const originalSetFingerprintFn = terminal.setFingerprintFn!.bind(terminal);

      (terminal as any).setFingerprintFn = (fn: unknown) => {
        installed.push(fn);
        return originalSetFingerprintFn(fn as any);
      };

      const rendererA = createStdoutRenderer(terminal, {
        output: outputA,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });
      const rendererB = createStdoutRenderer(terminal, {
        output: outputB,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      expect(installed.filter((fn) => typeof fn === "function")).toHaveLength(1);

      rendererA.dispose();
      outputB.clear();

      terminal.put(0, 0, "x");
      terminal.commit({ sync: true });

      expect(installed[installed.length - 1]).toEqual(expect.any(Function));
      expect(outputB.take()).toContain("x");

      rendererB.dispose();
      terminal.dispose();
    });
  });

  it("records frame metrics using UTF-8 byte length", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 8, rows: 1 });
      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      output.clear();
      terminal.write("⠋ 好", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(getStdoutRendererMetrics().lastFrameBytes).toBe(byteLength(frame));

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("keeps OSC8 links enabled for custom outputs that omit isTTY", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 80, rows: 1 });
      const chunks: string[] = [];
      const output: CliOutput & { take: () => string } = {
        write(chunk: string) {
          chunks.push(String(chunk));
        },
        take() {
          const out = chunks.join("");
          chunks.length = 0;
          return out;
        },
      };

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      output.take();

      terminal.write("link", {
        x: 0,
        y: 0,
        style: { href: "https://example.com" },
      });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B]8;;https://example.com\x07");
      expect(frame).toContain("\x1B]8;;\x07");
      expect(frame).toContain("link");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("updates only spinner cell when the text is unchanged", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const staticText = " Installing dependencies from cache";
      const { terminal, output, renderer, initialFrame } = mountRow(`⠋${staticText}`, {
        columnDiff: true,
      });

      terminal.put(0, 0, "⠙");
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain("⠙");
      expect(frame).not.toContain("Installing dependencies");
      expect(byteLength(frame)).toBeLessThan(byteLength(initialFrame) * 0.4);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("updates only the text span when the spinner is unchanged", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("⠋ Installing", {
        cols: 80,
        dirtyRowPatchMode: "span",
      });

      terminal.write("Building  ", { x: 2, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;3H");
      expect(frame).toContain("Building");
      expect(frame).not.toContain("⠋");
      expect(frame).not.toContain("Installing");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("updates two distant changed regions without rewriting the unchanged middle", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const middle = " building package with a deliberately long unchanged middle segment ";
      const percentX = 2 + middle.length;
      const cols = percentX + 8;

      const { terminal, output, renderer, initialFrame } = mountRow(`⠋ ${middle}10%`, {
        cols,
        dirtyRowPatchMode: "span",
      });
      const screen = createTestScreen(cols, 1);
      applyAnsiFrame(screen, initialFrame);

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();
      applyAnsiFrame(screen, frame);

      expect(screenLine(screen, 0)).toBe(`⠙ ${middle}11%`.padEnd(cols));
      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain(`\x1B[1;${percentX + 2}H1`);
      expect(frame).toContain("⠙");
      expect(frame).not.toContain("11%");
      expect(frame).not.toContain("deliberately long unchanged middle segment");
      expect(byteLength(frame)).toBeLessThan(90);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("keeps repeated distant same-row updates under the byte budget", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      const middle = " building package with a deliberately long unchanged middle segment ".repeat(
        2,
      );
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}000%`, {
        cols: percentX + 8,
        dirtyRowPatchMode: "span",
      });

      let totalBytes = 0;

      for (let i = 0; i < 200; i++) {
        terminal.put(0, 0, spinnerFrames[i % spinnerFrames.length]!);
        terminal.write(`${String(i % 1000).padStart(3, "0")}%`, {
          x: percentX,
          y: 0,
        });
        terminal.commit({ sync: true });

        const frame = output.take();
        totalBytes += byteLength(frame);

        expect(frame).not.toContain("deliberately long unchanged middle segment");
      }

      expect(totalBytes).toBeLessThan(18_000);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not skip a changed cell that collided under the old 10-bit char fingerprint", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const oldChar = "A";
      const newChar = String.fromCharCode(oldChar.charCodeAt(0) + 1024);

      expect(oldChar.charCodeAt(0) & 0x3ff).toBe(newChar.charCodeAt(0) & 0x3ff);

      const terminal = createTerminal({ cols: 20, rows: 1 });
      terminal.write(`${oldChar} static text`, { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      output.take();

      terminal.put(0, 0, newChar);
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain(newChar);
      expect(frame).not.toContain("static text");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not skip multi-codepoint grapheme changes with the same first code point", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      // Build the family emoji without literal hidden ZWJ characters in source.
      const man = "\u{1F468}";
      const woman = "\u{1F469}";
      const girl = "\u{1F467}";
      const boy = "\u{1F466}";
      const oldGrapheme = [man, woman, girl, boy].join("\u200D");
      const newGrapheme = [man, man, girl, boy].join("\u200D");

      expect(oldGrapheme.codePointAt(0)).toBe(newGrapheme.codePointAt(0));
      expect(oldGrapheme).not.toBe(newGrapheme);

      const { terminal, output, renderer, initialFrame } = mountRow(
        `${oldGrapheme} static text that must not be rewritten`,
        {
          cols: 80,
          dirtyRowPatchMode: "span",
        },
      );

      const screen = createTestScreen(80, 1);
      applyAnsiFrame(screen, initialFrame);

      terminal.put(0, 0, newGrapheme);
      terminal.commit({ sync: true });

      const frame = output.take();
      applyAnsiFrame(screen, frame);

      expect(frame).toContain(newGrapheme);
      expect(frame).not.toContain("static text that must not be rewritten");
      expect(screenLine(screen, 0)).toContain(newGrapheme);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("detects style-only changes after many dynamic colors", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 260;
      const terminal = createTerminal({ cols, rows: 1 });
      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        colorMode: "truecolor",
        dirtyRowPatchMode: "span",
      });

      for (let x = 0; x < cols; x++) {
        terminal.put(x, 0, "x", {
          fg: `#${(x + 1).toString(16).padStart(6, "0")}`,
        });
      }

      terminal.commit({ sync: true });
      output.take();

      terminal.put(cols - 1, 0, "x", { fg: "#abcdef" });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;260H");
      expect(frame).toContain("\x1B[38;2;171;205;239m");
      expect(frame).toContain("x");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("re-emits OSC8 when only href identity changes", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 80, rows: 1 });
      const output = createBufferedOutput(true);

      terminal.write("link", {
        x: 0,
        y: 0,
        style: { href: "https://a.example" },
      });

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      output.take();

      terminal.write("link", {
        x: 0,
        y: 0,
        style: { href: "https://b.example" },
      });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B]8;;https://b.example\x07");
      expect(frame).not.toContain("https://a.example");
      expect(frame).toContain("link");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("renders inserted rows after explicit scroll operations with column diff enabled", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 40, rows: 4 });
      const output = createBufferedOutput(true);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      terminal.write("row 0", { x: 0, y: 0 });
      terminal.write("row 1", { x: 0, y: 1 });
      terminal.write("row 2", { x: 0, y: 2 });
      terminal.write("row 3", { x: 0, y: 3 });
      terminal.commit({ sync: true });
      output.take();

      scrollPlaneRows(terminal, "default", 0, 4, 1);
      terminal.write("inserted", { x: 0, y: 3 });
      terminal.commit({ planes: ["default"], sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;4r");
      expect(frame).toContain("\x1B[1S");
      expect(frame).toContain("inserted");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("keeps explicit scroll operations when dirtyRows is empty", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 8, rows: 4 });
      const output = createBufferedOutput(true);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      terminal.write("row0", { x: 0, y: 0 });
      terminal.write("row1", { x: 0, y: 1 });
      terminal.write("row2", { x: 0, y: 2 });
      terminal.write("row3", { x: 0, y: 3 });
      terminal.commit({ sync: true });
      output.take();

      scrollPlaneRows(terminal, "default", 0, 4, 1);
      output.clear();
      (renderer as any).render([], true, [{ startY: 0, endY: 4, delta: 1 }]);

      const frame = output.take();

      expect(frame).toContain("\x1B[1;4r");
      expect(frame).toContain("\x1B[4;1H");
      expect(frame).toContain("\x1B[1S");
      expect(frame).not.toContain("row0");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("closes OSC8 hyperlinks before cursor jumps between non-contiguous spans", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const linkA = "https://example.com/a";
      const linkB = "https://example.com/b";
      const styleA = { href: linkA };
      const styleB = { href: linkB };
      const terminal = createTerminal({ cols: 40, rows: 1 });
      const output = createBufferedOutput(true);

      terminal.put(0, 0, "a", styleA);
      terminal.put(20, 0, "b", styleB);
      terminal.commit({ sync: true });

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      output.clear();

      terminal.put(0, 0, "A", styleA);
      terminal.put(20, 0, "B", styleB);
      terminal.commit({ sync: true });

      const frame = output.take();
      const closeIndex = frame.indexOf("\x1B]8;;\x07");
      const secondCursorIndex = frame.indexOf("\x1B[1;21H");

      expect(frame).toContain("A");
      expect(frame).toContain("B");
      expect(secondCursorIndex).toBeGreaterThan(-1);
      expect(closeIndex).toBeGreaterThan(-1);
      expect(closeIndex).toBeLessThan(secondCursorIndex);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("clears stale tail without rewriting unchanged prefix", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 80, rows: 1 });
      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      terminal.write("⠙ Installing dependencies and building cache", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      output.take();

      terminal.clear(2, 0, 78, 1);
      terminal.write("Done", { x: 2, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;3H");
      expect(frame).toContain("Done");
      expect(frame).toContain("\x1B[K");
      expect(frame).not.toContain("⠙");
      expect(frame).not.toContain("Installing dependencies");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("clears stale tail without rewriting unchanged middle text", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle that must not be rewritten after the patch ";
      const terminal = createTerminal({ cols: 120, rows: 1 });
      const output = createBufferedOutput(false);

      terminal.write(`⠙ ${middle}Installing dependencies`, { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      output.take();

      const suffixX = 2 + middle.length;
      terminal.clear(suffixX, 0, 80, 1);
      terminal.write("Done", { x: suffixX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain(`\x1B[1;${suffixX + 1}H`);
      expect(frame).toContain("Done");
      expect(frame).toContain("\x1B[K");
      expect(frame).not.toContain("unchanged middle that must not be rewritten");
      expect(frame).not.toContain("Installing dependencies");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not fall back to a full row when long text becomes short", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const longText = "Installing dependencies and building cache from remote registry";
      const { terminal, output, renderer } = mountRow(`⠙ ${longText}`, {
        cols: 100,
        columnDiff: true,
      });

      terminal.clear(2, 0, longText.length, 1);
      terminal.write("Done", { x: 2, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;3H");
      expect(frame).toContain("Done");
      expect(frame).toContain("\x1B[K");

      // The default-blank tail should be compacted into ESC[K before fallback
      // coverage is evaluated. A full-row fallback would rewrite the unchanged
      // spinner/prefix and emit many more bytes.
      expect(frame).not.toContain("⠙");
      expect(frame).not.toContain("Installing");
      expect(frame).not.toContain("dependencies");
      expect(frame).not.toContain("remote registry");
      expect(byteLength(frame)).toBeLessThan(80);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("repaints a shortened text tail as a row on conservative TTYs when coverage is large", () => {
    withTerminalEnv(
      {
        WEZTERM_PANE: "1",
        TERM_PROGRAM: "WezTerm",
        TERM: "xterm-256color",
      },
      () => {
        const longText = "Installing dependencies and building cache from remote registry";
        const { terminal, output, renderer } = mountRow(`⠙ ${longText}`, {
          cols: 100,
          isTTY: true,
        });

        terminal.clear(2, 0, longText.length, 1);
        terminal.write("Done", { x: 2, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("\x1B[1;1H");
        expect(frame).toContain("⠙");
        expect(frame).toContain("Done");
        expect(frame).not.toContain("\x1B[K");
        expect(frame).not.toContain("Installing");
        expect(frame).not.toContain("remote registry");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("honors conservative max coverage when tail clear is painted instead of ESC[K", () => {
    withTerminalEnv(
      {
        WEZTERM_PANE: "1",
        TERM_PROGRAM: "WezTerm",
        TERM: "xterm-256color",
      },
      () => {
        const longText = "Installing dependencies and building cache from remote registry";
        const { terminal, output, renderer } = mountRow(`⠙ ${longText}`, {
          cols: 100,
          isTTY: true,
          dirtySpanConservativeMaxCells: 1,
        });

        terminal.clear(2, 0, longText.length, 1);
        terminal.write("Done", { x: 2, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("\x1B[1;1H");
        expect(frame).toContain("⠙");
        expect(frame).toContain("Done");
        expect(frame).not.toContain("\x1B[K");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("does not clear styled blank cells on the right when text shrinks", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 80, rows: 1 });
      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      terminal.write("⠙ Installing dependencies", { x: 0, y: 0 });
      terminal.fill(40, 0, 6, 1, " ", { bg: "cyan" });
      terminal.write("old-tail", { x: 50, y: 0 });
      terminal.commit({ sync: true });

      output.take();

      terminal.clear(2, 0, 28, 1);
      terminal.write("Done", { x: 2, y: 0 });
      terminal.clear(50, 0, 8, 1);
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("Done");
      expect(frame).not.toContain("\x1B[1;7H\x1B[K");
      expect(frame).toContain("\x1B[1;47H");
      expect(frame).toContain("\x1B[K");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not clear styled trailing blank cells when text shrinks", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 32, rows: 1 });
      const output = createBufferedOutput(false);

      terminal.fill(0, 0, 16, 1, " ", { bg: "blue" });
      terminal.write("Loading...", { x: 0, y: 0, style: { bg: "blue" } });

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      output.take();

      terminal.fill(0, 0, 16, 1, " ", { bg: "blue" });
      terminal.write("OK", { x: 0, y: 0, style: { bg: "blue" } });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("OK");
      expect(frame).not.toContain("\x1B[1;3H\x1B[K");
      expect(frame).toMatch(/OK\s{2,}/);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("clears only after a styled blank tail", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("prefixXXXXXXXX", {
        cols: 24,
        columnDiff: true,
      });

      output.take();

      terminal.clear(6, 0, 18, 1);
      terminal.fill(6, 0, 4, 1, " ", { inverse: true });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;7H");
      expect(frame).toContain(inverseStyle);
      expect(frame).toContain("\x1B[1;11H");
      expect(frame).toContain("\x1B[K");
      expect(frame).not.toContain("\x1B[1;7H\x1B[K");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not clear stable right-side content when middle text shortens", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const prefix = "⠙ ";
      const oldMiddle = "Installing dependencies";
      const right = "  10%";
      const rightX = prefix.length + oldMiddle.length;
      const { terminal, output, renderer } = mountRow(`${prefix}${oldMiddle}${right}`, {
        cols: 80,
        columnDiff: true,
      });

      terminal.clear(prefix.length, 0, oldMiddle.length, 1);
      terminal.write("Done", { x: prefix.length, y: 0 });
      terminal.write(right, { x: rightX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("Done");
      expect(frame).not.toContain(oldMiddle);

      // Right-side content is unchanged, so the diff may leave it untouched
      // rather than rewriting "10%". It must not clear from after "Done",
      // because that would erase the stable right-side status on a real terminal.
      expect(frame).not.toContain("\x1B[K");
      expect(frame).not.toContain("\x1B[1;7H\x1B[K");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("falls back to one contiguous patch when many tiny spans would be more expensive", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 120;
      const base = Array.from({ length: cols }, (_, index) => (index % 2 === 0 ? "a" : " ")).join(
        "",
      );

      const { terminal, output, renderer } = mountRow(base, { cols, isTTY: false });

      // Create many tiny distant changes. Multi-span would require many cursor
      // moves; contiguous span should win.
      for (let x = 0; x < 40; x += 4) {
        terminal.put(x, 0, "b");
      }

      terminal.commit({ sync: true });
      const frame = output.take();

      const cursorMoves = frame.match(/\x1B\[\d+;\d+H/g) ?? [];

      expect(cursorMoves.length).toBeLessThanOrEqual(2);
      expect(frame).toContain("b");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("expands changed spans to whole wide glyphs", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("界 static text", {
        columnDiff: true,
      });

      terminal.put(0, 0, "語");
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain("語");
      expect(frame).not.toContain("static text");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("expands patches that start immediately after a previous wide glyph", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("界X static text", {
        columnDiff: true,
      });

      terminal.put(2, 0, "Y");
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain("界");
      expect(frame).toContain("Y");
      expect(frame).not.toContain("static text");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not move the tail clear one column past the viewport", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 8;
      const { terminal, output, renderer } = mountRow("ABCDEFGH", {
        cols,
        columnDiff: true,
      });

      terminal.write("abc", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("abc");
      expect(frame).not.toContain(`\x1B[1;${cols + 1}H`);
      expect(frame).not.toContain("\x1B[K");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not emit an out-of-bounds cursor move when clearing at row end", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 10;
      const terminal = createTerminal({ cols, rows: 1 });
      const output = createBufferedOutput(false);

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      terminal.write("abcdefghi", { x: 0, y: 0 });
      terminal.commit({ sync: true });
      output.take();

      terminal.write("abcdefghij", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).not.toContain("\x1B[1;11H");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not emit an out-of-bounds cursor fix for a wide emoji at the right edge", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 4;
      const { terminal, output, renderer } = mountRow("ab😀", {
        cols,
        columnDiff: true,
      });

      terminal.put(2, 0, "😃");
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("😃");
      expect(frame).not.toContain(`\x1B[1;${cols + 1}H`);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("skips output for dirty rows whose cells still match the previous frame", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("stable row", {
        columnDiff: true,
      });

      (renderer as any).render([0], true);

      expect(output.take()).toBe("");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("treats an empty dirty-row render as a no-op", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("stable row", {
        columnDiff: true,
      });

      (renderer as any).render([], true);

      expect(output.take()).toBe("");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not promote invalid dirty rows into a full repaint", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("stable row", {
        dirtyRowPatchMode: "span",
      });

      (renderer as any).render([-1, 999, Number.NaN], true);

      expect(output.take()).toBe("");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("treats missing cells in short renderer rows as viewport blanks", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 8;
      const terminal = createTerminal({ cols, rows: 1 });
      terminal.write("abcdefgh", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const originalGetRow = terminal.getRow.bind(terminal);
      const originalGetRowFingerprints = terminal.getRowFingerprints!.bind(terminal);
      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      output.take();

      (terminal as any).getRow = (y: number) => originalGetRow(y).slice(0, 3);
      (terminal as any).getRowFingerprints = () => null;

      terminal.clear(3, 0, cols - 3, 1);
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;4H\x1B[K");
      expect(frame).not.toContain(`\x1B[1;${cols + 1}H`);

      (terminal as any).getRow = originalGetRow;
      (terminal as any).getRowFingerprints = originalGetRowFingerprints;
      renderer.dispose();
      terminal.dispose();
    });
  });

  it("closes active OSC 8 links before clearing stale linked tails", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 32;
      const href = "https://example.com/status";
      const terminal = createTerminal({ cols, rows: 1 });
      const output = createBufferedOutput(true);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      terminal.write("Linked stale tail", { x: 0, y: 0, style: { href } });
      terminal.commit({ sync: true });

      output.take();

      terminal.clear(0, 0, cols, 1);
      terminal.write("Done", { x: 0, y: 0, style: { href } });
      terminal.commit({ sync: true });

      const frame = output.take();
      const doneIndex = frame.indexOf("Done");
      const closeIndex = frame.indexOf("\x1B]8;;\x07");
      const clearIndex = frame.indexOf("\x1B[K");

      expect(doneIndex).toBeGreaterThanOrEqual(0);
      expect(closeIndex).toBeGreaterThan(doneIndex);
      expect(clearIndex).toBeGreaterThan(closeIndex);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not clear styled blank cells when a shorter text leaves a meaningful styled tail", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 48;
      const terminal = createTerminal({ cols, rows: 2 });
      const output = createBufferedOutput(false);

      terminal.write("Wait", { x: 0, y: 0 });
      terminal.write("stale", { x: 26, y: 0 });
      terminal.commit({ sync: true });

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        columnDiff: true,
      });

      const initialFrame = output.take();
      const screen = createTestScreen(cols, 2);
      applyAnsiFrame(screen, initialFrame);

      terminal.batch(() => {
        terminal.clear(0, 0, cols, 1);
        terminal.write("Done", { x: 0, y: 0 });

        // These cells are visually meaningful even though the character is " ".
        // A character-only tail detector would skip this span and then ESC[K it away.
        terminal.fill(20, 0, 6, 1, " ", { bg: "red" });
      });

      terminal.commit({ sync: true });

      const frame = output.take();
      applyAnsiFrame(screen, frame);

      expect(screenLine(screen, 0)).toBe("Done".padEnd(cols));
      expect(frame).toContain("Done");

      // The styled blank region must be rendered as its own span.
      // x=20 is ANSI column 21.
      expect(frame).toContain("\x1B[1;21H");

      // The renderer may still clear after the styled region, but it must not clear
      // immediately after "Done". ANSI column 5 would mean "clear right after Done",
      // which would erase the styled blank span at col 21.
      expect(frame).not.toContain("\x1B[1;5H\x1B[K");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not clear styled trailing blanks with ESC[K", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 32;
      const terminal = createTerminal({ cols, rows: 1 });

      terminal.write("Loading", { x: 0, y: 0 });
      terminal.fill(8, 0, 8, 1, " ", { bg: "green" });

      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      const initialFrame = output.take();
      const screen = createTestScreen(cols, 1);
      applyAnsiFrame(screen, initialFrame);

      terminal.clear(0, 0, 7, 1);
      terminal.write("Done", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();
      applyAnsiFrame(screen, frame);

      // The styled blank block must be rendered as cells, not erased with EOL clear.
      // A raw ESC[K before/inside the styled blank area is suspicious here.
      expect(screenLine(screen, 0)).toBe("Done".padEnd(cols));
      expect(frame).toContain("Done");
      const styledBlankStart = frame.search(/\x1B\[[0-9;:]*m {8}/);
      const clearIndex = frame.indexOf("\x1B[K");
      expect(styledBlankStart).toBeGreaterThanOrEqual(0);
      expect(clearIndex === -1 || clearIndex > styledBlankStart).toBe(true);
      expect(frame).not.toMatch(/\x1B\[[0-9;]*K$/);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("preserves styled blank tails instead of replacing them with a default ESC[K clear", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("loading something long", {
        cols: 40,
        columnDiff: true,
      });

      terminal.clear(0, 0, 40, 1);
      terminal.fill(0, 0, 6, 1, " ", { bg: "blue" });
      terminal.commit({ sync: true });

      const frame = output.take();

      // Regression: a naive tail clear would emit ESC[K without painting the six
      // styled blanks, causing the blue background to disappear.
      expect(frame).toContain("      ");
      expect(frame).toContain("\x1B[1;7H");
      expect(frame).toContain("\x1B[K");
      expect(frame).not.toContain("loading something");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not move the cursor past the right edge when the rewritten row fills the terminal", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 6;
      const { terminal, output, renderer } = mountRow("abcdef", { cols, columnDiff: true });

      terminal.clear(0, 0, cols, 1);
      terminal.fill(0, 0, cols, 1, " ", { bg: "blue" });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("      ");
      expect(frame).not.toContain(`\x1B[1;${cols + 1}H`);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("falls back to full-row span after resize fingerprint width changes", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("abc", { cols: 3, columnDiff: true });

      terminal.resize(8, 1);
      terminal.write("abc def", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("abc def");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("honors dirtyRowPatchMode=row by repainting the dirty row", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle should be repainted ";
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
        cols: percentX + 8,
        dirtyRowPatchMode: "row",
      });

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("⠙");
      expect(frame).toContain("11%");
      expect(frame).toContain("unchanged middle should be repainted");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("honors columnDiff=false by repainting the dirty row", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle should be repainted ";
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
        cols: percentX + 8,
        columnDiff: false,
      });

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("⠙");
      expect(frame).toContain("11%");
      expect(frame).toContain("unchanged middle should be repainted");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("lets explicit columnDiff=true override dirty-row env row fallback", () => {
    withTerminalEnv(
      {
        VUE_TUI_DIRTY_ROW_PATCH_MODE: "row",
        TERM_PROGRAM: "iTerm.app",
        TERM: "xterm-256color",
      },
      () => {
        const middle = " explicit columnDiff should win over env ";
        const percentX = 2 + middle.length;
        const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
          cols: percentX + 8,
          columnDiff: true,
        });

        terminal.put(0, 0, "⠙");
        terminal.write("11%", { x: percentX, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("⠙");
        expect(frame).toContain(`\x1B[1;${percentX + 2}H1`);
        expect(frame).not.toContain("11%");
        expect(frame).not.toContain("explicit columnDiff should win over env");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("lets explicit columnDiff=false override dirty-row env span fallback", () => {
    withTerminalEnv(
      {
        VUE_TUI_DIRTY_ROW_PATCH_MODE: "span",
        TERM_PROGRAM: "iTerm.app",
        TERM: "xterm-256color",
      },
      () => {
        const middle = " explicit columnDiff false should repaint row ";
        const percentX = 2 + middle.length;
        const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
          cols: percentX + 8,
          columnDiff: false,
        });

        terminal.put(0, 0, "⠙");
        terminal.write("11%", { x: percentX, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("⠙");
        expect(frame).toContain("11%");
        expect(frame).toContain("explicit columnDiff false should repaint row");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("honors env dirty-row row fallback", () => {
    withTerminalEnv(
      {
        VUE_TUI_DIRTY_ROW_PATCH_MODE: "row",
        WEZTERM_PANE: "1",
        TERM_PROGRAM: "WezTerm",
        TERM: "xterm-256color",
      },
      () => {
        const middle = " unchanged middle should be repainted by env fallback ";
        const percentX = 2 + middle.length;
        const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
          cols: percentX + 8,
          isTTY: true,
        });

        terminal.put(0, 0, "⠙");
        terminal.write("11%", { x: percentX, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("⠙");
        expect(frame).toContain("11%");
        expect(frame).toContain("unchanged middle should be repainted by env fallback");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("uses the first valid dirty-row env mode across aliases", () => {
    withTerminalEnv(
      {
        VUE_TUI_DIRTY_ROW_PATCH_MODE: "invalid",
        DIMCODE_TUI_DIRTY_ROW_RENDER_MODE: "row",
        TERM_PROGRAM: "iTerm.app",
        TERM: "xterm-256color",
      },
      () => {
        const middle = " unchanged middle should be repainted by valid legacy env ";
        const percentX = 2 + middle.length;
        const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
          cols: percentX + 8,
        });

        terminal.put(0, 0, "⠙");
        terminal.write("11%", { x: percentX, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("⠙");
        expect(frame).toContain("11%");
        expect(frame).toContain("unchanged middle should be repainted by valid legacy env");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("uses auto columnDiff spans on known-sensitive TTYs", () => {
    withTerminalEnv({ WEZTERM_PANE: "1", TERM_PROGRAM: "WezTerm", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle should not be repainted in auto ";
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
        cols: percentX + 8,
        isTTY: true,
        columnDiff: "auto",
      });

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("⠙");
      expect(frame).toContain(`\x1B[1;${percentX + 2}H1`);
      expect(frame).not.toContain("11%");
      expect(frame).not.toContain("unchanged middle should not be repainted in auto");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("falls back to full rows when conservative auto spans exceed the max coverage", () => {
    withTerminalEnv({ WEZTERM_PANE: "1", TERM_PROGRAM: "WezTerm", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle should be repainted past conservative max ";
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
        cols: percentX + 8,
        isTTY: true,
        dirtySpanConservativeMaxCells: 1,
      });

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("⠙");
      expect(frame).toContain("11%");
      expect(frame).toContain("unchanged middle should be repainted past conservative max");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("allows dirtyRowPatchMode=span to override conservative TTY detection", () => {
    withTerminalEnv({ WEZTERM_PANE: "1", TERM_PROGRAM: "WezTerm", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle must not be written when span mode is forced ";
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
        cols: percentX + 8,
        isTTY: true,
        dirtyRowPatchMode: "span",
      });

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("⠙");
      expect(frame).toContain(`\x1B[1;${percentX + 2}H1`);
      expect(frame).not.toContain("11%");
      expect(frame).not.toContain("unchanged middle must not be written when span mode is forced");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("allows columnDiff=true to override conservative TTY detection", () => {
    withTerminalEnv({ WEZTERM_PANE: "1", TERM_PROGRAM: "WezTerm", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle must not be written when forced ";
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
        cols: percentX + 8,
        isTTY: true,
        columnDiff: true,
      });

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("⠙");
      expect(frame).toContain(`\x1B[1;${percentX + 2}H1`);
      expect(frame).not.toContain("11%");
      expect(frame).not.toContain("unchanged middle must not be written when forced");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("coalesces many clustered spans into one bounded patch instead of repainting the row", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 200;
      const indices = [0, 4, 8, 12, 16, 20, 24, 28, 32];
      const chars = Array.from("a".repeat(cols));
      chars.fill("z", 40, 80);
      const initial = chars.join("");
      const { terminal, output, renderer } = mountRow(initial, {
        cols,
        dirtyRowPatchMode: "span",
      });

      for (const [index, x] of indices.entries()) {
        terminal.put(x, 0, String.fromCharCode("A".charCodeAt(0) + index));
      }
      terminal.commit({ sync: true });

      const frame = output.take();
      const cursorMoves = frame.match(/\x1B\[\d+;\d+H/g) ?? [];

      expect(cursorMoves).toEqual(["\x1B[1;1H"]);
      expect(frame).toContain("AaaaBaaaCaaaDaaaEaaaFaaaGaaaHaaaI");
      expect(frame).not.toContain("z".repeat(40));
      expect(byteLength(frame)).toBeLessThan(80);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("lets the cost model coalesce two nearby spans into one bounded patch", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("abcdefghijklmnopqrstuvwxyz", {
        cols: 80,
        dirtyRowPatchMode: "span",
      });

      terminal.put(0, 0, "A");
      terminal.put(4, 0, "E");
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain("AbcdE");
      expect(frame).not.toContain("\x1B[1;5H");
      expect(frame).not.toContain("fghijklmnopqrstuvwxyz");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("keeps CJK-separated spans split when contiguous text would cost more bytes", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const middle = "一二三四五六七";
      const secondX = 1 + Array.from(middle).reduce((width, ch) => width + charCellWidth(ch), 0);
      const { terminal, output, renderer } = mountRow(`a${middle}b`, {
        cols: 40,
        dirtyRowPatchMode: "span",
      });

      terminal.put(0, 0, "A");
      terminal.put(secondX, 0, "B");
      terminal.commit({ sync: true });

      const frame = output.take();
      const secondCursorX = secondX - 2;

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain(`\x1B[1;${secondCursorX + 1}H`);
      expect(frame).toContain("A");
      expect(frame).toContain("七B");
      expect(frame).not.toContain("一二三四五六");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("falls back to one contiguous span when changed spans are too fragmented", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const unchangedMiddle = " contiguous span fallback keeps unchanged words visible ";
      const indices = [0, 60, 64, 68, 72, 76, 80, 84, 88];
      const chars = Array.from("a".repeat(120));
      for (let i = 0; i < unchangedMiddle.length; i++) {
        chars[4 + i] = unchangedMiddle[i]!;
      }
      for (const [index, x] of indices.entries()) {
        chars[x] = String.fromCharCode("b".charCodeAt(0) + index);
      }
      const initial = chars.join("");
      const { terminal, output, renderer } = mountRow(initial, {
        cols: 120,
        columnDiff: true,
      });

      for (const [index, x] of indices.entries()) {
        terminal.put(x, 0, String.fromCharCode("K".charCodeAt(0) + index));
      }
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("K");
      expect(frame).toContain(unchangedMiddle.trim());

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("falls back to full row when fragmented spans would cost more than repainting the row", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const cols = 24;
      const { terminal, output, renderer, initialFrame } = mountRow("abcdefghijklmnopqrstuvwx", {
        cols,
        dirtyRowPatchMode: "span",
      });

      const screen = createTestScreen(cols, 1);
      applyAnsiFrame(screen, initialFrame);

      terminal.put(0, 0, "A");
      terminal.put(5, 0, "F");
      terminal.put(10, 0, "K");
      terminal.put(15, 0, "P");
      terminal.put(20, 0, "U");
      terminal.commit({ sync: true });

      const frame = output.take();
      applyAnsiFrame(screen, frame);

      expect(screenLine(screen, 0)).toBe("AbcdeFghijKlmnoPqrstUvwx");
      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain("AbcdeFghijKlmnoPqrstUvwx");

      const cursorMoves = [...frame.matchAll(/\x1B\[\d+;\d+H/g)].length;
      expect(cursorMoves).toBeLessThanOrEqual(1);

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("uses dirty spans in conservative TTY auto mode", () => {
    withTerminalEnv(
      {
        WEZTERM_PANE: "test",
        TERM_PROGRAM: "WezTerm",
        TERM: "xterm-256color",
      },
      () => {
        const middle = " unchanged middle should not be repainted in conservative mode ";
        const percentX = 2 + middle.length;
        const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
          isTTY: true,
        });

        terminal.put(0, 0, "⠙");
        terminal.write("11%", { x: percentX, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("⠙");
        expect(frame).toContain(`\x1B[1;${percentX + 2}H1`);
        expect(frame).not.toContain("11%");
        expect(frame).not.toContain("unchanged middle should not be repainted");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("does not treat output without isTTY as a real terminal for conservative fallback", () => {
    withTerminalEnv(
      {
        WEZTERM_PANE: "test",
        TERM_PROGRAM: "WezTerm",
        TERM: "xterm-256color",
      },
      () => {
        const chunks: string[] = [];
        const output = {
          write(chunk: string) {
            chunks.push(String(chunk));
          },
        };
        const terminal = createTerminal({ cols: 120, rows: 1 });
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          useSyncOutput: false,
        });
        const middle = " unchanged middle should not be repainted ";
        const percentX = 2 + middle.length;

        terminal.write(`⠋ ${middle}10%`, { x: 0, y: 0 });
        terminal.commit({ sync: true });

        chunks.length = 0;

        terminal.put(0, 0, "⠙");
        terminal.write("11%", { x: percentX, y: 0 });
        terminal.commit({ sync: true });

        const frame = chunks.join("");

        expect(frame).toContain("⠙");
        expect(frame).toContain(`\x1B[1;${percentX + 2}H1`);
        expect(frame).not.toContain("11%");
        expect(frame).not.toContain("unchanged middle should not be repainted");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("does not advance the stdout diff baseline when a frame write fails", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const terminal = createTerminal({ cols: 16, rows: 1 });
      const chunks: string[] = [];
      let failWrites = false;

      const output: CliOutput & { take: () => string; clear: () => void } = {
        write(chunk: string) {
          if (failWrites) throw new Error("write boom");
          chunks.push(String(chunk));
        },
        take() {
          const out = chunks.join("");
          chunks.length = 0;
          return out;
        },
        clear() {
          chunks.length = 0;
        },
      };

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: "span",
      });

      try {
        terminal.write("abcdef", { x: 0, y: 0 });
        terminal.commit({ sync: true });
        output.take();

        failWrites = true;
        terminal.put(0, 0, "X");
        expect(() => terminal.commit({ sync: true })).toThrow("write boom");

        failWrites = false;
        output.clear();
        terminal.put(1, 0, "Y");
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("X");
        expect(frame).toContain("Y");
        expect(frame).not.toContain("cdef");
      } finally {
        renderer.dispose();
        terminal.dispose();
      }
    });
  });
});
