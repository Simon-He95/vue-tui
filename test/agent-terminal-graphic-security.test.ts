import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  TAgentTerminalGraphic,
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  detectTerminalGraphicsCapabilities,
  type TAgentTerminalGraphicRenderer,
  type TAgentTerminalGraphicRenderResult,
} from "../src/agent.js";
import {
  isTerminalGraphicsProtocol,
  isSafeTerminalGraphicsSequence,
  normalizeTerminalGraphicSize,
  sanitizeTerminalFallbackText,
  createKittyPlacementSequence,
  validateTerminalGraphicFrame,
  validateTerminalGraphicsPayload,
} from "../src/renderer/terminal-graphics.js";
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
  it("reads process.env by default in Node", () => {
    withEnv(
      {
        KITTY_WINDOW_ID: "1",
        CI: undefined,
        TMUX: undefined,
        STY: undefined,
        ZELLIJ: undefined,
        ZELLIJ_SESSION_NAME: undefined,
        TERM: undefined,
        TERM_PROGRAM: undefined,
        VUE_TUI_TERMINAL_GRAPHICS: undefined,
        VUE_TUI_GRAPHICS_PROTOCOL: undefined,
        VUE_TUI_GRAPHICS_FORCE: undefined,
      },
      () => {
        expect(detectTerminalGraphicsCapabilities({ stdoutIsTTY: true })).toMatchObject({
          protocol: "kitty",
          supported: true,
        });
      },
    );
  });

  it("uses graphics protocols only when tty and not blocked by ci or tmux", () => {
    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1" },
      }),
    ).toMatchObject({ protocol: "kitty", supported: true });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { GHOSTTY_RESOURCES_DIR: "/Applications/Ghostty.app/Contents/Resources" },
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
        env: { KITTY_WINDOW_ID: "1", TMUX: "/tmp/tmux" },
        protocol: "kitty",
      }),
    ).toMatchObject({
      protocol: "unicode",
      supported: false,
      forced: false,
      reason: "tmux-without-passthrough",
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1", TMUX: "/tmp/tmux", VUE_TUI_TERMINAL_GRAPHICS: "kitty" },
      }),
    ).toMatchObject({
      protocol: "unicode",
      supported: false,
      forced: false,
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
      reason: "selected-by-env",
      forced: false,
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { VUE_TUI_TERMINAL_GRAPHICS: "off", KITTY_WINDOW_ID: "1" },
      }),
    ).toMatchObject({ protocol: "none", supported: false });
  });

  it("supports direct protocol and passthrough options", () => {
    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: false,
        protocol: "kitty",
        force: true,
      }),
    ).toMatchObject({
      protocol: "kitty",
      supported: true,
      forced: true,
      reason: "forced-by-option",
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1", TMUX: "/tmp/tmux" },
        passthrough: true,
        protocol: "kitty",
      }),
    ).toMatchObject({
      protocol: "kitty",
      supported: true,
      passthrough: true,
      forced: false,
      reason: "selected-by-option",
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1", TMUX: "/tmp/tmux" },
        protocol: "kitty",
        force: true,
      }),
    ).toMatchObject({
      protocol: "kitty",
      supported: true,
      passthrough: false,
      forced: true,
      reason: "forced-by-option",
    });

    expect(
      detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { KITTY_WINDOW_ID: "1" },
        protocol: "off",
      }),
    ).toMatchObject({
      protocol: "none",
      supported: false,
      reason: "disabled-by-option",
    });
  });
});

