import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  TAgentTerminalGraphic,
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  detectTerminalGraphicsCapabilities,
  isTerminalGraphicsProtocol,
  isSafeTerminalGraphicsSequence,
  normalizeTerminalGraphicSize,
  sanitizeTerminalFallbackText,
  validateTerminalGraphicFrame,
  validateTerminalGraphicsPayload,
  type TAgentTerminalGraphicRenderer,
} from "../src/agent.js";
import { createStdoutRenderer, createTerminalApp, type CliOutput } from "../src/cli.js";

const ESC = "\x1B";
const BEL = "\x07";
const ST = `${ESC}\\`;

function rowText(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

async function settle(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    app.scheduler.flushNow();
  }
}

function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const keys = Object.keys(env);
  const prev = new Map<string, string | undefined>();
  for (const key of keys) {
    prev.set(key, process.env[key]);
    const value = env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const key of keys) {
      const value = prev.get(key);
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("terminal graphics capability detection", () => {
  it("uses graphics protocols only when tty and not blocked by ci or tmux", () => {
    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1" },
      }),
    ).toMatchObject({ protocol: "kitty", supported: true });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: false,
        env: { KITTY_WINDOW_ID: "1" },
      }),
    ).toMatchObject({
      protocol: "unicode",
      supported: false,
      reason: "stdout-is-not-tty",
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1", CI: "1" },
      }),
    ).toMatchObject({ protocol: "unicode", supported: false, reason: "ci" });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1", TMUX: "/tmp/tmux" },
      }),
    ).toMatchObject({
      protocol: "unicode",
      supported: false,
      reason: "tmux-without-passthrough",
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: {
          KITTY_WINDOW_ID: "1",
          TMUX: "/tmp/tmux",
          VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH: "1",
        },
      }).protocol,
    ).toBe("kitty");

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1", ZELLIJ: "1" },
      }),
    ).toMatchObject({
      protocol: "unicode",
      supported: false,
      reason: "zellij-without-passthrough",
      multiplexer: "zellij",
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: {
          KITTY_WINDOW_ID: "1",
          ZELLIJ: "1",
          VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH: "1",
        },
      }),
    ).toMatchObject({
      protocol: "unicode",
      supported: false,
      reason: "zellij-passthrough-not-implemented",
      passthrough: false,
    });
  });

  it("supports explicit protocol override", () => {
    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { VUE_TUI_TERMINAL_GRAPHICS: "iterm2" },
      }),
    ).toMatchObject({
      protocol: "iterm2",
      supported: true,
      reason: "forced-by-env",
      forced: true,
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { VUE_TUI_TERMINAL_GRAPHICS: "off", KITTY_WINDOW_ID: "1" },
      }),
    ).toMatchObject({ protocol: "none", supported: false });
  });
});

