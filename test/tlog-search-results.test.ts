import type { TLogDataSource, TLogSearchResultItem, TLogViewHandle } from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import { TLogSearchResults, TLogView } from "../src/experimental.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  onMounted,
  ref,
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

describe("TLogSearchResults", () => {
  it("renders result rows with line numbers and preview text", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogSearchResults, {
          x: 0,
          y: 0,
          w: 24,
          h: 2,
          results: [
            {
              matchIndex: 0,
              absoluteLineIndex: 1042,
              lineIndex: 42,
              text: "ERROR failed to connect…",
              matchStartCell: 0,
              matchEndCell: 5,
            },
            {
              matchIndex: 1,
              absoluteLineIndex: 1188,
              lineIndex: 188,
              text: "ERROR retry exhausted…",
              matchStartCell: 0,
              matchEndCell: 5,
            },
          ] satisfies readonly TLogSearchResultItem[],
        }),
      24,
      2,
    );

    try {
      expect(rowText(mounted, 0)).toBe("1042 ERROR failed to con");
      expect(rowText(mounted, 1)).toBe("1188 ERROR retry exhaust");
    } finally {
      mounted.unmount();
    }
  });

  it("composes active current and match styles", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogSearchResults, {
          x: 0,
          y: 0,
          w: 20,
          h: 1,
          activeIndex: 0,
          activeStyle: { inverse: true },
          currentStyle: { bold: true },
          matchStyle: { underline: true, fg: "yellow" },
          results: [
            {
              matchIndex: 0,
              absoluteLineIndex: 12,
              lineIndex: 12,
              text: "foo ERROR bar",
              matchStartCell: 4,
              matchEndCell: 9,
              current: true,
            },
          ] satisfies readonly TLogSearchResultItem[],
        }),
      20,
      1,
    );

    try {
      const styles = rowStyles(mounted, 0);
      expect(styles[0]).toMatchObject({ inverse: true, bold: true });
      expect(styles[7]).toMatchObject({
        inverse: true,
        bold: true,
        underline: true,
        fg: "yellow",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("emits select when clicking a row", async () => {
    const onSelect = vi.fn();
    const App = defineComponent({
      name: "TLogSearchResultsClickApp",
      setup() {
        return () =>
          h(TLogSearchResults, {
            x: 0,
            y: 0,
            w: 20,
            h: 2,
            results: [
              {
                matchIndex: 0,
                absoluteLineIndex: 10,
                lineIndex: 10,
                text: "alpha",
                matchStartCell: 0,
                matchEndCell: 5,
              },
              {
                matchIndex: 3,
                absoluteLineIndex: 20,
                lineIndex: 20,
                text: "bravo",
                matchStartCell: 0,
                matchEndCell: 5,
              },
            ] satisfies readonly TLogSearchResultItem[],
            onSelect,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 2, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 1, time: Date.now() } as any);
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith({
        matchIndex: 3,
        result: expect.objectContaining({
          absoluteLineIndex: 20,
          text: "bravo",
        }),
      });
    } finally {
      app.dispose();
    }
  });

  it("supports keyboard navigation and enter selection", async () => {
    const onActiveChange = vi.fn();
    const onSelect = vi.fn();
    const App = defineComponent({
      name: "TLogSearchResultsKeyboardApp",
      setup() {
        return () =>
          h(TLogSearchResults, {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            results: [
              {
                matchIndex: 0,
                absoluteLineIndex: 10,
                lineIndex: 10,
                text: "alpha",
                matchStartCell: 0,
                matchEndCell: 5,
              },
              {
                matchIndex: 1,
                absoluteLineIndex: 11,
                lineIndex: 11,
                text: "bravo",
                matchStartCell: 0,
                matchEndCell: 5,
              },
              {
                matchIndex: 2,
                absoluteLineIndex: 12,
                lineIndex: 12,
                text: "charlie",
                matchStartCell: 0,
                matchEndCell: 7,
              },
            ] satisfies readonly TLogSearchResultItem[],
            onActiveChange,
            onSelect,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 3, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 0, time: Date.now() } as any);
      app.events.dispatch({
        type: "keydown",
        key: "ArrowDown",
        code: "ArrowDown",
        time: Date.now(),
      } as any);
      app.events.dispatch({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        time: Date.now(),
      } as any);
      await nextTick();

      expect(onActiveChange).toHaveBeenLastCalledWith({
        activeIndex: 1,
        result: expect.objectContaining({
          matchIndex: 1,
          text: "bravo",
        }),
      });
      expect(onSelect).toHaveBeenLastCalledWith({
        matchIndex: 1,
        result: expect.objectContaining({
          absoluteLineIndex: 11,
        }),
      });
    } finally {
      app.dispose();
    }
  });

  it("clips horizontally from the logical row start when offset beyond the viewport", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogSearchResults, {
          x: -2,
          y: 0,
          w: 6,
          h: 1,
          showLineNumbers: false,
          results: [
            {
              matchIndex: 0,
              absoluteLineIndex: 0,
              lineIndex: 0,
              text: "abcdefghi",
              matchStartCell: 3,
              matchEndCell: 6,
            },
          ] satisfies readonly TLogSearchResultItem[],
        }),
      6,
      1,
    );

    try {
      expect(rowText(mounted, 0)).toBe("cdef");
    } finally {
      mounted.unmount();
    }
  });

  it("integrates with TLogView via selectSearchMatch", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const results = ref<readonly TLogSearchResultItem[]>([]);
    const activeIndex = ref(-1);
    const query = ref("error");
    const source: TLogDataSource = {
      lineCount: () => 6,
      getLine: (index) =>
        ["line-0", "line-1", "error line-2", "line-3", "error line-4", "line-5"][index] ?? "",
      getLineKey: (index) => `line-${index}`,
    };

    const App = defineComponent({
      name: "TLogSearchResultsIntegrationApp",
      setup() {
        function refreshResults(): void {
          const raw =
            logView.value?.getSearchResults({
              offset: 0,
              limit: 10,
              includePreview: true,
              previewWidth: 18,
            }) ?? [];
          const state = logView.value?.getSearchState();
          results.value = raw.map((entry) => ({
            matchIndex: entry.matchIndex,
            absoluteLineIndex: entry.match.absoluteLineIndex,
            lineIndex: entry.match.index,
            text: entry.preview?.text ?? "",
            matchStartCell: entry.preview?.matchStartCell ?? 0,
            matchEndCell: entry.preview?.matchEndCell ?? 0,
            current: entry.matchIndex === state?.currentMatchIndex,
          }));
          activeIndex.value = raw.findIndex(
            (entry) => entry.matchIndex === state?.currentMatchIndex,
          );
        }

        function onSelect(payload: { matchIndex: number }): void {
          logView.value?.selectSearchMatch(payload.matchIndex);
          refreshResults();
        }

        onMounted(() => {
          refreshResults();
        });

        return () =>
          h("span", [
            h(TLogView, {
              ref: logView,
              x: 0,
              y: 0,
              w: 20,
              h: 4,
              source,
              version: 1,
              searchQuery: query.value,
              searchOptions: { scanBudgetMs: 1000 },
              onSearch: refreshResults,
              onSearchMatch: refreshResults,
            }),
            h(TLogSearchResults, {
              x: 21,
              y: 0,
              w: 19,
              h: 4,
              results: results.value,
              activeIndex: activeIndex.value,
              onSelect,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 4, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      expect(results.value).toHaveLength(2);
      app.events.dispatch({ type: "click", cellX: 21, cellY: 1, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(logView.value!.getSearchState().currentMatchIndex).toBe(1);
      expect(results.value[1]).toMatchObject({ current: true });
      expect(
        Array.from({ length: 4 }, (_, index) => rowText(app, index)).some((line) =>
          line.startsWith("error line-4"),
        ),
      ).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("integrates with regex search results from TLogView", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const results = ref<readonly TLogSearchResultItem[]>([]);
    const activeIndex = ref(-1);
    const query = ref("error\\s+line-\\d");
    const source: TLogDataSource = {
      lineCount: () => 6,
      getLine: (index) =>
        ["line-0", "line-1", "error line-2", "line-3", "error line-4", "line-5"][index] ?? "",
      getLineKey: (index) => `line-${index}`,
    };

    const App = defineComponent({
      name: "TLogSearchResultsRegexIntegrationApp",
      setup() {
        function refreshResults(): void {
          const raw =
            logView.value?.getSearchResults({
              offset: 0,
              limit: 10,
              includePreview: true,
              previewWidth: 18,
            }) ?? [];
          const state = logView.value?.getSearchState();
          results.value = raw.map((entry) => ({
            matchIndex: entry.matchIndex,
            absoluteLineIndex: entry.match.absoluteLineIndex,
            lineIndex: entry.match.index,
            text: entry.preview?.text ?? "",
            matchStartCell: entry.preview?.matchStartCell ?? 0,
            matchEndCell: entry.preview?.matchEndCell ?? 0,
            current: entry.matchIndex === state?.currentMatchIndex,
          }));
          activeIndex.value = raw.findIndex(
            (entry) => entry.matchIndex === state?.currentMatchIndex,
          );
        }

        function onSelect(payload: { matchIndex: number }): void {
          logView.value?.selectSearchMatch(payload.matchIndex);
          refreshResults();
        }

        onMounted(() => {
          refreshResults();
        });

        return () =>
          h("span", [
            h(TLogView, {
              ref: logView,
              x: 0,
              y: 0,
              w: 20,
              h: 4,
              source,
              version: 1,
              searchQuery: query.value,
              searchOptions: { mode: "regex", scanBudgetMs: 1000 },
              onSearch: refreshResults,
              onSearchMatch: refreshResults,
            }),
            h(TLogSearchResults, {
              x: 21,
              y: 0,
              w: 19,
              h: 4,
              results: results.value,
              activeIndex: activeIndex.value,
              onSelect,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 4, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      expect(results.value).toHaveLength(2);
      expect(results.value[0]?.text).toContain("error line-2");
      app.events.dispatch({ type: "click", cellX: 21, cellY: 1, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(logView.value!.getSearchState().currentMatchIndex).toBe(1);
      expect(results.value[1]).toMatchObject({ current: true });
    } finally {
      app.dispose();
    }
  });
});
