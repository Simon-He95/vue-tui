import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
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

function mountRow(text: string, options: Readonly<{ cols?: number; isTTY?: boolean }> = {}) {
  const cols = options.cols ?? 120;
  const terminal = createTerminal({ cols, rows: 1 });
  const output = createBufferedOutput(options.isTTY ?? false);
  const renderer = createStdoutRenderer(terminal, {
    output,
    clear: false,
    hideCursor: false,
    altScreen: false,
    useSyncOutput: false,
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

describe("stdout renderer column diff", () => {
  it("updates only spinner cell when the text is unchanged", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const staticText = " Installing dependencies from cache";
      const { terminal, output, renderer, initialFrame } = mountRow(`⠋${staticText}`);

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

  it("updates distant changed cells without writing unchanged middle text", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const middle = " ".repeat(4) + "this middle must not be written" + " ".repeat(4);
      const percentX = 2 + middle.length;

      const terminal = createTerminal({ cols: percentX + 8, rows: 1 });
      const output = createBufferedOutput(false);
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
      });

      terminal.write(`⠋ ${middle}10%`, { x: 0, y: 0 });
      terminal.commit({ sync: true });

      output.take();

      terminal.put(0, 0, "⠙");
      terminal.write("11%", { x: percentX, y: 0 });
      terminal.commit({ sync: true });

      const frame = output.take();

      expect(frame).toContain("\x1B[1;1H");
      expect(frame).toContain(`\x1B[1;${percentX + 1}H`);
      expect(frame).toContain("⠙");
      expect(frame).toContain("11%");
      expect(frame).not.toContain("this middle must not be written");

      renderer.dispose();
      terminal.dispose();
    });
  });

  it("does not skip a changed cell when the 10-bit char fingerprint collides", () => {
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

  it("expands changed spans to whole wide glyphs", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const { terminal, output, renderer } = mountRow("界 static text");

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
      });

      output.take();

      terminal.batch(() => {
        terminal.clear(0, 0, cols, 1);
        terminal.write("Done", { x: 0, y: 0 });

        // These cells are visually meaningful even though the character is " ".
        // A character-only tail detector would skip this span and then ESC[K it away.
        terminal.fill(20, 0, 6, 1, " ", { bg: "red" });
      });

      terminal.commit({ sync: true });

      const frame = output.take();

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

  it("falls back to full dirty-row rendering in conservative TTY mode", () => {
    withTerminalEnv(
      {
        WEZTERM_PANE: "test",
        TERM_PROGRAM: "WezTerm",
        TERM: "xterm-256color",
      },
      () => {
        const middle = " unchanged middle should be repainted in conservative mode ";
        const percentX = 2 + middle.length;
        const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
          isTTY: true,
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
      },
    );
  });
});
