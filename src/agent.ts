export { TBox } from "./vue/components/TBox.js";
export { TDialog } from "./vue/components/TDialog.js";
export { TInput } from "./vue/components/TInput.js";
export { TSelect } from "./vue/components/TSelect.js";
export { TText } from "./vue/components/TText.js";
export { TAgentTerminalGraphic } from "./vue/components/TAgentTerminalGraphic.js";
export type {
  TAgentTerminalGraphicKind,
  TAgentTerminalGraphicRenderer,
  TAgentTerminalGraphicRendererContext,
  TAgentTerminalGraphicRenderResult,
  TAgentTerminalGraphicProps,
  TAgentTerminalGraphicTraceEvent,
} from "./vue/components/TAgentTerminalGraphic.js";
export { TThinkingView } from "./vue/components/TThinkingView.js";
export { TToolCallView } from "./vue/components/TToolCallView.js";
export { TUserMessageView } from "./vue/components/TUserMessageView.js";
export {
  computeCommandPaletteMatchRanges,
  TCommandPalette,
} from "./vue/components/TCommandPalette.js";
export { TView } from "./vue/components/TView.js";
export { TRenderPlane } from "./vue/components/TRenderPlane.js";
export { TVirtualList } from "./vue/components/TVirtualList.js";
export {
  TTranscriptView,
  TTranscriptView as TAgentTranscript,
} from "./vue/components/TTranscriptView.js";
export { TLogView, TLogView as TToolLogView } from "./vue/components/TLogView.js";
export { TLogScrollbar } from "./vue/components/TLogScrollbar.js";
export { TLogMinimap } from "./vue/components/TLogMinimap.js";
export { TLogSearchBar } from "./vue/components/TLogSearchBar.js";
export { TLogSearchResults } from "./vue/components/TLogSearchResults.js";
export { TLogSearchPager } from "./vue/components/TLogSearchPager.js";
export { TLogLinksPanel } from "./vue/components/TLogLinksPanel.js";
export { TLogVirtualSearchResults } from "./vue/components/TLogVirtualSearchResults.js";
export { TLogVirtualLinksPanel } from "./vue/components/TLogVirtualLinksPanel.js";
export { TVirtualMarkdown } from "./vue/components/TVirtualMarkdown.js";
export {
  markMermaidRenderErrorFatal,
  TMermaid,
  TMermaidText,
} from "./vue/components/TMermaidText.js";
export type {
  CreatePngTerminalGraphicRendererOptions,
  PngTerminalGraphicFrame,
} from "./vue/agent/create-png-terminal-graphic-renderer.js";
export { createPngTerminalGraphicRenderer } from "./vue/agent/create-png-terminal-graphic-renderer.js";
export type {
  TerminalGraphicRenderQueue,
  TerminalGraphicRenderQueueMetric,
  TerminalGraphicRenderQueueOptions,
} from "./renderer/terminal-graphic-render-queue.js";
export { createTerminalGraphicRenderQueue } from "./renderer/terminal-graphic-render-queue.js";
export type {
  CreateKittyDeleteGraphicsSequenceOptions,
  CreateKittyGraphicsSequenceOptions,
  TerminalGraphicsCapabilities,
  TerminalGraphicsDetectionInput,
  TerminalGraphicsFallbackProtocol,
  TerminalGraphicsMultiplexer,
  TerminalGraphicsProtocol,
  TerminalGraphicsResolvedProtocol,
} from "./renderer/terminal-graphics.js";
export {
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  detectTerminalGraphicsCapabilities,
} from "./renderer/terminal-graphics.js";
export type {
  TMermaidAsciiOptions,
  TMermaidAsciiTheme,
  TMermaidRenderer,
  TMermaidResolvedAsciiOptions,
  TMermaidTextProps,
  TMermaidTransientErrorClassifier,
  TMermaidTransientErrorContext,
} from "./vue/components/TMermaidText.js";
export { createMarkdownBlockSource } from "./vue/markdown/block-source.js";
export { createAppendOnlyLogStore } from "./vue/log/append-only-log-store.js";
export { useTLogLinkController } from "./vue/log/use-tlog-link-controller.js";
export { useTLogSearchController } from "./vue/log/use-tlog-search-controller.js";
export { useTLogSearchResultsPage } from "./vue/log/use-tlog-search-results-page.js";
export { useTLogVirtualSearchResults } from "./vue/log/use-tlog-virtual-search-results.js";
export { useTLogRetainedIndex } from "./vue/log/use-tlog-retained-index.js";
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
  TCommandPaletteItem,
  TCommandPaletteItemsProvider,
  TCommandPaletteLoadErrorPayload,
  TCommandPaletteMatcher,
  TCommandPaletteMatcherResult,
  TCommandPaletteMatchRange,
  TCommandPaletteSelectPayload,
} from "./vue/components/TCommandPalette.js";
export type {
  TToolCallStatus,
  TToolCallViewSegment,
  TToolCallViewSegmentRole,
  TToolCallViewSlotProps,
  TToolCallViewStyles,
} from "./vue/components/TToolCallView.js";
export {
  resolveTThinkingViewModel,
  resolveTToolCallViewModel,
  resolveTUserMessageViewModel,
} from "./vue/agent/view-models.js";
export type {
  TThinkingViewModel,
  TToolCallViewModel,
  TUserMessageSegment,
  TUserMessageViewModel,
} from "./vue/agent/view-models.js";
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
  TLogViewHandle,
  TLogViewLinkActivatePayload,
  TLogViewLinkClickPayload,
  TLogViewLinkFocusPayload,
  TLogViewScrollMetrics,
  TLogViewSearchError,
  TLogViewSearchMarker,
  TLogViewSearchMarkersPayload,
  TLogViewSearchMatch,
  TLogViewSearchMatchPayload,
  TLogViewSearchMode,
  TLogViewSearchOptions,
  TLogViewSearchPayload,
  TLogViewSearchResult,
  TLogViewSearchResultPreview,
  TLogViewSearchResultsOptions,
  TLogViewSearchState,
  TLogViewSelectSearchMatchOptions,
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
  TuiMarkdownBlockSource,
  TuiMarkdownBlockSourceOptions,
  TuiMarkdownBlockSourceSnapshot,
} from "./vue/markdown/block-source.js";
export type {
  TuiMarkdownBlock,
  TuiMarkdownInlineSegment,
  TuiMarkdownNode,
  TuiMarkdownTableCell,
  TuiMarkdownTableCellAlign,
  TuiMarkdownVisualRow,
  TuiMarkdownVisualSegment,
} from "./vue/markdown/types.js";
export type { TLogTheme, TLogUiPreset } from "./vue/log/tlog-theme.js";
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
