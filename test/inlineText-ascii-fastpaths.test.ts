import { describe, expect, it } from "vitest";
import {
  buildInlineRow,
  buildInlineSelectionSegments,
  lineCellColToIndexInline,
  sliceByCellsWindow,
  textCellWidthInline,
  wrapToLinesInline,
} from "../src/vue/components/input/utils/inlineText.js";
import {
  MENTION_TOKEN,
  MULTILINE_TOKEN,
} from "../src/vue/components/input/utils/inlineTextTokens.js";
import { withTextWidthProvider } from "../src/vue/utils/text.js";

describe("inlineText ASCII fast paths", () => {
  it("sliceByCellsWindow matches ASCII slicing", () => {
    expect(sliceByCellsWindow("hello", 0, 2)).toBe("he");
    expect(sliceByCellsWindow("hello", 2, 2)).toBe("ll");
    expect(sliceByCellsWindow("hello", 10, 2)).toBe("");
  });

  it("handles non-ASCII correctly", () => {
    // 😀 is width=2 in terminals; window slicing should not split it.
    expect(sliceByCellsWindow("a😀b", 0, 1)).toBe("a");
    expect(sliceByCellsWindow("a😀b", 1, 2)).toBe("😀");
    expect(sliceByCellsWindow("a😀b", 3, 1)).toBe("b");
  });

  it("wrapToLinesInline wraps ASCII by width", () => {
    const lines = wrapToLinesInline(
      "abcdef",
      MULTILINE_TOKEN,
      MENTION_TOKEN,
      undefined,
      undefined,
      3,
    );
    expect(lines).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 6 },
    ]);
  });

  it("textCellWidthInline counts token labels", () => {
    const value = `a${MULTILINE_TOKEN}b${MENTION_TOKEN}c`;
    const multilineTexts = ["x\ny\nz"];
    const mentions = ["/tmp/foo.ts"];
    const cells = textCellWidthInline(
      value,
      MULTILINE_TOKEN,
      MENTION_TOKEN,
      multilineTexts,
      mentions,
      0,
      value.length,
    );
    expect(cells).toBeGreaterThanOrEqual(3);
  });

  it("lineCellColToIndexInline maps ASCII col to index", () => {
    const value = "hello";
    const res = lineCellColToIndexInline(
      value,
      MULTILINE_TOKEN,
      MENTION_TOKEN,
      undefined,
      undefined,
      0,
      value.length,
      3,
    );
    expect(res.hit).toBeNull();
    expect(res.index).toBe(3);
  });

  it("buildInlineRow pads with spaces to row width", () => {
    const res = buildInlineRow(
      "hi",
      "hi",
      MULTILINE_TOKEN,
      MENTION_TOKEN,
      undefined,
      undefined,
      0,
      2,
      5,
      0,
    );
    expect(res.text.length).toBe(5);
    expect(res.text.startsWith("hi")).toBe(true);
  });

  it("keeps TInput inline grapheme clusters intact under CJK width", () => {
    withTextWidthProvider("cjk", () => {
      const value = "e\u0301👩‍💻1️⃣🇺🇸Ω";
      const accentEnd = "e\u0301".length;
      const zwjEnd = accentEnd + "👩‍💻".length;
      const keycapEnd = zwjEnd + "1️⃣".length;
      const flagEnd = keycapEnd + "🇺🇸".length;

      expect(
        textCellWidthInline(
          value,
          MULTILINE_TOKEN,
          MENTION_TOKEN,
          undefined,
          undefined,
          0,
          value.length,
        ),
      ).toBe(9);
      expect(sliceByCellsWindow(value, 0, 1)).toBe("e\u0301");
      expect(sliceByCellsWindow(value, 1, 2)).toBe("👩‍💻");
      expect(sliceByCellsWindow(value, 3, 2)).toBe("1️⃣");
      expect(sliceByCellsWindow(value, 5, 2)).toBe("🇺🇸");
      expect(sliceByCellsWindow(value, 7, 2)).toBe("Ω");

      const lines = wrapToLinesInline(
        value,
        MULTILINE_TOKEN,
        MENTION_TOKEN,
        undefined,
        undefined,
        3,
      );
      expect(lines.map((line) => value.slice(line.start, line.end))).toEqual([
        "e\u0301👩‍💻",
        "1️⃣",
        "🇺🇸",
        "Ω",
      ]);

      expect(
        lineCellColToIndexInline(
          value,
          MULTILINE_TOKEN,
          MENTION_TOKEN,
          undefined,
          undefined,
          0,
          value.length,
          1,
        ).index,
      ).toBe(accentEnd);
      expect(
        lineCellColToIndexInline(
          value,
          MULTILINE_TOKEN,
          MENTION_TOKEN,
          undefined,
          undefined,
          0,
          value.length,
          2,
        ).index,
      ).toBe(accentEnd);
      expect(
        lineCellColToIndexInline(
          value,
          MULTILINE_TOKEN,
          MENTION_TOKEN,
          undefined,
          undefined,
          0,
          value.length,
          3,
        ).index,
      ).toBe(zwjEnd);
      expect(
        lineCellColToIndexInline(
          value,
          MULTILINE_TOKEN,
          MENTION_TOKEN,
          undefined,
          undefined,
          0,
          value.length,
          8,
        ).index,
      ).toBe(flagEnd);

      expect(
        buildInlineRow(
          value,
          value,
          MULTILINE_TOKEN,
          MENTION_TOKEN,
          undefined,
          undefined,
          0,
          value.length,
          3,
          0,
        ).text,
      ).toBe("e\u0301👩‍💻");
      expect(
        buildInlineSelectionSegments(
          value,
          value,
          MULTILINE_TOKEN,
          MENTION_TOKEN,
          undefined,
          undefined,
          0,
          value.length,
          { start: 0, end: zwjEnd },
          9,
          0,
        ).map((segment) => segment.text),
      ).toEqual(["e\u0301", "👩‍💻"]);
    });
  });
});
