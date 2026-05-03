import type { TLogViewHandle, TLogViewScrollMetrics } from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  captureTLogViewSessionState,
  createTLogViewSessionStore,
  restoreTLogViewSessionState,
} from "../src/experimental.js";

function createMetrics(overrides: Partial<TLogViewScrollMetrics> = {}): TLogViewScrollMetrics {
  return {
    scrollTop: 20,
    maxScrollTop: 200,
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
    ...overrides,
  };
}

describe("tlog session helpers", () => {
  it("saves, loads, clears, and tolerates invalid storage state", () => {
    const storage = new Map<string, string>();
    const store = createTLogViewSessionStore({
      storageKey: "lab",
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
        removeItem: (key) => {
          storage.delete(key);
        },
      },
    });

    const state = {
      scrollTop: 10,
      firstLineIndex: 5,
      visualIndexMode: "exact" as const,
    };

    store.save(state);
    expect(store.load()).toEqual(state);

    storage.set("lab", "{");
    expect(store.load()).toBeNull();

    store.clear();
    expect(storage.has("lab")).toBe(false);
    expect(store.state.value).toBeNull();
  });

  it("captures and restores scroll, search, ui state, and clamps retention shifts", () => {
    const scrollToVisualRow = vi.fn();
    const selectMatch = vi.fn(() => true);
    const focusVisibleLink = vi.fn(() => true);
    const clearFocus = vi.fn();
    const handle = {
      getScrollMetrics: () => createMetrics(),
      getSearchState: () => ({
        query: "ERROR",
        status: "done" as const,
        matchCount: 4,
        currentMatchIndex: 2,
        error: null,
      }),
      scrollToVisualRow,
      selectSearchMatch: selectMatch,
    } as Partial<TLogViewHandle> as TLogViewHandle;
    const logView = ref<TLogViewHandle | null>(handle);

    const query = ref("ERROR");
    const mode = ref<"text" | "regex">("regex");
    const caseSensitive = ref(true);
    const wholeWord = ref(false);
    const regexFlags = ref("gi");
    const searchHistory = ref<readonly string[]>(["ERROR"]);
    const savedSearches = ref<readonly { id: string; query: string; mode: "text" }[]>([
      {
        id: "saved-1",
        query: "ERROR",
        mode: "text" as const,
      },
    ]);
    const resultsPage = {
      state: ref({ page: 3 }),
      setPage: vi.fn(),
    };

    const bindings = {
      logView,
      visualIndexMode: ref<"estimated" | "exact">("exact"),
      wrap: ref(true),
      ansi: ref(true),
      links: ref(true),
      keyboardLinks: ref(true),
      search: {
        query,
        mode,
        caseSensitive,
        wholeWord,
        regexFlags,
        searchHistory,
        savedSearches,
        updateQuery: (value: string) => {
          query.value = value;
        },
        updateMode: (value: "text" | "regex") => {
          mode.value = value;
        },
        updateCaseSensitive: (value: boolean) => {
          caseSensitive.value = value;
        },
        updateWholeWord: (value: boolean) => {
          wholeWord.value = value;
        },
        updateRegexFlags: (value: string) => {
          regexFlags.value = value;
        },
        setSearchHistory(value: readonly string[]) {
          searchHistory.value = value;
        },
        setSavedSearches(value: readonly any[]) {
          savedSearches.value = value;
        },
        clearSearch: vi.fn(),
        selectMatch,
        resultsPage,
      },
      linkController: {
        activeIndex: ref(1),
        focusVisibleLink,
        clearFocus,
      },
    } as const;

    const captured = captureTLogViewSessionState(bindings);
    expect(captured).toMatchObject({
      scrollTop: 20,
      firstLineIndex: 10,
      visualIndexMode: "exact",
      search: {
        query: "ERROR",
        mode: "regex",
        regexFlags: "gi",
        currentMatchIndex: 2,
      },
      ui: {
        resultsPage: 3,
        linksPanelActiveIndex: 1,
      },
    });

    const restored = restoreTLogViewSessionState(bindings, {
      scrollTop: 20,
      firstLineIndex: 5,
      visualIndexMode: "estimated",
      search: {
        query: "WARN",
        mode: "text",
        caseSensitive: false,
        wholeWord: true,
        currentMatchIndex: 3,
        history: ["WARN"],
        savedSearches: [
          {
            id: "saved-2",
            query: "WARN",
            mode: "text",
          },
        ],
      },
      ui: {
        resultsPage: 1,
        linksPanelActiveIndex: 2,
        wrap: false,
        ansi: false,
        links: false,
        keyboardLinks: false,
      },
    });

    expect(restored).toBe(true);
    expect(bindings.visualIndexMode.value).toBe("estimated");
    expect(bindings.wrap.value).toBe(false);
    expect(bindings.ansi.value).toBe(false);
    expect(bindings.links.value).toBe(false);
    expect(bindings.keyboardLinks.value).toBe(false);
    expect(query.value).toBe("WARN");
    expect(mode.value).toBe("text");
    expect(caseSensitive.value).toBe(false);
    expect(wholeWord.value).toBe(true);
    expect(searchHistory.value).toEqual(["WARN"]);
    expect(savedSearches.value).toEqual([
      {
        id: "saved-2",
        query: "WARN",
        mode: "text",
      },
    ]);
    expect(resultsPage.setPage).toHaveBeenCalledWith(1);
    expect(scrollToVisualRow).toHaveBeenCalledWith(15);
    expect(selectMatch).toHaveBeenCalledWith(3);
    expect(focusVisibleLink).toHaveBeenCalledWith(2);
    expect(clearFocus).not.toHaveBeenCalled();
  });
});
