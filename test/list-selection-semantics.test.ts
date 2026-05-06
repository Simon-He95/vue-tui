import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, vShow, withDirectives } from "vue";
import { createTerminalApp, TList, TRenderPlane, TText, TView, useTerminal } from "../src/index.js";
import { disableRaf, installRaf, rowText } from "./helpers/list.js";

describe("TList selection semantics", () => {
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

  it("reattaches PageDown to the current visible viewport after detached wheel scroll", async () => {
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
      expect(selected).toBe(107);
      expect(rowText(app, 0)).toBe("item-104");
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

  it("reattaches PageUp to the current visible viewport after detached wheel scroll", async () => {
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

  it("does not commit when reattaching detached state without any visual change", async () => {
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
        modelValue: 2,
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

      const commits: unknown[] = [];
      const off = app.terminal.on("commit", (commit) => commits.push(commit));

      app.events.dispatch({ type: "click", cellX: 0, cellY: 1, time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      off();
      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(commits).toHaveLength(0);
    } finally {
      app.dispose();
    }
  });

  it("does not invalidate when external modelValue only cancels a pending wheel", async () => {
    const raf = installRaf();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    let setModelValue!: (value: number) => void;
    const invalidates: unknown[] = [];

    const Probe = defineComponent({
      name: "PendingWheelCancelInvalidateProbe",
      setup() {
        const scheduler = useTerminal().scheduler;
        const originalInvalidate = scheduler.invalidate.bind(scheduler);
        (scheduler as any).invalidate = (options?: unknown) => {
          invalidates.push(options);
          return originalInvalidate(options as any);
        };
        return () => null;
      },
    });

    const App = defineComponent({
      name: "PendingWheelCancelModelSyncApp",
      setup() {
        const modelValue = ref(2);
        setModelValue = (value) => {
          modelValue.value = value;
        };
        return () => [
          h(Probe),
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items,
            modelValue: modelValue.value,
            autoFocus: true,
          }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    const commits: unknown[] = [];
    const off = app.terminal.on("commit", (commit) => commits.push(commit));

    try {
      app.mount();
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      commits.length = 0;
      invalidates.length = 0;

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      setModelValue(2.1);
      await nextTick();

      expect(invalidates).toHaveLength(0);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(commits).toHaveLength(0);
      expect(rowText(app, 0)).toBe("item-0");
    } finally {
      off();
      app.dispose();
      raf.restore();
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
});
