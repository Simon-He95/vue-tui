import { describe, expect, it } from "vitest";
import { sanitizeDomHref, sanitizeTerminalHref } from "../src/core/hyperlink.js";
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
    ] as const;

    for (const [href, markdown, dom, terminal] of cases) {
      expect(isSafeMarkdownLink(href), href).toBe(markdown);
      expect(Boolean(sanitizeDomHref(href)), href).toBe(dom);
      expect(Boolean(sanitizeTerminalHref(href)), href).toBe(terminal);
    }
  });
});
