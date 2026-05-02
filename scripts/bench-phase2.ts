import { Window } from "happy-dom";

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

const win = new Window();
setGlobal("window", win);
setGlobal("document", win.document);
setGlobal("navigator", win.navigator);
setGlobal("Node", win.Node);
setGlobal("Element", win.Element);
setGlobal("HTMLElement", win.HTMLElement);
setGlobal("SVGElement", win.SVGElement);
setGlobal("Event", win.Event);
setGlobal("EventTarget", win.EventTarget);
setGlobal("CustomEvent", win.CustomEvent);
setGlobal("MouseEvent", win.MouseEvent);
setGlobal("KeyboardEvent", win.KeyboardEvent);
setGlobal("WheelEvent", win.WheelEvent);
setGlobal("getComputedStyle", win.getComputedStyle.bind(win));
setGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
});
setGlobal("cancelAnimationFrame", () => {});

type RafHarness = Readonly<{
  scheduledRafFrames: () => number;
  pendingRafFrames: () => number;
  flushOneFrame: (time?: number) => number;
  restore: () => void;
}>;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function installCountingSyncRaf(): RafHarness {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let scheduled = 0;

  setGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    scheduled++;
    cb(now());
    return scheduled;
  });
  setGlobal("cancelAnimationFrame", () => {});

  return {
    scheduledRafFrames: () => scheduled,
    pendingRafFrames: () => 0,
    flushOneFrame: () => 0,
    restore: () => {
      setGlobal("requestAnimationFrame", previousRaf);
      setGlobal("cancelAnimationFrame", previousCancel);
    },
  };
}

function installManualRaf(): RafHarness {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  let scheduled = 0;

  setGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const nextId = ++id;
    scheduled++;
    callbacks.set(nextId, cb);
    return nextId;
  });
  setGlobal("cancelAnimationFrame", (rafId: number) => {
    callbacks.delete(rafId);
  });

  return {
    scheduledRafFrames: () => scheduled,
    pendingRafFrames: () => callbacks.size,
    flushOneFrame: (time = now()) => {
      const pending = Array.from(callbacks.entries());
      callbacks.clear();
      for (const [, cb] of pending) cb(time);
      return pending.length;
    },
    restore: () => {
      setGlobal("requestAnimationFrame", previousRaf);
      setGlobal("cancelAnimationFrame", previousCancel);
    },
  };
}

const { createApp, defineComponent, h, nextTick, ref } = await import("vue");
const {
  createDomRenderer,
  createTerminal,
  createTerminalApp,
  TerminalProvider,
  TText,
  useTerminal,
} = await import("../src/index.js");
const { createAppendOnlyLogStore, TLogView, TVirtualList } = await import("../src/experimental.js");
const { createRenderManager } = await import("../src/vue/render/render-manager.js");

function round(n: number): number {
  return Number(n.toFixed(3));
}

function summarizeSamples(samples: any[]): Record<string, number> {
  if (!samples.length) {
    return {
      frames: 0,
      avgFrameMs: 0,
      maxFrameMs: 0,
      avgRenderManagerMs: 0,
      avgCommitMs: 0,
      avgDirtyRows: 0,
      avgScannedNodes: 0,
      avgPaintedNodes: 0,
      avgCoalescedInvalidates: 0,
      avgFrameTaskCount: 0,
      avgCoalescedFrameTasks: 0,
    };
  }
  const total = samples.reduce(
    (acc, sample) => {
      acc.frame += sample.durationMs;
      acc.render += sample.renderManagerMs;
      acc.commit += sample.commitMs;
      acc.dirty += sample.dirtyRows ?? 0;
      acc.scanned += sample.scannedNodes;
      acc.painted += sample.paintedNodes;
      acc.coalescedInvalidates += sample.coalescedInvalidates ?? 0;
      acc.frameTasks += sample.frameTaskCount ?? 0;
      acc.coalescedFrameTasks += sample.coalescedFrameTasks ?? 0;
      if (sample.durationMs > acc.maxFrame) acc.maxFrame = sample.durationMs;
      return acc;
    },
    {
      frame: 0,
      render: 0,
      commit: 0,
      dirty: 0,
      scanned: 0,
      painted: 0,
      coalescedInvalidates: 0,
      frameTasks: 0,
      coalescedFrameTasks: 0,
      maxFrame: 0,
    },
  );
  return {
    frames: samples.length,
    avgFrameMs: round(total.frame / samples.length),
    maxFrameMs: round(total.maxFrame),
    avgRenderManagerMs: round(total.render / samples.length),
    avgCommitMs: round(total.commit / samples.length),
    avgDirtyRows: round(total.dirty / samples.length),
    avgScannedNodes: round(total.scanned / samples.length),
    avgPaintedNodes: round(total.painted / samples.length),
    avgCoalescedInvalidates: round(total.coalescedInvalidates / samples.length),
    avgFrameTaskCount: round(total.frameTasks / samples.length),
    avgCoalescedFrameTasks: round(total.coalescedFrameTasks / samples.length),
  };
}

