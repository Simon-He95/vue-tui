import { describe, expect, it } from "vitest";
import { sanitizeDomHref, sanitizeTerminalHref } from "../src/core/hyperlink.js";
import { hasEncodedControl } from "../src/utils/url-safety.js";
import { isSafeMarkdownLink } from "../src/vue/markdown/parser.js";

describe("href sanitizer semantics", () => {
  it("keeps markdown, DOM, and terminal href rules aligned", () => {
    const cases = [
      ["https://example.com", true, true, true],
      ["mailto:a@example.com", true, true, true],
      ["#local", true, true, false],
      ["/docs", true, true, false],
      ["./docs", true, true, false],
      ["../docs", true, true, false],
      ["?q=1", true, true, false],
      ["//evil.example", false, false, false],
      ["javascript:alert(1)", false, false, false],
      ["data:text/html,<script>", false, false, false],
      ["https://example.com/a b", false, false, false],
      ["https://example.com/a%20b", true, true, true],
      ["https://example.com/%E6%88%91", true, true, true],
    ] as const;

    for (const [href, markdown, dom, terminal] of cases) {
      expect(isSafeMarkdownLink(href), href).toBe(markdown);
      expect(Boolean(sanitizeDomHref(href)), href).toBe(dom);
      expect(Boolean(sanitizeTerminalHref(href)), href).toBe(terminal);
    }
  });

  it("rejects encoded ASCII and C1 controls", () => {
    expect(hasEncodedControl("%00")).toBe(true);
    expect(hasEncodedControl("%1f")).toBe(true);
    expect(hasEncodedControl("%7F")).toBe(true);
    expect(hasEncodedControl("%C2%80")).toBe(true);
  });

  it("allows safe UTF-8 percent-encoded Unicode", () => {
    expect(hasEncodedControl("%E2%80%A6")).toBe(false);
    expect(hasEncodedControl("%E6%88%91")).toBe(false);
  });

  it("does not reject safe encoded Unicode links", () => {
    expect(sanitizeDomHref("/docs/%E2%80%A6")).toBe("/docs/%E2%80%A6");
    expect(sanitizeDomHref("https://example.com/%E6%88%91")).toBe("https://example.com/%E6%88%91");
    expect(isSafeMarkdownLink("/wiki/%E6%88%91")).toBe(true);
  });

  it("still rejects encoded controls in terminal links", () => {
    expect(sanitizeTerminalHref("https://example.com/%00")).toBeNull();
  });
});
