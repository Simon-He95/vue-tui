import { describe, expect, test } from "vitest";
import {
  createBlankCell,
  createContinuationCell,
  normalizeStyle,
} from "../src/core/buffer/buffer.js";
import { createTerminal } from "../src/index.js";

describe("buffer style normalization caching", () => {
  test("normalizeStyle(undefined) returns a stable default style", () => {
    expect(normalizeStyle()).toBe(normalizeStyle());
  });

  test("normalizeStyle returns frozen clones for mutable styles and memoizes by identity", () => {
    const input = { fg: "red" } as any;
    const a = normalizeStyle(input);
    const b = normalizeStyle(input);
    expect(a).toBe(b);
    expect(a).not.toBe(input);
    expect(Object.isFrozen(a)).toBe(true);
  });

  test("normalizeStyle returns the same frozen style object when already frozen", () => {
    const frozen = Object.freeze({ fg: "blue" }) as any;
    expect(normalizeStyle(frozen)).toBe(frozen);
  });

  test("blank/continuation cells are cached per normalized style", () => {
    const style = { fg: "green" } as any;
    const blankA = createBlankCell(style);
    const blankB = createBlankCell(style);
    expect(blankA).toBe(blankB);

    const contA = createContinuationCell(style);
    const contB = createContinuationCell(style);
    expect(contA).toBe(contB);
  });

  test("treats style objects as immutable after first normalization", () => {
    const style = { fg: "red" } as any;
    const terminal = createTerminal({ cols: 2, rows: 1 });

    terminal.write("A", { x: 0, y: 0, style });
    style.fg = "blue";
    terminal.write("B", { x: 1, y: 0, style });

    expect(terminal.getCell(0, 0).style.fg).toBe("red");
    expect(terminal.getCell(1, 0).style.fg).toBe("red");
  });
});
