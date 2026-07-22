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

function grayFrame(timestampMs: number): TVideoFrame {
  return {
    format: "gray8",
    pixels: new Uint8Array([128]),
    pixelWidth: 1,
    pixelHeight: 1,
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

function progressRange(text: string): Readonly<{ x: number; width: number }> {
  const match = /[━╋─]+/u.exec(text);
  if (!match) throw new Error(`Missing video progress track in ${JSON.stringify(text)}`);
  return { x: match.index, width: match[0].length };
}

function clickCell(app: ReturnType<typeof createTerminalApp>, cellX: number, cellY: number): void {
  app.events.dispatch({ type: "pointerdown", cellX, cellY, button: 0, buttons: 1 });
  app.events.dispatch({ type: "pointerup", cellX, cellY, button: 0, buttons: 0 });
  app.events.dispatch({ type: "click", cellX, cellY, button: 0 });
}

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
      {
        timestampMs: 83,
        pixelWidth: 24,
        pixelHeight: 12,
        droppedFrames: 1,
        playbackRate: 1,
      },
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

  it("uses compact controls by default and reserves one row from the decode height", async () => {
    expect(TVideo.props.controlsLayout.default).toBe("compact");

    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      yield grayFrame(5_000);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 44,
          h: 5,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          durationMs: 12_000,
          loop: true,
        }),
    });
    const app = createTerminalApp({ cols: 48, rows: 7, component: App });

    app.mount();
    await settle(app);

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      pixelWidth: 22,
      pixelHeight: 4,
      preferredFormat: "gray8",
      playbackRate: 1,
      loop: true,
    });
    expect(rowText(app, 4)).toBe("|| 00:05 ━━━━━━━━╋─────────── 00:12 1x 2x 3x");
    expect(rowText(app, 5)).toBe("");

    app.dispose();
  });

  it("uses a full-width progress row and a separate action row for cinema controls", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      yield grayFrame(5_000);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 44,
          h: 6,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          controlsLayout: "cinema",
          durationMs: 12_000,
        }),
    });
    const app = createTerminalApp({ cols: 48, rows: 8, component: App });

    app.mount();
    await settle(app);

    expect(contexts[0]).toMatchObject({ pixelHeight: 4, preferredFormat: "gray8" });
    expect(rowText(app, 4)).toMatch(/^━{18}╋─{25}$/u);
    expect(rowText(app, 4)).toHaveLength(44);
    expect(rowText(app, 5).slice(0, 16)).toBe("|| 00:05 / 00:12");
    expect(rowText(app, 5).slice(36)).toBe("1x 2x 3x");

    app.dispose();
  });

  it("falls back from cinema to compact controls when only one control row fits", async () => {
    let sourceContext: Parameters<TVideoFrameSource>[0] | undefined;
    const source: TVideoFrameSource = async function* (context) {
      sourceContext = context;
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 44,
          h: 2,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          controlsLayout: "cinema",
          durationMs: 12_000,
        }),
    });
    const app = createTerminalApp({ cols: 48, rows: 4, component: App });

    app.mount();
    await settle(app);

    expect(sourceContext).toMatchObject({ pixelHeight: 1, preferredFormat: "gray8" });
    expect(rowText(app, 1)).toBe("|| 00:00 ╋─────────────────── 00:12 1x 2x 3x");
    expect(rowText(app, 2)).toBe("");

    app.dispose();
  });

  it("keeps the progress thumb one cell wide with the cjk width provider", async () => {
    const source: TVideoFrameSource = async function* (context) {
      yield grayFrame(5_000);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 44,
          h: 3,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          durationMs: 10_000,
        }),
    });
    const app = createTerminalApp({
      cols: 48,
      rows: 5,
      widthProvider: "cjk",
      component: App,
    });

    app.mount();
    await settle(app);

    expect(rowText(app, 2)).toBe("|| 00:05 ━━━━━━━━━━╋───────── 00:10 1x 2x 3x");
    expect(app.terminal.getCell(19, 2)).toMatchObject({ ch: "╋", width: 1 });
    expect(app.terminal.getCell(20, 2)).toMatchObject({ ch: "─", width: 1 });

    app.dispose();
  });

  it("formats hour-long cinema timestamps without shifting the playback rates", async () => {
    const source: TVideoFrameSource = async function* (context) {
      yield grayFrame(3_661_000);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 60,
          h: 5,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          controlsLayout: "cinema",
          durationMs: 3_726_000,
        }),
    });
    const app = createTerminalApp({ cols: 64, rows: 7, component: App });

    app.mount();
    await settle(app);

    expect(rowText(app, 4).slice(0, 20)).toBe("|| 1:01:01 / 1:02:06");
    expect(rowText(app, 4).slice(52)).toBe("1x 2x 3x");

    app.dispose();
  });

  it("toggles uncontrolled playback from the video and isolates control-bar rate clicks", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const pausedEvents: boolean[] = [];
    const rateEvents: number[] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      yield frame(TINY_PNG_BASE64, context.startAtMs + 100);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          "onUpdate:paused": (paused: boolean) => pausedEvents.push(paused),
          "onUpdate:playbackRate": (rate: number) => rateEvents.push(rate),
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ startAtMs: 0, playbackRate: 1 });
    expect(rowText(app, 3)).toBe("|| ────────────── 1x");

    clickCell(app, 5, 1);
    await settle(app);
    expect(pausedEvents).toEqual([true]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.signal.aborted).toBe(true);

    clickCell(app, 5, 1);
    await settle(app);
    expect(pausedEvents).toEqual([true, false]);
    expect(contexts).toHaveLength(2);
    expect(contexts[1]).toMatchObject({ startAtMs: 100, playbackRate: 1 });

    clickCell(app, 18, 3);
    await settle(app);
    expect(pausedEvents).toEqual([true, false]);
    expect(rateEvents).toEqual([2]);
    expect(contexts).toHaveLength(3);
    expect(contexts[2]).toMatchObject({ startAtMs: 200, playbackRate: 2 });
    expect(rowText(app, 3)).toBe("|| ────────────── 2x");

    app.events.dispatch({ type: "keydown", key: "3", code: "Digit3" });
    await settle(app);
    expect(rateEvents).toEqual([2, 3]);
    expect(contexts).toHaveLength(4);
    expect(contexts[3]).toMatchObject({ startAtMs: 300, playbackRate: 3 });

    app.dispose();
    graphics.unregister();
  });

  it("suppresses video clicks that trail control-button drags", async () => {
    const pausedEvents: boolean[] = [];
    const rateEvents: number[] = [];
    const source: TVideoFrameSource = async function* (context) {
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          "onUpdate:paused": (paused: boolean) => pausedEvents.push(paused),
          "onUpdate:playbackRate": (rate: number) => rateEvents.push(rate),
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });

    app.mount();
    await settle(app);

    app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 3, button: 0, buttons: 1 });
    app.events.dispatch({ type: "pointerup", cellX: 0, cellY: 1, button: 0, buttons: 0 });
    app.events.dispatch({ type: "click", cellX: 0, cellY: 1, button: 0 });
    await settle(app);
    expect(pausedEvents).toEqual([true]);

    clickCell(app, 5, 1);
    await settle(app);
    expect(pausedEvents).toEqual([true, false]);

    app.events.dispatch({ type: "pointerdown", cellX: 18, cellY: 3, button: 0, buttons: 1 });
    app.events.dispatch({ type: "pointerup", cellX: 18, cellY: 1, button: 0, buttons: 0 });
    app.events.dispatch({ type: "click", cellX: 18, cellY: 1, button: 0 });
    await settle(app);

    expect(rateEvents).toEqual([2]);
    expect(pausedEvents).toEqual([true, false]);

    app.dispose();
  });

  it("only emits play intent from a video click when paused is controlled", async () => {
    const source = vi.fn<TVideoFrameSource>(async function* () {});
    const pausedEvents: boolean[] = [];
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          paused: true,
          "onUpdate:paused": (paused: boolean) => pausedEvents.push(paused),
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });

    app.mount();
    await settle(app);
    expect(source).not.toHaveBeenCalled();

    clickCell(app, 5, 1);
    await settle(app);

    expect(pausedEvents).toEqual([false]);
    expect(source).not.toHaveBeenCalled();
    expect(rowText(app, 3).startsWith("> ")).toBe(true);

    app.dispose();
  });

  it("keeps video clicks active when controls are enabled but the bar cannot fit", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const pausedEvents: boolean[] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 13,
          h: 1,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          "onUpdate:paused": (paused: boolean) => pausedEvents.push(paused),
        }),
    });
    const app = createTerminalApp({ cols: 16, rows: 3, component: App });

    app.mount();
    await settle(app);
    clickCell(app, 5, 0);
    await settle(app);

    expect(pausedEvents).toEqual([true]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.signal.aborted).toBe(true);
    expect(app.events.debugNodes().filter((node) => node.visible && node.focusable)).toHaveLength(
      1,
    );

    app.dispose();
  });

  it("does not make the video clickable or focusable when controls are disabled", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const pausedEvents: boolean[] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          controls: false,
          "onUpdate:paused": (paused: boolean) => pausedEvents.push(paused),
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });

    app.mount();
    await settle(app);
    clickCell(app, 5, 1);
    await settle(app);

    expect(pausedEvents).toEqual([]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.signal.aborted).toBe(false);
    expect(app.events.debugNodes().filter((node) => node.visible && node.focusable)).toHaveLength(
      0,
    );

    app.dispose();
  });

  it("uses one focusable hit area for the video and both cinema control rows", async () => {
    const source: TVideoFrameSource = async function* (context) {
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 2,
          y: 1,
          w: 44,
          h: 6,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          controlsLayout: "cinema",
        }),
    });
    const app = createTerminalApp({ cols: 50, rows: 9, component: App });

    app.mount();
    await settle(app);

    const focusables = app.events
      .debugNodes()
      .filter((node) => node.visible && node.focusable && node.rect.w > 0 && node.rect.h > 0);
    expect(focusables).toHaveLength(1);
    expect(focusables[0]?.rect).toEqual({ x: 2, y: 1, w: 44, h: 6 });

    app.dispose();
  });

  it("maps control cells from the unclipped video origin", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const seekEvents: Array<{ timestampMs: number }> = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TBox, { x: 2, y: 1, w: 24, h: 7, border: true, padding: 0 }, () =>
          h(TVideo, {
            x: -2,
            y: -1,
            w: 20,
            h: 4,
            src: "video.mp4",
            frameSource: source,
            controls: true,
            durationMs: 10_000,
            onSeek: (event: { timestampMs: number }) => seekEvents.push(event),
          }),
        ),
    });
    const app = createTerminalApp({ cols: 30, rows: 10, component: App });

    app.mount();
    await settle(app);

    const hitArea = app.events
      .debugNodes()
      .find((node) => node.visible && node.focusable && node.rect.w > 0 && node.rect.h > 0);
    expect(hitArea?.rect).toEqual({ x: 3, y: 2, w: 18, h: 3 });

    app.events.dispatch({ type: "pointerdown", cellX: 10, cellY: 4, button: 0, buttons: 1 });
    app.events.dispatch({ type: "pointerup", cellX: 10, cellY: 4, button: 0, buttons: 0 });
    app.events.dispatch({ type: "click", cellX: 10, cellY: 4, button: 0 });
    await settle(app);

    expect(seekEvents).toHaveLength(1);
    expect(seekEvents[0]?.timestampMs).toBeCloseTo((6 / 13) * 10_000);
    expect(contexts).toHaveLength(2);

    app.dispose();
  });

  it("coalesces progress dragging into one seek without toggling video playback", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const seekEvents: Array<{ timestampMs: number; durationMs?: number }> = [];
    const pausedEvents: boolean[] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          durationMs: 10_000,
          onSeek: (event: { timestampMs: number; durationMs?: number }) => seekEvents.push(event),
          "onUpdate:paused": (paused: boolean) => pausedEvents.push(paused),
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });

    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(1);
    const track = progressRange(rowText(app, 3));
    const downX = track.x + 1;
    const moveX = track.x + Math.floor((track.width - 1) / 2);
    const upX = track.x + Math.floor(((track.width - 1) * 3) / 4);

    app.events.dispatch({ type: "pointerdown", cellX: downX, cellY: 3, button: 0, buttons: 1 });
    await settle(app);
    expect(contexts).toHaveLength(1);

    app.events.dispatch({ type: "pointermove", cellX: moveX, cellY: 3, button: 0, buttons: 1 });
    app.events.dispatch({ type: "pointermove", cellX: upX, cellY: 3, button: 0, buttons: 1 });
    await settle(app);
    expect(contexts).toHaveLength(1);

    app.events.dispatch({ type: "pointerup", cellX: upX, cellY: 1, button: 0, buttons: 0 });
    app.events.dispatch({ type: "click", cellX: upX, cellY: 1, button: 0 });
    await settle(app);

    const expectedTimestamp = ((upX - track.x) / (track.width - 1)) * 10_000;
    expect(seekEvents).toHaveLength(1);
    expect(seekEvents[0]?.timestampMs).toBeCloseTo(expectedTimestamp);
    expect(seekEvents[0]?.durationMs).toBe(10_000);
    expect(pausedEvents).toEqual([]);
    expect(contexts).toHaveLength(2);
    expect(contexts[1]?.startAtMs).toBeCloseTo(expectedTimestamp);

    app.dispose();
  });

  it("does not seek a progress bar with unknown duration", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const seekEvents: Array<{ timestampMs: number }> = [];
    const pausedEvents: boolean[] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          onSeek: (event: { timestampMs: number }) => seekEvents.push(event),
          "onUpdate:paused": (paused: boolean) => pausedEvents.push(paused),
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });

    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(1);
    const controlsText = rowText(app, 3);
    const track = progressRange(controlsText);

    app.events.dispatch({
      type: "pointerdown",
      cellX: track.x,
      cellY: 3,
      button: 0,
      buttons: 1,
    });
    app.events.dispatch({
      type: "pointermove",
      cellX: track.x + track.width - 1,
      cellY: 3,
      button: 0,
      buttons: 1,
    });
    app.events.dispatch({
      type: "pointerup",
      cellX: track.x + track.width - 1,
      cellY: 3,
      button: 0,
      buttons: 0,
    });
    app.events.dispatch({
      type: "click",
      cellX: track.x + track.width - 1,
      cellY: 3,
      button: 0,
    });
    await settle(app);

    expect(seekEvents).toEqual([]);
    expect(pausedEvents).toEqual([]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.signal.aborted).toBe(false);
    expect(controlsText).toBe("|| ────────────── 1x");

    app.dispose();
  });

  it("decodes one preview frame when seeking while paused and stays paused", async () => {
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const yieldedFrames: number[] = [];
    const source: TVideoFrameSource = async function* (context) {
      const index = contexts.push(context) - 1;
      yieldedFrames[index] = (yieldedFrames[index] ?? 0) + 1;
      yield frame(TINY_PNG_BASE64, context.startAtMs);
      yieldedFrames[index] = (yieldedFrames[index] ?? 0) + 1;
      yield frame(WIDE_PNG_BASE64, context.startAtMs + 100);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: "video.mp4",
          frameSource: source,
          controls: true,
          paused: true,
          durationMs: 7_000,
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(0);
    const track = progressRange(rowText(app, 3));
    const upX = track.x + Math.floor((track.width - 1) / 2);

    app.events.dispatch({ type: "pointerdown", cellX: track.x, cellY: 3, button: 0, buttons: 1 });
    app.events.dispatch({ type: "pointermove", cellX: upX, cellY: 3, button: 0, buttons: 1 });
    app.events.dispatch({ type: "pointerup", cellX: upX, cellY: 3, button: 0, buttons: 0 });
    app.events.dispatch({ type: "click", cellX: upX, cellY: 3, button: 0 });
    await settle(app);

    const expectedTimestamp = ((upX - track.x) / (track.width - 1)) * 7_000;
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.startAtMs).toBeCloseTo(expectedTimestamp);
    expect(yieldedFrames).toEqual([1]);
    expect(rowText(app, 3).startsWith("> ")).toBe(true);

    app.dispose();
    graphics.unregister();
  });

  it("clears a discovered duration when src changes", async () => {
    const src = ref("first.mp4");
    const contexts: Parameters<TVideoFrameSource>[0][] = [];
    const source: TVideoFrameSource = async function* (context) {
      contexts.push(context);
      if (context.src === "first.mp4") {
        yield {
          ...frame(TINY_PNG_BASE64, 5_000),
          durationMs: 10_000,
        };
      }
      await waitForAbort(context.signal);
    };
    const App = defineComponent({
      setup: () => () =>
        h(TVideo, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          src: src.value,
          frameSource: source,
          controls: true,
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 6, component: App });
    const graphics = registerKittyOutput(app);

    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(1);
    expect(rowText(app, 3)).toMatch(/^\|\| ━+╋─+ 1x$/u);

    src.value = "second.mp4";
    await nextTick();
    await settle(app);

    expect(contexts).toHaveLength(2);
    expect(contexts[1]?.src).toBe("second.mp4");
    expect(rowText(app, 3)).toBe("|| ────────────── 1x");

    app.dispose();
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
