import { createApp, defineComponent, h, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { charCellWidth, createTerminal } from "../src/core.js";
import {
  TerminalProvider,
  TText,
  clearTextCaches,
  sliceByCells,
  textCellWidth,
  useTerminal,
  wrapByCells,
} from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";
import type { Terminal, WidthProvider } from "../src/core.js";

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

  it("keeps ambiguous-width symbols narrow by default and wide in cjk mode", () => {
    const ambiguous = ["·", "Ω", "—", "①", "★"];
    for (const ch of ambiguous) {
      expect(charCellWidth(ch)).toBe(1);
      expect(charCellWidth(ch, "narrow-ambiguous")).toBe(1);
      expect(charCellWidth(ch, "cjk")).toBe(2);
    }
  });

  it("keeps box drawing glyphs narrow in cjk mode", () => {
    const boxDrawing = ["┌", "┐", "└", "┘", "─", "│", "═", "╳"];
    for (const ch of boxDrawing) {
      expect(charCellWidth(ch)).toBe(1);
      expect(charCellWidth(ch, "cjk")).toBe(1);
    }
  });

  it("keeps empty text width stable for custom width providers", () => {
    let calls = 0;
    const provider: WidthProvider = () => {
      calls++;
      return 2;
    };

    expect(charCellWidth("", provider)).toBe(1);
    expect(calls).toBe(0);
  });

  it("uses custom width providers in terminal buffers", () => {
    const terminal = createTerminal({
      cols: 5,
      rows: 1,
      widthProvider: (text) => (text === "·" ? 2 : charCellWidth(text)),
    });

    terminal.write("a·b", { x: 0, y: 0 });

    expect(terminal.getCell(0, 0).ch).toBe("a");
    expect(terminal.getCell(1, 0).ch).toBe("·");
    expect(terminal.getCell(1, 0).width).toBe(2);
    expect(terminal.getCell(2, 0).continuation).toBe(true);
    expect(terminal.getCell(3, 0).ch).toBe("b");
  });

  it("terminal.write keeps ASCII-leading combining graphemes intact", () => {
    const terminal = createTerminal({ cols: 6, rows: 1 });

    terminal.write("e\u0301x", { x: 0, y: 0 });

    expect(terminal.getCell(0, 0).ch).toBe("e\u0301");
    expect(terminal.getCell(1, 0).ch).toBe("x");
  });

  it("terminal.write keeps keycap emoji as one wide grapheme", () => {
    const terminal = createTerminal({ cols: 6, rows: 1 });

    terminal.write("1️⃣x", { x: 0, y: 0 });

    expect(terminal.getCell(0, 0).ch).toBe("1️⃣");
    expect(terminal.getCell(0, 0).width).toBe(2);
    expect(terminal.getCell(1, 0).continuation).toBe(true);
    expect(terminal.getCell(2, 0).ch).toBe("x");
  });

  it("passes widthProvider through Vue text layout in createTerminalApp", async () => {
    const App = defineComponent({
      name: "WidthProviderTextLayoutTest",
      setup() {
        return () => h(TText, { x: 0, y: 0, w: 2, h: 1, value: "Ωx" });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 1, widthProvider: "cjk", component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flush();

      expect(app.terminal.getCell(0, 0).ch).toBe("Ω");
      expect(app.terminal.getCell(0, 0).width).toBe(2);
      expect(app.terminal.getCell(1, 0).continuation).toBe(true);
      expect(app.terminal.getCell(2, 0).ch).toBe(" ");
    } finally {
      app.dispose();
    }
  });

  it("passes widthProvider through TerminalProvider", async () => {
    let terminal: Terminal | null = null;
    const Probe = defineComponent({
      name: "TerminalProviderWidthProviderProbe",
      setup() {
        terminal = useTerminal().terminal;
        return () => null;
      },
    });
    const root = document.createElement("div");
    const app = createApp({
      name: "TerminalProviderWidthProviderTest",
      render() {
        return h(
          TerminalProvider,
          { cols: 4, rows: 1, widthProvider: "cjk" },
          { default: () => h(Probe) },
        );
      },
    });

    try {
      app.mount(root);
      await nextTick();
      terminal!.write("Ωx", { x: 0, y: 0 });

      expect(terminal!.getCell(0, 0).ch).toBe("Ω");
      expect(terminal!.getCell(0, 0).width).toBe(2);
      expect(terminal!.getCell(1, 0).continuation).toBe(true);
      expect(terminal!.getCell(2, 0).ch).toBe("x");
    } finally {
      app.unmount();
    }
  });

  it("Vue text utilities accept the same widthProvider", () => {
    expect(textCellWidth("Ωx", "cjk")).toBe(3);
    expect(sliceByCells("Ωx", 2, "cjk")).toBe("Ω");
    expect(wrapByCells("Ωx", 2, "cjk")).toEqual(["Ω", "x"]);
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
