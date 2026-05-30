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

function mountRow(
  text: string,
  options: Readonly<{
    cols?: number;
    isTTY?: boolean;
    columnDiff?: boolean | "auto";
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
        columnDiff: true,
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

  it("can force full dirty-row rendering with columnDiff: false", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const middle = " unchanged middle should be repainted by explicit opt-out ";
      const percentX = 2 + middle.length;
      const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
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

  it("can force column diffs in conservative TTY mode with columnDiff: true", () => {
    withTerminalEnv(
      {
        KITTY_WINDOW_ID: "test",
        TERM_PROGRAM: "kitty",
        TERM: "xterm-kitty",
      },
      () => {
        const middle = " unchanged middle should not be written when forced ";
        const percentX = 2 + middle.length;
        const { terminal, output, renderer } = mountRow(`⠋ ${middle}10%`, {
          isTTY: true,
          columnDiff: true,
        });

        terminal.put(0, 0, "⠙");
        terminal.write("11%", { x: percentX, y: 0 });
        terminal.commit({ sync: true });

        const frame = output.take();

        expect(frame).toContain("\x1B[1;1H");
        expect(frame).toContain(`\x1B[1;${percentX + 1}H`);
        expect(frame).toContain("⠙");
        expect(frame).toContain("11%");
        expect(frame).not.toContain("unchanged middle should not be written");

        renderer.dispose();
        terminal.dispose();
      },
    );
  });

  it("falls back to full row when changed spans are too fragmented", () => {
    withTerminalEnv({ TERM_PROGRAM: "iTerm.app", TERM: "xterm-256color" }, () => {
      const unchangedMiddle = " full row fallback keeps unchanged words visible ";
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
