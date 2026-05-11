export { ansiStyles } from "./ansi-styles.js";
export {
  ANSI8_COLORS,
  ANSI16_COLORS,
  ANSI256_COLORS,
  ansiColors,
  rgbToAnsi256,
  SGR_RESET,
  type TerminalColorLevel,
  type TerminalColorMode,
  truecolorBgOpen,
  truecolorFgOpen,
} from "./ansi-styles.js";
export type { StdinDriver } from "./cli/input.js";

export { createStdinDriver } from "./cli/input.js";
export type { FsDirEntry, FsEntryKind, FsStat, PathPickerProvider } from "./cli/path-provider.js";

export { createNodePathPickerProvider } from "./cli/path-provider.js";
export {
  type PathPickMode,
  type PathSuggestion,
  resolveUserPath,
  suggestPaths,
  type SuggestPathsResult,
} from "./cli/path-suggest.js";
export { readEventLog, writeEventLog, writeSnapshot } from "./cli/recording.js";
export {
  detectTerminalColorCapability,
  type TerminalColorCapability,
} from "./core/ansi/capability.js";
export type { ThemePalette } from "./core/ansi-palette.js";
export { parseAnsiSgr } from "./core/ansi/sgr.js";
export { charCellWidth } from "./core/buffer/width.js";
export type {
  AnsiColorName,
  BufferSnapshot,
  Cell,
  Style,
  Terminal,
  TerminalCommitEvent,
  TerminalEventMap,
  TerminalResizeEvent,
  TerminalScrollOperation,
  ThemeModeId,
} from "./core/index.js";

export { createTerminal } from "./core/index.js";

export {
  TERMINAL_RENDER_PLANES,
  type TerminalRenderPlane,
  type TerminalRenderPlanes,
} from "./core/render-plane.js";

export type { CreateTerminalAppOptions, TerminalApp } from "./create-terminal-app.js";

export { createTerminalApp } from "./create-terminal-app.js";
export type {
  CliEventManager,
  EventManager,
  Rect,
  TerminalBaseEvent,
  TerminalDebugNode,
  TerminalEventHandlerMap,
  TerminalEventRecord,
  TerminalEventType,
  TerminalInputEvent,
  TerminalKeyboardEvent,
  TerminalNode,
  TerminalPointerEvent,
} from "./events/index.js";

export { createCliEventManager, createEventManager } from "./events/index.js";
export { getCliLatencyProfiler } from "./observability/cli-latency.js";
export type {
  FramePerfReason,
  FramePerfRowBucketFallback,
  FramePerfSample,
} from "./observability/frame-perf.js";
export { framePerfNow } from "./observability/frame-perf.js";
export type { FramePerfStore } from "./observability/frame-perf-store.js";
export { createFramePerfStore } from "./observability/frame-perf-store.js";
export type { TraceRecord, TraceStore } from "./observability/trace.js";
export { createTraceStore } from "./observability/trace.js";

export type { StdoutRendererMetrics } from "./renderer/cli/stdout-metrics.js";
export { getStdoutRendererMetrics } from "./renderer/cli/stdout-metrics.js";
export type {
  CellMetrics,
  DomRenderer,
  DomRendererDebugStats,
  DomRendererFlushSample,
  DomRendererFlushStats,
  DomRendererOptions,
  DomRendererRowKeyPrepassDebugStats,
  DomRendererRowKeyPrepassDecision,
  DomRendererRowKeyPrepassMode,
  DomRendererRowRenderDebugStats,
  DomRendererRowRenderStats,
  DomRendererSyncFlushDecision,
  DomRendererSyncFlushStats,
  TerminalRendererLike,
  RendererCapabilities,
  StdoutRenderer,
} from "./renderer/index.js";
export {
  createDomRenderer,
  createStdoutRenderer,
  DOM_RENDERER_CAPABILITIES,
  HEADLESS_RENDERER_CAPABILITIES,
} from "./renderer/index.js";

export type {
  ClipboardApi,
  Osc52ClipboardOptions,
  RafApi,
  Runtime,
  RuntimeEnv,
  RuntimeOptions,
  TimerApi,
} from "./runtime/index.js";
export { createOsc52ClipboardProvider, createRuntime } from "./runtime/index.js";
export type {
  CreateTerminalSelectionControllerOptions,
  SelectionTextProvider,
  TerminalSelectionConfig,
  TerminalSelectionController,
  TerminalSelectionCopyPayload,
  TerminalSelectionOptions,
  TerminalSelectionPoint,
  TerminalSelectionRange,
  TerminalSelectionState,
} from "./selection/terminal-selection.js";
export type {
  SelectedRowSpan,
} from "./selection/terminal-selection.js";
export {
  createTerminalSelectionController,
  terminalSelectionRowSpans,
} from "./selection/terminal-selection.js";
export type {
  TerminalProviderSelectionConfig,
  TerminalProviderSelectionOptions,
} from "./vue/components/TerminalProvider.js";
export { normalizeNewlines } from "./utils/newlines.js";

export {
  createDefaultTInputHostAdapter,
  createNodeMentionPathProvider,
  createPromptMentionPlugin,
  createTerminalRouter,
  createTextRestrictionPlugin,
  createTInputHostPlugin,
  defaultTInputHostPlugin,
  lintJsonText,
  TAnchor,
  TBox,
  TDebugOverlay,
  TDialog,
  TerminalProvider,
  TFlow,
  TInput,
  TInputBox,
  TInputPluginsContextKey,
  TJsonEditor,
  TList,
  TMultilineModal,
  TPathPicker,
  TRenderLayer,
  TRenderPlane,
  TRouterView,
  TSelect,
  TText,
  TTransition,
  TView,
  useLayout,
  useRenderNode,
  useRoute,
  useRouter,
  useTerminal,
  useTerminalNode,
  useTerminalRuntime,
  useVisibility,
} from "./vue/index.js";

export type {
  LayoutContext,
  MentionPathProvider,
  MentionSuggestionProvider,
  PromptMentionPluginOptions,
  PromptSuggestion,
  TerminalFrameContext,
  TerminalFrameTask,
  TerminalFrameTaskPriority,
  TerminalContext,
  TerminalSelectionContext,
  TerminalRoute,
  TerminalRouteLocationRaw,
  TerminalRouter,
  TerminalRouteRecord,
  TerminalRuntime,
  TerminalRuntimeHandle,
  TerminalScheduler,
  TerminalSchedulerConfig,
  TerminalSchedulerInvalidateOptions,
  TuiMarkdownTheme,
  TuiMarkdownThemeOverrides,
  TInputHostAdapter,
  TInputPlugin,
  TInputPluginContext,
} from "./vue/index.js";
export {
  clearTextCaches,
  formatInlineCellLine,
  padEndByCells,
  sanitizeInlineText,
  sanitizeTextBlock,
  sliceByCells,
  sliceByCellsRange,
  spaces,
  textCellWidth,
  wrapByCells,
} from "./vue/utils/text.js";
export { applyWheelScroll, createWheelScrollState } from "./vue/utils/wheel-scroll.js";
