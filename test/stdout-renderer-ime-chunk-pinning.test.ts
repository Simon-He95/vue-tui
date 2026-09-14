import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer";

type Terminal = ReturnType<typeof createTerminal>;

/** Alternating per-cell styles keep each frame above the 64 KiB chunking threshold. */
function fillStyled(terminal: Terminal, cols: number, rows: number): void {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      terminal.put(x, y, "x", { fg: (x + y) % 2 === 0 ? "red" : "green" });
    }
  }
  terminal.commit();
}

/** Groups the captured writes into complete synchronized-output frames. */
function framesOf(writes: readonly string[]): string[][] {
  const frames: string[][] = [];
  let current: string[] | null = null;
  for (const chunk of writes) {
    if (current === null) {
      if (!chunk.includes("\u001B[?2026h")) continue;
      current = [];
    }
    current.push(chunk);
    if (chunk.includes("\u001B[?2026l")) {
      frames.push(current);
      current = null;
    }
  }
  return frames;
}

describe("stdout renderer (IME anchor across chunked writes)", () => {
  it("parks the IME cursor at every chunk boundary of a chunked frame", () => {
    const cols = 200;
    const rows = 120;
    const terminal = createTerminal({ cols, rows });
    fillStyled(terminal, cols, rows);

    const writes: string[] = [];
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk: string) => {
          writes.push(chunk);
        },
      },
      clear: false,
      hideCursor: true,
      altScreen: false,
      trackResize: false,
      useSyncOutput: true,
      getImeAnchor: () => ({ cellX: 7, cellY: 42 }),
    });

    renderer.render();

    const frames = framesOf(writes);
    expect(frames.length).toBeGreaterThan(0);
    const pin = "\u001B[43;8H";
    for (const chunks of frames) {
      const frame = chunks.join("");
      expect(frame.length).toBeGreaterThan(64 * 1024);
      expect(chunks.length).toBeGreaterThan(1);
      // A host reads the terminal between two writes: every chunk before the frame's
      // own anchor move must already leave the cursor on the IME anchor.
      for (const chunk of chunks.slice(0, -1)) {
        expect(chunk.endsWith(pin)).toBe(true);
      }
      // The frame's own anchor move stays the last cursor position of the frame and no
      // chunk is pinned twice.
      expect(chunks.at(-1)!.includes(pin)).toBe(true);
      expect(frame.split(pin).length - 1).toBe(chunks.length);
      expect(frame.endsWith("\u001B[?2026l")).toBe(true);
    }

    renderer.dispose();
  });

  it("leaves chunked frames unpinned when no input owns an IME anchor", () => {
    const cols = 200;
    const rows = 120;
    const terminal = createTerminal({ cols, rows });
    fillStyled(terminal, cols, rows);

    const writes: string[] = [];
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk: string) => {
          writes.push(chunk);
        },
      },
      clear: false,
      hideCursor: true,
      altScreen: false,
      trackResize: false,
      useSyncOutput: true,
      getImeAnchor: () => null,
    });

    renderer.render();

    const frames = framesOf(writes);
    expect(frames.length).toBeGreaterThan(0);
    for (const chunks of frames) {
      expect(chunks.join("").length).toBeGreaterThan(64 * 1024);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join("").includes("\u001B[43;8H")).toBe(false);
    }

    renderer.dispose();
  });

  it("pins a bottom-anchored frame to the anchor's absolute screen row", () => {
    const cols = 600;
    const rows = 20;
    const screenRows = 60;
    const terminal = createTerminal({ cols, rows });
    fillStyled(terminal, cols, rows);

    const writes: string[] = [];
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk: string) => {
          writes.push(chunk);
        },
      },
      clear: false,
      hideCursor: true,
      altScreen: false,
      trackResize: false,
      useSyncOutput: true,
      anchor: "bottom",
      screenRows: () => screenRows,
      getImeAnchor: () => ({ cellX: 3, cellY: 2 }),
    });

    renderer.render();

    const frames = framesOf(writes);
    expect(frames.length).toBeGreaterThan(0);
    // 20 buffer rows occupy screen rows 41..60 (1-based); buffer row 2 maps to screen
    // row 43, so the pin must not use the local row 3.
    const localPin = "\u001B[3;4H";
    const absolutePin = "\u001B[43;4H";
    for (const chunks of frames) {
      const frame = chunks.join("");
      expect(frame.length).toBeGreaterThan(64 * 1024);
      expect(chunks.length).toBeGreaterThan(1);
      expect(frame.includes(localPin)).toBe(false);
      expect(chunks.at(-1)!.includes(absolutePin)).toBe(true);
      for (const chunk of chunks.slice(0, -1)) {
        expect(chunk.endsWith(absolutePin)).toBe(true);
      }
    }

    renderer.dispose();
  });
});
