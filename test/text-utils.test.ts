import { describe, expect, it } from "vitest";
import { formatInlineCellLine, padEndByCells, sliceByCellsRange } from "../src/vue/utils/text.js";

describe("text utils", () => {
  it("preserves cell alignment when a range starts inside a wide grapheme", () => {
    expect(padEndByCells(sliceByCellsRange(formatInlineCellLine("你a", 3), 1, 3), 2)).toBe(" a");
  });

  it("preserves cell alignment when a range ends inside a wide grapheme", () => {
    expect(padEndByCells(sliceByCellsRange(formatInlineCellLine("a你b", 4), 2, 3), 1)).toBe(" ");
  });

  it("preserves cell alignment for emoji clipping", () => {
    expect(padEndByCells(sliceByCellsRange(formatInlineCellLine("🙂a", 3), 1, 3), 2)).toBe(" a");
  });

  it("keeps a wide grapheme when the range contains both cells", () => {
    expect(sliceByCellsRange(formatInlineCellLine("a你b", 4), 1, 3)).toBe("你");
  });

  it("does not split combining-mark graphemes in ranged clipping", () => {
    expect(sliceByCellsRange("a\u0301b", 0, 1)).toBe("a\u0301");
  });

  it("preserves ZWJ emoji alignment in ranged clipping", () => {
    const text = formatInlineCellLine("x👨‍💻y", 5);
    expect(sliceByCellsRange(text, 1, 3)).toBe("👨‍💻");
    expect(padEndByCells(sliceByCellsRange(text, 2, 4), 2)).toBe(" y");
  });
});
