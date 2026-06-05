import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  TAgentTerminalGraphic,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  detectTerminalGraphicsCapabilities,
  type TAgentTerminalGraphicRenderer,
} from "../src/agent.js";
import { createStdoutRenderer, createTerminalApp, type CliOutput } from "../src/cli.js";

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

    const outputText = writes.join("");
    expect(outputText).toContain(kittySequence);
    expect(rowText(app, 1)).toBe("");

    writes.length = 0;
    stdout.dispose();
    expect(writes.join("")).toContain(clearSequence);

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
  });
});
