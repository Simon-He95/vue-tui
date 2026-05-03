import type {
  TLogDataSource,
  TLogMinimapClickPayload,
  TLogMinimapMarker,
  TLogViewHandle,
  TLogViewScrollMetrics,
  TLogViewSearchMarker,
} from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/index.js";
import { TLogMinimap, TLogView } from "../src/experimental.js";
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

function createMetrics(overrides: Partial<TLogViewScrollMetrics> = {}): TLogViewScrollMetrics {
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

describe("TLogMinimap", () => {
  it("renders the viewport window in the overview column", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogMinimap, {
          x: 0,
          y: 0,
          w: 2,
          h: 10,
          metrics: createMetrics({
            scrollTop: 40,
            maxScrollTop: 70,
            viewportRows: 30,
            visualRowCount: 100,
            estimatedVisualRowCount: 100,
            measuredVisualRowCount: 100,
          }),
        }),
      2,
      10,
    );

    try {
      expect(columnChars(mounted, 1, 10)).toBe("    ███   ");
      expect(cell(mounted, 0, 5).style).toMatchObject({ inverse: true });
    } finally {
      mounted.unmount();
    }
  });

  it("renders estimated exact and current markers with stable row priority", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogMinimap, {
          x: 0,
          y: 0,
          w: 1,
          h: 10,
          metrics: createMetrics({
            maxScrollTop: 90,
            viewportRows: 10,
            visualRowCount: 100,
            estimatedVisualRowCount: 100,
            measuredVisualRowCount: 100,
          }),
          markers: [
            { visualRow: 25, estimated: true },
            { visualRow: 50 },
            { visualRow: 80, current: true },
          ] satisfies readonly TLogMinimapMarker[],
          showViewport: false,
        }),
      1,
      10,
    );

    try {
      expect(columnChars(mounted, 0, 10)).toBe("  ·  • ◆  ");
      expect(cell(mounted, 0, 2).style).toMatchObject({ fg: "yellowBright", dim: true });
      expect(cell(mounted, 0, 5).style).toMatchObject({ fg: "yellowBright" });
      expect(cell(mounted, 0, 7).style).toMatchObject({ fg: "redBright", bold: true });
    } finally {
      mounted.unmount();
    }
  });

  it("renders density buckets on dedicated density columns", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogMinimap, {
          x: 0,
          y: 0,
          w: 2,
          h: 10,
          metrics: createMetrics({
            maxScrollTop: 90,
            viewportRows: 10,
            visualRowCount: 100,
            estimatedVisualRowCount: 100,
            measuredVisualRowCount: 100,
          }),
          density: [
            { startVisualRow: 0, endVisualRow: 32, value: 0.2 },
            { startVisualRow: 33, endVisualRow: 65, value: 0.5 },
            { startVisualRow: 66, endVisualRow: 99, value: 0.9 },
          ],
          showViewport: false,
        }),
      2,
      10,
    );

    try {
      expect(columnChars(mounted, 0, 10)).toBe("░░░▒▒▒▓▓▓▓");
      expect(columnChars(mounted, 1, 10)).toBe("          ");
    } finally {
      mounted.unmount();
    }
  });

  it("treats density endVisualRow as inclusive", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogMinimap, {
          x: 0,
          y: 0,
          w: 1,
          h: 4,
          metrics: createMetrics({
            maxScrollTop: 3,
            viewportRows: 1,
            visualRowCount: 4,
            estimatedVisualRowCount: 4,
            measuredVisualRowCount: 4,
          }),
          density: [
            { startVisualRow: 0, endVisualRow: 0, value: 1 },
            { startVisualRow: 3, endVisualRow: 3, value: 1 },
          ],
          showMarkers: false,
          showViewport: false,
        }),
      1,
      4,
    );

    try {
      expect(columnChars(mounted, 0, 4)).toBe("▓  ▓");
    } finally {
      mounted.unmount();
    }
  });

  it("emits markerClick instead of scrollTo when a marker row is clicked", async () => {
    const onScrollTo = vi.fn();
    const onMarkerClick = vi.fn();
    const markers = [{ id: "m1", visualRow: 50, payload: { kind: "match" } }] as const;
    const App = defineComponent({
      name: "TLogMinimapMarkerClickApp",
      setup() {
        return () =>
          h(TLogMinimap, {
            x: 0,
            y: 0,
            w: 2,
            h: 10,
            metrics: createMetrics({
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

    const app = createTerminalApp({ cols: 2, rows: 10, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 5 } as any);
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

  it("emits scrollTo for non-marker rows", async () => {
    const onScrollTo = vi.fn();
    const App = defineComponent({
      name: "TLogMinimapScrollToApp",
      setup() {
        return () =>
          h(TLogMinimap, {
            x: 0,
            y: 0,
            w: 2,
            h: 10,
            metrics: createMetrics({
              maxScrollTop: 90,
              viewportRows: 10,
              visualRowCount: 100,
              estimatedVisualRowCount: 100,
              measuredVisualRowCount: 100,
            }),
            onScrollTo,
          });
      },
    });

    const app = createTerminalApp({ cols: 2, rows: 10, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 5 } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(onScrollTo).toHaveBeenCalledWith({
        visualRow: 55,
        cellX: 0,
        cellY: 5,
      } satisfies TLogMinimapClickPayload);
    } finally {
      app.dispose();
    }
  });

  it("renders safely when metrics are null", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogMinimap, {
          x: 0,
          y: 0,
          w: 2,
          h: 4,
          metrics: null,
          density: [{ startVisualRow: 0, endVisualRow: 10, value: 1 }],
        }),
      2,
      4,
    );

    try {
      expect(columnChars(mounted, 0, 4)).toBe("    ");
      expect(columnChars(mounted, 1, 4)).toBe("    ");
    } finally {
      mounted.unmount();
    }
  });

  it("integrates TLogView search markers through parent-managed wiring", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const metrics = ref<TLogViewScrollMetrics | null>(null);
    const markers = ref<readonly TLogMinimapMarker[]>([]);
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
      name: "TLogMinimapIntegrationApp",
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
            w: 20,
            h: 4,
            source,
            version: 1,
            defaultScrollTop: 0,
            searchQuery: "error",
            searchOptions: { scanBudgetMs: 1000 },
            onScroll: refresh,
            onVisualIndex: refresh,
            onSearchMarkers: refresh,
            onSearchMatch: refresh,
          }),
          h(TLogMinimap, {
            x: 20,
            y: 0,
            w: 2,
            h: 4,
            metrics: metrics.value,
            markers: markers.value,
            onMarkerClick: (payload: {
              marker: TLogMinimapMarker & { payload?: TLogViewSearchMarker };
            }) => {
              const marker = payload.marker.payload;
              if (!marker) return;
              logView.value?.selectSearchMatch(marker.matchIndex, { align: "center" });
              refresh();
            },
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 22, rows: 4, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      await nextTick();
      app.scheduler.flushNow();

      expect(markers.value).toHaveLength(2);
      expect(markers.value[0]).toMatchObject({ visualRow: 2 });

      app.events.dispatch({ type: "click", cellX: 20, cellY: 3, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(logView.value!.getSearchState().currentMatchIndex).toBe(1);
      expect(markers.value[1]).toMatchObject({ current: true, visualRow: 6 });
      expect(
        Array.from({ length: 4 }, (_, index) => rowText(app, index, 20)).some((line) =>
          line.startsWith("error line-6"),
        ),
      ).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("integrates regex search markers through parent-managed wiring", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const metrics = ref<TLogViewScrollMetrics | null>(null);
    const markers = ref<readonly TLogMinimapMarker[]>([]);
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
      name: "TLogMinimapRegexIntegrationApp",
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
            w: 20,
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
          h(TLogMinimap, {
            x: 20,
            y: 0,
            w: 2,
            h: 4,
            metrics: metrics.value,
            markers: markers.value,
          }),
        ];
      },
    });

    const app = createTerminalApp({ cols: 22, rows: 4, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      await nextTick();
      app.scheduler.flushNow();

      expect(markers.value).toHaveLength(2);
      expect(markers.value[0]).toMatchObject({ visualRow: 2 });
      expect(markers.value[1]).toMatchObject({ visualRow: 6 });
    } finally {
      app.dispose();
    }
  });
});
