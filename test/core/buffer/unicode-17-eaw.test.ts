/**
 * Tests for Unicode 17.0.0 East Asian Width correctness
 * Covers supplementary plane CJK Extensions and ensures terminal tailoring is preserved
 */

import { describe, expect, it } from "vitest";
import { charCellWidth } from "../../../src/core/buffer/width.js";
import { textCellWidth, sliceByCells } from "../../../src/vue/utils/text.js";
import { createTerminal } from "../../../src/core/index.js";

describe("Unicode 17.0.0 Supplementary Plane CJK", () => {
  describe("CJK Unified Ideographs Extensions (B-J)", () => {
    it("Extension B: U+20BB7 (𠮷)", () => {
      expect(charCellWidth("\u{20BB7}")).toBe(2);
      expect(textCellWidth("\u{20BB7}x")).toBe(3);
    });

    it("Extension C: U+2A700", () => {
      expect(charCellWidth("\u{2A700}")).toBe(2);
    });

    it("Extension D: U+2B740", () => {
      expect(charCellWidth("\u{2B740}")).toBe(2);
    });

    it("Extension E: U+2B820 (start)", () => {
      expect(charCellWidth("\u{2B820}")).toBe(2);
    });

    it("Extension E: U+2CEAD (assigned end)", () => {
      expect(charCellWidth("\u{2CEAD}")).toBe(2);
    });

    it("Extension F: U+2CEB0 (start)", () => {
      expect(charCellWidth("\u{2CEB0}")).toBe(2);
    });

    it("Extension F: U+2EBE0 (assigned end)", () => {
      expect(charCellWidth("\u{2EBE0}")).toBe(2);
    });

    it("Extension G: U+30000 (Plane 3)", () => {
      expect(charCellWidth("\u{30000}")).toBe(2);
    });

    it("Extension H: U+31350 (Plane 3)", () => {
      expect(charCellWidth("\u{31350}")).toBe(2);
    });

    it("Extension I: U+2EBF0 (start)", () => {
      expect(charCellWidth("\u{2EBF0}")).toBe(2);
    });

    it("Extension I: U+2EE5D (assigned end)", () => {
      expect(charCellWidth("\u{2EE5D}")).toBe(2);
    });

    it("Extension J: U+323B0 (Unicode 17.0.0, Plane 3)", () => {
      expect(charCellWidth("\u{323B0}")).toBe(2);
    });

    it("Extension J: U+33479 (assigned end)", () => {
      expect(charCellWidth("\u{33479}")).toBe(2);
    });
  });

  describe("Counter-examples: non-CJK supplementary plane", () => {
    it("Musical Symbol G Clef (U+1D11E) should be narrow", () => {
      expect(charCellWidth("\u{1D11E}")).toBe(1); // 𝄞
    });

    it("Mathematical Alphanumeric Symbols should be narrow", () => {
      expect(charCellWidth("\u{1D400}")).toBe(1); // 𝐀
      expect(charCellWidth("\u{1D7FF}")).toBe(1);
    });
  });

  describe("sliceByCells with supplementary CJK", () => {
    it("should not slice supplementary CJK character", () => {
      expect(sliceByCells("\u{20BB7}x", 1)).toBe("");
      expect(sliceByCells("\u{20BB7}x", 2)).toBe("\u{20BB7}");
      expect(sliceByCells("\u{20BB7}x", 3)).toBe("\u{20BB7}x");
    });

    it("should handle multiple supplementary CJK characters", () => {
      const text = "\u{2B820}\u{2CEB0}\u{30000}"; // 3 wide chars = 6 cells
      expect(sliceByCells(text, 0)).toBe("");
      expect(sliceByCells(text, 2)).toBe("\u{2B820}");
      expect(sliceByCells(text, 4)).toBe("\u{2B820}\u{2CEB0}");
      expect(sliceByCells(text, 6)).toBe(text);
    });
  });

  describe("Terminal integration with supplementary CJK", () => {
    it("should write supplementary CJK with continuation cell", () => {
      const terminal = createTerminal({ cols: 5, rows: 1 });
      terminal.write("\u{20BB7}x", { x: 0, y: 0 });

      const cell0 = terminal.getCell(0, 0);
      const cell1 = terminal.getCell(1, 0);
      const cell2 = terminal.getCell(2, 0);

      expect(cell0?.ch).toBe("\u{20BB7}");
      expect(cell0?.width).toBe(2);
      expect(cell1?.continuation).toBe(true);
      expect(cell2?.ch).toBe("x");
    });
  });
});

