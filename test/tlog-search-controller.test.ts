import type { TLogViewHandle, TLogViewScrollMetrics } from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick, ref } from "./ui-regressions-support.js";
import { useTLogSearchController } from "../src/experimental.js";

async function mountHarness(
  logView: ReturnType<typeof ref<TLogViewHandle | null>>,
  options?: Parameters<typeof useTLogSearchController>[1],
): Promise<{
  api: ReturnType<typeof useTLogSearchController>;
  unmount: () => void;
}> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  let api!: ReturnType<typeof useTLogSearchController>;

  const App = defineComponent({
    name: "UseTLogSearchControllerHarness",
    setup() {
      api = useTLogSearchController(
        logView as Parameters<typeof useTLogSearchController>[0],
        options,
      );
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

function createMetrics(): TLogViewScrollMetrics {
  return {
    scrollTop: 10,
    maxScrollTop: 100,
    viewportRows: 20,
    lineCount: 200,
    firstLineIndex: 10,
    estimatedVisualRowCount: 200,
    visualRowCount: 200,
    measuredVisualRowCount: 200,
    measuredLineCount: 200,
    visualIndexStatus: "exact",
    atTop: false,
    atBottom: false,
  };
}

describe("useTLogSearchController", () => {
  it("derives search bar state, markers, metrics and paged results from the handle", async () => {
    const searchState = {
      query: "error",
      status: "done" as const,
      matchCount: 3,
      currentMatchIndex: 1,
      error: null,
    };
    const logView = ref<TLogViewHandle | null>({
      getSearchState: () => searchState,
      getSearchResults: ({ offset = 0, limit = 20 } = {}) =>
        Array.from(
          { length: Math.min(limit, Math.max(0, searchState.matchCount - offset)) },
          (_, index) => ({
            matchIndex: offset + index,
            match: {
              absoluteLineIndex: 100 + offset + index,
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
      getSearchMarkers: () => [
        {
          matchIndex: 1,
          absoluteLineIndex: 101,
          index: 1,
          visualRow: 11,
          estimated: false,
          current: true,
        },
      ],
      getScrollMetrics: () => createMetrics(),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountHarness(logView, {
      initialQuery: "error",
      pageSize: 2,
      includePreview: true,
    });

    try {
      harness.api.refresh();

      expect(harness.api.searchBarState.value).toMatchObject({
        query: "error",
        mode: "text",
        matchCount: 3,
        currentMatchIndex: 1,
        status: "done",
      });
      expect(harness.api.resultsPage.state.value).toMatchObject({
        page: 0,
        pageCount: 2,
        activeIndex: 1,
      });
      expect(harness.api.markers.value).toEqual([
        expect.objectContaining({
          matchIndex: 1,
          current: true,
        }),
      ]);
      expect(harness.api.metrics.value).toMatchObject({
        scrollTop: 10,
        visualIndexStatus: "exact",
      });
    } finally {
      harness.unmount();
    }
  });

  it("records history and syncs page-local state when navigating matches", async () => {
    const searchState = {
      query: "error",
      status: "done" as const,
      matchCount: 4,
      currentMatchIndex: 0,
      error: null,
    };
    const findNext = vi.fn(() => {
      searchState.currentMatchIndex = 2;
    });
    const logView = ref<TLogViewHandle | null>({
      findNext,
      getSearchState: () => searchState,
      getSearchResults: ({ offset = 0, limit = 20 } = {}) =>
        Array.from(
          { length: Math.min(limit, Math.max(0, searchState.matchCount - offset)) },
          (_, index) => ({
            matchIndex: offset + index,
            match: {
              absoluteLineIndex: 100 + offset + index,
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
      getSearchMarkers: () => [],
      getScrollMetrics: () => createMetrics(),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountHarness(logView, {
      initialQuery: "error",
      pageSize: 1,
      includePreview: true,
    });

    try {
      harness.api.nextMatch();

      expect(findNext).toHaveBeenCalledTimes(1);
      expect(harness.api.searchHistory.value).toEqual(["error"]);
      expect(harness.api.resultsPage.state.value.page).toBe(2);
      expect(harness.api.searchState.value.currentMatchIndex).toBe(2);
    } finally {
      harness.unmount();
    }
  });

  it("saves and reapplies named searches", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const harness = await mountHarness(logView, {
      initialQuery: "error\\s+\\d+",
      initialMode: "regex",
      initialCaseSensitive: true,
    });

    try {
      const saved = harness.api.saveCurrentSearch("Errors");
      expect(saved).toMatchObject({
        label: "Errors",
        query: "error\\s+\\d+",
        mode: "regex",
        caseSensitive: true,
      });

      harness.api.updateQuery("warn");
      harness.api.updateMode("text");
      harness.api.updateCaseSensitive(false);
      expect(harness.api.applySavedSearch(saved!.id)).toBe(true);
      expect(harness.api.query.value).toBe("error\\s+\\d+");
      expect(harness.api.mode.value).toBe("regex");
      expect(harness.api.caseSensitive.value).toBe(true);
      expect(harness.api.searchHistory.value).toEqual(["error\\s+\\d+"]);
    } finally {
      harness.unmount();
    }
  });

  it("clearSearch clears derived paged results immediately without reading stale handle state", async () => {
    const searchState = {
      query: "error",
      status: "done" as const,
      matchCount: 2,
      currentMatchIndex: 0,
      error: null,
    };
    const getSearchResults = vi.fn(() => [
      {
        matchIndex: 0,
        match: {
          absoluteLineIndex: 100,
          index: 0,
          startCell: 0,
          endCell: 5,
          text: "error",
        },
        preview: {
          text: "error line",
          matchStartCell: 0,
          matchEndCell: 5,
        },
      },
    ]);
    const logView = ref<TLogViewHandle | null>({
      getSearchState: () => searchState,
      getSearchResults,
      getSearchMarkers: () => [],
      getScrollMetrics: () => createMetrics(),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountHarness(logView, {
      initialQuery: "error",
      pageSize: 10,
      includePreview: true,
    });

    try {
      harness.api.refresh();
      expect(harness.api.resultsPage.state.value.results).toHaveLength(1);

      getSearchResults.mockClear();
      harness.api.clearSearch();

      expect(harness.api.query.value).toBe("");
      expect(harness.api.searchState.value).toMatchObject({
        query: "",
        status: "idle",
        matchCount: 0,
        currentMatchIndex: -1,
      });
      expect(harness.api.resultsPage.state.value).toMatchObject({
        page: 0,
        pageCount: 0,
        matchCount: 0,
        activeIndex: -1,
        status: "idle",
      });
      expect(harness.api.resultsPage.state.value.results).toEqual([]);
      expect(getSearchResults).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("avoids saved search id collisions with initialSavedSearches", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const harness = await mountHarness(logView, {
      initialQuery: "warn",
      initialSavedSearches: [
        {
          id: "saved-search-0",
          query: "error",
          mode: "text",
        },
        {
          id: "saved-search-1",
          query: "fatal",
          mode: "text",
        },
      ],
    });

    try {
      const saved = harness.api.saveCurrentSearch();
      expect(saved?.id).toBe("saved-search-2");
      expect(harness.api.savedSearches.value.map((entry) => entry.id)).toEqual([
        "saved-search-2",
        "saved-search-0",
        "saved-search-1",
      ]);
    } finally {
      harness.unmount();
    }
  });
});