describe("terminal graphics sequence validation", () => {
  it("accepts only known graphics protocol envelopes", () => {
    expect(isTerminalGraphicsProtocol("kitty")).toBe(true);
    expect(isTerminalGraphicsProtocol("unknown")).toBe(false);
    expect(normalizeTerminalGraphicSize(4, 2)).toEqual({ width: 4, height: 2 });
    expect(normalizeTerminalGraphicSize(0, 2)).toBeNull();
    expect(normalizeTerminalGraphicSize(Number.NaN, 2)).toBeNull();
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

  it("rejects DCS payloads that are not Sixel image envelopes", () => {
    const safe = `${ESC}P?0;1;2q~${ST}`;

    expect(isSafeTerminalGraphicsSequence(safe, "sixel")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(`${ESC}P$qpayload${ST}`, "sixel")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}P+qpayload${ST}`, "sixel")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}Pabcqpayload${ST}`, "sixel")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}Pq${ST}`, "sixel")).toBe(false);
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
    expect(sanitizeTerminalFallbackText("ok\x9B2J\x9D52;c;bad\x07")).toBe("ok");
    expect(sanitizeTerminalFallbackText("ok\x90$qbad\x9C\x9Fbad\x9C")).toBe("ok");
    expect(sanitizeTerminalFallbackText("ok\x9B")).toBe("ok");
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

  it("rejects invalid kitty numeric controls", () => {
    expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,i=-1;QUJD${ST}`, "kitty")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,p=-1;QUJD${ST}`, "kitty")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,c=0;QUJD${ST}`, "kitty")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,r=-1;QUJD${ST}`, "kitty")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,c=10001;QUJD${ST}`, "kitty")).toBe(
      false,
    );
    expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,c=101,r=100;QUJD${ST}`, "kitty")).toBe(
      false,
    );
    expect(
      isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,i=4294967296;QUJD${ST}`, "kitty"),
    ).toBe(false);
    expect(
      isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,z=2147483648;QUJD${ST}`, "kitty"),
    ).toBe(false);
    expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100,z=-1;QUJD${ST}`, "kitty")).toBe(true);
  });

  it("rejects unsafe base64 input before creating public image sequences", () => {
    expect(createKittyGraphicsSequence(`QUJD${ST}${ESC}]52;c;bad${BEL}`)).toBe("");
    expect(createIterm2InlineImageSequence(`QUJD${BEL}${ESC}[2J`, { width: 4 })).toBe("");
    expect(createKittyGraphicsSequence("QUJD\n")).toContain(";QUJD");
    expect(createIterm2InlineImageSequence("QUJD\n", { width: 4 })).toContain(":QUJD");
  });

  it("rejects raw Kitty and iTerm2 payloads containing whitespace", () => {
    for (const payload of ["QUJD\r", "QUJD\n", "QUJD\t", "QUJD\f"]) {
      expect(isSafeTerminalGraphicsSequence(`${ESC}_Ga=T,f=100;${payload}${ST}`, "kitty")).toBe(
        false,
      );
      expect(
        isSafeTerminalGraphicsSequence(`${ESC}]1337;File=inline=1:${payload}${BEL}`, "iterm2"),
      ).toBe(false);
    }
  });

  it("accepts generated-image sized Kitty payloads", () => {
    const payload = "A".repeat(2_748_736);
    const sequence = createKittyGraphicsSequence(payload, { columns: 80, rows: 12 });

    expect(sequence.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(isSafeTerminalGraphicsSequence(sequence, "kitty")).toBe(true);
  });

  it("rejects raw iTerm2 sequences with empty payloads", () => {
    const sequence = `${ESC}]1337;File=inline=1:${BEL}`;

    expect(isSafeTerminalGraphicsSequence(sequence, "iterm2")).toBe(false);
    expect(
      validateTerminalGraphicFrame({
        protocol: "iterm2",
        sequence,
        fallbackText: "fallback",
        width: 4,
        height: 2,
      }),
    ).toBeNull();
  });

  it("omits invalid kitty numeric controls when creating public image sequences", () => {
    const sequence = createKittyGraphicsSequence("QUJD", {
      imageId: -1,
      imageNumber: Number.POSITIVE_INFINITY,
      placementId: -1,
      columns: 0,
      rows: -1,
      zIndex: -1,
    });

    expect(sequence).not.toContain("i=-1");
    expect(sequence).not.toContain("I=");
    expect(sequence).not.toContain("p=-1");
    expect(sequence).not.toContain("c=0");
    expect(sequence).not.toContain("r=-1");
    expect(sequence).toContain("z=-1");
    expect(isSafeTerminalGraphicsSequence(sequence, "kitty")).toBe(true);

    const oversized = createKittyGraphicsSequence("QUJD", {
      columns: 101,
      rows: 100,
    });
    expect(oversized).not.toContain("c=101");
    expect(oversized).not.toContain("r=100");
    expect(isSafeTerminalGraphicsSequence(oversized, "kitty")).toBe(true);
  });

  it("creates safe kitty source-cropped image and placement sequences", () => {
    const image = createKittyGraphicsSequence("QUJD", {
      columns: 80,
      rows: 12,
      sourceX: 2,
      sourceY: 4,
      sourceWidth: 160,
      sourceHeight: 240,
    });
    const placement = createKittyPlacementSequence({
      imageId: 123,
      placementId: 456,
      columns: 80,
      rows: 12,
      sourceX: 2,
      sourceY: 4,
      sourceWidth: 160,
      sourceHeight: 240,
    });

    expect(image).toContain("x=2");
    expect(image).toContain("y=4");
    expect(image).toContain("w=160");
    expect(image).toContain("h=240");
    expect(placement).toContain("x=2");
    expect(placement).toContain("y=4");
    expect(placement).toContain("w=160");
    expect(placement).toContain("h=240");
    expect(isSafeTerminalGraphicsSequence(image, "kitty")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(placement, "kitty")).toBe(true);
  });

  it("creates safe kitty delete sequences", () => {
    const sequence = createKittyDeleteGraphicsSequence({ currentCell: true });
    const idSequence = createKittyDeleteGraphicsSequence({ imageId: 123, placementId: 456 });

    expect(createKittyDeleteGraphicsSequence()).toBe("");
    expect(createKittyDeleteGraphicsSequence({ imageId: -1 })).toBe("");
    expect(createKittyDeleteGraphicsSequence({ imageId: 123, placementId: -1 })).toBe("");
    expect(sequence).toContain("a=d");
    expect(sequence).toContain("d=c");
    expect(idSequence).toContain("a=d");
    expect(idSequence).toContain("d=i");
    expect(idSequence).toContain("i=123");
    expect(idSequence).toContain("p=456");
    expect(isSafeTerminalGraphicsSequence(sequence, "kitty", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(sequence, "kitty", "clear")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(idSequence, "kitty", "clear")).toBe(true);
  });

  it("rejects kitty file and shared-memory transmission mediums", () => {
    const direct = `${ESC}_Ga=T,t=d,f=100;QUJD${ST}`;
    const regularFile = `${ESC}_Ga=T,t=f,f=100;L2V0Yy9wYXNzd2Q=${ST}`;
    const temporaryFile = `${ESC}_Ga=T,t=t,f=100;QUJD${ST}`;
    const sharedMemory = `${ESC}_Ga=T,t=s,f=100;QUJD${ST}`;

    expect(isSafeTerminalGraphicsSequence(direct, "kitty", "draw")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(regularFile, "kitty", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(temporaryFile, "kitty", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(sharedMemory, "kitty", "draw")).toBe(false);
  });

  it("requires iTerm2 inline images and rejects iTerm2 clear payloads", () => {
    const data = "QUJD";
    const inline = createIterm2InlineImageSequence(data, { width: 4, height: 2 });
    const download = `${ESC}]1337;File=name=test:${data}${BEL}`;

    expect(isSafeTerminalGraphicsSequence(inline, "iterm2", "draw")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(download, "iterm2", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(inline, "iterm2", "clear")).toBe(false);
  });

  it("rejects iTerm2 inline image payloads with non-whitelisted params", () => {
    const data = "QUJD";
    const safe = createIterm2InlineImageSequence(data, { width: 4, height: 2 });
    const withName = `${ESC}]1337;File=inline=1;name=evil:${data}${BEL}`;
    const withDownloadShape = `${ESC}]1337;File=inline=1;download=1:${data}${BEL}`;
    const withHugeDimension = `${ESC}]1337;File=inline=1;width=999999999:${data}${BEL}`;

    expect(isSafeTerminalGraphicsSequence(safe, "iterm2", "draw")).toBe(true);
    expect(isSafeTerminalGraphicsSequence(withName, "iterm2", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(withDownloadShape, "iterm2", "draw")).toBe(false);
    expect(isSafeTerminalGraphicsSequence(withHugeDimension, "iterm2", "draw")).toBe(false);
  });

  it("normalizes invalid iTerm2 dimensions instead of generating invalid sequences", () => {
    const invalidDimension = createIterm2InlineImageSequence("QUJD", {
      width: "1;name=evil",
      height: Number.NaN,
    });
    expect(invalidDimension).toContain("width=auto");
    expect(invalidDimension).toContain("height=auto");
    expect(isSafeTerminalGraphicsSequence(invalidDimension, "iterm2", "draw")).toBe(true);

    const hugeDimension = createIterm2InlineImageSequence("QUJD", {
      width: 9_999_999,
      height: 2,
    });
    expect(hugeDimension).toContain("width=99999");
    expect(hugeDimension).toContain("height=2");
    expect(isSafeTerminalGraphicsSequence(hugeDimension, "iterm2", "draw")).toBe(true);
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
    const multiCandidateCapabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1", TERM_PROGRAM: "iTerm.app" },
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

    expect(multiCandidateCapabilities).toMatchObject({
      preferredProtocol: "kitty",
      candidates: ["kitty", "iterm2"],
    });
    expect(
      validateTerminalGraphicsPayload(
        {
          id: "g1",
          x: 0,
          y: 0,
          protocol: "iterm2",
          sequence: createIterm2InlineImageSequence("QUJD"),
        },
        multiCandidateCapabilities,
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

    expect(
      validateTerminalGraphicsPayload(
        {
          id: "bad-clear-size",
          x: 0,
          y: 0,
          w: 0,
          h: 1,
          protocol: "kitty",
          sequence: createKittyDeleteGraphicsSequence({ currentCell: true }),
          op: "clear",
        },
        capabilities,
      ),
    ).toBe(false);

    expect(
      validateTerminalGraphicsPayload(
        {
          id: "huge-clear-size",
          x: 0,
          y: 0,
          w: 200,
          h: 200,
          protocol: "kitty",
          sequence: createKittyDeleteGraphicsSequence({ currentCell: true }),
          op: "clear",
        },
        capabilities,
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
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(
      () =>
        ({
          sequence: `${ESC}]52;c;QUJD${BEL}`,
          fallback: `ok${ESC}]52;c;bad${BEL}`,
        }) as unknown as TAgentTerminalGraphicRenderResult,
    );
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
