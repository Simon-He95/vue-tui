import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { createStdoutRenderer } from "../src/cli.js";

/**
 * Minimal ANSI screen simulator for verifying bottom-anchored (REPL bar)
 * rendering: absolute cursor positioning (H/f), erase-in-line (K), scroll
 * regions (r) and scrolls (S/T), CR/LF and printable cells.
 */
function applyAnsiToScreen(output: string, cols: number, rows: number): readonly string[] {
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
  let cursorX = 0;
  let cursorY = 0;
  let scrollTop = 0;
  let scrollBottom = rows;

  const scrollUp = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollTop; y < scrollBottom - 1; y++) grid[y] = grid[y + 1]!;
      grid[scrollBottom - 1] = Array.from({ length: cols }, () => " ");
    }
  };
  const scrollDown = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollBottom - 1; y > scrollTop; y--) grid[y] = grid[y - 1]!;
      grid[scrollTop] = Array.from({ length: cols }, () => " ");
    }
  };

  let i = 0;
  while (i < output.length) {
    const ch = output[i]!;
    if (ch === "\u001B") {
      const next = output[i + 1];
      if (next === "[") {
        let j = i + 2;
        while (j < output.length && !/[A-Za-z]/.test(output[j]!)) j++;
        if (j >= output.length) break;
        const final = output[j]!;
        const raw = output.slice(i + 2, j);
        const params = raw.replace(/^\?/, "");
        const parts = params ? params.split(";").map((part) => Number(part || "0")) : [];
        if (final === "H" || final === "f") {
          cursorY = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
          cursorX = Math.max(0, Math.min(cols, (parts[1] || 1) - 1));
        } else if (final === "K") {
          for (let x = cursorX; x < cols; x++) grid[cursorY]![x] = " ";
        } else if (final === "r") {
          if (parts.length >= 2) {
            scrollTop = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
            scrollBottom = Math.max(scrollTop + 1, Math.min(rows, parts[1] || rows));
          } else {
            scrollTop = 0;
            scrollBottom = rows;
          }
        } else if (final === "S") {
          scrollUp(Math.max(1, parts[0] || 1));
        } else if (final === "T") {
          scrollDown(Math.max(1, parts[0] || 1));
        }
        i = j + 1;
        continue;
      }
      if (next === "]") {
        const end = output.indexOf("\u0007", i + 2);
        i = end >= 0 ? end + 1 : output.length;
        continue;
      }
      i += 2;
      continue;
    }

    if (ch === "\r") {
      cursorX = 0;
      i++;
      continue;
    }
    if (ch === "\n") {
      cursorX = 0;
      if (cursorY === scrollBottom - 1) scrollUp(1);
      else cursorY = Math.min(rows - 1, cursorY + 1);
      i++;
      continue;
    }

    if (cursorY >= 0 && cursorY < rows && cursorX >= 0 && cursorX < cols) {
      grid[cursorY]![cursorX] = ch;
      cursorX = Math.min(cols, cursorX + 1);
    }
    i++;
  }

  return grid.map((row) => row.join(""));
}

function createCapturingOutput(): {
  output: {
    isTTY: boolean;
    chunks: string[];
    write(chunk: string): void;
  };
  text(): string;
} {
  const output = {
    isTTY: true,
    chunks: [] as string[],
    write(chunk: string) {
      this.chunks.push(chunk);
    },
  };
  return {
    output,
    text: () => output.chunks.join(""),
  };
}

