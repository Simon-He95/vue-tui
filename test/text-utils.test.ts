import { describe, expect, it } from "vitest";
import {
  formatInlineCellLine,
  padEndByCells,
  sliceByCellsRange,
  sliceByCellsRangeForSelection,
} from "../src/vue/utils/text.js";

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

  it("keeps a wide grapheme whose leading cell is inside the selection range", () => {
    // 你 spans cells 1-2, so a range ending on its leading cell still copies it whole.
    expect(sliceByCellsRangeForSelection("a你b", 0, 2)).toBe("a你");
    expect(sliceByCellsRangeForSelection("a你b", 0, 3)).toBe("a你");
  });

  it("does not pad the copied text when the selection range cuts a wide grapheme", () => {
    // Range starts on the continuation cell of 你 and ends on the leading cell of b.
    expect(sliceByCellsRangeForSelection("a你b", 2, 3)).toBe("");
    // Range covers only the continuation cell of 你: 你 is left out instead of
    // being replaced with a leading space, and b keeps its position.
    expect(sliceByCellsRangeForSelection("a你b", 2, 4)).toBe("b");
  });

  it("keeps emoji graphemes whole when the selection ends on their leading cell", () => {
    const text = formatInlineCellLine("x👨‍💻y", 5);
    expect(sliceByCellsRangeForSelection(text, 0, 2)).toBe("x👨‍💻");
    expect(sliceByCellsRangeForSelection(text, 2, 4)).toBe("y");
    expect(sliceByCellsRangeForSelection(text, 1, 3)).toBe("👨‍💻");
  });

  it("slices ASCII selection ranges by cell", () => {
    expect(sliceByCellsRangeForSelection("abcdef", 1, 4)).toBe("bcd");
    expect(sliceByCellsRangeForSelection("abcdef", 3, 3)).toBe("");
    expect(sliceByCellsRangeForSelection("abcdef", 4, 2)).toBe("");
  });
});
