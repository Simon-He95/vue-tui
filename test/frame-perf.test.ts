import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import {
  createDomRenderer,
  createFramePerfStore,
  createTerminal,
  TerminalProvider,
  TList,
  TText,
  useTerminal,
  type FramePerfStore,
  type TerminalScheduler,
} from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";
import { TVirtualList } from "../src/experimental.js";

function sample(frameId: number) {
  return {
    frameId,
    reason: "unknown" as const,
    startedAt: frameId,
    durationMs: 1,
    renderManagerMs: 0.5,
    commitMs: 0.5,
    dirtyRows: 1,
    activePlanes: null,
    scannedNodes: 1,
    paintedNodes: 1,
    coalescedInvalidates: 0,
    frameTaskCount: 0,
    coalescedFrameTasks: 0,
    frameTaskQueueDepthBeforeRun: 0,
    frameTaskQueueDepthAfterRun: 0,
    remainingFrameTasks: 0,
    droppedUpdates: 0,
    queueDepth: 0,
  };
}

describe("FramePerfStore", () => {
  it("keeps a bounded ring buffer when enabled", () => {
    const store = createFramePerfStore(2, { enabled: true });

    store.push(sample(1));
    store.push(sample(2));
    store.push(sample(3));

    expect(store.list().map((s) => s.frameId)).toEqual([2, 3]);
    expect(store.latest()?.frameId).toBe(3);

    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("does not collect samples while disabled", () => {
    const store = createFramePerfStore(2);

    store.push(sample(1));
    expect(store.latest()).toBeNull();

    store.enabled.value = true;
    store.push(sample(2));
    expect(store.latest()?.frameId).toBe(2);
  });

  it("keeps frame perf enabled while any lease is active", () => {
    const store = createFramePerfStore();
    const releaseA = store.acquire("a");
    const releaseB = store.acquire("b");

    expect(store.enabled.value).toBe(true);
    releaseA();
    expect(store.enabled.value).toBe(true);
    releaseB();
    expect(store.enabled.value).toBe(false);
  });

  it("does not disable manually enabled frame perf after a lease release", () => {
    const store = createFramePerfStore(120, { enabled: true });
    const release = store.acquire("debug-overlay");

    expect(store.enabled.value).toBe(true);
    release();
    expect(store.enabled.value).toBe(true);
  });

  it("preserves manual enable changes made while a lease is active", () => {
    const store = createFramePerfStore();
    const release = store.acquire("debug-overlay");

    store.enabled.value = true;
    release();

    expect(store.enabled.value).toBe(true);
  });
});

describe("frame perf sampling", () => {
  it("records RenderManager stats for scheduler frames", async () => {
    const value = ref("a");
    let framePerf: FramePerfStore | null = null;

    const App = defineComponent({
      name: "FramePerfApp",
      setup() {
        const ctx = useTerminal();
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () => h(TText, { x: 0, y: 0, w: 10, value: value.value });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      value.value = "b";
      await nextTick();
      app.scheduler.invalidate({ priority: "high", reason: "data", plane: "default" });

      const latest = framePerf!.latest();
      expect(latest).toMatchObject({
        reason: "data",
        dirtyRows: 1,
        scannedNodes: 1,
        paintedNodes: 1,
        activePlanes: ["default"],
      });
      expect(latest!.renderManagerMs).toBeGreaterThanOrEqual(0);
      expect(latest!.commitMs).toBeGreaterThanOrEqual(0);
      expect(latest!.durationMs).toBeGreaterThanOrEqual(latest!.renderManagerMs);
    } finally {
      app.dispose();
    }
  });

  it("does not leak pending frame reason from disabled perf periods", async () => {
    let framePerf: FramePerfStore | null = null;

    const App = defineComponent({
      name: "FramePerfDisabledReasonResetApp",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        return () => h(TText, { x: 0, y: 0, w: 10, value: "reason" });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      framePerf!.enabled.value = false;
      app.scheduler.invalidate({ priority: "low", reason: "scroll", plane: "default" });
      app.scheduler.flushNow();
      expect(framePerf!.latest()).toBeNull();

      framePerf!.enabled.value = true;
      app.scheduler.invalidate({ priority: "high", reason: "data", plane: "default" });

      expect(framePerf!.latest()?.reason).toBe("data");
    } finally {
      app.dispose();
    }
  });

  it("records DOM flush duration for sync commits", () => {
    const terminal = createTerminal({ cols: 4, rows: 1 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    try {
      terminal.write("A", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      expect(renderer.debugStats.flush.count).toBe(1);
      expect(renderer.debugStats.flush.last).toMatchObject({
        mode: "sync",
        planeRows: 4,
        planes: 4,
      });
      expect(renderer.debugStats.flush.last!.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("records scroll reason for TVirtualList wheel frames", async () => {
    let framePerf: FramePerfStore | null = null;
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);

    const App = defineComponent({
      name: "FramePerfVirtualListScrollApp",
      setup() {
        const ctx = useTerminal();
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: items.length,
            itemVersion: 1,
            getItem: (index: number) => items[index],
            autoFocus: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await nextTick();

      expect(framePerf!.latest()?.reason).toBe("scroll");
    } finally {
      app.dispose();
    }
  });

  it("records scroll reason for TList wheel frames", async () => {
    let framePerf: FramePerfStore | null = null;
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);

    const App = defineComponent({
      name: "FramePerfListScrollApp",
      setup() {
        const ctx = useTerminal();
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () => h(TList, { x: 0, y: 0, w: 12, h: 4, items, autoFocus: true });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();

      expect(framePerf!.latest()?.reason).toBe("scroll");
    } finally {
      app.dispose();
    }
  });

  it("prefers higher-priority frame reason when invalidates coalesce", async () => {
    let framePerf: FramePerfStore | null = null;

    const App = defineComponent({
      name: "FramePerfReasonPriorityApp",
      setup() {
        const ctx = useTerminal();
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () => h(TText, { x: 0, y: 0, w: 10, value: "reason" });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      app.scheduler.invalidate({ priority: "low", reason: "data" });
      app.scheduler.invalidate({ priority: "normal", reason: "scroll" });
      app.scheduler.flushNow();

      expect(framePerf!.latest()?.reason).toBe("scroll");
    } finally {
      app.dispose();
    }
  });

  it("records DOM flush duration on TerminalProvider sync frame samples", async () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const callbacks = new Map<number, FrameRequestCallback>();
    let rafId = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = ++rafId;
      callbacks.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      callbacks.delete(id);
    }) as typeof cancelAnimationFrame;

    const root = document.createElement("div");
    document.body.appendChild(root);
    const value = ref("A");
    let framePerf: FramePerfStore | null = null;
    let scheduler: TerminalScheduler | null = null;

    const Probe = defineComponent({
      name: "FramePerfDomProviderProbe",
      setup() {
        const ctx = useTerminal();
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        scheduler = ctx.scheduler;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "FramePerfDomProviderApp",
      setup() {
        return () =>
          h(
            TerminalProvider,
            {
              cols: 20,
              rows: 4,
              domRendererOptions: { syncFlushMaxRows: 20, syncFlushCellBudget: 2_000 },
            },
            {
              default: () => [h(Probe), h(TText, { x: 0, y: 0, w: 10, value: value.value })],
            },
          );
      },
    });

    const app = createApp(App);
    try {
      app.mount(root);
      await nextTick();
      await Promise.resolve();
      scheduler!.flushNow();
      framePerf!.clear();

      value.value = "B";
      await nextTick();
      scheduler!.flushNow();

      const latest = framePerf!.latest();
      expect(latest?.domFlushMs).toBeGreaterThanOrEqual(0);
      expect(latest?.commitMs).toBeGreaterThanOrEqual(0);
    } finally {
      app.unmount();
      root.remove();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });
});
