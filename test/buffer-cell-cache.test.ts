import { describe, expect, test } from "vitest";
import {
  createCell,
  createContinuationCell,
  createGridBuffer,
  fillRect,
  putCell,
} from "../src/core/buffer/buffer.js";

describe("buffer cell caching", () => {
  test("createCell reuses instances per (style, ch)", () => {
    const style = { fg: "red" as const };
    const a = createCell("x", style);
    const b = createCell("x", style);
    expect(a).toBe(b);
    expect(a.style).toBe(b.style);
  });

  test("caching is safe with wide chars + continuation", () => {
    const buffer = createGridBuffer(4, 1);
    putCell(buffer, 0, 0, "界", { fg: "green" });
    putCell(buffer, 2, 0, "界", { fg: "green" });
    expect(buffer.grid[0]![1]!.continuation).toBe(true);
    expect(buffer.grid[0]![3]!.continuation).toBe(true);
  });

  test("fillRect uses cached cells for repeated glyphs", () => {
    const buffer = createGridBuffer(5, 1);
    fillRect(buffer, 0, 0, 5, 1, "-", { fg: "blue" });
    expect(buffer.grid[0]![0]!).toBe(buffer.grid[0]![1]!);
    expect(buffer.grid[0]![1]!).toBe(buffer.grid[0]![2]!);
  });

  test("continuation cells are cached per style", () => {
    const style = { fg: "yellow" as const };
    const a = createContinuationCell(style);
    const b = createContinuationCell(style);
    expect(a).toBe(b);
  });
});
