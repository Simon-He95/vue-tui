import { describe, expect, it, vi } from "vitest";
import type {
  TerminalFrameContext,
  TerminalFrameTask,
  TerminalScheduler,
} from "../src/vue/context.js";
import { createFrameMailbox } from "../src/vue/scheduler/frame-mailbox.js";

function createScheduler() {
  const tasks: TerminalFrameTask[] = [];
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
    queueFrameTask: (task) => {
      tasks.push(task);
    },
    requestLive: vi.fn(() => vi.fn()),
    dropLive: vi.fn(),
    isInsideFrame: vi.fn(() => false),
  };

  return {
    scheduler,
    flush() {
      const pending = tasks.splice(0);
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
});
