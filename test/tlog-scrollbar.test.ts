import type {
  TLogDataSource,
  TLogScrollbarMetrics,
  TLogViewHandle,
  TLogViewScrollMetrics,
} from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/index.js";
import { TLogScrollbar, TLogView } from "../src/experimental.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  onMounted,
  ref,
} from "./ui-regressions-support.js";

function cell(
  mounted: { terminal: ReturnType<typeof createTerminalApp>["terminal"] },
  x: number,
  y: number,
) {
  return mounted.terminal.getRow(y)[x]!;
}

function columnChars(
  mounted: { terminal: ReturnType<typeof createTerminalApp>["terminal"] },
  x: number,
  height: number,
): string {
  return Array.from({ length: height }, (_, y) => cell(mounted, x, y).ch).join("");
}

function rowText(
  mounted: { terminal: ReturnType<typeof createTerminalApp>["terminal"] },
  y: number,
  width?: number,
): string {
  const row = mounted.terminal.getRow(y);
  return row
    .slice(0, width ?? row.length)
    .map((entry) => entry.ch)
    .join("")
    .trimEnd();
}

function createMetrics(overrides: Partial<TLogScrollbarMetrics> = {}): TLogViewScrollMetrics {
  const scrollTop = overrides.scrollTop ?? 0;
  const maxScrollTop = overrides.maxScrollTop ?? 10;
  return {
    scrollTop,
    maxScrollTop,
    viewportRows: overrides.viewportRows ?? 10,
    lineCount: overrides.lineCount ?? 20,
    firstLineIndex: overrides.firstLineIndex ?? 0,
    estimatedVisualRowCount: overrides.estimatedVisualRowCount ?? 20,
    visualRowCount: overrides.visualRowCount ?? 20,
    measuredVisualRowCount: overrides.measuredVisualRowCount ?? 20,
    measuredLineCount: overrides.measuredLineCount ?? 20,
    visualIndexStatus: overrides.visualIndexStatus ?? "exact",
    atTop: overrides.atTop ?? scrollTop <= 0,
    atBottom: overrides.atBottom ?? scrollTop >= maxScrollTop,
  };
}

describe("TLogScrollbar", () => {
  it("renders an exact thumb proportional to wrapped visual rows", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogScrollbar, {
          x: 0,
          y: 0,
          h: 10,
          metrics: createMetrics({
            viewportRows: 10,
            visualRowCount: 20,
            estimatedVisualRowCount: 20,
            measuredVisualRowCount: 20,
            maxScrollTop: 10,
          }),
        }),
      1,
      10,
    );

    try {
      expect(columnChars(mounted, 0, 10)).toBe("█████│││││");
    } finally {
      mounted.unmount();
    }
  });

  it("moves the thumb as scrollTop approaches the bottom", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogScrollbar, {
          x: 0,
          y: 0,
          h: 10,
          metrics: createMetrics({
            scrollTop: 10,
            maxScrollTop: 10,
            viewportRows: 10,
            visualRowCount: 20,
            estimatedVisualRowCount: 20,
            measuredVisualRowCount: 20,
          }),
        }),
      1,
      10,
    );

    try {
      expect(columnChars(mounted, 0, 10)).toBe("│││││█████");
    } finally {
      mounted.unmount();
    }
  });

  it("renders measuring and estimated thumb states distinctly", async () => {
    const status = ref<TLogScrollbarMetrics["visualIndexStatus"]>("measuring");

    const mounted = await mountTerminal(
      () =>
        h(TLogScrollbar, {
          x: 0,
          y: 0,
          h: 4,
          metrics: createMetrics({
            scrollTop: 0,
            maxScrollTop: 0,
            viewportRows: 4,
            visualRowCount: 4,
            estimatedVisualRowCount: 4,
            measuredVisualRowCount: 4,
            visualIndexStatus: status.value,
          }),
          measuringStyle: { fg: "yellow", underline: true },
        }),
      1,
      4,
    );

    try {
      expect(columnChars(mounted, 0, 4)).toBe("▒▒▒▒");
      expect(cell(mounted, 0, 0).style).toMatchObject({ fg: "yellow", underline: true });

      status.value = "estimated";
      await nextTick();

      expect(columnChars(mounted, 0, 4)).toBe("░░░░");
      expect(cell(mounted, 0, 0).style).toMatchObject({ inverse: true, dim: true });
    } finally {
      mounted.unmount();
    }
  });

  it("emits scrollTo when clicking the track", async () => {
    const onScrollTo = vi.fn();
    const App = defineComponent({
      name: "TLogScrollbarClickApp",
      setup() {
        return () =>
          h(TLogScrollbar, {
            x: 0,
            y: 0,
            h: 10,
            metrics: createMetrics({
              scrollTop: 0,
              maxScrollTop: 100,
              viewportRows: 10,
              lineCount: 110,
              visualRowCount: 110,
              estimatedVisualRowCount: 110,
              measuredVisualRowCount: 110,
            }),
            onScrollTo,
          });
      },
    });
    const app = createTerminalApp({ cols: 1, rows: 10, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({
        type: "click",
        cellX: 0,
        cellY: 5,
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(onScrollTo).toHaveBeenCalledWith(56);
    } finally {
      app.dispose();
    }
  });

  it("emits scrollBy when receiving wheel input", async () => {
    const onScrollBy = vi.fn();
    const App = defineComponent({
      name: "TLogScrollbarWheelApp",
      setup() {
        return () =>
          h(TLogScrollbar, {
            x: 0,
            y: 0,
            h: 4,
            metrics: createMetrics(),
            onScrollBy,
          });
      },
    });
    const app = createTerminalApp({ cols: 1, rows: 4, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 1,
        deltaY: 1,
      } as any);
      app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 1,
        deltaY: -1,
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(onScrollBy).toHaveBeenNthCalledWith(1, 1);
      expect(onScrollBy).toHaveBeenNthCalledWith(2, -1);
    } finally {
      app.dispose();
    }
  });

  it("renders track safely when metrics are null", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogScrollbar, {
          x: 0,
          y: 0,
          h: 4,
          metrics: null,
        }),
      1,
      4,
    );

    try {
      expect(columnChars(mounted, 0, 4)).toBe("││││");
    } finally {
      mounted.unmount();
    }
  });

  it("integrates with TLogView through external metrics and scroll callbacks", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const metrics = ref<TLogViewScrollMetrics | null>(null);
    const source: TLogDataSource = {
      lineCount: () => 20,
      getLine: (index) => `line-${index}`,
      getLineKey: (index) => index,
    };

    const App = defineComponent({
      name: "TLogScrollbarIntegrationApp",
      setup() {
        const refreshMetrics = () => {
          metrics.value = logView.value?.getScrollMetrics() ?? null;
        };

        onMounted(refreshMetrics);

        return () => [
          h(TLogView, {
            ref: logView,
            x: 0,
            y: 0,
            w: 19,
            h: 4,
            source,
            version: 1,
            defaultScrollTop: 0,
            onScroll: refreshMetrics,
            onVisualIndex: refreshMetrics,
          }),
          h(TLogScrollbar, {
            x: 19,
            y: 0,
            h: 4,
            metrics: metrics.value,
            onScrollTo: (top: number) => {
              logView.value?.scrollToVisualRow(top);
              refreshMetrics();
            },
            onScrollBy: (delta: number) => {
              logView.value?.scrollBy(delta);
              refreshMetrics();
            },
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0, 19)).toBe("line-0");

      app.events.dispatch({
        type: "click",
        cellX: 19,
        cellY: 3,
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0, 19)).toBe("line-16");
    } finally {
      app.dispose();
    }
  });
});
