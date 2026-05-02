import type { TLogDataSource } from "../src/experimental.js";
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
