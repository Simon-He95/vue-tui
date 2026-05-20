import { afterEach, describe, expect, it, vi } from "vitest";

function stubIntlWithoutSegmenter(): void {
  const stub = Object.create(Intl) as typeof Intl;
  Object.defineProperty(stub, "Segmenter", { value: undefined, configurable: true });
  vi.stubGlobal("Intl", stub);
}

async function importWithoutSegmenter<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  stubIntlWithoutSegmenter();
  return load();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("unicode fallback without Intl.Segmenter", () => {
  it("keeps complex emoji clusters intact in text utilities", async () => {
    const { sliceByCells, sliceByCellsRange, textCellWidth, wrapByCells } =
      await importWithoutSegmenter(() => import("../src/vue/utils/text.js"));
    const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
    const rainbowFlag = "\u{1F3F3}\uFE0F\u200D\u{1F308}";
    const pirateFlag = "\u{1F3F4}\u200D\u2620\uFE0F";
    const keycapOne = "1\uFE0F\u20E3";
    const combiningE = "e\u0301";
    const englandFlag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";

    for (const cluster of [coder, rainbowFlag, pirateFlag, keycapOne, englandFlag]) {
      expect(textCellWidth(cluster)).toBe(2);
      expect(sliceByCells(`${cluster}x`, 1)).toBe("");
      expect(sliceByCells(`${cluster}x`, 2)).toBe(cluster);
      expect(sliceByCellsRange(`x${cluster}y`, 1, 3)).toBe(cluster);
    }

    expect(textCellWidth(combiningE)).toBe(1);
    expect(sliceByCells(`${combiningE}x`, 1)).toBe(combiningE);
    expect(wrapByCells(`a${coder}b`, 3)).toEqual([`a${coder}`, "b"]);
  });

  it("keeps complex emoji clusters intact in terminal writes", async () => {
    const { createTerminal } = await importWithoutSegmenter(
      () => import("../src/core/terminal/create-terminal.js"),
    );
    const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
    const keycapOne = "1\uFE0F\u20E3";
    const terminal = createTerminal({ cols: 8, rows: 1 });

    terminal.write(`${coder}${keycapOne}x`, { x: 0, y: 0 });

    expect(terminal.getCell(0, 0).ch).toBe(coder);
    expect(terminal.getCell(0, 0).width).toBe(2);
    expect(terminal.getCell(1, 0).continuation).toBe(true);
    expect(terminal.getCell(2, 0).ch).toBe(keycapOne);
    expect(terminal.getCell(2, 0).width).toBe(2);
    expect(terminal.getCell(3, 0).continuation).toBe(true);
    expect(terminal.getCell(4, 0).ch).toBe("x");
  });
});
