import { defineComponent, h, nextTick, provide, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  TAgentTerminalGraphic,
  TText,
  TView,
  createPngTerminalGraphicRenderer,
  createTerminalGraphicRenderQueue,
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  detectTerminalGraphicsCapabilities,
  type TAgentTerminalGraphicRenderer,
  type TAgentTerminalGraphicRendererContext,
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
import {
  getTerminalGraphicTraceMetrics,
  resetTerminalGraphicTraceMetrics,
} from "../src/renderer/terminal-graphics-trace.js";
import { TVirtualRows } from "../src/vue/components/TVirtualRows.js";
import { createTerminalGraphicsActivity, TerminalGraphicsActivityKey } from "../src/vue/context.js";

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
    expect(
      graphics?.queue({
        id: "g1",
        x: 1,
        y: 1,
        w: 4,
        h: 2,
        protocol: "kitty",
        sequence,
        clearSequence,
      }),
    ).toBe(true);
    expect(writes.join("")).toContain(sequence);
    expect(getStdoutRendererMetrics().terminalGraphicsDraws).toBeGreaterThan(
      before.terminalGraphicsDraws,
    );
    expect(getStdoutRendererMetrics().terminalGraphicsBytes).toBeGreaterThan(
      before.terminalGraphicsBytes,
    );
    expect(getStdoutRendererMetrics().terminalGraphicsActive).toBe(1);

    writes.length = 0;
    expect(graphics?.clear?.("g1")).toBe(true);
    expect(writes.join("")).toContain(clearSequence);
    expect(getStdoutRendererMetrics().terminalGraphicsClears).toBeGreaterThan(
      before.terminalGraphicsClears,
    );
    expect(getStdoutRendererMetrics().terminalGraphicsActive).toBe(0);

    writes.length = 0;
    expect(
      graphics?.queue({
        id: "invalid-size",
        x: 1,
        y: 1,
        w: 0,
        h: 2,
        protocol: "kitty",
        sequence,
      }),
    ).toBe(false);
    expect(writes.join("")).not.toContain(sequence);

    stdout.dispose();
    app.dispose();
  });

  it("does not erase fallback text when clearing a raw graphic in the same frame", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 6,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const scrolling = ref(false);
    const iterm2Sequence = createIterm2InlineImageSequence("QUJD", { width: 8, height: 1 });
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(() => ({
      type: "sequence" as const,
      protocol: "iterm2" as const,
      sequence: iterm2Sequence,
      fallback: "fallback",
    }));
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 8,
            h: 1,
            content: "image.png",
            fallback: "fallback",
            scrolling: scrolling.value,
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    const stdout = withEnv(
      {
        TERM_PROGRAM: "iTerm.app",
        KITTY_WINDOW_ID: undefined,
        TERM: undefined,
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

    writes.length = 0;
    app.mount();
    await settle(app);
    flushStdout(stdout);
    expect(writes.join("")).toContain(iterm2Sequence);

    writes.length = 0;
    scrolling.value = true;
    await settle(app);
    flushStdout(stdout);

    const frame = writes.join("");
    const fallbackIndex = frame.indexOf("fallback");
    expect(fallbackIndex).toBeGreaterThanOrEqual(0);
    expect(frame.indexOf(`${ESC}[1;1H        `, fallbackIndex)).toBe(-1);
    expect(rowText(app, 0)).toBe("fallback");

    stdout.dispose();
    app.dispose();
  });

  it("uses full-row repaint instead of dirty spans while clearing active raw graphics", () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const app = createTerminalApp({
      cols: 20,
      rows: 4,
      component: defineComponent({ setup: () => () => null }),
    });
    const stdout = withEnv(
      {
        TERM_PROGRAM: "iTerm.app",
        KITTY_WINDOW_ID: undefined,
        TERM: undefined,
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
          dirtyRowPatchMode: "span",
        }),
    );
    const graphics = getTerminalGraphicsOutput(app.terminal);
    const sequence = createIterm2InlineImageSequence("QUJD", { width: 8, height: 1 });

    app.terminal.write("abcdefghij", { x: 0, y: 0 });
    flushStdout(stdout);

    writes.length = 0;
    graphics?.queue({
      id: "span-clear",
      x: 0,
      y: 0,
      w: 8,
      h: 1,
      protocol: "iterm2",
      sequence,
    });
    flushStdout(stdout);
    expect(writes.join("")).toContain(sequence);

    app.terminal.write("abcdXfghij", { x: 0, y: 0 });
    writes.length = 0;
    graphics?.clear?.("span-clear");
    (stdout.render as (dirtyRows?: readonly number[] | null, sync?: boolean) => void)([0], true);

    const frame = writes.join("");
    expect(frame).toContain("abcdXfghij");
    expect(frame).not.toBe("X");

    stdout.dispose();
    app.dispose();
  });

  it("keeps dirty-span repaint for rows that do not intersect active terminal graphics", () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
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
        TERM_PROGRAM: "iTerm.app",
        KITTY_WINDOW_ID: undefined,
        TERM: undefined,
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
          dirtyRowPatchMode: "span",
        }),
    );
    const graphics = getTerminalGraphicsOutput(app.terminal);
    const sequence = createIterm2InlineImageSequence("QUJD", { width: 8, height: 1 });

    app.terminal.write("abcdefghij", { x: 0, y: 0 });
    flushStdout(stdout);

    writes.length = 0;
    graphics?.queue({
      id: "active-outside-dirty-row",
      x: 0,
      y: 4,
      w: 8,
      h: 1,
      protocol: "iterm2",
      sequence,
    });
    flushStdout(stdout);
    expect(writes.join("")).toContain(sequence);

    app.terminal.write("abcdXfghij", { x: 0, y: 0 });
    writes.length = 0;
    (stdout.render as (dirtyRows?: readonly number[] | null, sync?: boolean) => void)([0], true);

    const frame = writes.join("");
    expect(frame).toContain("X");
    expect(frame).not.toContain("abcdXfghij");

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

  it("rerenders PNG graphics after a clipped viewport becomes fully raw-visible", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const clipWidth = ref(5);
    const toPngBase64 = vi.fn(async () => ({
      base64: "QUJD",
      fallback: "png fallback",
      cols: 10,
      rows: 1,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      toPngBase64,
      fallback: () => "text fallback",
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: clipWidth.value, h: 1 }, () =>
            h(TAgentTerminalGraphic, {
              x: 0,
              y: 0,
              w: 10,
              h: 1,
              content: "image.png",
              fallback: "fallback",
              renderer,
            }),
          );
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
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

    expect(toPngBase64).not.toHaveBeenCalled();
    expect(rowText(app, 0)).toBe("text");
    expect(writes.join("")).not.toContain("QUJD");

    writes.length = 0;
    clipWidth.value = 10;
    await settle(app);
    flushStdout(stdout);

    expect(toPngBase64).toHaveBeenCalledTimes(1);
    expect(writes.join("")).toContain("QUJD");
    expect(rowText(app, 0)).toBe("");

    stdout.dispose();
    app.dispose();
  });

  it("rerenders terminal graphics when stdout graphics output is registered after initial fallback", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const toPngBase64 = vi.fn(async () => ({
      base64: "QUJD",
      fallback: "png fallback",
      cols: 13,
      rows: 1,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      toPngBase64,
      fallback: () => "text fallback",
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 13,
            h: 1,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    app.mount();
    await settle(app);

    expect(toPngBase64).not.toHaveBeenCalled();
    expect(rowText(app, 0)).toBe("text fallback");

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
    await settle(app);
    flushStdout(stdout);

    expect(toPngBase64).toHaveBeenCalledTimes(1);
    expect(writes.join("")).toContain("QUJD");
    expect(rowText(app, 0)).toBe("");

    stdout.dispose();
    app.dispose();
  });

  it("rerenders terminal graphics when stdout graphics protocol changes", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const kittySequence = createKittyGraphicsSequence("S0lUVFk=");
    const iterm2Sequence = createIterm2InlineImageSequence("SVRFUk0=", { width: 8, height: 1 });
    const renderProtocols: string[] = [];
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((_content, context) => {
      renderProtocols.push(context.protocol);
      if (context.protocol === "kitty") {
        return {
          type: "sequence" as const,
          protocol: "kitty" as const,
          sequence: kittySequence,
          fallback: "kitty fallback",
        };
      }

      if (context.protocol === "iterm2") {
        return {
          type: "sequence" as const,
          protocol: "iterm2" as const,
          sequence: iterm2Sequence,
          fallback: "iterm2 fallback",
        };
      }

      return { type: "text" as const, text: "fallback" };
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 8,
            h: 1,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const kittyStdout = withEnv(
      {
        KITTY_WINDOW_ID: "1",
        TERM_PROGRAM: "kitty",
        TERM: undefined,
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

    writes.length = 0;
    app.mount();
    await settle(app);
    flushStdout(kittyStdout);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderProtocols).toEqual(["kitty"]);
    expect(writes.join("")).toContain(kittySequence);

    writes.length = 0;
    kittyStdout.dispose();
    const iterm2Stdout = withEnv(
      {
        KITTY_WINDOW_ID: undefined,
        TERM_PROGRAM: "iTerm.app",
        TERM: undefined,
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
    writes.length = 0;
    app.scheduler.invalidate();
    await settle(app);
    flushStdout(iterm2Stdout);

    expect(renderer).toHaveBeenCalledTimes(2);
    expect(renderProtocols).toEqual(["kitty", "iterm2"]);
    expect(writes.join("")).toContain(iterm2Sequence);
    expect(rowText(app, 0)).toBe("");

    iterm2Stdout.dispose();
    app.dispose();
  });

  it("rerenders PNG fallback after sixel without encoder switches to kitty", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 30,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const toPngBase64 = vi.fn(async () => ({
      base64: "QUJD",
      fallback: "png fallback",
      cols: 20,
      rows: 1,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      toPngBase64,
      fallback: (_content, context) => `text fallback:${context.protocol}`,
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 20,
            h: 1,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 30, rows: 4, component: App });
    const sixelStdout = withEnv(
      {
        KITTY_WINDOW_ID: undefined,
        TERM_PROGRAM: undefined,
        TERM: "xterm-sixel",
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

    app.mount();
    await settle(app);
    flushStdout(sixelStdout);

    expect(toPngBase64).not.toHaveBeenCalled();
    expect(rowText(app, 0)).toBe("text fallback:sixel");

    sixelStdout.dispose();
    const kittyStdout = withEnv(
      {
        KITTY_WINDOW_ID: "1",
        TERM_PROGRAM: "kitty",
        TERM: undefined,
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
    writes.length = 0;
    app.scheduler.invalidate();
    await settle(app);
    flushStdout(kittyStdout);

    expect(toPngBase64).toHaveBeenCalledTimes(1);
    expect(writes.join("")).toContain("QUJD");
    expect(rowText(app, 0)).toBe("");

    kittyStdout.dispose();
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

  it("records component renderer aborts when render work is deferred by scrolling", async () => {
    resetTerminalGraphicTraceMetrics();

    const scrolling = ref(false);
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((_content, context) => {
      return new Promise<TAgentTerminalGraphicRenderResult>((_resolve, reject) => {
        context.signal.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      });
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
            scrolling: scrolling.value,
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    app.mount();
    await settle(app);

    expect(renderer).toHaveBeenCalledTimes(1);

    scrolling.value = true;
    await settle(app);

    expect(getTerminalGraphicTraceMetrics().rendererAborts).toBeGreaterThan(0);

    app.dispose();
    resetTerminalGraphicTraceMetrics();
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
    const fallback = vi.fn(async () => "expensive fallback");
    const renderer = createPngTerminalGraphicRenderer({
      queue,
      fallback,
      toPngBase64,
    });
    const makeContext = (imageId: number, placementId: number) => ({
      kind: "image" as const,
      width: 4,
      height: 2,
      final: true,
      streaming: false,
      protocol: "kitty" as const,
      capabilities,
      signal: new AbortController().signal,
      imageId,
      placementId,
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
    });

    const first = await renderer("image.png", makeContext(123, 456));
    const second = await renderer("image.png", makeContext(789, 321));

    expect(toPngBase64).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(first).toMatchObject({ type: "sequence", protocol: "kitty", fallback: "png fallback" });
    expect(second).toMatchObject({ type: "sequence", protocol: "kitty", fallback: "png fallback" });

    const firstSequence =
      typeof first === "object" && first && "sequence" in first ? String(first.sequence) : "";
    const secondSequence =
      typeof second === "object" && second && "sequence" in second ? String(second.sequence) : "";

    expect(firstSequence).toContain("i=123");
    expect(firstSequence).toContain("p=456");
    expect(secondSequence).toContain("i=789");
    expect(secondSequence).toContain("p=321");
    expect(secondSequence).not.toBe(firstSequence);
    expect(queue.stats().cacheEntries).toBe(1);
  });

  it("does not render PNG frames when raw terminal output cannot be placed", async () => {
    const capabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });
    const toPngBase64 = vi.fn(async () => ({
      base64: "QUJD",
      fallback: "png fallback",
      cols: 10,
      rows: 1,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      toPngBase64,
      fallback: () => "text fallback",
    });
    const context: TAgentTerminalGraphicRendererContext = {
      kind: "image",
      width: 10,
      height: 1,
      final: true,
      streaming: false,
      protocol: "kitty",
      capabilities,
      signal: new AbortController().signal,
      imageId: 1,
      placementId: 1,
      visible: true,
      rawVisible: false,
      scrolling: false,
      viewport: {
        visible: true,
        rawVisible: false,
        scrolling: false,
        rect: { x: 0, y: 0, w: 5, h: 1 },
        fullRect: { x: 0, y: 0, w: 10, h: 1 },
      },
    };

    await expect(renderer("image.png", context)).resolves.toEqual({
      type: "text",
      text: "text fallback",
    });
    expect(toPngBase64).not.toHaveBeenCalled();
  });

  it("reuses protocol-independent PNG cache across terminal protocols", async () => {
    const queue = createTerminalGraphicRenderQueue();
    const kittyCapabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });
    const itermCapabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { TERM_PROGRAM: "iTerm.app" },
    });
    const toPngBase64 = vi.fn(async () => ({
      base64: "QUJD",
      fallback: "shared png fallback",
      cols: 4,
      rows: 2,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      queue,
      toPngBase64,
    });
    const makeContext = (
      protocol: "kitty" | "iterm2",
      capabilities: typeof kittyCapabilities,
      imageId: number,
      placementId: number,
    ) => ({
      kind: "image" as const,
      width: 4,
      height: 2,
      final: true,
      streaming: false,
      protocol,
      capabilities,
      signal: new AbortController().signal,
      imageId,
      placementId,
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
    });

    const kitty = await renderer("image.png", makeContext("kitty", kittyCapabilities, 123, 456));
    const iterm2 = await renderer("image.png", makeContext("iterm2", itermCapabilities, 789, 321));

    expect(toPngBase64).toHaveBeenCalledTimes(1);
    expect(kitty).toMatchObject({
      type: "sequence",
      protocol: "kitty",
      fallback: "shared png fallback",
    });
    expect(iterm2).toMatchObject({
      type: "sequence",
      protocol: "iterm2",
      fallback: "shared png fallback",
    });
    expect(
      typeof iterm2 === "object" && iterm2 && "sequence" in iterm2 ? String(iterm2.sequence) : "",
    ).toContain("]1337;File=");
    expect(queue.stats().cacheEntries).toBe(1);
  });

  it("does not cache context-dependent fallback text with protocol-independent PNG frames", async () => {
    const queue = createTerminalGraphicRenderQueue();
    const kittyCapabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });
    const itermCapabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { TERM_PROGRAM: "iTerm.app" },
    });
    const toPngBase64 = vi.fn(async () => ({
      base64: "QUJD",
      cols: 4,
      rows: 2,
    }));
    const fallback = vi.fn(
      async (_content: string, context: TAgentTerminalGraphicRendererContext) =>
        `fallback:${context.protocol}`,
    );
    const renderer = createPngTerminalGraphicRenderer({
      queue,
      toPngBase64,
      fallback,
    });
    const makeContext = (
      protocol: "kitty" | "iterm2",
      capabilities: typeof kittyCapabilities,
      imageId: number,
      placementId: number,
    ): TAgentTerminalGraphicRendererContext => ({
      kind: "image",
      width: 4,
      height: 2,
      final: true,
      streaming: false,
      protocol,
      capabilities,
      signal: new AbortController().signal,
      imageId,
      placementId,
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
    });

    const kitty = await renderer("image.png", makeContext("kitty", kittyCapabilities, 123, 456));
    const iterm2 = await renderer("image.png", makeContext("iterm2", itermCapabilities, 789, 321));

    expect(toPngBase64).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(kitty).toMatchObject({
      type: "sequence",
      protocol: "kitty",
      fallback: "fallback:kitty",
    });
    expect(iterm2).toMatchObject({
      type: "sequence",
      protocol: "iterm2",
      fallback: "fallback:iterm2",
    });
    expect(queue.stats().cacheEntries).toBe(1);
  });

  it("invalidates the default PNG cache when the renderer context cacheKey changes", async () => {
    const queue = createTerminalGraphicRenderQueue();
    const capabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });
    const toPngBase64 = vi.fn(async (_content: string, context: { cacheKey?: string }) => ({
      base64: context.cacheKey === "v2" ? "REVG" : "QUJD",
      fallback: `png fallback ${context.cacheKey}`,
      cols: 4,
      rows: 2,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      queue,
      toPngBase64,
    });
    const makeContext = (cacheKey: string) => ({
      kind: "image" as const,
      width: 4,
      height: 2,
      final: true,
      streaming: false,
      protocol: "kitty" as const,
      capabilities,
      signal: new AbortController().signal,
      imageId: 123,
      placementId: 456,
      visible: true,
      rawVisible: true,
      scrolling: false,
      cacheKey,
      viewport: {
        visible: true,
        rawVisible: true,
        scrolling: false,
        rect: { x: 0, y: 0, w: 4, h: 2 },
        fullRect: { x: 0, y: 0, w: 4, h: 2 },
      },
    });

    const first = await renderer("image.png", makeContext("v1"));
    const second = await renderer("image.png", makeContext("v2"));

    expect(toPngBase64).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({
      type: "sequence",
      protocol: "kitty",
      fallback: "png fallback v1",
    });
    expect(second).toMatchObject({
      type: "sequence",
      protocol: "kitty",
      fallback: "png fallback v2",
    });

    const firstSequence =
      typeof first === "object" && first && "sequence" in first ? String(first.sequence) : "";
    const secondSequence =
      typeof second === "object" && second && "sequence" in second ? String(second.sequence) : "";
    expect(firstSequence).toContain("QUJD");
    expect(secondSequence).toContain("REVG");
    expect(queue.stats().cacheEntries).toBe(2);
  });

  it("invalidates the default PNG cache when cacheSalt changes", async () => {
    const queue = createTerminalGraphicRenderQueue();
    const capabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });
    let theme = "light";
    const toPngBase64 = vi.fn(async () => ({
      base64: theme === "dark" ? "REVG" : "QUJD",
      fallback: `png fallback ${theme}`,
      cols: 4,
      rows: 2,
    }));
    const renderer = createPngTerminalGraphicRenderer({
      queue,
      cacheSalt: () => theme,
      toPngBase64,
    });
    const makeContext = (): TAgentTerminalGraphicRendererContext => ({
      kind: "image",
      width: 4,
      height: 2,
      final: true,
      streaming: false,
      protocol: "kitty",
      capabilities,
      signal: new AbortController().signal,
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
    });

    const first = await renderer("image.png", makeContext());
    theme = "dark";
    const second = await renderer("image.png", makeContext());

    expect(toPngBase64).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({
      type: "sequence",
      protocol: "kitty",
      fallback: "png fallback light",
    });
    expect(second).toMatchObject({
      type: "sequence",
      protocol: "kitty",
      fallback: "png fallback dark",
    });
    expect(queue.stats().cacheEntries).toBe(2);
  });

  it("does not share abortable PNG renderer work from a deduping custom queue", async () => {
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 2,
      dedupeInflight: true,
    });
    const capabilities = detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      env: { KITTY_WINDOW_ID: "1" },
    });
    let releaseFirst!: () => void;
    let startFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      startFirst = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const toPngBase64 = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        startFirst();
        await firstGate;
        return {
          base64: "RklSU1Q=",
          fallback: "first png fallback",
          cols: 4,
          rows: 2,
        };
      }

      return {
        base64: "U0VDT05E",
        fallback: "second png fallback",
        cols: 4,
        rows: 2,
      };
    });
    const renderer = createPngTerminalGraphicRenderer({
      queue,
      toPngBase64,
    });
    const makeContext = (signal: AbortSignal, imageId: number, placementId: number) => ({
      kind: "image" as const,
      width: 4,
      height: 2,
      final: true,
      streaming: false,
      protocol: "kitty" as const,
      capabilities,
      signal,
      imageId,
      placementId,
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
    });
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = Promise.resolve(
      renderer("image.png", makeContext(firstController.signal, 123, 456)),
    ).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await firstStarted;
    firstController.abort();
    const second = renderer("image.png", makeContext(secondController.signal, 789, 321));
    releaseFirst();

    expect(await first).toMatchObject({
      ok: false,
      error: { name: "AbortError" },
    });
    await expect(second).resolves.toMatchObject({
      type: "sequence",
      protocol: "kitty",
      fallback: "second png fallback",
    });
    expect(toPngBase64).toHaveBeenCalledTimes(2);
  });

  it("does not bump terminal graphics activity version for every scroll mark", () => {
    vi.useFakeTimers();
    try {
      const activity = createTerminalGraphicsActivity({
        scrollIdleMs: 100,
        trace: false,
      });

      expect(activity.version.value).toBe(0);
      activity.markScroll();
      const startedVersion = activity.version.value;
      expect(startedVersion).toBe(1);
      expect(activity.scrolling.value).toBe(true);

      activity.markScroll();
      activity.markScroll();
      expect(activity.version.value).toBe(startedVersion);

      vi.advanceTimersByTime(100);
      expect(activity.scrolling.value).toBe(false);
      expect(activity.version.value).toBe(startedVersion + 1);
      activity.dispose();
    } finally {
      vi.useRealTimers();
    }
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

    resetTerminalGraphicTraceMetrics();
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
    expect(getTerminalGraphicTraceMetrics().scrollStarts).toBeGreaterThan(0);
    expect(getTerminalGraphicTraceMetrics().skippedScrolling).toBeGreaterThan(0);
    expect(writes.join("")).not.toContain(sequence);

    await new Promise((resolve) => setTimeout(resolve, 220));
    await settle(app);
    flushStdout(stdout);

    expect(getTerminalGraphicTraceMetrics().scrollIdles).toBeGreaterThan(0);
    expect(getTerminalGraphicTraceMetrics().totalScrollMs).toBeGreaterThanOrEqual(0);
    expect(renderer).toHaveBeenCalledTimes(2);
    expect(writes.join("")).toContain(sequence);

    stdout.dispose();
    app.dispose();
    resetTerminalGraphicTraceMetrics();
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

  it("redraws a component graphic after stdout clears it for a scroll operation", async () => {
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
    const activityVersion = ref(0);
    const App = defineComponent({
      setup() {
        provide(TerminalGraphicsActivityKey, {
          scrolling: ref(false),
          version: activityVersion,
          markScroll() {
            activityVersion.value++;
          },
          dispose() {},
        });
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
    (stdout.render as any)([], true, [{ startY: 0, endY: 6, delta: 1 }]);
    expect(writes.join("")).toContain("a=d");

    writes.length = 0;
    activityVersion.value++;
    await settle(app);
    flushStdout(stdout);
    expect(writes.join("")).toContain(sequence);

    stdout.dispose();
    app.dispose();
  });

  it("does not clamp offscreen or partially visible terminal graphics into the visible viewport", () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: false,
      columns: 10,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const app = createTerminalApp({
      cols: 10,
      rows: 4,
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

    writes.length = 0;
    graphics?.queue({
      id: "offscreen",
      x: 99,
      y: 0,
      w: 4,
      h: 1,
      protocol: "kitty",
      sequence,
    });

    expect(writes.join("")).not.toContain(sequence);
    expect(getStdoutRendererMetrics().terminalGraphicsActive).toBe(0);

    writes.length = 0;
    graphics?.queue({
      id: "partially-visible",
      x: -2,
      y: 0,
      w: 4,
      h: 1,
      protocol: "kitty",
      sequence,
    });

    expect(writes.join("")).not.toContain(sequence);
    expect(getStdoutRendererMetrics().terminalGraphicsActive).toBe(0);

    stdout.dispose();
    app.dispose();
  });

  it("records one queue metric per validated stdout graphics payload", async () => {
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

    expect(getTerminalGraphicTraceMetrics().queued).toBe(1);

    stdout.dispose();
    app.dispose();
    resetTerminalGraphicTraceMetrics();
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

  it("keeps the last terminal row reservation while rendering is deferred during scroll", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 20,
      rows: 4,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const scrolling = ref(false);
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
              scrolling: scrolling.value,
              renderer,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 4, component: App });
    const stdout = withEnv(
      {
        KITTY_WINDOW_ID: "1",
        TERM_PROGRAM: "kitty",
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

    app.mount();
    await settle(app);
    flushStdout(stdout);
    expect(rowText(app, 2)).toBe("");

    scrolling.value = true;
    await settle(app);
    flushStdout(stdout);

    expect(rowText(app, 0)).toBe("fallback");
    expect(rowText(app, 2)).toBe("");

    stdout.dispose();
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

  it("falls back when renderer returns a non-preferred detected protocol", async () => {
    const writes: string[] = [];
    const output: CliOutput = {
      isTTY: true,
      columns: 24,
      rows: 6,
      write(chunk) {
        writes.push(chunk);
      },
    };
    const itermSequence = createIterm2InlineImageSequence("QUJD", { width: 8, height: 2 });
    const renderer: TAgentTerminalGraphicRenderer = vi.fn((_content, context) => {
      expect(context.protocol).toBe("kitty");
      expect(context.capabilities).toMatchObject({
        preferredProtocol: "kitty",
        candidates: ["kitty", "iterm2"],
      });
      return {
        type: "sequence" as const,
        protocol: "iterm2" as const,
        sequence: itermSequence,
        fallback: "iterm fallback",
      };
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(TAgentTerminalGraphic, {
            x: 0,
            y: 0,
            w: 14,
            h: 1,
            content: "image.png",
            fallback: "fallback",
            renderer,
          });
      },
    });

    const app = createTerminalApp({ cols: 24, rows: 6, component: App });
    const stdout = withEnv(
      {
        KITTY_WINDOW_ID: "1",
        TERM: undefined,
        TERM_PROGRAM: "iTerm.app",
        WEZTERM_PANE: undefined,
        WEZTERM_EXECUTABLE: undefined,
        VUE_TUI_SIXEL: undefined,
        VUE_TUI_GRAPHICS_SIXEL: undefined,
        VUE_TUI_TERMINAL_GRAPHICS: undefined,
        VUE_TUI_GRAPHICS_PROTOCOL: undefined,
        VUE_TUI_GRAPHICS_FORCE: undefined,
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

    app.mount();
    await settle(app);
    flushStdout(stdout);

    expect(rowText(app, 0)).toBe("iterm fallback");
    expect(writes.join("")).not.toContain(itermSequence);

    stdout.dispose();
    app.dispose();
  });

  it("falls back to text when no terminal graphics output is registered", async () => {
    const renderer: TAgentTerminalGraphicRenderer = vi.fn(
      () =>
        ({
          sequence: "<IMG>",
          fallback: "fallback",
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
