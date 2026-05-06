import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { createTerminalApp, TText, useTerminal } from "../src/index.js";
import type {
  TerminalFrameContext,
  TerminalFrameTask,
  TerminalScheduler,
} from "../src/vue/context.js";
import { createFrameMailbox } from "../src/vue/scheduler/frame-mailbox.js";

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

function disableRaf() {
  const g = globalThis as any;
  const previousRaf = g.requestAnimationFrame;
  const previousCancel = g.cancelAnimationFrame;
  g.requestAnimationFrame = undefined;
  g.cancelAnimationFrame = undefined;
  return {
    restore() {
      g.requestAnimationFrame = previousRaf;
      g.cancelAnimationFrame = previousCancel;
    },
  };
}

function createScheduler() {
  const tasks = new Map<string, TerminalFrameTask>();
  const queueFrameTask = vi.fn((task: TerminalFrameTask) => {
    tasks.set(task.id ?? String(tasks.size), task);
    return true;
  });
  const cancelFrameTask = vi.fn((id: string) => {
    return tasks.delete(id);
  });
  const ctx: TerminalFrameContext = {
    frameId: 1,
    startedAt: 0,
    now: () => 0,
    budgetMs: 8,
    remainingMs: () => 8,
    requestMore: vi.fn(),
    invalidate: vi.fn(),
    reportDroppedUpdates: vi.fn(),
  };
  const scheduler: TerminalScheduler = {
    invalidate: vi.fn(),
    flush: vi.fn(),
    flushNow: vi.fn(),
    configure: vi.fn(),
    queueFrameTask,
    cancelFrameTask,
    requestLive: vi.fn(() => vi.fn()),
    dropLive: vi.fn(),
    isInsideFrame: vi.fn(() => false),
  };

  return {
    scheduler,
    queueFrameTask,
    ctx,
    snapshot() {
      const pending = Array.from(tasks.values());
      tasks.clear();
      return pending;
    },
    flush() {
      const pending = this.snapshot();
      for (const task of pending) task.run(ctx);
    },
  };
}

