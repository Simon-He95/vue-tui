import { describe, expect, it, vi } from "vitest";

import { createTerminal } from "../src/index.js";
import { getPlaneTerminal, scrollPlaneRows } from "../src/core/terminal/create-terminal.js";

function lines(cols: number, rows: number, init?: (t: ReturnType<typeof createTerminal>) => void) {
  const t = createTerminal({ cols, rows });
  init?.(t);
  return t.snapshot().lines;
}

describe("terminal core", () => {
  it("initial buffer is blank", () => {
    expect(lines(5, 3)).toEqual(["     ", "     ", "     "]);
  });

  it("write/overwrite/clear work", () => {
    const t = createTerminal({ cols: 5, rows: 2 });
    t.write("abc", { x: 0, y: 0 });
    expect(t.snapshot().lines[0]).toBe("abc  ");

    t.put(1, 0, "Z");
    expect(t.snapshot().lines[0]).toBe("aZc  ");

    t.clear(1, 0, 2, 1);
    expect(t.snapshot().lines[0]).toBe("a    ");
  });

  it("fill works", () => {
    const t = createTerminal({ cols: 5, rows: 2 });
    t.fill(0, 1, 5, 1, "-");
    expect(t.snapshot().lines).toEqual(["     ", "-----"]);
  });

  it("write wraps to next line", () => {
    const t = createTerminal({ cols: 3, rows: 2 });
    t.write("abcd", { x: 0, y: 0 });
    expect(t.snapshot().lines).toEqual(["abc", "d  "]);
  });

  it("cursor-driven writes advance when x/y are omitted", () => {
    const t = createTerminal({ cols: 3, rows: 2 });
    t.write("ab");
    t.write("c");
    expect(t.snapshot().lines).toEqual(["abc", "   "]);
    t.write("d");
    expect(t.snapshot().lines).toEqual(["abc", "d  "]);
  });

  it("scroll moves rows up", () => {
    const t = createTerminal({ cols: 4, rows: 3 });
    t.write("1111", { x: 0, y: 0 });
    t.write("2222", { x: 0, y: 1 });
    t.write("3333", { x: 0, y: 2 });
    t.scroll(1);
    expect(t.snapshot().lines).toEqual(["2222", "3333", "    "]);
    expect(t.getScrollbackLines()).toEqual(["1111"]);
  });

  it("scroll maintains logical row order across multiple scrolls", () => {
    const t = createTerminal({ cols: 4, rows: 3 });
    t.write("AAAA", { x: 0, y: 0 });
    t.write("BBBB", { x: 0, y: 1 });
    t.write("CCCC", { x: 0, y: 2 });
    t.scroll(2);
    expect(t.snapshot().lines).toEqual(["CCCC", "    ", "    "]);
    expect(t.getScrollbackLines()).toEqual(["AAAA", "BBBB"]);

    t.write("DDDD", { x: 0, y: 2 });
    expect(t.snapshot().lines).toEqual(["CCCC", "    ", "DDDD"]);
    expect(t.getCell(0, 0).ch).toBe("C");
    expect(t.getCell(0, 2).ch).toBe("D");
  });

  it("scrolling down inserts blank rows at the top without affecting scrollback", () => {
    const t = createTerminal({ cols: 3, rows: 2 });
    t.write("abc", { x: 0, y: 0 });
    t.write("def", { x: 0, y: 1 });
    t.scroll(-1);
    expect(t.snapshot().lines).toEqual(["   ", "abc"]);
    expect(t.getScrollbackLines()).toEqual([]);
  });

  it("resize keeps top-left content", () => {
    const t = createTerminal({ cols: 4, rows: 2 });
    t.write("abcd", { x: 0, y: 0 });
    t.write("WXYZ", { x: 0, y: 1 });

    t.resize(2, 3);
    expect(t.snapshot().lines).toEqual(["ab", "WX", "  "]);

    t.resize(5, 1);
    expect(t.snapshot().lines).toEqual(["ab   "]);
  });

  it("wide chars occupy two cells", () => {
    const t = createTerminal({ cols: 4, rows: 1 });
    t.put(0, 0, "你");
    expect(t.getCell(0, 0).width).toBe(2);
    expect(t.getCell(1, 0).continuation).toBe(true);
    expect(t.snapshot().lines).toEqual(["你   "]);
  });

  it("wide chars are clipped if they cannot fit", () => {
    const t = createTerminal({ cols: 2, rows: 1 });
    t.put(1, 0, "你");
    expect(t.snapshot().lines).toEqual(["  "]);
  });

  it("batch merges commits into a single commit event", () => {
    const t = createTerminal({ cols: 3, rows: 1 });
    const onCommit = vi.fn();
    t.on("commit", onCommit);

    // Clear initial dirty state.
    t.commit();
    onCommit.mockClear();

    t.batch(() => {
      t.write("a", { x: 0, y: 0 });
      t.commit();
      t.write("b", { x: 1, y: 0 });
      t.commit();
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].dirtyRows).toEqual([0]);
    expect(t.snapshot().lines).toEqual(["ab "]);
  });

  it("size() returns cols/rows without snapshot lines", () => {
    const t = createTerminal({ cols: 7, rows: 4 });
    expect(t.size()).toEqual({ cols: 7, rows: 4 });
    t.resize(2, 3);
    expect(t.size()).toEqual({ cols: 2, rows: 3 });
  });

  it("commit returns null for full repaint", () => {
    const t = createTerminal({ cols: 2, rows: 2 });
    const seen: Array<readonly number[] | null> = [];
    t.on("commit", ({ dirtyRows }) => seen.push(dirtyRows));

    // Initial state is full dirty.
    expect(t.commit()).toBeNull();
    expect(seen.at(-1)).toBeNull();

    // Partial dirty produces concrete rows.
    t.put(0, 0, "A");
    expect(t.commit()).toEqual([0]);

    // Full clear produces full repaint again.
    t.clear();
    expect(t.commit()).toBeNull();
  });

  it("commits plane scroll operations while only dirtying newly revealed rows", () => {
    const t = createTerminal({ cols: 4, rows: 5 });
    const transcript = getPlaneTerminal(t, "transcript");
    const commits: any[] = [];
    t.on("commit", (event) => commits.push(event));

    transcript.write("A", { x: 0, y: 1 });
    transcript.write("B", { x: 0, y: 2 });
    transcript.write("C", { x: 0, y: 3 });
    t.commit({ planes: ["transcript"] });
    commits.length = 0;

    scrollPlaneRows(t, "transcript", 1, 4, 1);
    transcript.write("D", { x: 0, y: 3 });
    const dirtyRows = t.commit({ planes: ["transcript"] });

    expect(dirtyRows).toEqual([3]);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.scrollOperations).toEqual([{ startY: 1, endY: 4, delta: 1 }]);
    expect(t.snapshot().lines).toEqual(["    ", "B   ", "C   ", "D   ", "    "]);
  });
});
