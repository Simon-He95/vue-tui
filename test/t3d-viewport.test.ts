import type { T3DRenderContext, T3DRenderer, T3DViewportHandle } from "../src/experimental.js";
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { T3DViewport } from "../src/experimental.js";
import { createTerminalApp } from "../src/cli.js";
import {
  detectTerminalGraphicsCapabilities,
  registerTerminalGraphicsOutput,
} from "../src/renderer/terminal-graphics.js";

const TINY_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  ),
);

async function settle(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    app.scheduler.flushNow();
  }
}
function grayFrame(context: T3DRenderContext, value = 255) {
  return {
    format: "gray8" as const,
    pixels: new Uint8Array(context.pixelWidth * context.pixelHeight).fill(value),
    pixelWidth: context.pixelWidth,
    pixelHeight: context.pixelHeight,
  };
}
afterEach(() => vi.useRealTimers());

describe("T3DViewport", () => {
  it("pulls with TVideo dimensions, format, timing, and motion context", async () => {
    const contexts: T3DRenderContext[] = [];
    const renderer: T3DRenderer = {
      render: (context) => {
        contexts.push(context);
        return grayFrame(context);
      },
    };
    const App = defineComponent({
      setup: () => () =>
        h(T3DViewport, {
          x: 0,
          y: 0,
          w: 8,
          h: 3,
          pixelWidth: 80,
          pixelHeight: 40,
          maxFps: 7,
          autoRotate: false,
          renderer,
        }),
    });
    const app = createTerminalApp({ cols: 12, rows: 6, component: App });
    app.mount();
    await settle(app);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      frame: 0,
      deltaMs: 0,
      pixelWidth: 4,
      pixelHeight: 3,
      format: "gray8",
    });
    expect(contexts[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(contexts[0]!.motion).toEqual({
      yaw: 0,
      pitch: 0,
      yawVelocity: 0,
      pitchVelocity: 0,
      pointerX: 0,
      pointerY: 0,
      pointerSpeed: 0,
      hovering: false,
      zoom: 1,
      zoomVelocity: 0,
      hoveredObjectId: null,
      selectedObjectId: null,
    });
    app.dispose();
  });

  it("delegates gray8 frames to TVideo ASCII output and forwards frame", async () => {
    const onFrame = vi.fn();
    const renderer: T3DRenderer = {
      render: (context) => grayFrame(context, 255),
    };
    const App = defineComponent({
      setup: () => () => h(T3DViewport, { x: 1, y: 1, w: 6, h: 2, renderer, onFrame }),
    });
    const app = createTerminalApp({ cols: 10, rows: 5, component: App });
    app.mount();
    await settle(app);
    expect(app.terminal.snapshot().lines.slice(1, 3).join("\n")).toContain("@@@");
    expect(onFrame).toHaveBeenCalledOnce();
    app.dispose();
  });

  it("serializes pulls when TVideo switches format during an active render", async () => {
    const contexts: T3DRenderContext[] = [];
    let active = 0;
    let maxActive = 0;
    let releaseFirst = () => {};
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const renderer: T3DRenderer = {
      render: async (context) => {
        contexts.push(context);
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          if (contexts.length === 1) await firstBlocked;
          if (context.signal.aborted) {
            const error = new Error("aborted");
            error.name = "AbortError";
            throw error;
          }
          return context.format === "png"
            ? { png: TINY_PNG, timestampMs: context.timeMs }
            : grayFrame(context);
        } finally {
          active--;
        }
      },
    };
    const App = defineComponent({
      setup: () => () => h(T3DViewport, { x: 0, y: 0, w: 8, h: 3, renderer }),
    });
    const app = createTerminalApp({ cols: 12, rows: 6, component: App });
    app.mount();
    await settle(app);
    expect(contexts.map((context) => context.format)).toEqual(["gray8"]);

    const unregister = registerTerminalGraphicsOutput(app.terminal, {
      capabilities: detectTerminalGraphicsCapabilities({
        protocol: "kitty",
        force: true,
        stdoutIsTTY: true,
      }),
      queue: () => true,
      clear: () => true,
      isActive: () => false,
    });
    await settle(app);
    expect(contexts).toHaveLength(1);
    expect(maxActive).toBe(1);

    releaseFirst();
    await settle(app);
    expect(contexts.length).toBeGreaterThanOrEqual(2);
    expect(contexts[0]!.format).toBe("gray8");
    expect(contexts.slice(1).every((context) => context.format === "png")).toBe(true);
    expect(maxActive).toBe(1);
    unregister();
    app.dispose();
  });

  it("uses cell deltas and timestamps for drag direction and velocity", async () => {
    const contexts: T3DRenderContext[] = [];
    const renderer: T3DRenderer = {
      render: (context) => {
        contexts.push(context);
        return grayFrame(context);
      },
    };
    const App = defineComponent({
      setup: () => () =>
        h(T3DViewport, {
          x: 2,
          y: 1,
          w: 10,
          h: 4,
          maxFps: 10,
          autoRotate: false,
          pointerSensitivity: 0.1,
          renderer,
        }),
    });
    const app = createTerminalApp({ cols: 16, rows: 8, component: App });
    app.mount();
    await settle(app);
    app.events.dispatch({
      type: "pointermove",
      cellX: 3,
      cellY: 2,
      time: 900,
    } as any);
    app.events.dispatch({
      type: "pointerdown",
      cellX: 3,
      cellY: 2,
      button: 0,
      buttons: 1,
      time: 1_000,
    } as any);
    app.events.dispatch({
      type: "pointermove",
      cellX: 7,
      cellY: 4,
      button: 0,
      buttons: 1,
      time: 1_100,
    } as any);
    app.events.dispatch({
      type: "pointerup",
      cellX: 7,
      cellY: 4,
      button: 0,
      buttons: 0,
      time: 1_100,
    } as any);
    await new Promise((resolve) => setTimeout(resolve, 110));
    await settle(app);
    const motion = contexts.at(-1)!.motion;
    expect(motion.yaw).toBeGreaterThan(0.4);
    expect(motion.pitch).toBeGreaterThan(0.2);
    expect(motion.yawVelocity).toBeGreaterThan(0);
    expect(motion.pitchVelocity).toBeGreaterThan(0);
    expect(motion.pointerX).toBeGreaterThan(0);
    expect(motion.pointerY).toBeGreaterThan(0);
    expect(motion.pointerSpeed).toBeGreaterThan(0);
    expect(motion.hovering).toBe(true);
    app.dispose();
  });

  it("steers orbit and inertia from hover position and pointer speed", async () => {
    const contexts: T3DRenderContext[] = [];
    const renderer: T3DRenderer = {
      render: (context) => {
        contexts.push(context);
        return grayFrame(context);
      },
    };
    const App = defineComponent({
      setup: () => () =>
        h(T3DViewport, {
          x: 1,
          y: 1,
          w: 12,
          h: 5,
          maxFps: 10,
          autoRotate: false,
          pointerSensitivity: 0.1,
          renderer,
        }),
    });
    const app = createTerminalApp({ cols: 16, rows: 8, component: App });
    app.mount();
    await settle(app);
    app.events.dispatch({
      type: "pointermove",
      cellX: 3,
      cellY: 4,
      time: 1_000,
    } as any);
    app.events.dispatch({
      type: "pointermove",
      cellX: 11,
      cellY: 2,
      time: 1_080,
    } as any);
    await new Promise((resolve) => setTimeout(resolve, 110));
    await settle(app);
    const motion = contexts.at(-1)!.motion;
    expect(motion.hovering).toBe(true);
    expect(motion.pointerX).toBeGreaterThan(0);
    expect(motion.pointerY).toBeLessThan(0);
    expect(motion.pointerSpeed).toBeGreaterThan(0);
    expect(motion.yawVelocity).toBeGreaterThan(0);
    expect(motion.pitchVelocity).toBeLessThan(0);
    app.dispose();
  });

  it("zooms smoothly from wheel gestures, clamps bounds, and resets motion", async () => {
    const contexts: T3DRenderContext[] = [];
    const handle = ref<T3DViewportHandle>();
    const renderer: T3DRenderer = {
      render: (context) => {
        contexts.push(context);
        return grayFrame(context);
      },
    };
    const App = defineComponent({
      setup: () => () =>
        h(T3DViewport, {
          ref: handle,
          x: 1,
          y: 1,
          w: 10,
          h: 4,
          maxFps: 20,
          autoRotate: false,
          initialZoom: 0.9,
          minZoom: 0.8,
          maxZoom: 1.2,
          zoomSensitivity: 0.2,
          renderer,
        }),
    });
    const app = createTerminalApp({ cols: 14, rows: 7, component: App });
    app.mount();
    await settle(app);
    expect(contexts.at(-1)!.motion).toMatchObject({ zoom: 0.9, zoomVelocity: 0 });

    const prevented = app.events.dispatch({
      type: "wheel",
      cellX: 4,
      cellY: 2,
      deltaY: -1,
      deltaMode: 1,
      time: 1_000,
    });
    expect(prevented).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await settle(app);
    expect(contexts.at(-1)!.motion.zoom).toBeGreaterThan(0.9);
    expect(contexts.at(-1)!.motion.zoomVelocity).toBeGreaterThan(0);

    for (let index = 0; index < 8; index++) {
      app.events.dispatch({
        type: "wheel",
        cellX: 4,
        cellY: 2,
        deltaY: 1,
        deltaMode: 1,
        time: 1_100 + index * 10,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
    await settle(app);
    expect(contexts.at(-1)!.motion.zoom).toBe(0.8);
    expect(contexts.at(-1)!.motion.zoomVelocity).toBe(0);

    handle.value?.resetMotion();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await settle(app);
    expect(contexts.at(-1)!.motion).toMatchObject({ zoom: 0.9, zoomVelocity: 0 });
    app.dispose();
  });

  it("aborts active pulls, disposes the renderer, and exposes resetMotion", async () => {
    let signal: AbortSignal | undefined;
    const dispose = vi.fn();
    const handle = ref<T3DViewportHandle>();
    const renderer: T3DRenderer = {
      render: (context) => {
        signal = context.signal;
        return grayFrame(context);
      },
      dispose,
    };
    const App = defineComponent({
      setup: () => () => h(T3DViewport, { ref: handle, x: 0, y: 0, w: 6, h: 2, renderer }),
    });
    const app = createTerminalApp({ cols: 8, rows: 4, component: App });
    app.mount();
    await settle(app);
    expect(handle.value?.resetMotion).toBeTypeOf("function");
    handle.value?.resetMotion();
    expect(signal?.aborted).toBe(false);
    app.dispose();
    expect(signal?.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("aborts a pending child pull before disposing the renderer", async () => {
    const order: string[] = [];
    const renderer: T3DRenderer = {
      render: (context) =>
        new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => {
              order.push("abort");
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        }),
      dispose: () => order.push("dispose"),
    };
    const App = defineComponent({
      setup: () => () => h(T3DViewport, { x: 0, y: 0, w: 6, h: 2, renderer }),
    });
    const app = createTerminalApp({ cols: 8, rows: 4, component: App });
    app.mount();
    await settle(app);
    app.dispose();
    await Promise.resolve();
    expect(order).toEqual(["abort", "dispose"]);
  });

  it("keeps the renderer init-only and disposes the captured instance", async () => {
    const firstRender = vi.fn((context: T3DRenderContext) => grayFrame(context));
    const secondRender = vi.fn((context: T3DRenderContext) => grayFrame(context));
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const renderer = shallowRef<T3DRenderer>({
      render: firstRender,
      dispose: firstDispose,
    });
    const App = defineComponent({
      setup: () => () =>
        h(T3DViewport, {
          x: 0,
          y: 0,
          w: 6,
          h: 2,
          maxFps: 10,
          renderer: renderer.value,
        }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = createTerminalApp({ cols: 8, rows: 4, component: App });
    app.mount();
    await settle(app);
    renderer.value = { render: secondRender, dispose: secondDispose };
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 110));
    await settle(app);
    expect(firstRender.mock.calls.length).toBeGreaterThan(1);
    expect(secondRender).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[vue-tui] T3DViewport renderer is init-only. Remount T3DViewport to replace it.",
    );
    app.dispose();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("forwards renderer errors through TVideo", async () => {
    const failure = new Error("scene failed");
    const onError = vi.fn();
    const renderer: T3DRenderer = {
      render: async () => {
        throw failure;
      },
    };
    const App = defineComponent({
      setup: () => () =>
        h(T3DViewport, {
          x: 0,
          y: 0,
          w: 8,
          h: 2,
          fallback: "3D unavailable",
          renderer,
          onError,
        }),
    });
    const app = createTerminalApp({ cols: 16, rows: 4, component: App });
    app.mount();
    await settle(app);
    app.scheduler.flushNow();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(app.terminal.snapshot().lines.join("\n")).toContain("3D unava");
    app.dispose();
  });
});