async function benchRenderManagerDirtyRow(): Promise<Record<string, unknown>> {
  const rows = 1000;
  const cols = 80;
  const terminal = createTerminal({ cols, rows });
  const render = createRenderManager(terminal);
  const nodes = Array.from({ length: rows }, (_, y) =>
    render.register({
      stack: render.rootStack,
      rect: { x: 0, y, w: cols, h: 1 },
      paint: () => terminal.write(`row ${y}`, { x: 0, y }),
    }),
  );
  render.render();
  terminal.commit();

  const target = nodes[500]!;
  const startedAt = now();
  render.update(target.id, { dirtyRowsHint: [500] });
  const stats = render.render();
  const dirtyRows = terminal.commit({ sync: true });
  const durationMs = now() - startedAt;

  return {
    name: "render-manager-1000-nodes-dirty-1-row",
    durationMs: round(durationMs),
    dirtyRows: dirtyRows === null ? null : dirtyRows.length,
    scannedNodes: stats?.scannedNodes ?? 0,
    paintedNodes: stats?.paintedNodes ?? 0,
  };
}

async function benchVirtualList(
  itemCount: number,
  mode: "spaced" | "burst",
): Promise<Record<string, unknown>> {
  let framePerf: any = null;
  let finalTop = 0;
  const dispatchedEvents = 100;
  const acceptedTickGapMs = 10;
  const getItem = (index: number) => `item-${index}`;
  const raf = mode === "burst" ? installManualRaf() : installCountingSyncRaf();

  const App = defineComponent({
    name: `BenchVirtualList${itemCount}${mode}`,
    setup() {
      const ctx = useTerminal();
      framePerf = ctx.observability.framePerf;
      framePerf.enabled.value = true;
      return () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          itemCount,
          itemVersion: 1,
          getItem,
          autoFocus: true,
          onScroll: (top: number) => {
            finalTop = top;
          },
        });
    },
  });

  const app = createTerminalApp({ cols: 80, rows: 24, component: App as any });
  try {
    app.mount();
    await nextTick();
    app.scheduler.flushNow();
    framePerf.clear();

    const startedAt = now();
    for (let i = 0; i < dispatchedEvents; i++) {
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: startedAt + i * acceptedTickGapMs,
      });
      if (mode === "spaced") await nextTick();
    }
    const framesBeforeRafFlush = framePerf.list().length;
    const pendingRafFramesBeforeFlush = raf.pendingRafFrames();
    const flushedRafCallbacks =
      mode === "burst" ? raf.flushOneFrame(startedAt + dispatchedEvents * acceptedTickGapMs) : 0;
    if (mode === "burst") await nextTick();
    const durationMs = now() - startedAt;
    const samples = framePerf.list();
    const acceptedScrollFrames = samples.filter((sample: any) => sample.reason === "scroll").length;

    return {
      name: `virtual-list-${itemCount}-rows-wheel-${mode}-100`,
      dispatchedEvents,
      acceptedTickGapMs,
      scheduledRafFrames: raf.scheduledRafFrames(),
      pendingRafFramesBeforeFlush,
      flushedRafCallbacks,
      framesBeforeRafFlush,
      acceptedScrollFrames,
      coalescingRatio: round(dispatchedEvents / Math.max(1, acceptedScrollFrames)),
      finalTop,
      durationMs: round(durationMs),
      ...summarizeSamples(samples),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchDomVirtualList(
  itemCount: number,
  rowScrollMode: "off" | "unsafe-full-row",
): Promise<Record<string, unknown>> {
  let framePerf: any = null;
  let rendererRef: any = null;
  let finalTop = 0;
  let lastFlushCount = 0;
  let domFlushPlaneRows = 0;
  let domFlushSamples = 0;
  const dispatchedEvents = 100;
  const getItem = (index: number) => `item-${index}`;
  const root = document.createElement("div");
  document.body.appendChild(root);

  const Probe = defineComponent({
    name: `BenchDomVirtualList${itemCount}${rowScrollMode}`,
    setup() {
      const ctx = useTerminal();
      framePerf = ctx.observability.framePerf;
      rendererRef = ctx.renderer;
      framePerf.enabled.value = true;
      return () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          itemCount,
          itemVersion: 1,
          getItem,
          autoFocus: true,
          rowScrollMode,
          onScroll: (top: number) => {
            finalTop = top;
          },
        });
    },
  });

  const app = createApp({
    name: "BenchDomVirtualListRoot",
    render() {
      return h(TerminalProvider, { cols: 80, rows: 24 }, { default: () => h(Probe) });
    },
  });

  function collectDomFlush(): void {
    const flush = rendererRef?.value?.debugStats?.flush;
    if (!flush || flush.count === lastFlushCount || !flush.last) return;
    lastFlushCount = flush.count;
    domFlushPlaneRows += flush.last.planeRows;
    domFlushSamples++;
  }

  try {
    app.mount(root);
    await nextTick();
    framePerf.clear();
    collectDomFlush();

    const container = root.querySelector("[data-vt-container]") as HTMLElement | null;
    if (!container) throw new Error("DOM terminal container not mounted");

    const startedAt = now();
    for (let i = 0; i < dispatchedEvents; i++) {
      const wheel = new Event("wheel", {
        bubbles: true,
        cancelable: true,
      }) as any;
      Object.defineProperties(wheel, {
        clientX: { value: 0 },
        clientY: { value: 0 },
        deltaY: { value: 100 },
        deltaMode: { value: 0 },
      });
      container.dispatchEvent(wheel);
      await nextTick();
      collectDomFlush();
    }
    const durationMs = now() - startedAt;
    const samples = framePerf.list();
    const acceptedScrollFrames = samples.filter((sample: any) => sample.reason === "scroll").length;

    return {
      name: `dom-virtual-list-${itemCount}-rows-${rowScrollMode}-wheel-100`,
      dispatchedEvents,
      acceptedScrollFrames,
      coalescingRatio: round(dispatchedEvents / Math.max(1, acceptedScrollFrames)),
      finalTop,
      durationMs: round(durationMs),
      avgDomFlushPlaneRows: round(domFlushPlaneRows / Math.max(1, domFlushSamples)),
      ...summarizeSamples(samples),
    };
  } finally {
    app.unmount();
    root.remove();
  }
}

