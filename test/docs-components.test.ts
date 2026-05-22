import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const components = [
  "TerminalProvider",
  "TText",
  "TLinkifyText",
  "TBadge",
  "TTag",
  "TDivider",
  "TCode",
  "TBox",
  "TView",
  "TTable",
  "TDataTable",
  "TTree",
  "TAnchor",
  "TFlow",
  "TInput",
  "TInputBox",
  "TCheckbox",
  "TRadioGroup",
  "TSwitch",
  "TSlider",
  "TFormField",
  "TForm",
  "TPasswordInput",
  "TAutocompleteInput",
  "TList",
  "TVirtualList",
  "TSelect",
  "TPathPicker",
  "TDialog",
  "TCommandPalette",
  "TContextMenu",
  "TPopover",
  "TTooltip",
  "TToastViewport",
  "TProgress",
  "TSpinner",
  "TStatusBar",
  "TBreadcrumb",
  "TKeyHint",
  "TTabs",
  "TSplitPane",
  "TTransition",
  "TDebugOverlay",
  "TRouterView",
] as const;

describe("docs: components coverage", () => {
  it("docs/components.md lists all exported components", () => {
    const md = readFileSync(resolve(process.cwd(), "docs/components.md"), "utf8");
    for (const name of components) expect(md).toContain(`## ${name}`);
  });

  it("docs/generated/components-api.md mentions key components", () => {
    const md = readFileSync(resolve(process.cwd(), "docs/generated/components-api.md"), "utf8");
    for (const name of components) {
      // Generated API doc should mention every exported component.
      expect(md).toContain(name);
    }
  });

  it("documents API maturity and platform contracts", () => {
    const generated = readFileSync(
      resolve(process.cwd(), "docs/generated/components-api.md"),
      "utf8",
    );
    expect(generated).toContain("API maturity: **Public**");
    expect(generated).toContain("API maturity: **Advanced**");
    expect(generated).toContain("API maturity: **Experimental**");
    expect(generated).toContain(
      "> 此文件由 `scripts/generate-component-api-docs.ts` 自动生成，请勿手改。",
    );
    expect(generated).toMatch(
      /## TAnchor[\s\S]*?API maturity: \*\*Advanced\*\*[\s\S]*?Import: `@simon_he\/vue-tui\/vue`/u,
    );
    expect(generated).toMatch(
      /## TBox[\s\S]*?API maturity: \*\*Public\*\*[\s\S]*?Import: `@simon_he\/vue-tui`/u,
    );
    expect(generated).toMatch(
      /## TVirtualList[\s\S]*?API maturity: \*\*Experimental\*\*[\s\S]*?Import: `@simon_he\/vue-tui\/experimental`/u,
    );
    expect(generated).toContain("Import: `@simon_he/vue-tui/experimental`");

    const maturity = readFileSync(resolve(process.cwd(), "docs/api-maturity.md"), "utf8");
    expect(maturity).toContain("Public");
    expect(maturity).toContain("Advanced");
    expect(maturity).toContain("Experimental");
    expect(maturity).toContain("Internal");
    expect(maturity).toContain("Experimental Graduation");

    const contracts = readFileSync(resolve(process.cwd(), "docs/platform-contracts.md"), "utf8");
    expect(contracts).toContain("Browser Accessibility");
    expect(contracts).toContain("Renderer Capabilities");
    expect(contracts).toContain("Terminal Permissions");
  });
});
