import type { Ref } from "vue";
import type { TLogSearchResultItem } from "../components/TLogSearchResults.js";
import type {
  TLogViewHandle,
  TLogViewSearchError,
  TLogViewSearchState,
} from "../components/TLogView.js";
import { ref, watch } from "vue";

const DEFAULT_PAGE_SIZE = 20;

export type UseTLogSearchResultsPageOptions = Readonly<{
  pageSize?: number;
  includePreview?: boolean;
  previewWidth?: number;
  contextCells?: number;
}>;

export type TLogSearchResultsPageState = Readonly<{
  page: number;
  pageSize: number;
  pageCount: number;
  matchCount: number;
  offset: number;
  activeIndex: number;
  currentMatchIndex: number;
  status: TLogViewSearchState["status"];
  error: TLogViewSearchError | null;
  results: readonly TLogSearchResultItem[];
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: number, fallback = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function normalizePageSize(value: number | undefined): number {
  return Math.max(1, normalizeInt(value ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE));
}

function normalizePage(value: number): number {
  return Math.max(0, normalizeInt(value));
}

function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return clamp(normalizePage(page), 0, pageCount - 1);
}

function createEmptyState(
  pageSize: number,
  status: TLogViewSearchState["status"] = "idle",
  error: TLogViewSearchError | null = null,
): TLogSearchResultsPageState {
  return {
    page: 0,
    pageSize,
    pageCount: 0,
    matchCount: 0,
    offset: 0,
    activeIndex: -1,
    currentMatchIndex: -1,
    status,
    error,
    results: [],
  };
}

export function useTLogSearchResultsPage(
  logView: Ref<TLogViewHandle | null>,
  options: UseTLogSearchResultsPageOptions = {},
): {
  state: Ref<TLogSearchResultsPageState>;
  refresh: () => void;
  clear: (status?: TLogViewSearchState["status"], error?: TLogViewSearchError | null) => void;
  setPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  syncPageToCurrentMatch: () => void;
  selectResult: (matchIndex: number) => boolean;
} {
  const pageSize = normalizePageSize(options.pageSize);
  const includePreview = options.includePreview === true;
  const currentPage = ref(0);
  const state = ref<TLogSearchResultsPageState>(createEmptyState(pageSize));

  function clear(
    status: TLogViewSearchState["status"] = "idle",
    error: TLogViewSearchError | null = null,
  ): void {
    currentPage.value = 0;
    state.value = createEmptyState(pageSize, status, error);
  }

  function refresh(): void {
    const handle = logView.value;
    if (!handle) {
      clear();
      return;
    }

    const search = handle.getSearchState();
    const matchCount = Math.max(0, normalizeInt(search.matchCount));
    const pageCount = matchCount > 0 ? Math.ceil(matchCount / pageSize) : 0;
    const page = clampPage(currentPage.value, pageCount);
    const offset = page * pageSize;
    const shouldReadResults = search.status !== "error" && matchCount > 0;
    const rawResults = shouldReadResults
      ? handle.getSearchResults({
          offset,
          limit: pageSize,
          includePreview,
          previewWidth: options.previewWidth,
          contextCells: options.contextCells,
        })
      : [];
    const results = rawResults.map(
      (entry): TLogSearchResultItem => ({
        matchIndex: entry.matchIndex,
        absoluteLineIndex: entry.match.absoluteLineIndex,
        lineIndex: entry.match.index,
        text: entry.preview?.text ?? "",
        matchStartCell: entry.preview?.matchStartCell ?? 0,
        matchEndCell: entry.preview?.matchEndCell ?? 0,
        current: entry.matchIndex === search.currentMatchIndex,
      }),
    );
    const activeIndex =
      search.currentMatchIndex >= offset && search.currentMatchIndex < offset + results.length
        ? search.currentMatchIndex - offset
        : -1;

    currentPage.value = page;
    state.value = {
      page,
      pageSize,
      pageCount,
      matchCount,
      offset,
      activeIndex,
      currentMatchIndex: normalizeInt(search.currentMatchIndex, -1),
      status: search.status,
      error: search.error ?? null,
      results,
    };
  }

  function setPage(page: number): void {
    currentPage.value = normalizePage(page);
    refresh();
  }

  function nextPage(): void {
    setPage(currentPage.value + 1);
  }

  function previousPage(): void {
    setPage(currentPage.value - 1);
  }

  function syncPageToCurrentMatch(): void {
    const currentMatchIndex = logView.value?.getSearchState().currentMatchIndex ?? -1;
    if (currentMatchIndex >= 0) currentPage.value = Math.floor(currentMatchIndex / pageSize);
    refresh();
  }

  function selectResult(matchIndex: number): boolean {
    const handle = logView.value;
    if (!handle) {
      clear();
      return false;
    }

    const normalizedMatchIndex = normalizeInt(matchIndex, -1);
    const selected = handle.selectSearchMatch(normalizedMatchIndex);
    if (!selected) {
      refresh();
      return false;
    }

    currentPage.value = Math.floor(normalizedMatchIndex / pageSize);
    refresh();
    return true;
  }

  watch(
    () => logView.value,
    () => {
      currentPage.value = 0;
      refresh();
    },
    { immediate: true },
  );

  return {
    state,
    refresh,
    clear,
    setPage,
    nextPage,
    previousPage,
    syncPageToCurrentMatch,
    selectResult,
  };
}
