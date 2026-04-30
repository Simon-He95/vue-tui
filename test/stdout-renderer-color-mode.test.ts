import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStdoutRenderer,
  createTerminal,
  detectTerminalColorCapability,
} from "../src/index.js";

const getFrameDelayMs = () => ("GHOSTTY_RESOURCES_DIR" in process.env ? 24 : 16);

interface Capture {
  output: { isTTY: boolean; write: (chunk: string) => void };
  getOut: () => string;
}

function createCapture(isTTY = false): Capture {
  let out = "";
  return {
    output: {
      isTTY,
      write: (chunk: string) => {
        out += chunk;
      },
    },
    getOut: () => out,
  };
}

function withEnv(key: string, value: string, fn: () => void): void {
  const prev = process.env[key];
  process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev == null) delete process.env[key];
    else process.env[key] = prev;
  }
}

afterEach(() => {
  delete process.env.DIMCODE_COLOR_MODE;
  delete process.env.VUE_TUI_COLOR_MODE;
});

describe("stdoutRenderer color mode", () => {
  it("auto mode respects DIMCODE_COLOR_MODE=truecolor", () => {
    withEnv("DIMCODE_COLOR_MODE", "truecolor", () => {
      const terminal = createTerminal({ cols: 3, rows: 1 });
      const cap = createCapture(false);
      createStdoutRenderer(terminal, {
        output: cap.output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "auto",
      });
      terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
      terminal.commit();
      expect(cap.getOut()).toContain("\u001B[38;2;");
      expect(cap.getOut()).toContain("\u001B[48;2;");
    });
  });

  it("auto mode respects DIMCODE_COLOR_MODE=ansi256 without emitting truecolor sequences", () => {
    withEnv("DIMCODE_COLOR_MODE", "ansi256", () => {
      const terminal = createTerminal({ cols: 3, rows: 1 });
      const cap = createCapture(false);
      createStdoutRenderer(terminal, {
        output: cap.output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "auto",
      });
      terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
      terminal.commit();
      expect(cap.getOut()).toContain("\u001B[38;5;");
      expect(cap.getOut()).toContain("\u001B[48;5;");
    });
  });

  it("auto mode respects DIMCODE_COLOR_MODE=ansi8 (downgrades brights)", () => {
    withEnv("DIMCODE_COLOR_MODE", "ansi8", () => {
      const terminal = createTerminal({ cols: 3, rows: 1 });
      const cap = createCapture(false);
      createStdoutRenderer(terminal, {
        output: cap.output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "auto",
      });
      terminal.put(0, 0, "X", { fg: "redBright", bg: "blueBright" });
      terminal.commit();
      const out = cap.getOut();
      expect(out).toContain("\u001B[31m");
      expect(out).toContain("\u001B[44m");
      expect(out).not.toContain("\u001B[91m");
      expect(out).not.toContain("\u001B[104m");
    });
  });

  it("auto mode respects VUE_TUI_COLOR_MODE=ansi16", () => {
    withEnv("VUE_TUI_COLOR_MODE", "ansi16", () => {
      const terminal = createTerminal({ cols: 3, rows: 1 });
      const cap = createCapture(false);
      createStdoutRenderer(terminal, {
        output: cap.output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "auto",
      });
      terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
      terminal.commit();
      // ANSI16 should not emit 24-bit or 256-color SGR sequences.
      const out = cap.getOut();
      expect(out).not.toContain("\u001B[38;2;");
      expect(out).not.toContain("\u001B[48;2;");
      expect(out).not.toContain("\u001B[38;5;");
      expect(out).not.toContain("\u001B[48;5;");
    });
  });

  it("ansi16 mode downgrades hex colors to the nearest ansi colors", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const cap = createCapture(false);
    createStdoutRenderer(terminal, {
      output: cap.output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
    });
    terminal.put(0, 0, "X", { fg: "#c91b00", bg: "#0225c7" });
    terminal.commit();

    const out = cap.getOut();
    expect(out).toContain("\u001B[31m");
    expect(out).toContain("\u001B[44m");
    expect(out).not.toContain("\u001B[38;2;");
    expect(out).not.toContain("\u001B[48;2;");
    expect(out).not.toContain("\u001B[38;5;");
    expect(out).not.toContain("\u001B[48;5;");
  });

  it("auto mode respects DIMCODE_COLOR_MODE=ansi256", () => {
    withEnv("DIMCODE_COLOR_MODE", "ansi256", () => {
      const terminal = createTerminal({ cols: 3, rows: 1 });
      const cap = createCapture(false);
      createStdoutRenderer(terminal, {
        output: cap.output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "auto",
      });
      terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
      terminal.commit();
      const out = cap.getOut();
      expect(out).toContain("\u001B[38;5;");
      expect(out).toContain("\u001B[48;5;");
      expect(out).not.toContain("\u001B[38;2;");
      expect(out).not.toContain("\u001B[48;2;");
    });
  });

  it("auto mode avoids truecolor in Apple Terminal when only COLORTERM says truecolor", () => {
    withEnv("DIMCODE_COLOR_MODE", "", () => {
      withEnv("DIMCODE_COLOR_MODE", "", () => {
        withEnv("VUE_TUI_COLOR_MODE", "", () => {
          withEnv("TERM_PROGRAM", "Apple_Terminal", () => {
            withEnv("COLORTERM", "truecolor", () => {
              withEnv("TERM", "xterm-256color", () => {
                vi.useFakeTimers();
                const terminal = createTerminal({ cols: 3, rows: 1 });
                const cap = createCapture(true);
                const renderer = createStdoutRenderer(terminal, {
                  output: cap.output,
                  clear: false,
                  hideCursor: false,
                  altScreen: false,
                  colorMode: "auto",
                });
                terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
                terminal.commit();
                vi.advanceTimersByTime(getFrameDelayMs());

                const out = cap.getOut();
                expect(out).toContain("\u001B[38;5;");
                expect(out).toContain("\u001B[48;5;");
                expect(out).not.toContain("\u001B[38;2;");
                expect(out).not.toContain("\u001B[48;2;");

                renderer.dispose();
                vi.useRealTimers();
              });
            });
          });
        });
      });
    });
  });

  it("auto mode still uses truecolor when explicitly forced in Apple Terminal", () => {
    withEnv("DIMCODE_COLOR_MODE", "truecolor", () => {
      withEnv("TERM_PROGRAM", "Apple_Terminal", () => {
        withEnv("COLORTERM", "truecolor", () => {
          withEnv("TERM", "xterm-256color", () => {
            vi.useFakeTimers();
            const terminal = createTerminal({ cols: 3, rows: 1 });
            const cap = createCapture(true);
            const renderer = createStdoutRenderer(terminal, {
              output: cap.output,
              clear: false,
              hideCursor: false,
              altScreen: false,
              colorMode: "auto",
            });
            terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
            terminal.commit();
            vi.advanceTimersByTime(getFrameDelayMs());

            const out = cap.getOut();
            expect(out).toContain("\u001B[38;2;");
            expect(out).toContain("\u001B[48;2;");

            renderer.dispose();
            vi.useRealTimers();
          });
        });
      });
    });
  });

  it("auto mode detects TERM=xterm-256color when TTY", () => {
    withEnv("DIMCODE_COLOR_MODE", "", () => {
      withEnv("VUE_TUI_COLOR_MODE", "", () => {
        withEnv("COLORTERM", "", () => {
          withEnv("TERM_PROGRAM", "", () => {
            withEnv("TERM", "xterm-256color", () => {
              vi.useFakeTimers();
              const terminal = createTerminal({ cols: 3, rows: 1 });
              const cap = createCapture(true);
              const renderer = createStdoutRenderer(terminal, {
                output: cap.output,
                clear: false,
                hideCursor: false,
                altScreen: false,
                colorMode: "auto",
              });
              terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
              terminal.commit();
              vi.advanceTimersByTime(getFrameDelayMs());

              const capability = detectTerminalColorCapability({
                env: process.env,
                isTTY: true,
                platform: process.platform,
              });
              const out = cap.getOut();
              if (capability.mode === "ansi256") {
                expect(out).toContain("\u001B[38;5;");
                expect(out).toContain("\u001B[48;5;");
              } else if (capability.mode === "truecolor") {
                expect(out).toContain("\u001B[38;2;");
                expect(out).toContain("\u001B[48;2;");
              } else {
                throw new Error(`Unexpected color mode: ${capability.mode}`);
              }

              renderer.dispose();
              vi.useRealTimers();
            });
          });
        });
      });
    });
  });
});
