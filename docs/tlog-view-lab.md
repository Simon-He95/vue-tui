# TLogView Lab

这页给一个“把整套 experimental log-view stack 接起来”的完整 lab blueprint。目标不是再加功能，而是验证这些部件能在同一个屏幕里稳定协作：

- `TLogView`
- `TLogSearchBar`
- `TLogSearchResults`
- `TLogSearchPager`
- `TLogScrollbar`
- `TLogMinimap`
- `TLogLinksPanel`
- `useTLogSearchController`
- `useTLogLinkController`
- `createAppendOnlyLogStore({ maxLines })`

## 建议覆盖的开关

- `wrap`
- `ansi`
- `links`
- `keyboardLinks`
- `visualIndexMode`: `"exact"` / `"estimated"`
- `regex search`
- `caseSensitive`
- `wholeWord`
- `retention maxLines`

## 建议日志负载

1. 普通短日志
2. 长 JSON / stack line
3. ANSI `ERROR` / `WARN` / dim timestamp
4. OSC8 hyperlink
5. 宽字符
6. append burst

## 完整 wiring 示例

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  TLogLinksPanel,
  TLogMinimap,
  TLogScrollbar,
  TLogSearchBar,
  TLogSearchPager,
  TLogSearchResults,
  TLogView,
  createAppendOnlyLogStore,
  useTLogLinkController,
  useTLogSearchController,
  type TLogMinimapDensityBucket,
  type TLogMinimapMarker,
  type TLogScrollbarMarker,
  type TLogViewHandle,
} from "@simon_he/vue-tui/experimental";

const logView = ref<TLogViewHandle | null>(null);
const wrap = ref(true);
const ansi = ref(true);
const links = ref(true);
const keyboardLinks = ref(true);
const visualIndexMode = ref<"exact" | "estimated">("exact");
const retention = ref(2000);

const store = createAppendOnlyLogStore({ maxLines: retention.value });

function makeLine(index: number): string {
  const stamp = `\x1b[2m2026-05-04T01:${String(index % 60).padStart(2, "0")}:00Z\x1b[0m`;
  const level =
    index % 9 === 0
      ? "\x1b[31mERROR\x1b[0m"
      : index % 5 === 0
        ? "\x1b[33mWARN\x1b[0m"
        : "\x1b[32mINFO\x1b[0m";
  const link = `\x1b]8;;https://example.com/log/${index}\x07job-${index}\x1b]8;;\x07`;
  const wide = index % 7 === 0 ? " 宽字符中🙂" : "";
  const longJson =
    index % 11 === 0
      ? ` payload={"requestId":"req-${index}","deep":{"nested":[1,2,3],"ok":true}}`
      : "";
  return `${stamp} ${level} ${link}${wide}${longJson}`;
}

store.appendLines(Array.from({ length: 400 }, (_, index) => makeLine(index)));

const search = useTLogSearchController(logView, {
  pageSize: 12,
  includePreview: true,
  previewWidth: 52,
  initialQuery: "ERROR",
});
const {
  query,
  mode,
  caseSensitive,
  wholeWord,
  regexFlags,
  searchBarState,
  resultsPage,
  markers,
  metrics,
  refresh: refreshSearch,
  nextMatch,
  previousMatch,
  clearSearch,
  selectMatch,
} = search;

const linkController = useTLogLinkController(logView, {
  onAction(action) {
    console.log("[link action]", action.source, action.href);
  },
});
const {
  visibleLinks,
  activeIndex: activeLinkIndex,
  refresh: refreshLinks,
  focusVisibleLink,
  activateVisibleLink,
  clearFocus,
  handleLinkClick,
  handleLinkActivate,
} = linkController;

const scrollbarMarkers = computed<readonly TLogScrollbarMarker[]>(() =>
  markers.value.map((marker) => ({
    id: marker.matchIndex,
    visualRow: marker.visualRow,
    current: marker.current,
    estimated: marker.estimated,
    payload: marker,
  })),
);

const minimapMarkers = computed<readonly TLogMinimapMarker[]>(() =>
  markers.value.map((marker) => ({
    id: marker.matchIndex,
    visualRow: marker.visualRow,
    current: marker.current,
    estimated: marker.estimated,
    payload: marker,
  })),
);

const density = computed<readonly TLogMinimapDensityBucket[]>(() => {
  const total = metrics.value?.visualRowCount ?? 0;
  if (total <= 0) return [];
  return [
    { startVisualRow: 0, endVisualRow: Math.floor(total * 0.25), value: 0.2 },
    {
      startVisualRow: Math.floor(total * 0.25) + 1,
      endVisualRow: Math.floor(total * 0.75),
      value: 0.5,
    },
    { startVisualRow: Math.floor(total * 0.75) + 1, endVisualRow: total - 1, value: 0.9 },
  ];
});