describe("stdout renderer bottom anchor (REPL bar)", () => {
  it("pins the bar to the bottom and never touches the output area above", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      anchor: "bottom",
      screenRows: () => 10,
    });

    try {
      terminal.write("hello", { x: 0, y: 0 });
      terminal.write("world", { x: 0, y: 1 });
      terminal.commit({ sync: true });

      const frame = text();
      // The renderer establishes a scroll region that excludes the bar.
      expect(frame).toContain("\u001B[1;7r");
      // Buffer rows are addressed at their absolute screen positions (rows 8-10,
      // 1-based) and no CUP ever targets the rows above the bar. Consecutive
      // rows may use the \r\n fast path instead of a second CUP.
      expect(frame).toContain("\u001B[8;1H");
      expect(frame).not.toContain("\u001B[1;1H");
      expect(frame).not.toContain("\u001B[5;");

      const screen = applyAnsiToScreen(frame, 20, 10);
      expect(screen[7]!.trimEnd()).toBe("hello");
      expect(screen[8]!.trimEnd()).toBe("world");
      for (let y = 0; y < 7; y++) {
        expect(screen[y]!.trim()).toBe("");
      }
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("repaints the whole bar and re-anchors when the screen height changes", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    let screenRows = 10;
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      anchor: "bottom",
      screenRows: () => screenRows,
    });

    try {
      terminal.write("hello", { x: 0, y: 0 });
      terminal.commit({ sync: true });
      expect(text()).toContain("\u001B[8;1H");

      // Screen grows: the bar must move down and the region must narrow.
      screenRows = 12;
      output.chunks.length = 0;
      terminal.write("hi", { x: 0, y: 2 });
      terminal.commit({ sync: true });

      const frame = text();
      expect(frame).toContain("\u001B[1;9r");
      expect(frame).toContain("\u001B[10;1H");

      // All three bar rows are repainted at their new anchored position so a
      // resized/scrolled screen can never leave stale bar rows behind.
      const screen = applyAnsiToScreen(frame, 20, 12);
      expect(screen[9]!.trimEnd()).toBe("hello");
      expect(screen[10]!.trim()).toBe("");
      expect(screen[11]!.trimEnd()).toBe("hi");
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("never clears the whole screen even when clear is true", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: true,
      hideCursor: false,
      altScreen: false,
      anchor: "bottom",
      screenRows: () => 10,
    });

    try {
      terminal.write("hi", { x: 0, y: 0 });
      terminal.commit({ sync: true });
      expect(text()).not.toContain("\u001B[2J");
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("restores the full-screen scroll region on dispose", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      anchor: "bottom",
      screenRows: () => 10,
    });

    terminal.write("hi", { x: 0, y: 0 });
    terminal.commit({ sync: true });
    expect(text()).toContain("\u001B[1;7r");

    renderer.dispose();
    expect(text()).toContain("\u001B[r");
    terminal.dispose();
  });

  it("reserves a blank gap between the output region and the pinned bar", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      anchor: "bottom",
      barGap: 2,
      screenRows: () => 10,
    });

    try {
      terminal.write("bar", { x: 0, y: 0 });
      terminal.commit({ sync: true });
      const frame = text();
      // Region excludes the 2-row gap: 10 - 3 (bar) - 2 (gap) = 5.
      expect(frame).toContain("\u001B[1;5r");
      // The bar itself still hugs the very bottom (rows 8-10, 1-based).
      expect(frame).toContain("\u001B[8;1H");

      // Caller output written at the region bottom (row 5) scrolls inside the
      // region; the gap rows (6-7) and the bar (8-10) stay untouched.
      const screen = applyAnsiToScreen(frame + "\u001B[5;1Hline a\nline b\n", 20, 10);
      expect(screen[2]!.trimEnd()).toBe("line a");
      expect(screen[3]!.trimEnd()).toBe("line b");
      expect(screen[4]!.trim()).toBe("");
      expect(screen[5]!.trim()).toBe("");
      expect(screen[6]!.trim()).toBe("");
      expect(screen[7]!.trimEnd()).toBe("bar");
      expect(screen[8]!.trim()).toBe("");
      expect(screen[9]!.trim()).toBe("");
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("preserves existing output before reserving the gap and bar rows", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      anchor: "bottom",
      barGap: 2,
      screenRows: () => 15,
    });

    try {
      terminal.write("bar", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      const frame = text();
      // Before narrowing the scroll region, the renderer moves existing screen
      // contents up by 3 bar rows + 2 gap rows + 1 fresh output row.
      expect(frame).toContain(`\u001B[r\u001B[15;1H${"\n".repeat(6)}`);
      expect(frame).toContain("\u001B[1;10r");

      const existingOutput = "\u001B[12;1Hbuild 1\nbuild 2";
      const nativeOutput = "\u001B[10;1H❯ hi\n\u001B[10;1Hecho: hi\n";
      const screen = applyAnsiToScreen(existingOutput + frame + nativeOutput, 20, 15);

      // Older output remains above newer caller output instead of being frozen
      // below it in the reserved gap.
      expect(screen[3]!.trimEnd()).toBe("build 1");
      expect(screen[4]!.trimEnd()).toBe("build 2");
      expect(screen[7]!.trimEnd()).toBe("❯ hi");
      expect(screen[8]!.trimEnd()).toBe("echo: hi");
      expect(screen[9]!.trim()).toBe("");
      expect(screen[10]!.trim()).toBe("");
      expect(screen[11]!.trim()).toBe("");
      expect(screen[12]!.trimEnd()).toBe("bar");

      // Repainting the bar must not reserve rows or scroll history again.
      output.chunks.length = 0;
      renderer.forceRender();
      expect(text()).not.toContain(`\u001B[r\u001B[15;1H`);
      expect(text()).not.toContain("\n".repeat(6));
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("leaves top-anchored rendering unchanged when anchor is unset", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    try {
      terminal.write("hi", { x: 0, y: 0 });
      terminal.commit({ sync: true });
      const frame = text();
      expect(frame).toContain("\u001B[1;1H");
      expect(frame).not.toContain("\u001B[1;7r");
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("keeps the bar pinned while caller output scrolls natively above it", () => {
    const terminal = createTerminal({ cols: 20, rows: 3 });
    const { output, text } = createCapturingOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      anchor: "bottom",
      screenRows: () => 10,
    });

    try {
      terminal.write("abc", { x: 0, y: 0 });
      terminal.commit({ sync: true });
      const initial = applyAnsiToScreen(text(), 20, 10);
      expect(initial[7]!.trimEnd()).toBe("abc");
      expect(initial[6]!.trim()).toBe("");

      // Simulate the caller writing native output into the scroll region the
      // renderer established (rows 1..7). More than 7 lines forces the region
      // to scroll; the bar rows (8..10, 1-based) must never be touched.
      const appOut: string[] = [`\u001B[7;1H`];
      for (let i = 1; i <= 8; i++) appOut.push(`line ${i}\n`);
      const screen = applyAnsiToScreen(text() + appOut.join(""), 20, 10);
      // The 8th line ends one row above the region bottom; the region bottom
      // row is the fresh blank line created by the final scroll.
      expect(screen[5]!.trimEnd()).toBe("line 8");
      expect(screen[6]!.trim()).toBe("");
      // The bar is untouched and still shows its TUI content.
      expect(screen[7]!.trimEnd()).toBe("abc");
      expect(screen[8]!.trim()).toBe("");
      expect(screen[9]!.trim()).toBe("");

      // A bar-only update repaints the pinned bar, not the output area.
      output.chunks.length = 0;
      terminal.write("def", { x: 0, y: 0 });
      terminal.commit({ sync: true });
      const barFrame = text();
      expect(barFrame).toContain("\u001B[8;1H");
      const after = applyAnsiToScreen(barFrame, 20, 10);
      expect(after[7]!.trimEnd()).toBe("def");
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });
});
