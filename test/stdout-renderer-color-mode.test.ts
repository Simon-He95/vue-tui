import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminal } from "../src/index.js";
import { detectTerminalColorCapability, rgbToAnsi256 } from "../src/core.js";
import { createStdoutRenderer } from "../src/cli.js";

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

  it("uses custom palettes for ansi names in truecolor output", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const cap = createCapture(false);
    createStdoutRenderer(terminal, {
      output: cap.output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "truecolor",
      palette: {
        red: "#112233",
        blue: "#445566",
      },
    });

    terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
    terminal.commit();

    const out = cap.getOut();
    expect(out).toContain("\u001B[38;2;17;34;51m");
    expect(out).toContain("\u001B[48;2;68;85;102m");
  });

  it("uses custom palettes for ansi names in ansi256 output", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const cap = createCapture(false);
    createStdoutRenderer(terminal, {
      output: cap.output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi256",
      palette: {
        red: "#112233",
        blue: "#445566",
      },
    });

    terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
    terminal.commit();

    const out = cap.getOut();
    expect(out).toContain(`\u001B[38;5;${rgbToAnsi256({ r: 17, g: 34, b: 51 })}m`);
    expect(out).toContain(`\u001B[48;5;${rgbToAnsi256({ r: 68, g: 85, b: 102 })}m`);
    expect(out).not.toContain("\u001B[38;2;");
    expect(out).not.toContain("\u001B[48;2;");
  });

  it("keeps ansi16 and ansi8 named-color output independent from custom palettes", () => {
    const cases = [
      {
        colorMode: "ansi16" as const,
        fg: "redBright",
        bg: "blueBright",
        fgOpen: "\u001B[91m",
        bgOpen: "\u001B[104m",
      },
      {
        colorMode: "ansi8" as const,
        fg: "redBright",
        bg: "blueBright",
        fgOpen: "\u001B[31m",
        bgOpen: "\u001B[44m",
      },
    ];

    for (const c of cases) {
      const terminal = createTerminal({ cols: 3, rows: 1 });
      const cap = createCapture(false);
      createStdoutRenderer(terminal, {
        output: cap.output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: c.colorMode,
        palette: {
          redBright: "#112233",
          blueBright: "#445566",
        },
      });

      terminal.put(0, 0, "X", { fg: c.fg, bg: c.bg });
      terminal.commit();

      const out = cap.getOut();
      expect(out).toContain(c.fgOpen);
      expect(out).toContain(c.bgOpen);
      expect(out).not.toContain("\u001B[38;2;");
      expect(out).not.toContain("\u001B[48;2;");
      expect(out).not.toContain("\u001B[38;5;");
      expect(out).not.toContain("\u001B[48;5;");
    }
  });

  it("updates custom palettes without recreating the stdout renderer", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const cap = createCapture(false);
    const renderer = createStdoutRenderer(terminal, {
      output: cap.output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "truecolor",
      palette: {
        red: "#112233",
      },
    });

    terminal.put(0, 0, "X", { fg: "red" });
    terminal.commit();
    expect(cap.getOut()).toContain("\u001B[38;2;17;34;51m");

    renderer.updateTheme?.({
      palette: {
        red: "#010203",
      },
    });

    expect(cap.getOut()).toContain("\u001B[38;2;1;2;3m");
    renderer.dispose();
  });

  it("resets to the built-in palette when updateTheme receives undefined palette", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const cap = createCapture(false);
    const renderer = createStdoutRenderer(terminal, {
      output: cap.output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "truecolor",
      palette: {
        red: "#112233",
      },
    });

    terminal.put(0, 0, "X", { fg: "red" });
    terminal.commit();
    expect(cap.getOut()).toContain("\u001B[38;2;17;34;51m");

    const beforeResetLength = cap.getOut().length;
    renderer.updateTheme?.({ palette: undefined });
    const resetOut = cap.getOut().slice(beforeResetLength);
    expect(resetOut).toContain("\u001B[38;2;201;27;0m");
    renderer.dispose();
  });

  it("falls back to default output for unknown color names", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const cap = createCapture(false);
    createStdoutRenderer(terminal, {
      output: cap.output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "truecolor",
    });

    terminal.put(0, 0, "X", { fg: "unknown" as any });
    terminal.commit();

    const out = cap.getOut();
    expect(out).toContain("X");
    expect(out).not.toContain("\u001B[38;2;");
    expect(out).not.toContain("\u001B[38;5;");
  });

  it("does not emit invalid SGR for unknown color names in downgraded color modes", () => {
    for (const colorMode of ["ansi256", "ansi16", "ansi8"] as const) {
      const terminal = createTerminal({ cols: 3, rows: 1 });
      const cap = createCapture(false);
      createStdoutRenderer(terminal, {
        output: cap.output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode,
      });

      terminal.put(0, 0, "X", { fg: "unknown" as any, bg: "missing" as any });
      terminal.commit();

      const out = cap.getOut();
      expect(out).toContain("X");
      expect(out).not.toContain("undefined");
      expect(out).not.toContain("\u001B[38;2;");
      expect(out).not.toContain("\u001B[48;2;");
      expect(out).not.toContain("\u001B[38;5;");
      expect(out).not.toContain("\u001B[48;5;");
    }
  });

  it("does not mutate caller palette objects", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const cap = createCapture(false);
    const palette = {
      red: "#112233",
      blue: "#445566",
    };
    const snapshot = { ...palette };
    const renderer = createStdoutRenderer(terminal, {
      output: cap.output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "truecolor",
      palette,
    });

    terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
    terminal.commit();
    renderer.updateTheme?.({ palette });

    expect(palette).toEqual(snapshot);
    renderer.dispose();
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
