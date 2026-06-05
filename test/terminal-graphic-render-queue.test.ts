import { describe, expect, it, vi } from "vitest";
import {
  createTerminalGraphicRenderQueue,
  getTerminalGraphicTraceMetrics,
  resetTerminalGraphicTraceMetrics,
} from "../src/agent.js";

describe("terminal graphic render queue", () => {
  it("limits concurrency and caches results", async () => {
    const metrics: string[] = [];
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 1,
      onMetric: (metric) => metrics.push(metric.type),
    });
    const starts: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const renderA = vi.fn(async () => {
      starts.push("a");
      await firstGate;
      return "A";
    });
    const renderB = vi.fn(async () => {
      starts.push("b");
      return "B";
    });

    const first = queue.cached("a", undefined, renderA, (value) => value.length);
    const second = queue.cached("b", undefined, renderB, (value) => value.length);

    await Promise.resolve();
    expect(starts).toEqual(["a"]);
    expect(queue.stats()).toMatchObject({ active: 1, waiting: 1 });

    releaseFirst();

    await expect(first).resolves.toBe("A");
    await expect(second).resolves.toBe("B");
    await expect(queue.cached("a", undefined, renderA)).resolves.toBe("A");

    expect(renderA).toHaveBeenCalledTimes(1);
    expect(renderB).toHaveBeenCalledTimes(1);
    expect(metrics).toContain("queue-wait");
    expect(metrics).toContain("cache-hit");
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0, cacheEntries: 2 });
  });

  it("does not share abortable in-flight renders by default", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 2 });
    let calls = 0;

    const first = queue.cached(
      "same-key",
      undefined,
      async () => {
        calls++;
        await Promise.resolve();
        throw new Error("first render aborted");
      },
      (value) => String(value).length,
    );

    const second = queue.cached(
      "same-key",
      undefined,
      async () => {
        calls++;
        return "second render";
      },
      (value) => value.length,
    );

    await expect(first).rejects.toThrow("first render aborted");
    await expect(second).resolves.toBe("second render");
    expect(calls).toBe(2);
  });

  it("can explicitly dedupe pure in-flight renders", async () => {
    const queue = createTerminalGraphicRenderQueue({
      maxConcurrency: 2,
      dedupeInflight: true,
    });
    let resolve!: (value: string) => void;
    const render = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );

    const first = queue.cached("same-key", undefined, render, (value) => value.length);
    const second = queue.cached("same-key", undefined, async () => "unused");
    await Promise.resolve();

    expect(render).toHaveBeenCalledTimes(1);
    resolve("shared render");
    await expect(first).resolves.toBe("shared render");
    await expect(second).resolves.toBe("shared render");
  });

  it("records queue wait trace metrics", async () => {
    resetTerminalGraphicTraceMetrics();

    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1 });
    let releaseFirst!: () => void;
    const first = queue.cached(
      "slow",
      undefined,
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve("slow");
        }),
      (value) => value.length,
    );
    const second = queue.cached(
      "queued",
      undefined,
      async () => "queued",
      (value) => value.length,
    );

    await Promise.resolve();
    releaseFirst();
    await Promise.all([first, second]);

    const metrics = getTerminalGraphicTraceMetrics();
    expect(metrics.queueWaits).toBeGreaterThan(0);
    expect(metrics.totalQueueWaitMs).toBeGreaterThanOrEqual(0);
    expect(metrics.maxQueueWaitMs).toBeGreaterThanOrEqual(0);

    resetTerminalGraphicTraceMetrics();
  });

  it("rejects aborted waiters", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1 });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = queue.cached("a", undefined, async () => {
      await firstGate;
      return "A";
    });
    const controller = new AbortController();
    const second = queue.cached("b", controller.signal, async () => "B");
    const secondResult = second.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );

    await Promise.resolve();
    controller.abort();
    releaseFirst();

    await expect(first).resolves.toBe("A");
    expect(await secondResult).toMatchObject({
      ok: false,
      error: { name: "AbortError" },
    });
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("rejects waiters when cleared", async () => {
    const queue = createTerminalGraphicRenderQueue({ maxConcurrency: 1 });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = queue.cached("a", undefined, async () => {
      await firstGate;
      return "A";
    });
    const second = queue.cached("b", undefined, async () => "B");
    const secondResult = second.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );

    await Promise.resolve();
    queue.clear();
    releaseFirst();

    await expect(first).resolves.toBe("A");
    expect(await secondResult).toMatchObject({
      ok: false,
      error: { name: "AbortError" },
    });
    expect(queue.stats()).toMatchObject({ active: 0, waiting: 0, cacheEntries: 0 });
  });
});
