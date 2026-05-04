import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { createTerminalApp, TList, useTerminal } from "../src/index.js";

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

function rowText(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

describe("TList wheel scrolling", () => {
  it("does not emit update:modelValue when wheel scrolling", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const onScroll = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items,
        modelValue: 0,
        autoFocus: true,
        onScroll,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(onScroll).toHaveBeenCalledTimes(1);
    } finally {
      app.dispose();
    }
  });

  it("coalesces consecutive wheel events into one frame scroll update", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 1_000 }, (_, index) => `item-${index}`);
    const onScroll = vi.fn();
    const onUpdateModelValue = vi.fn();
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const Probe = defineComponent({
      name: "ListWheelFramePerfProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });
    const App = defineComponent({
      name: "ListWheelBurstApp",
      setup() {
        return () => [
          h(Probe),
          h(TList, {
            x: 0,
            y: 0,
            w: 16,
            h: 4,
            items,
            modelValue: 0,
            autoFocus: true,
            onScroll,
            "onUpdate:modelValue": onUpdateModelValue,
          }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      framePerf!.clear();

      for (let i = 0; i < 50; i++) {
        app.events.dispatch({
          type: "wheel",
          cellX: 0,
          cellY: 0,
          deltaY: 100,
          time: 1_000 + i * 10,
        });
      }

      expect(onScroll).not.toHaveBeenCalled();
      expect(raf.callbacks.size).toBe(1);
      raf.runNext();
      await nextTick();

      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe(`item-${onScroll.mock.calls[0]![0]}`);
      expect(framePerf!.latest()).toMatchObject({
        reason: "scroll",
        frameTaskCount: 1,
        coalescedFrameTasks: 49,
        remainingFrameTasks: 0,
      });
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("does not commit before the wheel frame runs", () => {
    const raf = installRaf();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items,
        autoFocus: true,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      const commits: unknown[] = [];
      const off = app.terminal.on("commit", (commit) => commits.push(commit));

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_010 });

      expect(commits).toEqual([]);
      raf.runNext();
      app.scheduler.flushNow();
      expect(commits).toHaveLength(1);
      off();
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("anchors keyboard navigation to visible viewport after detached wheel scroll", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items,
        modelValue: 0,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const top = Number(rowText(app, 0).slice("item-".length));

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(top).toBeGreaterThan(0);
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(top);
      expect(rowText(app, 0)).toBe(`item-${top}`);
    } finally {
      app.dispose();
    }
  });

  it("does not prevent default or scroll when wheel cannot change scrollTop", () => {
    const onScroll = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: ["0", "1"],
        autoFocus: true,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      const prevented = app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_000,
      });

      expect(prevented).toBe(false);
      expect(onScroll).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("normalizes pixel wheel deltas without large jumps", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items,
        autoFocus: true,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 1,
        deltaMode: 0,
        time: 1_000,
      } as any);
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-0");
    } finally {
      app.dispose();
    }
  });
});