describe("terminal graphics sequence validation", () => {
  it("accepts only known graphics protocol envelopes", () => {
    expect(isTerminalGraphicsProtocol("kitty")).toBe(true);
    expect(isTerminalGraphicsProtocol("unknown")).toBe(false);
    expect(normalizeTerminalGraphicSize(4, 2)).toEqual({ width: 4, height: 2 });
    expect(normalizeTerminalGraphicSize(200, 200)).toBeNull();

    expect(
      validateTerminalGraphicFrame({
        protocol: "kitty",
        sequence: createKittyGraphicsSequence("QUJD"),
        fallbackText: "abc",
        width: 4,
        height: 2,
      })?.protocol,
    ).toBe("kitty");

    expect(
      validateTerminalGraphicFrame({
        protocol: "iterm2",
        sequence: createIterm2InlineImageSequence("QUJD", { width: 4, height: 2 }),
        fallbackText: "abc",
        width: 4,
        height: 2,
      })?.protocol,
    ).toBe("iterm2");

    expect(
      validateTerminalGraphicFrame({
        protocol: "sixel",
        sequence: `${ESC}Pq"1;1;4;2#0!4~${ST}`,
        fallbackText: "abc",
        width: 4,
        height: 2,
      })?.protocol,
    ).toBe("sixel");

    expect(
      validateTerminalGraphicFrame({
        protocol: "unknown" as any,
        sequence: `${ESC}Pq"1;1;4;2#0!4~${ST}`,
        fallbackText: "abc",
        width: 4,
        height: 2,
      }),
    ).toBeNull();
  });

  it("rejects unrelated terminal control sequences and sanitizes fallback", () => {
    expect(
      validateTerminalGraphicFrame({
        protocol: "iterm2",
        sequence: `${ESC}]52;c;QUJD${BEL}`,
        fallbackText: "clipboard attack",
        width: 4,
        height: 2,
      }),
    ).toBeNull();

    expect(
      validateTerminalGraphicFrame({
        protocol: "kitty",
        sequence: `${ESC}[2J`,
        fallbackText: "screen clear",
        width: 4,
        height: 2,
      }),
    ).toBeNull();

    expect(sanitizeTerminalFallbackText(`ok${ESC}[2J${ESC}]52;c;bad${BEL}`)).toBe("ok");
  });

  it("chunks kitty payloads and validates only graphics envelopes", () => {
    const sequence = createKittyGraphicsSequence("A".repeat(9000), {
      columns: 20,
      rows: 5,
    });

    expect(sequence).toContain("a=T");
    expect(sequence).toContain("f=100");
    expect(sequence).toContain("q=2");
    expect(sequence).toContain("C=1");
    expect(sequence).toContain("c=20");
    expect(sequence).toContain("r=5");
    expect(sequence).toContain("m=1");
    expect(sequence).toContain("m=0");
    expect(isSafeTerminalGraphicsSequence(sequence, "kitty")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(`${sequence}${ESC}]52;c;QUJD${BEL}`, "kitty")).toBe(
      false,
    );
  });

  it("creates safe kitty delete sequences", () => {
    const sequence = createKittyDeleteGraphicsSequence({ currentCell: true });

    expect(sequence).toContain("a=d");
    expect(sequence).toContain("d=c");
    expect(isSafeTerminalGraphicsSequence(sequence, "kitty", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(sequence, "kitty", "clear")).toBe(true);
  });

  it("requires iTerm2 inline images and rejects iTerm2 clear payloads", () => {
    const data = "QUJD";
    const inline = createIterm2InlineImageSequence(data, { width: 4, height: 2 });
    const download = `${ESC}]1337;File=name=test:${data}${BEL}`;

    expect(isSafeTerminalGraphicsSequence(inline, "iterm2", "draw")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(download, "iterm2", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(inline, "iterm2", "clear")).toBe(false);
  });

  it("rejects kitty clear payloads as draw payloads", () => {
    const draw = createKittyGraphicsSequence("QUJD");
    const clear = createKittyDeleteGraphicsSequence({ currentCell: true });

    expect(isSafeTerminalGraphicsSequence(draw, "kitty", "draw")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(clear, "kitty", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(clear, "kitty", "clear")).toBe(true);
  });

  it("validates terminal graphics payloads against capabilities", () => {
    const capabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });

    expect(
      validateTerminalGraphicsPayload(
        {
          id: "g1",
          x: 0,
          y: 0,
          protocol: "kitty",
          sequence: createKittyGraphicsSequence("QUJD"),
        },
        capabilities,
      ),
    ).toBe(true);

    expect(
      validateTerminalGraphicsPayload(
        {
          id: "g1",
          x: 0,
          y: 0,
          protocol: "iterm2",
          sequence: createIterm2InlineImageSequence("QUJD"),
        },
        capabilities,
      ),
    ).toBe(false);

    expect(
      validateTerminalGraphicsPayload(
        {
          id: "g1",
          x: 0,
          y: 0,
          protocol: "unknown" as any,
          sequence: `${ESC}Pq"1;1;4;2#0!4~${ST}`,
        },
        detectTerminalGraphicsCapabilities({
          stdoutIsTTY: true,
          env: { VUE_TUI_TERMINAL_GRAPHICS: "sixel" },
        }),
      ),
    ).toBe(false);
  });
});

describe("TAgentTerminalGraphic security fallback", () => {
  it("treats bare string renderer results as text, not raw terminal graphics", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const rawSequence = createKittyGraphicsSequence("QUJD");
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => rawSequence);
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 10,
            h: 1,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const stdout = withEnv({ KITTY_WINDOW_ID: "1", CI: undefined, TMUX: undefined }, () =>
      createStdoutRenderer(app.terminal, {
        output,
        clear: false,
        altScreen: false,
        hideCursor: false,
        trackResize: false,
      }),
    );

    writes.length = 0;
    app.mount();
    await settle(app);

    expect(rowText(app, 0)).toBe("fallback");
    expect(writes.join("")).not.toContain(rawSequence);

    stdout.dispose();
    app.dispose();
  });

  it("renders sanitized fallback instead of invalid raw sequences", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      sequence: `${ESC}]52;c;QUJD${BEL}`,
      fallback: `ok${ESC}]52;c;bad${BEL}`,
    }));
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 10,
            h: 1,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const stdout = withEnv({ KITTY_WINDOW_ID: "1", CI: undefined, TMUX: undefined }, () =>
      createStdoutRenderer(app.terminal, {
        output,
        clear: false,
        altScreen: false,
        hideCursor: false,
        trackResize: false,
      }),
    );

    writes.length = 0;
    app.mount();
    await settle(app);

    expect(rowText(app, 0)).toBe("ok");
    expect(writes.join("")).not.toContain("]52");

    stdout.dispose();
    app.dispose();
  });
});
