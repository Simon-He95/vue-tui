import type {
  TLogDataSource,
  TLogSearchPagerState,
  TLogSearchResultsSelectPayload,
  TLogViewHandle,
} from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import {
  TLogSearchPager,
  TLogSearchResults,
  TLogView,
  useTLogSearchResultsPage,
} from "../src/experimental.js";
import {
  createApp,
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

async function mountComposableHarness(
  logView: ReturnType<typeof ref<TLogViewHandle | null>>,
  options?: Parameters<typeof useTLogSearchResultsPage>[1],
): Promise<{
  api: ReturnType<typeof useTLogSearchResultsPage>;
  unmount: () => void;
}> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  let api!: ReturnType<typeof useTLogSearchResultsPage>;

  const App = defineComponent({
    name: "UseTLogSearchResultsPageHarness",
    setup() {
      api = useTLogSearchResultsPage(logView, options);
      return () => null;
    },
  });

  const app = createApp(App);
  app.mount(root);
  await nextTick();

  return {
    api,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe("useTLogSearchResultsPage", () => {
  it("pulls only the current page from the handle", async () => {
    const searchState = {
      query: "error",
      status: "done" as const,
      matchCount: 100,
      currentMatchIndex: 41,
      error: null,
    };
    const getSearchResults = vi.fn(({ offset = 0, limit = 0 } = {}) =>
      Array.from({ length: limit }, (_, index) => ({
        matchIndex: offset + index,
        match: {
          absoluteLineIndex: offset + index + 100,
          index: offset + index,
          startCell: 0,
          endCell: 5,
          text: `error line-${offset + index}`,
        },
        preview: {
          text: `error line-${offset + index}`,
          matchStartCell: 0,
          matchEndCell: 5,
        },
      })),
    );
    const logView = ref<TLogViewHandle | null>({
      getSearchState: () => searchState,
      getSearchResults,
      selectSearchMatch: vi.fn(() => true),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountComposableHarness(logView, {
      pageSize: 20,
      includePreview: true,
      previewWidth: 60,
    });

    try {
      harness.api.setPage(2);

      expect(getSearchResults).toHaveBeenLastCalledWith({
        offset: 40,
        limit: 20,
        includePreview: true,
        previewWidth: 60,
        contextCells: undefined,
      });
      expect(harness.api.state.value.page).toBe(2);
      expect(harness.api.state.value.offset).toBe(40);
      expect(harness.api.state.value.results).toHaveLength(20);
      expect(harness.api.state.value.activeIndex).toBe(1);
      expect(harness.api.state.value.results[1]).toMatchObject({
        matchIndex: 41,
        current: true,
      });
    } finally {
      harness.unmount();
    }
  });

  it("clamps the current page when match count shrinks", async () => {
    const searchState = {
      query: "error",
      status: "done" as const,
      matchCount: 120,
      currentMatchIndex: 110,
      error: null,
    };
    const getSearchResults = vi.fn(({ offset = 0, limit = 0 } = {}) =>
      Array.from(
        { length: Math.min(limit, Math.max(0, searchState.matchCount - offset)) },
        (_, index) => ({
          matchIndex: offset + index,
          match: {
            absoluteLineIndex: offset + index,
            index: offset + index,
            startCell: 0,
            endCell: 5,
            text: `error-${offset + index}`,
          },
          preview: {
            text: `error-${offset + index}`,
            matchStartCell: 0,
            matchEndCell: 5,
          },
        }),
      ),
    );
    const logView = ref<TLogViewHandle | null>({
      getSearchState: () => searchState,
      getSearchResults,
      selectSearchMatch: vi.fn(() => true),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountComposableHarness(logView, { pageSize: 20, includePreview: true });

    try {
      harness.api.setPage(5);
      expect(harness.api.state.value.page).toBe(5);

      searchState.matchCount = 1;
      searchState.currentMatchIndex = 0;
      harness.api.refresh();

      expect(harness.api.state.value.page).toBe(0);
      expect(harness.api.state.value.pageCount).toBe(1);
      expect(harness.api.state.value.results).toHaveLength(1);
      expect(getSearchResults).toHaveBeenLastCalledWith({
        offset: 0,
        limit: 20,
        includePreview: true,
        previewWidth: undefined,
        contextCells: undefined,
      });
    } finally {
      harness.unmount();
    }
  });

  it("clears stale results for regex errors", async () => {
    const getSearchResults = vi.fn();
    const logView = ref<TLogViewHandle | null>({
      getSearchState: () => ({
        query: "[",
        status: "error",
        matchCount: 0,
        currentMatchIndex: -1,
        error: {
          kind: "invalid-regex",
          query: "[",
          flags: "",
          message: "Invalid regular expression",
        },
      }),
      getSearchResults,
      selectSearchMatch: vi.fn(() => false),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountComposableHarness(logView, { pageSize: 20, includePreview: true });

    try {
      expect(harness.api.state.value).toMatchObject({
        status: "error",
        page: 0,
        pageCount: 0,
        matchCount: 0,
        activeIndex: -1,
        currentMatchIndex: -1,
        error: {
          kind: "invalid-regex",
        },
      });
      expect(harness.api.state.value.results).toEqual([]);
      expect(getSearchResults).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });
});

describe("TLogSearchPager", () => {
  it("renders idle, scanning, no-match, done and error states", async () => {
    const state = ref<TLogSearchPagerState | null>(null);
    const mounted = await mountTerminal(
      () =>
        h(TLogSearchPager, {
          x: 0,
          y: 0,
          w: 24,
          state: state.value,
        }),
      24,
      1,
    );

    try {
      expect(rowText(mounted, 0)).toBe("No search");

      state.value = { page: 0, pageCount: 2, matchCount: 42, status: "scanning", error: null };
      await nextTick();
      expect(rowText(mounted, 0)).toBe("Scanning… 42 matches");

      state.value = { page: 0, pageCount: 0, matchCount: 0, status: "done", error: null };
      await nextTick();
      expect(rowText(mounted, 0)).toBe("No matches");

      state.value = { page: 1, pageCount: 13, matchCount: 245, status: "done", error: null };
      await nextTick();
      expect(rowText(mounted, 0)).toBe("◀ 2/13 245 matches ▶");

      state.value = {
        page: 0,
        pageCount: 0,
        matchCount: 0,
        status: "error",
        error: {
          kind: "invalid-regex",
          query: "[",
          flags: "",
          message: "Invalid regular expression",
        },
      };
      await nextTick();
      expect(rowText(mounted, 0)).toBe("Invalid regex");
    } finally {
      mounted.unmount();
    }
  });

  it("emits previousPage, nextPage and pageChange on click", async () => {
    const onPreviousPage = vi.fn();
    const onNextPage = vi.fn();
    const onPageChange = vi.fn();
    const app = createTerminalApp({
      cols: 24,
      rows: 1,
      component: defineComponent({
        name: "TLogSearchPagerClickApp",
        setup() {
          return () =>
            h(TLogSearchPager, {
              x: 0,
              y: 0,
              w: 24,
              state: { page: 1, pageCount: 3, matchCount: 245, status: "done", error: null },
              onPreviousPage,
              onNextPage,
              onPageChange,
            });
        },
      }),
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      const text = rowText(app, 0);
      app.events.dispatch({
        type: "click",
        cellX: text.indexOf("◀"),
        cellY: 0,
        time: Date.now(),
      });
      app.events.dispatch({
        type: "click",
        cellX: text.lastIndexOf("▶"),
        cellY: 0,
        time: Date.now(),
      });
      await nextTick();

      expect(onPreviousPage).toHaveBeenCalledTimes(1);
      expect(onNextPage).toHaveBeenCalledTimes(1);
      expect(onPageChange.mock.calls).toEqual([[{ page: 0 }], [{ page: 2 }]]);
    } finally {
      app.dispose();
    }
  });

  it("supports ArrowLeft, ArrowRight, PageUp and PageDown navigation", async () => {
    const onPreviousPage = vi.fn();
    const onNextPage = vi.fn();
    const onPageChange = vi.fn();
    const app = createTerminalApp({
      cols: 24,
      rows: 1,
      component: defineComponent({
        name: "TLogSearchPagerKeyboardApp",
        setup() {
          return () =>
            h(TLogSearchPager, {
              x: 0,
              y: 0,
              w: 24,
              state: { page: 1, pageCount: 3, matchCount: 245, status: "done", error: null },
              onPreviousPage,
              onNextPage,
              onPageChange,
            });
        },
      }),
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 3, cellY: 0, time: Date.now() } as any);
      app.events.dispatch({ type: "keydown", key: "ArrowLeft", code: "ArrowLeft" } as any);
      app.events.dispatch({ type: "keydown", key: "ArrowRight", code: "ArrowRight" } as any);
      app.events.dispatch({ type: "keydown", key: "PageUp", code: "PageUp" } as any);
      app.events.dispatch({ type: "keydown", key: "PageDown", code: "PageDown" } as any);
      await nextTick();

      expect(onPreviousPage).toHaveBeenCalledTimes(2);
      expect(onNextPage).toHaveBeenCalledTimes(2);
      expect(onPageChange.mock.calls).toEqual([
        [{ page: 0 }],
        [{ page: 2 }],
        [{ page: 0 }],
        [{ page: 2 }],
      ]);
    } finally {
      app.dispose();
    }
  });
});

describe("TLogSearchPager integration", () => {
  it("wires TLogView, useTLogSearchResultsPage and TLogSearchResults together", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const query = ref("error");
    let pageApi: ReturnType<typeof useTLogSearchResultsPage> | null = null;
    const source: TLogDataSource = {
      lineCount: () => 6,
      getLine: (index) =>
        ["line-0", "line-1", "error line-2", "line-3", "error line-4", "line-5"][index] ?? "",
      getLineKey: (index) => `line-${index}`,
    };

    const App = defineComponent({
      name: "TLogSearchPagerIntegrationApp",
      setup() {
        const api = useTLogSearchResultsPage(logView, {
          pageSize: 1,
          includePreview: true,
          previewWidth: 18,
        });
        pageApi = api;

        function refresh(): void {
          api.refresh();
        }

        function onSelect(payload: TLogSearchResultsSelectPayload): void {
          api.selectResult(payload.matchIndex);
        }

        onMounted(() => {
          refresh();
        });

        return () =>
          h("span", [
            h(TLogView, {
              ref: logView,
              x: 0,
              y: 0,
              w: 18,
              h: 4,
              source,
              version: 1,
              searchQuery: query.value,
              searchOptions: { scanBudgetMs: 1000 },
              onSearch: refresh,
              onSearchMatch: refresh,
            }),
            h(TLogSearchResults, {
              x: 19,
              y: 0,
              w: 21,
              h: 1,
              results: api.state.value.results,
              activeIndex: api.state.value.activeIndex,
              onSelect,
            }),
            h(TLogSearchPager, {
              x: 19,
              y: 1,
              w: 21,
              state: api.state.value,
              onPreviousPage: api.previousPage,
              onNextPage: api.nextPage,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 4, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);

      expect(pageApi!.state.value.page).toBe(0);
      expect(pageApi!.state.value.results[0]).toMatchObject({
        matchIndex: 0,
        text: "error line-2",
      });

      const pagerRow = rowText(app, 1);
      app.events.dispatch({
        type: "click",
        cellX: pagerRow.lastIndexOf("▶"),
        cellY: 1,
        time: Date.now(),
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(pageApi!.state.value.page).toBe(1);
      expect(pageApi!.state.value.results[0]).toMatchObject({
        matchIndex: 1,
        text: "error line-4",
      });

      app.events.dispatch({ type: "click", cellX: 19, cellY: 0, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(logView.value!.getSearchState().currentMatchIndex).toBe(1);
      expect(pageApi!.state.value.activeIndex).toBe(0);
      expect(pageApi!.state.value.currentMatchIndex).toBe(1);
      expect(pageApi!.state.value.results[0]).toMatchObject({
        matchIndex: 1,
        current: true,
      });
    } finally {
      app.dispose();
    }
  });
});
