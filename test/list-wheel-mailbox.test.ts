import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, vShow, withDirectives } from "vue";
import { createTerminalApp, TList, TRenderPlane, TText, TView, useTerminal } from "../src/index.js";
import { disableRaf, installRaf, rowText } from "./helpers/list.js";

describe("TList wheel mailbox", () => {
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

  it("does not suppress reversal after pending wheel reaches virtual edge", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
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

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 20_000, time: 1_000 });
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_010 });
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: 1_020 });

      expect(onScroll).not.toHaveBeenCalled();
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();

      const maxTop = items.length - 4;
      const finalTop = onScroll.mock.calls[0]![0];
      expect(finalTop).toBeLessThan(maxTop);
      expect(rowText(app, 0)).toBe(`item-${finalTop}`);
    } finally {
      app.dispose();
      raf.restore();
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

  it("cancels pending wheel scroll when Escape closes without unmounting", async () => {
    const raf = installRaf();
    const onClose = vi.fn();
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
        onClose,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      app.events.dispatch({ type: "keydown", key: "Escape", code: "Escape", time: 1_010 });
      expect(onClose).toHaveBeenCalledTimes(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("item-0");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("cancels pending wheel scroll when an invalid click closes without unmounting", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const onClose = vi.fn();
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
        onClose,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 1000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onScroll).toHaveBeenCalled();
      onScroll.mockClear();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: 1_010 });
      expect(raf.callbacks.size).toBe(1);

      items.length = 2;
      app.events.dispatch({ type: "click", cellX: 0, cellY: 3, time: 1_020 });
      expect(onClose).toHaveBeenCalledTimes(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("cancels pending wheel scroll when closeOnBlur closes without unmounting", async () => {
    const raf = installRaf();
    const onBlur = vi.fn();
    const onClose = vi.fn();
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "TListCloseOnBlurPendingWheelApp",
      setup() {
        return () => [
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
            autoFocus: true,
            closeOnBlur: true,
            onBlur,
            onClose,
            onScroll,
          }),
          h(TView, { x: 0, y: 5, w: 12, h: 1, focusable: true }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 5, time: 1_010 });
      expect(onBlur).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("item-0");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("cancels pending wheel scroll before double click even on an invalid row", async () => {
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
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 1000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onScroll).toHaveBeenCalled();
      onScroll.mockClear();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: 1_010 });
      expect(raf.callbacks.size).toBe(1);

      items.length = 2;
      app.events.dispatch({ type: "dblclick", cellX: 0, cellY: 3, time: 1_020 });

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("repaints same-plane overlapping nodes for TList dirty rows", async () => {
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;
    const Probe = defineComponent({
      name: "TListOverlayDirtyRowsProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });
    const App = defineComponent({
      name: "TListOverlayDirtyRowsApp",
      setup() {
        return () => [
          h(Probe),
          h(TList, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
            autoFocus: true,
          }),
          h(TText, { x: 0, y: 1, w: 20, value: "overlay-row", zIndex: 10 }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 24, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(rowText(app, 1)).toBe("overlay-row");
      framePerf!.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-1");
      expect(rowText(app, 1)).toBe("overlay-row");
      expect(framePerf!.latest()?.paintedNodes).toBeGreaterThanOrEqual(2);
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

  it("clears pending wheel state when queueFrameTask is rejected", () => {
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
      const originalQueue = app.scheduler.queueFrameTask.bind(app.scheduler);
      (app.scheduler as any).queueFrameTask = () => false;

      const prevented = app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_000,
      });

      expect(prevented).toBe(false);
      expect(onScroll).not.toHaveBeenCalled();

      (app.scheduler as any).queueFrameTask = originalQueue;

      const nextPrevented = app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 100,
        time: 1_010,
      });
      app.scheduler.flushNow();

      expect(nextPrevented).toBe(true);
      expect(onScroll).toHaveBeenLastCalledWith(1);
    } finally {
      app.dispose();
    }
  });

  it("does not leave a stale pending wheel base when queueFrameTask runs synchronously", async () => {
    const onScroll = vi.fn();
    let bumpVersion!: () => void;
    const App = defineComponent({
      name: "TListSyncWheelSchedulerApp",
      setup() {
        const itemVersion = ref(0);
        bumpVersion = () => {
          itemVersion.value++;
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: Array.from({ length: 200 }, (_, index) => `item-${index}`),
            itemVersion: itemVersion.value,
            autoFocus: true,
            onScroll,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      const invalidate = app.scheduler.invalidate.bind(app.scheduler);
      (app.scheduler as any).queueFrameTask = (task: any) => {
        task.run({
          frameId: 1,
          startedAt: 0,
          now: () => 0,
          budgetMs: 16,
          remainingMs: () => 16,
          requestMore: () => {},
          invalidate,
          reportDroppedUpdates: () => {},
        });
        return true;
      };

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 32, time: 1_000 });
      expect(onScroll).toHaveBeenLastCalledWith(2);

      bumpVersion();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 32, time: 1_010 });

      expect(onScroll.mock.calls.at(-1)?.[0]).toBeGreaterThan(10);
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
