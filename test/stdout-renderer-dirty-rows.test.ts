import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminal } from "../src/index.js";
import { charCellWidth } from "../src/core.js";
import {
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  createStdoutRenderer,
} from "../src/cli.js";
import { getPlaneTerminal, scrollPlaneRows } from "../src/core/terminal/create-terminal.js";
import {
  createKittyPlacementSequence,
  getTerminalGraphicsOutput,
} from "../src/renderer/terminal-graphics.js";

const getFrameDelayMs = () => ("GHOSTTY_RESOURCES_DIR" in process.env ? 24 : 16);

function withUnsetEnv(key: string, fn: () => void): void {
  const prev = process.env[key];
  delete process.env[key];
  try {
    fn();
  } finally {
    if (prev == null) delete process.env[key];
    else process.env[key] = prev;
  }
}

const ambientTerminalEnvKeys = [
  "TERM_PROGRAM",
  "TERM",
  "VSCODE_PID",
  "KITTY_WINDOW_ID",
  "ALACRITTY_WINDOW_ID",
  "ALACRITTY_LOG",
  "WEZTERM_PANE",
  "WEZTERM_EXECUTABLE",
  "VUE_TUI_DIRTY_ROW_PATCH_MODE",
  "DIMCODE_TUI_DIRTY_ROW_RENDER_MODE",
  "DIMCODE_TUI_DIRTY_ROW_PATCH_MODE",
  "VUE_TUI_DIRTY_SPAN_MAX_CELLS",
  "DIMCODE_TUI_DIRTY_SPAN_MAX_CELLS",
] as const;
const ambientTerminalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ambientTerminalEnvKeys) {
    ambientTerminalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ambientTerminalEnvKeys) {
    const value = ambientTerminalEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  ambientTerminalEnv.clear();
});

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

    const width = Math.max(1, charCellWidth(ch));
    if (cursorY >= 0 && cursorY < rows && cursorX >= 0 && cursorX < cols)
      grid[cursorY]![cursorX] = ch;
    if (width > 1) {
      for (let fillX = cursorX + 1; fillX < Math.min(cols, cursorX + width); fillX++) {
        grid[cursorY]![fillX] = " ";
      }
    }
    cursorX = Math.min(cols, cursorX + width);
    i++;
  }

  return grid.map((row) => row.join(""));
}

