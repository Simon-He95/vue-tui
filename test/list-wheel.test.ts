import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
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
        coalescedFrameTasks: 0,
        droppedUpdates: 49,
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

  it("anchors PageDown to the visible viewport after detached wheel scroll", async () => {
    const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
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
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const top = Number(rowText(app, 0).slice("item-".length));

      app.events.dispatch({ type: "keydown", key: "PageDown", code: "PageDown", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      const selected = onUpdateModelValue.mock.calls.at(-1)![0];
      expect(top).toBeGreaterThan(4);
      expect(selected).toBeGreaterThan(4);
      expect(rowText(app, 0)).not.toBe("item-0");
    } finally {
      app.dispose();
    }
  });

  it("anchors PageUp to the visible viewport after detached wheel scroll", async () => {
    const items = Array.from({ length: 260 }, (_, index) => `item-${index}`);
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
        modelValue: 200,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const top = Number(rowText(app, 0).slice("item-".length));

      app.events.dispatch({ type: "keydown", key: "PageUp", code: "PageUp", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      const selected = onUpdateModelValue.mock.calls.at(-1)![0];
      expect(top).toBeLessThan(200);
      expect(selected).toBeLessThan(200);
      expect(rowText(app, 0)).not.toBe("item-197");
    } finally {
      app.dispose();
    }
  });

  it("commits the visible selection after detached wheel scroll", async () => {
    const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const onChange = vi.fn();
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
        onChange,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const top = Number(rowText(app, 0).slice("item-".length));

      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(top).toBeGreaterThan(0);
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(top);
      expect(onChange).toHaveBeenLastCalledWith({ index: top, value: `item-${top}` });
    } finally {
      app.dispose();
    }
  });

  it("enters detached mode before synchronous onScroll side effects", async () => {
    const App = defineComponent({
      name: "ListWheelOnScrollSideEffectApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            onScroll: () => {
              items.value = [...items.value, `item-${items.value.length}`];
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-100");
    } finally {
      app.dispose();
    }
  });

  it("cancels pending wheel scroll when keyboard navigation runs first", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const onScroll = vi.fn();
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
        onScroll,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);
      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_010 });
      app.scheduler.flushNow();
      raf.runNext();
      await nextTick();

      expect(onScroll).not.toHaveBeenCalled();
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(1);
      expect(rowText(app, 0)).toBe("item-0");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("external modelValue updates win over a pending wheel frame", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const onScroll = vi.fn();
    let setModelValue!: (value: number) => void;
    const App = defineComponent({
      name: "ListWheelExternalModelValueApp",
      setup() {
        const modelValue = ref(0);
        setModelValue = (value) => {
          modelValue.value = value;
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items,
            modelValue: modelValue.value,
            autoFocus: true,
            onScroll,
            "onUpdate:modelValue": (value: number) => {
              modelValue.value = value;
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      setModelValue(50);
      await nextTick();
      app.scheduler.flushNow();

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("item-47");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("does not issue a redundant high flush for reflected modelValue", async () => {
    const commits: unknown[] = [];
    const App = defineComponent({
      name: "ControlledListModelValueApp",
      setup() {
        const modelValue = ref(0);
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
            modelValue: modelValue.value,
            autoFocus: true,
            "onUpdate:modelValue": (value: number) => {
              modelValue.value = value;
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      const off = app.terminal.on("commit", (commit) => commits.push(commit));

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-0");
      expect(commits).toHaveLength(1);
      off();
    } finally {
      app.dispose();
    }
  });

  it("clicking the same active row clears detached mode", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    let setHeight!: (value: number) => void;
    const App = defineComponent({
      name: "ListWheelReattachApp",
      setup() {
        const height = ref(4);
        const modelValue = ref(2);
        setHeight = (value) => {
          height.value = value;
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: height.value,
            items,
            modelValue: modelValue.value,
            autoFocus: true,
            "onUpdate:modelValue": (value: number) => {
              modelValue.value = value;
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-1");

      app.events.dispatch({ type: "click", cellX: 0, cellY: 1, time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      setHeight(1);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-2");
    } finally {
      app.dispose();
    }
  });

  it("does not schedule a redundant follow-up repaint after one wheel frame", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 1_000 }, (_, index) => `item-${index}`);
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

      for (let i = 0; i < 50; i++) {
        app.events.dispatch({
          type: "wheel",
          cellX: 0,
          cellY: 0,
          deltaY: 100,
          time: 1_000 + i * 10,
        });
      }

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();

      expect(raf.callbacks.size).toBe(0);
      expect(commits).toHaveLength(1);
      off();
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("keeps multiple TList wheel mailboxes independent", async () => {
    const raf = installRaf();
    const first = Array.from({ length: 50 }, (_, index) => `a-${index}`);
    const second = Array.from({ length: 50 }, (_, index) => `b-${index}`);
    const App = defineComponent({
      name: "MultipleListWheelMailboxApp",
      setup() {
        return () => [
          h(TList, { x: 0, y: 0, w: 12, h: 3, items: first, autoFocus: true }),
          h(TList, { x: 0, y: 4, w: 12, h: 3, items: second }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 4, deltaY: 100, time: 1_000 });

      expect(raf.callbacks.size).toBe(1);
      raf.runNext();
      await nextTick();

      expect(rowText(app, 0)).toBe("a-1");
      expect(rowText(app, 4)).toBe("b-1");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("clamps scrollTop and emits scroll when items shrink", async () => {
    let shrink!: () => void;
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "ListWheelShrinkClampApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        shrink = () => {
          items.value = items.value.slice(0, 20);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            onScroll,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      shrink();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-16");
      expect(onScroll).toHaveBeenLastCalledWith(16);
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

  it("coalesces accumulated pixel wheel deltas without large jumps", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
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
        autoFocus: true,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      for (let i = 0; i < 20; i++) {
        app.events.dispatch({
          type: "wheel",
          cellX: 0,
          cellY: 0,
          deltaY: 1,
          deltaMode: 0,
          time: 1_000 + i * 10,
        } as any);
      }

      expect(raf.callbacks.size).toBeLessThanOrEqual(1);
      raf.runNext();
      await nextTick();

      const top = Number(rowText(app, 0).slice("item-".length));
      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(top).toBeGreaterThanOrEqual(1);
      expect(top).toBeLessThanOrEqual(2);
    } finally {
      app.dispose();
      raf.restore();
    }
  });
});
