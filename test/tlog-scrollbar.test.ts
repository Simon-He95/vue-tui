import type {
  TLogDataSource,
  TLogScrollbarMarker,
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

  it("renders markers on the track and keeps the thumb visible", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogScrollbar, {
          x: 0,
          y: 0,
          h: 10,
          metrics: createMetrics({
            scrollTop: 0,
            maxScrollTop: 90,
            viewportRows: 10,
            visualRowCount: 100,
            estimatedVisualRowCount: 100,
            measuredVisualRowCount: 100,
          }),
          markers: [
            { visualRow: 50 },
            { visualRow: 0, current: true },
            { visualRow: 99, estimated: true },
          ] satisfies readonly TLogScrollbarMarker[],
        }),
      1,
      10,
    );

    try {
      expect(columnChars(mounted, 0, 10)).toBe("█││││•│││·");
      expect(cell(mounted, 0, 5).style).toMatchObject({ fg: "yellowBright" });
    } finally {
      mounted.unmount();
    }
  });

  it("emits markerClick instead of scrollTo when clicking a marker row", async () => {
    const onScrollTo = vi.fn();
    const onMarkerClick = vi.fn();
    const markers = [{ id: "m1", visualRow: 50, payload: { kind: "match" } }] as const;
    const App = defineComponent({
      name: "TLogScrollbarMarkerClickApp",
      setup() {
        return () =>
          h(TLogScrollbar, {
            x: 0,
            y: 0,
            h: 10,
            metrics: createMetrics({
              scrollTop: 0,
              maxScrollTop: 90,
              viewportRows: 10,
              visualRowCount: 100,
              estimatedVisualRowCount: 100,
              measuredVisualRowCount: 100,
            }),
            markers,
            onScrollTo,
            onMarkerClick,
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

      expect(onMarkerClick).toHaveBeenCalledWith({
        marker: markers[0],
        markerIndex: 0,
        visualRow: 50,
        cellX: 0,
        cellY: 5,
      });
      expect(onScrollTo).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("does not emit markerClick for marker rows covered by the thumb", async () => {
    const onScrollTo = vi.fn();
    const onMarkerClick = vi.fn();
    const markers = [{ id: "top", visualRow: 0, current: true }] as const;
    const App = defineComponent({
      name: "TLogScrollbarThumbDominatesMarkerClickApp",
      setup() {
        return () =>
          h(TLogScrollbar, {
            x: 0,
            y: 0,
            h: 10,
            metrics: createMetrics({
              scrollTop: 0,
              maxScrollTop: 90,
              viewportRows: 10,
              visualRowCount: 100,
              estimatedVisualRowCount: 100,
              measuredVisualRowCount: 100,
            }),
            markers,
            onScrollTo,
            onMarkerClick,
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
        cellY: 0,
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(onMarkerClick).not.toHaveBeenCalled();
      expect(onScrollTo).toHaveBeenCalledWith(0);
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

  it("integrates TLogView search markers and lets the parent handle marker clicks", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const metrics = ref<TLogViewScrollMetrics | null>(null);
    const markers = ref<readonly TLogScrollbarMarker[]>([]);
    const source: TLogDataSource = {
      lineCount: () => 8,
      getLine: (index) =>
        [
          "ok line-0",
          "ok line-1",
          "error line-2",
          "ok line-3",
          "ok line-4",
          "ok line-5",
          "error line-6",
          "ok line-7",
        ][index] ?? "",
      getLineKey: (index) => index,
    };

    const App = defineComponent({
      name: "TLogScrollbarSearchMarkersIntegrationApp",
      setup() {
        const refresh = () => {
          metrics.value = logView.value?.getScrollMetrics() ?? null;
          markers.value =
            logView.value?.getSearchMarkers().map((marker) => ({
              id: marker.matchIndex,
              visualRow: marker.visualRow,
              current: marker.current,
              estimated: marker.estimated,
              payload: marker,
            })) ?? [];
        };

        onMounted(refresh);

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
            searchQuery: "error",
            searchOptions: { scanBudgetMs: 1000 },
            onScroll: refresh,
            onVisualIndex: refresh,
            onSearchMarkers: refresh,
          }),
          h(TLogScrollbar, {
            x: 19,
            y: 0,
            h: 4,
            metrics: metrics.value,
            markers: markers.value,
            onMarkerClick: (payload: {
              marker: TLogScrollbarMarker & { payload?: { visualRow: number } };
            }) => {
              const marker = payload.marker.payload;
              if (!marker) return;
              logView.value?.scrollToVisualRow(marker.visualRow);
              refresh();
            },
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0, 19)).toBe("ok line-0");
      expect(columnChars(app, 19, 4)).toContain("•");

      app.events.dispatch({
        type: "click",
        cellX: 19,
        cellY: 3,
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2, 19)).toBe("error line-6");
    } finally {
      app.dispose();
    }
  });

  it("integrates regex search markers from TLogView", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const metrics = ref<TLogViewScrollMetrics | null>(null);
    const markers = ref<readonly TLogScrollbarMarker[]>([]);
    const source: TLogDataSource = {
      lineCount: () => 8,
      getLine: (index) =>
        [
          "ok line-0",
          "ok line-1",
          "error line-2",
          "ok line-3",
          "ok line-4",
          "ok line-5",
          "error line-6",
          "ok line-7",
        ][index] ?? "",
      getLineKey: (index) => index,
    };

    const App = defineComponent({
      name: "TLogScrollbarRegexMarkersIntegrationApp",
      setup() {
        const refresh = () => {
          metrics.value = logView.value?.getScrollMetrics() ?? null;
          markers.value =
            logView.value?.getSearchMarkers().map((marker) => ({
              id: marker.matchIndex,
              visualRow: marker.visualRow,
              current: marker.current,
              estimated: marker.estimated,
              payload: marker,
            })) ?? [];
        };

        onMounted(refresh);

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
            searchQuery: "error\\s+line-\\d",
            searchOptions: { mode: "regex", scanBudgetMs: 1000 },
            onScroll: refresh,
            onVisualIndex: refresh,
            onSearchMarkers: refresh,
          }),
          h(TLogScrollbar, {
            x: 19,
            y: 0,
            h: 4,
            metrics: metrics.value,
            markers: markers.value,
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 6, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      await nextTick();
      app.scheduler.flushNow();

      expect(markers.value).toHaveLength(2);
      expect(columnChars(app, 19, 4)).toContain("•");
    } finally {
      app.dispose();
    }
  });
});