describe("stdout renderer", () => {
  it("bounds stdout hyperlink id cache without stale diffs", () => {
    const terminal = createTerminal({ cols: 40, rows: 1 });
    const output = {
      isTTY: false,
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(chunk);
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    try {
      for (let i = 0; i < 10_000; i++) {
        terminal.write("x", {
          x: 0,
          y: 0,
          style: { href: `https://example.com/${i}` },
        });
        terminal.commit({ sync: true });
      }

      output.chunks.length = 0;
      terminal.write("y", {
        x: 0,
        y: 0,
        style: { href: "https://example.com/final" },
      });
      terminal.commit({ sync: true });

      expect(output.chunks.join("")).toContain("y");
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("does not skip dirty rows on lossy fingerprint collisions", () => {
    const terminal = createTerminal({ cols: 4, rows: 1 });
    const output = {
      isTTY: false,
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(chunk);
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("A", { x: 0, y: 0 });
    terminal.commit({ sync: true });
    output.chunks.length = 0;

    terminal.write("\u0441", { x: 0, y: 0 });
    terminal.commit({ sync: true });

    expect(output.chunks.join("")).toContain("\u0441");

    renderer.dispose();
    terminal.dispose();
  });

  it("sorts and clamps dirty rows for partial renders", () => {
    const terminal = createTerminal({ cols: 3, rows: 4 });
    let out = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    out = "";
    terminal.put(0, 0, "A");
    terminal.put(0, 1, "B");
    terminal.put(0, 2, "C");
    terminal.put(0, 3, "D");
    terminal.commit();

    out = "";
    terminal.put(0, 1, "E");
    terminal.put(0, 2, "F");
    (renderer as any).render([2, 1, -1, 99]);

    const row2 = out.indexOf("\u001B[2;1H");
    const row3 = out.indexOf("\u001B[3;1H");
    const row1 = out.indexOf("\u001B[1;1H");
    const row4 = out.indexOf("\u001B[4;1H");
    const newlineAfterRow2 = row2 >= 0 ? out.indexOf("\r\n", row2) : -1;

    expect(row2).toBeGreaterThanOrEqual(0);
    expect(row3 >= 0 || newlineAfterRow2 >= 0).toBe(true);
    if (row3 >= 0) expect(row2).toBeLessThan(row3);
    expect(row1).toBe(-1);
    expect(row4).toBe(-1);

    renderer.dispose();
  });

  it("accumulates dirty rows while frame-limited", async () => {
    vi.useFakeTimers();
    const nowRef = { t: 0 };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
    try {
      const terminal = createTerminal({ cols: 3, rows: 5 });
      let out = "";
      const output = {
        isTTY: true,
        write(chunk: string) {
          out += chunk;
        },
      };
      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
      });

      // Allow initial scheduled paint to run under fake timers.
      const frameDelayMs = getFrameDelayMs();
      nowRef.t += frameDelayMs;
      vi.advanceTimersByTime(frameDelayMs);
      out = "";
      terminal.put(0, 1, "A");
      (renderer as any).render([1]);
      terminal.put(0, 3, "B");
      (renderer as any).render([3]);

      expect(out).toBe("");

      nowRef.t += frameDelayMs;
      vi.advanceTimersByTime(frameDelayMs);

      expect(out.includes("\u001B[2;1H")).toBe(true);
      expect(out.includes("\u001B[4;1H")).toBe(true);

      renderer.dispose();
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("patches only the changed row prefix when no conservative fallback is active", () => {
    const terminal = createTerminal({ cols: 24, rows: 4 });
    let out = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("A task", { x: 0, y: 1 });
    terminal.write("[ Exit ]", { x: 14, y: 1 });
    terminal.commit();

    out = "";
    terminal.put(0, 1, "B");
    terminal.commit();

    expect(out.includes("\u001B[2;1H")).toBe(true);
    expect(out.includes("B")).toBe(true);
    expect(out.includes("[ Exit ]")).toBe(false);

    renderer.dispose();
  });

  it("patches only the changed span on alacritty-like terminals", () => {
    process.env.TERM_PROGRAM = "Alacritty";

    const terminal = createTerminal({ cols: 24, rows: 4 });
    let out = "";
    const output = {
      isTTY: true,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("A task", { x: 0, y: 1 });
    terminal.write("[ Exit ]", { x: 14, y: 1 });
    terminal.commit();
    (renderer as any).render(undefined, true);

    out = "";
    terminal.put(0, 1, "B");
    terminal.commit();
    (renderer as any).render([1], true);

    expect(out.includes("\u001B[2;1H")).toBe(true);
    expect(out.includes("B")).toBe(true);
    expect(out.includes("[ Exit ]")).toBe(false);

    renderer.dispose();
  });

  it("patches only the changed span when TERM is alacritty-256color", () => {
    process.env.TERM = "alacritty-256color";

    const terminal = createTerminal({ cols: 24, rows: 4 });
    let out = "";
    const output = {
      isTTY: true,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("A task", { x: 0, y: 1 });
    terminal.write("[ Exit ]", { x: 14, y: 1 });
    terminal.commit();
    (renderer as any).render(undefined, true);

    out = "";
    terminal.put(0, 1, "B");
    terminal.commit();
    (renderer as any).render([1], true);

    expect(out.includes("\u001B[2;1H")).toBe(true);
    expect(out.includes("B")).toBe(true);
    expect(out.includes("[ Exit ]")).toBe(false);

    renderer.dispose();
  });

  it("keeps overlay rows correct when dirty content overlaps them", () => {
    const terminal = createTerminal({ cols: 24, rows: 4 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    let out = "";
    let transcriptOut = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
        transcriptOut += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("A task", { x: 0, y: 1 });
    overlay.write("[Dialog]", { x: 12, y: 1 });
    terminal.commit();

    out = "";
    terminal.put(0, 1, "B");
    terminal.commit({ planes: ["default"] });

    expect(out.includes("\u001B[2;1H")).toBe(true);
    expect(applyAnsiToScreen(transcriptOut, 24, 4)).toEqual(terminal.snapshot().lines);

    renderer.dispose();
  });

  it("patches only the dirty row column when overlay is on another row", () => {
    const terminal = createTerminal({ cols: 24, rows: 4 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    let out = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("A task", { x: 0, y: 1 });
    terminal.write("[ Exit ]", { x: 14, y: 1 });
    overlay.write("[Dialog]", { x: 12, y: 0 });
    terminal.commit();

    out = "";
    terminal.put(0, 1, "B");
    terminal.commit({ planes: ["default"] });

    expect(out.includes("\u001B[2;1H")).toBe(true);
    expect(out.includes("B")).toBe(true);
    expect(out.includes("[ Exit ]")).toBe(false);
    expect(out.includes("[Dialog]")).toBe(false);

    renderer.dispose();
  });

  it("keeps live screen in sync across consecutive overlay updates and clear", () => {
    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);

      try {
        const terminal = createTerminal({ cols: 40, rows: 8 });
        const overlay = getPlaneTerminal(terminal, "overlay");
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const flushFrame = () => {
          const frameDelayMs = getFrameDelayMs();
          nowRef.t += frameDelayMs;
          vi.advanceTimersByTime(frameDelayMs);
        };

        terminal.fill(0, 0, 40, 8, " ");
        terminal.write("underlay-row", { x: 0, y: 2 });
        terminal.commit();
        flushFrame();

        overlay.fill(10, 2, 16, 1, " ");
        overlay.write("┌──────────────┐", { x: 10, y: 1 });
        overlay.write("│              │", { x: 10, y: 2 });
        overlay.write("└──────────────┘", { x: 10, y: 3 });
        terminal.commit({ planes: ["overlay"] });
        flushFrame();

        overlay.write("128000", { x: 12, y: 2 });
        terminal.commit({ planes: ["overlay"] });
        flushFrame();

        expect(transcriptOut.includes("┌──────────────┐")).toBe(true);
        expect(transcriptOut.includes("└──────────────┘")).toBe(true);

        expect(applyAnsiToScreen(transcriptOut, 40, 8)).toEqual(terminal.snapshot().lines);

        overlay.clear(10, 1, 16, 3);
        terminal.commit({ planes: ["overlay"] });
        flushFrame();

        expect(applyAnsiToScreen(transcriptOut, 40, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  it("skips dirty rows whose fingerprints are unchanged", () => {
    const terminal = createTerminal({ cols: 24, rows: 4 });
    let out = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.fill(0, 1, 24, 1, " ");
    terminal.write("A task", { x: 0, y: 1 });
    terminal.commit();

    out = "";
    terminal.fill(0, 1, 24, 1, " ");
    terminal.write("A task", { x: 0, y: 1 });
    terminal.commit({ planes: ["default"] });

    expect(out).toBe("");

    renderer.dispose();
  });

  it("keeps live screen in sync when previous content is written again after full clear", () => {
    const terminal = createTerminal({ cols: 4, rows: 2 });
    let transcriptOut = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        transcriptOut += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("ABCD", { x: 0, y: 0, style: { fg: "red" } });
    terminal.commit();

    terminal.clear();
    terminal.commit();

    terminal.write("ABCD", { x: 0, y: 0, style: { fg: "red" } });
    terminal.commit();

    expect(applyAnsiToScreen(transcriptOut, 4, 2)).toEqual(terminal.snapshot().lines);

    renderer.dispose();
  });

  it("keeps live screen in sync after terminal.scroll with fingerprint fast path", () => {
    const terminal = createTerminal({ cols: 6, rows: 3 });
    let transcriptOut = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        transcriptOut += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    terminal.write("row0  ", { x: 0, y: 0 });
    terminal.write("row1  ", { x: 0, y: 1 });
    terminal.write("row2  ", { x: 0, y: 2 });
    terminal.commit();

    terminal.scroll(1);
    terminal.write("new   ", { x: 0, y: 2 });
    terminal.commit();

    expect(applyAnsiToScreen(transcriptOut, 6, 3)).toEqual(terminal.snapshot().lines);

    renderer.dispose();
  });

  it("skips no-op frames when the IME anchor is unchanged", () => {
    const terminal = createTerminal({ cols: 24, rows: 4 });
    let out = "";
    const output = {
      isTTY: true,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      getImeAnchor: () => ({ cellX: 2, cellY: 1 }),
    });

    terminal.fill(0, 1, 24, 1, " ");
    terminal.write("A task", { x: 0, y: 1 });
    terminal.commit();

    out = "";
    terminal.fill(0, 1, 24, 1, " ");
    terminal.write("A task", { x: 0, y: 1 });
    terminal.commit({ planes: ["default"] });

    expect(out).toBe("");

    renderer.dispose();
  });

  it("moves the IME cursor on an empty dirty-row render", () => {
    const terminal = createTerminal({ cols: 10, rows: 2 });
    let out = "";
    let anchor: { cellX: number; cellY: number } | null = null;
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      useSyncOutput: false,
      getImeAnchor: () => anchor,
    });

    terminal.write("seed", { x: 0, y: 0 });
    terminal.commit({ sync: true });

    out = "";
    anchor = { cellX: 2, cellY: 1 };
    (renderer as any).render([], true);

    expect(out).toContain("\u001B[2;3H");

    renderer.dispose();
  });

  it("uses scroll regions for dense scroll-like partial updates before falling back to full repaint", () => {
    const prevThreshold = process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = "0.6";
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 6 });
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRows = (rows: readonly string[]) => {
          for (let y = 0; y < rows.length; y++) {
            terminal.fill(0, y, 8, 1, " ");
            terminal.write(rows[y]!.padEnd(8, " "), { x: 0, y });
          }
        };

        writeRows(["row0", "row1", "row2", "row3", "row4", "row5"]);
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        writeRows(["row1", "row2", "row3", "row4", "row5", "row6"]);
        terminal.commit({ sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[1;6r")).toBe(true);
        expect(/\u001B\[\d+[ST]/.test(out)).toBe(true);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevThreshold == null) delete process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
        else process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = prevThreshold;

        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("uses scroll regions for coalesced multi-tick shifts larger than five rows", () => {
    const prevThreshold = process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = "0.6";
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 10 });
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRows = (rows: readonly string[]) => {
          for (let y = 0; y < rows.length; y++) {
            terminal.fill(0, y, 8, 1, " ");
            terminal.write(rows[y]!.padEnd(8, " "), { x: 0, y });
          }
        };

        writeRows(["row0", "row1", "row2", "row3", "row4", "row5", "row6", "row7", "row8", "row9"]);
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        writeRows([
          "row6",
          "row7",
          "row8",
          "row9",
          "row10",
          "row11",
          "row12",
          "row13",
          "row14",
          "row15",
        ]);
        terminal.commit({ sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[1;10r")).toBe(true);
        expect(out.includes("\u001B[6S")).toBe(true);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevThreshold == null) delete process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
        else process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = prevThreshold;

        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("uses scroll regions for the largest dirty band when overlay occupies the top rows", () => {
    const prevThreshold = process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = "0.6";
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 7 });
        const overlay = getPlaneTerminal(terminal, "overlay");
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRows = (rows: readonly string[]) => {
          for (let y = 0; y < rows.length; y++) {
            terminal.fill(0, y, 8, 1, " ");
            terminal.write(rows[y]!.padEnd(8, " "), { x: 0, y });
          }
        };

        overlay.write("[OL]", { x: 0, y: 0 });
        overlay.write("[OL]", { x: 0, y: 1 });
        writeRows(["head0", "head1", "row0", "row1", "row2", "row3", "row4"]);
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        writeRows(["head0", "head1", "row1", "row2", "row3", "row4", "row5"]);
        terminal.commit({ sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[3;7r")).toBe(true);
        expect(out.includes("\u001B[1S")).toBe(true);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevThreshold == null) delete process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
        else process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = prevThreshold;

        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("falls back to partial render when dense dirty rows are not scroll-like", () => {
    const prevThreshold = process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = "0.6";
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 6 });
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRows = (rows: readonly string[]) => {
          for (let y = 0; y < rows.length; y++) {
            terminal.fill(0, y, 8, 1, " ");
            terminal.write(rows[y]!.padEnd(8, " "), { x: 0, y });
          }
        };

        writeRows(["row0", "row1", "row2", "row3", "row4", "row5"]);
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        for (const [y, text] of [
          [1, "A111"],
          [2, "B222"],
          [3, "C333"],
          [4, "D444"],
        ] as const) {
          terminal.fill(0, y, 8, 1, " ");
          terminal.write(text.padEnd(8, " "), { x: 0, y });
        }
        terminal.commit({ sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("row0")).toBe(false);
        expect(out.includes("row5")).toBe(false);
        expect(out.includes("\u001B[2;1H")).toBe(true);
        expect(applyAnsiToScreen(transcriptOut, 8, 6)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevThreshold == null) delete process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
        else process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = prevThreshold;

        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("uses an inner scroll region when only a middle viewport band shifts", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRows = (rows: readonly string[]) => {
          for (let y = 0; y < rows.length; y++) {
            terminal.fill(0, y, 8, 1, " ");
            terminal.write(rows[y]!.padEnd(8, " "), { x: 0, y });
          }
        };

        writeRows(["head0", "head1", "row0", "row1", "row2", "row3", "foot0", "foot1"]);
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        for (const [y, text] of [
          [2, "row1"],
          [3, "row2"],
          [4, "row3"],
          [5, "row4"],
        ] as const) {
          terminal.fill(0, y, 8, 1, " ");
          terminal.write(text.padEnd(8, " "), { x: 0, y });
        }
        terminal.commit({ sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[3;6r")).toBe(true);
        expect(out.includes("\u001B[6;1H")).toBe(true);
        expect(out.includes("\u001B[1S")).toBe(true);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("uses explicit scroll operations when only newly revealed rows are dirty", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(2, "row0");
        writeRow(3, "row1");
        writeRow(4, "row2");
        writeRow(5, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        scrollPlaneRows(terminal, "transcript", 2, 6, 1);
        writeRow(5, "row4");
        terminal.commit({ planes: ["transcript"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[3;6r")).toBe(true);
        expect(out.includes("\u001B[1S")).toBe(true);
        expect(out.includes("\u001B[6;1Hrow4")).toBe(true);
        expect(out.includes("row1")).toBe(false);
        expect(applyAnsiToScreen(transcriptOut, 8, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("coalesces pending explicit scroll operations before stdout flush", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);

      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 4 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        let transcriptOut = "";

        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };

        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const frameDelayMs = getFrameDelayMs();

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(0, "row0");
        writeRow(1, "row1");
        writeRow(2, "row2");
        writeRow(3, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });

        out = "";

        scrollPlaneRows(terminal, "transcript", 0, 4, 1);
        writeRow(3, "row4");
        terminal.commit({ planes: ["transcript"] });

        scrollPlaneRows(terminal, "transcript", 0, 4, 1);
        writeRow(3, "row5");
        terminal.commit({ planes: ["transcript"] });

        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out).toContain("\u001B[1;4r");
        expect(out).toContain("\u001B[2S");
        expect(out).toContain("row4");
        expect(out).toContain("row5");
        expect(applyAnsiToScreen(transcriptOut, 8, 4)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("remaps accumulated dirty rows through coalesced explicit scroll operations", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);

      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 4 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        let transcriptOut = "";

        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };

        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const frameDelayMs = getFrameDelayMs();

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(0, "row0");
        writeRow(1, "row1");
        writeRow(2, "row2");
        writeRow(3, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });

        out = "";

        scrollPlaneRows(terminal, "transcript", 0, 4, 1);
        writeRow(1, "X");
        writeRow(3, "row4");
        terminal.commit({ planes: ["transcript"] });

        scrollPlaneRows(terminal, "transcript", 0, 4, 1);
        writeRow(3, "row5");
        terminal.commit({ planes: ["transcript"] });

        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out).toContain("\u001B[1;4r");
        expect(out).toContain("\u001B[2S");
        expect(out).toContain("\u001B[1;1HX");
        expect(applyAnsiToScreen(transcriptOut, 8, 4)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
        terminal.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("falls back to repaint for overlapping opposite-direction explicit scroll ops before stdout flush", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);

      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 4 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        let transcriptOut = "";

        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };

        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const frameDelayMs = getFrameDelayMs();

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(0, "row0");
        writeRow(1, "row1");
        writeRow(2, "row2");
        writeRow(3, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });

        out = "";
        transcriptOut = "";

        scrollPlaneRows(terminal, "transcript", 0, 4, 1);
        writeRow(3, "row4");
        terminal.commit({ planes: ["transcript"] });

        scrollPlaneRows(terminal, "transcript", 0, 4, -1);
        writeRow(0, "row0");
        terminal.commit({ planes: ["transcript"] });

        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out).not.toContain("\u001B[1;4r");
        expect(out).not.toMatch(/\u001B\[\d+[ST]/);
        expect(applyAnsiToScreen(transcriptOut, 8, 4)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
        terminal.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("renders inserted explicit-scroll rows against blank rows instead of repainting the full line", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(2, "row0");
        writeRow(3, "row1");
        writeRow(4, "row2");
        writeRow(5, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        scrollPlaneRows(terminal, "transcript", 2, 6, 1);
        writeRow(5, "   x");
        terminal.commit({ planes: ["transcript"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[6;4Hx")).toBe(true);
        expect(out.includes("\u001B[6;1H   x")).toBe(false);
        expect(applyAnsiToScreen(transcriptOut, 8, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("renders OSC8 hrefs in inserted explicit-scroll rows even when the cell is blank", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(2, "row0");
        writeRow(3, "row1");
        writeRow(4, "row2");
        writeRow(5, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        scrollPlaneRows(terminal, "transcript", 2, 6, 1);
        transcript.fill(0, 5, 8, 1, " ");
        transcript.write(" ", {
          x: 3,
          y: 5,
          style: { href: "https://example.com/blank" },
        });
        terminal.commit({ planes: ["transcript"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out).toContain("\u001B[6;4H");
        expect(out).toContain("\u001B]8;;https://example.com/blank\u0007");
        expect(applyAnsiToScreen(transcriptOut, 8, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("keeps explicit scroll operations when a pending dense update is merged into the same frame", () => {
    const prevThreshold = process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = "0.6";
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        const overlay = getPlaneTerminal(terminal, "overlay");
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeTranscriptRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        const writeOverlayRow = (y: number, text: string, x = 0) => {
          overlay.fill(0, y, 8, 1, " ");
          overlay.write(text, { x, y });
        };

        writeOverlayRow(0, "HEAD0");
        writeOverlayRow(1, "HEAD1");
        writeOverlayRow(6, "[v]", 4);
        writeTranscriptRow(2, "row0");
        writeTranscriptRow(3, "row1");
        writeTranscriptRow(4, "row2");
        writeTranscriptRow(5, "row3");
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        writeOverlayRow(0, "HEAD0");
        writeOverlayRow(1, "HEAD1");
        writeOverlayRow(6, "[v]", 4);
        writeTranscriptRow(2, "temp0");
        writeTranscriptRow(3, "temp1");
        writeTranscriptRow(4, "temp2");
        writeTranscriptRow(5, "temp3");
        terminal.commit();

        nowRef.t += 5;
        scrollPlaneRows(terminal, "transcript", 2, 6, 1);
        writeTranscriptRow(5, "row4");
        terminal.commit({ planes: ["transcript"], sync: true });
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[3;6r")).toBe(true);
        expect(out.includes("\u001B[1S")).toBe(true);
        expect(applyAnsiToScreen(transcriptOut, 8, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevThreshold == null) delete process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
        else process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = prevThreshold;

        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("uses explicit scroll operations for downward scrolls and preserves screen text", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(2, "row0");
        writeRow(3, "row1");
        writeRow(4, "row2");
        writeRow(5, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        scrollPlaneRows(terminal, "transcript", 2, 6, -1);
        writeRow(2, "top0");
        terminal.commit({ planes: ["transcript"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[3;6r")).toBe(true);
        expect(out.includes("\u001B[1T")).toBe(true);
        expect(out.includes("\u001B[3;1Htop0")).toBe(true);
        expect(applyAnsiToScreen(transcriptOut, 8, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("clips explicit scroll operations around overlay rows at the viewport edges", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        const overlay = getPlaneTerminal(terminal, "overlay");
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        overlay.write("[T]", { x: 0, y: 2 });
        overlay.write("[B]", { x: 0, y: 5 });
        writeRow(2, "row0");
        writeRow(3, "row1");
        writeRow(4, "row2");
        writeRow(5, "row3");
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        scrollPlaneRows(terminal, "transcript", 2, 6, 1);
        writeRow(5, "row4");
        terminal.commit({ planes: ["transcript"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[4;5r")).toBe(true);
        expect(out.includes("\u001B[1S")).toBe(true);
        expect(applyAnsiToScreen(transcriptOut, 8, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("falls back to repaint when explicit scroll operations overlap interior overlay rows", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        const overlay = getPlaneTerminal(terminal, "overlay");
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        overlay.write("[OV]", { x: 0, y: 3 });
        writeRow(2, "row0");
        writeRow(3, "row1");
        writeRow(4, "row2");
        writeRow(5, "row3");
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        scrollPlaneRows(terminal, "transcript", 2, 6, 1);
        writeRow(5, "row4");
        terminal.commit({ planes: ["transcript"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[3;6r")).toBe(false);
        expect(applyAnsiToScreen(transcriptOut, 8, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("falls back to repaint when explicit scroll operations overlap active terminal graphics", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 8 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });
        const graphics = getTerminalGraphicsOutput(terminal);

        const writeRow = (y: number, text: string) => {
          transcript.fill(0, y, 8, 1, " ");
          transcript.write(text.padEnd(8, " "), { x: 0, y });
        };

        writeRow(2, "row0");
        writeRow(3, "row1");
        writeRow(4, "row2");
        writeRow(5, "row3");
        terminal.commit({ planes: ["transcript"], sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        graphics?.queue({
          id: "image",
          x: 0,
          y: 3,
          w: 8,
          h: 2,
          protocol: "kitty",
          sequence: createKittyGraphicsSequence("QUJD", { columns: 8, rows: 2 }),
          op: "draw",
        });
        out = "";
        scrollPlaneRows(terminal, "transcript", 2, 6, 1);
        writeRow(5, "row4");
        terminal.commit({ planes: ["transcript"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[3;6r")).toBe(false);
        expect(out.includes("\u001B[1S")).toBe(false);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("does not infer scroll regions while terminal graphics are visible", () => {
    const prevThreshold = process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = "0.6";
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 8, rows: 6 });
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });
        const graphics = getTerminalGraphicsOutput(terminal);

        const writeRows = (rows: readonly string[]) => {
          for (let y = 0; y < rows.length; y++) {
            terminal.fill(0, y, 8, 1, " ");
            terminal.write(rows[y]!.padEnd(8, " "), { x: 0, y });
          }
        };

        writeRows(["row0", "row1", "row2", "row3", "row4", "row5"]);
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        graphics?.queue({
          id: "image",
          x: 0,
          y: 2,
          w: 8,
          h: 2,
          protocol: "kitty",
          sequence: createKittyGraphicsSequence("QUJD", { columns: 8, rows: 2 }),
          op: "draw",
        });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        writeRows(["row1", "row2", "row3", "row4", "row5", "row6"]);
        terminal.commit({ sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[1;6r")).toBe(false);
        expect(/\u001B\[\d+[ST]/.test(out)).toBe(false);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevThreshold == null) delete process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
        else process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = prevThreshold;

        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });

  it("only repaints visible overlay cells inside active terminal graphics", () => {
    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        const terminal = createTerminal({ cols: 30, rows: 6 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        const overlay = getPlaneTerminal(terminal, "overlay");
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });
        const graphics = getTerminalGraphicsOutput(terminal);
        const imageSequence = createKittyGraphicsSequence("QUJD", { columns: 16, rows: 2 });
        const frameDelayMs = getFrameDelayMs();
        const flushFrame = () => {
          nowRef.t += frameDelayMs;
          vi.advanceTimersByTime(frameDelayMs);
        };

        transcript.fill(0, 0, 30, 6, " ");
        transcript.write("before image", { x: 0, y: 1 });
        terminal.commit({ planes: ["transcript"], sync: true });
        flushFrame();

        graphics?.queue({
          id: "image",
          x: 4,
          y: 2,
          w: 16,
          h: 2,
          protocol: "kitty",
          sequence: imageSequence,
          op: "draw",
        });
        terminal.commit({ planes: ["transcript"], sync: true });
        flushFrame();
        expect(out).toContain(imageSequence);

        out = "";
        transcript.fill(0, 2, 30, 1, " ");
        transcript.write("HEAD", { x: 0, y: 2 });
        transcript.write("BADLEFT", { x: 4, y: 2 });
        transcript.write("BADRIGHT", { x: 16, y: 2 });
        transcript.write("TAIL", { x: 22, y: 2 });
        overlay.write("DIALOG", { x: 10, y: 2 });
        terminal.commit({ planes: ["transcript", "overlay"], sync: true });
        flushFrame();

        expect(out).toContain("HEAD");
        expect(out).toContain("DIALOG");
        expect(out).toContain("TAIL");
        expect(out).not.toContain("BADLEFT");
        expect(out).not.toContain("BADRIGHT");
        expect(out).not.toContain("a=d");
        expect(out).not.toContain(imageSequence);

        out = "";
        overlay.clear(10, 2, 6, 1);
        terminal.commit({ planes: ["overlay"], sync: true });
        flushFrame();

        expect(out).not.toContain("BADLEFT");
        expect(out).not.toContain("BADRIGHT");
        expect(out).not.toContain("a=d");
        expect(out).not.toContain(imageSequence);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  it("does not repaint text hidden by a pending terminal graphic draw", () => {
    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        const terminal = createTerminal({ cols: 30, rows: 6 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });
        const graphics = getTerminalGraphicsOutput(terminal);
        const imageSequence = createKittyGraphicsSequence("QUJD", { columns: 16, rows: 2 });
        const frameDelayMs = getFrameDelayMs();
        const flushFrame = () => {
          nowRef.t += frameDelayMs;
          vi.advanceTimersByTime(frameDelayMs);
        };

        transcript.fill(0, 0, 30, 6, " ");
        transcript.write("HEAD", { x: 0, y: 2 });
        transcript.write("BADLEFT", { x: 4, y: 2 });
        transcript.write("BADRIGHT", { x: 16, y: 2 });
        transcript.write("TAIL", { x: 22, y: 2 });
        graphics?.queue({
          id: "image",
          x: 4,
          y: 2,
          w: 16,
          h: 2,
          protocol: "kitty",
          sequence: imageSequence,
          op: "draw",
        });
        terminal.commit({ planes: ["transcript"], sync: true });
        flushFrame();

        expect(out).toContain(imageSequence);
        expect(out).toContain("HEAD");
        expect(out).toContain("TAIL");
        expect(out).not.toContain("BADLEFT");
        expect(out).not.toContain("BADRIGHT");

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  it("clears the target terminal graphic rect before moving an active placement", () => {
    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        const terminal = createTerminal({ cols: 30, rows: 6 });
        const transcript = getPlaneTerminal(terminal, "transcript");
        let out = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });
        const graphics = getTerminalGraphicsOutput(terminal);
        const imageId = 101;
        const placementId = 202;
        const imageSequence = createKittyGraphicsSequence("QUJD", {
          imageId,
          placementId,
          columns: 16,
          rows: 2,
        });
        const placementSequence = createKittyPlacementSequence({
          imageId,
          placementId,
          columns: 16,
          rows: 2,
        });
        const clearSequence = createKittyDeleteGraphicsSequence({ imageId, placementId });
        const frameDelayMs = getFrameDelayMs();
        const flushFrame = () => {
          nowRef.t += frameDelayMs;
          vi.advanceTimersByTime(frameDelayMs);
        };

        transcript.fill(0, 0, 30, 6, " ");
        terminal.commit({ planes: ["transcript"], sync: true });
        flushFrame();

        graphics?.queue({
          id: "image",
          x: 4,
          y: 2,
          w: 16,
          h: 2,
          protocol: "kitty",
          sequence: imageSequence,
          resizeSequence: placementSequence,
          clearSequence,
          op: "draw",
        });
        terminal.commit({ planes: ["transcript"], sync: true });
        flushFrame();
        expect(out).toContain(imageSequence);

        out = "";
        transcript.write("OLDRECT", { x: 4, y: 2 });
        transcript.write("TARGETRECT", { x: 4, y: 3 });
        graphics?.queue({
          id: "image",
          x: 4,
          y: 3,
          w: 16,
          h: 2,
          protocol: "kitty",
          sequence: placementSequence,
          resizeSequence: placementSequence,
          clearSequence,
          resizeRedraw: true,
          placementMoveWithoutClear: true,
          op: "draw",
        });
        terminal.commit({ planes: ["transcript"], sync: true });
        flushFrame();

        const moveIndex = out.indexOf(placementSequence);
        const eraseIndex = out.indexOf("\x1B[16X");
        const textIndex = out.indexOf("OLDRECT");
        expect(moveIndex).toBeGreaterThanOrEqual(0);
        expect(eraseIndex).toBeGreaterThanOrEqual(0);
        expect(textIndex).toBeGreaterThanOrEqual(0);
        expect(eraseIndex).toBeLessThan(moveIndex);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  it("keeps stdout screen equal to terminal snapshot after multiple scroll ops", () => {
    const prevScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;

    withUnsetEnv("GHOSTTY_RESOURCES_DIR", () => {
      vi.useFakeTimers();
      const nowRef = { t: 0 };
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
      try {
        process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

        const terminal = createTerminal({ cols: 4, rows: 8 });
        let out = "";
        let transcriptOut = "";
        const output = {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
            transcriptOut += chunk;
          },
        };
        const renderer = createStdoutRenderer(terminal, {
          output,
          clear: false,
          hideCursor: false,
          altScreen: false,
        });

        for (let y = 0; y < 8; y++) terminal.write(String(y).repeat(4), { x: 0, y });
        terminal.commit({ sync: true });
        const frameDelayMs = getFrameDelayMs();
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        out = "";
        scrollPlaneRows(terminal, "default", 0, 3, 1);
        scrollPlaneRows(terminal, "default", 5, 8, -1);
        terminal.commit({ planes: ["default"], sync: true });
        nowRef.t += frameDelayMs;
        vi.advanceTimersByTime(frameDelayMs);

        expect(out.includes("\u001B[1;3r")).toBe(true);
        expect(out.includes("\u001B[6;8r")).toBe(true);
        expect(applyAnsiToScreen(transcriptOut, 4, 8)).toEqual(terminal.snapshot().lines);

        renderer.dispose();
      } finally {
        nowSpy.mockRestore();
        vi.useRealTimers();
        if (prevScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
        else process.env.DIMCODE_TUI_SCROLL_REGIONS = prevScrollRegions;
      }
    });
  });
});
