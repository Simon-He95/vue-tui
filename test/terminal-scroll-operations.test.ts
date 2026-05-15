import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { scrollPlaneRows } from "../src/core/terminal/create-terminal.js";
import type { TerminalCommitEvent } from "../src/core/types.js";

function writeNumberedRows(terminal: ReturnType<typeof createTerminal>): void {
  const { rows } = terminal.size();
  for (let y = 0; y < rows; y++) {
    terminal.write(String(y).repeat(4), { x: 0, y });
  }
  terminal.commit({ sync: true });
}

describe("terminal scroll operations", () => {
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
