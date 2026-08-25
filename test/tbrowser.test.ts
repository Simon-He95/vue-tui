import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import {
  TBrowser,
  type TBrowserInputEvent,
  type TBrowserSessionFactory,
} from "../src/experimental/browser.js";
import {
  detectTerminalGraphicsCapabilities,
  registerTerminalGraphicsOutput,
  type TerminalGraphicsPayload,
} from "../src/renderer/terminal-graphics.js";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function settle(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    app.scheduler.flushNow();
  }
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function registerKittyOutput(app: ReturnType<typeof createTerminalApp>) {
  const payloads: TerminalGraphicsPayload[] = [];
  const unregister = registerTerminalGraphicsOutput(app.terminal, {
    capabilities: detectTerminalGraphicsCapabilities({
      protocol: "kitty",
      force: true,
      stdoutIsTTY: true,
    }),
    queue(payload) {
      payloads.push(payload);
      return true;
    },
    clear: () => true,
    isActive: () => payloads.some((payload) => payload.op !== "clear"),
  });
  return { payloads, unregister };
}

describe("TBrowser", () => {
  it("renders browser session frames through the terminal graphics plane", async () => {
    const closed = vi.fn();
    let sourceContext: Parameters<TBrowserSessionFactory>[0] | undefined;
    const sessionFactory: TBrowserSessionFactory = async (context) => {
      sourceContext = context;
      return {
        frames: {
          async *[Symbol.asyncIterator]() {
            yield {
              png: new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64")),
              timestampMs: 0,
            };
            await waitForAbort(context.signal);
          },
        },
        dispatch: () => {},
        close: closed,
      };
    };
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          url: "https://example.com",
          sessionFactory,
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);

    expect(sourceContext).toMatchObject({
      url: "https://example.com",
      maxFps: 60,
      pixelWidth: 96,
      pixelHeight: 64,
      preferredFormat: "png",
    });
    expect(graphics.payloads).toHaveLength(1);
    expect(graphics.payloads[0]?.sequence).toContain(TINY_PNG_BASE64);

    app.dispose();
    await settle(app);
    expect(closed).toHaveBeenCalledTimes(1);
    graphics.unregister();
  });

  it("keeps the browser session alive when its terminal rect grows", async () => {
    const width = ref(12);
    const height = ref(4);
    const closed = vi.fn();
    const sourceContexts: Parameters<TBrowserSessionFactory>[0][] = [];
    const sessionFactory: TBrowserSessionFactory = async (context) => {
      sourceContexts.push(context);
      return {
        frames: {
          async *[Symbol.asyncIterator]() {
            yield {
              png: new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64")),
              timestampMs: 0,
            };
            await waitForAbort(context.signal);
          },
        },
        dispatch: () => {},
        close: closed,
      };
    };
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: width.value,
          h: height.value,
          url: "https://example.com",
          sessionFactory,
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    const payloadCountBeforeResize = graphics.payloads.length;
    width.value = 18;
    height.value = 6;
    app.terminal.resize(24, 10);
    await settle(app);

    expect(sourceContexts).toHaveLength(1);
    expect(sourceContexts[0]).toMatchObject({ pixelWidth: 96, pixelHeight: 64 });
    expect(closed).not.toHaveBeenCalled();
    expect(graphics.payloads.length).toBeGreaterThan(payloadCountBeforeResize);
    expect(graphics.payloads.at(-1)?.sequence).toContain("c=18,r=6");

    app.dispose();
    await settle(app);
    expect(closed).toHaveBeenCalledTimes(1);
    graphics.unregister();
  });

  it("restarts the browser session when an explicit pixel size changes", async () => {
    const pixelWidth = ref(96);
    const closed = vi.fn();
    const sourceContexts: Parameters<TBrowserSessionFactory>[0][] = [];
    const sessionFactory: TBrowserSessionFactory = async (context) => {
      sourceContexts.push(context);
      return {
        frames: {
          async *[Symbol.asyncIterator]() {
            await waitForAbort(context.signal);
          },
        },
        dispatch: () => {},
        close: closed,
      };
    };
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          url: "https://example.com",
          sessionFactory,
          pixelWidth: pixelWidth.value,
          pixelHeight: 64,
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    pixelWidth.value = 192;
    await settle(app);

    expect(sourceContexts.map((context) => context.pixelWidth)).toEqual([96, 192]);
    expect(closed).toHaveBeenCalledTimes(1);

    app.dispose();
    await settle(app);
    expect(closed).toHaveBeenCalledTimes(2);
    graphics.unregister();
  });

  it("closes a session when initial navigation fails", async () => {
    const url = ref("https://example.com");
    const closed = vi.fn();
    const navigate = vi.fn().mockRejectedValue(new Error("navigation failed"));
    const errors: unknown[] = [];
    let releaseFactory!: () => void;
    const factoryGate = new Promise<void>((resolve) => (releaseFactory = resolve));
    const sessionFactory: TBrowserSessionFactory = async (context) => {
      await factoryGate;
      return {
        frames: {
          async *[Symbol.asyncIterator]() {
            await waitForAbort(context.signal);
          },
        },
        dispatch: () => {},
        navigate,
        close: closed,
      };
    };
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          url: url.value,
          sessionFactory,
          onError: (error: unknown) => errors.push(error),
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await nextTick();
    url.value = "https://example.org";
    await nextTick();
    releaseFactory();
    await settle(app);

    expect(navigate).toHaveBeenCalledWith("https://example.org");
    expect(closed).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);

    app.dispose();
    graphics.unregister();
  });

  it("renders across more than 10,000 terminal cells", async () => {
    const sessionFactory: TBrowserSessionFactory = async (context) => ({
      frames: {
        async *[Symbol.asyncIterator]() {
          yield {
            png: new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64")),
            timestampMs: 0,
          };
          await waitForAbort(context.signal);
        },
      },
      dispatch: () => {},
      close: () => {},
    });
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: 196,
          h: 53,
          url: "https://example.com",
          sessionFactory,
        }),
    });
    const app = createTerminalApp({ cols: 210, rows: 60, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);

    expect(graphics.payloads.at(-1)?.sequence).toContain("c=196,r=53");

    app.dispose();
    graphics.unregister();
  });

  it("maps terminal pointer, wheel, keyboard, and paste events into browser input", async () => {
    const inputs: TBrowserInputEvent[] = [];
    const navigate = vi.fn();
    const back = vi.fn();
    const forward = vi.fn();
    const reload = vi.fn();
    const newPage = vi.fn();
    const closePage = vi.fn().mockResolvedValue(false);
    const sessionFactory: TBrowserSessionFactory = async (context) => ({
      frames: {
        async *[Symbol.asyncIterator]() {
          yield {
            png: new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64")),
            timestampMs: 0,
          };
          await waitForAbort(context.signal);
        },
      },
      dispatch: (event) => {
        inputs.push(event);
      },
      navigate,
      back,
      forward,
      reload,
      newPage,
      closePage,
      close: () => {},
    });
    const requestAddress = vi.fn();
    const close = vi.fn();
    const browserUrl = ref("https://example.com");
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 2,
          y: 1,
          w: 10,
          h: 4,
          url: browserUrl.value,
          sessionFactory,
          autoFocus: true,
          onRequestAddress: requestAddress,
          onClose: close,
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    app.events.dispatch({
      type: "pointerdown",
      cellX: 4,
      cellY: 2,
      button: 0,
      buttons: 1,
    });
    app.events.dispatch({ type: "wheel", cellX: 4, cellY: 2, deltaY: 1 });
    await settle(app);
    app.events.dispatch({ type: "keydown", key: "a", code: "KeyA" });
    app.events.dispatch({ type: "keyup", key: "a", code: "KeyA" });
    app.events.dispatch({ type: "paste", text: "hello" });
    app.events.dispatch({ type: "keydown", key: "l", code: "KeyL", ctrlKey: true });
    app.events.dispatch({ type: "keydown", key: "r", code: "KeyR", ctrlKey: true });
    app.events.dispatch({ type: "keyup", key: "r", code: "KeyR", ctrlKey: true });
    app.events.dispatch({ type: "keydown", key: "t", code: "KeyT", ctrlKey: true });
    app.events.dispatch({ type: "keydown", key: "w", code: "KeyW", ctrlKey: true });
    app.events.dispatch({ type: "keydown", key: "ArrowLeft", code: "ArrowLeft", altKey: true });
    app.events.dispatch({ type: "keydown", key: "ArrowRight", code: "ArrowRight", altKey: true });
    app.events.dispatch({ type: "keydown", key: "q", code: "KeyQ", ctrlKey: true });
    app.events.dispatch({ type: "keydown", key: "c", code: "KeyC", ctrlKey: true });
    browserUrl.value = "https://example.org";
    await settle(app);

    expect(inputs).toEqual([
      {
        type: "pointerdown",
        x: 20,
        y: 24,
        button: 0,
        buttons: 1,
        modifiers: { ctrl: false, shift: false, alt: false, meta: false },
      },
      {
        type: "wheel",
        x: 20,
        y: 24,
        deltaY: 1,
        modifiers: { ctrl: false, shift: false, alt: false, meta: false },
      },
      {
        type: "keydown",
        key: "a",
        code: "KeyA",
        repeat: false,
        modifiers: { ctrl: false, shift: false, alt: false, meta: false },
      },
      {
        type: "keyup",
        key: "a",
        code: "KeyA",
        repeat: false,
        modifiers: { ctrl: false, shift: false, alt: false, meta: false },
      },
      { type: "paste", text: "hello" },
    ]);
    expect(requestAddress).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(newPage).toHaveBeenCalledTimes(1);
    expect(closePage).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("https://example.org");
    expect(close).toHaveBeenCalledTimes(3);

    app.dispose();
    graphics.unregister();
  });

  it("preserves input order while the browser backend is asynchronous", async () => {
    const order: string[] = [];
    let releasePointerDown!: () => void;
    const pointerDownGate = new Promise<void>((resolve) => (releasePointerDown = resolve));
    const sessionFactory: TBrowserSessionFactory = async (context) => ({
      frames: {
        async *[Symbol.asyncIterator]() {
          yield {
            png: new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64")),
            timestampMs: 0,
          };
          await waitForAbort(context.signal);
        },
      },
      dispatch: async (event) => {
        order.push(`start:${event.type}`);
        if (event.type === "pointerdown") await pointerDownGate;
        order.push(`end:${event.type}`);
      },
      close: () => {},
    });
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: 10,
          h: 4,
          url: "https://example.com",
          sessionFactory,
          autoFocus: true,
        }),
    });
    const app = createTerminalApp({ cols: 12, rows: 6, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    app.events.dispatch({ type: "pointerdown", cellX: 2, cellY: 2, button: 0 });
    app.events.dispatch({ type: "pointerup", cellX: 2, cellY: 2, button: 0 });
    await Promise.resolve();
    expect(order).toEqual(["start:pointerdown"]);

    releasePointerDown();
    await settle(app);
    expect(order).toEqual([
      "start:pointerdown",
      "end:pointerdown",
      "start:pointerup",
      "end:pointerup",
    ]);

    app.dispose();
    graphics.unregister();
  });

  it("drops stale wheel input before a discrete interaction", async () => {
    const inputs: TBrowserInputEvent[] = [];
    let releaseWheel!: () => void;
    const wheelGate = new Promise<void>((resolve) => (releaseWheel = resolve));
    let firstWheel = true;
    const sessionFactory: TBrowserSessionFactory = async (context) => ({
      frames: {
        async *[Symbol.asyncIterator]() {
          yield {
            png: new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64")),
            timestampMs: 0,
          };
          await waitForAbort(context.signal);
        },
      },
      dispatch: async (event) => {
        inputs.push(event);
        if (event.type === "wheel" && firstWheel) {
          firstWheel = false;
          await wheelGate;
        }
      },
      close: () => {},
    });
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: 10,
          h: 4,
          url: "https://example.com",
          sessionFactory,
          autoFocus: true,
        }),
    });
    const app = createTerminalApp({ cols: 12, rows: 6, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    app.events.dispatch({ type: "wheel", cellX: 2, cellY: 2, deltaY: 1 });
    await Promise.resolve();
    app.events.dispatch({ type: "wheel", cellX: 2, cellY: 2, deltaY: 1 });
    app.events.dispatch({ type: "wheel", cellX: 2, cellY: 2, deltaY: 1 });
    app.events.dispatch({ type: "wheel", cellX: 2, cellY: 2, deltaY: -1 });
    app.events.dispatch({ type: "pointerdown", cellX: 2, cellY: 2, button: 0 });

    releaseWheel();
    await settle(app);

    expect(inputs.map((event) => event.type)).toEqual(["wheel", "pointerdown"]);

    app.dispose();
    graphics.unregister();
  });

  it("does not move new continuous input ahead of a queued discrete interaction", async () => {
    const order: string[] = [];
    let releasePointerDown!: () => void;
    const pointerDownGate = new Promise<void>((resolve) => (releasePointerDown = resolve));
    const sessionFactory: TBrowserSessionFactory = async (context) => ({
      frames: {
        async *[Symbol.asyncIterator]() {
          await waitForAbort(context.signal);
        },
      },
      dispatch: async (event) => {
        order.push(event.type);
        if (event.type === "pointerdown") await pointerDownGate;
      },
      close: () => {},
    });
    const App = defineComponent({
      setup: () => () =>
        h(TBrowser, {
          x: 0,
          y: 0,
          w: 10,
          h: 4,
          url: "https://example.com",
          sessionFactory,
          autoFocus: true,
        }),
    });
    const app = createTerminalApp({ cols: 12, rows: 6, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    app.events.dispatch({ type: "pointerdown", cellX: 2, cellY: 2, button: 0 });
    await Promise.resolve();
    app.events.dispatch({ type: "wheel", cellX: 2, cellY: 2, deltaY: 1 });
    app.events.dispatch({ type: "pointerup", cellX: 2, cellY: 2, button: 0 });
    app.events.dispatch({ type: "wheel", cellX: 2, cellY: 2, deltaY: 2 });

    releasePointerDown();
    await settle(app);

    expect(order).toEqual(["pointerdown", "pointerup", "wheel"]);

    app.dispose();
    graphics.unregister();
  });
});
