import { describe, expect, it, vi } from "vitest";
import { createTerminal, createTerminalApp } from "../src/index.js";
import { createRenderManager } from "../src/vue/render/render-manager.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  TBox,
  TText,
  TView,
  TVirtualList,
  useTerminal,
} from "./ui-regressions-support.js";

function dispatchWheel(container: HTMLElement): void {
  const wheel = new Event("wheel", { bubbles: true }) as any;
  wheel.clientX = 0;
  wheel.clientY = 0;
  wheel.deltaY = 100;
  container.dispatchEvent(wheel);
}

function rowText(mounted: Awaited<ReturnType<typeof mountTerminal>>, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

describe("TVirtualList", () => {
  it("repaints the full viewport in DOM so slow wheel scroll updates visible rows", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          itemCount: items.length,
          itemVersion: 1,
          getItem: (index: number) => items[index],
          autoFocus: true,
        }),
      20,
      8,
    );

    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    dispatchWheel(mounted.container()!);
    await nextTick();
    await nextTick();

    off();
    expect(commits.some((rows) => rows != null && rows.join(",") === "0,1,2,3")).toBe(true);
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    expect(mounted.container()!.textContent).toContain("item-1");
    expect(mounted.container()!.textContent).toContain("item-4");
    expect(mounted.container()!.textContent).not.toContain("item-0");
    mounted.unmount();
  });

  it("repaints the DOM viewport even when useRowScroll is enabled", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          itemCount: items.length,
          itemVersion: 1,
          getItem: (index: number) => items[index],
          autoFocus: true,
          useRowScroll: true,
        }),
      20,
      8,
    );

    const commits: Array<{
      dirtyRows: readonly number[] | null;
      scrollOperations: unknown;
    }> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
      commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
    });

    dispatchWheel(mounted.container()!);
    await nextTick();
    await nextTick();

    off();
    expect(commits).toContainEqual({ dirtyRows: [0, 1, 2, 3], scrollOperations: null });
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    mounted.unmount();
  });

  it("handles consecutive DOM wheel ticks without stale or blank rows", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          itemCount: items.length,
          itemVersion: 1,
          getItem: (index: number) => items[index],
          autoFocus: true,
        }),
      20,
      8,
    );

    const container = mounted.container()!;
    const dateNow = vi.spyOn(Date, "now");
    try {
      let now = 1_000;
      dateNow.mockImplementation(() => now);
      dispatchWheel(container);
      await nextTick();
      now += 10;
      dispatchWheel(container);
      await nextTick();
      await nextTick();
    } finally {
      dateNow.mockRestore();
    }

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
    expect(container.textContent).toContain("item-2");
    expect(container.textContent).toContain("item-5");
    expect(container.textContent).not.toContain("item-0");
    mounted.unmount();
  });

  it("does not emit update:modelValue when wheel scrolling", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          itemCount: items.length,
          itemVersion: 1,
          getItem: (index: number) => items[index],
          modelValue: 0,
          autoFocus: true,
          "onUpdate:modelValue": onUpdateModelValue,
        }),
      20,
      8,
    );

    dispatchWheel(mounted.container()!);
    await nextTick();
    await nextTick();

    expect(onUpdateModelValue).not.toHaveBeenCalled();
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    mounted.unmount();
  });

  it("keeps scrollPlane fast path to exposed rows when no DOM renderer is attached", () => {
    const terminal = createTerminal({ cols: 12, rows: 6 });
    const render = createRenderManager(terminal);
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    let top = 0;
    let dirtyRowsHint: readonly number[] | undefined;

    const node = render.register({
      stack: render.rootStack,
      rect: { x: 0, y: 0, w: 12, h: 4 },
      paint: (dirtyRows) => {
        const rows = dirtyRows ?? dirtyRowsHint ?? [0, 1, 2, 3];
        for (const y of rows) terminal.write(items[top + y] ?? "", { x: 0, y });
      },
    });
    render.render();
    terminal.commit();

    top = 1;
    render.scrollPlane("default", 0, 4, 1);
    dirtyRowsHint = [3];
    render.update(node.id, { dirtyRowsHint });
    render.render();
    const committedRows = terminal.commit({ sync: true });

    expect(committedRows).toEqual([3]);
    expect(terminal.getCell(5, 3).ch).toBe("4");
  });

  it("mounted headless fast path emits only exposed dirty row after wheel", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: items.length,
        itemVersion: 1,
        getItem: (index: number) => items[index],
        autoFocus: true,
        useRowScroll: true,
      },
    });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<{
      dirtyRows: readonly number[] | null;
      scrollOperations: unknown;
    }> = [];
    const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
      commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
    });

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await nextTick();
    await nextTick();

    off();
    expect(commits).toEqual([
      { dirtyRows: [3], scrollOperations: [{ startY: 0, endY: 4, delta: 1 }] },
    ]);
    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    app.dispose();
  });

  it("warns in debug perf mode when useRowScroll shifts plane rows", async () => {
    const previousDebugPerf = (globalThis as any).__VT_DEBUG_PERF__;
    (globalThis as any).__VT_DEBUG_PERF__ = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: items.length,
        itemVersion: 1,
        getItem: (index: number) => items[index],
        autoFocus: true,
        useRowScroll: true,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
      await nextTick();
      await nextTick();

      expect(warn).toHaveBeenCalledWith(
        "[vue-tui] TVirtualList.useRowScroll shifts whole plane rows. Use only when these rows are exclusively owned by this component.",
      );
    } finally {
      warn.mockRestore();
      app.dispose();
      (globalThis as any).__VT_DEBUG_PERF__ = previousDebugPerf;
    }
  });

  it("coalesces consecutive headless wheel ticks into one scroll frame", async () => {
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

    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: items.length,
        itemVersion: 1,
        getItem: (index: number) => items[index],
        autoFocus: true,
        useRowScroll: true,
      },
    });
    const dateNow = vi.spyOn(Date, "now");

    try {
      app.mount();
      app.scheduler.flushNow();
      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });
      let now = 1_000;
      dateNow.mockImplementation(() => now);

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: now });
      now += 10;
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: now });

      expect(commits).toEqual([]);
      expect(callbacks.size).toBe(1);
      Array.from(callbacks.values())[0]?.(0);
      await nextTick();

      off();
      expect(commits).toEqual([
        { dirtyRows: [2, 3], scrollOperations: [{ startY: 0, endY: 4, delta: 2 }] },
      ]);
      expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
        "item-2",
        "item-3",
        "item-4",
        "item-5",
      ]);
    } finally {
      dateNow.mockRestore();
      app.dispose();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("clamps pending wheel scroll when itemCount shrinks before the frame", async () => {
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

    const itemCount = ref(100);
    const getItem = vi.fn((index: number) => {
      if (index >= itemCount.value) throw new Error(`out of range ${index}`);
      return `item-${index}`;
    });
    const onScroll = vi.fn();
    let restoreInvalidate: (() => void) | null = null;

    const Probe = defineComponent({
      name: "HoldVirtualListSchedulerForShrink",
      setup() {
        const { scheduler } = useTerminal();
        const original = scheduler.invalidate.bind(scheduler);
        (scheduler as any).invalidate = () => {};
        restoreInvalidate = () => {
          (scheduler as any).invalidate = original;
        };
        return () => null;
      },
    });

    const App = defineComponent({
      name: "VirtualListShrinkProbe",
      setup() {
        return () => [
          h(Probe),
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: itemCount.value,
            itemVersion: itemCount.value,
            getItem,
            autoFocus: true,
            useRowScroll: true,
            onScroll,
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      getItem.mockClear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 6000, time: Date.now() });
      expect(callbacks.size).toBe(1);

      itemCount.value = 20;
      await nextTick();
      Array.from(callbacks.values())[0]?.(0);
      await nextTick();

      restoreInvalidate?.();
      app.scheduler.flushNow();

      expect(onScroll).toHaveBeenCalledWith(16);
      expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
        "item-16",
        "item-17",
        "item-18",
        "item-19",
      ]);
      expect(getItem.mock.calls.every((call) => (call[0] as number) < 20)).toBe(true);
    } finally {
      restoreInvalidate?.();
      app.dispose();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("preserves wheel scroll position when itemCount grows", async () => {
    const itemCount = ref(100);
    const App = defineComponent({
      name: "VirtualListGrowPreserveScroll",
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: itemCount.value,
            itemVersion: itemCount.value,
            getItem: (index: number) => `item-${index}`,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 8, component: App });
    app.mount();
    app.scheduler.flushNow();

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 500, time: Date.now() });
    await nextTick();
    await nextTick();
    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-5",
      "item-6",
      "item-7",
      "item-8",
    ]);

    itemCount.value = 101;
    await nextTick();
    app.scheduler.flushNow();

    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-5",
      "item-6",
      "item-7",
      "item-8",
    ]);
    app.dispose();
  });

  it("clamps scrollTop when itemCount shrinks without snapping back to active", async () => {
    const itemCount = ref(100);
    const getItem = vi.fn((index: number) => {
      if (index >= itemCount.value) throw new Error(`out of range ${index}`);
      return `item-${index}`;
    });
    const App = defineComponent({
      name: "VirtualListShrinkPreserveScroll",
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: itemCount.value,
            itemVersion: itemCount.value,
            getItem,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 8, component: App });
    app.mount();
    app.scheduler.flushNow();

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: Date.now() });
    await nextTick();
    await nextTick();
    expect(rowText({ terminal: app.terminal } as any, 0)).toBe("item-96");

    getItem.mockClear();
    itemCount.value = 20;
    await nextTick();
    app.scheduler.flushNow();

    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-16",
      "item-17",
      "item-18",
      "item-19",
    ]);
    expect(getItem.mock.calls.every((call) => (call[0] as number) < 20)).toBe(true);
    app.dispose();
  });

  it("does not emit scroll when pending wheel frame resolves to unchanged scrollTop", async () => {
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

    const itemCount = ref(20);
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "VirtualListNoopPendingScroll",
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: itemCount.value,
            itemVersion: itemCount.value,
            getItem: (index: number) => `item-${index}`,
            autoFocus: true,
            onScroll,
          });
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
      expect(callbacks.size).toBe(1);

      itemCount.value = 4;
      await nextTick();
      Array.from(callbacks.values())[0]?.(0);
      await nextTick();

      expect(onScroll).not.toHaveBeenCalled();
    } finally {
      app.dispose();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("sanitizes invalid itemCount values", async () => {
    const itemCount = ref(-1);
    const getItem = vi.fn((index: number) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const App = defineComponent({
      name: "VirtualListItemCountSanitize",
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: itemCount.value,
            itemVersion: itemCount.value,
            getItem,
            autoFocus: true,
            "onUpdate:modelValue": onUpdateModelValue,
          });
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(getItem).not.toHaveBeenCalled();

      app.events.dispatch({
        type: "keydown",
        key: "ArrowDown",
        code: "ArrowDown",
        time: Date.now(),
      });
      expect(onUpdateModelValue).not.toHaveBeenCalled();

      itemCount.value = Number.NaN;
      await nextTick();
      app.scheduler.flushNow();
      expect(getItem).not.toHaveBeenCalled();

      itemCount.value = 2.9;
      await nextTick();
      app.scheduler.flushNow();

      expect(getItem.mock.calls.map((call) => call[0])).toEqual([0, 1]);
      expect(rowText({ terminal: app.terminal } as any, 0)).toBe("item-0");
      expect(rowText({ terminal: app.terminal } as any, 1)).toBe("item-1");
      expect(rowText({ terminal: app.terminal } as any, 2)).toBe("");
    } finally {
      app.dispose();
    }
  });

  it("keeps headless full-row slow scroll correct across consecutive wheel ticks", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: items.length,
        itemVersion: 1,
        getItem: (index: number) => items[index],
        autoFocus: true,
        useRowScroll: true,
      },
    });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<readonly number[] | null> = [];
    const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));
    const dateNow = vi.spyOn(Date, "now");

    try {
      let now = 1_000;
      dateNow.mockImplementation(() => now);
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: now });
      await nextTick();
      now += 10;
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: now });
      await nextTick();
      await nextTick();
    } finally {
      dateNow.mockRestore();
      off();
    }

    expect(commits).toEqual([[3], [3]]);
    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
    app.dispose();
  });

  it("does not emit change or read item 0 when committing an empty list", async () => {
    const getItem = vi.fn();
    const onChange = vi.fn();
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: 0,
        itemVersion: 1,
        getItem,
        modelValue: 0,
        autoFocus: true,
        onChange,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });
    app.mount();
    app.scheduler.flushNow();

    app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: Date.now() });
    await nextTick();

    expect(onChange).not.toHaveBeenCalled();
    expect(onUpdateModelValue).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    app.dispose();
  });

  it("does not emit update:modelValue on keyboard navigation for an empty list", async () => {
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: 0,
        itemVersion: 1,
        getItem: vi.fn(),
        modelValue: 0,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });
    app.mount();
    app.scheduler.flushNow();

    app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: Date.now() });
    app.events.dispatch({ type: "keydown", key: "End", code: "End", time: Date.now() });
    await nextTick();

    expect(onUpdateModelValue).not.toHaveBeenCalled();
    app.dispose();
  });

  it("repaints the viewport when keyboard navigation scrolls active state", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: items.length,
        itemVersion: 1,
        getItem: (index: number) => items[index],
        modelValue: 3,
        autoFocus: true,
        useRowScroll: true,
      },
    });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<readonly number[] | null> = [];
    const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));

    app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: Date.now() });
    await nextTick();
    await nextTick();

    off();
    expect(commits).toEqual([[0, 1, 2, 3]]);
    expect(rowText({ terminal: app.terminal } as any, 2)).toBe("item-3");
    expect(rowText({ terminal: app.terminal } as any, 3)).toBe("item-4");
    expect(app.terminal.getCell(0, 2).style.inverse).not.toBe(true);
    expect(app.terminal.getCell(0, 3).style.inverse).toBe(true);
    app.dispose();
  });

  it("keeps active item visible using clipped viewport height", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedVirtualList",
      setup() {
        return () =>
          h(TBox, { x: 0, y: 0, w: 14, h: 6, border: true, padding: 0 }, () =>
            h(TVirtualList, {
              x: 0,
              y: 0,
              w: 12,
              h: 10,
              itemCount: items.length,
              itemVersion: 1,
              getItem: (index: number) => items[index],
              modelValue: 8,
              autoFocus: true,
            }),
          );
      },
    });
    const app = createTerminalApp({ cols: 16, rows: 8, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flushNow();

    expect(rowText({ terminal: app.terminal } as any, 1)).toContain("item-5");
    expect(rowText({ terminal: app.terminal } as any, 2)).toContain("item-6");
    expect(rowText({ terminal: app.terminal } as any, 3)).toContain("item-7");
    expect(rowText({ terminal: app.terminal } as any, 4)).toContain("item-8");
    expect(app.terminal.getCell(1, 4).style.inverse).toBe(true);
    app.dispose();
  });

  it("can scroll a bottom-clipped viewport to the last item", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "BottomClippedVirtualList",
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: 12, h: 4 }, () =>
            h(TVirtualList, {
              x: 0,
              y: 0,
              w: 12,
              h: 10,
              itemCount: items.length,
              itemVersion: 1,
              getItem: (index: number) => items[index],
              modelValue: 19,
              autoFocus: true,
            }),
          );
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 6, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flushNow();

    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-16",
      "item-17",
      "item-18",
      "item-19",
    ]);
    expect(app.terminal.getCell(0, 3).style.inverse).toBe(true);
    app.dispose();
  });

  it("renders correct item rows when the top is clipped", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "TopClippedVirtualList",
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: 12, h: 3 }, () =>
            h(TVirtualList, {
              x: 0,
              y: -2,
              w: 12,
              h: 5,
              itemCount: items.length,
              itemVersion: 1,
              getItem: (index: number) => items[index],
            }),
          );
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 5, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flushNow();

    expect([0, 1, 2].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-2",
      "item-3",
      "item-4",
    ]);
    app.dispose();
  });

  it("clips horizontally from the correct cell offset", async () => {
    const App = defineComponent({
      name: "HorizontallyClippedVirtualList",
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: 4, h: 1 }, () =>
            h(TVirtualList, {
              x: -3,
              y: 0,
              w: 10,
              h: 1,
              itemCount: 1,
              itemVersion: 1,
              getItem: () => "ABCDEFGH",
            }),
          );
      },
    });
    const app = createTerminalApp({ cols: 8, rows: 2, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flushNow();

    expect(rowText({ terminal: app.terminal } as any, 0)).toBe("DEFG");
    app.dispose();
  });

  it("maps clicks through clipped top rows to the correct item index", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const App = defineComponent({
      name: "TopClippedVirtualListClick",
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: 12, h: 3 }, () =>
            h(TVirtualList, {
              x: 0,
              y: -2,
              w: 12,
              h: 5,
              itemCount: items.length,
              itemVersion: 1,
              getItem: (index: number) => items[index],
              "onUpdate:modelValue": onUpdateModelValue,
            }),
          );
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 5, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flushNow();

    app.events.dispatch({ type: "click", cellX: 0, cellY: 0, time: Date.now() });
    await nextTick();

    expect(onUpdateModelValue).toHaveBeenCalledWith(2);
    app.dispose();
  });

  it("scrolls external modelValue changes into view without emitting model updates", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const modelValue = ref(0);
    const onUpdateModelValue = vi.fn();
    const App = defineComponent({
      name: "ExternalModelVirtualList",
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: items.length,
            itemVersion: 1,
            getItem: (index: number) => items[index],
            modelValue: modelValue.value,
            autoFocus: true,
            useRowScroll: true,
            "onUpdate:modelValue": onUpdateModelValue,
          });
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 8, component: App });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<readonly number[] | null> = [];
    const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));

    modelValue.value = 80;
    await nextTick();
    app.scheduler.flushNow();

    off();
    expect(onUpdateModelValue).not.toHaveBeenCalled();
    expect(commits).toEqual([[0, 1, 2, 3]]);
    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-77",
      "item-78",
      "item-79",
      "item-80",
    ]);
    expect(app.terminal.getCell(0, 3).style.inverse).toBe(true);
    app.dispose();
  });

  it("normalizes fractional rect values for row-scroll dirty rows", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0.4,
        w: 12.8,
        h: 4.8,
        itemCount: items.length,
        itemVersion: 1,
        getItem: (index: number) => items[index],
        autoFocus: true,
        useRowScroll: true,
      },
    });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<readonly number[] | null> = [];
    const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await nextTick();
    await nextTick();

    off();
    expect(commits).toEqual([[3]]);
    expect(rowText({ terminal: app.terminal } as any, 3)).toBe("item-4");
    app.dispose();
  });

  it("does not use scrollPlane when useRowScroll is true but list does not own full rows", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "VirtualListWithSideContent",
      setup() {
        return () => [
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 10,
            h: 4,
            itemCount: items.length,
            itemVersion: 1,
            getItem: (index: number) => items[index],
            autoFocus: true,
            useRowScroll: true,
          }),
          h(TText, { x: 12, y: 1, w: 4, value: "SIDE" }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<readonly number[] | null> = [];
    const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await nextTick();
    await nextTick();

    off();
    expect(commits).toEqual([[0, 1, 2, 3]]);
    expect(rowText({ terminal: app.terminal } as any, 1)).toContain("SIDE");
    expect(rowText({ terminal: app.terminal } as any, 0)).not.toContain("SIDE");
    app.dispose();
  });

  it("does not use scrollPlane when useRowScroll is true but the list is clipped", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedRowScrollVirtualList",
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: 12, h: 3 }, () =>
            h(TVirtualList, {
              x: 0,
              y: -1,
              w: 12,
              h: 4,
              itemCount: items.length,
              itemVersion: 1,
              getItem: (index: number) => items[index],
              autoFocus: true,
              useRowScroll: true,
            }),
          );
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 6, component: App });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<{
      dirtyRows: readonly number[] | null;
      scrollOperations: unknown;
    }> = [];
    const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
      commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
    });

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await nextTick();
    await nextTick();

    off();
    expect(commits).toEqual([{ dirtyRows: [0, 1, 2], scrollOperations: null }]);
    expect([0, 1, 2].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-2",
      "item-3",
      "item-4",
    ]);
    app.dispose();
  });

  it("does not shift same-plane overlay when useRowScroll is false (default)", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "VirtualListWithOverlay",
      setup() {
        return () => [
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: items.length,
            itemVersion: 1,
            getItem: (index: number) => items[index],
            autoFocus: true,
            // useRowScroll defaults to false — should NOT use scrollPlane
          }),
          h(TText, { x: 0, y: 1, w: 6, value: "BADGE", zIndex: 999 }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 8, component: App });
    app.mount();
    app.scheduler.flushNow();
    const commits: Array<readonly number[] | null> = [];
    const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await nextTick();
    await nextTick();

    off();
    // With useRowScroll=false, scrollPlane is NOT used, so BADGE is not shifted
    expect(rowText({ terminal: app.terminal } as any, 1)).toContain("BADGE");
    // Full viewport repaint, not exposed-only
    expect(commits).toEqual([[0, 1, 2, 3]]);
    app.dispose();
  });

  it("documents that useRowScroll shifts same-plane full-row overlay content", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "VirtualListWithUnsafeOverlay",
      setup() {
        return () => [
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: items.length,
            itemVersion: 1,
            getItem: (index: number) => items[index],
            autoFocus: true,
            useRowScroll: true,
          }),
          h(TText, { x: 0, y: 1, w: 6, value: "BADGE", zIndex: 999 }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 12, rows: 8, component: App });
    app.mount();
    app.scheduler.flushNow();

    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await nextTick();
    await nextTick();

    expect(rowText({ terminal: app.terminal } as any, 0)).toContain("BADGE");
    expect(rowText({ terminal: app.terminal } as any, 1)).not.toContain("BADGE");
    app.dispose();
  });

  it("only calls getItem for visible rows after itemVersion changes", async () => {
    const version = ref(1);
    const getItem = vi.fn((index: number) => `item-${index}`);
    const App = defineComponent({
      name: "VirtualListVersionProbe",
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: 100_000,
            itemVersion: version.value,
            getItem,
            autoFocus: true,
          });
      },
    });

    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: App,
    });
    app.mount();
    app.scheduler.flushNow();
    getItem.mockClear();

    version.value++;
    await nextTick();
    app.scheduler.flushNow();
    await nextTick();

    const calledIndices = getItem.mock.calls.map((call: any[]) => call[0] as number);
    expect(calledIndices).toEqual([0, 1, 2, 3]);
    expect(getItem).not.toHaveBeenCalledWith(99999);
    app.dispose();
  });

  it("repaints viewport when itemVersion changes with pending exposed scroll rows", async () => {
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

    const version = ref(1);
    const getItem = vi.fn((index: number) => `v${version.value}-item-${index}`);
    let restoreInvalidate: (() => void) | null = null;

    const Probe = defineComponent({
      name: "HoldVirtualListScheduler",
      setup() {
        const { scheduler } = useTerminal();
        const original = scheduler.invalidate.bind(scheduler);
        (scheduler as any).invalidate = () => {};
        restoreInvalidate = () => {
          (scheduler as any).invalidate = original;
        };
        return () => null;
      },
    });

    const App = defineComponent({
      name: "VirtualListPendingHintVersionProbe",
      setup() {
        return () => [
          h(Probe),
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: 100_000,
            itemVersion: version.value,
            getItem,
            autoFocus: true,
            useRowScroll: true,
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
      expect(callbacks.size).toBe(1);
      Array.from(callbacks.values())[0]?.(0);
      await nextTick();

      version.value++;
      await nextTick();
      restoreInvalidate?.();
      app.scheduler.flushNow();
      off();

      expect(commits).toEqual([{ dirtyRows: [0, 1, 2, 3], scrollOperations: null }]);
      expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
        "v2-item-1",
        "v2-item-2",
        "v2-item-3",
        "v2-item-4",
      ]);
    } finally {
      restoreInvalidate?.();
      app.dispose();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("repaints viewport when style changes with pending exposed scroll rows", async () => {
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

    const style = ref<{ fg: "redBright" | "greenBright" }>({ fg: "redBright" });
    let restoreInvalidate: (() => void) | null = null;

    const Probe = defineComponent({
      name: "HoldVirtualListStyleScheduler",
      setup() {
        const { scheduler } = useTerminal();
        const original = scheduler.invalidate.bind(scheduler);
        (scheduler as any).invalidate = () => {};
        restoreInvalidate = () => {
          (scheduler as any).invalidate = original;
        };
        return () => null;
      },
    });

    const App = defineComponent({
      name: "VirtualListPendingHintStyleProbe",
      setup() {
        return () => [
          h(Probe),
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: 100_000,
            itemVersion: 1,
            getItem: (index: number) => `item-${index}`,
            autoFocus: true,
            useRowScroll: true,
            style: style.value,
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
      expect(callbacks.size).toBe(1);
      Array.from(callbacks.values())[0]?.(0);
      await nextTick();

      style.value = { fg: "greenBright" };
      await nextTick();
      restoreInvalidate?.();
      app.scheduler.flushNow();
      off();

      expect(commits).toEqual([{ dirtyRows: [0, 1, 2, 3], scrollOperations: null }]);
      expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
        "item-1",
        "item-2",
        "item-3",
        "item-4",
      ]);
      expect([0, 1, 2, 3].map((y) => app.terminal.getCell(0, y).style.fg)).toEqual([
        "greenBright",
        "greenBright",
        "greenBright",
        "greenBright",
      ]);
    } finally {
      restoreInvalidate?.();
      app.dispose();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("active style follows item after useRowScroll scrollPlane shift", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const app = createTerminalApp({
      cols: 12,
      rows: 8,
      component: TVirtualList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        itemCount: items.length,
        itemVersion: 1,
        getItem: (index: number) => items[index],
        modelValue: 0,
        autoFocus: true,
        useRowScroll: true,
      },
    });
    app.mount();
    app.scheduler.flushNow();

    // Item 0 is active with inverse style at row 0
    expect(app.terminal.getCell(0, 0).style.inverse).toBe(true);
    expect(app.terminal.getCell(0, 1).style.inverse).not.toBe(true);

    // Wheel scroll down by 1 — active stays at item 0 but scrolls out of view
    app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: Date.now() });
    await nextTick();
    await nextTick();

    // Row 0 now shows item-1, row 1 shows item-2
    // Active item 0 has scrolled out of view — no inverse on visible rows
    expect(rowText({ terminal: app.terminal } as any, 0)).toContain("item-1");
    expect(app.terminal.getCell(0, 0).style.inverse).not.toBe(true);

    // Navigate down — active moves from 0 to 1
    // Item 1 is at row 0, should now have inverse style
    app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: Date.now() });
    await nextTick();
    await nextTick();

    // Item 1 (active) is displayed at row 0 — should have inverse
    expect(app.terminal.getCell(0, 0).style.inverse).toBe(true);
    expect(rowText({ terminal: app.terminal } as any, 0)).toContain("item-1");
    app.dispose();
  });
});
