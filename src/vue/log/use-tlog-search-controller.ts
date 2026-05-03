import type { Ref } from "vue";
import type { TLogSearchBarMode, TLogSearchBarState } from "../components/TLogSearchBar.js";
import type {
  TLogViewHandle,
  TLogViewScrollMetrics,
  TLogViewSearchMarker,
  TLogViewSearchState,
} from "../components/TLogView.js";
import type { UseTLogSearchResultsPageOptions } from "./use-tlog-search-results-page.js";
import { computed, ref, watch } from "vue";
import { useTLogSearchResultsPage } from "./use-tlog-search-results-page.js";

const DEFAULT_HISTORY_LIMIT = 20;

export type TLogSavedSearch = Readonly<{
  id: string;
  label?: string;
  query: string;
  mode: TLogSearchBarMode;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regexFlags?: string;
}>;

export type UseTLogSearchControllerOptions = Readonly<
  UseTLogSearchResultsPageOptions & {
    initialQuery?: string;
    initialMode?: TLogSearchBarMode;
    initialCaseSensitive?: boolean;
    initialWholeWord?: boolean;
    initialRegexFlags?: string;
    maxHistory?: number;
    initialSavedSearches?: readonly TLogSavedSearch[];
  }
>;

function normalizeHistoryLimit(value: number | undefined): number {
  const n = Math.floor(Number(value ?? DEFAULT_HISTORY_LIMIT));
  if (!Number.isFinite(n)) return DEFAULT_HISTORY_LIMIT;
  return Math.max(1, n);
}

function normalizeSearchState(query = ""): TLogViewSearchState {
  return {
    query,
    status: query ? "done" : "idle",
    matchCount: 0,
    currentMatchIndex: -1,
    error: null,
  };
}

function sameSavedSearch(a: TLogSavedSearch, b: Omit<TLogSavedSearch, "id">): boolean {
  return (
    a.query === b.query &&
    a.mode === b.mode &&
    Boolean(a.caseSensitive) === Boolean(b.caseSensitive) &&
    Boolean(a.wholeWord) === Boolean(b.wholeWord) &&
    (a.regexFlags ?? "") === (b.regexFlags ?? "")
  );
}

