import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, onBeforeUnmount } from "vue";
import type { FramePerfStore } from "../src/observability.js";
import { TerminalProvider, TText, useTerminal, type TerminalScheduler } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";

function installRaf() {
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

  return {
    callbacks,
    runNext(time = 0): boolean {
      const next = callbacks.entries().next().value;
      if (!next) return false;
      const [id, cb] = next;
      callbacks.delete(id);
      cb(time);
      return true;
    },
    restore() {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

function createSchedulerProbeApp() {
  let scheduler: TerminalScheduler | null = null;
  let framePerf: FramePerfStore | null = null;

  const Probe = defineComponent({
    name: "SchedulerFrameTaskProbe",
    setup() {
      const ctx = useTerminal();
      scheduler = ctx.scheduler;
      framePerf = ctx.observability.framePerf;
      framePerf.enabled.value = true;
      return () => h(TText, { x: 0, y: 0, w: 8, value: "probe" });
    },
  });

  const app = createTerminalApp({ cols: 20, rows: 4, component: Probe as any });
  return {
    app,
    get scheduler() {
      return scheduler!;
    },
    get framePerf() {
      return framePerf!;
    },
  };
}

describe("scheduler frame tasks", () => {
  it("coalesces same-id tasks and only runs the latest task", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    let runCount = 0;
    let latestValue = -1;

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.framePerf.clear();

      for (let i = 0; i < 100; i++) {
        probe.scheduler.queueFrameTask({
          id: "wheel",
          reason: "scroll",
          priority: "high",
          sync: true,
          run(ctx) {
            runCount++;
            latestValue = i;
            expect(probe.scheduler.isInsideFrame()).toBe(true);
            ctx.invalidate({ priority: "high", plane: "default", reason: "scroll" });
          },
        });
      }

      expect(runCount).toBe(0);
      expect(raf.callbacks.size).toBe(1);
      raf.runNext();

      expect(runCount).toBe(1);
      expect(latestValue).toBe(99);
      expect(probe.framePerf.latest()).toMatchObject({
        reason: "scroll",
        frameTaskCount: 1,
        coalescedFrameTasks: 99,
        frameTaskQueueDepthBeforeRun: 1,
        frameTaskQueueDepthAfterRun: 0,
        remainingFrameTasks: 0,
      });
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("does not carry coalesced counts from canceled tasks into the next frame", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    let runCount = 0;

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.framePerf.clear();

      for (let i = 0; i < 100; i++) {
        probe.scheduler.queueFrameTask({
          id: "canceled",
          reason: "scroll",
          priority: "high",
          run(ctx) {
            ctx.invalidate({ priority: "high", plane: "default", reason: "scroll" });
          },
        });
      }
      probe.scheduler.cancelFrameTask?.("canceled");
      probe.scheduler.queueFrameTask({
        id: "kept",
        reason: "input",
        priority: "high",
        run(ctx) {
          runCount++;
          ctx.invalidate({ priority: "high", plane: "default", reason: "input" });
        },
      });

      raf.runNext();

      expect(runCount).toBe(1);
      expect(probe.framePerf.latest()).toMatchObject({
        reason: "input",
        frameTaskCount: 1,
        coalescedFrameTasks: 0,
        frameTaskQueueDepthBeforeRun: 1,
        frameTaskQueueDepthAfterRun: 0,
      });
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("runs different-id tasks in priority order and merges reasons", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    const order: string[] = [];

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.framePerf.clear();

      probe.scheduler.queueFrameTask({
        id: "low",
        reason: "data",
        priority: "low",
        run(ctx) {
          order.push("low");
          ctx.invalidate({ plane: "default" });
        },
      });
      probe.scheduler.queueFrameTask({
        id: "high",
        reason: "scroll",
        priority: "high",
        run(ctx) {
          order.push("high");
          ctx.invalidate({ plane: "default" });
        },
      });
      probe.scheduler.queueFrameTask({
        id: "normal",
        reason: "input",
        priority: "normal",
        run(ctx) {
          order.push("normal");
          ctx.invalidate({ plane: "default" });
        },
      });

      raf.runNext();

      expect(order).toEqual(["high", "normal", "low"]);
      expect(probe.framePerf.latest()).toMatchObject({
        reason: "input",
        frameTaskCount: 3,
        frameTaskQueueDepthBeforeRun: 3,
        frameTaskQueueDepthAfterRun: 0,
      });
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("uses frame task reasons when task invalidates without its own reason", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.framePerf.clear();

      probe.scheduler.queueFrameTask({
        id: "data",
        reason: "data",
        run: (ctx) => ctx.invalidate({ plane: "default" }),
      });
      probe.scheduler.queueFrameTask({
        id: "scroll",
        reason: "scroll",
        run: (ctx) => ctx.invalidate({ plane: "default" }),
      });
      raf.runNext();
      expect(probe.framePerf.latest()?.reason).toBe("scroll");

      probe.framePerf.clear();
      probe.scheduler.queueFrameTask({
        id: "scroll-2",
        reason: "scroll",
        run: (ctx) => ctx.invalidate({ plane: "default" }),
      });
      probe.scheduler.queueFrameTask({
        id: "input",
        reason: "input",
        run: (ctx) => ctx.invalidate({ plane: "default" }),
      });
      raf.runNext();
      expect(probe.framePerf.latest()?.reason).toBe("input");
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("does not recursively flush when a task invalidates with high priority", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.framePerf.clear();

      probe.scheduler.queueFrameTask({
        id: "inside-frame",
        reason: "scroll",
        priority: "high",
        run(ctx) {
          ctx.invalidate({ priority: "high", plane: "default", reason: "scroll" });
        },
      });

      raf.runNext();

      expect(probe.framePerf.latest()).toMatchObject({
        reason: "scroll",
        frameTaskCount: 1,
      });
      expect(raf.callbacks.size).toBe(0);
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("respects high priority from ctx.invalidate when deciding sync commit", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    const commits: boolean[] = [];
    const terminal = probe.app.terminal as any;
    const prevCommit = terminal.commit.bind(probe.app.terminal);
    terminal.commit = (options?: any) => {
      commits.push(Boolean(options?.sync));
      return prevCommit(options);
    };

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      commits.length = 0;
      probe.framePerf.clear();

      probe.scheduler.queueFrameTask({
        id: "normal-task-high-invalidate",
        priority: "normal",
        reason: "data",
        run(ctx) {
          ctx.invalidate({
            priority: "high",
            plane: "default",
            reason: "input",
          });
        },
      });

      raf.runNext();

      expect(commits.at(-1)).toBe(true);
      expect(probe.framePerf.latest()).toMatchObject({
        reason: "input",
        frameTaskCount: 1,
      });
    } finally {
      terminal.commit = prevCommit;
      probe.app.dispose();
      raf.restore();
    }
  });

  it("flushNow drains pending frame tasks before committing", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    let runCount = 0;

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.framePerf.clear();

      probe.scheduler.queueFrameTask({
        id: "flush-now",
        reason: "data",
        run(ctx) {
          runCount++;
          ctx.invalidate({ plane: "default" });
        },
      });

      expect(raf.callbacks.size).toBe(1);
      probe.scheduler.flushNow();

      expect(runCount).toBe(1);
      expect(raf.callbacks.size).toBe(0);
      expect(probe.framePerf.latest()).toMatchObject({
        reason: "data",
        frameTaskCount: 1,
      });
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("slices normal tasks by frame budget and schedules remaining work", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    const order: string[] = [];

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.framePerf.clear();
      probe.scheduler.configure({ frameBudgetMs: 0 });

      for (const id of ["a", "b", "c"]) {
        probe.scheduler.queueFrameTask({
          id,
          reason: "data",
          priority: "normal",
          run(ctx) {
            expect(ctx.budgetMs).toBe(0);
            order.push(id);
            ctx.invalidate({ plane: "default" });
          },
        });
      }

      raf.runNext();
      expect(order).toEqual(["a"]);
      expect(probe.framePerf.latest()).toMatchObject({
        frameTaskCount: 1,
        frameTaskQueueDepthBeforeRun: 3,
        frameTaskQueueDepthAfterRun: 2,
        remainingFrameTasks: 2,
      });
      await Promise.resolve();
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      expect(order).toEqual(["a", "b"]);
      expect(probe.framePerf.latest()).toMatchObject({
        frameTaskCount: 1,
        frameTaskQueueDepthBeforeRun: 2,
        frameTaskQueueDepthAfterRun: 1,
        remainingFrameTasks: 1,
      });
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("runs deferred low-priority work after finite high-priority pressure stops", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    const order: string[] = [];
    let highRuns = 0;

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.scheduler.configure({ frameBudgetMs: 0 });

      const queueHigh = () => {
        probe.scheduler.queueFrameTask({
          id: "continuous-high",
          priority: "high",
          reason: "scroll",
          run(ctx) {
            highRuns++;
            order.push(`high:${highRuns}`);
            ctx.invalidate({ priority: "high", plane: "default", reason: "scroll" });
            if (highRuns < 3) queueHigh();
          },
        });
      };

      queueHigh();
      probe.scheduler.queueFrameTask({
        id: "low",
        priority: "low",
        reason: "data",
        run(ctx) {
          order.push("low");
          ctx.invalidate({ plane: "default", reason: "data" });
        },
      });

      raf.runNext();
      expect(order).toEqual(["high:1"]);
      raf.runNext();
      expect(order).toEqual(["high:1", "high:2"]);
      raf.runNext();
      expect(order).toEqual(["high:1", "high:2", "high:3"]);
      raf.runNext();
      expect(order).toEqual(["high:1", "high:2", "high:3", "low"]);
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("warns about large high-priority queues and drains finite pressure", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    const order: string[] = [];
    const previousDebugPerf = (globalThis as any).__VT_DEBUG_PERF__;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      (globalThis as any).__VT_DEBUG_PERF__ = true;
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.scheduler.configure({ frameBudgetMs: 0 });

      for (let i = 0; i < 129; i++) {
        probe.scheduler.queueFrameTask({
          id: `high-${i}`,
          priority: "high",
          reason: "scroll",
          run(ctx) {
            order.push(`high-${i}`);
            ctx.invalidate({ priority: "high", plane: "default", reason: "scroll" });
          },
        });
      }
      probe.scheduler.queueFrameTask({
        id: "low-after-high-pressure",
        priority: "low",
        reason: "data",
        run(ctx) {
          order.push("low");
          ctx.invalidate({ plane: "default", reason: "data" });
        },
      });

      raf.runNext();
      expect(order).toHaveLength(129);
      expect(order).not.toContain("low");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain("high-priority frame task queue is large");

      raf.runNext();
      expect(order.at(-1)).toBe("low");
    } finally {
      if (previousDebugPerf === undefined) delete (globalThis as any).__VT_DEBUG_PERF__;
      else (globalThis as any).__VT_DEBUG_PERF__ = previousDebugPerf;
      warn.mockRestore();
      probe.app.dispose();
      raf.restore();
    }
  });

  it("keeps the latest same-id task when a deferred task is replaced during drain", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    const order: string[] = [];

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();
      probe.scheduler.configure({ frameBudgetMs: 0 });

      probe.scheduler.queueFrameTask({
        id: "a",
        priority: "normal",
        run(ctx) {
          order.push("a");
          ctx.invalidate({ plane: "default" });
          probe.scheduler.queueFrameTask({
            id: "b",
            priority: "normal",
            run(nextCtx) {
              order.push("b-new");
              nextCtx.invalidate({ plane: "default" });
            },
          });
        },
      });
      probe.scheduler.queueFrameTask({
        id: "b",
        priority: "normal",
        run(ctx) {
          order.push("b-old");
          ctx.invalidate({ plane: "default" });
        },
      });

      raf.runNext();
      expect(order).toEqual(["a"]);
      await Promise.resolve();
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      expect(order).toEqual(["a", "b-new"]);
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("requestMore schedules another frame", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();

      probe.scheduler.queueFrameTask({
        id: "request-more",
        reason: "stream",
        run(ctx) {
          ctx.requestMore();
          ctx.invalidate({ plane: "default" });
        },
      });

      raf.runNext();
      await Promise.resolve();
      expect(raf.callbacks.size).toBe(1);
      raf.runNext();
      expect(raf.callbacks.size).toBe(0);
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("requeues remaining tasks after a task throws and restores insideFrame", async () => {
    const raf = installRaf();
    const probe = createSchedulerProbeApp();
    const order: string[] = [];

    try {
      probe.app.mount();
      await nextTick();
      probe.scheduler.flushNow();

      probe.scheduler.queueFrameTask({
        id: "throwing",
        priority: "high",
        run() {
          order.push("throw");
          throw new Error("boom");
        },
      });
      probe.scheduler.queueFrameTask({
        id: "after",
        priority: "normal",
        run(ctx) {
          order.push("after");
          expect(probe.scheduler.isInsideFrame()).toBe(true);
          ctx.invalidate({ plane: "default" });
        },
      });

      expect(() => raf.runNext()).toThrow("boom");
      expect(probe.scheduler.isInsideFrame()).toBe(false);
      expect(order).toEqual(["throw"]);

      await Promise.resolve();
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      expect(order).toEqual(["throw", "after"]);
    } finally {
      probe.app.dispose();
      raf.restore();
    }
  });

  it("flushes successful invalidations before rethrowing a later task error", async () => {
    const raf = installRaf();
    let renderNodeId = "";
    let render: ReturnType<typeof useTerminal>["render"] | null = null;
    let value = "old";

    const Node = defineComponent({
      name: "ThrowingFramePartialFlushNode",
      setup() {
        const ctx = useTerminal();
        render = ctx.render;
        const paint = () => ctx.terminal.write(value, { x: 0, y: 1 });
        const node = ctx.render.register({
          stack: ctx.render.rootStack,
          rect: { x: 0, y: 1, w: 8, h: 1 },
          paint,
        });
        renderNodeId = node.id;
        onBeforeUnmount(() => ctx.render.unregister(node.id));
        return () => null;
      },
    });

    const app = createTerminalApp({
      cols: 20,
      rows: 4,
      component: defineComponent({
        setup: () => () => h(Node),
      }),
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.scheduler.queueFrameTask({
        id: "first",
        priority: "high",
        reason: "scroll",
        run(ctx) {
          value = "new";
          render!.update(renderNodeId, {});
          ctx.invalidate({ priority: "high", plane: "default", reason: "scroll" });
        },
      });
      app.scheduler.queueFrameTask({
        id: "throwing",
        priority: "normal",
        run() {
          throw new Error("boom");
        },
      });

      expect(() => raf.runNext()).toThrow("boom");
      expect(app.terminal.snapshot().lines[1]?.slice(0, 3)).toBe("new");
      expect(app.scheduler.isInsideFrame()).toBe(false);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("flushNow flushes successful invalidations before rethrowing a later task error", async () => {
    const raf = installRaf();
    let renderNodeId = "";
    let render: ReturnType<typeof useTerminal>["render"] | null = null;
    let value = "old";

    const Node = defineComponent({
      name: "ThrowingFlushNowPartialFlushNode",
      setup() {
        const ctx = useTerminal();
        render = ctx.render;
        const paint = () => ctx.terminal.write(value, { x: 0, y: 1 });
        const node = ctx.render.register({
          stack: ctx.render.rootStack,
          rect: { x: 0, y: 1, w: 8, h: 1 },
          paint,
        });
        renderNodeId = node.id;
        onBeforeUnmount(() => ctx.render.unregister(node.id));
        return () => null;
      },
    });

    const app = createTerminalApp({
      cols: 20,
      rows: 4,
      component: defineComponent({
        setup: () => () => h(Node),
      }),
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.scheduler.queueFrameTask({
        id: "first",
        priority: "high",
        reason: "scroll",
        run(ctx) {
          value = "new";
          render!.update(renderNodeId, {});
          ctx.invalidate({ priority: "high", plane: "default", reason: "scroll" });
        },
      });
      app.scheduler.queueFrameTask({
        id: "throwing",
        priority: "normal",
        run() {
          throw new Error("boom");
        },
      });

      expect(() => app.scheduler.flushNow()).toThrow("boom");
      expect(app.terminal.snapshot().lines[1]?.slice(0, 3)).toBe("new");
      await Promise.resolve();
      expect(raf.callbacks.size).toBe(0);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("throttles live-only frames by targetFps/maxFps in rAF environments", async () => {
    vi.useFakeTimers();
    const raf = installRaf();
    const app = createTerminalApp({
      cols: 4,
      rows: 1,
      component: defineComponent({ setup: () => () => null }),
    });
    let ran = false;

    try {
      app.scheduler.configure({ targetFps: 120, maxFps: 10 });
      const release = app.scheduler.requestLive("stream");

      expect(raf.callbacks.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(99);
      await Promise.resolve();
      expect(raf.callbacks.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(1);
      await Promise.resolve();
      expect(raf.callbacks.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);

      app.scheduler.queueFrameTask({
        id: "pending-work",
        run(ctx) {
          ran = true;
          ctx.invalidate();
        },
      });
      expect(raf.callbacks.size).toBe(1);
      expect(vi.getTimerCount()).toBe(0);

      raf.runNext(100);
      expect(ran).toBe(true);
      release();
    } finally {
      app.dispose();
      raf.restore();
      vi.useRealTimers();
    }
  });

  it("uses maxFps cadence for non-live frame tasks without rAF", () => {
    vi.useFakeTimers();
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    delete (globalThis as any).requestAnimationFrame;
    delete (globalThis as any).cancelAnimationFrame;

    const app = createTerminalApp({
      cols: 4,
      rows: 1,
      component: defineComponent({ setup: () => () => null }),
    });
    let ran = false;

    try {
      app.scheduler.configure({ maxFps: 50 });
      app.scheduler.queueFrameTask({
        id: "task",
        priority: "high",
        run(ctx) {
          ran = true;
          ctx.invalidate();
        },
      });

      vi.advanceTimersByTime(19);
      expect(ran).toBe(false);

      vi.advanceTimersByTime(1);
      expect(ran).toBe(true);
    } finally {
      app.dispose();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
      vi.useRealTimers();
    }
  });

  it("keeps live mode scheduled until all leases are released", () => {
    vi.useFakeTimers();
    const raf = installRaf();
    const app = createTerminalApp({
      cols: 4,
      rows: 1,
      component: defineComponent({ setup: () => () => null }),
    });

    try {
      const releaseA = app.scheduler.requestLive("a");
      const releaseB = app.scheduler.requestLive("b");

      expect(raf.callbacks.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);

      releaseA();
      expect(vi.getTimerCount()).toBe(1);

      releaseB();
      expect(raf.callbacks.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      app.dispose();
      raf.restore();
      vi.useRealTimers();
    }
  });

  it("uses the same frame task semantics in TerminalProvider", async () => {
    const raf = installRaf();
    const root = document.createElement("div");
    document.body.appendChild(root);
    let scheduler: TerminalScheduler | null = null;
    let framePerf: FramePerfStore | null = null;
    let latestValue = "";

    const Probe = defineComponent({
      name: "DomFrameTaskProbe",
      setup() {
        const ctx = useTerminal();
        scheduler = ctx.scheduler;
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () => h(TText, { x: 0, y: 0, w: 8, value: "dom" });
      },
    });

    const App = defineComponent({
      name: "DomFrameTaskApp",
      setup() {
        return () => h(TerminalProvider, { cols: 20, rows: 4 }, { default: () => h(Probe) });
      },
    });

    const app = createApp(App);
    try {
      app.mount(root);
      await nextTick();
      await Promise.resolve();
      scheduler!.flushNow();
      framePerf!.clear();
      raf.callbacks.clear();

      scheduler!.queueFrameTask({
        id: "dom-task",
        reason: "data",
        run(ctx) {
          latestValue = "old";
          ctx.invalidate({ plane: "default" });
        },
      });
      scheduler!.queueFrameTask({
        id: "dom-task",
        reason: "scroll",
        run(ctx) {
          latestValue = "new";
          ctx.invalidate({ plane: "default" });
        },
      });
      raf.runNext();

      expect(latestValue).toBe("new");
      expect(framePerf!.latest()).toMatchObject({
        reason: "scroll",
        frameTaskCount: 1,
        coalescedFrameTasks: 1,
      });
    } finally {
      app.unmount();
      root.remove();
      raf.restore();
    }
  });
});
