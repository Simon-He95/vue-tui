import { describe, expect, it } from "vitest";

describe("documented entrypoint exports", () => {
  it("keeps root documented exports available", async () => {
    const root = await import("../src/index.js");

    for (const key of [
      "createTerminal",
      "createDomRenderer",
      "TerminalProvider",
      "TBox",
      "TCommandPalette",
      "TDataTable",
      "TDialog",
      "TBadge",
      "TTag",
      "TDivider",
      "TCode",
      "TFormField",
      "TInput",
      "TLink",
      "TLinkifyText",
      "TList",
      "TSelect",
      "TTable",
      "TText",
      "TTree",
      "TView",
      "createTInputHostPlugin",
      "computeCommandPaletteMatchRanges",
      "createTheme",
      "linkifyTextSegments",
    ]) {
      expect(key in root, key).toBe(true);
    }
  });

  it("keeps advanced Vue documented exports under /vue", async () => {
    const vue = await import("../src/vue.js");

    for (const key of [
      "TAnchor",
      "TFlow",
      "TInputBox",
      "TJsonEditor",
      "TMermaid",
      "TMermaidText",
      "TMultilineModal",
      "TPathPicker",
      "TRenderLayer",
      "TRenderPlane",
      "TTransition",
      "TDebugOverlay",
      "TForm",
      "TFormContextKey",
      "TBreadcrumb",
      "TContextMenu",
      "TKeyHint",
      "TPopover",
      "TProgress",
      "TSpinner",
      "TSplitPane",
      "TStatusBar",
      "TTabs",
      "TToastViewport",
      "TTooltip",
      "useTForm",
      "useTerminal",
    ]) {
      expect(key in vue, key).toBe(true);
    }
  });

  it("keeps chart documented exports under /experimental", async () => {
    const experimental = await import("../src/experimental.js");

    for (const key of ["TCandlestickChart", "TContributionGraph", "TLineChart", "TPieChart"]) {
      expect(key in experimental, key).toBe(true);
    }
  });
});
