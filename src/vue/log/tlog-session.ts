import type { Ref } from "vue";
import type { TLogViewHandle } from "../components/TLogView.js";
import type { TLogSavedSearch } from "./use-tlog-search-controller.js";
import { ref } from "vue";

export type StorageLike = Readonly<{
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}>;

export type TLogViewSessionState = Readonly<{
  scrollTop: number;
  firstLineIndex: number;
  visualIndexMode: "estimated" | "exact";
  search?: Readonly<{
    query: string;
    mode: "text" | "regex";
    caseSensitive: boolean;
    wholeWord: boolean;
    regexFlags?: string;
    currentMatchIndex: number;
    history?: readonly string[];
    savedSearches?: readonly TLogSavedSearch[];
  }>;
  ui?: Readonly<{
    resultsPage?: number;
    linksPanelActiveIndex?: number;
    wrap?: boolean;
    ansi?: boolean;
    links?: boolean;
    keyboardLinks?: boolean;
  }>;
}>;

export type TLogViewSessionBindings = Readonly<{
  logView: Ref<TLogViewHandle | null>;
  visualIndexMode?: Ref<"estimated" | "exact">;
  wrap?: Ref<boolean>;
  ansi?: Ref<boolean>;
  links?: Ref<boolean>;
  keyboardLinks?: Ref<boolean>;
  search?: Readonly<{
    query: Ref<string>;
    mode: Ref<"text" | "regex">;
    caseSensitive: Ref<boolean>;
    wholeWord: Ref<boolean>;
    regexFlags: Ref<string>;
    searchHistory?: Ref<readonly string[]>;
    savedSearches?: Ref<readonly TLogSavedSearch[]>;
    updateQuery: (value: string) => void;
    updateMode: (value: "text" | "regex") => void;
    updateCaseSensitive: (value: boolean) => void;
    updateWholeWord: (value: boolean) => void;
    updateRegexFlags: (value: string) => void;
    setSearchHistory?: (value: readonly string[]) => void;
    setSavedSearches?: (value: readonly TLogSavedSearch[]) => void;
    clearSearch: () => void;
    selectMatch: (matchIndex: number) => boolean;
    resultsPage?: Readonly<{
      state: Ref<Readonly<{ page: number }>>;
      setPage: (page: number) => void;
    }>;
  }>;
  linkController?: Readonly<{
    activeIndex: Ref<number>;
    focusVisibleLink: (visibleIndex: number) => boolean;
    clearFocus: () => void;
  }>;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function serializeTLogViewSessionState(state: TLogViewSessionState): string {
  return JSON.stringify(state);
}

export function deserializeTLogViewSessionState(
  value: string | null | undefined,
): TLogViewSessionState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as TLogViewSessionState;
    if (typeof parsed !== "object" || parsed == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createTLogViewSessionStore(
  options: {
    storageKey?: string;
    storage?: StorageLike | null;
  } = {},
): {
  state: Ref<TLogViewSessionState | null>;
  load: () => TLogViewSessionState | null;
  save: (state: TLogViewSessionState) => void;
  clear: () => void;
} {
  const storageKey = options.storageKey ?? "@simon_he/vue-tui:tlog-session";
  const storage =
    options.storage ??
    ((globalThis as { localStorage?: StorageLike }).localStorage as StorageLike | undefined) ??
    null;
  const state = ref<TLogViewSessionState | null>(null);

  function load(): TLogViewSessionState | null {
    const next = deserializeTLogViewSessionState(storage?.getItem(storageKey));
    state.value = next;
    return next;
  }

  function save(nextState: TLogViewSessionState): void {
    state.value = nextState;
    storage?.setItem(storageKey, serializeTLogViewSessionState(nextState));
  }

  function clear(): void {
    state.value = null;
    storage?.removeItem(storageKey);
  }

  return {
    state,
    load,
    save,
    clear,
  };
}

export function captureTLogViewSessionState(
  bindings: TLogViewSessionBindings,
): TLogViewSessionState | null {
  const metrics = bindings.logView.value?.getScrollMetrics();
  if (!metrics) return null;

  return {
    scrollTop: metrics.scrollTop,
    firstLineIndex: metrics.firstLineIndex,
    visualIndexMode: bindings.visualIndexMode?.value ?? "estimated",
    search: bindings.search
      ? {
          query: bindings.search.query.value,
          mode: bindings.search.mode.value,
          caseSensitive: bindings.search.caseSensitive.value,
          wholeWord: bindings.search.wholeWord.value,
          regexFlags: bindings.search.regexFlags.value || undefined,
          currentMatchIndex: bindings.logView.value?.getSearchState().currentMatchIndex ?? -1,
          history: bindings.search.searchHistory?.value ?? [],
          savedSearches: bindings.search.savedSearches?.value ?? [],
        }
      : undefined,
    ui: {
      resultsPage: bindings.search?.resultsPage?.state.value.page,
      linksPanelActiveIndex: bindings.linkController?.activeIndex.value,
      wrap: bindings.wrap?.value,
      ansi: bindings.ansi?.value,
      links: bindings.links?.value,
      keyboardLinks: bindings.keyboardLinks?.value,
    },
  };
}

export function restoreTLogViewSessionState(
  bindings: TLogViewSessionBindings,
  state: TLogViewSessionState | null,
): boolean {
  if (!state) return false;

  if (bindings.visualIndexMode) bindings.visualIndexMode.value = state.visualIndexMode;
  if (state.ui) {
    if (bindings.wrap && state.ui.wrap != null) bindings.wrap.value = state.ui.wrap;
    if (bindings.ansi && state.ui.ansi != null) bindings.ansi.value = state.ui.ansi;
    if (bindings.links && state.ui.links != null) bindings.links.value = state.ui.links;
    if (bindings.keyboardLinks && state.ui.keyboardLinks != null)
      bindings.keyboardLinks.value = state.ui.keyboardLinks;
  }

  if (bindings.search && state.search) {
    bindings.search.updateQuery(state.search.query);
    bindings.search.updateMode(state.search.mode);
    bindings.search.updateCaseSensitive(state.search.caseSensitive);
    bindings.search.updateWholeWord(state.search.wholeWord);
    bindings.search.updateRegexFlags(state.search.regexFlags ?? "");
    bindings.search.setSearchHistory?.(state.search.history ?? []);
    bindings.search.setSavedSearches?.(state.search.savedSearches ?? []);
    if (state.ui?.resultsPage != null) bindings.search.resultsPage?.setPage(state.ui.resultsPage);
    if (!state.search.query) bindings.search.clearSearch();
  }

  const handle = bindings.logView.value;
  const metrics = handle?.getScrollMetrics();
  if (handle && metrics) {
    const firstLineDelta = metrics.firstLineIndex - state.firstLineIndex;
    const restoredScrollTop = clamp(
      state.scrollTop - Math.max(0, firstLineDelta),
      0,
      metrics.maxScrollTop,
    );
    handle.scrollToVisualRow(restoredScrollTop);
    if ((state.search?.currentMatchIndex ?? -1) >= 0) {
      bindings.search?.selectMatch(state.search!.currentMatchIndex);
    }
  }

  if (state.ui?.linksPanelActiveIndex != null) {
    const restored =
      bindings.linkController?.focusVisibleLink(state.ui.linksPanelActiveIndex) === true;
    if (!restored && state.ui.linksPanelActiveIndex < 0) bindings.linkController?.clearFocus();
  }

  return true;
}
