import assert from "node:assert/strict";
import type { FramePerfSample } from "../src/observability.js";
import { defineComponent, h, nextTick, ref, vShow, withDirectives } from "vue";
import { TList, TText } from "../src/index.js";
import { useTerminal } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";
import { createAppendOnlyLogStore, TLogView, TVirtualList } from "../src/experimental.js";
import { createFrameMailbox } from "../src/vue/scheduler/frame-mailbox.js";
import { createFramePerfProbe, expectScrollMailboxFrame } from "../test/helpers/frame-perf.js";
import { installManualRaf } from "../test/helpers/manual-raf.js";
import { rowText } from "../test/helpers/terminal-rows.js";
import { dispatchWheelBurst } from "../test/helpers/wheel.js";

type ScrollMailboxBenchMetrics = Readonly<{
  component: "TList" | "TLogView" | "TVirtualList";
  scenario: string;
  wheelEvents: number;
  frameTaskCount: number;
  droppedUpdates: number;
  dirtyRows: number | null;
  scannedNodes: number;
  paintedNodes: number;
  commits: number;
  commitsBeforeRaf: number;
  updateModelValue: number;
  updateScrollTop: number;
  scrollEvents: number;
}>;

function metricsFromFrame(
  frame: FramePerfSample | null,
  options: Readonly<{
    component: ScrollMailboxBenchMetrics["component"];
    scenario: string;
    wheelEvents: number;
    commits: number;
    commitsBeforeRaf: number;
    updateModelValue?: number;
    updateScrollTop?: number;
    scrollEvents?: number;
  }>,
): ScrollMailboxBenchMetrics {
  assert.ok(frame, `${options.component} ${options.scenario} did not record frame perf`);
  return {
    component: options.component,
    scenario: options.scenario,
    wheelEvents: options.wheelEvents,
    frameTaskCount: frame.frameTaskCount,
    droppedUpdates: frame.droppedUpdates,
    dirtyRows: frame.dirtyRows,
    scannedNodes: frame.scannedNodes,
    paintedNodes: frame.paintedNodes,
    commits: options.commits,
    commitsBeforeRaf: options.commitsBeforeRaf,
    updateModelValue: options.updateModelValue ?? 0,
    updateScrollTop: options.updateScrollTop ?? 0,
    scrollEvents: options.scrollEvents ?? 0,
  };
}

