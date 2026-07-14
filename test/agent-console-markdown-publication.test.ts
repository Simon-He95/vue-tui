import { describe, expect, it, vi } from "vitest";
import { createMarkdownPublicationController } from "../examples/agent-console/src/markdown-publication-controller.js";

function harness(result: boolean | undefined = true) {
  let mode: "log" | "markdown" = "markdown";
  let task: (() => void) | undefined;
  const sync = vi.fn();
  const cancel = vi.fn();
  const controller = createMarkdownPublicationController({
    scheduler: {
      queueFrameTask(value) {
        task = value.run;
        return result;
      },
      cancelFrameTask: cancel,
    },
    getMode: () => mode,
    syncMarkdownBlocks: sync,
  });
  return {
    controller,
    sync,
    cancel,
    run: () => task?.(),
    mode: (value: typeof mode) => (mode = value),
  };
}

describe("Agent Console Markdown publication", () => {
  it("treats legacy undefined scheduler result as accepted and coalesces requests", () => {
    const value = harness(undefined);
    value.controller.request();
    value.controller.request();
    expect(value.sync).not.toHaveBeenCalled();
    value.run();
    expect(value.sync).toHaveBeenCalledTimes(1);
  });

  it("enforces a 32ms minimum interval across a continuous 12ms producer", () => {
    let now = 0;
    const frameTasks: Array<() => void> = [];
    const timers: Array<{ callback: () => void; deadline: number; cleared: boolean }> = [];
    const publications: number[] = [];
    const controller = createMarkdownPublicationController({
      scheduler: {
        queueFrameTask(task) {
          frameTasks.push(task.run);
          return true;
        },
      },
      getMode: () => "markdown",
      syncMarkdownBlocks: () => publications.push(now),
      minPublicationIntervalMs: 32,
      now: () => now,
      setTimer(callback, delayMs) {
        const timer = { callback, deadline: now + delayMs, cleared: false };
        timers.push(timer);
        return timer as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer(handle) {
        (handle as unknown as (typeof timers)[number]).cleared = true;
      },
    });
    const runDueTimers = () => {
      for (const timer of timers)
        if (!timer.cleared && timer.deadline <= now) {
          timer.cleared = true;
          timer.callback();
        }
    };
    const runFrame = () => frameTasks.shift()?.();

    controller.setMode("markdown");
    expect(publications).toEqual([0]);

    now = 12;
    controller.request();
    now = 16;
    runDueTimers();
    runFrame();
    expect(publications).toEqual([0]);

    now = 24;
    controller.request();
    now = 32;
    runDueTimers();
    runFrame();
    expect(publications).toEqual([0, 32]);

    now = 36;
    controller.request();
    now = 48;
    runDueTimers();
    runFrame();
    expect(publications).toEqual([0, 32]);

    now = 64;
    runDueTimers();
    runFrame();
    expect(publications).toEqual([0, 32, 64]);
    expect(publications.slice(1).every((value, index) => value - publications[index]! >= 32)).toBe(
      true,
    );
  });

  it("falls back synchronously only on explicit scheduler rejection", () => {
    const value = harness(false);
    value.controller.request();
    expect(value.sync).toHaveBeenCalledTimes(1);
  });

  it("cancels mode-exit work without hidden materialization and rejects stale callbacks", () => {
    const value = harness();
    value.controller.request();
    value.mode("log");
    value.controller.setMode("log");
    expect(value.cancel).toHaveBeenCalled();
    expect(value.sync).not.toHaveBeenCalled();
    value.run();
    expect(value.sync).not.toHaveBeenCalled();
  });

  it("cancels both timers and frame tasks on mode exit and dispose", () => {
    let mode: "log" | "markdown" = "markdown";
    let now = 0;
    let timer: (() => void) | undefined;
    let frame: (() => void) | undefined;
    const clearTimer = vi.fn();
    const cancelFrameTask = vi.fn();
    const sync = vi.fn();
    const controller = createMarkdownPublicationController({
      scheduler: {
        queueFrameTask(task) {
          frame = task.run;
          return true;
        },
        cancelFrameTask,
      },
      getMode: () => mode,
      syncMarkdownBlocks: sync,
      minPublicationIntervalMs: 32,
      now: () => now,
      setTimer(callback) {
        timer = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer,
    });

    controller.setMode("markdown");
    sync.mockClear();
    now = 12;
    controller.request();
    mode = "log";
    controller.setMode("log");
    expect(clearTimer).toHaveBeenCalledTimes(1);
    timer?.();
    frame?.();
    expect(sync).not.toHaveBeenCalled();

    mode = "markdown";
    now = 40;
    controller.setMode("markdown");
    now = 72;
    controller.request();
    controller.dispose();
    frame?.();
    expect(cancelFrameTask).toHaveBeenCalled();
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
