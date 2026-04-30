import { describe, expect, test } from "vitest";
import { createGridBuffer, fillRect, putCell } from "../src/core/buffer/buffer.js";

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
});
