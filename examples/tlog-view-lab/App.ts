import type {
  AppendOnlyLogStore,
  TLogLinkAction,
  TLogLinkPanelItem,
  TLogIndexedLink,
  TLogIndexStatus,
  TLogMinimapDensityBucket,
  TLogMinimapMarker,
  TLogScrollbarMarker,
  TLogViewHandle,
  TLogViewScrollMetrics,
  TLogViewSearchMarker,
  TLogViewSearchMode,
  TLogUiPreset,
} from "../../src/experimental.js";
import type { PropType, Ref } from "vue";
import { computed, defineComponent, h, nextTick, ref, watch, watchEffect } from "vue";
import { TText, TView } from "../../src/index.js";
import {
  TLogVirtualLinksPanel,
  TLogVirtualSearchResults,
  TLogLinksPanel,
  TLogMinimap,
  TLogScrollbar,
  TLogSearchBar,
  TLogSearchPager,
  TLogView,
  captureTLogViewSessionState,
  createTLogLineMatcherPlugin,
  createTLogLinkActionPlugin,
  createAppendOnlyLogStore,
  createTLogViewSessionStore,
  dispatchTLogPluginLinkAction,
  handleTLogKeymapEvent,
  resolveTLogLinksPanelTheme,
  resolveTLogMinimapTheme,
  resolveTLogScrollbarTheme,
  resolveTLogSearchBarTheme,
  resolveTLogSearchPagerTheme,
  resolveTLogSearchResultsTheme,
  resolveTLogViewTheme,
  restoreTLogViewSessionState,
  tlogDarkPreset,
  tlogDefaultPreset,
  tlogHighContrastPreset,
  useTLogLinkController,
  useTLogRetainedIndex,
  useTLogSearchController,
  useTLogVirtualSearchResults,
} from "../../src/experimental.js";

export const TLOG_VIEW_LAB_LAYOUT = Object.freeze({
  cols: 110,
  rows: 32,
  searchBar: { x: 0, y: 0, w: 102 },
  logView: { x: 0, y: 1, w: 75, h: 22 },
  resultsLabel: { x: 76, y: 1, w: 26 },
  results: { x: 76, y: 2, w: 26, h: 8 },
  pagerLabel: { x: 76, y: 10, w: 26 },
  pager: { x: 76, y: 11, w: 26 },
  linksLabel: { x: 76, y: 13, w: 26 },
  links: { x: 76, y: 14, w: 26, h: 9 },
  minimapLabel: { x: 103, y: 0, w: 7 },
  scrollbar: { x: 103, y: 1, h: 22 },
  minimap: { x: 105, y: 1, w: 3, h: 22 },
  footer: { x: 0, y: 24, w: 109, h: 8 },
});

type LabPointerCell = Readonly<{
  x: number;
  y: number;
}>;

