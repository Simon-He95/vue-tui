import { describe, expect, it } from "vitest";
import { sanitizeInlineText, sanitizeTextBlock } from "../src/index.js";

describe("text sanitization", () => {
  it("sanitizeInlineText replaces newlines/tabs with spaces", () => {
    expect(sanitizeInlineText("a\tb")).toBe("a b");
    expect(sanitizeInlineText("a\nb\r\nc")).toBe("a b  c");
  });

  it("sanitizeTextBlock strips control chars but preserves newlines", () => {
    const input = `a\r\nb\tc\u0007d\n\u001B[31mred\u001B[0m`;
    expect(sanitizeTextBlock(input)).toBe(`a\nb cd\n[31mred[0m`);
  });

  it("sanitizeTextBlock fast path returns the same string when no changes are needed", () => {
    const s = "hello\nworld — ok";
    expect(sanitizeTextBlock(s)).toBe(s);
  });
});
