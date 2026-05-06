import assert from "node:assert/strict";
import { defineComponent, h, nextTick, ref, vShow, withDirectives } from "vue";
import { createTerminalApp, TList, TText, useTerminal } from "../src/index.js";
import { createFrameMailbox } from "../src/vue/scheduler/frame-mailbox.js";

function installManualRaf() {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  let scheduled = 0;

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const nextId = ++id;
    scheduled++;
    callbacks.set(nextId, cb);
    return nextId;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((rafId: number) => {
    callbacks.delete(rafId);
  }) as typeof cancelAnimationFrame;

  return {
    scheduled: () => scheduled,
    pending: () => callbacks.size,
    flush(time = 0) {
      const pending = Array.from(callbacks.entries());
      callbacks.clear();
      for (const [, cb] of pending) cb(time);
      return pending.length;
    },
    restore() {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

function rowText(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

async function benchTListBurstWheel() {
  const raf = installManualRaf();
  const items = Array.from({ length: 10_000 }, (_, index) => `item-${index}`);
  let updateModelValue = 0;
  let scroll = 0;
  let commits = 0;
  let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

  const Probe = defineComponent({
    name: "BenchScrollMailboxProbe",
    setup() {
      framePerf = useTerminal().observability.framePerf;
      framePerf.enabled.value = true;
      return () => null;
    },
  });
  const App = defineComponent({
    name: "BenchScrollMailboxList",
    setup() {
      return () => [
        h(Probe),
        h(TList, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          items,
          modelValue: 0,
          autoFocus: true,
          onScroll: () => scroll++,
          "onUpdate:modelValue": () => updateModelValue++,
        }),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 24, component: App });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf!.clear();
    const off = app.terminal.on("commit", () => commits++);

    const startedAt = performance.now();
    for (let i = 0; i < 100; i++) {
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_000 + i * 10,
      });
    }
    const eventDispatchMs = performance.now() - startedAt;
    const commitsBeforeFrame = commits;
    raf.flush();
    await nextTick();
    off();
    const frame = framePerf!.latest();

    return {
      eventDispatchMs,
      scroll,
      updateModelValue,
      commitsBeforeFrame,
      commitsAfterFrame: commits,
      firstVisibleRow: rowText(app, 0),
      framePerf: frame,
      metrics: {
        frameDurationMs: frame?.durationMs,
        renderManagerMs: frame?.renderManagerMs,
        commitMs: frame?.commitMs,
        dirtyRows: frame?.dirtyRows,
        scannedNodes: frame?.scannedNodes,
        paintedNodes: frame?.paintedNodes,
        droppedUpdates: frame?.droppedUpdates,
      },
      scheduledFrames: raf.scheduled(),
      pendingFrames: raf.pending(),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchConcurrentMailboxes() {
  const raf = installManualRaf();
  const order: string[] = [];
  let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;
  let scheduler: ReturnType<typeof useTerminal>["scheduler"] | null = null;

  const Probe = defineComponent({
    name: "BenchConcurrentMailboxProbe",
    setup() {
      const ctx = useTerminal();
      scheduler = ctx.scheduler;
      framePerf = ctx.observability.framePerf;
      framePerf.enabled.value = true;
      return () => null;
    },
  });
  const app = createTerminalApp({ cols: 20, rows: 4, component: Probe });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf!.clear();

    const input = createFrameMailbox<number>({
      scheduler: scheduler!,
      id: "bench:input",
      reason: "input",
      priority: "high",
      apply(value, ctx, meta) {
        order.push(`input:${value}:dropped=${meta.dropped}`);
        ctx.invalidate({ priority: "high", reason: "input" });
      },
    });
    const scroll = createFrameMailbox<number>({
      scheduler: scheduler!,
      id: "bench:scroll",
      reason: "scroll",
      priority: "high",
      apply(value, ctx, meta) {
        order.push(`scroll:${value}:dropped=${meta.dropped}`);
        ctx.invalidate({ priority: "high", reason: "scroll" });
      },
    });
    const stream = createFrameMailbox<number>({
      scheduler: scheduler!,
      id: "bench:stream",
      reason: "data",
      priority: "low",
      apply(value, ctx, meta) {
        order.push(`stream:${value}:dropped=${meta.dropped}`);
        ctx.invalidate({ priority: "low", reason: "data" });
      },
    });

    for (let i = 0; i < 20; i++) input.queue(i);
    for (let i = 0; i < 100; i++) scroll.queue(i);
    for (let i = 0; i < 500; i++) stream.queue(i);
    raf.flush();
    await nextTick();

    return {
      order,
      framePerf: framePerf!.latest(),
      scheduledFrames: raf.scheduled(),
      pendingFrames: raf.pending(),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchTListManySamePlaneSiblings() {
  const raf = installManualRaf();
  const items = Array.from({ length: 10_000 }, (_, index) => `item-${index}`);
  let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

  const Probe = defineComponent({
    name: "BenchManySiblingsFramePerfProbe",
    setup() {
      framePerf = useTerminal().observability.framePerf;
      framePerf.enabled.value = true;
      return () => null;
    },
  });
  const App = defineComponent({
    name: "BenchTListManySamePlaneSiblings",
    setup() {
      return () => [
        h(Probe),
        h(TList, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          items,
          modelValue: 0,
          autoFocus: true,
        }),
        ...Array.from({ length: 300 }, (_, index) =>
          h(TText, {
            key: `sibling-${index}`,
            x: index % 80,
            y: 23,
            w: 1,
            value: "x",
          }),
        ),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 24, component: App });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf!.clear();

    for (let i = 0; i < 100; i++) {
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_000 + i * 10,
      });
    }
    raf.flush();
    await nextTick();

    return {
      framePerf: framePerf!.latest(),
      scheduledFrames: raf.scheduled(),
      pendingFrames: raf.pending(),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchMultipleTListInstances() {
  const raf = installManualRaf();
  const items = Array.from({ length: 10_000 }, (_, index) => `item-${index}`);
  const scrolls = [0, 0];
  const updates = [0, 0];
  let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

  const Probe = defineComponent({
    name: "BenchMultipleTListProbe",
    setup() {
      framePerf = useTerminal().observability.framePerf;
      framePerf.enabled.value = true;
      return () => null;
    },
  });
  const App = defineComponent({
    name: "BenchMultipleTListApp",
    setup() {
      return () => [
        h(Probe),
        h(TList, {
          x: 0,
          y: 0,
          w: 80,
          h: 5,
          items,
          modelValue: 0,
          onScroll: () => scrolls[0]++,
          "onUpdate:modelValue": () => updates[0]++,
        }),
        h(TList, {
          x: 0,
          y: 6,
          w: 80,
          h: 5,
          items,
          modelValue: 0,
          onScroll: () => scrolls[1]++,
          "onUpdate:modelValue": () => updates[1]++,
        }),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 12, component: App });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf!.clear();

    for (let i = 0; i < 100; i++) {
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_000 + i * 10,
      });
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 6,
        deltaY: 100,
        time: 2_000 + i * 10,
      });
    }
    raf.flush();
    await nextTick();

    return {
      scrolls,
      updates,
      firstListRow: rowText(app, 0),
      secondListRow: rowText(app, 6),
      framePerf: framePerf!.latest(),
      scheduledFrames: raf.scheduled(),
      pendingFrames: raf.pending(),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchSamePlaneOverlap() {
  const raf = installManualRaf();
  const items = Array.from({ length: 10_000 }, (_, index) => `item-${index}`);
  let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

  const Probe = defineComponent({
    name: "BenchSamePlaneOverlapProbe",
    setup() {
      framePerf = useTerminal().observability.framePerf;
      framePerf.enabled.value = true;
      return () => null;
    },
  });
  const App = defineComponent({
    name: "BenchSamePlaneOverlapApp",
    setup() {
      return () => [
        h(Probe),
        h(TList, {
          x: 0,
          y: 0,
          w: 80,
          h: 5,
          items,
          modelValue: 0,
          autoFocus: true,
        }),
        h(TText, {
          x: 0,
          y: 1,
          w: 80,
          value: "overlay-row",
          zIndex: 10,
        }),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 8, component: App });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf!.clear();

    for (let i = 0; i < 100; i++) {
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_000 + i * 10,
      });
    }
    raf.flush();
    await nextTick();

    return {
      firstVisibleRow: rowText(app, 0),
      overlayRow: rowText(app, 1),
      framePerf: framePerf!.latest(),
      scheduledFrames: raf.scheduled(),
      pendingFrames: raf.pending(),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchHiddenCancelsPendingWheel() {
  const raf = installManualRaf();
  const visible = ref(true);
  let scroll = 0;
  let commitsAfterHide = 0;
  let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

  const Probe = defineComponent({
    name: "BenchHiddenCancelProbe",
    setup() {
      framePerf = useTerminal().observability.framePerf;
      framePerf.enabled.value = true;
      return () => null;
    },
  });
  const App = defineComponent({
    name: "BenchHiddenCancelApp",
    setup() {
      return () => [
        h(Probe),
        h(TText, { x: 0, y: 0, w: 16, value: "visible" }),
        withDirectives(
          h(TList, {
            x: 0,
            y: 0,
            w: 16,
            h: 5,
            items: Array.from({ length: 10_000 }, (_, index) => `item-${index}`),
            autoFocus: true,
            onScroll: () => scroll++,
          }),
          [[vShow, visible.value]],
        ),
      ];
    },
  });
  const app = createTerminalApp({ cols: 24, rows: 8, component: App });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf!.clear();

    app.events.dispatch({
      type: "wheel",
      cellX: 0,
      cellY: 0,
      deltaY: 1000,
      time: 1_000,
    });
    const pendingFramesBeforeHide = raf.pending();

    visible.value = false;
    await nextTick();
    app.scheduler.flushNow();
    const pendingFramesAfterHide = raf.pending();
    framePerf!.clear();
    const off = app.terminal.on("commit", () => commitsAfterHide++);

    const flushedCanceledFrames = raf.flush();
    await nextTick();
    app.scheduler.flushNow();
    off();

    return {
      scroll,
      commitsAfterHide,
      flushedCanceledFrames,
      row0: rowText(app, 0),
      framePerf: framePerf!.latest(),
      pendingFramesBeforeHide,
      pendingFramesAfterHide,
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

const result = {
  tListBurstWheel: await benchTListBurstWheel(),
  concurrentMailboxes: await benchConcurrentMailboxes(),
  tListManySamePlaneSiblings: await benchTListManySamePlaneSiblings(),
  multipleTListInstances: await benchMultipleTListInstances(),
  samePlaneOverlap: await benchSamePlaneOverlap(),
  hiddenCancelsPendingWheel: await benchHiddenCancelsPendingWheel(),
};

assert.equal(result.tListBurstWheel.updateModelValue, 0);
assert.equal(result.tListBurstWheel.scroll, 1);
assert.equal(result.tListBurstWheel.commitsBeforeFrame, 0);
// Intentionally strict: this benchmark guards against event-driven
// intermediate commits during wheel bursts.
assert.equal(result.tListBurstWheel.commitsAfterFrame, 1);
assert.equal(result.tListBurstWheel.framePerf?.frameTaskCount, 1);
assert.equal(result.tListBurstWheel.framePerf?.droppedUpdates, 99);
assert.ok((result.tListBurstWheel.framePerf?.dirtyRows ?? Infinity) <= 20);
assert.equal(result.tListBurstWheel.framePerf?.paintedNodes, 1);
assert.ok((result.tListBurstWheel.framePerf?.scannedNodes ?? Infinity) < 50);
assert.match(result.tListBurstWheel.firstVisibleRow, /^item-[1-9]\d*$/);
assert.deepEqual(result.concurrentMailboxes.order, [
  "input:19:dropped=19",
  "scroll:99:dropped=99",
  "stream:499:dropped=499",
]);
assert.equal(result.concurrentMailboxes.framePerf?.frameTaskCount, 3);
assert.equal(result.concurrentMailboxes.framePerf?.droppedUpdates, 617);
assert.equal(result.concurrentMailboxes.pendingFrames, 0);
assert.equal(result.tListManySamePlaneSiblings.framePerf?.frameTaskCount, 1);
assert.equal(result.tListManySamePlaneSiblings.framePerf?.droppedUpdates, 99);
assert.ok((result.tListManySamePlaneSiblings.framePerf?.dirtyRows ?? Infinity) <= 20);
assert.ok((result.tListManySamePlaneSiblings.framePerf?.scannedNodes ?? Infinity) < 50);
assert.equal(result.tListManySamePlaneSiblings.framePerf?.paintedNodes, 1);
assert.deepEqual(result.multipleTListInstances.scrolls, [1, 1]);
assert.deepEqual(result.multipleTListInstances.updates, [0, 0]);
assert.equal(result.multipleTListInstances.framePerf?.frameTaskCount, 2);
assert.equal(result.multipleTListInstances.framePerf?.droppedUpdates, 198);
assert.ok((result.multipleTListInstances.framePerf?.dirtyRows ?? Infinity) <= 10);
assert.equal(result.multipleTListInstances.framePerf?.paintedNodes, 2);
assert.match(result.multipleTListInstances.firstListRow, /^item-[1-9]\d*$/);
assert.match(result.multipleTListInstances.secondListRow, /^item-[1-9]\d*$/);
assert.equal(result.multipleTListInstances.pendingFrames, 0);
assert.match(result.samePlaneOverlap.firstVisibleRow, /^item-[1-9]\d*$/);
assert.equal(result.samePlaneOverlap.overlayRow, "overlay-row");
assert.equal(result.samePlaneOverlap.framePerf?.frameTaskCount, 1);
assert.equal(result.samePlaneOverlap.framePerf?.droppedUpdates, 99);
assert.ok((result.samePlaneOverlap.framePerf?.dirtyRows ?? Infinity) <= 5);
assert.ok((result.samePlaneOverlap.framePerf?.paintedNodes ?? 0) >= 2);
assert.equal(result.samePlaneOverlap.pendingFrames, 0);
assert.equal(result.hiddenCancelsPendingWheel.pendingFramesBeforeHide, 1);
assert.equal(result.hiddenCancelsPendingWheel.pendingFramesAfterHide, 0);
assert.equal(result.hiddenCancelsPendingWheel.flushedCanceledFrames, 0);
assert.equal(result.hiddenCancelsPendingWheel.scroll, 0);
assert.equal(result.hiddenCancelsPendingWheel.commitsAfterHide, 0);
assert.equal(result.hiddenCancelsPendingWheel.row0, "visible");
assert.equal(result.hiddenCancelsPendingWheel.framePerf?.frameTaskCount, 0);
assert.equal(result.hiddenCancelsPendingWheel.framePerf?.dirtyRows, 0);
assert.equal(result.hiddenCancelsPendingWheel.framePerf?.paintedNodes, 0);

console.log("[bench:scroll-mailbox] passed");
console.log(JSON.stringify(result, null, 2));