export type TLogViewLabApi = Readonly<{
  store: AppendOnlyLogStore;
  logView: Ref<TLogViewHandle | null>;
  wrap: Ref<boolean>;
  ansi: Ref<boolean>;
  links: Ref<boolean>;
  keyboardLinks: Ref<boolean>;
  visualIndexMode: Ref<"estimated" | "exact">;
  preset: Ref<TLogUiPreset>;
  search: ReturnType<typeof useTLogSearchController>;
  virtualResults: ReturnType<typeof useTLogVirtualSearchResults>;
  linkController: ReturnType<typeof useTLogLinkController>;
  retainedIndex: Readonly<{
    status: Ref<TLogIndexStatus>;
    links: Ref<readonly TLogIndexedLink[]>;
    density: Ref<readonly TLogMinimapDensityBucket[]>;
  }>;
  recentEvents: Ref<readonly string[]>;
  lastLinkAction: Ref<TLogLinkAction | null>;
  lastSearchSelection: Ref<number | null>;
  lastMarkerSelection: Ref<number | null>;
  metricsSummary: Ref<TLogViewScrollMetrics | null>;
  refreshAll: () => void;
  actions: Readonly<{
    reseed: () => void;
    append200: () => void;
    append1000: () => void;
    clear: () => void;
    replaceTail: () => void;
    appendChunk: () => void;
    toggleVisualIndexMode: () => void;
    cyclePreset: () => void;
    saveSession: () => void;
    restoreSession: () => void;
  }>;
  getSearchResultCell: (row?: number) => LabPointerCell;
  getLinksPanelCell: (row?: number) => LabPointerCell;
  getVisibleLinkCell: (visibleIndex?: number) => LabPointerCell | null;
  getScrollbarMarkerCell: (markerIndex?: number) => LabPointerCell | null;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatRecentEvent(message: string): string {
  return `${new Date().toISOString().slice(11, 19)} ${message}`;
}

const LAB_SESSION_STORAGE = (() => {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
})();

function osc8(href: string, text: string): string {
  return `\x1b]8;;${href}\x07${text}\x1b]8;;\x07`;
}

function makePayload(index: number): string {
  return JSON.stringify(
    {
      requestId: `req-${index}`,
      shard: index % 8,
      retryable: index % 3 === 0,
      nested: { ok: index % 2 === 0, cost: index * 7 },
    },
    null,
    0,
  );
}

function makeLongWrap(index: number): string {
  return `wrap=${`segment-${index}`.repeat(8)}`;
}

function makeBaseLine(index: number, prefix: string): string {
  const stamp = `\x1b[2m2026-05-03T08:${String(index % 60).padStart(2, "0")}:${
    index % 2 === 0 ? "00" : "30"
  }Z\x1b[0m`;
  const levelName = index % 9 === 0 ? "ERROR" : index % 5 === 0 ? "WARN" : "INFO";
  const level =
    levelName === "ERROR"
      ? "\x1b[31mERROR\x1b[0m"
      : levelName === "WARN"
        ? "\x1b[33mWARN\x1b[0m"
        : "\x1b[32mINFO\x1b[0m";
  const useLink = levelName === "ERROR" || index % 4 !== 1;
  const href = `https://example.com/log/${index}?requestId=req-${index}`;
  const target = useLink ? osc8(href, `job-${index}`) : `plain-log-${index}`;
  const wide = index % 7 === 0 ? " 宽字符中🙂" : "";
  const payload = index % 11 === 0 ? ` payload=${makePayload(index)}` : "";
  const docs = index % 17 === 0 ? ` docs=https://docs.example.com/log/${index}` : "";
  const wrap = index % 13 === 0 ? ` ${makeLongWrap(index)}` : "";
  return `${stamp} ${level} ${target}${wide} ${prefix} line-${index}${payload}${docs}${wrap}`.trim();
}

function makeTailLine(index: number, state: "draft" | "final"): string {
  const status = state === "draft" ? "\x1b[33mWARN\x1b[0m" : "\x1b[31mERROR\x1b[0m";
  return `\x1b[2m2026-05-03T09:${String(index % 60).padStart(2, "0")}:59Z\x1b[0m ${status} ${osc8(
    `https://example.com/tail/${index}`,
    `job-${index}`,
  )} tail-${state} payload=${makePayload(index)}`;
}

function createMarkerDensity(
  markers: readonly TLogViewSearchMarker[],
  metrics: TLogViewScrollMetrics | null,
): readonly TLogMinimapDensityBucket[] {
  const total = metrics?.visualRowCount ?? 0;
  if (total <= 0 || markers.length === 0) return [];
  const bucketCount = Math.min(12, total);
  const size = Math.max(1, Math.ceil(total / bucketCount));
  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const marker of markers) {
    const bucket = clamp(Math.floor(marker.visualRow / size), 0, bucketCount - 1);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  const maxCount = Math.max(...counts, 1);
  return counts
    .map((count, index) => {
      if (count <= 0) return null;
      const startVisualRow = index * size;
      return {
        startVisualRow,
        endVisualRow: Math.min(total - 1, startVisualRow + size - 1),
        value: count / maxCount,
      } satisfies TLogMinimapDensityBucket;
    })
    .filter((bucket): bucket is TLogMinimapDensityBucket => bucket != null);
}

function markerRow(
  marker: TLogViewSearchMarker,
  metrics: TLogViewScrollMetrics,
  height: number,
  showArrows: boolean,
): number {
  const arrowInset = showArrows && height >= 2 ? 1 : 0;
  const trackTop = arrowInset;
  const trackHeight = Math.max(0, height - arrowInset * 2);
  if (trackHeight <= 0) return 0;
  const total = Math.max(metrics.visualRowCount, metrics.viewportRows, 1);
  const maxVisualRow = Math.max(1, total - 1);
  const visualRow = clamp(marker.visualRow, 0, maxVisualRow);
  return trackTop + Math.round((visualRow / maxVisualRow) * (trackHeight - 1));
}

export const TLogViewLabApp = defineComponent({
  name: "TLogViewLabApp",
  props: {
    onReady: {
      type: Function as PropType<(api: TLogViewLabApi) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const logView = ref<TLogViewHandle | null>(null);
    const wrap = ref(true);
    const ansi = ref(true);
    const links = ref(true);
    const keyboardLinks = ref(true);
    const visualIndexMode = ref<"estimated" | "exact">("exact");
    const preset = ref<TLogUiPreset>(tlogDarkPreset);
    const store = createAppendOnlyLogStore({ maxLines: 2_000 });
    const sessionStore = createTLogViewSessionStore({
      storageKey: "@simon_he/vue-tui:tlog-view-lab",
      storage: LAB_SESSION_STORAGE,
    });
    const recentEvents = ref<readonly string[]>([]);
    const lastLinkAction = ref<TLogLinkAction | null>(null);
    const lastSearchSelection = ref<number | null>(null);
    const lastMarkerSelection = ref<number | null>(null);
    const metricsSummary = ref<TLogViewScrollMetrics | null>(null);
    const retainedLinkActiveIndex = ref(-1);
    let nextLineIndex = 0;
    let tailState: "none" | "draft" | "final" = "none";
    const presets = [tlogDefaultPreset, tlogDarkPreset, tlogHighContrastPreset] as const;

    const linkPlugins = [
      createTLogLinkActionPlugin({
        name: "lab-link-audit",
        onAction(action) {
          pushEvent(`plugin link ${action.source} ${action.href}`);
        },
      }),
      createTLogLineMatcherPlugin({
        name: "lab-draft-tail",
        pattern: /\btail-draft\b/u,
        severity: "warning",
        label: "DRAFT",
      }),
    ] as const;

    function pushEvent(message: string): void {
      recentEvents.value = [formatRecentEvent(message), ...recentEvents.value].slice(0, 6);
    }

    function finalizeTailIfNeeded(): void {
      if (tailState === "none") return;
      store.appendChunk("\n");
      tailState = "none";
    }

    function appendGenerated(count: number, label: string): void {
      finalizeTailIfNeeded();
      const start = nextLineIndex;
      store.appendLines(
        Array.from({ length: count }, (_, offset) => makeBaseLine(start + offset, label)),
      );
      nextLineIndex += count;
      pushEvent(`${label} +${count} lines`);
    }

    function reseed(): void {
      store.clear();
      nextLineIndex = 0;
      tailState = "none";
      appendGenerated(400, "seed");
      pushEvent("reseeded lab data");
    }

    function appendChunk(): void {
      finalizeTailIfNeeded();
      const start = nextLineIndex;
      store.appendChunk(
        `${makeBaseLine(start, "chunk")}\n${makeBaseLine(start + 1, "chunk")}\n${makeTailLine(
          start + 2,
          "draft",
        )}`,
      );
      nextLineIndex += 3;
      tailState = "draft";
      pushEvent("appendChunk with draft tail");
    }

    function replaceTail(): void {
      const index = tailState === "none" ? nextLineIndex : nextLineIndex - 1;
      const nextState = tailState === "final" ? "draft" : "final";
      store.replaceTail(makeTailLine(index, nextState));
      if (tailState === "none") nextLineIndex++;
      tailState = nextState;
      pushEvent(`replaceTail -> ${nextState}`);
    }

    function clearLogs(): void {
      store.clear();
      nextLineIndex = 0;
      tailState = "none";
      pushEvent("cleared retained window");
    }

    reseed();

    const search = useTLogSearchController(logView, {
      initialQuery: "ERROR",
      pageSize: 8,
      includePreview: true,
      previewWidth: 48,
      contextCells: 18,
    });
    const virtualResults = useTLogVirtualSearchResults(logView, {
      includePreview: true,
      previewWidth: 48,
      contextCells: 18,
    });

    const linkController = useTLogLinkController(logView, {
      plugins: linkPlugins,
      onAction(action) {
        lastLinkAction.value = action;
        pushEvent(`link:${action.source} ${action.text} -> ${action.href}`);
      },
    });
    const retainedIndex = useTLogRetainedIndex(
      logView,
      computed(() => store.source),
      store.version,
      {
        links: true,
        levels: true,
        urls: true,
        plugins: linkPlugins,
      },
    );

    const theme = computed(() => preset.value.theme);
    const searchBarTheme = computed(() => resolveTLogSearchBarTheme(theme.value));
    const searchResultsTheme = computed(() => resolveTLogSearchResultsTheme(theme.value));
    const searchPagerTheme = computed(() => resolveTLogSearchPagerTheme(theme.value));
    const linksPanelTheme = computed(() => resolveTLogLinksPanelTheme(theme.value));
    const scrollbarTheme = computed(() => resolveTLogScrollbarTheme(theme.value));
    const minimapTheme = computed(() => resolveTLogMinimapTheme(theme.value));
    const logViewTheme = computed(() => resolveTLogViewTheme(theme.value));

    const retainedLinkItems = computed<readonly TLogLinkPanelItem[]>(() =>
      retainedIndex.links.value.map((link, index) => ({
        visibleIndex: index,
        href: link.href,
        text: link.text,
        absoluteLineIndex: link.absoluteLineIndex,
        index: link.lineIndex,
        startCell: link.startCell,
        endCell: link.endCell,
        current: index === retainedLinkActiveIndex.value || undefined,
      })),
    );

    const scrollbarMarkers = computed<readonly TLogScrollbarMarker[]>(() =>
      search.markers.value.map((marker) => ({
        id: `match-${marker.matchIndex}`,
        visualRow: marker.visualRow,
        current: marker.current,
        estimated: marker.estimated,
        payload: marker,
      })),
    );

    const minimapMarkers = computed<readonly TLogMinimapMarker[]>(() =>
      search.markers.value.map((marker) => ({
        id: `match-${marker.matchIndex}`,
        visualRow: marker.visualRow,
        current: marker.current,
        estimated: marker.estimated,
        payload: marker,
      })),
    );

    const minimapDensity = computed<readonly TLogMinimapDensityBucket[]>(() =>
      retainedIndex.density.value.length
        ? retainedIndex.density.value
        : createMarkerDensity(search.markers.value, search.metrics.value),
    );

    const footerLines = computed(() => {
      const searchState = search.searchState.value;
      const pagerState = search.resultsPage.state.value;
      const metrics = search.metrics.value;
      const visualStatus = metrics?.visualIndexStatus ?? "estimated";
      const currentMatch =
        searchState.currentMatchIndex >= 0 ? searchState.currentMatchIndex + 1 : 0;
      const visibleLinks = linkController.visibleLinks.value.length;
      const retainedLinks = retainedIndex.links.value.length;
      const lastAction = lastLinkAction.value
        ? `${lastLinkAction.value.source}:${lastLinkAction.value.text}`
        : "none";
      return [
        `Ctrl+1 append200  Ctrl+2 append1000  Ctrl+3 clear  Ctrl+4 replaceTail  Ctrl+5 appendChunk  Ctrl+R reseed  Ctrl+V exact/estimated  Ctrl+T theme  Ctrl+S save  Ctrl+O restore`,
        `Search ${searchState.status}  mode=${search.mode.value}  query="${search.query.value}"  match=${currentMatch}/${searchState.matchCount}  pager=${pagerState.page + 1}/${Math.max(1, pagerState.pageCount)}  keymap=${preset.value.keymap.searchNext?.[0] ?? "-"}`,
        `View wrap=${wrap.value} ansi=${ansi.value} links=${links.value} keyboardLinks=${keyboardLinks.value} visualIndex=${visualIndexMode.value} status=${visualStatus} preset=${presets.indexOf(preset.value) + 1}/${presets.length}`,
        `Metrics lines=${metrics?.lineCount ?? 0} firstLine=${metrics?.firstLineIndex ?? 0} visualRows=${metrics?.visualRowCount ?? 0} scrollTop=${metrics?.scrollTop ?? 0} visibleLinks=${visibleLinks} retainedLinks=${retainedLinks} retainedStatus=${retainedIndex.status.value}`,
        `Last select=${lastSearchSelection.value ?? "-"}  last marker=${lastMarkerSelection.value ?? "-"}  last link=${lastAction}`,
        ...(recentEvents.value.length > 0 ? recentEvents.value : ["No recent lab events yet."]),
      ];
    });

    function refreshSearch(): void {
      search.refresh();
      virtualResults.refresh();
      metricsSummary.value = search.metrics.value;
    }

    function refreshLinks(): void {
      linkController.refresh();
    }

    function refreshAll(): void {
      refreshSearch();
      refreshLinks();
    }

    function scheduleRefreshAll(): void {
      void nextTick(() => {
        refreshAll();
      });
    }

    function focusRetainedLink(visibleIndex: number): boolean {
      const item = retainedLinkItems.value[visibleIndex];
      if (!item) return false;
      retainedLinkActiveIndex.value = visibleIndex;
      logView.value?.scrollToLine(item.index, { align: "center" });
      void nextTick(() => {
        const visible = logView.value
          ?.getVisibleLinks()
          .find(
            (entry) =>
              entry.absoluteLineIndex === item.absoluteLineIndex &&
              entry.href === item.href &&
              entry.startCell === item.startCell &&
              entry.endCell === item.endCell,
          );
        if (visible) linkController.focusVisibleLink(visible.visibleIndex);
        refreshAll();
      });
      return true;
    }

    function activateRetainedLink(visibleIndex: number): boolean {
      const item = retainedLinkItems.value[visibleIndex];
      if (!item) return false;
      focusRetainedLink(visibleIndex);
      const action: TLogLinkAction = {
        href: item.href,
        text: item.text,
        source: "panel",
        absoluteLineIndex: item.absoluteLineIndex,
        index: item.index,
        startCell: item.startCell,
        endCell: item.endCell,
      };
      lastLinkAction.value = action;
      dispatchTLogPluginLinkAction(linkPlugins, action);
      pushEvent(`retained panel activate ${item.text}`);
      return true;
    }

    function cyclePreset(): void {
      const currentIndex = presets.findIndex((entry) => entry === preset.value);
      preset.value = presets[(currentIndex + 1) % presets.length]!;
      pushEvent(`preset=${currentIndex + 2 > presets.length ? 1 : currentIndex + 2}`);
    }

    function saveSession(): void {
      const snapshot = captureTLogViewSessionState({
        logView,
        visualIndexMode,
        wrap,
        ansi,
        links,
        keyboardLinks,
        search,
        linkController: {
          activeIndex: retainedLinkActiveIndex,
          focusVisibleLink: focusRetainedLink,
          clearFocus: () => {
            retainedLinkActiveIndex.value = -1;
          },
        },
      });
      if (!snapshot) return;
      sessionStore.save(snapshot);
      pushEvent("session saved");
    }

    function restoreSession(): void {
      const snapshot = sessionStore.load();
      const restored = restoreTLogViewSessionState(
        {
          logView,
          visualIndexMode,
          wrap,
          ansi,
          links,
          keyboardLinks,
          search,
          linkController: {
            activeIndex: retainedLinkActiveIndex,
            focusVisibleLink: focusRetainedLink,
            clearFocus: () => {
              retainedLinkActiveIndex.value = -1;
            },
          },
        },
        snapshot,
      );
      if (restored) pushEvent("session restored");
      scheduleRefreshAll();
    }

    function selectMatch(matchIndex: number, source: string): void {
      lastSearchSelection.value = matchIndex;
      if (search.selectMatch(matchIndex)) pushEvent(`${source} select match ${matchIndex}`);
      else pushEvent(`${source} failed match ${matchIndex}`);
    }

    function selectMarker(
      marker: TLogViewSearchMarker | undefined,
      source: "scrollbar" | "minimap",
    ): void {
      if (!marker) return;
      lastMarkerSelection.value = marker.matchIndex;
      selectMatch(marker.matchIndex, `${source} marker`);
    }

    function handleLinksPanelActiveChange(payload: { item: TLogLinkPanelItem | null }): void {
      if (payload.item) {
        linkController.focusVisibleLink(payload.item.visibleIndex);
        pushEvent(`panel active link ${payload.item.visibleIndex}`);
        return;
      }
      linkController.clearFocus();
      pushEvent("panel cleared link focus");
    }

    function handleHotkey(e: {
      key: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      preventDefault?: () => void;
    }): void {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "1") appendGenerated(200, "burst-200");
      else if (key === "2") appendGenerated(1_000, "burst-1000");
      else if (key === "3") clearLogs();
      else if (key === "4") replaceTail();
      else if (key === "5") appendChunk();
      else if (key === "s") saveSession();
      else if (key === "o") restoreSession();
      else if (key === "r") reseed();
      else if (key === "t") cyclePreset();
      else if (key === "v") {
        visualIndexMode.value = visualIndexMode.value === "exact" ? "estimated" : "exact";
        pushEvent(`visualIndexMode=${visualIndexMode.value}`);
      } else {
        handleTLogKeymapEvent(e, preset.value.keymap, {
          searchNext: search.nextMatch,
          searchPrevious: search.previousMatch,
          clearSearch: search.clearSearch,
          nextLink: linkController.focusNextLink,
          previousLink: linkController.focusPreviousLink,
          activateLink: linkController.activateFocusedLink,
        });
        return;
      }
      e.preventDefault?.();
      scheduleRefreshAll();
    }

    const api: TLogViewLabApi = {
      store,
      logView,
      wrap,
      ansi,
      links,
      keyboardLinks,
      visualIndexMode,
      preset,
      search,
      virtualResults,
      linkController,
      retainedIndex: {
        status: retainedIndex.status,
        links: retainedIndex.links,
        density: retainedIndex.density,
      },
      recentEvents,
      lastLinkAction,
      lastSearchSelection,
      lastMarkerSelection,
      metricsSummary,
      refreshAll,
      actions: {
        reseed: () => {
          reseed();
          scheduleRefreshAll();
        },
        append200: () => {
          appendGenerated(200, "burst-200");
          scheduleRefreshAll();
        },
        append1000: () => {
          appendGenerated(1_000, "burst-1000");
          scheduleRefreshAll();
        },
        clear: () => {
          clearLogs();
          scheduleRefreshAll();
        },
        replaceTail: () => {
          replaceTail();
          scheduleRefreshAll();
        },
        appendChunk: () => {
          appendChunk();
          scheduleRefreshAll();
        },
        toggleVisualIndexMode: () => {
          visualIndexMode.value = visualIndexMode.value === "exact" ? "estimated" : "exact";
          pushEvent(`visualIndexMode=${visualIndexMode.value}`);
          scheduleRefreshAll();
        },
        cyclePreset: () => {
          cyclePreset();
          scheduleRefreshAll();
        },
        saveSession: saveSession,
        restoreSession: restoreSession,
      },
      getSearchResultCell(row = 0) {
        return {
          x: TLOG_VIEW_LAB_LAYOUT.results.x,
          y: TLOG_VIEW_LAB_LAYOUT.results.y + clamp(row, 0, TLOG_VIEW_LAB_LAYOUT.results.h - 1),
        };
      },
      getLinksPanelCell(row = 0) {
        return {
          x: TLOG_VIEW_LAB_LAYOUT.links.x,
          y: TLOG_VIEW_LAB_LAYOUT.links.y + clamp(row, 0, TLOG_VIEW_LAB_LAYOUT.links.h - 1),
        };
      },
      getVisibleLinkCell(visibleIndex = 0) {
        const link = logView.value?.getVisibleLinks()[visibleIndex];
        if (!link) return null;
        return {
          x: TLOG_VIEW_LAB_LAYOUT.logView.x + link.startX,
          y: TLOG_VIEW_LAB_LAYOUT.logView.y + link.y,
        };
      },
      getScrollbarMarkerCell(markerIndex = 0) {
        const marker = search.markers.value[markerIndex];
        const metrics = search.metrics.value;
        if (!marker || !metrics) return null;
        return {
          x: TLOG_VIEW_LAB_LAYOUT.scrollbar.x,
          y:
            TLOG_VIEW_LAB_LAYOUT.scrollbar.y +
            markerRow(marker, metrics, TLOG_VIEW_LAB_LAYOUT.scrollbar.h, true),
        };
      },
    };

    watch(store.version, () => {
      scheduleRefreshAll();
    });

    watch(
      [search.query, search.mode, search.caseSensitive, search.wholeWord, search.regexFlags],
      () => {
        scheduleRefreshAll();
      },
    );

    watch([wrap, ansi, links, keyboardLinks, visualIndexMode, preset], () => {
      scheduleRefreshAll();
    });

    let readyNotified = false;
    watchEffect(() => {
      if (readyNotified || !props.onReady || !logView.value) return;
      readyNotified = true;
      props.onReady(api);
    });

    return () =>
      h(
        TView,
        {
          x: 0,
          y: 0,
          w: TLOG_VIEW_LAB_LAYOUT.cols,
          h: TLOG_VIEW_LAB_LAYOUT.rows,
          onKeydownCapture: handleHotkey,
        },
        {
          default: () => [
            h(TLogSearchBar, {
              ...TLOG_VIEW_LAB_LAYOUT.searchBar,
              state: search.searchBarState.value,
              ...searchBarTheme.value,
              "onUpdate:query": search.updateQuery,
              "onUpdate:mode": search.updateMode,
              "onUpdate:caseSensitive": search.updateCaseSensitive,
              "onUpdate:wholeWord": search.updateWholeWord,
              onPrevious: search.previousMatch,
              onNext: search.nextMatch,
              onClear: search.clearSearch,
            }),
            h(TLogView, {
              ref: logView,
              ...TLOG_VIEW_LAB_LAYOUT.logView,
              source: store.source,
              version: store.version.value,
              ...logViewTheme.value,
              wrap: wrap.value,
              ansi: ansi.value,
              links: links.value,
              keyboardLinks: keyboardLinks.value,
              visualIndexMode: visualIndexMode.value,
              searchQuery: search.query.value,
              searchOptions: {
                mode: search.mode.value as TLogViewSearchMode,
                caseSensitive: search.caseSensitive.value,
                wholeWord: search.wholeWord.value,
                regexFlags: search.regexFlags.value,
              },
              autoFocus: true,
              onScroll: refreshAll,
              onVisualIndex: refreshAll,
              onSearch: refreshSearch,
              onSearchMatch: refreshSearch,
              onSearchMarkers: refreshSearch,
              onLinkFocus: refreshLinks,
              onLinkClick: linkController.handleLinkClick,
              onLinkActivate: linkController.handleLinkActivate,
            }),
            h(TText, {
              ...TLOG_VIEW_LAB_LAYOUT.resultsLabel,
              value: "Virtual results",
              style: { bold: true },
            }),
            h(TLogVirtualSearchResults, {
              ...TLOG_VIEW_LAB_LAYOUT.results,
              ...searchResultsTheme.value,
              itemCount: virtualResults.state.value.itemCount,
              itemVersion: virtualResults.state.value.itemVersion,
              getItem: virtualResults.getItem,
              modelValue: virtualResults.state.value.activeIndex,
              onSelect: ({ matchIndex }: { matchIndex: number }) =>
                selectMatch(matchIndex, "results"),
            }),
            h(TText, {
              ...TLOG_VIEW_LAB_LAYOUT.pagerLabel,
              value: "Pager",
              style: { bold: true },
            }),
            h(TLogSearchPager, {
              ...TLOG_VIEW_LAB_LAYOUT.pager,
              ...searchPagerTheme.value,
              state: search.resultsPage.state.value,
              onPreviousPage: search.resultsPage.previousPage,
              onNextPage: search.resultsPage.nextPage,
              onPageChange: ({ page }: { page: number }) => pushEvent(`pageChange -> ${page + 1}`),
            }),
            h(TText, {
              ...TLOG_VIEW_LAB_LAYOUT.linksLabel,
              value: "Retained links",
              style: { bold: true },
            }),
            h(TLogVirtualLinksPanel, {
              ...TLOG_VIEW_LAB_LAYOUT.links,
              ...linksPanelTheme.value,
              links: retainedLinkItems.value,
              modelValue: retainedLinkActiveIndex.value,
              onSelect: ({ visibleIndex }: { visibleIndex: number }) => {
                focusRetainedLink(visibleIndex);
                pushEvent(`retained panel select ${visibleIndex}`);
              },
              onActivate: ({ visibleIndex }: { visibleIndex: number }) => {
                activateRetainedLink(visibleIndex);
              },
            }),
            h(TText, {
              ...TLOG_VIEW_LAB_LAYOUT.minimapLabel,
              value: "SB MM",
              style: { bold: true },
            }),
            h(TLogScrollbar, {
              ...TLOG_VIEW_LAB_LAYOUT.scrollbar,
              ...scrollbarTheme.value,
              metrics: search.metrics.value,
              markers: scrollbarMarkers.value,
              showArrows: true,
              onScrollTo: (top: number) => {
                logView.value?.scrollToVisualRow(top);
                pushEvent(`scrollbar scrollTo ${top}`);
                scheduleRefreshAll();
              },
              onScrollBy: (delta: number) => {
                logView.value?.scrollBy(delta);
                pushEvent(`scrollbar scrollBy ${delta}`);
                scheduleRefreshAll();
              },
              onMarkerClick: ({
                marker,
              }: {
                marker: TLogScrollbarMarker & { payload?: TLogViewSearchMarker };
              }) => {
                selectMarker(marker.payload, "scrollbar");
              },
            }),
            h(TLogMinimap, {
              ...TLOG_VIEW_LAB_LAYOUT.minimap,
              ...minimapTheme.value,
              metrics: search.metrics.value,
              markers: minimapMarkers.value,
              density: minimapDensity.value,
              onScrollTo: ({ visualRow }: { visualRow: number }) => {
                logView.value?.scrollToVisualRow(visualRow);
                pushEvent(`minimap scrollTo ${visualRow}`);
                scheduleRefreshAll();
              },
              onMarkerClick: ({
                marker,
              }: {
                marker: TLogMinimapMarker & { payload?: TLogViewSearchMarker };
              }) => {
                selectMarker(marker.payload, "minimap");
              },
            }),
            ...footerLines.value.slice(0, TLOG_VIEW_LAB_LAYOUT.footer.h).map((line, index) =>
              h(TText, {
                x: TLOG_VIEW_LAB_LAYOUT.footer.x,
                y: TLOG_VIEW_LAB_LAYOUT.footer.y + index,
                w: TLOG_VIEW_LAB_LAYOUT.footer.w,
                value: line,
                style: index === 0 ? { dim: true } : undefined,
              }),
            ),
          ],
        },
      );
  },
});

export function createTLogViewLabRunnerApp(
  onReady?: (api: TLogViewLabApi) => void,
): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: "TLogViewLabRunnerRoot",
    setup() {
      return () => h(TLogViewLabApp, { onReady });
    },
  });
}
