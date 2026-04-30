import { describe, expect, it } from "vitest";
import { textCellWidth, withTextRenderPass } from "../src/vue/utils/text.js";

describe("text render-pass cache", () => {
  it("returns consistent widths inside a render pass", () => {
    const s = "a🙂b";
    const expected = textCellWidth(s);
    const got = withTextRenderPass(() => {
      expect(textCellWidth(s)).toBe(expected);
      expect(textCellWidth(s)).toBe(expected);
      return textCellWidth(s);
    });
    expect(got).toBe(expected);
  });

  it("supports nesting", () => {
    const s = "🙂🙂";
    const expected = textCellWidth(s);
    const got = withTextRenderPass(() => withTextRenderPass(() => textCellWidth(s)));
    expect(got).toBe(expected);
  });
});
