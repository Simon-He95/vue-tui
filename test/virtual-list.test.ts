import { describe, expect, it, vi } from "vitest";
import { createTerminal, createTerminalApp } from "../src/index.js";
import { createRenderManager } from "../src/vue/render/render-manager.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  TText,
  TVirtualList,
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
    expect([0, 1, 2, 3].map((y) => rowText({ terminal: app.terminal } as any, y))).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    app.dispose();
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
      },
    });
    const dateNow = vi.spyOn(Date, "now");

    try {
      app.mount();
      app.scheduler.flushNow();
      const commits: Array<readonly number[] | null> = [];
      const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));
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
      expect(commits).toEqual([[2, 3]]);
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

  it("does not shift same-plane content outside a non-full-row list", async () => {
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
});
