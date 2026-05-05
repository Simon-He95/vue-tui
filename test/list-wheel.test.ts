import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, vShow, withDirectives } from "vue";
import { createTerminalApp, TList, TRenderPlane, TText, TView, useTerminal } from "../src/index.js";

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

  it("does not synchronously commit while mounting an initially scrolled TList", () => {
    const commits: unknown[] = [];
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: defineComponent({
        name: "InitialScrolledTListMountApp",
        setup() {
          return () => [
            h(TList, {
              x: 0,
              y: 0,
              w: 12,
              h: 4,
              items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
              modelValue: 50,
              autoFocus: true,
            }),
            h(TText, { x: 0, y: 6, value: "sibling" }),
          ];
        },
      }),
    });

    const off = app.terminal.on("commit", (commit) => commits.push(commit));
    try {
      app.mount();
      expect(commits).toHaveLength(0);

      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");
      expect(rowText(app, 6)).toBe("sibling");
    } finally {
      off();
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
      expect(framePerf!.latest()?.dirtyRows).toBeLessThanOrEqual(4);
      expect(framePerf!.latest()?.paintedNodes).toBe(1);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("coalesces TList wheel burst through timer fallback without RAF", async () => {
    vi.useFakeTimers();
    const noRaf = disableRaf();
    const items = Array.from({ length: 1_000 }, (_, index) => `item-${index}`);
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

      await vi.advanceTimersByTimeAsync(20);
      await nextTick();

      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe(`item-${onScroll.mock.calls[0]![0]}`);
    } finally {
      app.dispose();
      noRaf.restore();
      vi.useRealTimers();
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

      expect(top).toBe(1);
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(1);
      expect(rowText(app, 0)).toBe("item-1");
    } finally {
      app.dispose();
    }
  });

  it("does not emit update:modelValue or commit for ArrowUp at the first item", async () => {
    const commits: unknown[] = [];
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
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      const off = app.terminal.on("commit", (commit) => commits.push(commit));

      app.events.dispatch({ type: "keydown", key: "ArrowUp", code: "ArrowUp", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(commits).toHaveLength(0);
      off();
    } finally {
      app.dispose();
    }
  });

  it("does not emit update:modelValue or commit for Home at the first item", async () => {
    const commits: unknown[] = [];
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
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      const off = app.terminal.on("commit", (commit) => commits.push(commit));

      app.events.dispatch({ type: "keydown", key: "Home", code: "Home", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(commits).toHaveLength(0);
      off();
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
      expect(top).toBe(100);
      expect(selected).toBe(104);
      expect(rowText(app, 0)).toBe("item-101");
    } finally {
      app.dispose();
    }
  });

  it("does not emit scroll when keyboard selection moves the viewport", async () => {
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
        items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        onScroll,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "End", code: "End", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onScroll).not.toHaveBeenCalled();
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(99);
      expect(rowText(app, 0)).toBe("item-96");
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
      expect(top).toBe(97);
      expect(selected).toBe(93);
      expect(rowText(app, 0)).toBe("item-93");
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

      expect(top).toBe(100);
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(100);
      expect(onChange).toHaveBeenLastCalledWith({ index: 100, value: "item-100" });
      expect(rowText(app, 0)).toBe("item-100");
    } finally {
      app.dispose();
    }
  });

  it("emits change but not update:modelValue when Enter commits the current active row", async () => {
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
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        onChange,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onChange).toHaveBeenCalledWith({ index: 0, value: "item-0" });
      expect(onUpdateModelValue).not.toHaveBeenCalled();
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

  it("external modelValue from synchronous onScroll wins after wheel apply", async () => {
    const App = defineComponent({
      name: "ListWheelOnScrollModelValueApp",
      setup() {
        const modelValue = ref(0);
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
            modelValue: modelValue.value,
            autoFocus: true,
            onScroll: () => {
              modelValue.value = 50;
            },
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
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-47");
    } finally {
      app.dispose();
    }
  });

  it("external modelValue and same-tick items replacement beat a stale pending wheel", async () => {
    const raf = installRaf();
    const onScroll = vi.fn();
    let replaceData!: () => void;
    const App = defineComponent({
      name: "ListWheelPendingReplacementApp",
      setup() {
        const modelValue = ref(0);
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        replaceData = () => {
          modelValue.value = 50;
          items.value = Array.from({ length: 200 }, (_, index) => `next-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
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

      replaceData();
      await nextTick();
      app.scheduler.flushNow();

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("next-47");
      expect(app.terminal.getRow(3)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("repaints a detached viewport when items are replaced with the same length", async () => {
    let replaceItems!: () => void;
    const App = defineComponent({
      name: "DetachedSameLengthReplacementApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        replaceItems = () => {
          items.value = Array.from({ length: 100 }, (_, index) => `next-${index}`);
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
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 1000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const top = Number(rowText(app, 0).slice("item-".length));

      replaceItems();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe(`next-${top}`);
    } finally {
      app.dispose();
    }
  });

  it("repaints same-length in-place item mutation when itemVersion changes", async () => {
    let mutate!: () => void;
    const App = defineComponent({
      name: "TListItemVersionMutationApp",
      setup() {
        const items = ref(["item-0", "item-1", "item-2", "item-3"]);
        const itemVersion = ref(0);
        mutate = () => {
          items.value[2] = "changed";
          itemVersion.value++;
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            itemVersion: itemVersion.value,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      mutate();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2)).toBe("changed");
    } finally {
      app.dispose();
    }
  });

  it("does not reattach detached viewport on parent re-render with the same modelValue", async () => {
    let rerender!: () => void;
    const App = defineComponent({
      name: "DetachedSameModelValueRerenderApp",
      setup() {
        const tick = ref(0);
        rerender = () => {
          tick.value++;
        };
        return () => [
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
            modelValue: 2,
            autoFocus: true,
          }),
          h(TText, { x: 0, y: 6, value: `tick-${tick.value}` }),
        ];
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

      rerender();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-1");
      expect(rowText(app, 6)).toBe("tick-1");
    } finally {
      app.dispose();
    }
  });

  it("does not emit scroll when external modelValue sync moves the viewport", async () => {
    const onScroll = vi.fn();
    let setModelValue!: (value: number) => void;
    const App = defineComponent({
      name: "ExternalModelValueScrollSemanticsApp",
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
            items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
            modelValue: modelValue.value,
            autoFocus: true,
            onScroll,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      setModelValue(50);
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("item-47");
    } finally {
      app.dispose();
    }
  });

  it("restores controlled modelValue when items grow after an initial empty list", async () => {
    let load!: () => void;
    const App = defineComponent({
      name: "ControlledModelValueGrowthApp",
      setup() {
        const items = ref<string[]>([]);
        load = () => {
          items.value = Array.from({ length: 100 }, (_, index) => `item-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 50,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      load();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-47");
      expect(app.terminal.getRow(3)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("restores controlled modelValue after shrink then grow when not detached", async () => {
    let setLength!: (next: number) => void;
    const App = defineComponent({
      name: "ControlledModelValueShrinkGrowApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        setLength = (next) => {
          items.value = Array.from({ length: next }, (_, index) => `item-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 50,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");

      setLength(10);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-6");

      setLength(100);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");
    } finally {
      app.dispose();
    }
  });

  it("restores controlled modelValue after shrinking to empty and growing again", async () => {
    let setLength!: (next: number) => void;
    const App = defineComponent({
      name: "ControlledModelValueEmptyShrinkGrowApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        setLength = (next) => {
          items.value = Array.from({ length: next }, (_, index) => `item-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 50,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");

      setLength(0);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("(empty)");

      setLength(100);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");
    } finally {
      app.dispose();
    }
  });

  it("resets pending wheel base after external modelValue wins", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
    let setModelValue!: (value: number) => void;
    const App = defineComponent({
      name: "ListWheelPendingBaseResetApp",
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
      setModelValue(50);
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_010 });
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-48");
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
        const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
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

  it("repaints old and new active rows on keyboard selection without scrolling", async () => {
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: ["a", "b", "c", "d"],
        modelValue: 0,
        autoFocus: true,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
      expect(app.terminal.getRow(1)[0]?.style.inverse).not.toBe(true);

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(app.terminal.getRow(0)[0]?.style.inverse).not.toBe(true);
      expect(app.terminal.getRow(1)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("keyboard selection repaints only old and new active rows", async () => {
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;
    const Probe = defineComponent({
      name: "TListDirtyRowsProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });
    const App = defineComponent({
      name: "TListDirtyRowsApp",
      setup() {
        return () => [
          h(Probe),
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 10,
            items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
            modelValue: 0,
            autoFocus: true,
          }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 16, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      framePerf!.clear();

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(framePerf!.latest()?.dirtyRows).toBeLessThanOrEqual(2);
      expect(app.terminal.getRow(0)[0]?.style.inverse).not.toBe(true);
      expect(app.terminal.getRow(1)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("repaints active rows when external modelValue changes without scrolling", async () => {
    let setModelValue!: (value: number) => void;
    const App = defineComponent({
      name: "ExternalModelValueStyleApp",
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
            items: ["a", "b", "c", "d"],
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

      setModelValue(2);
      await nextTick();
      app.scheduler.flushNow();

      expect(app.terminal.getRow(0)[0]?.style.inverse).not.toBe(true);
      expect(app.terminal.getRow(2)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("updates the active style when the style object is replaced", async () => {
    let setStyle!: (fg: string) => void;
    const App = defineComponent({
      name: "TListStyleReplacementApp",
      setup() {
        const style = ref({ fg: "red" });
        setStyle = (fg) => {
          style.value = { fg };
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: ["a", "b", "c", "d"],
            modelValue: 0,
            autoFocus: true,
            style: style.value,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(app.terminal.getRow(0)[0]?.style.fg).toBe("red");

      setStyle("blue");
      await nextTick();
      app.scheduler.flushNow();

      expect(app.terminal.getRow(0)[0]?.style.fg).toBe("blue");
      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("does not keep stale active style when style object is mutated in place", async () => {
    const style = { fg: "red" };
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: ["a", "b", "c", "d"],
        modelValue: 0,
        autoFocus: true,
        style,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(app.terminal.getRow(0)[0]?.style.fg).toBe("red");

      style.fg = "blue";
      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(app.terminal.getRow(1)[0]?.style.fg).toBe("blue");
      expect(app.terminal.getRow(1)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("clicking the same active row clears detached mode without emitting update:modelValue", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    let setHeight!: (value: number) => void;
    const onUpdateModelValue = vi.fn();
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
              onUpdateModelValue(value);
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
      expect(onUpdateModelValue).not.toHaveBeenCalled();
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

  it("keeps multiple TList wheel mailboxes independent across bursts", async () => {
    const raf = installRaf();
    const first = Array.from({ length: 50 }, (_, index) => `a-${index}`);
    const second = Array.from({ length: 50 }, (_, index) => `b-${index}`);
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    const App = defineComponent({
      name: "MultipleListWheelMailboxApp",
      setup() {
        return () => [
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 3,
            items: first,
            autoFocus: true,
            onScroll: firstScroll,
          }),
          h(TList, { x: 0, y: 4, w: 12, h: 3, items: second, onScroll: secondScroll }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      for (let i = 0; i < 20; i++) {
        app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 + i });
      }
      for (let i = 0; i < 30; i++) {
        app.events.dispatch({ type: "wheel", cellX: 0, cellY: 4, deltaY: 100, time: 2_000 + i });
      }

      expect(raf.callbacks.size).toBe(1);
      raf.runNext();
      await nextTick();

      expect(firstScroll).toHaveBeenCalledTimes(1);
      expect(secondScroll).toHaveBeenCalledTimes(1);
      const firstTop = firstScroll.mock.calls[0]![0];
      const secondTop = secondScroll.mock.calls[0]![0];
      expect(secondTop).toBeGreaterThan(firstTop);
      expect(rowText(app, 0)).toBe(`a-${firstTop}`);
      expect(rowText(app, 4)).toBe(`b-${secondTop}`);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("emits scroll when data shrink programmatically clamps viewport", async () => {
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

  it("pending wheel plus data shrink before the frame does not apply a stale top", async () => {
    const raf = installRaf();
    let shrink!: () => void;
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "PendingWheelDataShrinkApp",
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
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      shrink();
      await nextTick();
      app.scheduler.flushNow();

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-16");
      expect(onScroll).toHaveBeenLastCalledWith(16);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("allows wheel reversal before the frame to cancel pending scroll without emitting scroll", async () => {
    const raf = installRaf();
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
        items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
        autoFocus: true,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: 1_010 });

      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();

      expect(onScroll).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("item-0");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("keeps an existing pending wheel scroll when later edge wheel events are no-ops", async () => {
    const raf = installRaf();
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
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
        autoFocus: true,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_010 });

      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();

      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(onScroll).toHaveBeenLastCalledWith(16);
      expect(rowText(app, 0)).toBe("item-16");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("drops a pending wheel frame when the list unmounts before RAF", async () => {
    const raf = installRaf();
    let hide!: () => void;
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "PendingWheelUnmountApp",
      setup() {
        const visible = ref(true);
        hide = () => {
          visible.value = false;
        };
        return () =>
          visible.value
            ? h(TList, {
                x: 0,
                y: 0,
                w: 12,
                h: 4,
                items: Array.from({ length: 200 }, (_, index) => `item-${index}`),
                autoFocus: true,
                onScroll,
              })
            : null;
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 1000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      hide();
      await nextTick();
      app.scheduler.flushNow();

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("repaints when items are mutated in place", async () => {
    let pushItem!: () => void;
    const App = defineComponent({
      name: "InPlaceItemsPushApp",
      setup() {
        const items = ref(["item-0", "item-1", "item-2", "item-3"]);
        pushItem = () => {
          items.value.push(`item-${items.value.length}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 5,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      pushItem();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 4)).toBe("item-4");
    } finally {
      app.dispose();
    }
  });

  it("clamps and repaints when items are spliced in place", async () => {
    let spliceItems!: () => void;
    const App = defineComponent({
      name: "InPlaceItemsSpliceApp",
      setup() {
        const items = ref(Array.from({ length: 30 }, (_, index) => `item-${index}`));
        spliceItems = () => {
          items.value.splice(10);
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
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 3000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      spliceItems();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-6");
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

  it("does not prevent default at the top edge when scrolling upward", () => {
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
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
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
        deltaY: -100,
        time: 1_000,
      });

      expect(prevented).toBe(false);
      expect(onScroll).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("does not prevent default at the bottom edge when scrolling downward", async () => {
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
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
        autoFocus: true,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const callCount = onScroll.mock.calls.length;

      const prevented = app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_010,
      });

      expect(prevented).toBe(false);
      expect(onScroll).toHaveBeenCalledTimes(callCount);
    } finally {
      app.dispose();
    }
  });

  it("uses clipped viewport height for wheel scroll range", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedWheelViewportApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: 4 },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 10,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-96");
    } finally {
      app.dispose();
    }
  });

  it("clipped viewport expansion clamps internal scrollTop", async () => {
    const onScroll = vi.fn();
    let setHeight!: (value: number) => void;
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedViewportExpansionClampApp",
      setup() {
        const height = ref(4);
        setHeight = (value) => {
          height.value = value;
        };
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: height.value },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 20,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  onScroll,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 24, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-96");

      setHeight(20);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-80");
      expect(onScroll).toHaveBeenLastCalledWith(80);
    } finally {
      app.dispose();
    }
  });

  it("click and wheel stay aligned with rows after clipped viewport height changes", async () => {
    const onUpdateModelValue = vi.fn();
    let setHeight!: (value: number) => void;
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedViewportInteractionApp",
      setup() {
        const height = ref(4);
        setHeight = (value) => {
          height.value = value;
        };
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: height.value },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 20,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  "onUpdate:modelValue": onUpdateModelValue,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 24, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      setHeight(20);
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-79");

      app.events.dispatch({ type: "click", cellX: 0, cellY: 2, time: 1_020 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).toHaveBeenLastCalledWith(81);
      expect(rowText(app, 2)).toBe("item-81");
    } finally {
      app.dispose();
    }
  });

  it("keeps paint, wheel, and click aligned when TList is clipped from the top", async () => {
    const onUpdateModelValue = vi.fn();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "TopClippedTListApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: 4, scrollY: 2 },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 10,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  "onUpdate:modelValue": onUpdateModelValue,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-2");

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 990 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-96");

      app.events.dispatch({ type: "click", cellX: 0, cellY: 1, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).toHaveBeenLastCalledWith(97);
      expect(rowText(app, 1)).toBe("item-97");
      expect(app.terminal.getRow(1)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("uses clipped viewport height for detached PageDown anchor", async () => {
    const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const App = defineComponent({
      name: "ClippedPageDownViewportApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: 4 },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 10,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  "onUpdate:modelValue": onUpdateModelValue,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      app.events.dispatch({ type: "keydown", key: "PageDown", code: "PageDown", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).toHaveBeenLastCalledWith(104);
      expect(rowText(app, 0)).toBe("item-101");
    } finally {
      app.dispose();
    }
  });

  it("clips list content from the left without rebasing visible text", () => {
    const App = defineComponent({
      name: "LeftClippedTListApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 7, h: 3 },
            {
              default: () =>
                h(TList, {
                  x: -3,
                  y: 0,
                  w: 10,
                  h: 3,
                  items: ["0123456789", "abcdefghij", "klmnopqrst"],
                  modelValue: 0,
                  autoFocus: true,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("3456789");
      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("does not split wide characters incorrectly when horizontally clipped", () => {
    const App = defineComponent({
      name: "WideCharClippedTListApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 2, h: 2 },
            {
              default: () =>
                h(TList, {
                  x: -1,
                  y: 0,
                  w: 3,
                  h: 2,
                  items: ["你a", "b"],
                  modelValue: 0,
                  autoFocus: true,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(app.terminal.getRow(0)[0]?.ch).toBe(" ");
      expect(app.terminal.getRow(0)[1]?.ch).toBe("a");
      expect(app.terminal.getRow(0)[0]?.continuation).not.toBe(true);
      expect(app.terminal.getRow(0)[1]?.continuation).not.toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("uses the normalized painted rect for fractional hit testing", async () => {
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0.5,
        y: 0.5,
        w: 12,
        h: 4,
        items: Array.from({ length: 10 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 3, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(3);

      app.events.dispatch({ type: "click", cellX: 0, cellY: 4, time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();
      expect(onUpdateModelValue).toHaveBeenCalledTimes(1);
    } finally {
      app.dispose();
    }
  });

  it("limits wheel commits to the current render plane for TList", async () => {
    const commits: Array<readonly string[] | null> = [];
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;
    const Probe = defineComponent({
      name: "PlaneScopedTListProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });
    const App = defineComponent({
      name: "PlaneScopedTListWheelApp",
      setup() {
        return () => [
          h(Probe),
          h(TText, { x: 0, y: 5, value: "default" }),
          h(TRenderPlane, { plane: "transcript" }, () => [
            h(TList, {
              x: 0,
              y: 0,
              w: 12,
              h: 4,
              items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
              autoFocus: true,
            }),
          ]),
          h(TRenderPlane, { plane: "overlay" }, () => [h(TText, { x: 0, y: 6, value: "overlay" })]),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const offCommit = app.terminal.on("commit", ({ planes }) => commits.push(planes));

    try {
      app.mount();
      app.scheduler.flushNow();
      commits.length = 0;
      framePerf!.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-1");
      expect(commits.at(-1)).toEqual(["transcript"]);
      expect(framePerf!.latest()?.dirtyRows).toBeLessThanOrEqual(4);
      expect(framePerf!.latest()?.paintedNodes).toBe(1);
    } finally {
      offCommit();
      app.dispose();
    }
  });

  it("does not wheel or emit scroll for an empty list", () => {
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
        items: [],
        autoFocus: true,
        onScroll,
        "onUpdate:modelValue": onUpdateModelValue,
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
      expect(onUpdateModelValue).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("does not throw when Enter is pressed on an empty list", async () => {
    const onChange = vi.fn();
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
        items: [],
        autoFocus: true,
        onChange,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(() =>
        app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_000 }),
      ).not.toThrow();
      app.scheduler.flushNow();
      await nextTick();

      expect(onChange).not.toHaveBeenCalled();
      expect(onUpdateModelValue).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("normalizes non-finite modelValue", () => {
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: ["a", "b", "c"],
        modelValue: Number.NaN,
        autoFocus: true,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("a");
      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("does not dirty visible terminal rows when hidden TList data changes", async () => {
    let setItems!: (items: string[]) => void;
    const show = ref(true);
    const commits: unknown[] = [];

    const App = defineComponent({
      name: "HiddenTListDataChangeApp",
      setup() {
        const items = ref(["hidden-0", "hidden-1"]);
        setItems = (next) => {
          items.value = next;
        };

        return () => [
          withDirectives(
            h(TList, {
              x: 0,
              y: 0,
              w: 12,
              h: 4,
              items: items.value,
              modelValue: 0,
              autoFocus: true,
            }),
            [[vShow, show.value]],
          ),
          h(TText, { x: 0, y: 0, value: "visible" }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    const off = app.terminal.on("commit", (commit) => commits.push(commit));
    try {
      app.mount();
      app.scheduler.flushNow();
      show.value = false;
      await nextTick();
      await nextTick();
      app.scheduler.flushNow();
      commits.length = 0;

      setItems(Array.from({ length: 100 }, (_, index) => `hidden-${index}`));
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("visible");
      expect(commits).toHaveLength(0);
    } finally {
      off();
      app.dispose();
    }
  });

  it("does not scroll or throw when height is zero", async () => {
    const onScroll = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 0,
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
        autoFocus: true,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(() =>
        app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 }),
      ).not.toThrow();
      expect(() =>
        app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_010 }),
      ).not.toThrow();
      app.scheduler.flushNow();
      await nextTick();

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