describe("Terminal Tailoring Preservation (Regression)", () => {
  describe("Variation Selector 16 (VS16) behavior", () => {
    it("⏱ without VS16 should be narrow", () => {
      expect(charCellWidth("⏱")).toBe(1);
    });

    it("⏱️ with VS16 should be wide", () => {
      expect(charCellWidth("⏱️")).toBe(2);
    });

    it("standalone VS16 should be narrow even in cjk mode", () => {
      expect(charCellWidth("\uFE0F", "cjk")).toBe(1);
    });
  });

  describe("Combining marks should remain narrow in all modes", () => {
    it("standalone combining acute should be narrow in cjk mode", () => {
      expect(charCellWidth("\u0301", "cjk")).toBe(1);
    });

    it("combining diacritical marks should be narrow", () => {
      expect(charCellWidth("\u0300", "cjk")).toBe(1); // Combining grave
      expect(charCellWidth("\u0308", "cjk")).toBe(1); // Combining diaeresis
      expect(charCellWidth("\u0323", "cjk")).toBe(1); // Combining dot below
    });

    it("EAW=W combining marks should still be narrow (UAX #11)", () => {
      // These are classified as W in EAW but should be narrow per UAX #11
      expect(charCellWidth("\u3099")).toBe(1); // Combining Katakana-Hiragana Voiced Sound Mark
      expect(charCellWidth("\u3099", "cjk")).toBe(1);

      expect(charCellWidth("\u302A")).toBe(1); // Ideographic Level Tone Mark
      expect(charCellWidth("\u302A", "cjk")).toBe(1);

      expect(charCellWidth("\u{16FE4}")).toBe(1); // Tangut Caesura Mark
      expect(charCellWidth("\u{16FE4}", "cjk")).toBe(1);
    });
  });

  describe("Box drawing should remain narrow in all modes", () => {
    it("box drawing should be narrow in default mode", () => {
      expect(charCellWidth("─", "default")).toBe(1);
      expect(charCellWidth("│", "default")).toBe(1);
      expect(charCellWidth("┌", "default")).toBe(1);
    });

    it("box drawing should be narrow in cjk mode", () => {
      expect(charCellWidth("─", "cjk")).toBe(1);
      expect(charCellWidth("│", "cjk")).toBe(1);
      expect(charCellWidth("┌", "cjk")).toBe(1);
      expect(charCellWidth("╋", "cjk")).toBe(1); // Another box drawing char
    });
  });

  describe("Emoji presentation", () => {
    it("should handle emoji correctly", () => {
      // These tests verify existing emoji behavior is preserved
      expect(charCellWidth("😀")).toBe(2);
      expect(charCellWidth("🎉")).toBe(2);
    });
  });

  describe("Ambiguous width in cjk mode", () => {
    it("Greek letters should be narrow in default mode", () => {
      expect(charCellWidth("Ω", "default")).toBe(1);
    });

    it("Greek letters should be wide in cjk mode", () => {
      expect(charCellWidth("Ω", "cjk")).toBe(2);
    });

    it("supplementary private-use should be ambiguous", () => {
      // Supplementary Private Use Area A (U+F0000-U+FFFFD) is EAW=A
      expect(charCellWidth("\u{F0000}", "default")).toBe(1);
      expect(charCellWidth("\u{F0000}", "cjk")).toBe(2);

      // Supplementary Private Use Area B (U+100000-U+10FFFD) is EAW=A
      expect(charCellWidth("\u{100000}", "default")).toBe(1);
      expect(charCellWidth("\u{100000}", "cjk")).toBe(2);
    });

    it("VS supplement should be tailored narrow despite being ambiguous", () => {
      // Variation Selectors Supplement (U+E0100-U+E01EF) is EAW=A
      // But should be narrow even in cjk mode due to terminal tailoring
      expect(charCellWidth("\u{E0100}", "cjk")).toBe(1);
    });
  });
});

describe("Mixed content with supplementary CJK", () => {
  it("should calculate width correctly for mixed ASCII and supplementary CJK", () => {
    const text = "a\u{20BB7}b"; // a + 𠮷 + b = 1 + 2 + 1 = 4
    expect(textCellWidth(text)).toBe(4);
  });

  it("should calculate width correctly for mixed BMP CJK and supplementary CJK", () => {
    const text = "中\u{2B820}文"; // 中 + Ext E + 文 = 2 + 2 + 2 = 6
    expect(textCellWidth(text)).toBe(6);
  });

  it("should handle long supplementary CJK text", () => {
    const text = "\u{20BB7}".repeat(100); // 100 wide chars = 200 cells
    expect(textCellWidth(text)).toBe(200);
  });
});
