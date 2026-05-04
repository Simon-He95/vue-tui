import assert from "node:assert/strict";
import { defineComponent, h, nextTick } from "vue";
import { createTerminalApp, TList, useTerminal } from "../src/index.js";
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

    for (let i = 0; i < 100; i++) {
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_000 + i * 10,
      });
    }
    const commitsBeforeFrame = commits;
    raf.flush();
    await nextTick();
    off();

    return {
      scroll,
      updateModelValue,
      commitsBeforeFrame,
      commitsAfterFrame: commits,
      firstVisibleRow: rowText(app, 0),
      framePerf: framePerf!.latest(),
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

const result = {
  tListBurstWheel: await benchTListBurstWheel(),
  concurrentMailboxes: await benchConcurrentMailboxes(),
};

assert.equal(result.tListBurstWheel.updateModelValue, 0);
assert.equal(result.tListBurstWheel.scroll, 1);
assert.equal(result.tListBurstWheel.commitsBeforeFrame, 0);
// Intentionally strict: this benchmark guards against event-driven
// intermediate commits during wheel bursts.
assert.equal(result.tListBurstWheel.commitsAfterFrame, 1);
assert.equal(result.tListBurstWheel.framePerf?.frameTaskCount, 1);
assert.equal(result.tListBurstWheel.framePerf?.droppedUpdates, 99);
assert.match(result.tListBurstWheel.firstVisibleRow, /^item-[1-9]\d*$/);
assert.deepEqual(result.concurrentMailboxes.order, [
  "input:19:dropped=19",
  "scroll:99:dropped=99",
  "stream:499:dropped=499",
]);
assert.equal(result.concurrentMailboxes.framePerf?.frameTaskCount, 3);
assert.equal(result.concurrentMailboxes.framePerf?.droppedUpdates, 617);
assert.equal(result.concurrentMailboxes.pendingFrames, 0);

console.log("[bench:scroll-mailbox] passed");
console.log(JSON.stringify(result, null, 2));
