import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminal } from "../src/index.js";
import { createStdoutRenderer } from "../src/cli.js";

const getFrameDelayMs = () => ("GHOSTTY_RESOURCES_DIR" in process.env ? 24 : 16);

afterEach(() => {
  delete process.env.TERM_PROGRAM;
  delete process.env.VSCODE_PID;
  delete process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD;
  delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
});

describe("stdout renderer vscode compatibility", () => {
  it("avoids scroll regions in vscode terminal", () => {
    vi.useFakeTimers();
    const nowRef = { t: 0 };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowRef.t);
    try {
      process.env.TERM_PROGRAM = "vscode";
      process.env.VSCODE_PID = "123";
      process.env.DIMCODE_TUI_DIRTY_FULL_THRESHOLD = "0.6";
      process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";

      const terminal = createTerminal({ cols: 8, rows: 6 });
      let out = "";
      const renderer = createStdoutRenderer(terminal, {
        output: {
          isTTY: true,
          write(chunk: string) {
            out += chunk;
          },
        },
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

      expect(out.includes("\u001B[1;6r")).toBe(false);
      expect(/\u001B\[\d+[ST]/.test(out)).toBe(false);

      renderer.dispose();
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
