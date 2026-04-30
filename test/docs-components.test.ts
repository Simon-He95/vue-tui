import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const components = [
  "TerminalProvider",
  "TText",
  "TBox",
  "TView",
  "TAnchor",
  "TFlow",
  "TInput",
  "TInputBox",
  "TList",
  "TSelect",
  "TPathPicker",
  "TDialog",
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
});
