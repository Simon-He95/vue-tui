import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  TAgentTerminalGraphic,
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  detectTerminalGraphicsCapabilities,
  type TAgentTerminalGraphicRenderer,
  type TerminalGraphicsProtocol,
} from "../src/agent.js";
import { createStdoutRenderer, createTerminalApp, type CliOutput } from "../src/cli.js";

const ESC = "\x1B";
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

function flushStdout(stdout: ReturnType<typeof createStdoutRenderer>): void {
  (stdout.render as (dirtyRows?: readonly number[] | null, sync?: boolean) => void)(null, true);
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

describe("TAgentTerminalGraphic", () => {
  it("queues terminal graphics payloads through the stdout renderer", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 6,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const kittySequence = createKittyGraphicsSequence("QUJD");
    const clearSequence = createKittyDeleteGraphicsSequence({ currentCell: true });
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((_content, context) => {
      expect(context.capabilities.preferredProtocol).toBe("kitty");
      return {
        type: "sequence" as const,
        protocol: "kitty" as const,
        sequence: kittySequence,
        clearSequence,
        fallback: "fallback",
      };
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 2,
            y: 1,
            w: 8,
            h: 2,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    const stdout = withEnv(
      { KITTY_WINDOW_ID: "1", TERM_PROGRAM: "kitty", CI: undefined, TMUX: undefined },
      () =>
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
    flushStdout(stdout);

    const outputText = writes.join("");
    expect(outputText).toContain(kittySequence);
    expect(rowText(app, 1)).toBe("");

    writes.length = 0;
    stdout.dispose();
    expect(writes.join("")).toContain(clearSequence);

    app.dispose();
  });

  it.each([
    {
      protocol: "iterm2" as const,
      env: { TERM_PROGRAM: "iTerm.app" },
      sequence: createIterm2InlineImageSequence("QUJD", { width: 8, height: 2 }),
    },
    {
      protocol: "sixel" as const,
      env: { TERM: "xterm-sixel" },
      sequence: `${ESC}Pq"1;1;4;2#0!4~${ST}`,
    },
  ])("queues $protocol terminal graphics payloads through the stdout renderer", async (entry) => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 6,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((_content, context) => {
      expect(context.protocol).toBe(entry.protocol);
      expect(context.capabilities.preferredProtocol).toBe(entry.protocol);
      return {
        type: "sequence" as const,
        protocol: entry.protocol as TerminalGraphicsProtocol,
        sequence: entry.sequence,
        fallback: `${entry.protocol} fallback`,
      };
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 2,
            y: 1,
            w: 8,
            h: 2,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    const stdout = withEnv(
      {
        KITTY_WINDOW_ID: undefined,
        TERM: undefined,
        TERM_PROGRAM: undefined,
        WEZTERM_PANE: undefined,
        WEZTERM_EXECUTABLE: undefined,
        VUE_TUI_SIXEL: undefined,
        VUE_TUI_GRAPHICS_SIXEL: undefined,
        VUE_TUI_TERMINAL_GRAPHICS: undefined,
        VUE_TUI_GRAPHICS_PROTOCOL: undefined,
        VUE_TUI_GRAPHICS_FORCE: undefined,
        CI: undefined,
        TMUX: undefined,
        ...entry.env,
      },
      () =>
        createStdoutRenderer(app.terminal, {
          output,
          clear: false,
          altScreen: false,
          hideCursor: false,
          trackResize: false,
        }),
    );
    expect(stdout.graphicsCapabilities.preferredProtocol).toBe(entry.protocol);

    writes.length = 0;
    app.mount();
    await settle(app);
    flushStdout(stdout);

    expect(writes.join("")).toContain(entry.sequence);
    expect(rowText(app, 1)).toBe("");

    stdout.dispose();
    app.dispose();
  });

  it("falls back to text when no terminal graphics output is registered", async () => {
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      sequence: "<IMG>",
      fallback: "fallback",
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

    const app = createTerminalApp({ cols: 12, rows: 3, component: App });
    app.mount();
    await settle(app);

    expect(rowText(app, 0)).toBe("fallback");
    expect(renderer).toHaveBeenCalledWith(
      "image.png",
      expect.objectContaining({
        capabilities: expect.objectContaining({ supported: false }),
      }),
    );

    app.dispose();
  });

  it("falls back without error style when renderer returns undefined", async () => {
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((_content, context) => {
      expect(context.protocol).toBe("unicode");
      return undefined;
    });
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
            style: { fg: "green" },
            errorStyle: { fg: "red" },
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 3, component: App });
    app.mount();
    await settle(app);

    expect(rowText(app, 0)).toBe("fallback");
    expect(app.terminal.getCell(0, 0).style.fg).toBe("green");

    app.dispose();
  });

  it("falls back with error style when renderer throws", async () => {
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => {
      throw new Error("render failed");
    });
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
            style: { fg: "green" },
            errorStyle: { fg: "red" },
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 3, component: App });
    app.mount();
    await settle(app);

    expect(rowText(app, 0)).toBe("fallback");
    expect(app.terminal.getCell(0, 0).style.fg).toBe("red");

    app.dispose();
  });

  it("detects terminal graphics capability from terminal environment", () => {
    expect(
      detectTerminalGraphicsCapabilities({
        env: { KITTY_WINDOW_ID: "1", TERM_PROGRAM: "kitty" },
        stdoutIsTTY: true,
      }).preferredProtocol,
    ).toBe("kitty");
    expect(
      detectTerminalGraphicsCapabilities({
        env: { TERM_PROGRAM: "iTerm.app" },
        stdoutIsTTY: true,
      }).preferredProtocol,
    ).toBe("iterm2");
    expect(
      detectTerminalGraphicsCapabilities({
        env: { TERM: "xterm-sixel" },
        stdoutIsTTY: true,
      }).preferredProtocol,
    ).toBe("sixel");
    expect(
      detectTerminalGraphicsCapabilities({
        env: {
          KITTY_WINDOW_ID: "1",
          TERM_PROGRAM: "WezTerm",
          WEZTERM_PANE: "1",
          VUE_TUI_SIXEL: "1",
        },
        stdoutIsTTY: true,
      }),
    ).toMatchObject({
      preferredProtocol: "kitty",
      candidates: ["kitty", "iterm2", "sixel"],
    });
  });
});
