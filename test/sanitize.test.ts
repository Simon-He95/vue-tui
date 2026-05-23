import { describe, expect, it } from "vitest";
import { sanitizeInlineText, sanitizeTextBlock } from "../src/vue/utils/text.js";

describe("text sanitization", () => {
  it("sanitizeInlineText replaces newlines/tabs with spaces", () => {
    expect(sanitizeInlineText("a\tb")).toBe("a b");
    expect(sanitizeInlineText("a\nb\r\nc")).toBe("a b  c");
  });

  it("sanitizeTextBlock strips control chars but preserves newlines", () => {
    const input = `a\r\nb\tc\u0007d\n\u001B[31mred\u001B[0m`;
    expect(sanitizeTextBlock(input)).toBe(`a\nb cd\n[31mred[0m`);
  });

  it("strips hidden format controls without breaking emoji joiners", () => {
    const rtlOverride = String.fromCodePoint(0x202e);
    const isolate = `${String.fromCodePoint(0x2066)}x${String.fromCodePoint(0x2069)}`;
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    const zwnj = String.fromCodePoint(0x200c);
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
    const englandFlag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";

    expect(sanitizeTextBlock(`a${rtlOverride}b${isolate}${zeroWidthSpace}${zwnj}`)).toBe("abx");
    expect(sanitizeTextBlock(`${family} ${englandFlag}`)).toBe(`${family} ${englandFlag}`);
    expect(sanitizeInlineText(`a${rtlOverride}\nb\t${zeroWidthSpace}c`)).toBe("a b c");
  });

  it("sanitizeTextBlock fast path returns the same string when no changes are needed", () => {
    const s = "hello\nworld — ok";
    expect(sanitizeTextBlock(s)).toBe(s);
  });
});
