export { TVirtualList } from "./vue/components/TVirtualList.js";
export { TTranscriptView } from "./vue/components/TTranscriptView.js";
export { TLogView } from "./vue/components/TLogView.js";
export { TLogScrollbar } from "./vue/components/TLogScrollbar.js";
export { TLogMinimap } from "./vue/components/TLogMinimap.js";
export { TLogSearchBar } from "./vue/components/TLogSearchBar.js";
export { TLogSearchResults } from "./vue/components/TLogSearchResults.js";
export { TLogSearchPager } from "./vue/components/TLogSearchPager.js";
export { TLogLinksPanel } from "./vue/components/TLogLinksPanel.js";
export { TLogVirtualSearchResults } from "./vue/components/TLogVirtualSearchResults.js";
export { TLogVirtualLinksPanel } from "./vue/components/TLogVirtualLinksPanel.js";
export { sanitizeTerminalHref, type SanitizeTerminalHrefOptions } from "./core/hyperlink.js";
export type { TLinkifyOptions, TLinkifyProtocol, TLinkifySegment } from "./vue/linkify.js";
export { createAppendOnlyLogStore } from "./vue/log/append-only-log-store.js";
export { useTLogLinkController } from "./vue/log/use-tlog-link-controller.js";
export { useTLogSearchController } from "./vue/log/use-tlog-search-controller.js";
export { useTLogSearchResultsPage } from "./vue/log/use-tlog-search-results-page.js";
export { useTLogVirtualSearchResults } from "./vue/log/use-tlog-virtual-search-results.js";
export { useTLogRetainedIndex } from "./vue/log/use-tlog-retained-index.js";
export {
  captureTLogViewSessionState,
  createTLogViewSessionStore,
  deserializeTLogViewSessionState,
  restoreTLogViewSessionState,
  serializeTLogViewSessionState,
} from "./vue/log/tlog-session.js";
export {
  createTLogDensityBucketsFromMarkers,
  createTLogLevelPlugin,
  createTLogLineMatcherPlugin,
  createTLogLinkActionPlugin,
  createTLogOsc8LinkPlugin,
  createTLogUrlPlugin,
  detectTLogUrls,
  dispatchTLogPluginLinkAction,
  getTLogPluginMetadata,
  parseTLogAnnotatedText,
  stripTLogAnsiText,
  toTLogExternalLinkFromVisibleLink,
} from "./vue/log/tlog-plugins.js";
export {
  handleTLogKeymapEvent,
  matchesTLogKeyBinding,
  tlogDefaultKeymap,
  tlogHighContrastKeymap,
} from "./vue/log/tlog-keymap.js";
export {
  resolveTLogLinksPanelTheme,
  resolveTLogMinimapTheme,
  resolveTLogScrollbarTheme,
  resolveTLogSearchBarTheme,
  resolveTLogSearchPagerTheme,
  resolveTLogSearchResultsTheme,
  resolveTLogViewTheme,
  tlogDarkPreset,
  tlogDarkTheme,
  tlogDefaultPreset,
  tlogDefaultTheme,
  tlogHighContrastPreset,
  tlogHighContrastTheme,
} from "./vue/log/tlog-theme.js";
export type { RowScrollMode } from "./vue/components/TVirtualList.js";
export type {
  TTranscriptAction,
  TTranscriptDataSource,
  TTranscriptHitRegion,
  TTranscriptRegionEvent,
  TTranscriptRow,
  TTranscriptRowEvent,
  TTranscriptSelectionSegment,
  TTranscriptSegment,
  TTranscriptViewHandle,
  TTranscriptVisualRow,
  TTranscriptVisualSegment,
} from "./vue/transcript/types.js";
export type {
  TLogLinkPanelItem,
  TLogLinksPanelSelectPayload,
  TLogLinksPanelActivatePayload,
  TLogLinksPanelActiveChangePayload,
} from "./vue/components/TLogLinksPanel.js";
export type {
  TLogMinimapClickPayload,
  TLogMinimapDensityBucket,
  TLogMinimapMarker,
  TLogMinimapMarkerClickPayload,
  TLogMinimapMetrics,
} from "./vue/components/TLogMinimap.js";
export type {
  TLogScrollbarMetrics,
  TLogScrollbarMarker,
  TLogScrollbarMarkerClickPayload,
  TLogScrollbarScrollByPayload,
  TLogScrollbarScrollToPayload,
} from "./vue/components/TLogScrollbar.js";
export type {
  TLogSearchBarMode,
  TLogSearchBarNavigatePayload,
  TLogSearchBarState,
  TLogSearchBarUpdatePayload,
} from "./vue/components/TLogSearchBar.js";
export type {
  TLogSearchPagerPageChangePayload,
  TLogSearchPagerState,
} from "./vue/components/TLogSearchPager.js";
export type {
  TLogSearchResultItem,
  TLogSearchResultsActiveChangePayload,
  TLogSearchResultsSelectPayload,
} from "./vue/components/TLogSearchResults.js";
export type {
  TLogViewHandle,
  TLogViewLinkActivatePayload,
  TLogViewLinkClickPayload,
  TLogViewLinkFocusPayload,
  TLogViewScrollMetrics,
  TLogViewSearchMatch,
  TLogViewSearchResult,
  TLogViewSearchResultPreview,
  TLogViewSearchResultsOptions,
  TLogViewSearchMarker,
  TLogViewSearchMarkersPayload,
  TLogViewSearchMatchPayload,
  TLogViewSearchError,
  TLogViewSearchMode,
  TLogViewSearchOptions,
  TLogViewSearchPayload,
  TLogViewSelectSearchMatchOptions,
  TLogViewSearchState,
  TLogViewVisibleLink,
  TLogViewVisualIndexPayload,
} from "./vue/components/TLogView.js";
export type {
  AppendOnlyLogStore,
  CreateAppendOnlyLogStoreOptions,
  TLogDataSource,
  TLogViewScrollPayload,
  TLogViewVisualIndexOptions,
  TLogViewVisualIndexStatus,
} from "./vue/log/types.js";
export type {
  TLogLinkAction,
  TLogLinkActionSource,
  UseTLogLinkControllerOptions,
} from "./vue/log/use-tlog-link-controller.js";
export type {
  TLogSavedSearch,
  UseTLogSearchControllerOptions,
} from "./vue/log/use-tlog-search-controller.js";
export type {
  TLogSearchResultsPageState,
  UseTLogSearchResultsPageOptions,
} from "./vue/log/use-tlog-search-results-page.js";
export type {
  TLogIndexedLink,
  TLogDiagnosticMarker,
  TLogIndexStatus,
  TLogRetainedIndexOptions,
} from "./vue/log/use-tlog-retained-index.js";
export type {
  StorageLike,
  TLogViewSessionBindings,
  TLogViewSessionState,
} from "./vue/log/tlog-session.js";
export type {
  TLogPluginLinkSource,
  TLogPluginSeverity,
  TLogPluginVisualSegment,
  TLogParsedOsc8Link,
  TLogViewExternalLink,
  TLogViewExternalMarker,
  TLogViewPlugin,
  TLogViewPluginDensityContext,
  TLogViewPluginDecorateSegmentsContext,
  TLogViewPluginIndexedLine,
  TLogViewPluginLineLink,
  TLogViewPluginLineMarker,
  TLogViewPluginLineMetadata,
  TLogViewPluginMarkerContext,
  TLogViewPluginParseLineContext,
  TLogUrlPluginOptions,
} from "./vue/log/tlog-plugins.js";
export type { TLogKeymap } from "./vue/log/tlog-keymap.js";
export type { TLogTheme, TLogUiPreset } from "./vue/log/tlog-theme.js";
export type {
  TLogVirtualSearchResultsState,
  UseTLogVirtualSearchResultsOptions,
} from "./vue/log/use-tlog-virtual-search-results.js";
