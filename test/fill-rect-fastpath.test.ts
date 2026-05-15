import { describe, expect, test } from "vitest";
import {
  clearRect,
  createGridBuffer,
  fillRect,
  getBufferCell,
  getRowFingerprints,
  putCell,
  scrollBuffer,
  setFingerprintFn,
  snapshotText,
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

  test("updates fingerprints when 1-cell fill clears trailing wide continuation", () => {
    const buffer = createGridBuffer(4, 1);
    setFingerprintFn(buffer, (ch) => {
      if (ch === "中") return 1;
      if (ch === "") return 2;
      if (ch === "A") return 3;
      if (ch === " ") return 4;
      return 9;
    });

    putCell(buffer, 1, 0, "中");
    fillRect(buffer, 1, 0, 1, 1, "A");

    expect(buffer.grid[0]![1]!.ch).toBe("A");
    expect(buffer.grid[0]![2]!.ch).toBe(" ");
    expect(Array.from(getRowFingerprints(buffer, 0)!)).toEqual([4, 3, 4, 4]);
  });

  test("updates fingerprints when putCell overwrites a wide continuation", () => {
    const buffer = createGridBuffer(4, 1);
    setFingerprintFn(buffer, (ch) => {
      if (ch === "中") return 1;
      if (ch === "") return 2;
      if (ch === "A") return 3;
      if (ch === " ") return 4;
      return 9;
    });

    putCell(buffer, 1, 0, "中");
    putCell(buffer, 2, 0, "A");

    expect(buffer.grid[0]![1]!.ch).toBe(" ");
    expect(buffer.grid[0]![2]!.ch).toBe("A");
    expect(Array.from(getRowFingerprints(buffer, 0)!)).toEqual([4, 4, 3, 4]);
  });
});

describe("buffer clearRect wide boundaries", () => {
  test("recomputes fingerprints after full clear", () => {
    const buffer = createGridBuffer(4, 2);
    const fp = (ch: string, style: any) =>
      ((style.fg === "red" ? 1 : 0) << 16) | (ch.charCodeAt(0) || 0);
    setFingerprintFn(buffer, fp);
    putCell(buffer, 0, 0, "A", { fg: "red" });
    putCell(buffer, 1, 1, "B", { fg: "red" });

    clearRect(buffer);

    for (let y = 0; y < buffer.rows; y++) {
      const row = buffer.grid[y]!;
      const fingerprints = getRowFingerprints(buffer, y);
      expect(fingerprints).not.toBeNull();
      for (let x = 0; x < buffer.cols; x++) {
        const cell = row[x]!;
        expect(fingerprints![x]).toBe(fp(cell.ch, cell.style));
      }
    }
  });

  test("clears wide base when range starts at continuation", () => {
    const buffer = createGridBuffer(4, 1);
    putCell(buffer, 0, 0, "中");

    clearRect(buffer, 1, 0, 1, 1);

    expect(buffer.grid[0]![0]!.ch).toBe(" ");
    expect(buffer.grid[0]![1]!.ch).toBe(" ");
    expect(buffer.grid[0]![1]!.continuation).toBeUndefined();
  });

  test("clears trailing continuation when range ends after wide base", () => {
    const buffer = createGridBuffer(4, 1);
    putCell(buffer, 1, 0, "中");

    clearRect(buffer, 1, 0, 1, 1);

    expect(buffer.grid[0]![1]!.ch).toBe(" ");
    expect(buffer.grid[0]![2]!.ch).toBe(" ");
    expect(buffer.grid[0]![2]!.continuation).toBeUndefined();
  });

  test("recomputes fingerprints after clearing wide boundaries", () => {
    const buffer = createGridBuffer(4, 1);
    setFingerprintFn(buffer, (ch) => {
      if (ch === "中") return 1;
      if (ch === "") return 2;
      if (ch === " ") return 3;
      return 9;
    });

    putCell(buffer, 0, 0, "中");
    clearRect(buffer, 1, 0, 1, 1);

    expect(Array.from(getRowFingerprints(buffer, 0)!)).toEqual([3, 3, 3, 3]);
  });
});

describe("buffer scroll fingerprints", () => {
  test("recomputes inserted bottom rows after scrolling up", () => {
    const buffer = createGridBuffer(3, 3);
    setFingerprintFn(buffer, (ch) => (ch === " " ? 0 : ch.charCodeAt(0)));
    putCell(buffer, 0, 0, "A");
    putCell(buffer, 0, 1, "B");
    putCell(buffer, 0, 2, "C");

    scrollBuffer(buffer, 1);

    expect(Array.from(getRowFingerprints(buffer, 0)!)).toEqual([66, 0, 0]);
    expect(Array.from(getRowFingerprints(buffer, 1)!)).toEqual([67, 0, 0]);
    expect(Array.from(getRowFingerprints(buffer, 2)!)).toEqual([0, 0, 0]);
  });

  test("recomputes inserted top rows after scrolling down", () => {
    const buffer = createGridBuffer(3, 3);
    setFingerprintFn(buffer, (ch) => (ch === " " ? 0 : ch.charCodeAt(0)));
    putCell(buffer, 0, 0, "A");
    putCell(buffer, 0, 1, "B");
    putCell(buffer, 0, 2, "C");

    scrollBuffer(buffer, -1);

    expect(Array.from(getRowFingerprints(buffer, 0)!)).toEqual([0, 0, 0]);
    expect(Array.from(getRowFingerprints(buffer, 1)!)).toEqual([65, 0, 0]);
    expect(Array.from(getRowFingerprints(buffer, 2)!)).toEqual([66, 0, 0]);
  });

  test("keeps all visible fingerprints in sync after full-buffer scroll", () => {
    const buffer = createGridBuffer(4, 4);
    const fingerprint = (ch: string) => (ch === " " ? 0 : ch.charCodeAt(0));
    setFingerprintFn(buffer, fingerprint);
    putCell(buffer, 0, 0, "A");
    putCell(buffer, 1, 1, "B");
    putCell(buffer, 2, 2, "C");
    putCell(buffer, 3, 3, "D");
    buffer.soaFingerprints!.fill(999);

    scrollBuffer(buffer, 1);

    for (let y = 0; y < buffer.rows; y++) {
      const actual = Array.from(getRowFingerprints(buffer, y)!);
      const expected = Array.from({ length: buffer.cols }, (_, x) =>
        fingerprint(getBufferCell(buffer, x, y).ch),
      );
      expect(actual).toEqual(expected);
    }
  });

  test("clamps large scrollBuffer operations to visible rows", () => {
    const buffer = createGridBuffer(5, 3);
    setFingerprintFn(buffer, (ch) => ch.charCodeAt(0) || 0);
    putCell(buffer, 0, 0, "a");
    putCell(buffer, 0, 1, "b");
    putCell(buffer, 0, 2, "c");

    scrollBuffer(buffer, 100);

    expect(snapshotText(buffer)).toEqual(["     ", "     ", "     "]);
    expect(buffer.scrollback.length).toBeLessThanOrEqual(3);
  });
});