export function useTLogSearchController(
  logView: Ref<TLogViewHandle | null>,
  options: UseTLogSearchControllerOptions = {},
): {
  query: Ref<string>;
  mode: Ref<TLogSearchBarMode>;
  caseSensitive: Ref<boolean>;
  wholeWord: Ref<boolean>;
  regexFlags: Ref<string>;
  searchState: Ref<TLogViewSearchState>;
  searchBarState: Ref<TLogSearchBarState>;
  resultsPage: ReturnType<typeof useTLogSearchResultsPage>;
  markers: Ref<readonly TLogViewSearchMarker[]>;
  metrics: Ref<TLogViewScrollMetrics | null>;
  searchHistory: Ref<readonly string[]>;
  savedSearches: Ref<readonly TLogSavedSearch[]>;
  updateQuery: (value: string) => void;
  updateMode: (value: TLogSearchBarMode) => void;
  updateCaseSensitive: (value: boolean) => void;
  updateWholeWord: (value: boolean) => void;
  updateRegexFlags: (value: string) => void;
  nextMatch: () => void;
  previousMatch: () => void;
  clearSearch: () => void;
  selectMatch: (matchIndex: number) => boolean;
  refresh: () => void;
  saveCurrentSearch: (label?: string) => TLogSavedSearch | null;
  applySavedSearch: (id: string) => boolean;
} {
  const query = ref(options.initialQuery ?? "");
  const mode = ref<TLogSearchBarMode>(options.initialMode === "regex" ? "regex" : "text");
  const caseSensitive = ref(options.initialCaseSensitive === true);
  const wholeWord = ref(options.initialWholeWord === true);
  const regexFlags = ref(options.initialRegexFlags ?? "");
  const searchState = ref<TLogViewSearchState>(normalizeSearchState(query.value));
  const markers = ref<readonly TLogViewSearchMarker[]>([]);
  const metrics = ref<TLogViewScrollMetrics | null>(null);
  const searchHistory = ref<readonly string[]>([]);
  const savedSearches = ref<readonly TLogSavedSearch[]>(options.initialSavedSearches ?? []);
  const historyLimit = normalizeHistoryLimit(options.maxHistory);
  const resultsPage = useTLogSearchResultsPage(logView, options);
  let nextSavedSearchId = 0;

  const searchBarState = computed<TLogSearchBarState>(() => ({
    query: query.value,
    mode: mode.value,
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
    status: searchState.value.status,
    matchCount: searchState.value.matchCount,
    currentMatchIndex: searchState.value.currentMatchIndex,
    error: searchState.value.error ?? null,
  }));

  function recordHistory(value = query.value): void {
    const normalized = String(value ?? "").trim();
    if (!normalized) return;
    searchHistory.value = [
      normalized,
      ...searchHistory.value.filter((entry) => entry !== normalized),
    ].slice(0, historyLimit);
  }

  function refresh(): void {
    const handle = logView.value;
    if (!handle) {
      searchState.value = normalizeSearchState(query.value);
      markers.value = [];
      metrics.value = null;
      resultsPage.refresh();
      return;
    }

    const next = handle.getSearchState();
    searchState.value = {
      query: query.value,
      status: next.status,
      matchCount: next.matchCount,
      currentMatchIndex: next.currentMatchIndex,
      error: next.error ?? null,
    };
    markers.value = handle.getSearchMarkers();
    metrics.value = handle.getScrollMetrics();
    resultsPage.refresh();
  }

  function updateQuery(value: string): void {
    query.value = String(value ?? "");
  }

  function updateMode(value: TLogSearchBarMode): void {
    mode.value = value === "regex" ? "regex" : "text";
  }

  function updateCaseSensitive(value: boolean): void {
    caseSensitive.value = value === true;
  }

  function updateWholeWord(value: boolean): void {
    wholeWord.value = value === true;
  }

  function updateRegexFlags(value: string): void {
    regexFlags.value = String(value ?? "");
  }

  function nextMatch(): void {
    recordHistory();
    logView.value?.findNext();
    resultsPage.syncPageToCurrentMatch();
    refresh();
  }

  function previousMatch(): void {
    recordHistory();
    logView.value?.findPrevious();
    resultsPage.syncPageToCurrentMatch();
    refresh();
  }

  function clearSearch(): void {
    query.value = "";
    searchState.value = normalizeSearchState("");
    markers.value = [];
    resultsPage.refresh();
  }

  function selectMatch(matchIndex: number): boolean {
    recordHistory();
    const selected = resultsPage.selectResult(matchIndex);
    refresh();
    return selected;
  }

  function saveCurrentSearch(label?: string): TLogSavedSearch | null {
    const normalizedQuery = query.value.trim();
    if (!normalizedQuery) return null;

    recordHistory(normalizedQuery);
    const candidate = {
      label: label?.trim() || undefined,
      query: normalizedQuery,
      mode: mode.value,
      caseSensitive: caseSensitive.value,
      wholeWord: wholeWord.value,
      regexFlags: regexFlags.value || undefined,
    } satisfies Omit<TLogSavedSearch, "id">;
    const existing = savedSearches.value.find((entry) => sameSavedSearch(entry, candidate));
    if (existing) {
      const updated =
        candidate.label && candidate.label !== existing.label
          ? { ...existing, label: candidate.label }
          : existing;
      savedSearches.value = [
        updated,
        ...savedSearches.value.filter((entry) => entry.id !== existing.id),
      ];
      return updated;
    }

    const savedSearch: TLogSavedSearch = {
      id: `saved-search-${nextSavedSearchId++}`,
      ...candidate,
    };
    savedSearches.value = [savedSearch, ...savedSearches.value];
    return savedSearch;
  }

  function applySavedSearch(id: string): boolean {
    const match = savedSearches.value.find((entry) => entry.id === id);
    if (!match) return false;
    query.value = match.query;
    mode.value = match.mode;
    caseSensitive.value = match.caseSensitive === true;
    wholeWord.value = match.wholeWord === true;
    regexFlags.value = match.regexFlags ?? "";
    recordHistory(match.query);
    return true;
  }

  watch(
    () => logView.value,
    () => {
      refresh();
    },
    { immediate: true },
  );

  return {
    query,
    mode,
    caseSensitive,
    wholeWord,
    regexFlags,
    searchState,
    searchBarState,
    resultsPage,
    markers,
    metrics,
    searchHistory,
    savedSearches,
    updateQuery,
    updateMode,
    updateCaseSensitive,
    updateWholeWord,
    updateRegexFlags,
    nextMatch,
    previousMatch,
    clearSearch,
    selectMatch,
    refresh,
    saveCurrentSearch,
    applySavedSearch,
  };
}
