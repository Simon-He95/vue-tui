import { defineComponent, h, nextTick, provide, ref, vShow, withDirectives } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  TVideo,
  type TVideoFrame,
  type TVideoFrameEvent,
  type TVideoFrameSource,
} from "../src/experimental.js";
import { TBox } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";
import {
  detectTerminalGraphicsCapabilities,
  registerTerminalGraphicsOutput,
  type TerminalGraphicsPayload,
} from "../src/renderer/terminal-graphics.js";
import { TerminalGraphicsActivityKey } from "../src/vue/context.js";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const WIDE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAYAAAB4MH11AAAAG0lEQVR4nGP4r6Dwn5aYYdSCUQtGLRi1gDAGAG0Qhd9FkVPQAAAAAElFTkSuQmCC";

function frame(base64: string, timestampMs: number): TVideoFrame {
  return {
    png: new Uint8Array(Buffer.from(base64, "base64")),
    timestampMs,
  };
}

function rowText(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

async function settle(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    app.scheduler.flushNow();
  }
}

function registerKittyOutput(
  app: ReturnType<typeof createTerminalApp>,
  accept: (payload: TerminalGraphicsPayload) => boolean = () => true,
) {
  const payloads: TerminalGraphicsPayload[] = [];
  const clear = vi.fn((_id: string) => true);
  let active = false;
  const unregister = registerTerminalGraphicsOutput(app.terminal, {
    capabilities: detectTerminalGraphicsCapabilities({
      protocol: "kitty",
      force: true,
      stdoutIsTTY: true,
    }),
    queue(payload) {
      payloads.push(payload);
      const accepted = accept(payload);
      if (accepted) active = payload.op !== "clear";
      return accepted;
    },
    clear(id) {
      active = false;
      return clear(id);
    },
    isActive: () => active,
  });
  return { payloads, clear, unregister };
}

