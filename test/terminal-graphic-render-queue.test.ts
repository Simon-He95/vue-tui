import { describe, expect, it, vi } from "vitest";
import { createTerminalGraphicRenderQueue } from "../src/agent.js";

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
