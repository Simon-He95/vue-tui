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

function createScheduler() {
  const tasks = new Map<string, TerminalFrameTask>();
  const queueFrameTask = vi.fn((task: TerminalFrameTask) => {
    tasks.set(task.id ?? String(tasks.size), task);
  });
  const cancelFrameTask = vi.fn((id: string) => {
    tasks.delete(id);
  });
  const ctx: TerminalFrameContext = {
    frameId: 1,
    startedAt: 0,
    now: () => 0,
    budgetMs: 8,
    remainingMs: () => 8,
    requestMore: vi.fn(),
    invalidate: vi.fn(),
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
    flush() {
      const pending = Array.from(tasks.values());
      tasks.clear();
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

    expect(probe.queueFrameTask).toHaveBeenCalledTimes(3);
    expect(
      probe.queueFrameTask.mock.calls.map(
        ([task]: [TerminalFrameTask]) => task.id,
      ),
    ).toEqual(["probe-1", "probe-1", "probe-1"]);

    probe.flush();
    mailbox.queue(4);

    expect(probe.queueFrameTask.mock.calls[3]![0].id).toBe("probe-2");
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
        coalescedFrameTasks: 198,
        remainingFrameTasks: 0,
      });
    } finally {
      app.dispose();
      raf.restore();
    }
  });
});
