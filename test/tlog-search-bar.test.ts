import type { TLogDataSource, TLogSearchBarState, TLogViewHandle } from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/index.js";
import { TLogSearchBar, TLogView } from "../src/experimental.js";
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

function createState(overrides: Partial<TLogSearchBarState> = {}): TLogSearchBarState {
  return {
    query: "",
    mode: "text",
    caseSensitive: false,
    wholeWord: false,
    status: "idle",
    matchCount: 0,
    currentMatchIndex: -1,
    error: null,
    ...overrides,
  };
}

describe("TLogSearchBar", () => {
  it("renders idle, scanning, done and error states", async () => {
    const state = ref<TLogSearchBarState>(createState());
    const mounted = await mountTerminal(
      () =>
        h(TLogSearchBar, {
          x: 0,
          y: 0,
          w: 32,
          state: state.value,
        }),
      32,
      1,
    );

    try {
      expect(rowText(mounted, 0)).toContain("Search…");

      state.value = createState({ query: "error", status: "scanning", matchCount: 5 });
      await nextTick();
      expect(rowText(mounted, 0)).toContain("Scanning… 5");

      state.value = createState({
        query: "error",
        status: "done",
        matchCount: 42,
        currentMatchIndex: 2,
      });
      await nextTick();
      expect(rowText(mounted, 0)).toContain("3/42");

      state.value = createState({
        query: "[",
        mode: "regex",
        status: "error",
        error: {
          kind: "invalid-regex",
          query: "[",
          flags: "g",
          message: "Invalid regular expression",
        },
      });
      await nextTick();
      expect(rowText(mounted, 0)).toContain("Invalid regex");
    } finally {
      mounted.unmount();
    }
  });

  it("emits controlled query updates while typing", async () => {
    const onUpdateQuery = vi.fn();
    const onUpdate = vi.fn();
    const state = ref<TLogSearchBarState>(createState());
    const app = createTerminalApp({
      cols: 24,
      rows: 1,
      component: defineComponent({
        name: "TLogSearchBarTypingApp",
        setup() {
          function updateQuery(query: string): void {
            state.value = createState({ ...state.value, query });
            onUpdateQuery(query);
          }

          return () =>
            h(TLogSearchBar, {
              x: 0,
              y: 0,
              w: 24,
              state: state.value,
              onUpdate,
              "onUpdate:query": updateQuery,
            });
        },
      }),
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 13, cellY: 0, time: Date.now() } as any);
      app.events.dispatch({ type: "keydown", key: "E", code: "KeyE", time: Date.now() } as any);
      await nextTick();

      expect(onUpdateQuery).toHaveBeenCalledWith("E");
      expect(onUpdate).toHaveBeenCalledWith({
        query: "E",
        mode: "text",
        caseSensitive: false,
        wholeWord: false,
      });
      expect(state.value.query).toBe("E");
    } finally {
      app.dispose();
    }
  });

  it("supports Backspace, Delete and cursor movement", async () => {
    const state = ref<TLogSearchBarState>(createState());
    const app = createTerminalApp({
      cols: 24,
      rows: 1,
      component: defineComponent({
        name: "TLogSearchBarEditingApp",
        setup() {
          return () =>
            h(TLogSearchBar, {
              x: 0,
              y: 0,
              w: 24,
              state: state.value,
              "onUpdate:query": (query: string) => {
                state.value = createState({ ...state.value, query });
              },
            });
        },
      }),
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 13, cellY: 0, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();

      for (const key of "ERROR") {
        app.events.dispatch({
          type: "keydown",
          key,
          code: `Key${key}`,
          time: Date.now(),
        } as any);
        await nextTick();
        app.scheduler.flushNow();
      }

      app.events.dispatch({ type: "keydown", key: "Backspace", code: "Backspace" } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(state.value.query).toBe("ERRO");

      app.events.dispatch({ type: "keydown", key: "ArrowLeft", code: "ArrowLeft" } as any);
      app.events.dispatch({ type: "keydown", key: "Delete", code: "Delete" } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(state.value.query).toBe("ERR");
    } finally {
      app.dispose();
    }
  });

  it("emits next, previous and clear from keyboard shortcuts", async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onClear = vi.fn();
    const app = createTerminalApp({
      cols: 24,
      rows: 1,
      component: defineComponent({
        name: "TLogSearchBarNavigationApp",
        setup() {
          return () =>
            h(TLogSearchBar, {
              x: 0,
              y: 0,
              w: 24,
              state: createState({
                query: "error",
                status: "done",
                matchCount: 2,
                currentMatchIndex: 0,
              }),
              onPrevious,
              onNext,
              onClear,
            });
        },
      }),
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 13, cellY: 0, time: Date.now() } as any);
      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter" } as any);
      app.events.dispatch({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        shiftKey: true,
      } as any);
      app.events.dispatch({ type: "keydown", key: "Escape", code: "Escape" } as any);
      await nextTick();

      expect(onNext).toHaveBeenCalledWith({ direction: "next" });
      expect(onPrevious).toHaveBeenCalledWith({ direction: "previous" });
      expect(onClear).toHaveBeenCalledTimes(1);
    } finally {
      app.dispose();
    }
  });

  it("emits toggle updates from click targets", async () => {
    const onUpdateMode = vi.fn();
    const onUpdateCaseSensitive = vi.fn();
    const onUpdateWholeWord = vi.fn();
    const state = ref<TLogSearchBarState>(createState());
    const app = createTerminalApp({
      cols: 32,
      rows: 1,
      component: defineComponent({
        name: "TLogSearchBarToggleApp",
        setup() {
          return () =>
            h(TLogSearchBar, {
              x: 0,
              y: 0,
              w: 32,
              state: state.value,
              "onUpdate:mode": (mode: "text" | "regex") => {
                state.value = createState({ ...state.value, mode });
                onUpdateMode(mode);
              },
              "onUpdate:caseSensitive": (caseSensitive: boolean) => {
                state.value = createState({ ...state.value, caseSensitive });
                onUpdateCaseSensitive(caseSensitive);
              },
              "onUpdate:wholeWord": (wholeWord: boolean) => {
                state.value = createState({ ...state.value, wholeWord });
                onUpdateWholeWord(wholeWord);
              },
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
        cellX: text.indexOf("[Aa]"),
        cellY: 0,
        time: Date.now(),
      } as any);
      app.events.dispatch({
        type: "click",
        cellX: text.indexOf("[W]"),
        cellY: 0,
        time: Date.now(),
      } as any);
      app.events.dispatch({
        type: "click",
        cellX: text.indexOf("[T]"),
        cellY: 0,
        time: Date.now(),
      } as any);
      await nextTick();

      expect(onUpdateCaseSensitive).toHaveBeenCalledWith(true);
      expect(onUpdateWholeWord).toHaveBeenCalledWith(true);
      expect(onUpdateMode).toHaveBeenCalledWith("regex");
    } finally {
      app.dispose();
    }
  });
});

describe("TLogSearchBar integration", () => {
  it("wires controlled query state to TLogView search and navigation", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const query = ref("");
    const mode = ref<"text" | "regex">("text");
    const caseSensitive = ref(false);
    const wholeWord = ref(false);
    const searchState = ref(createState());
    const source: TLogDataSource = {
      lineCount: () => 6,
      getLine: (index) =>
        ["line-0", "line-1", "error line-2", "line-3", "error line-4", "line-5"][index] ?? "",
      getLineKey: (index) => `line-${index}`,
    };

    const App = defineComponent({
      name: "TLogSearchBarIntegrationApp",
      setup() {
        function refresh(): void {
          const next = logView.value?.getSearchState();
          searchState.value = createState({
            query: query.value,
            mode: mode.value,
            caseSensitive: caseSensitive.value,
            wholeWord: wholeWord.value,
            status: next?.status ?? "idle",
            matchCount: next?.matchCount ?? 0,
            currentMatchIndex: next?.currentMatchIndex ?? -1,
            error: next?.error ?? null,
          });
        }

        onMounted(refresh);

        return () =>
          h("span", [
            h(TLogSearchBar, {
              x: 0,
              y: 0,
              w: 40,
              state: createState({
                query: query.value,
                mode: mode.value,
                caseSensitive: caseSensitive.value,
                wholeWord: wholeWord.value,
                status: searchState.value.status,
                matchCount: searchState.value.matchCount,
                currentMatchIndex: searchState.value.currentMatchIndex,
                error: searchState.value.error,
              }),
              "onUpdate:query": (nextQuery: string) => {
                query.value = nextQuery;
              },
              "onUpdate:mode": (nextMode: "text" | "regex") => {
                mode.value = nextMode;
              },
              "onUpdate:caseSensitive": (nextCaseSensitive: boolean) => {
                caseSensitive.value = nextCaseSensitive;
              },
              "onUpdate:wholeWord": (nextWholeWord: boolean) => {
                wholeWord.value = nextWholeWord;
              },
              onPrevious: () => logView.value?.findPrevious(),
              onNext: () => logView.value?.findNext(),
              onClear: () => {
                query.value = "";
              },
            }),
            h(TLogView, {
              ref: logView,
              x: 0,
              y: 1,
              w: 20,
              h: 4,
              source,
              version: 1,
              searchQuery: query.value,
              searchOptions: {
                mode: mode.value,
                caseSensitive: caseSensitive.value,
                wholeWord: wholeWord.value,
                scanBudgetMs: 1000,
              },
              onSearch: refresh,
              onSearchMatch: refresh,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 5, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 13, cellY: 0, time: Date.now() } as any);
      for (const key of "error") {
        app.events.dispatch({
          type: "keydown",
          key,
          code: `Key${key.toUpperCase()}`,
          time: Date.now(),
        } as any);
        await nextTick();
      }
      await flushSearch(app, logView.value!);

      expect(logView.value!.getSearchState().matchCount).toBe(2);
      expect(rowText(app, 0)).toContain("0/2");

      app.events.dispatch({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        time: Date.now(),
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(logView.value!.getSearchState().currentMatchIndex).toBe(0);
      expect(rowText(app, 0)).toContain("1/2");

      app.events.dispatch({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        time: Date.now(),
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(logView.value!.getSearchState().currentMatchIndex).toBe(1);
      expect(rowText(app, 0)).toContain("2/2");
    } finally {
      app.dispose();
    }
  });

  it("shows regex errors pushed from TLogView", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const query = ref("[");
    const searchState = ref(createState({ query: "[", mode: "regex", status: "idle" }));
    const source: TLogDataSource = {
      lineCount: () => 2,
      getLine: (index) => ["error line-0", "line-1"][index] ?? "",
      getLineKey: (index) => `line-${index}`,
    };

    const App = defineComponent({
      name: "TLogSearchBarRegexErrorApp",
      setup() {
        function refresh(): void {
          const next = logView.value?.getSearchState();
          searchState.value = createState({
            query: query.value,
            mode: "regex",
            status: next?.status ?? "idle",
            matchCount: next?.matchCount ?? 0,
            currentMatchIndex: next?.currentMatchIndex ?? -1,
            error: next?.error ?? null,
          });
        }

        onMounted(refresh);

        return () =>
          h("span", [
            h(TLogSearchBar, {
              x: 0,
              y: 0,
              w: 32,
              state: searchState.value,
            }),
            h(TLogView, {
              ref: logView,
              x: 0,
              y: 1,
              w: 20,
              h: 2,
              source,
              version: 1,
              searchQuery: query.value,
              searchOptions: { mode: "regex", scanBudgetMs: 1000 },
              onSearch: refresh,
              onSearchMatch: refresh,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 32, rows: 3, component: App });
    try {
      app.mount();
      await flushSearch(app, logView.value!);
      expect(rowText(app, 0)).toContain("Invalid regex");
    } finally {
      app.dispose();
    }
  });
});
