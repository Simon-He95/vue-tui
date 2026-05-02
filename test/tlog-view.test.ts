import type { TLogDataSource, TLogViewHandle } from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/index.js";
import { createAppendOnlyLogStore, TLogView } from "../src/experimental.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  TText,
  useTerminal,
} from "./ui-regressions-support.js";

function rowText(
  mounted: { terminal: ReturnType<typeof createTerminalApp>["terminal"] },
  y: number,
): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function installManualRaf(): Readonly<{
  pending: () => number;
  flush: () => void;
  restore: () => void;
}> {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const nextId = ++id;
    callbacks.set(nextId, cb);
    return nextId;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((rafId: number) => {
    callbacks.delete(rafId);
  }) as typeof cancelAnimationFrame;

  return {
    pending: () => callbacks.size,
    flush: () => {
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      for (const cb of pending) cb(0);
    },
    restore: () => {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

describe("TLogView", () => {
  it("reads only visible rows while painting", async () => {
    const getLine = vi.fn((index: number) => `line-${index}`);
    const source: TLogDataSource = {
      lineCount: () => 100_000,
      getLine,
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          source,
          version: 1,
        }),
      20,
      8,
    );

    expect(getLine.mock.calls.length).toBeLessThan(20);
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "line-99996",
      "line-99997",
      "line-99998",
      "line-99999",
    ]);
    mounted.unmount();
  });

  it("uses defaultScrollTop for the initial uncontrolled visual row", async () => {
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          source,
          version: 1,
          defaultScrollTop: 10,
        }),
      20,
      8,
    );

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "line-10",
      "line-11",
      "line-12",
      "line-13",
    ]);
    mounted.unmount();
  });

  it("emits update:scrollTop and scroll payloads with visual-row scrollTop on wheel", async () => {
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };
    const onUpdateScrollTop = vi.fn();
    const onScroll = vi.fn();

    const App = defineComponent({
      name: "TLogViewWheelScrollEventsApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: 1,
            autoFocus: true,
            onScroll,
            "onUpdate:scrollTop": onUpdateScrollTop,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(95);
      expect(onScroll).toHaveBeenCalledWith({
        scrollTop: 95,
        atBottom: false,
        lineCount: 100,
        estimatedVisualRowCount: 100,
        firstLineIndex: 0,
      });
      expect(rowText(app, 0)).toBe("line-95");
    } finally {
      app.dispose();
    }
  });

  it("waits for controlled scrollTop prop updates before changing rendered rows", async () => {
    const controlledTop = ref(96);
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };
    const onUpdateScrollTop = vi.fn();

    const App = defineComponent({
      name: "TLogViewControlledScrollApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: 1,
            scrollTop: controlledTop.value,
            autoFocus: true,
            "onUpdate:scrollTop": onUpdateScrollTop,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("line-96");

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(95);
      expect(rowText(app, 0)).toBe("line-96");

      controlledTop.value = 95;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("line-95");
    } finally {
      app.dispose();
    }
  });

  it("exposes scrollToTop and scrollToBottom", async () => {
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };
    const logView = ref<TLogViewHandle | null>(null);
    const onScroll = vi.fn();

    const App = defineComponent({
      name: "TLogViewScrollBoundsHandleApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: 1,
            onScroll,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToTop();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("line-0");

      logView.value!.scrollToBottom();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 3)).toBe("line-99");
      expect(onScroll.mock.calls.at(-1)?.[0]).toMatchObject({
        scrollTop: 96,
        atBottom: true,
      });
    } finally {
      app.dispose();
    }
  });

  it("exposes scrollToLine for unwrapped logical lines", async () => {
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };
    const logView = ref<TLogViewHandle | null>(null);

    const App = defineComponent({
      name: "TLogViewScrollToLineApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: 1,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToLine(50);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("line-50");
    } finally {
      app.dispose();
    }
  });

  it("supports center and end alignment in scrollToLine", async () => {
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };
    const logView = ref<TLogViewHandle | null>(null);

    const App = defineComponent({
      name: "TLogViewScrollToLineAlignApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 5,
            source,
            version: 1,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToLine(50, { align: "center" });
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 2)).toBe("line-50");

      logView.value!.scrollToLine(60, { align: "end" });
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 4)).toBe("line-60");
    } finally {
      app.dispose();
    }
  });

  it("exposes scrollToLine for the first visual row of a wrapped logical line", async () => {
    const source: TLogDataSource = {
      lineCount: () => 12,
      getLine: (index) => (index === 10 ? "abcdefghij" : `line-${index}`),
      getLineKey: (index) => index,
    };
    const logView = ref<TLogViewHandle | null>(null);

    const App = defineComponent({
      name: "TLogViewWrapScrollToLineApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            source,
            version: 1,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 5, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToLine(10);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("abcd");
    } finally {
      app.dispose();
    }
  });

  it("exposes visual-row scrollBy", async () => {
    const source: TLogDataSource = {
      lineCount: () => 20,
      getLine: (index) => `line-${index}`,
    };
    const logView = ref<TLogViewHandle | null>(null);

    const App = defineComponent({
      name: "TLogViewScrollByApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: 1,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToTop();
      logView.value!.scrollBy(2);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("line-2");
    } finally {
      app.dispose();
    }
  });

  it("emits bottom updates for controlled append without rendering until parent applies them", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 100 }, (_, index) => `line-${index}`));
    const controlledTop = ref(96);
    const onUpdateScrollTop = vi.fn();

    const App = defineComponent({
      name: "TLogViewControlledAppendBottomApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            scrollTop: controlledTop.value,
            "onUpdate:scrollTop": onUpdateScrollTop,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 3)).toBe("line-99");

      log.appendLine("line-100");
      await nextTick();
      await nextTick();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(97);
      expect(rowText(app, 3)).toBe("line-99");

      controlledTop.value = 97;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 3)).toBe("line-100");
    } finally {
      app.dispose();
    }
  });

  it("keeps controlled bottom stickiness when parent ignores a user scroll request", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 100 }, (_, index) => `line-${index}`));
    const controlledTop = ref(96);
    const onUpdateScrollTop = vi.fn();

    const App = defineComponent({
      name: "TLogViewControlledIgnoredScrollStickApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            scrollTop: controlledTop.value,
            autoFocus: true,
            "onUpdate:scrollTop": onUpdateScrollTop,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 3)).toBe("line-99");

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(95);
      expect(rowText(app, 3)).toBe("line-99");

      onUpdateScrollTop.mockClear();
      log.appendLine("line-100");
      await nextTick();
      await nextTick();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(97);
      expect(rowText(app, 3)).toBe("line-99");

      controlledTop.value = 97;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 3)).toBe("line-100");
    } finally {
      app.dispose();
    }
  });

  it("detaches controlled bottom stickiness after parent accepts a user scroll request", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 100 }, (_, index) => `line-${index}`));
    const controlledTop = ref(96);
    const onUpdateScrollTop = vi.fn((next: number) => {
      controlledTop.value = next;
    });

    const App = defineComponent({
      name: "TLogViewControlledAcceptedScrollDetachApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            scrollTop: controlledTop.value,
            autoFocus: true,
            "onUpdate:scrollTop": onUpdateScrollTop,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(95);
      expect(rowText(app, 0)).toBe("line-95");

      onUpdateScrollTop.mockClear();
      log.appendLine("line-100");
      await nextTick();
      await nextTick();

      expect(onUpdateScrollTop).not.toHaveBeenCalledWith(97);
      expect(rowText(app, 3)).toBe("line-98");
    } finally {
      app.dispose();
    }
  });

  it("emits controlled imperative scroll requests without rendering until parent applies them", async () => {
    const controlledTop = ref(10);
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };
    const logView = ref<TLogViewHandle | null>(null);
    const onUpdateScrollTop = vi.fn();

    const App = defineComponent({
      name: "TLogViewControlledImperativeScrollApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: 1,
            scrollTop: controlledTop.value,
            "onUpdate:scrollTop": onUpdateScrollTop,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("line-10");

      logView.value!.scrollToVisualRow(20);
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(20);
      expect(rowText(app, 0)).toBe("line-10");

      controlledTop.value = 20;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("line-20");
    } finally {
      app.dispose();
    }
  });

  it("does not emit update:scrollTop for unchanged imperative scrollTop", async () => {
    const source: TLogDataSource = {
      lineCount: () => 100,
      getLine: (index) => `line-${index}`,
    };
    const logView = ref<TLogViewHandle | null>(null);
    const onUpdateScrollTop = vi.fn();

    const App = defineComponent({
      name: "TLogViewNoopControlledScrollApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: 1,
            scrollTop: 10,
            "onUpdate:scrollTop": onUpdateScrollTop,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToVisualRow(10);
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateScrollTop).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("uses exposed dirty row when appending at bottom in full-row unsafe mode", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const App = defineComponent({
      name: "TLogViewAppendBottomApp",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            rowScrollMode: "unsafe-full-row",
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      log.appendLine("line-20");
      await nextTick();
      await nextTick();

      off();
      expect(commits).toContainEqual({
        dirtyRows: [3],
        scrollOperations: [{ startY: 0, endY: 4, delta: 1 }],
      });
      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual([
        "line-17",
        "line-18",
        "line-19",
        "line-20",
      ]);
      expect(framePerf!.latest()).toMatchObject({
        reason: "stream",
        dirtyRows: 1,
        frameTaskCount: 1,
      });
    } finally {
      app.dispose();
    }
  });

  it("reuses cached completed visible rows across append", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));
    const getLineSpy = vi.spyOn(log.source, "getLine");

    const App = defineComponent({
      name: "TLogViewCompletedLineCacheApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            rowScrollMode: "unsafe-full-row",
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      getLineSpy.mockClear();

      log.appendLine("line-20");
      await nextTick();
      await nextTick();

      expect(getLineSpy.mock.calls.length).toBeLessThanOrEqual(2);
      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual([
        "line-17",
        "line-18",
        "line-19",
        "line-20",
      ]);
    } finally {
      app.dispose();
      getLineSpy.mockRestore();
    }
  });

  it("does not repaint or scroll to bottom when appending while detached from bottom", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 100 }, (_, index) => `line-${index}`));
    const onScroll = vi.fn();

    const App = defineComponent({
      name: "TLogViewDetachedAppendApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            autoFocus: true,
            onScroll,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "PageUp", code: "PageUp", time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();
      const before = [0, 1, 2, 3].map((y) => rowText(app, y));
      const scrollCallsBeforeAppend = onScroll.mock.calls.length;
      const commits: Array<readonly number[] | null> = [];
      const off = app.terminal.on("commit", ({ dirtyRows }) => {
        commits.push(dirtyRows);
      });

      log.appendLine("line-100");
      await nextTick();
      await nextTick();

      off();
      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual(before);
      expect(onScroll.mock.calls.length).toBe(scrollCallsBeforeAppend);
      expect(commits).toEqual([]);
    } finally {
      app.dispose();
    }
  });

  it("keeps bottom stickiness when retention trims the head", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 5 });
    log.appendLines(Array.from({ length: 5 }, (_, index) => `line-${index}`));

    const App = defineComponent({
      name: "TLogViewRetentionBottomApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            source: log.source,
            version: log.version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendLine("line-5");
      await nextTick();
      await nextTick();

      expect([0, 1, 2].map((y) => rowText(app, y))).toEqual(["line-3", "line-4", "line-5"]);
    } finally {
      app.dispose();
    }
  });

  it("preserves a detached viewport anchor when retention trims the head", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 10 });
    log.appendLines(Array.from({ length: 10 }, (_, index) => `line-${index}`));
    const logView = ref<TLogViewHandle | null>(null);
    const onScroll = vi.fn();

    const App = defineComponent({
      name: "TLogViewRetentionDetachedApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            onScroll,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToLine(5);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("line-5");

      onScroll.mockClear();
      log.appendLine("line-10");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("line-5");
      expect(onScroll.mock.calls.at(-1)?.[0]).toMatchObject({
        scrollTop: 4,
        firstLineIndex: 1,
      });
    } finally {
      app.dispose();
    }
  });

  it("clamps to the retained head when the visible anchor is trimmed", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 5 });
    log.appendLines(Array.from({ length: 5 }, (_, index) => `line-${index}`));

    const App = defineComponent({
      name: "TLogViewRetentionTrimmedAnchorApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            source: log.source,
            version: log.version.value,
            defaultScrollTop: 0,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("line-0");

      log.appendLine("line-5");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("line-1");
    } finally {
      app.dispose();
    }
  });

  it("emits controlled retention scroll updates without repainting ahead of the prop", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 10 });
    log.appendLines(Array.from({ length: 10 }, (_, index) => `line-${index}`));
    const controlledTop = ref(5);
    const onUpdateScrollTop = vi.fn();
    const onScroll = vi.fn();

    const App = defineComponent({
      name: "TLogViewControlledRetentionDetachedApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            scrollTop: controlledTop.value,
            "onUpdate:scrollTop": onUpdateScrollTop,
            onScroll,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("line-5");

      log.appendLine("line-10");
      await nextTick();
      await nextTick();

      expect(onUpdateScrollTop).toHaveBeenCalledWith(4);
      expect(onScroll.mock.calls.at(-1)?.[0]).toMatchObject({
        scrollTop: 4,
        firstLineIndex: 1,
      });
      expect(rowText(app, 0)).toBe("line-5");

      controlledTop.value = 4;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("line-5");
    } finally {
      app.dispose();
    }
  });

  it("preserves anchor on retention trim when autoStickToBottom is false", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 5 });
    log.appendLines(["line-0", "line-1", "line-2", "line-3", "line-4"]);

    const App = defineComponent({
      name: "TLogViewNoStickRetentionAnchorApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            source: log.source,
            version: log.version.value,
            autoStickToBottom: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      expect([0, 1, 2].map((y) => rowText(app, y))).toEqual(["line-2", "line-3", "line-4"]);

      log.appendLine("line-5");
      await nextTick();
      await nextTick();

      expect([0, 1, 2].map((y) => rowText(app, y))).toEqual(["line-2", "line-3", "line-4"]);
    } finally {
      app.dispose();
    }
  });

  it("repaints visible appended lines when autoStickToBottom is false and viewport is not full", async () => {
    const log = createAppendOnlyLogStore();

    const App = defineComponent({
      name: "TLogViewNoStickShortAppendApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            autoStickToBottom: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendLine("line-0");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("line-0");
    } finally {
      app.dispose();
    }
  });

  it("repaints newly visible appended row when autoStickToBottom is false", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(["a", "b", "c"]);

    const App = defineComponent({
      name: "TLogViewNoStickVisibleAppendApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            autoStickToBottom: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendLine("d");
      await nextTick();
      await nextTick();

      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual(["a", "b", "c", "d"]);
    } finally {
      app.dispose();
    }
  });

  it("does not scroll when autoStickToBottom is false and append grows past the viewport", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));

    const App = defineComponent({
      name: "TLogViewNoStickOverflowAppendApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            autoStickToBottom: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendLine("line-20");
      await nextTick();
      await nextTick();

      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual([
        "line-16",
        "line-17",
        "line-18",
        "line-19",
      ]);
    } finally {
      app.dispose();
    }
  });

  it("repaints visible tail when appendChunk mutates the current tail", async () => {
    const log = createAppendOnlyLogStore();

    const App = defineComponent({
      name: "TLogViewAppendChunkTailApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendChunk("hello");
      await nextTick();
      await nextTick();
      expect(rowText(app, 0)).toBe("hello");

      log.appendChunk(" world");
      await nextTick();
      await nextTick();
      expect(rowText(app, 0)).toBe("hello world");
    } finally {
      app.dispose();
    }
  });

  it("invalidates only the visible tail cache entry when appendChunk mutates tail", async () => {
    const log = createAppendOnlyLogStore();
    log.appendChunk("hello");
    const getLineSpy = vi.spyOn(log.source, "getLine");

    const App = defineComponent({
      name: "TLogViewTailCacheApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      getLineSpy.mockClear();

      log.appendChunk(" world");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("hello world");
      expect(getLineSpy.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      app.dispose();
      getLineSpy.mockRestore();
    }
  });

  it("repaints visible tail when replaceTail changes the current tail", async () => {
    const log = createAppendOnlyLogStore();
    log.appendChunk("draft");

    const App = defineComponent({
      name: "TLogViewReplaceTailApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("draft");

      log.replaceTail("final");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("final");
    } finally {
      app.dispose();
    }
  });

  it("paints completed line and new tail when appendChunk contains newline", async () => {
    const log = createAppendOnlyLogStore();

    const App = defineComponent({
      name: "TLogViewAppendChunkNewlineApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendChunk("a");
      await nextTick();
      await nextTick();

      log.appendChunk("b\nc");
      await nextTick();
      await nextTick();

      expect([0, 1].map((y) => rowText(app, y))).toEqual(["ab", "c"]);
    } finally {
      app.dispose();
    }
  });

  it("does not reuse stale tail output when newline chunk completes the tail", async () => {
    const log = createAppendOnlyLogStore();
    log.appendChunk("hello");
    const getLineSpy = vi.spyOn(log.source, "getLine");

    const App = defineComponent({
      name: "TLogViewTailCompletionCacheApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      getLineSpy.mockClear();

      log.appendChunk(" world\nnext");
      await nextTick();
      await nextTick();

      expect([0, 1].map((y) => rowText(app, y))).toEqual(["hello world", "next"]);
      expect(getLineSpy.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      app.dispose();
      getLineSpy.mockRestore();
    }
  });

  it("does not coalesce stream tasks across multiple TLogView instances", async () => {
    const raf = installManualRaf();
    const logA = createAppendOnlyLogStore();
    const logB = createAppendOnlyLogStore();
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const App = defineComponent({
      name: "TLogViewMultipleStreamTasksApp",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => [
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 2,
            source: logA.source,
            version: logA.version.value,
          }),
          h(TLogView, {
            x: 0,
            y: 2,
            w: 20,
            h: 2,
            source: logB.source,
            version: logB.version.value,
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      logA.appendLine("a");
      logB.appendLine("b");
      await nextTick();

      expect(raf.pending()).toBe(1);
      raf.flush();
      await nextTick();

      expect(rowText(app, 0)).toBe("a");
      expect(rowText(app, 2)).toBe("b");
      expect(framePerf!.latest()).toMatchObject({
        reason: "stream",
        frameTaskCount: 2,
        remainingFrameTasks: 0,
      });
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("restores bottom stickiness with End", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));

    const App = defineComponent({
      name: "TLogViewEndStickinessApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            autoFocus: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "PageUp", code: "PageUp", time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();
      log.appendLine("line-20");
      await nextTick();
      await nextTick();
      expect(rowText(app, 3)).not.toBe("line-20");

      app.events.dispatch({ type: "keydown", key: "End", code: "End", time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();
      log.appendLine("line-21");
      await nextTick();
      await nextTick();

      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual([
        "line-18",
        "line-19",
        "line-20",
        "line-21",
      ]);
    } finally {
      app.dispose();
    }
  });

  it("clamps and repaints when the source shrinks", async () => {
    const sourceLines = ref(Array.from({ length: 100 }, (_, index) => `line-${index}`));
    const version = ref(1);
    const source: TLogDataSource = {
      lineCount: () => sourceLines.value.length,
      getLine: (index) => sourceLines.value[index] ?? "",
    };

    const App = defineComponent({
      name: "TLogViewShrinkApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      sourceLines.value = ["short-0", "short-1"];
      version.value++;
      await nextTick();
      await nextTick();

      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual(["short-0", "short-1", "", ""]);
    } finally {
      app.dispose();
    }
  });

  it("keeps non-keyed sources correct across version changes", async () => {
    const sourceLines = ref(["a"]);
    const version = ref(1);
    const source: TLogDataSource = {
      lineCount: () => sourceLines.value.length,
      getLine: (index) => sourceLines.value[index] ?? "",
    };

    const App = defineComponent({
      name: "TLogViewNoLineKeyCacheApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source,
            version: version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("a");

      sourceLines.value = ["b"];
      version.value++;
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("b");
    } finally {
      app.dispose();
    }
  });

  it("clears cached lines when source identity changes", async () => {
    const version = ref(1);
    const makeSource = (text: string): TLogDataSource => ({
      lineCount: () => 1,
      getLine: () => text,
      getLineKey: () => "same-key",
    });
    const source = ref(makeSource("first"));

    const App = defineComponent({
      name: "TLogViewSourceIdentityCacheApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: source.value,
            version: version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("first");

      source.value = makeSource("second");
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("second");
    } finally {
      app.dispose();
    }
  });

  it("uses width and clip geometry in the render cache key", async () => {
    const x = ref(0);
    const w = ref(8);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "abcdefghij",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewClipCacheApp",
      setup() {
        return () =>
          h(TLogView, {
            x: x.value,
            y: 0,
            w: w.value,
            h: 1,
            source,
            version: 1,
          });
      },
    });

    const app = createTerminalApp({ cols: 8, rows: 2, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("abcdefgh");

      x.value = -2;
      w.value = 10;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("cdefghij");
    } finally {
      app.dispose();
    }
  });

  it("wraps a long logical line into visual rows", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "abcdefghij",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 4,
          h: 3,
          source,
          version: 1,
          wrap: true,
        }),
      4,
      4,
    );

    expect([0, 1, 2].map((y) => rowText(mounted, y))).toEqual(["abcd", "efgh", "ij"]);
    mounted.unmount();
  });

  it("initial wrap mount shows bottom visual rows", async () => {
    const source: TLogDataSource = {
      lineCount: () => 2,
      getLine: (index) => (index === 0 ? "abcdefghij" : "klmnopqrst"),
      getLineKey: (index) => index,
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 4,
          h: 4,
          source,
          version: 1,
          wrap: true,
        }),
      4,
      4,
    );

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual(["ij", "klmn", "opqr", "st"]);
    mounted.unmount();
  });

  it("scrolls by wrapped visual rows when appending at bottom", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(["line-0", "line-1", "line-2", "line-3"]);

    const App = defineComponent({
      name: "TLogViewWrapAppendBottomApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 8,
            h: 4,
            source: log.source,
            version: log.version.value,
            rowScrollMode: "unsafe-full-row",
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 8, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      log.appendLine("abcdefghij");
      await nextTick();
      await nextTick();

      off();
      expect(commits).toContainEqual({
        dirtyRows: [2, 3],
        scrollOperations: [{ startY: 0, endY: 4, delta: 2 }],
      });
      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual([
        "line-2",
        "line-3",
        "abcdefgh",
        "ij",
      ]);
    } finally {
      app.dispose();
    }
  });

  it("repaints the wrapped viewport when append delta reaches viewport height", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(["line-0", "line-1", "line-2", "line-3"]);

    const App = defineComponent({
      name: "TLogViewWrapHugeAppendApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            source: log.source,
            version: log.version.value,
            rowScrollMode: "unsafe-full-row",
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      log.appendLine("x".repeat(20));
      await nextTick();
      await nextTick();

      off();
      expect(commits).toContainEqual({ dirtyRows: [0, 1, 2, 3], scrollOperations: null });
      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual(["xxxx", "xxxx", "xxxx", "xxxx"]);
    } finally {
      app.dispose();
    }
  });

  it("does not scroll wrapped rows when appending while detached from bottom", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 10 }, (_, index) => `line-${index}`));

    const App = defineComponent({
      name: "TLogViewWrapDetachedAppendApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 8,
            h: 4,
            source: log.source,
            version: log.version.value,
            autoFocus: true,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 8, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "PageUp", code: "PageUp", time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();
      const before = [0, 1, 2, 3].map((y) => rowText(app, y));

      log.appendLine("abcdefghij");
      await nextTick();
      await nextTick();

      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual(before);
    } finally {
      app.dispose();
    }
  });

  it("preserves a detached wrapped viewport anchor when retention trims measured head rows", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 7 });
    log.appendLines(["aa", "bbbbbbbb", "cc", "dd", "ee", "ff", "gg"]);
    const logView = ref<TLogViewHandle | null>(null);

    const App = defineComponent({
      name: "TLogViewWrapRetentionDetachedApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            source: log.source,
            version: log.version.value,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      logView.value!.scrollToLine(2);
      await nextTick();
      app.scheduler.flushNow();
      logView.value!.scrollToLine(2);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("cc");

      log.appendLine("hh");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("cc");
    } finally {
      app.dispose();
    }
  });

  it("updates wrapped rows when tail mutation changes visual row count", async () => {
    const log = createAppendOnlyLogStore();

    const App = defineComponent({
      name: "TLogViewWrapTailMutationApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            source: log.source,
            version: log.version.value,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 5, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendChunk("abc");
      await nextTick();
      await nextTick();
      expect(rowText(app, 0)).toBe("abc");

      log.appendChunk("de");
      await nextTick();
      await nextTick();

      expect([0, 1].map((y) => rowText(app, y))).toEqual(["abcd", "e"]);
    } finally {
      app.dispose();
    }
  });

  it("wraps completed tail and new tail when chunk contains newline", async () => {
    const log = createAppendOnlyLogStore();

    const App = defineComponent({
      name: "TLogViewWrapChunkNewlineApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            source: log.source,
            version: log.version.value,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 5, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendChunk("abcd");
      await nextTick();
      await nextTick();

      log.appendChunk("ef\n12345");
      await nextTick();
      await nextTick();

      expect([0, 1, 2, 3].map((y) => rowText(app, y))).toEqual(["abcd", "ef", "1234", "5"]);
    } finally {
      app.dispose();
    }
  });

  it("rebuilds wrapped rows when width changes", async () => {
    const w = ref(10);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "abcdefghij",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewWrapWidthApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: w.value,
            h: 3,
            source,
            version: 1,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 10, rows: 4, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("abcdefghij");

      w.value = 5;
      await nextTick();
      app.scheduler.flushNow();

      expect([0, 1].map((y) => rowText(app, y))).toEqual(["abcde", "fghij"]);
    } finally {
      app.dispose();
    }
  });

  it("keeps non-keyed wrapped sources correct across version changes", async () => {
    const sourceLines = ref(["abc"]);
    const version = ref(1);
    const source: TLogDataSource = {
      lineCount: () => sourceLines.value.length,
      getLine: (index) => sourceLines.value[index] ?? "",
    };

    const App = defineComponent({
      name: "TLogViewWrapNoLineKeyApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 2,
            h: 3,
            source,
            version: version.value,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 2, rows: 4, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect([0, 1].map((y) => rowText(app, y))).toEqual(["ab", "c"]);

      sourceLines.value = ["abcd"];
      version.value++;
      await nextTick();
      await nextTick();

      expect([0, 1].map((y) => rowText(app, y))).toEqual(["ab", "cd"]);
    } finally {
      app.dispose();
    }
  });

  it("does not wrap all lines on initial large wrapped mount", async () => {
    const getLine = vi.fn((index: number) => `line-${index}-xxxxxxxxxxxxxxxxxxxx`);
    const source: TLogDataSource = {
      lineCount: () => 100_000,
      getLine,
      getLineKey: (index) => index,
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 10,
          h: 4,
          source,
          version: 1,
          wrap: true,
        }),
      10,
      6,
    );

    expect(getLine.mock.calls.length).toBeLessThan(100);
    expect(rowText(mounted, 0)).toBe("line-99999");
    mounted.unmount();
  });

  it("reports estimated visual row count for large lazy wrapped sources", async () => {
    const onScroll = vi.fn();
    const getLine = vi.fn((index: number) => `line-${index}-${"x".repeat(100)}`);
    const source: TLogDataSource = {
      lineCount: () => 100_000,
      getLine,
      getLineKey: (index) => index,
    };

    const App = defineComponent({
      name: "TLogViewWrapEstimatedPayloadApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 10,
            h: 4,
            source,
            version: 1,
            autoFocus: true,
            wrap: true,
            onScroll,
          });
      },
    });

    const app = createTerminalApp({ cols: 10, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "PageUp", code: "PageUp", time: Date.now() });
      await nextTick();
      app.scheduler.flushNow();

      const payload = onScroll.mock.calls.at(-1)?.[0];
      expect(payload).toMatchObject({
        lineCount: 100_000,
        atBottom: false,
      });
      expect(payload).toHaveProperty("estimatedVisualRowCount");
      expect(payload).not.toHaveProperty("visualRowCount");
      expect(payload.estimatedVisualRowCount).toBeLessThan(200_000);
      expect(getLine.mock.calls.length).toBeLessThan(100);
    } finally {
      app.dispose();
    }
  });

  it("scrolls upward through unmeasured wrapped lines without full-source wrapping", async () => {
    const getLine = vi.fn((index: number) => `line-${index}-${"x".repeat(40)}`);
    const source: TLogDataSource = {
      lineCount: () => 100_000,
      getLine,
      getLineKey: (index) => index,
    };

    const App = defineComponent({
      name: "TLogViewWrapLazyPageUpApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 10,
            h: 4,
            source,
            version: 1,
            autoFocus: true,
            wrap: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 10, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      const before = [0, 1, 2, 3].map((y) => rowText(app, y));

      for (let i = 0; i < 3; i++) {
        app.events.dispatch({ type: "keydown", key: "PageUp", code: "PageUp", time: Date.now() });
        await nextTick();
        app.scheduler.flushNow();
      }

      const after = [0, 1, 2, 3].map((y) => rowText(app, y));
      expect(after).not.toEqual(before);
      expect(after.every((row) => row.length > 0)).toBe(true);
      expect(after.join("")).toContain("line-");
      expect(getLine.mock.calls.length).toBeLessThan(200);
    } finally {
      app.dispose();
    }
  });

  it("uses DOM exposed row flush for full-row append", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));
    let rendererRef: any = null;

    const Probe = defineComponent({
      name: "TLogViewDomFlushProbe",
      setup() {
        rendererRef = useTerminal().renderer;
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
            rowScrollMode: "unsafe-full-row",
          });
      },
    });

    const mounted = await mountTerminal(() => h(Probe), 20, 8);

    log.appendLine("line-20");
    await nextTick();
    await nextTick();

    expect(rendererRef!.value!.debugStats.flush.last!.planeRows).toBeLessThan(4);
    expect(rowText(mounted, 3)).toBe("line-20");
    mounted.unmount();
  });

  it("falls back to viewport repaint when unsafe row scroll does not own full rows", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));

    const mounted = await mountTerminal(
      () => [
        h(TLogView, {
          x: 1,
          y: 0,
          w: 19,
          h: 4,
          source: log.source,
          version: log.version.value,
          rowScrollMode: "unsafe-full-row",
        }),
        h(TText, { x: 0, y: 1, w: 1, value: "x" }),
      ],
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

    log.appendLine("line-20");
    await nextTick();
    await nextTick();

    off();
    expect(commits).toContainEqual({ dirtyRows: [0, 1, 2, 3], scrollOperations: null });
    mounted.unmount();
  });

  it("coalesces burst append through one stream frame task", async () => {
    const raf = installManualRaf();
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `line-${index}`));
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const App = defineComponent({
      name: "TLogViewBurstAppendApp",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            source: log.source,
            version: log.version.value,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 8, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      for (let i = 20; i < 120; i++) log.appendLine(`line-${i}`);
      await nextTick();

      expect(raf.pending()).toBe(1);
      raf.flush();
      await nextTick();

      expect(rowText(app, 3)).toBe("line-119");
      expect(framePerf!.latest()).toMatchObject({
        reason: "stream",
        frameTaskCount: 1,
        remainingFrameTasks: 0,
      });
    } finally {
      app.dispose();
      raf.restore();
    }
  });
});
