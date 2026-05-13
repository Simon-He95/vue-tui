import { describe, expect, it } from "vitest";
import type { GridBuffer } from "../src/core/buffer/buffer.js";
import {
  clearRect,
  createGridBuffer,
  fillRect,
  getBufferRow,
  putCell,
  resizeBuffer,
  scrollBuffer,
  scrollBufferRegion,
} from "../src/core/buffer/buffer.js";

function assertWideCellInvariants(buffer: GridBuffer): void {
  for (let y = 0; y < buffer.rows; y++) {
    const row = getBufferRow(buffer, y);
    expect(row.length).toBe(buffer.cols);
    for (let x = 0; x < buffer.cols; x++) {
      const cell = row[x]!;
      if (cell.continuation) {
        expect(x, `dangling continuation at ${x},${y}`).toBeGreaterThan(0);
        const prev = row[x - 1]!;
        expect(prev.continuation, `continuation follows continuation at ${x},${y}`).toBeUndefined();
        expect(prev.width, `continuation without wide base at ${x},${y}`).toBe(2);
        continue;
      }
      if (cell.width === 2) {
        expect(x + 1, `wide base at row edge ${x},${y}`).toBeLessThan(buffer.cols);
        expect(row[x + 1]?.continuation, `wide base without continuation at ${x},${y}`).toBe(true);
      }
    }
  }
}

describe("terminal buffer unicode fuzz", () => {
  it("preserves wide cell invariants after random writes, clears, fills, resizes, and scrolls", () => {
    let seed = 123456;
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed;
    };
    const int = (max: number) => next() % max;
    const glyphs = ["A", "中", "界", "✅", "🙂", " "];
    const buffer = createGridBuffer(8, 4);

    for (let step = 0; step < 500; step++) {
      switch (int(6)) {
        case 0:
          putCell(
            buffer,
            int(Math.max(1, buffer.cols)),
            int(Math.max(1, buffer.rows)),
            glyphs[int(glyphs.length)]!,
          );
          break;
        case 1:
          fillRect(
            buffer,
            int(buffer.cols + 2) - 1,
            int(buffer.rows + 2) - 1,
            int(5),
            int(3),
            glyphs[int(glyphs.length)]!,
          );
          break;
        case 2:
          clearRect(buffer, int(buffer.cols + 2) - 1, int(buffer.rows + 2) - 1, int(5), int(3));
          break;
        case 3:
          resizeBuffer(buffer, 1 + int(12), 1 + int(6));
          break;
        case 4:
          scrollBuffer(buffer, int(7) - 3);
          break;
        case 5: {
          const start = int(buffer.rows);
          const end = start + int(buffer.rows - start + 1);
          scrollBufferRegion(buffer, start, end, int(5) - 2);
          break;
        }
      }

      assertWideCellInvariants(buffer);
    }
  });
});
