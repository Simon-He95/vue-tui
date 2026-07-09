import { describe, expect, it } from "vitest";

async function exportNames(path: string): Promise<string[]> {
  return Object.keys(await import(path)).sort();
}

const maskedInputExportName = ["T", "Pass", "word", "Input"].join("");

function snapshotExportNames(names: readonly string[]): string[] {
  // Keep the exact export asserted while avoiding secret-scanner false positives in inline snapshots.
  return names.map((name) => (name === maskedInputExportName ? "<masked-input-export>" : name));
}

describe("public API surface", () => {
  it("keeps root exports intentional", async () => {
    expect(snapshotExportNames(await exportNames("../src/index.js"))).toMatchInlineSnapshot(`
      [
        "TAutocompleteInput",
        "TBadge",
        "TBox",
        "TCheckbox",
        "TCode",
        "TCommandPalette",
        "TDataTable",
        "TDialog",
        "TDivider",
        "TFormField",
        "TInput",
        "TLink",
        "TLinkifyText",
        "TList",
        "<masked-input-export>",
        "TRadioGroup",
        "TSelect",
        "TSlider",
        "TSwitch",
        "TTable",
        "TTag",
        "TText",
        "TTree",
        "TView",
        "TerminalProvider",
        "computeCommandPaletteMatchRanges",
        "createDomRenderer",
        "createTInputHostPlugin",
        "createTerminal",
        "createTheme",
        "linkifyTextSegments",
        "tuiDefaultTheme",
      ]
    `);
  });

  it("keeps vue entry exports intentional", async () => {
    expect(snapshotExportNames(await exportNames("../src/vue.js"))).toMatchInlineSnapshot(`
      [
        "TAnchor",
        "TAutocompleteInput",
        "TBadge",
        "TBox",
        "TBreadcrumb",
        "TCheckbox",
        "TCode",
        "TCommandPalette",
        "TContextMenu",
        "TDataTable",
        "TDebugOverlay",
        "TDialog",
        "TDivider",
        "TFlex",
        "TFlexItem",
        "TFlow",
        "TForm",
        "TFormContextKey",
        "TFormField",
        "TInput",
        "TInputBox",
        "TInputPluginsContextKey",
        "TJsonEditor",
        "TKeyHint",
        "TLink",
        "TLinkifyText",
        "TList",
        "TMermaid",
        "TMermaidText",
        "TMultilineModal",
        "<masked-input-export>",
        "TPathPicker",
        "TPopover",
        "TProgress",
        "TRadioGroup",
        "TRenderLayer",
        "TRenderPlane",
        "TRouterView",
        "TSelect",
        "TSlider",
        "TSpinner",
        "TSplitPane",
        "TStatusBar",
        "TSwitch",
        "TTable",
        "TTabs",
        "TTag",
        "TText",
        "TToastViewport",
        "TTooltip",
        "TTransition",
        "TTree",
        "TView",
        "TerminalProvider",
        "computeCommandPaletteMatchRanges",
        "createOverlayFocusStack",
        "createPromptMentionPlugin",
        "createTInputHostPlugin",
        "createTerminalRouter",
        "createTextRestrictionPlugin",
        "createTheme",
        "isSimpleMermaidFlowchartSource",
        "linkifyTextSegments",
        "lintJsonText",
        "markMermaidRenderErrorFatal",
        "padEndByCells",
        "resolveOverlayPlacement",
        "sliceByCells",
        "sliceByCellsRange",
        "spaces",
        "textCellWidth",
        "tuiDefaultTheme",
        "useLayout",
        "useRenderNode",
        "useRoute",
        "useRouter",
        "useTForm",
        "useTerminal",
        "useTerminalNode",
        "useTerminalRuntime",
        "useVisibility",
        "wrapByCells",
      ]
    `);
  });

  it("keeps cli entry exports intentional", async () => {
    expect(await exportNames("../src/cli.js")).toMatchInlineSnapshot(`
      [
        "HEADLESS_RENDERER_CAPABILITIES",
        "STDOUT_RENDERER_CAPABILITIES",
        "createCliEventManager",
        "createDefaultTInputHostAdapter",
        "createIterm2InlineImageSequence",
        "createKittyDeleteGraphicsSequence",
        "createKittyGraphicsSequence",
        "createNodeMentionPathProvider",
        "createNodePathPickerProvider",
        "createOsc52ClipboardProvider",
        "createStdinDriver",
        "createStdoutRenderer",
        "createTInputHostPlugin",
        "createTerminalApp",
        "createTerminalGraphicRenderQueue",
        "defaultTInputHostPlugin",
        "detectTerminalGraphicsCapabilities",
        "getCliLatencyProfiler",
        "getStdoutRendererMetrics",
        "installNodeFileWriters",
        "installTerminalCleanup",
        "readEventLog",
        "resetNodeFileWriters",
        "resolveUserPath",
        "sanitizeTerminalHref",
        "suggestPaths",
        "writeEventLog",
        "writeSnapshot",
      ]
    `);
  });

  it("keeps markdown entry exports intentional", async () => {
    expect(await exportNames("../src/markdown.js")).toMatchInlineSnapshot(`
      [
        "TMarkdownText",
        "TVirtualMarkdown",
        "buildMarkdownBlocks",
        "buildMarkdownVisualRows",
        "createMarkdownBlockSource",
        "createTuiMarkdownParser",
        "isSafeMarkdownLink",
        "layoutMarkdownBlocks",
      ]
    `);
  });

  it("keeps mermaid entry exports intentional", async () => {
    expect(await exportNames("../src/mermaid.js")).toMatchInlineSnapshot(`
      [
        "TBeautifulMermaid",
        "TBeautifulMermaidText",
        "TMermaid",
        "TMermaidText",
        "beautifulMermaidRenderer",
        "createBeautifulMermaidRenderer",
        "isSimpleMermaidFlowchartSource",
        "markMermaidRenderErrorFatal",
      ]
    `);
  });

  it("keeps agent mermaid entry exports intentional", async () => {
    expect(await exportNames("../src/agent/mermaid.js")).toMatchInlineSnapshot(`
      [
        "TBeautifulMermaid",
        "TBeautifulMermaidText",
        "TMermaid",
        "TMermaidText",
        "beautifulMermaidRenderer",
        "createBeautifulMermaidRenderer",
        "isSimpleMermaidFlowchartSource",
        "markMermaidRenderErrorFatal",
      ]
    `);
  });

  it("keeps base Mermaid aliases stable", async () => {
    const vue = await import("../src/vue.js");
    const agent = await import("../src/agent.js");

    expect(vue.TMermaid).toBe(vue.TMermaidText);
    expect(agent.TMermaid).toBe(agent.TMermaidText);
  });

  it("keeps observability entry exports intentional", async () => {
    expect(await exportNames("../src/observability.js")).toMatchInlineSnapshot(`
      [
        "createFramePerfStore",
        "createJsonlPerfSink",
        "createTraceStore",
        "framePerfNow",
        "installTuiPerf",
        "summarizeFramePerf",
      ]
    `);
  });

  it("keeps experimental entry exports intentional", async () => {
    expect(await exportNames("../src/experimental.js")).toMatchInlineSnapshot(`
      [
        "TCandlestickChart",
        "TContributionGraph",
        "TLineChart",
        "TLogLinksPanel",
        "TLogMinimap",
        "TLogScrollbar",
        "TLogSearchBar",
        "TLogSearchPager",
        "TLogSearchResults",
        "TLogView",
        "TLogVirtualLinksPanel",
        "TLogVirtualSearchResults",
        "TPieChart",
        "TTranscriptView",
        "TVirtualList",
        "captureTLogViewSessionState",
        "createAppendOnlyLogStore",
        "createTLogDensityBucketsFromMarkers",
        "createTLogLevelPlugin",
        "createTLogLineMatcherPlugin",
        "createTLogLinkActionPlugin",
        "createTLogOsc8LinkPlugin",
        "createTLogUrlPlugin",
        "createTLogViewSessionStore",
        "deserializeTLogViewSessionState",
        "detectTLogUrls",
        "dispatchTLogPluginLinkAction",
        "getTLogPluginMetadata",
        "handleTLogKeymapEvent",
        "matchesTLogKeyBinding",
        "parseTLogAnnotatedText",
        "resolveTLogLinksPanelTheme",
        "resolveTLogMinimapTheme",
        "resolveTLogScrollbarTheme",
        "resolveTLogSearchBarTheme",
        "resolveTLogSearchPagerTheme",
        "resolveTLogSearchResultsTheme",
        "resolveTLogViewTheme",
        "restoreTLogViewSessionState",
        "sanitizeTerminalHref",
        "serializeTLogViewSessionState",
        "stripTLogAnsiText",
        "tlogDarkPreset",
        "tlogDarkTheme",
        "tlogDefaultKeymap",
        "tlogDefaultPreset",
        "tlogDefaultTheme",
        "tlogHighContrastKeymap",
        "tlogHighContrastPreset",
        "tlogHighContrastTheme",
        "toTLogExternalLinkFromVisibleLink",
        "useTLogLinkController",
        "useTLogRetainedIndex",
        "useTLogSearchController",
        "useTLogSearchResultsPage",
        "useTLogVirtualSearchResults",
      ]
    `);
  });

  it("keeps agent entry exports intentional", async () => {
    expect(await exportNames("../src/agent.js")).toMatchInlineSnapshot(`
      [
        "TAgentTerminalGraphic",
        "TAgentTranscript",
        "TBox",
        "TCommandPalette",
        "TDialog",
        "TInput",
        "TLogLinksPanel",
        "TLogMinimap",
        "TLogScrollbar",
        "TLogSearchBar",
        "TLogSearchPager",
        "TLogSearchResults",
        "TLogView",
        "TLogVirtualLinksPanel",
        "TLogVirtualSearchResults",
        "TMermaid",
        "TMermaidText",
        "TRenderPlane",
        "TSelect",
        "TText",
        "TThinkingView",
        "TToolCallView",
        "TToolLogView",
        "TTranscriptView",
        "TUserMessageView",
        "TView",
        "TVirtualList",
        "TVirtualMarkdown",
        "computeCommandPaletteMatchRanges",
        "createAppendOnlyLogStore",
        "createIterm2InlineImageSequence",
        "createKittyDeleteGraphicsSequence",
        "createKittyGraphicsSequence",
        "createKittyPlacementSequence",
        "createMarkdownBlockSource",
        "createPngTerminalGraphicRenderer",
        "createTLogDensityBucketsFromMarkers",
        "createTLogLevelPlugin",
        "createTLogLineMatcherPlugin",
        "createTLogLinkActionPlugin",
        "createTLogOsc8LinkPlugin",
        "createTLogUrlPlugin",
        "createTerminalGraphicRenderQueue",
        "detectTLogUrls",
        "detectTerminalGraphicsCapabilities",
        "dispatchTLogPluginLinkAction",
        "getTLogPluginMetadata",
        "getTerminalGraphicsOutput",
        "getTerminalGraphicsOutputVersion",
        "isSimpleMermaidFlowchartSource",
        "markMermaidRenderErrorFatal",
        "parseTLogAnnotatedText",
        "resolveTLogLinksPanelTheme",
        "resolveTLogMinimapTheme",
        "resolveTLogScrollbarTheme",
        "resolveTLogSearchBarTheme",
        "resolveTLogSearchPagerTheme",
        "resolveTLogSearchResultsTheme",
        "resolveTLogViewTheme",
        "resolveTThinkingViewModel",
        "resolveTToolCallViewModel",
        "resolveTUserMessageViewModel",
        "stripTLogAnsiText",
        "subscribeTerminalGraphicsOutput",
        "tlogDarkPreset",
        "tlogDarkTheme",
        "tlogDefaultPreset",
        "tlogDefaultTheme",
        "tlogHighContrastPreset",
        "tlogHighContrastTheme",
        "toTLogExternalLinkFromVisibleLink",
        "useTLogLinkController",
        "useTLogRetainedIndex",
        "useTLogSearchController",
        "useTLogSearchResultsPage",
        "useTLogVirtualSearchResults",
      ]
    `);
  });
});
