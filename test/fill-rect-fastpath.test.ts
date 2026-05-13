import { describe, expect, test } from "vitest";
import {
  createGridBuffer,
  fillRect,
  getRowFingerprints,
  putCell,
  setFingerprintFn,
} from "../src/core/buffer/buffer.js";

describe("buffer fillRect fast path", () => {
  test("clears wide base when overwriting a continuation cell (start boundary)", () => {
    const buffer = createGridBuffer(4, 1);
    putCell(buffer, 0, 0, "界", { fg: "green" });
    expect(buffer.grid[0]![1]!.continuation).toBe(true);

    fillRect(buffer, 1, 0, 1, 1, "-", { fg: "blue" });

    expect(buffer.grid[0]![0]!.ch).toBe(" ");
    expect(buffer.grid[0]![0]!.width).toBe(1);
    expect(buffer.grid[0]![1]!.ch).toBe("-");
    expect(buffer.grid[0]![1]!.continuation).toBeUndefined();
  });

  test("clears dangling continuation when overwriting a wide base (end boundary)", () => {
    const buffer = createGridBuffer(4, 1);
    putCell(buffer, 1, 0, "界", { fg: "green" });
    expect(buffer.grid[0]![2]!.continuation).toBe(true);

    fillRect(buffer, 1, 0, 1, 1, "-", { fg: "blue" });

    expect(buffer.grid[0]![1]!.ch).toBe("-");
    expect(buffer.grid[0]![2]!.continuation).toBeUndefined();
    expect(buffer.grid[0]![2]!.ch).toBe(" ");
  });

  test("fills with wide glyphs without corrupting continuation cells", () => {
    const buffer = createGridBuffer(6, 1);

    fillRect(buffer, 0, 0, 6, 1, "中");

    expect(buffer.grid[0]![0]!.ch).toBe("中");
    expect(buffer.grid[0]![1]!.continuation).toBe(true);
    expect(buffer.grid[0]![2]!.ch).toBe("中");
    expect(buffer.grid[0]![3]!.continuation).toBe(true);
    expect(buffer.grid[0]![4]!.ch).toBe("中");
    expect(buffer.grid[0]![5]!.continuation).toBe(true);
  });

  test("does not write a partial wide glyph at the right edge", () => {
    const buffer = createGridBuffer(5, 1);

    fillRect(buffer, 0, 0, 5, 1, "中");

    expect(buffer.grid[0]![4]!.ch).toBe(" ");
    expect(buffer.grid[0]![4]!.continuation).toBeUndefined();
  });

  test("clears existing wide glyphs overlapped by new continuations", () => {
    const buffer = createGridBuffer(4, 1);
    putCell(buffer, 1, 0, "界");

    fillRect(buffer, 0, 0, 4, 1, "中");

    expect(buffer.grid[0]![0]!.ch).toBe("中");
    expect(buffer.grid[0]![1]!.continuation).toBe(true);
    expect(buffer.grid[0]![2]!.ch).toBe("中");
    expect(buffer.grid[0]![3]!.continuation).toBe(true);
  });

  test("updates fingerprints when filling with wide glyphs", () => {
    const buffer = createGridBuffer(4, 1);
    setFingerprintFn(buffer, (ch) => {
      if (ch === "中") return 1;
      if (ch === "") return 2;
      return 3;
    });

    fillRect(buffer, 0, 0, 4, 1, "中");

    expect(Array.from(getRowFingerprints(buffer, 0)!)).toEqual([1, 2, 1, 2]);
  });
});
