import { describe, expect, it } from "vitest";
import { normalizeOpenHref, openExternalHref } from "../scripts/run-component-terminal.js";

describe("component terminal script", () => {
  it("normalizes only supported external href protocols", () => {
    expect(normalizeOpenHref("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
    expect(normalizeOpenHref("http://example.com")).toBe("http://example.com/");
    expect(normalizeOpenHref("mailto:dev@example.com")).toBe("mailto:dev@example.com");

    const generatedVscodeHref = encodeURI(
      `vscode://file${process.cwd()}/scripts/run-component-terminal.ts:1`,
    );
    expect(normalizeOpenHref(generatedVscodeHref)).toBe(new URL(generatedVscodeHref).href);

    expect(normalizeOpenHref("javascript:alert(1)")).toBeNull();
    expect(normalizeOpenHref("data:text/plain,hello")).toBeNull();
    expect(normalizeOpenHref(`file://${process.cwd()}/package.json`)).toBeNull();
    expect(normalizeOpenHref(`vscode://file${process.cwd()}/package.json:1`)).toBeNull();
    expect(normalizeOpenHref("not a url")).toBeNull();
  });

  it("does not open external hrefs unless terminal link opening is explicitly enabled", () => {
    const previous = process.env.VT_OPEN_LINKS;
    try {
      delete process.env.VT_OPEN_LINKS;
      expect(openExternalHref("https://example.com")).toBe(false);

      process.env.VT_OPEN_LINKS = "0";
      expect(openExternalHref("https://example.com")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.VT_OPEN_LINKS;
      else process.env.VT_OPEN_LINKS = previous;
    }
  });
});