function refreshAll() {
  refreshSearch();
  refreshLinks();
}

function appendBurst() {
  const start = store.source.lineCount();
  store.appendLines(Array.from({ length: 200 }, (_, offset) => makeLine(start + offset)));
  refreshAll();
}

function onPanelActiveChange(payload: { item: { visibleIndex: number } | null }) {
  if (payload.item) focusVisibleLink(payload.item.visibleIndex);
  else clearFocus();
}

onMounted(refreshAll);
</script>

<TLogSearchBar
  :x="0"
  :y="0"
  :w="92"
  :state="searchBarState"
  @update:query="search.updateQuery"
  @update:mode="search.updateMode"
  @update:caseSensitive="search.updateCaseSensitive"
  @update:wholeWord="search.updateWholeWord"
  @previous="previousMatch"
  @next="nextMatch"
  @clear="clearSearch"
/>

<TLogView
  ref="logView"
  :x="0"
  :y="1"
  :w="60"
  :h="20"
  :source="store.source"
  :version="store.version.value"
  :wrap="wrap"
  :ansi="ansi"
  :links="links"
  :keyboard-links="keyboardLinks"
  :visual-index-mode="visualIndexMode"
  :search-query="query"
  :search-options="{ mode, caseSensitive, wholeWord, regexFlags }"
  @scroll="refreshAll"
  @visualIndex="refreshAll"
  @search="refreshSearch"
  @searchMatch="refreshSearch"
  @searchMarkers="refreshSearch"
  @linkFocus="refreshLinks"
  @linkClick="handleLinkClick"
  @linkActivate="handleLinkActivate"
/>

<TLogSearchResults
  :x="61"
  :y="1"
  :w="20"
  :h="16"
  :results="resultsPage.state.results"
  :active-index="resultsPage.state.activeIndex"
  @select="({ matchIndex }) => selectMatch(matchIndex)"
/>

<TLogSearchPager
  :x="61"
  :y="17"
  :w="20"
  :state="resultsPage.state"
  @previousPage="resultsPage.previousPage"
  @nextPage="resultsPage.nextPage"
/>

<TLogLinksPanel
  :x="61"
  :y="18"
  :w="20"
  :h="3"
  :links="visibleLinks"
  :active-index="activeLinkIndex"
  @select="({ visibleIndex }) => focusVisibleLink(visibleIndex)"
  @activeChange="onPanelActiveChange"
  @activate="({ visibleIndex }) => activateVisibleLink(visibleIndex)"
/>

<TLogScrollbar
  :x="82"
  :y="1"
  :h="20"
  :metrics="metrics"
  :markers="scrollbarMarkers"
  show-arrows
  @scrollTo="(top) => logView?.scrollToVisualRow(top)"
  @scrollBy="(delta) => logView?.scrollBy(delta)"
  @markerClick="({ marker }) => marker.payload && selectMatch(marker.payload.matchIndex)"
/>

<TLogMinimap
  :x="83"
  :y="1"
  :w="2"
  :h="20"
  :metrics="metrics"
  :markers="minimapMarkers"
  :density="density"
  @scrollTo="({ visualRow }) => logView?.scrollToVisualRow(visualRow)"
  @markerClick="({ marker }) => marker.payload && selectMatch(marker.payload.matchIndex)"
/>
```

## wiring 要点

- `useTLogSearchController()` 和 `useTLogLinkController()` 都把 options 视为 setup-time config；如果 page size / preview width / action wiring 要动态变化，直接重建 controller。
- `refreshSearch()` / `refreshLinks()` 最好在 `scroll`、`visualIndex`、`search`、`searchMatch`、`searchMarkers`、`linkFocus`、`linkClick`、`linkActivate` 后一起维护。
- `TLogSearchResults` / `TLogLinksPanel` 都只接当前 page/window，不自己 virtualize 全量 retained data。
- `TLogLinksPanel.activeChange` 回来的 `activeIndex` 是 panel-local index；真正要同步回 `TLogView` 时应使用 `payload.item.visibleIndex`。
- `TLogScrollbar` / `TLogMinimap` 都只做 external metrics/marker rendering，不持有滚动状态。

## 推荐验收方式

1. 开 `wrap + ansi + links + keyboardLinks + visualIndexMode="exact"`，确认滚动、搜索高亮、visible links、scrollbar、minimap 一起同步。
2. 切到 regex 搜索并尝试无效表达式、零宽表达式和 whole-word toggle，确认状态和结果面板稳定。
3. 持续触发 append burst，并配合 `maxLines` retention，看 exact visual index、search markers、visible links 是否保持一致。
