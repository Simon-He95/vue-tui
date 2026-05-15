import { describe, expect, it } from "vitest";
import { charCellWidth } from "../src/core.js";
import { clearTextCaches, sliceByCells, textCellWidth, wrapByCells } from "../src/vue.js";

function segmentGraphemes(text: string): string[] {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      return Array.from(seg.segment(text), (p: any) => p.segment as string);
    }
  } catch {}
  return Array.from(text);
}

describe("unicode width + grapheme safety", () => {
  it("fast paths: ASCII width/slice/wrap behave correctly", () => {
    expect(textCellWidth("abc")).toBe(3);
    expect(sliceByCells("abcdef", 4)).toBe("abcd");
    expect(wrapByCells("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
    expect(wrapByCells("ab\ncdef", 2)).toEqual(["ab", "cd", "ef"]);
  });

  it("sliceByCells does not split combining-mark graphemes", () => {
    const s = `e\u0301x`; // "éx"
    expect(sliceByCells(s, 1)).toBe("e\u0301");
    expect(sliceByCells(s, 2)).toBe("e\u0301x");
  });

  it("sliceByCells does not split ZWJ emoji sequences", () => {
    const s = "👩‍💻X";
    expect(charCellWidth("👩‍💻")).toBe(2);
    expect(sliceByCells(s, 1)).toBe("");
    expect(sliceByCells(s, 2)).toBe("👩‍💻");
    expect(sliceByCells(s, 3)).toBe("👩‍💻X");
  });

  it("wrapByCells respects cell width for mixed graphemes", () => {
    const s = `A中👩‍💻e\u0301B`;
    const lines = wrapByCells(s, 4);
    for (const line of lines) expect(textCellWidth(line)).toBeLessThanOrEqual(4);
    expect(lines.join("")).toBe(s);
  });

  it("emoji presentation width: ✅ is wide, ⏱ is narrow without VS16", () => {
    expect(charCellWidth("✅")).toBe(2);
    expect(charCellWidth("⏱")).toBe(1);
    expect(charCellWidth("⏱️")).toBe(2);
  });

  it("keycap emoji sequences are wide", () => {
    expect(charCellWidth("1")).toBe(1);
    expect(charCellWidth("1️⃣")).toBe(2);
    expect(charCellWidth("#️⃣")).toBe(2);
    expect(charCellWidth("*️⃣")).toBe(2);
    expect(charCellWidth("1\u20E3")).toBe(2); // legacy keycap form: 1⃣
  });

  it("clearTextCaches preserves wrapByCells output", () => {
    const text = "hello world\nand more";
    expect(wrapByCells(text, 5)).toEqual(["hello", " worl", "d", "and m", "ore"]);
    clearTextCaches();
    expect(wrapByCells(text, 5)).toEqual(["hello", " worl", "d", "and m", "ore"]);
  });

  it("fuzz: wrap/slice never exceed cell budget and never split graphemes", () => {
    // Keep deterministic (no Math.random) so failures are stable.
    let seed = 123456;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed;
    };

    const atoms = ["a", "Z", "中", "👩‍💻", "🇺🇸", "✌️", `e\u0301`, "—", "（", "）"];

    for (let i = 0; i < 200; i++) {
      const width = (rand() % 8) + 1;
      const maxCells = rand() % 16;

      let s = "";
      const len = (rand() % 30) + 1;
      for (let j = 0; j < len; j++) {
        const a = atoms[rand() % atoms.length]!;
        s += a;
        if (rand() % 23 === 0) s += "\n";
      }

      const wrapped = wrapByCells(s, width);
      for (const line of wrapped) {
        const wLine = textCellWidth(line);
        if (wLine <= width) continue;
        // If a single grapheme is wider than the budget, it must be kept intact.
        const segs = segmentGraphemes(line);
        expect(segs.length).toBe(1);
        expect(charCellWidth(segs[0]!)).toBe(wLine);
      }
      // Wrapping may introduce extra line breaks, but the grapheme stream is preserved.
      expect(wrapped.join("")).toBe(s.replace(/\r/g, "").replace(/\n/g, ""));

      const plain = s.replace(/\n/g, "");
      const sliced = sliceByCells(plain, maxCells);
      expect(textCellWidth(sliced)).toBeLessThanOrEqual(maxCells);

      const origSeg = segmentGraphemes(plain);
      const slicedSeg = segmentGraphemes(sliced);
      expect(origSeg.slice(0, slicedSeg.length).join("")).toBe(sliced);
    }
  });
});
