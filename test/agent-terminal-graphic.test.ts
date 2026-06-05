import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  TAgentTerminalGraphic,
  TText,
  createPngTerminalGraphicRenderer,
  createTerminalGraphicRenderQueue,
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  detectTerminalGraphicsCapabilities,
  getTerminalGraphicTraceMetrics,
  resetTerminalGraphicTraceMetrics,
  type TAgentTerminalGraphicRenderer,
  type TAgentTerminalGraphicRenderResult,
  type TerminalGraphicsProtocol,
} from "../src/agent.js";
import {
  createStdoutRenderer,
  createTerminalApp,
  getStdoutRendererMetrics,
  type CliOutput,
} from "../src/cli.js";
import { getTerminalGraphicsOutput } from "../src/renderer/terminal-graphics.js";
import { TVirtualRows } from "../src/vue/components/TVirtualRows.js";

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
  it("flushes terminal graphics queue operations without dirty rows", () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: false,
      columns: 20,
      rows: 6,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const app = createTerminalApp({
      cols: 20,
      rows: 6,
      component: defineComponent({ setup: () => () => null }),
    });
    const stdout = withEnv(
      {
        VUE_TUI_TERMINAL_GRAPHICS: "kitty",
        VUE_TUI_GRAPHICS_FORCE: "1",
        CI: undefined,
        TMUX: undefined,
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
    const graphics = getTerminalGraphicsOutput(app.terminal);
    const sequence = createKittyGraphicsSequence("QUJD");
    const clearSequence = createKittyDeleteGraphicsSequence({ currentCell: true });
    const before = { ...getStdoutRendererMetrics() };

    writes.length = 0;
    graphics?.queue({
      id: "g1",
      x: 1,
      y: 1,
      w: 4,
      h: 2,
      protocol: "kitty",
      sequence,
      clearSequence,
    });
    expect(writes.join("")).toContain(sequence);
    expect(getStdoutRendererMetrics().terminalGraphicsDraws).toBeGreaterThan(
      before.terminalGraphicsDraws,
    );
    expect(getStdoutRendererMetrics().terminalGraphicsBytes).toBeGreaterThan(
      before.terminalGraphicsBytes,
    );
    expect(getStdoutRendererMetrics().terminalGraphicsActive).toBe(1);

    writes.length = 0;
    graphics?.clear?.("g1");
    expect(writes.join("")).toContain(clearSequence);
    expect(getStdoutRendererMetrics().terminalGraphicsClears).toBeGreaterThan(
      before.terminalGraphicsClears,
    );
    expect(getStdoutRendererMetrics().terminalGraphicsActive).toBe(0);

    stdout.dispose();
    app.dispose();
  });

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
      expect(context.signal).toBeInstanceOf(AbortSignal);
      expect(Number.isInteger(context.imageId)).toBe(true);
      expect(Number.isInteger(context.placementId)).toBe(true);
      expect(context.visible).toBe(true);
      expect(context.rawVisible).toBe(true);
      expect(context.scrolling).toBe(false);
      expect(context.cacheKey).toBe("image-cache-key");
      expect(context.viewport).toMatchObject({
        visible: true,
        rawVisible: true,
        scrolling: false,
        rect: { x: 2, y: 1, w: 8, h: 2 },
        fullRect: { x: 2, y: 1, w: 8, h: 2 },
      });
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
            cacheKey: "image-cache-key",
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

  it("aborts superseded renderer work", async () => {
    const content = ref("first");
    const signals: AbortSignal[] = [];
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((value, context) => {
      signals.push(context.signal);
      if (value === "first") return new Promise<TAgentTerminalGraphicRenderResult>(() => undefined);
      return { type: "text" as const, text: value };
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 10,
            h: 1,
            content: content.value,
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 3, component: App });
    app.mount();
    await settle(app);

    content.value = "second";
    await settle(app);

    expect(renderer).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(rowText(app, 0)).toBe("second");

    app.dispose();
  });

  it("does not call renderer while suspended", async () => {
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      type: "text" as const,
      text: "rendered",
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
            suspended: true,
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    app.mount();
    await settle(app);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(app, 0)).toBe("fallback");

    app.dispose();
  });

  it("does not call renderer while explicit scrolling is active", async () => {
    const scrolling = ref(true);
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      type: "text" as const,
      text: "rendered",
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
            scrolling: scrolling.value,
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    app.mount();
    await settle(app);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(app, 0)).toBe("fallback");

    scrolling.value = false;
    await settle(app);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(rowText(app, 0)).toBe("rendered");

    app.dispose();
  });

  it("creates cached PNG terminal graphics renderers", async () => {
    const queue = createTerminalGraphicRenderQueue();
    const capabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });
    const toPngBase64 = vi.fn(async () => ({
      base64: "QUJD",
      fallback: "png fallback",
      cols: 4,
      rows: 2,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      queue,
      toPngBase64,
    });
    const signal = new AbortController().signal;
    const context = {
      kind: "image" as const,
      width: 4,
      height: 2,
      final: true,
      streaming: false,
      protocol: "kitty" as const,
      capabilities,
      signal,
      imageId: 123,
      placementId: 456,
      visible: true,
      rawVisible: true,
      scrolling: false,
      viewport: {
        visible: true,
        rawVisible: true,
        scrolling: false,
        rect: { x: 0, y: 0, w: 4, h: 2 },
        fullRect: { x: 0, y: 0, w: 4, h: 2 },
      },
    };

    const first = await renderer("image.png", context);
    const second = await renderer("image.png", context);

    expect(toPngBase64).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ type: "sequence", protocol: "kitty", fallback: "png fallback" });
    expect(second).toEqual(first);
    expect(queue.stats().cacheEntries).toBe(1);
  });

  it("suspends virtual row raw rendering while scrolling and hydrates after idle", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const sequence = createKittyGraphicsSequence("QUJD");
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((_content, context) => ({
      type: "sequence" as const,
      protocol: context.capabilities.preferredProtocol as "kitty",
      sequence,
      fallback: "fallback",
    }));
    const items = ["image-0", "image-1", "image-2"];
    const App = defineComponent({
      setup() {
        return () =>
          h(TVirtualRows, {
            x: 0,
            y: 0,
            w: 12,
            h: 1,
            itemCount: items.length,
            itemVersion: 1,
            terminalGraphicScrollIdleMs: 200,
            getItem: (index: number) => items[index],
            paintItem: () => undefined,
            renderItemNodes: (ctx: { item: unknown; index: number; row: number }) =>
              h(TAgentTerminalGraphic, {
                x: 0,
                y: ctx.row,
                w: 10,
                h: 1,
                content: String(ctx.item),
                fallback: `fallback-${ctx.index}`,
                renderer,
              }),
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const stdout = withEnv({ KITTY_WINDOW_ID: "1", TERM_PROGRAM: "kitty", CI: undefined }, () =>
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

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(writes.join("")).toContain(sequence);

    writes.length = 0;
    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await settle(app);
    flushStdout(stdout);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(rowText(app, 0)).toBe("fallback-1");
    expect(writes.join("")).not.toContain(sequence);

    await new Promise((resolve) => setTimeout(resolve, 220));
    await settle(app);
    flushStdout(stdout);

    expect(renderer).toHaveBeenCalledTimes(2);
    expect(writes.join("")).toContain(sequence);

    stdout.dispose();
    app.dispose();
  });

  it("does not queue the same raw sequence twice for the same rect", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 6,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const sequence = createKittyGraphicsSequence("QUJD");
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      type: "sequence" as const,
      protocol: "kitty" as const,
      sequence,
      fallback: "fallback",
    }));
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
    expect(writes.join("")).toContain(sequence);

    writes.length = 0;
    app.scheduler.invalidate();
    await settle(app);
    flushStdout(stdout);
    expect(writes.join("")).not.toContain(sequence);

    stdout.dispose();
    app.dispose();
  });

  it("records terminal graphic trace metrics", async () => {
    resetTerminalGraphicTraceMetrics();

    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 6,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const sequence = createKittyGraphicsSequence("QUJD");
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      type: "sequence" as const,
      protocol: "kitty" as const,
      sequence,
      fallback: "fallback",
    }));
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

    app.mount();
    await settle(app);
    flushStdout(stdout);

    const metrics = getTerminalGraphicTraceMetrics();
    expect(metrics.requests).toBeGreaterThan(0);
    expect(metrics.rendererRuns).toBe(1);
    expect(metrics.queued).toBeGreaterThan(0);
    expect(metrics.bytesQueued).toBeGreaterThan(0);
    expect(metrics.totalValidateMs).toBeGreaterThanOrEqual(0);

    stdout.dispose();
    app.dispose();
    resetTerminalGraphicTraceMetrics();
  });

  it("uses renderer returned rows when props.h is omitted", async () => {
    const sequence = createKittyGraphicsSequence("QUJD");
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      type: "sequence" as const,
      protocol: "kitty" as const,
      sequence,
      fallback: "fallback",
      rows: 3,
    }));
    const App = defineComponent({
      setup() {
        return () =>
          h("span", [
            h(TText, { x: 0, y: 2, w: 10, value: "covered" }),
            h(TAgentTerminalGraphic, {
              x: 0,
              y: 0,
              w: 10,
              zIndex: 1,
              content: "image.png",
              fallback: "fallback",
              renderer,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 4, component: App });
    app.mount();
    await settle(app);

    expect(rowText(app, 0)).toBe("fallback");
    expect(rowText(app, 2)).toBe("");

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