function benchDomSyncFlush(dirtyRowCount: number): Record<string, unknown> {
  const terminal = createTerminal({ cols: 80, rows: 40 });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = createDomRenderer(terminal, container);

  try {
    for (let y = 0; y < dirtyRowCount; y++) terminal.write(`row ${y}`, { x: 0, y });
    const startedAt = now();
    const dirtyRows = terminal.commit({ sync: true });
    const durationMs = now() - startedAt;
    const flush = renderer.debugStats.flush.last;

    return {
      name: `dom-sync-flush-${dirtyRowCount}-dirty-rows`,
      durationMs: round(durationMs),
      dirtyRows: dirtyRows === null ? null : dirtyRows.length,
      domFlushMs: flush ? round(flush.durationMs) : null,
      domFlushPlaneRows: flush?.planeRows ?? 0,
      syncPerformed: renderer.debugStats.syncFlush.last?.performed ?? false,
    };
  } finally {
    renderer.dispose();
    container.remove();
  }
}

async function benchAppendOnly(): Promise<Record<string, unknown>> {
  const lines = ref<string[]>([]);
  let framePerf: any = null;

  const App = defineComponent({
    name: "BenchAppendOnly",
    setup() {
      const ctx = useTerminal();
      framePerf = ctx.observability.framePerf;
      framePerf.enabled.value = true;
      return () => {
        const tail = lines.value.slice(-20);
        return tail.map((line, index) =>
          h(TText, { key: index, x: 0, y: index, w: 80, value: line }),
        );
      };
    },
  });

  const app = createTerminalApp({ cols: 80, rows: 24, component: App as any });
  try {
    app.mount();
    await nextTick();
    app.scheduler.flushNow();
    framePerf.clear();

    const startedAt = now();
    for (let i = 0; i < 1000; i++) {
      lines.value = [...lines.value, `line ${i}`];
      await nextTick();
      app.scheduler.flushNow();
    }
    const durationMs = now() - startedAt;

    return {
      name: "append-only-1000-lines-simulated",
      durationMs: round(durationMs),
      ...summarizeSamples(framePerf.list()),
    };
  } finally {
    app.dispose();
  }
}