describe("frame mailbox", () => {
  it("keeps only latest value for same mailbox before a frame", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    mailbox.queue(1);
    mailbox.queue(2);
    mailbox.queue(3);
    probe.flush();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![0]).toBe(3);
  });

  it("reports dropped updates", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    for (let i = 0; i < 100; i++) mailbox.queue(i);
    probe.flush();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![2]).toEqual({ queued: 100, dropped: 99 });
  });

  it("reports dropped updates after apply succeeds", () => {
    const probe = createScheduler();
    const order: string[] = [];
    (probe.ctx as any).reportDroppedUpdates = vi.fn((count: number) => {
      order.push(`report:${count}`);
    });
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply: (_value, _ctx, meta) => {
        order.push(`apply:${meta.dropped}`);
      },
    });

    mailbox.queue(1);
    mailbox.queue(2);
    probe.flush();

    expect(order).toEqual(["apply:1", "report:1"]);
  });

  it("does not report dropped updates when apply throws", () => {
    const probe = createScheduler();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply: () => {
        throw new Error("apply failed");
      },
    });

    mailbox.queue(1);
    mailbox.queue(2);

    expect(() => probe.flush()).toThrow("apply failed");
    expect(probe.ctx.reportDroppedUpdates).not.toHaveBeenCalled();
  });

  it("clears retained payload after apply and cancel", () => {
    const probe = createScheduler();
    const mailbox = createFrameMailbox<{ value: number }>({
      scheduler: probe.scheduler,
      id: "probe",
      apply: vi.fn(),
    });

    const first = { value: 1 };
    mailbox.queue(first);
    expect(mailbox.peek()).toBe(first);

    probe.flush();
    expect(mailbox.peek()).toBeUndefined();

    mailbox.queue({ value: 2 });
    mailbox.cancel();
    expect(mailbox.peek()).toBeUndefined();
  });

  it("allows apply to queue a new value for a later frame", () => {
    const probe = createScheduler();
    const values: number[] = [];
    let mailbox!: ReturnType<typeof createFrameMailbox<number>>;
    mailbox = createFrameMailbox<number>({
      scheduler: probe.scheduler,
      id: "self-queue",
      apply: (value) => {
        values.push(value);
        if (value === 1) mailbox.queue(2);
      },
    });

    mailbox.queue(1);
    probe.flush();

    expect(values).toEqual([1]);
    expect(mailbox.hasPending()).toBe(true);

    probe.flush();

    expect(values).toEqual([1, 2]);
  });

  it("supports undefined payload values when T allows them", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox<number | undefined>({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    mailbox.queue(undefined);
    expect(mailbox.hasPending()).toBe(true);
    expect(mailbox.peek()).toBeUndefined();

    probe.flush();

    expect(apply).toHaveBeenCalledWith(undefined, expect.anything(), {
      queued: 1,
      dropped: 0,
    });
  });

  it("does not run after dispose", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    mailbox.queue(1);
    mailbox.dispose();
    probe.flush();

    expect(apply).not.toHaveBeenCalled();
  });

  it("cancels pending scheduler task before a frame", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    mailbox.queue(1);
    mailbox.cancel();
    probe.flush();

    expect(apply).not.toHaveBeenCalled();
    expect(probe.scheduler.cancelFrameTask).toHaveBeenCalledWith("probe");
  });

  it("guards against stale scheduled runs after cancel", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    mailbox.queue(1);
    const pending = probe.snapshot();
    mailbox.cancel();

    expect(pending).toHaveLength(1);
    pending[0]!.run(probe.ctx);

    expect(apply).not.toHaveBeenCalled();
  });

  it("starts a fresh pending cycle after cancel", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    mailbox.queue(1);
    mailbox.cancel();
    mailbox.queue(2);
    probe.flush();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(2, expect.anything(), { queued: 1, dropped: 0 });
  });

  it("does not retain pending payload when scheduler rejects the task", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const rejectingScheduler: TerminalScheduler = {
      ...probe.scheduler,
      queueFrameTask: vi.fn(() => false),
    };
    const mailbox = createFrameMailbox({
      scheduler: rejectingScheduler,
      id: "probe",
      apply,
    });

    expect(mailbox.queue(1)).toBe(false);
    expect(mailbox.hasPending()).toBe(false);
    expect(mailbox.peek()).toBeUndefined();
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not retain pending payload when scheduler queue throws", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const throwingScheduler: TerminalScheduler = {
      ...probe.scheduler,
      queueFrameTask: vi.fn(() => {
        throw new Error("scheduler failed");
      }),
    };
    const mailbox = createFrameMailbox({
      scheduler: throwingScheduler,
      id: "probe",
      apply,
    });

    expect(() => mailbox.queue(1)).toThrow("scheduler failed");
    expect(mailbox.hasPending()).toBe(false);
    expect(mailbox.peek()).toBeUndefined();
    expect(apply).not.toHaveBeenCalled();
  });

  it("treats void-returning legacy schedulers as accepted", () => {
    const tasks = new Map<string, TerminalFrameTask>();
    const legacyScheduler: TerminalScheduler = {
      invalidate: vi.fn(),
      flush: vi.fn(),
      flushNow: vi.fn(),
      configure: vi.fn(),
      queueFrameTask(task) {
        tasks.set(task.id ?? "task", task);
      },
      requestLive: vi.fn(() => vi.fn()),
      dropLive: vi.fn(),
      isInsideFrame: vi.fn(() => false),
    };
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: legacyScheduler,
      id: "legacy",
      apply,
    });

    expect(mailbox.queue(1)).toBe(true);
    tasks.get("legacy")!.run({
      frameId: 1,
      startedAt: 0,
      now: () => 0,
      budgetMs: 8,
      remainingMs: () => 8,
      requestMore: vi.fn(),
      invalidate: vi.fn(),
    });

    expect(apply).toHaveBeenCalledWith(1, expect.anything(), {
      queued: 1,
      dropped: 0,
    });
  });

  it("merges queued values before apply", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      merge: (prev: number, next: number) => prev + next,
      apply,
    });

    mailbox.queue(1);
    mailbox.queue(2);
    mailbox.queue(3);
    probe.flush();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![0]).toBe(6);
    expect(apply.mock.calls[0]![2]).toEqual({ queued: 3, dropped: 2 });
  });

  it("clears pending payload when merge throws", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      merge: () => {
        throw new Error("merge failed");
      },
      apply,
    });

    mailbox.queue(1);
    expect(() => mailbox.queue(2)).toThrow("merge failed");

    expect(mailbox.hasPending()).toBe(false);
    expect(mailbox.peek()).toBeUndefined();
    expect(probe.scheduler.cancelFrameTask).toHaveBeenCalledWith("probe");

    probe.flush();
    expect(apply).not.toHaveBeenCalled();

    mailbox.queue(3);
    probe.flush();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(3, expect.anything(), { queued: 1, dropped: 0 });
  });

  it("does not report dropped updates when merge throws before apply", () => {
    const probe = createScheduler();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      merge: () => {
        throw new Error("merge failed");
      },
      apply: vi.fn(),
    });

    mailbox.queue(1);
    expect(() => mailbox.queue(2)).toThrow("merge failed");
    probe.flush();

    expect(probe.ctx.reportDroppedUpdates).not.toHaveBeenCalled();
  });

  it("clears pending payload when apply throws and does not retry", () => {
    const probe = createScheduler();
    const apply = vi.fn((value: number) => {
      if (value === 3) throw new Error("boom");
    });
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "probe",
      apply,
    });

    mailbox.queue(1);
    mailbox.queue(2);
    mailbox.queue(3);

    expect(() => probe.flush()).toThrow("boom");
    expect(mailbox.hasPending()).toBe(false);
    expect(mailbox.peek()).toBeUndefined();
    expect(probe.ctx.reportDroppedUpdates).not.toHaveBeenCalled();

    expect(() => probe.flush()).not.toThrow();

    mailbox.queue(4);
    probe.flush();

    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[1]![0]).toBe(4);
  });

  it("keeps a stable task id within one pending cycle", () => {
    const probe = createScheduler();
    const apply = vi.fn();
    let id = 0;
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: () => `probe-${++id}`,
      apply,
    });

    mailbox.queue(1);
    mailbox.queue(2);
    mailbox.queue(3);

    expect(probe.queueFrameTask).toHaveBeenCalledTimes(1);
    expect(probe.queueFrameTask.mock.calls[0]![0].id).toBe("probe-1");

    probe.flush();
    mailbox.queue(4);

    expect(probe.queueFrameTask).toHaveBeenCalledTimes(2);
    expect(probe.queueFrameTask.mock.calls[1]![0].id).toBe("probe-2");
  });

  it("throws when id is empty", () => {
    const probe = createScheduler();
    const mailbox = createFrameMailbox({
      scheduler: probe.scheduler,
      id: "",
      apply: vi.fn(),
    });

    expect(() => mailbox.queue(1)).toThrow(/non-empty task id/);
  });

  it("coalesces through the real scheduler and preserves priority order", async () => {
    const raf = installRaf();
    const order: string[] = [];
    let scheduler: ReturnType<typeof useTerminal>["scheduler"] | null = null;
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const Probe = defineComponent({
      name: "FrameMailboxSchedulerProbe",
      setup() {
        const ctx = useTerminal();
        scheduler = ctx.scheduler;
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () => h(TText, { x: 0, y: 0, w: 8, value: "probe" });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: Probe });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      framePerf!.clear();

      const high = createFrameMailbox<number>({
        scheduler: scheduler!,
        id: "high",
        reason: "input",
        priority: "high",
        apply(value, ctx, meta) {
          order.push(`high:${value}:${meta.dropped}`);
          ctx.invalidate({ priority: "high", reason: "input" });
        },
      });
      const low = createFrameMailbox<number>({
        scheduler: scheduler!,
        id: "low",
        reason: "data",
        priority: "low",
        apply(value, ctx, meta) {
          order.push(`low:${value}:${meta.dropped}`);
          ctx.invalidate({ priority: "low", reason: "data" });
        },
      });

      for (let i = 0; i < 100; i++) low.queue(i);
      for (let i = 0; i < 100; i++) high.queue(i);

      expect(raf.callbacks.size).toBe(1);
      raf.runNext();
      await nextTick();

      expect(order).toEqual(["high:99:99", "low:99:99"]);
      expect(framePerf!.latest()).toMatchObject({
        frameTaskCount: 2,
        coalescedFrameTasks: 0,
        droppedUpdates: 198,
        remainingFrameTasks: 0,
      });
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("defers low-priority mailbox work when frame budget is exhausted after high work", async () => {
    const raf = installRaf();
    const order: string[] = [];
    let scheduler: ReturnType<typeof useTerminal>["scheduler"] | null = null;
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const Probe = defineComponent({
      name: "FrameMailboxBudgetProbe",
      setup() {
        const ctx = useTerminal();
        scheduler = ctx.scheduler;
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () => h(TText, { x: 0, y: 0, w: 8, value: "probe" });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: Probe });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      framePerf!.clear();
      scheduler!.configure({ frameBudgetMs: 0 });

      const high = createFrameMailbox<number>({
        scheduler: scheduler!,
        id: "high-budget",
        reason: "input",
        priority: "high",
        apply(value, ctx) {
          order.push(`high:${value}`);
          ctx.invalidate({ priority: "high", reason: "input" });
        },
      });
      const low = createFrameMailbox<number>({
        scheduler: scheduler!,
        id: "low-budget",
        reason: "data",
        priority: "low",
        apply(value, ctx) {
          order.push(`low:${value}`);
          ctx.invalidate({ priority: "low", reason: "data" });
        },
      });

      high.queue(1);
      low.queue(1);

      expect(raf.callbacks.size).toBe(1);
      raf.runNext();
      await nextTick();

      expect(order).toEqual(["high:1"]);
      expect(framePerf!.latest()).toMatchObject({
        frameTaskCount: 1,
        remainingFrameTasks: 1,
      });

      raf.runNext();
      await nextTick();

      expect(order).toEqual(["high:1", "low:1"]);
      expect(framePerf!.latest()).toMatchObject({
        frameTaskCount: 1,
        remainingFrameTasks: 0,
      });
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("coalesces mailbox updates through timer fallback when requestAnimationFrame is unavailable", async () => {
    vi.useFakeTimers();
    const noRaf = disableRaf();
    let scheduler: ReturnType<typeof useTerminal>["scheduler"] | null = null;
    const apply = vi.fn();

    const Probe = defineComponent({
      name: "FrameMailboxTimerFallbackProbe",
      setup() {
        scheduler = useTerminal().scheduler;
        return () => h(TText, { x: 0, y: 0, value: "probe" });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: Probe });

    try {
      app.mount();
      app.scheduler.flushNow();

      const mailbox = createFrameMailbox<number>({
        scheduler: scheduler!,
        id: "timer-fallback",
        apply,
      });

      mailbox.queue(1);
      mailbox.queue(2);
      mailbox.queue(3);

      expect(apply).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(20);
      await nextTick();

      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith(3, expect.anything(), { queued: 3, dropped: 2 });
    } finally {
      app.dispose();
      noRaf.restore();
      vi.useRealTimers();
    }
  });

  it("cancels mailbox timer fallback task before it runs", async () => {
    vi.useFakeTimers();
    const noRaf = disableRaf();
    let scheduler: ReturnType<typeof useTerminal>["scheduler"] | null = null;
    const apply = vi.fn();

    const Probe = defineComponent({
      name: "FrameMailboxTimerCancelProbe",
      setup() {
        scheduler = useTerminal().scheduler;
        return () => h(TText, { x: 0, y: 0, value: "probe" });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: Probe });

    try {
      app.mount();
      app.scheduler.flushNow();

      const mailbox = createFrameMailbox<number>({
        scheduler: scheduler!,
        id: "timer-cancel",
        apply,
      });

      mailbox.queue(1);
      mailbox.cancel();

      await vi.advanceTimersByTimeAsync(20);
      await nextTick();

      expect(apply).not.toHaveBeenCalled();
    } finally {
      app.dispose();
      noRaf.restore();
      vi.useRealTimers();
    }
  });

  it("does not create a framePerf sample for dropped no-op mailbox runs without invalidation", async () => {
    const raf = installRaf();
    const commits: unknown[] = [];
    let scheduler: ReturnType<typeof useTerminal>["scheduler"] | null = null;
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const Probe = defineComponent({
      name: "FrameMailboxNoopDroppedProbe",
      setup() {
        const ctx = useTerminal();
        scheduler = ctx.scheduler;
        framePerf = ctx.observability.framePerf;
        framePerf.enabled.value = true;
        return () => h(TText, { x: 0, y: 0, value: "probe" });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 4, component: Probe });
    const offCommit = app.terminal.on("commit", (commit) => commits.push(commit));

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      framePerf!.clear();
      commits.length = 0;

      const mailbox = createFrameMailbox<number>({
        scheduler: scheduler!,
        id: "noop-dropped",
        apply: () => {},
      });

      mailbox.queue(1);
      mailbox.queue(2);
      mailbox.queue(3);

      raf.runNext();
      await nextTick();

      expect(commits).toHaveLength(0);
      expect(framePerf!.latest()).toBeNull();
    } finally {
      offCommit();
      app.dispose();
      raf.restore();
    }
  });
});
