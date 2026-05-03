import type {
  TLogDataSource,
  TLogViewHandle,
  TLogViewLinkClickPayload,
} from "../src/experimental.js";
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

function rowStyles(
  mounted: { terminal: ReturnType<typeof createTerminalApp>["terminal"] },
  y: number,
) {
  return mounted.terminal.getRow(y).map((cell) => cell.style);
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

async function flushSearch(
  app: ReturnType<typeof createTerminalApp>,
  handle: TLogViewHandle,
  maxFrames = 20,
): Promise<void> {
  for (let i = 0; i < maxFrames; i++) {
    await nextTick();
    app.scheduler.flushNow();
    if (handle.getSearchState().status !== "scanning") return;
  }
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

  it("highlights plain fixed search matches", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "foo bar foo",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewPlainSearchHighlightApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 12,
            h: 1,
            source,
            version: 1,
            searchQuery: "foo",
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState()).toMatchObject({
        query: "foo",
        status: "done",
        matchCount: 2,
        currentMatchIndex: -1,
      });
      expect(rowText(app, 0)).toBe("foo bar foo");
      const styles = rowStyles(app, 0);
      expect(styles[0]!.inverse).toBe(true);
      expect(styles[2]!.inverse).toBe(true);
      expect(styles[4]!.inverse).toBeUndefined();
      expect(styles[8]!.inverse).toBe(true);
      expect(styles[10]!.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("findNext and findPrevious navigate matches and emit the current match", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const onSearchMatch = vi.fn();
    const source: TLogDataSource = {
      lineCount: () => 6,
      getLine: (index) => (index === 1 || index === 4 ? `error line-${index}` : `ok line-${index}`),
      getLineKey: (index) => index,
    };

    const App = defineComponent({
      name: "TLogViewSearchNavigationApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            source,
            version: 1,
            defaultScrollTop: 0,
            searchQuery: "error",
            searchOptions: { scanBudgetMs: 1000 },
            onSearchMatch,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      onSearchMatch.mockClear();

      logView.value!.findNext();
      await nextTick();
      app.scheduler.flushNow();
      expect(logView.value!.getSearchState().currentMatchIndex).toBe(0);
      expect(onSearchMatch).toHaveBeenLastCalledWith({
        match: {
          absoluteLineIndex: 1,
          index: 1,
          startCell: 0,
          endCell: 5,
          text: "error",
        },
        currentMatchIndex: 0,
        matchCount: 2,
      });

      logView.value!.findPrevious();
      await nextTick();
      app.scheduler.flushNow();
      expect(logView.value!.getSearchState().currentMatchIndex).toBe(1);
      expect(rowText(app, 1)).toBe("error line-4");
    } finally {
      app.dispose();
    }
  });

  it("searches ANSI visible text only and preserves ANSI style under highlights", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const query = ref("ERROR");
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mERROR\x1b[0m failed",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewAnsiVisibleSearchApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 1,
            source,
            version: 1,
            ansi: true,
            searchQuery: query.value,
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState().matchCount).toBe(1);
      expect(rowText(app, 0)).toBe("ERROR failed");
      let styles = rowStyles(app, 0);
      expect(styles[0]!.fg).toBe("red");
      expect(styles[0]!.inverse).toBe(true);

      query.value = "\x1b[31m";
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState().matchCount).toBe(0);
      styles = rowStyles(app, 0);
      expect(styles[0]!.fg).toBe("red");
      expect(styles[0]!.inverse).toBeUndefined();
    } finally {
      app.dispose();
    }
  });

  it("highlights and navigates a wrapped match on the containing visual row", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "aaaabbbbcccc",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewWrapSearchApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 4,
            h: 2,
            source,
            version: 1,
            wrap: true,
            searchQuery: "bbbb",
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 3, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      logView.value!.findNext();
      await nextTick();
      app.scheduler.flushNow();

      expect([0, 1].map((y) => rowText(app, y))).toEqual(["aaaa", "bbbb"]);
      expect(
        rowStyles(app, 1)
          .slice(0, 4)
          .every((style) => style.inverse === true && style.bold === true),
      ).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("findNext navigates to the actual wrapped visual row for wide-character matches", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "ab中cd",
      getLineKey: () => "wide",
    };

    const App = defineComponent({
      name: "TLogViewWideWrapSearchApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 3,
            h: 1,
            source,
            version: 1,
            wrap: true,
            searchQuery: "中",
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 3, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      logView.value!.findNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("中c");
      expect(rowStyles(app, 0)[0]!.inverse).toBe(true);
      expect(rowStyles(app, 0)[0]!.bold).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("findNext navigates to the actual ANSI wrapped visual row for wide-character matches", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mab中cd\x1b[0m",
      getLineKey: () => "wide-ansi",
    };

    const App = defineComponent({
      name: "TLogViewWideAnsiWrapSearchApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 3,
            h: 1,
            source,
            version: 1,
            wrap: true,
            ansi: true,
            searchQuery: "中",
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 3, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      logView.value!.findNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("中c");
      const styles = rowStyles(app, 0);
      expect(styles[0]!.fg).toBe("red");
      expect(styles[0]!.inverse).toBe(true);
      expect(styles[0]!.bold).toBe(true);
      expect(styles[2]!.fg).toBe("red");
    } finally {
      app.dispose();
    }
  });

  it("rescans search matches after retention drops head lines", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 3 });
    log.appendLines(["line-0", "line-1", "line-2"]);
    const logView = ref<TLogViewHandle | null>(null);

    const App = defineComponent({
      name: "TLogViewSearchRetentionApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 12,
            h: 3,
            source: log.source,
            version: log.version.value,
            searchQuery: "line-0",
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 4, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      expect(logView.value!.getSearchState().matchCount).toBe(1);

      log.appendLine("line-3");
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState().matchCount).toBe(0);
    } finally {
      app.dispose();
    }
  });

  it("rescans search matches when appending a new matching line", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLine("ok");
    const logView = ref<TLogViewHandle | null>(null);

    const App = defineComponent({
      name: "TLogViewSearchAppendApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 20,
            h: 2,
            source: log.source,
            version: log.version.value,
            searchQuery: "ERROR",
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 3, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      expect(logView.value!.getSearchState().matchCount).toBe(0);

      log.appendLine("ERROR new");
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState().matchCount).toBe(1);
    } finally {
      app.dispose();
    }
  });

  it("keeps search scanning chunked when the first match is far past the first frame", async () => {
    const raf = installManualRaf();
    const logView = ref<TLogViewHandle | null>(null);
    const getLine = vi.fn((index: number) => `line-${index}`);
    const source: TLogDataSource = {
      lineCount: () => 100_000,
      getLine,
      getLineKey: (index) => index,
    };

    const App = defineComponent({
      name: "TLogViewChunkedSearchApp",
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
            searchQuery: "line-99999",
            searchOptions: { maxMatches: 1, scanBudgetMs: 0 },
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      getLine.mockClear();

      expect(raf.pending()).toBe(1);
      raf.flush();
      await nextTick();

      expect(getLine.mock.calls.length).toBeLessThan(100);
      expect(logView.value!.getSearchState()).toMatchObject({
        status: "scanning",
        matchCount: 0,
      });
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("clears search highlights when searchQuery becomes empty", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const query = ref("foo");
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "foo",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewSearchClearApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 8,
            h: 1,
            source,
            version: 1,
            searchQuery: query.value,
            searchOptions: { scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 8, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      expect(rowStyles(app, 0)[0]!.inverse).toBe(true);

      query.value = "";
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState()).toMatchObject({
        query: "",
        status: "idle",
        matchCount: 0,
      });
      expect(rowStyles(app, 0)[0]!.inverse).toBeUndefined();
    } finally {
      app.dispose();
    }
  });

  it("does not optimistically clear controlled searchQuery before parent updates it", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const query = ref("foo");
    const onUpdateSearchQuery = vi.fn();
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "foo",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewControlledClearSearchApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 8,
            h: 1,
            source,
            version: 1,
            searchQuery: query.value,
            searchOptions: { scanBudgetMs: 1000 },
            "onUpdate:searchQuery": onUpdateSearchQuery,
          });
      },
    });

    const app = createTerminalApp({ cols: 8, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      expect(logView.value!.getSearchState()).toMatchObject({
        query: "foo",
        status: "done",
        matchCount: 1,
      });

      logView.value!.clearSearch();
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateSearchQuery).toHaveBeenCalledWith("");
      expect(logView.value!.getSearchState()).toMatchObject({
        query: "foo",
        status: "done",
        matchCount: 1,
      });
      expect(rowStyles(app, 0)[0]!.inverse).toBe(true);

      query.value = "";
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState()).toMatchObject({
        query: "",
        status: "idle",
        matchCount: 0,
      });
      expect(rowStyles(app, 0)[0]!.inverse).toBeUndefined();
    } finally {
      app.dispose();
    }
  });

  it("respects caseSensitive search option", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const caseSensitive = ref(false);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "ERROR",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewCaseSensitiveSearchApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 8,
            h: 1,
            source,
            version: 1,
            searchQuery: "error",
            searchOptions: { caseSensitive: caseSensitive.value, scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 8, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      expect(logView.value!.getSearchState().matchCount).toBe(1);

      caseSensitive.value = true;
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState().matchCount).toBe(0);
    } finally {
      app.dispose();
    }
  });

  it("respects wholeWord search option with ASCII word boundaries", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "error errors _error error-1",
      getLineKey: () => "line",
    };

    const App = defineComponent({
      name: "TLogViewWholeWordSearchApp",
      setup() {
        return () =>
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 32,
            h: 1,
            source,
            version: 1,
            searchQuery: "error",
            searchOptions: { wholeWord: true, scanBudgetMs: 1000 },
          });
      },
    });

    const app = createTerminalApp({ cols: 32, rows: 2, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState().matchCount).toBe(2);
      const styles = rowStyles(app, 0);
      expect(styles[0]!.inverse).toBe(true);
      expect(styles[6]!.inverse).toBeUndefined();
      expect(styles[14]!.inverse).toBeUndefined();
      expect(styles[20]!.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("renders ANSI SGR styles in fixed one-line mode", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mred\x1b[0m plain",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 12,
          h: 1,
          source,
          version: 1,
          ansi: true,
        }),
      12,
      2,
    );

    expect(rowText(mounted, 0)).toBe("red plain");
    const styles = rowStyles(mounted, 0);
    expect(styles[0]!.fg).toBe("red");
    expect(styles[1]!.fg).toBe("red");
    expect(styles[2]!.fg).toBe("red");
    expect(styles[4]!.fg).toBeUndefined();
    mounted.unmount();
  });

  it("does not interpret ANSI escapes when ansi is false", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mred",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 12,
          h: 1,
          source,
          version: 1,
        }),
      12,
      2,
    );

    expect(rowStyles(mounted, 0).every((style) => style.fg == null)).toBe(true);
    mounted.unmount();
  });

  it("strips unsupported ANSI control sequences in ansi mode", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[2K\x1b[31mred\x1b[0m",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 8,
          h: 1,
          source,
          version: 1,
          ansi: true,
        }),
      8,
      2,
    );

    expect(rowText(mounted, 0)).toBe("red");
    expect(rowStyles(mounted, 0)[0]!.fg).toBe("red");
    mounted.unmount();
  });

  it("renders OSC8 hyperlinks when links are enabled", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b]8;;https://example.com\x07link\x1b]8;;\x07",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 8,
          h: 1,
          source,
          version: 1,
          ansi: true,
          links: true,
        }),
      8,
      2,
    );

    expect(rowText(mounted, 0)).toBe("link");
    const style = rowStyles(mounted, 0)[0]!;
    expect(style.href).toBe("https://example.com");
    expect(style.underline).toBe(true);
    mounted.unmount();
  });

  it("strips OSC8 sequences without href metadata when links are disabled", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b]8;;https://example.com\x07link\x1b]8;;\x07",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 8,
          h: 1,
          source,
          version: 1,
          ansi: true,
        }),
      8,
      2,
    );

    expect(rowText(mounted, 0)).toBe("link");
    expect(rowStyles(mounted, 0)[0]!.href).toBeUndefined();
    mounted.unmount();
  });

  it("supports ST-terminated OSC8 hyperlinks", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b]8;;https://x\x1b\\link\x1b]8;;\x1b\\",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 8,
          h: 1,
          source,
          version: 1,
          ansi: true,
          links: true,
        }),
      8,
      2,
    );

    expect(rowText(mounted, 0)).toBe("link");
    expect(rowStyles(mounted, 0)[0]!.href).toBe("https://x");
    mounted.unmount();
  });

  it("preserves OSC8 href metadata when fixed rows are clipped", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "before \x1b]8;;https://example.com\x07link\x1b]8;;\x07 after",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: -8,
          y: 0,
          w: 14,
          h: 1,
          source,
          version: 1,
          ansi: true,
          links: true,
        }),
      6,
      2,
    );

    expect(rowText(mounted, 0)).toBe("ink af");
    const styles = rowStyles(mounted, 0);
    expect(styles[0]!.href).toBe("https://example.com");
    expect(styles[2]!.href).toBe("https://example.com");
    expect(styles[4]!.href).toBeUndefined();
    mounted.unmount();
  });

  it("resets SGR foreground and background to the TLogView base style", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mred\x1b[39mbase \x1b[41mbg\x1b[49mnormal",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 32,
          h: 1,
          source,
          version: 1,
          style: { fg: "whiteBright", bg: "black" },
          ansi: true,
        }),
      32,
      2,
    );

    expect(rowText(mounted, 0)).toBe("redbase bgnormal");
    const styles = rowStyles(mounted, 0);
    expect(styles[0]!.fg).toBe("red");
    expect(styles[3]!.fg).toBe("whiteBright");
    expect(styles[8]!.bg).toBe("red");
    expect(styles[10]!.bg).toBe("black");
    mounted.unmount();
  });

  it("renders ANSI SGR style flags", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[1;2;3;4;7mstyled\x1b[0m",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 12,
          h: 1,
          source,
          version: 1,
          ansi: true,
        }),
      12,
      2,
    );

    const style = rowStyles(mounted, 0)[0]!;
    expect(style.bold).toBe(true);
    expect(style.dim).toBe(true);
    expect(style.italic).toBe(true);
    expect(style.underline).toBe(true);
    expect(style.inverse).toBe(true);
    mounted.unmount();
  });

  it("preserves ANSI style when fixed rows are clipped into a styled segment", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "normal \x1b[31mred\x1b[0m end",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: -7,
          y: 0,
          w: 15,
          h: 1,
          source,
          version: 1,
          ansi: true,
        }),
      8,
      2,
    );

    expect(rowText(mounted, 0)).toBe("red end");
    const styles = rowStyles(mounted, 0);
    expect(styles[0]!.fg).toBe("red");
    expect(styles[1]!.fg).toBe("red");
    expect(styles[2]!.fg).toBe("red");
    expect(styles[4]!.fg).toBeUndefined();
    mounted.unmount();
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

  it("wraps ANSI visual rows without counting SGR escapes as cells", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mabcdefghij\x1b[0m",
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
          ansi: true,
        }),
      4,
      4,
    );

    expect([0, 1, 2].map((y) => rowText(mounted, y))).toEqual(["abcd", "efgh", "ij"]);
    expect(
      rowStyles(mounted, 0)
        .slice(0, 4)
        .every((style) => style.fg === "red"),
    ).toBe(true);
    expect(
      rowStyles(mounted, 1)
        .slice(0, 4)
        .every((style) => style.fg === "red"),
    ).toBe(true);
    expect(
      rowStyles(mounted, 2)
        .slice(0, 2)
        .every((style) => style.fg === "red"),
    ).toBe(true);
    mounted.unmount();
  });

  it("preserves OSC8 href metadata across wrapped visual rows", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b]8;;https://example.com\x07abcdefgh\x1b]8;;\x07",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 4,
          h: 2,
          source,
          version: 1,
          wrap: true,
          ansi: true,
          links: true,
        }),
      4,
      3,
    );

    expect([0, 1].map((y) => rowText(mounted, y))).toEqual(["abcd", "efgh"]);
    expect(
      rowStyles(mounted, 0)
        .slice(0, 4)
        .every((style) => style.href === "https://example.com"),
    ).toBe(true);
    expect(
      rowStyles(mounted, 1)
        .slice(0, 4)
        .every((style) => style.href === "https://example.com"),
    ).toBe(true);
    mounted.unmount();
  });

  it("emits linkClick for visible OSC8 link cells", async () => {
    const payloads: TLogViewLinkClickPayload[] = [];
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "go \x1b]8;;https://example.com\x07link\x1b]8;;\x07",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 10,
          h: 1,
          source,
          version: 1,
          ansi: true,
          links: true,
          onLinkClick: (payload: TLogViewLinkClickPayload) => payloads.push(payload),
        }),
      10,
      2,
    );

    mounted
      .container()
      ?.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
    mounted
      .container()
      ?.dispatchEvent(new MouseEvent("click", { clientX: 4, clientY: 0, bubbles: true }));

    expect(payloads).toEqual([
      {
        href: "https://example.com",
        text: "link",
        absoluteLineIndex: 0,
        index: 0,
        startCell: 3,
        endCell: 7,
        cellX: 4,
        cellY: 0,
      },
    ]);
    mounted.unmount();
  });

  it("composes search highlight with OSC8 href style", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b]8;;https://example.com\x07ERROR\x1b]8;;\x07",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          ref: logView,
          x: 0,
          y: 0,
          w: 8,
          h: 1,
          source,
          version: 1,
          ansi: true,
          links: true,
          searchQuery: "ERROR",
        }),
      8,
      2,
    );

    await nextTick();
    const style = rowStyles(mounted, 0)[0]!;
    expect(style.href).toBe("https://example.com");
    expect(style.underline).toBe(true);
    expect(style.inverse).toBe(true);
    mounted.unmount();
  });

  it("emits retained absolute line indexes for linkClick", async () => {
    const payloads: TLogViewLinkClickPayload[] = [];
    const log = createAppendOnlyLogStore({ maxLines: 3 });
    log.appendLines([
      "old",
      "\x1b]8;;https://example.com/1\x07one\x1b]8;;\x07",
      "\x1b]8;;https://example.com/2\x07two\x1b]8;;\x07",
      "\x1b]8;;https://example.com/3\x07three\x1b]8;;\x07",
    ]);

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 8,
          h: 3,
          source: log.source,
          version: log.version.value,
          ansi: true,
          links: true,
          onLinkClick: (payload: TLogViewLinkClickPayload) => payloads.push(payload),
        }),
      8,
      4,
    );

    expect(rowText(mounted, 0)).toBe("one");
    mounted
      .container()
      ?.dispatchEvent(new MouseEvent("click", { clientX: 1, clientY: 0, bubbles: true }));
    expect(payloads[0]?.absoluteLineIndex).toBe(1);
    expect(payloads[0]?.index).toBe(0);
    expect(payloads[0]?.href).toBe("https://example.com/1");
    mounted.unmount();
  });

  it("wraps ANSI styled wide characters without dropping boundary glyphs", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mab中cd\x1b[0m",
      getLineKey: () => "wide",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 3,
          h: 3,
          source,
          version: 1,
          wrap: true,
          ansi: true,
        }),
      3,
      4,
    );

    expect([0, 1, 2].map((y) => rowText(mounted, y))).toEqual(["ab", "中c", "d"]);
    expect(rowStyles(mounted, 1)[0]!.fg).toBe("red");
    expect(rowStyles(mounted, 1)[2]!.fg).toBe("red");
    mounted.unmount();
  });

  it("resets ANSI style to the TLogView base style across wrapped rows", async () => {
    const source: TLogDataSource = {
      lineCount: () => 1,
      getLine: () => "\x1b[31mabcd\x1b[0mefgh",
      getLineKey: () => "line",
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 4,
          h: 2,
          source,
          version: 1,
          style: { fg: "whiteBright" },
          wrap: true,
          ansi: true,
        }),
      4,
      3,
    );

    expect([0, 1].map((y) => rowText(mounted, y))).toEqual(["abcd", "efgh"]);
    expect(
      rowStyles(mounted, 0)
        .slice(0, 4)
        .every((style) => style.fg === "red"),
    ).toBe(true);
    expect(
      rowStyles(mounted, 1)
        .slice(0, 4)
        .every((style) => style.fg === "whiteBright"),
    ).toBe(true);
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

  it("repaints ANSI tail style when appendChunk mutates the current tail", async () => {
    const log = createAppendOnlyLogStore();

    const App = defineComponent({
      name: "TLogViewAnsiAppendChunkTailApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 2,
            source: log.source,
            version: log.version.value,
            ansi: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendChunk("\x1b[31mred");
      await nextTick();
      await nextTick();
      expect(rowText(app, 0)).toBe("red");

      log.appendChunk(" more\x1b[0m");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("red more");
      expect(
        rowStyles(app, 0)
          .slice(0, 8)
          .every((style) => style.fg === "red"),
      ).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("repaints ANSI tail style when replaceTail changes the current tail", async () => {
    const log = createAppendOnlyLogStore();
    log.appendChunk("\x1b[31mdraft");

    const App = defineComponent({
      name: "TLogViewAnsiReplaceTailApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 20,
            h: 2,
            source: log.source,
            version: log.version.value,
            ansi: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.replaceTail("\x1b[32mfinal\x1b[0m");
      await nextTick();
      await nextTick();

      expect(rowText(app, 0)).toBe("final");
      expect(
        rowStyles(app, 0)
          .slice(0, 5)
          .every((style) => style.fg === "green"),
      ).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("keeps ANSI cache entries correct after retention drops head lines", async () => {
    const log = createAppendOnlyLogStore({ maxLines: 3 });
    log.appendLines(["\x1b[31mred-0\x1b[0m", "\x1b[32mgreen-1\x1b[0m", "\x1b[33myellow-2\x1b[0m"]);

    const App = defineComponent({
      name: "TLogViewAnsiRetentionApp",
      setup() {
        return () =>
          h(TLogView, {
            x: 0,
            y: 0,
            w: 12,
            h: 3,
            source: log.source,
            version: log.version.value,
            ansi: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 12, rows: 4, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      log.appendLine("\x1b[31mred-3\x1b[0m");
      await nextTick();
      await nextTick();

      expect([0, 1, 2].map((y) => rowText(app, y))).toEqual(["green-1", "yellow-2", "red-3"]);
      expect(rowStyles(app, 0)[0]!.fg).toBe("green");
      expect(rowStyles(app, 1)[0]!.fg).toBe("yellow");
      expect(rowStyles(app, 2)[0]!.fg).toBe("red");
    } finally {
      app.dispose();
    }
  });

  it("does not wrap all lines on initial large ANSI wrapped mount", async () => {
    const getLine = vi.fn((index: number) => `\x1b[31mline-${index}-${"x".repeat(20)}\x1b[0m`);
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
          ansi: true,
        }),
      10,
      6,
    );

    expect(getLine.mock.calls.length).toBeLessThan(100);
    expect(rowText(mounted, 0)).toBe("line-99999");
    mounted.unmount();
  });

  it("reuses completed ANSI row caches when appending at bottom", async () => {
    const log = createAppendOnlyLogStore();
    log.appendLines(Array.from({ length: 20 }, (_, index) => `\x1b[31mERROR ${index}\x1b[0m`));
    const getLineSpy = vi.spyOn(log.source, "getLine");

    const App = defineComponent({
      name: "TLogViewAnsiAppendCacheApp",
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
            ansi: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      getLineSpy.mockClear();

      log.appendLine("\x1b[31mERROR 20\x1b[0m");
      await nextTick();
      await nextTick();

      expect(rowText(app, 3)).toBe("ERROR 20");
      expect(rowStyles(app, 3)[0]!.fg).toBe("red");
      expect(getLineSpy.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      app.dispose();
      getLineSpy.mockRestore();
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