async function benchDomTLogView(
  mode: "stick-bottom" | "not-bottom" | "burst",
): Promise<Record<string, unknown>> {
  let framePerf: any = null;
  let rendererRef: any = null;
  let finalTop = 0;
  let atBottom = true;
  let lastFlushCount = 0;
  let domFlushPlaneRows = 0;
  let domFlushSamples = 0;
  let getLineCalls = 0;
  const appendCount = 1000;
  const log = createAppendOnlyLogStore();
  log.appendLines(Array.from({ length: 1000 }, (_, index) => `seed ${index}`));
  const source = {
    lineCount: () => log.source.lineCount(),
    getLine(index: number) {
      getLineCalls++;
      return log.source.getLine(index);
    },
  };
  const root = document.createElement("div");
  document.body.appendChild(root);
  let raf = installCountingSyncRaf();

  const Probe = defineComponent({
    name: `BenchDomTLogView${mode}`,
    setup() {
      const ctx = useTerminal();
      framePerf = ctx.observability.framePerf;
      rendererRef = ctx.renderer;
      framePerf.enabled.value = true;
      return () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          source,
          version: log.version.value,
          autoFocus: true,
          rowScrollMode: "unsafe-full-row",
          onScroll: (payload: { scrollTop: number; atBottom: boolean }) => {
            finalTop = payload.scrollTop;
            atBottom = payload.atBottom;
          },
        });
    },
  });

  const app = createApp({
    name: "BenchDomTLogViewRoot",
    render() {
      return h(TerminalProvider, { cols: 80, rows: 24 }, { default: () => h(Probe) });
    },
  });

  function collectDomFlush(): void {
    const flush = rendererRef?.value?.debugStats?.flush;
    if (!flush || flush.count === lastFlushCount || !flush.last) return;
    lastFlushCount = flush.count;
    domFlushPlaneRows += flush.last.planeRows;
    domFlushSamples++;
  }

  try {
    app.mount(root);
    await nextTick();
    collectDomFlush();

    const container = root.querySelector("[data-vt-container]") as HTMLElement | null;
    if (!container) throw new Error("DOM terminal container not mounted");

    if (mode === "not-bottom") {
      const wheel = new Event("wheel", { bubbles: true, cancelable: true }) as any;
      Object.defineProperties(wheel, {
        clientX: { value: 0 },
        clientY: { value: 0 },
        deltaY: { value: -300 },
        deltaMode: { value: 0 },
      });
      container.dispatchEvent(wheel);
      await nextTick();
      collectDomFlush();
    }

    if (mode === "burst") {
      raf.restore();
      raf = installManualRaf();
    }

    framePerf.clear();
    getLineCalls = 0;
    lastFlushCount = rendererRef?.value?.debugStats?.flush.count ?? 0;
    domFlushPlaneRows = 0;
    domFlushSamples = 0;

    const startedAt = now();
    for (let i = 0; i < appendCount; i++) {
      log.appendLine(`${mode} ${i}`);
      if (mode === "burst") {
        await nextTick();
      } else {
        await nextTick();
        collectDomFlush();
      }
    }
    const pendingRafFramesBeforeFlush = raf.pendingRafFrames();
    const flushedRafCallbacks = mode === "burst" ? raf.flushOneFrame() : 0;
    if (mode === "burst") {
      await nextTick();
      collectDomFlush();
    }
    const durationMs = now() - startedAt;
    const samples = framePerf.list();

    return {
      name: `tlog-view-1000-lines-${mode}`,
      appendCount,
      scheduledRafFrames: raf.scheduledRafFrames(),
      pendingRafFramesBeforeFlush,
      flushedRafCallbacks,
      durationMs: round(durationMs),
      avgDomFlushPlaneRows: round(domFlushPlaneRows / Math.max(1, domFlushSamples)),
      coalescedFrameTasks: samples.reduce(
        (acc: number, sample: any) => acc + (sample.coalescedFrameTasks ?? 0),
        0,
      ),
      frameTaskCount: samples.reduce(
        (acc: number, sample: any) => acc + (sample.frameTaskCount ?? 0),
        0,
      ),
      finalTop,
      atBottom,
      getLineCalls,
      ...summarizeSamples(samples),
    };
  } finally {
    app.unmount();
    root.remove();
    raf.restore();
  }
}

async function main(): Promise<void> {
  const scenarios = [
    await benchRenderManagerDirtyRow(),
    await benchVirtualList(10_000, "spaced"),
    await benchVirtualList(10_000, "burst"),
    await benchVirtualList(100_000, "spaced"),
    await benchVirtualList(100_000, "burst"),
    await benchDomVirtualList(100_000, "off"),
    await benchDomVirtualList(100_000, "unsafe-full-row"),
    ...[1, 5, 20, 40].map((rows) => benchDomSyncFlush(rows)),
    await benchAppendOnly(),
    await benchDomTLogView("stick-bottom"),
    await benchDomTLogView("not-bottom"),
    await benchDomTLogView("burst"),
  ];

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        tag: "vue-tui-phase2-benchmark",
        generatedAt: new Date().toISOString(),
        scenarios,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
