import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import {
  getComposedRowBeforePlane,
  getPlaneRowCoverageKind,
  getPlaneTerminal,
  resetPlaneRowsForRender,
  scrollPlaneRows,
} from "../src/core/terminal/create-terminal.js";
import type { Cell, TerminalCommitEvent } from "../src/core/types.js";

function writeNumberedRows(terminal: ReturnType<typeof createTerminal>): void {
  const { rows } = terminal.size();
  for (let y = 0; y < rows; y++) {
    terminal.write(String(y).repeat(4), { x: 0, y });
  }
  terminal.commit({ sync: true });
}

function rowText(row: readonly Cell[]): string {
  return row.map((cell) => (cell.continuation ? " " : cell.ch || " ")).join("");
}

describe("terminal scroll operations", () => {
  it("composes rows before the overlay plane from lower planes only", () => {
    const terminal = createTerminal({ cols: 5, rows: 1 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const chrome = getPlaneTerminal(terminal, "chrome");
    const overlay = getPlaneTerminal(terminal, "overlay");

    terminal.write("abcde", { x: 0, y: 0 });
    transcript.write("T", { x: 1, y: 0 });
    chrome.write("C", { x: 3, y: 0 });
    overlay.write("O", { x: 2, y: 0 });

    expect(rowText(getComposedRowBeforePlane(terminal, "overlay", 0)!)).toBe("aTcCe");
  });

  it("clears split wide characters when composing before the overlay plane", () => {
    const terminal = createTerminal({ cols: 4, rows: 1 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const chrome = getPlaneTerminal(terminal, "chrome");

    transcript.put(0, 0, "你");
    chrome.put(1, 0, "X");

    expect(rowText(getComposedRowBeforePlane(terminal, "overlay", 0)!)).toBe(" X  ");
  });

  it("clears render coverage for only the requested plane rows", () => {
    const terminal = createTerminal({ cols: 4, rows: 3 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const overlay = getPlaneTerminal(terminal, "overlay");

    transcript.write("tttt", { x: 0, y: 0 });
    transcript.write("ssss", { x: 0, y: 1 });
    overlay.write("oooo", { x: 0, y: 1 });
    terminal.commit({ sync: true });

    resetPlaneRowsForRender(terminal, "transcript", [1]);
    terminal.commit({ planes: ["transcript"], sync: true });

    expect(getPlaneRowCoverageKind(terminal, "transcript", 0)).toBe(2);
    expect(getPlaneRowCoverageKind(terminal, "transcript", 1)).toBe(0);
    expect(getPlaneRowCoverageKind(terminal, "overlay", 1)).toBe(2);
    expect(transcript.snapshot().lines[1]).toBe("    ");
    expect(terminal.snapshot().lines[1]).toBe("oooo");
  });

  it("emits two disjoint scroll operations in one commit", () => {
    const terminal = createTerminal({ cols: 4, rows: 8 });
    const commits: TerminalCommitEvent[] = [];
    const off = terminal.on("commit", (event) => commits.push(event));

    try {
      writeNumberedRows(terminal);
      commits.length = 0;

      scrollPlaneRows(terminal, "default", 0, 3, 1);
      scrollPlaneRows(terminal, "default", 5, 8, 1);
      terminal.commit({ planes: ["default"], sync: true });

      expect(commits.at(-1)?.scrollOperations).toEqual([
        { startY: 0, endY: 3, delta: 1 },
        { startY: 5, endY: 8, delta: 1 },
      ]);
    } finally {
      off();
      terminal.dispose();
    }
  });

  it("keeps a plane scroll operation when no higher plane covers the scrolled rows", () => {
    const terminal = createTerminal({ cols: 4, rows: 5 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const commits: TerminalCommitEvent[] = [];
    const off = terminal.on("commit", (event) => commits.push(event));

    try {
      for (let y = 1; y < 4; y++) transcript.write(String(y).repeat(4), { x: 0, y });
      terminal.commit({ planes: ["transcript"], sync: true });
      commits.length = 0;

      scrollPlaneRows(terminal, "transcript", 1, 4, 1);
      terminal.commit({ planes: ["transcript"], sync: true });

      expect(commits.at(-1)?.scrollOperations).toEqual([{ startY: 1, endY: 4, delta: 1 }]);
      expect(commits.at(-1)?.dirtyRows).toEqual([3]);
    } finally {
      off();
      terminal.dispose();
    }
  });

  it("drops a plane scroll operation when higher planes fully cover the scrolled rows", () => {
    const terminal = createTerminal({ cols: 4, rows: 5 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const overlay = getPlaneTerminal(terminal, "overlay");
    const commits: TerminalCommitEvent[] = [];
    const off = terminal.on("commit", (event) => commits.push(event));

    try {
      for (let y = 1; y < 4; y++) transcript.write(String(y).repeat(4), { x: 0, y });
      overlay.fill(0, 1, 4, 3, "#");
      terminal.commit({ sync: true });
      commits.length = 0;

      scrollPlaneRows(terminal, "transcript", 1, 4, 1);
      terminal.commit({ planes: ["transcript"], sync: true });

      expect(commits.at(-1)?.scrollOperations ?? null).toBeNull();
      expect(commits.at(-1)?.dirtyRows).toEqual([3]);
      expect(terminal.snapshot().lines.slice(1, 4)).toEqual(["####", "####", "####"]);
    } finally {
      off();
      terminal.dispose();
    }
  });

  it("falls back to dirty rows when a higher plane partially covers scrolled rows", () => {
    const terminal = createTerminal({ cols: 4, rows: 5 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const overlay = getPlaneTerminal(terminal, "overlay");
    const commits: TerminalCommitEvent[] = [];
    const off = terminal.on("commit", (event) => commits.push(event));

    try {
      for (let y = 1; y < 4; y++) transcript.write(String(y).repeat(4), { x: 0, y });
      overlay.write("#", { x: 0, y: 2 });
      terminal.commit({ sync: true });
      commits.length = 0;

      scrollPlaneRows(terminal, "transcript", 1, 4, 1);
      terminal.commit({ planes: ["transcript"], sync: true });

      expect(commits.at(-1)?.scrollOperations ?? null).toBeNull();
      expect(commits.at(-1)?.dirtyRows).toEqual([1, 2, 3]);
      expect(terminal.snapshot().lines[2]).toBe("#333");
    } finally {
      off();
      terminal.dispose();
    }
  });

  it("falls back to dirty rows for overlapping scroll operations", () => {
    const terminal = createTerminal({ cols: 4, rows: 8 });
    const commits: TerminalCommitEvent[] = [];
    const off = terminal.on("commit", (event) => commits.push(event));

    try {
      writeNumberedRows(terminal);
      commits.length = 0;

      scrollPlaneRows(terminal, "default", 0, 5, 1);
      scrollPlaneRows(terminal, "default", 3, 8, 1);
      terminal.commit({ planes: ["default"], sync: true });

      expect(commits.at(-1)?.scrollOperations ?? null).toBeNull();
      expect(commits.at(-1)?.dirtyRows).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    } finally {
      off();
      terminal.dispose();
    }
  });

  it("falls back to dirty rows for opposite-direction same-range scrolls", () => {
    const terminal = createTerminal({ cols: 4, rows: 6 });
    const commits: TerminalCommitEvent[] = [];
    const off = terminal.on("commit", (event) => commits.push(event));

    try {
      writeNumberedRows(terminal);
      commits.length = 0;

      scrollPlaneRows(terminal, "default", 0, 5, 1);
      scrollPlaneRows(terminal, "default", 0, 5, -1);
      terminal.commit({ planes: ["default"], sync: true });

      expect(commits.at(-1)?.scrollOperations ?? null).toBeNull();
      expect(commits.at(-1)?.dirtyRows).toEqual([0, 1, 2, 3, 4]);
      expect(terminal.snapshot().lines).toEqual(["    ", "1111", "2222", "3333", "4444", "5555"]);
    } finally {
      off();
      terminal.dispose();
    }
  });
});
