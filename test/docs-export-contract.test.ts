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
      "TContextMenu",
      "TDataTable",
      "TDialog",
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
      "TMultilineModal",
      "TPathPicker",
      "TRenderLayer",
      "TRenderPlane",
      "TTransition",
      "TDebugOverlay",
      "useTerminal",
    ]) {
      expect(key in vue, key).toBe(true);
    }
  });
});
