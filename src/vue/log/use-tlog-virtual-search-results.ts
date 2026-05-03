import type { Ref } from "vue";
import type { TLogSearchResultItem } from "../components/TLogSearchResults.js";
import type {
  TLogViewHandle,
  TLogViewSearchError,
  TLogViewSearchState,
} from "../components/TLogView.js";
import { ref, watch } from "vue";

export type UseTLogVirtualSearchResultsOptions = Readonly<{
  includePreview?: boolean;
  previewWidth?: number;
  contextCells?: number;
}>;

export type TLogVirtualSearchResultsState = Readonly<{
  itemCount: number;
  itemVersion: number;
  activeIndex: number;
  currentMatchIndex: number;
  status: TLogViewSearchState["status"];
  error: TLogViewSearchError | null;
}>;

function normalizeInt(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

export function useTLogVirtualSearchResults(
  logView: Ref<TLogViewHandle | null>,
  options: UseTLogVirtualSearchResultsOptions = {},
): {
  state: Ref<TLogVirtualSearchResultsState>;
  refresh: () => void;
  getItem: (index: number) => TLogSearchResultItem | null;
  select: (matchIndex: number) => boolean;
} {
  const state = ref<TLogVirtualSearchResultsState>({
    itemCount: 0,
    itemVersion: 0,
    activeIndex: -1,
    currentMatchIndex: -1,
    status: "idle",
    error: null,
  });
  const cache = new Map<number, TLogSearchResultItem>();

  function clearCache(): void {
    cache.clear();
  }

  function refresh(): void {
    const handle = logView.value;
    const search = handle?.getSearchState();
    const itemCount = Math.max(0, normalizeInt(search?.matchCount ?? 0));
    const currentMatchIndex = normalizeInt(search?.currentMatchIndex ?? -1, -1);
    const nextState: TLogVirtualSearchResultsState = {
      itemCount,
      itemVersion: state.value.itemVersion + 1,
      activeIndex: currentMatchIndex >= 0 ? currentMatchIndex : -1,
      currentMatchIndex,
      status: search?.status ?? "idle",
      error: search?.error ?? null,
    };
    clearCache();
    state.value = nextState;
  }

  function getItem(index: number): TLogSearchResultItem | null {
    const normalizedIndex = normalizeInt(index, -1);
    if (normalizedIndex < 0 || normalizedIndex >= state.value.itemCount) return null;
    const cached = cache.get(normalizedIndex);
    if (cached) return cached;
    const handle = logView.value;
    if (!handle) return null;
    const entry = handle.getSearchResults({
      offset: normalizedIndex,
      limit: 1,
      includePreview: options.includePreview !== false,
      previewWidth: options.previewWidth,
      contextCells: options.contextCells,
    })[0];
    if (!entry) return null;
    const item: TLogSearchResultItem = {
      matchIndex: entry.matchIndex,
      absoluteLineIndex: entry.match.absoluteLineIndex,
      lineIndex: entry.match.index,
      text: entry.preview?.text ?? entry.match.text,
      matchStartCell: entry.preview?.matchStartCell ?? 0,
      matchEndCell: entry.preview?.matchEndCell ?? Math.max(0, entry.match.text.length),
      current: entry.matchIndex === state.value.currentMatchIndex,
    };
    cache.set(normalizedIndex, item);
    return item;
  }

  function select(matchIndex: number): boolean {
    const handle = logView.value;
    if (!handle) return false;
    const selected = handle.selectSearchMatch(normalizeInt(matchIndex, -1));
    refresh();
    return selected;
  }

  watch(() => logView.value, refresh, { immediate: true });

  return {
    state,
    refresh,
    getItem,
    select,
  };
}