describe("TVideo", () => {
  it("coalesces burst frames before base64 rendering and passes an HTTP URL unchanged", async () => {
    const url = "https://example.com/video.mp4?token=a%26b&literal=$()";
    let sourceContext: Parameters<TVideoFrameSource>[0] | undefined;
    const frameEvents: TVideoFrameEvent[] = [];
    const source: TVideoFrameSource = async function* (context) {
      sourceContext = context;
      yield frame(TINY_PNG_BASE64, 0);
      yield frame(WIDE_PNG_BASE64, 83);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          src: url,
          frameSource: source,
          onFrame: (event: TVideoFrameEvent) => frameEvents.push(event),
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);

    expect(sourceContext?.src).toBe(url);
    expect(sourceContext).toMatchObject({
      maxFps: 12,
      pixelWidth: 96,
      pixelHeight: 64,
      preferredFormat: "png",
    });
    expect(graphics.payloads).toHaveLength(1);
    expect(graphics.payloads[0]?.sequence).toContain(WIDE_PNG_BASE64);
    expect(graphics.payloads[0]?.sequence).not.toContain(TINY_PNG_BASE64);
    expect(graphics.payloads[0]?.clearSequence).toContain("d=I");
    expect(frameEvents).toEqual([
      { timestampMs: 83, pixelWidth: 24, pixelHeight: 12, droppedFrames: 1 },
    ]);

    app.dispose();
    graphics.unregister();
  });

  it("renders Kitty frames when nested inside a bordered TBox", async () => {
    const source: TVideoFrameSource = async function* () {
      yield frame(TINY_PNG_BASE64, 0);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TBox, { x: 0, y: 0, w: 16, h: 6, border: true, padding: 0 }, () =>
          h(TVideo, {
            x: 0,
            y: 0,
            w: 12,
            h: 2,
            src: "video.mp4",
            frameSource: source,
          }),
        ),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);

    expect(graphics.payloads).toHaveLength(1);
    expect(graphics.payloads[0]?.sequence).toContain(TINY_PNG_BASE64);

    app.dispose();
    graphics.unregister();
  });

  it("preserves the requested cell aspect ratio when automatic pixels hit one limit", async () => {
    let sourceContext: Parameters<TVideoFrameSource>[0] | undefined;
    const source: TVideoFrameSource = async function* (context) {
      sourceContext = context;
      yield frame(TINY_PNG_BASE64, 0);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 100,
          h: 20,
          src: "video.mp4",
          frameSource: source,
        }),
    });
    const app = createTerminalApp({ cols: 120, rows: 30, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);

    expect(sourceContext).toMatchObject({ pixelWidth: 640, pixelHeight: 256 });

    app.dispose();
    graphics.unregister();
  });

  it.each([
    [{ pixelHeight: 100 }, { pixelWidth: 3000, pixelHeight: 100 }],
    [{ pixelWidth: 3000 }, { pixelWidth: 3000, pixelHeight: 100 }],
  ])(
    "infers a missing pixel axis from the terminal cell aspect ratio",
    async (pixelProps, expectedSize) => {
      let sourceContext: Parameters<TVideoFrameSource>[0] | undefined;
      const source: TVideoFrameSource = async function* (context) {
        sourceContext = context;
      };
      const App = defineComponent({
        setup: () => () =>
          h(TVideo, {
            x: 0,
            y: 0,
            w: 600,
            h: 10,
            ...pixelProps,
            src: "video.mp4",
            frameSource: source,
          }),
      });
      const app = createTerminalApp({ cols: 620, rows: 20, component: App });
      const graphics = registerKittyOutput(app);

      app.mount();
      await settle(app);

      expect(sourceContext).toMatchObject(expectedSize);

      app.dispose();
      graphics.unregister();
    },
  );

  it("delivers the final frame event before ended", async () => {
    const shown = ref(true);
    const events: string[] = [];
    const source: TVideoFrameSource = async function* () {
      yield frame(TINY_PNG_BASE64, 0);
    };
    const App = defineComponent({
      setup: () => () =>
        shown.value
          ? h(TVideo, {
              x: 0,
              y: 0,
              w: 12,
              h: 2,
              src: "video.mp4",
              frameSource: source,
              onFrame: () => events.push("frame"),
              onEnded: () => {
                events.push("ended");
                shown.value = false;
              },
            })
          : h("span"),
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);

    expect(events).toEqual(["frame", "ended"]);

    app.dispose();
    graphics.unregister();
  });

  it("atomically replaces a playing Kitty frame with stable image ids", async () => {
    let releaseSecond!: () => void;
    const waitForSecond = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const source: TVideoFrameSource = async function* () {
      yield frame(TINY_PNG_BASE64, 0);
      await waitForSecond;
      yield frame(WIDE_PNG_BASE64, 83);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          src: "video.mp4",
          frameSource: source,
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    expect(graphics.payloads).toHaveLength(1);

    releaseSecond();
    await settle(app);

    expect(graphics.payloads).toHaveLength(2);
    expect(graphics.clear).not.toHaveBeenCalled();
    const imageIds = graphics.payloads.map(
      (payload) => /(?:^|,)i=(\d+)/u.exec(payload.sequence)?.[1],
    );
    expect(imageIds[0]).toBeTruthy();
    expect(imageIds[1]).toBe(imageIds[0]);

    app.dispose();
    graphics.unregister();
  });

  it("clears the retained frame when an atomic replacement is rejected", async () => {
    let releaseSecond!: () => void;
    const waitForSecond = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const source: TVideoFrameSource = async function* () {
      yield frame(TINY_PNG_BASE64, 0);
      await waitForSecond;
      yield frame(WIDE_PNG_BASE64, 83);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          src: "video.mp4",
          frameSource: source,
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    let draws = 0;
    const graphics = registerKittyOutput(app, () => ++draws === 1);

    app.mount();
    await settle(app);
    releaseSecond();
    await settle(app);

    expect(graphics.clear).toHaveBeenCalled();

    app.dispose();
    graphics.unregister();
  });

  it("aborts the upstream decoder on pause and resumes from the latest timestamp", async () => {
    const paused = ref(false);
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      yield frame(TINY_PNG_BASE64, context.startAtMs);
      yield frame(TINY_PNG_BASE64, context.startAtMs + 250);
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          paused: paused.value,
        }),
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(1);

    paused.value = true;
    await nextTick();
    await settle(app);
    expect(contexts[0]?.signal.aborted).toBe(true);
    expect(graphics.clear).not.toHaveBeenCalled();

    paused.value = false;
    await nextTick();
    await settle(app);
    expect(contexts).toHaveLength(2);
    expect(contexts[1]?.startAtMs).toBe(250);

    app.dispose();
    expect(contexts[1]?.signal.aborted).toBe(true);
    graphics.unregister();
  });

  it("aborts and clears without drawing fallback when hidden with v-show", async () => {
    const shown = ref(true);
    let sourceContext: Parameters<TVideoFrameSource>[0] | undefined;
    const source: TVideoFrameSource = async function* (context) {
      sourceContext = context;
      yield frame(TINY_PNG_BASE64, 0);
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    };
    const App = defineComponent({
      setup: () => () =>
        withDirectives(
          h(TVideo, {
            x: 0,
            y: 0,
            w: 12,
            h: 2,
            src: "video.mp4",
            frameSource: source,
          }),
          [[vShow, shown.value]],
        ),
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    expect(sourceContext).toBeDefined();

    shown.value = false;
    await nextTick();
    await settle(app);

    expect(sourceContext?.signal.aborted).toBe(true);
    expect(graphics.clear).toHaveBeenCalled();
    expect(rowText(app, 0)).toBe("");

    app.dispose();
    graphics.unregister();
  });

  it("stops decoding while terminal graphics are suspended by scrolling", async () => {
    const scrolling = ref(false);
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      yield frame(TINY_PNG_BASE64, context.startAtMs + 125);
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    };
    const App = defineComponent({
      setup() {
        provide(TerminalGraphicsActivityKey, {
          scrolling,
          version: ref(0),
          markScroll() {},
          setScrollIdleMs() {},
          dispose() {},
        });
        return () =>
          h(TVideo, {
            x: 0,
            y: 0,
            w: 12,
            h: 2,
            src: "video.mp4",
            frameSource: source,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(1);

    scrolling.value = true;
    await nextTick();
    await settle(app);
    expect(contexts[0]?.signal.aborted).toBe(true);

    scrolling.value = false;
    await nextTick();
    await settle(app);
    expect(contexts).toHaveLength(2);
    expect(contexts[1]?.startAtMs).toBe(125);

    app.dispose();
    graphics.unregister();
  });

  it("requests bounded gray8 frames and renders ASCII when terminal graphics are unavailable", async () => {
    let sourceContext: Parameters<TVideoFrameSource>[0] | undefined;
    const source = vi.fn<TVideoFrameSource>(async function* (context) {
      sourceContext = context;
      yield {
        format: "gray8",
        pixels: new Uint8Array([0, 64, 255, 255, 128, 0]),
        pixelWidth: 3,
        pixelHeight: 2,
        timestampMs: 100,
      };
    });
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 5,
          h: 2,
          src: "video.mp4",
          frameSource: source,
        }),
    });
    const app = createTerminalApp({ cols: 8, rows: 4, component: App });

    app.mount();
    await settle(app);

    expect(source).toHaveBeenCalledOnce();
    expect(sourceContext).toMatchObject({
      maxFps: 10,
      pixelWidth: 3,
      pixelHeight: 2,
      preferredFormat: "gray8",
    });
    expect(rowText(app, 0)).toBe("  ::@");
    expect(rowText(app, 1)).toBe("@@++");
    app.dispose();
  });

  it("copies a reused gray8 source buffer before deferred rendering", async () => {
    let releaseSecond!: () => void;
    const waitForSecond = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const pixels = new Uint8Array([64]);
    const source: TVideoFrameSource = async function* (context) {
      yield {
        format: "gray8",
        pixels,
        pixelWidth: 1,
        pixelHeight: 1,
        timestampMs: 0,
        fingerprint: "first",
      };
      await waitForSecond;
      pixels[0] = 255;
      yield {
        format: "gray8",
        pixels,
        pixelWidth: 1,
        pixelHeight: 1,
        timestampMs: 100,
        fingerprint: "second",
      };
      pixels[0] = 0;
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 2,
          h: 1,
          src: "video.mp4",
          frameSource: source,
        }),
    });
    const app = createTerminalApp({ cols: 4, rows: 2, component: App });

    app.mount();
    await settle(app);
    expect(rowText(app, 0)).toBe("::");

    releaseSecond();
    await settle(app);
    expect(rowText(app, 0)).toBe("@@");

    app.dispose();
  });
});
