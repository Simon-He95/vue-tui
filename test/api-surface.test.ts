import { describe, expect, it } from "vitest";

async function exportNames(path: string): Promise<string[]> {
  return Object.keys(await import(path)).sort();
}

describe("public API surface", () => {
  it("keeps root exports intentional", async () => {
    expect(await exportNames("../src/index.js")).toMatchInlineSnapshot(`
      [
        "TBox",
        "TDialog",
        "TInput",
        "TList",
        "TSelect",
        "TText",
        "TView",
        "TerminalProvider",
        "createDomRenderer",
        "createTInputHostPlugin",
        "createTerminal",
      ]
    `);
  });

  it("keeps vue entry exports intentional", async () => {
    expect(await exportNames("../src/vue.js")).toMatchInlineSnapshot(`
      [
        "TAnchor",
        "TBox",
        "TDebugOverlay",
        "TDialog",
        "TFlow",
        "TInput",
        "TInputBox",
        "TInputPluginsContextKey",
        "TJsonEditor",
        "TList",
        "TMultilineModal",
        "TPathPicker",
        "TRenderLayer",
        "TRenderPlane",
        "TRouterView",
        "TSelect",
        "TText",
        "TTransition",
        "TView",
        "TerminalProvider",
        "applyWheelScroll",
        "clearTextCaches",
        "createPromptMentionPlugin",
        "createTInputHostPlugin",
        "createTerminalRouter",
        "createTextRestrictionPlugin",
        "createWheelScrollState",
        "formatInlineCellLine",
        "lintJsonText",
        "padEndByCells",
        "sanitizeInlineText",
        "sanitizeTextBlock",
        "sliceByCells",
        "sliceByCellsRange",
        "spaces",
        "textCellWidth",
        "useLayout",
        "useRenderNode",
        "useRoute",
        "useRouter",
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
        "createNodeMentionPathProvider",
        "createNodePathPickerProvider",
        "createOsc52ClipboardProvider",
        "createStdinDriver",
        "createStdoutRenderer",
        "createTInputHostPlugin",
        "createTerminalApp",
        "defaultTInputHostPlugin",
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

  it("keeps experimental entry exports intentional", async () => {
    expect(await exportNames("../src/experimental.js")).toMatchInlineSnapshot(`
      [
        "TLogLinksPanel",
        "TLogMinimap",
        "TLogScrollbar",
        "TLogSearchBar",
        "TLogSearchPager",
        "TLogSearchResults",
        "TLogView",
        "TLogVirtualLinksPanel",
        "TLogVirtualSearchResults",
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
});