async function benchTListWheelBurst() {
  const raf = installManualRaf();
  const items = Array.from({ length: 10_000 }, (_, index) => `item-${index}`);
  const framePerf = createFramePerfProbe("BenchTListWheelFramePerfProbe");
  let updateModelValue = 0;
  let scrollEvents = 0;
  let commits = 0;

  const App = defineComponent({
    name: "BenchTListWheelMailboxApp",
    setup() {
      return () => [
        h(framePerf.component),
        h(TList, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          items,
          modelValue: 0,
          autoFocus: true,
          onScroll: () => scrollEvents++,
          "onUpdate:modelValue": () => updateModelValue++,
        }),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 24, component: App });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf.clear();
    const off = app.terminal.on("commit", () => commits++);

    dispatchWheelBurst(app.events, { count: 1_000 });
    const commitsBeforeRaf = commits;
    assert.equal(raf.pending(), 1);

    raf.flush();
    await nextTick();
    off();

    const frame = framePerf.latest();
    expectScrollMailboxFrame(frame, {
      droppedUpdates: 999,
      viewportHeight: 20,
      paintedNodes: 1,
      maxScannedNodes: 50,
    });
    assert.equal(updateModelValue, 0);
    assert.equal(scrollEvents, 1);
    assert.equal(commitsBeforeRaf, 0);
    assert.equal(commits, 1);
    assert.match(rowText(app, 0), /^item-[1-9]\d*$/);
    assert.equal(raf.pending(), 0);

    return {
      metrics: metricsFromFrame(frame, {
        component: "TList",
        scenario: "wheel burst",
        wheelEvents: 1_000,
        commits,
        commitsBeforeRaf,
        updateModelValue,
        scrollEvents,
      }),
      firstVisibleRow: rowText(app, 0),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchTLogViewWheelBurst() {
  const raf = installManualRaf();
  const source = {
    lineCount: () => 1_000_000,
    getLine: (index: number) => `line-${index}`,
  };
  const framePerf = createFramePerfProbe("BenchTLogViewWheelFramePerfProbe");
  let updateScrollTop = 0;
  let scrollEvents = 0;
  let commits = 0;

  const App = defineComponent({
    name: "BenchTLogViewWheelMailboxApp",
    setup() {
      return () => [
        h(framePerf.component),
        h(TLogView, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          source,
          version: 1,
          autoFocus: true,
          onScroll: () => scrollEvents++,
          "onUpdate:scrollTop": () => updateScrollTop++,
        }),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 24, component: App });

  try {
    app.mount();
    await nextTick();
    app.scheduler.flushNow();
    framePerf.clear();
    const off = app.terminal.on("commit", () => commits++);

    dispatchWheelBurst(app.events, { count: 1_000, deltaY: -1 });
    const commitsBeforeRaf = commits;
    assert.equal(raf.pending(), 1);

    raf.flush();
    await nextTick();
    off();

    const frame = framePerf.latest();
    expectScrollMailboxFrame(frame, {
      droppedUpdates: 999,
      viewportHeight: 20,
      paintedNodes: 1,
      maxScannedNodes: 50,
    });
    assert.equal(scrollEvents, 1);
    assert.equal(commitsBeforeRaf, 0);
    assert.equal(commits, 1);
    assert.match(rowText(app, 0), /^line-\d+$/);
    assert.equal(raf.pending(), 0);

    return {
      metrics: metricsFromFrame(frame, {
        component: "TLogView",
        scenario: "wheel burst",
        wheelEvents: 1_000,
        commits,
        commitsBeforeRaf,
        updateScrollTop,
        scrollEvents,
      }),
      firstVisibleRow: rowText(app, 0),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchTLogViewAppendBurst() {
  const raf = installManualRaf();
  const log = createAppendOnlyLogStore();
  log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));
  const framePerf = createFramePerfProbe("BenchTLogViewAppendFramePerfProbe");
  let updateScrollTop = 0;
  let scrollEvents = 0;
  let commits = 0;

  const App = defineComponent({
    name: "BenchTLogViewAppendMailboxApp",
    setup() {
      return () => [
        h(framePerf.component),
        h(TLogView, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          source: log.source,
          version: log.version.value,
          onScroll: () => scrollEvents++,
          "onUpdate:scrollTop": () => updateScrollTop++,
        }),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 24, component: App });

  try {
    app.mount();
    await nextTick();
    app.scheduler.flushNow();
    framePerf.clear();
    const off = app.terminal.on("commit", () => commits++);

    for (let i = 20; i < 1_020; i++) {
      log.appendLine(`line-${i}`);
      await nextTick();
    }
    const commitsBeforeRaf = commits;
    assert.equal(raf.pending(), 1);

    raf.flush();
    await nextTick();
    off();

    const frame = framePerf.latest();
    expectScrollMailboxFrame(frame, {
      reason: "data",
      droppedUpdates: 999,
      viewportHeight: 20,
      paintedNodes: 1,
      maxScannedNodes: 50,
    });
    assert.equal(commitsBeforeRaf, 0);
    assert.equal(commits, 1);
    assert.equal(rowText(app, 19), "line-1019");
    assert.equal(raf.pending(), 0);

    return {
      metrics: metricsFromFrame(frame, {
        component: "TLogView",
        scenario: "append burst",
        wheelEvents: 0,
        commits,
        commitsBeforeRaf,
        updateScrollTop,
        scrollEvents,
      }),
      lastVisibleRow: rowText(app, 19),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchTVirtualListWheelBurst() {
  const raf = installManualRaf();
  const framePerf = createFramePerfProbe("BenchTVirtualListWheelFramePerfProbe");
  let updateModelValue = 0;
  let updateScrollTop = 0;
  let scrollEvents = 0;
  let commits = 0;

  const App = defineComponent({
    name: "BenchTVirtualListWheelMailboxApp",
    setup() {
      return () => [
        h(framePerf.component),
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          itemCount: 100_000,
          itemVersion: 1,
          getItem: (index: number) => `item-${index}`,
          autoFocus: true,
          onScroll: () => scrollEvents++,
          "onUpdate:modelValue": () => updateModelValue++,
          "onUpdate:scrollTop": () => updateScrollTop++,
        }),
      ];
    },
  });
  const app = createTerminalApp({ cols: 80, rows: 24, component: App });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf.clear();
    const off = app.terminal.on("commit", () => commits++);

    dispatchWheelBurst(app.events, { count: 1_000 });
    const commitsBeforeRaf = commits;
    assert.equal(raf.pending(), 1);

    raf.flush();
    await nextTick();
    off();

    const frame = framePerf.latest();
    expectScrollMailboxFrame(frame, {
      droppedUpdates: 999,
      viewportHeight: 20,
      paintedNodes: 1,
      maxScannedNodes: 50,
    });
    assert.equal(updateModelValue, 0);
    assert.equal(scrollEvents, 1);
    assert.equal(commitsBeforeRaf, 0);
    assert.equal(commits, 1);
    assert.match(rowText(app, 0), /^item-[1-9]\d*$/);
    assert.equal(raf.pending(), 0);

    return {
      metrics: metricsFromFrame(frame, {
        component: "TVirtualList",
        scenario: "wheel burst",
        wheelEvents: 1_000,
        commits,
        commitsBeforeRaf,
        updateModelValue,
        updateScrollTop,
        scrollEvents,
      }),
      firstVisibleRow: rowText(app, 0),
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchConcurrentMailboxes() {
  const raf = installManualRaf();
  const order: string[] = [];
  const framePerf = createFramePerfProbe("BenchConcurrentMailboxFramePerfProbe");
  let scheduler: ReturnType<typeof useTerminal>["scheduler"] | null = null;

  const SchedulerProbe = defineComponent({
    name: "BenchConcurrentMailboxSchedulerProbe",
    setup() {
      scheduler = useTerminal().scheduler;
      return () => null;
    },
  });
  const app = createTerminalApp({
    cols: 20,
    rows: 4,
    component: defineComponent({
      name: "BenchConcurrentMailboxApp",
      setup() {
        return () => [h(framePerf.component), h(SchedulerProbe)];
      },
    }),
  });

  try {
    app.mount();
    app.scheduler.flushNow();
    framePerf.clear();

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
      framePerf: framePerf.latest(),
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
  const framePerf = createFramePerfProbe("BenchSamePlaneOverlapProbe");

  const App = defineComponent({
    name: "BenchSamePlaneOverlapApp",
    setup() {
      return () => [
        h(framePerf.component),
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
    framePerf.clear();

    dispatchWheelBurst(app.events, { count: 100 });
    raf.flush();
    await nextTick();

    const frame = framePerf.latest();
    expectScrollMailboxFrame(frame, {
      droppedUpdates: 99,
      viewportHeight: 5,
      maxPaintedNodes: 2,
      maxScannedNodes: 50,
    });
    assert.match(rowText(app, 0), /^item-[1-9]\d*$/);
    assert.equal(rowText(app, 1), "overlay-row");
    assert.equal(raf.pending(), 0);

    return {
      firstVisibleRow: rowText(app, 0),
      overlayRow: rowText(app, 1),
      framePerf: frame,
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

async function benchHiddenCancelsPendingWheel() {
  const raf = installManualRaf();
  const visible = ref(true);
  const framePerf = createFramePerfProbe("BenchHiddenCancelProbe");
  let scrollEvents = 0;
  let commitsAfterHide = 0;

  const App = defineComponent({
    name: "BenchHiddenCancelApp",
    setup() {
      return () => [
        h(framePerf.component),
        h(TText, { x: 0, y: 0, w: 16, value: "visible" }),
        withDirectives(
          h(TList, {
            x: 0,
            y: 0,
            w: 16,
            h: 5,
            items: Array.from({ length: 10_000 }, (_, index) => `item-${index}`),
            autoFocus: true,
            onScroll: () => scrollEvents++,
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
    framePerf.clear();

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
    framePerf.clear();
    const off = app.terminal.on("commit", () => commitsAfterHide++);

    const flushedCanceledFrames = raf.flush();
    await nextTick();
    app.scheduler.flushNow();
    off();

    const frame = framePerf.latest();
    assert.equal(pendingFramesBeforeHide, 1);
    assert.equal(pendingFramesAfterHide, 0);
    assert.equal(flushedCanceledFrames, 0);
    assert.equal(scrollEvents, 0);
    assert.equal(commitsAfterHide, 0);
    assert.equal(rowText(app, 0), "visible");
    if (frame) {
      assert.equal(frame.frameTaskCount, 0);
      assert.equal(frame.dirtyRows, 0);
      assert.equal(frame.paintedNodes, 0);
    }

    return {
      scrollEvents,
      commitsAfterHide,
      flushedCanceledFrames,
      row0: rowText(app, 0),
      framePerf: frame,
      pendingFramesBeforeHide,
      pendingFramesAfterHide,
    };
  } finally {
    app.dispose();
    raf.restore();
  }
}

const tListWheel = await benchTListWheelBurst();
const tLogViewWheel = await benchTLogViewWheelBurst();
const tLogViewAppend = await benchTLogViewAppendBurst();
const tVirtualListWheel = await benchTVirtualListWheelBurst();
const concurrentMailboxes = await benchConcurrentMailboxes();
const samePlaneOverlap = await benchSamePlaneOverlap();
const hiddenCancelsPendingWheel = await benchHiddenCancelsPendingWheel();

assert.deepEqual(concurrentMailboxes.order, [
  "input:19:dropped=19",
  "scroll:99:dropped=99",
  "stream:499:dropped=499",
]);
assert.equal(concurrentMailboxes.framePerf?.frameTaskCount, 3);
assert.equal(concurrentMailboxes.framePerf?.droppedUpdates, 617);
assert.equal(concurrentMailboxes.pendingFrames, 0);

const result = {
  scenarios: [
    tListWheel.metrics,
    tLogViewWheel.metrics,
    tLogViewAppend.metrics,
    tVirtualListWheel.metrics,
  ],
  details: {
    tListWheel,
    tLogViewWheel,
    tLogViewAppend,
    tVirtualListWheel,
  },
  guards: {
    concurrentMailboxes,
    samePlaneOverlap,
    hiddenCancelsPendingWheel,
  },
};

console.log("[bench:scroll-mailbox] passed");
console.log(JSON.stringify(result, null, 2));
