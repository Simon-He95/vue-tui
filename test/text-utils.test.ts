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
});
