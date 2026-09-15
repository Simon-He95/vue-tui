import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { getStdoutRendererMetrics } from "../src/renderer/cli/stdout-metrics.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";

type Terminal = ReturnType<typeof createTerminal>;

const COLS = 200;
const ROWS = 120;
const SYNC_START = "\u001B[?2026h";
const SYNC_END = "\u001B[?2026l";
/** The frame's IME anchor move for the default fixture: row 42, column 7 (1-based). */
const ANCHOR = "\u001B[43;8H";
const CURSOR_MOVE = /\u001B\[\d+;\d+H/g;

/** Alternating per-cell styles keep every frame far above the 64 KiB chunking threshold. */
function fillStyled(terminal: Terminal, cols: number, rows: number): void {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      terminal.put(x, y, "x", { fg: (x + y) % 2 === 0 ? "red" : "green" });
    }
  }
  terminal.commit();
}

interface FrameOptions {
  cols?: number;
  rows?: number;
  anchor?: { cellX: number; cellY: number } | null;
  bottomAnchored?: { screenRows: number };
}

/** Renders one frame and returns its chunked writes plus every write before dispose. */
function renderChunkedFrame(options: FrameOptions = {}): { writes: string[]; frames: string[][] } {
  const cols = options.cols ?? COLS;
  const rows = options.rows ?? ROWS;
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
    ...(options.bottomAnchored
      ? { anchor: "bottom" as const, screenRows: () => options.bottomAnchored!.screenRows }
      : {}),
    getImeAnchor: () =>
      options.anchor === undefined ? { cellX: 7, cellY: 42 } : (options.anchor ?? null),
  });

  renderer.render();
  const frames = framesOf(writes);
  renderer.dispose();
  return { writes: [...writes], frames };
}

/** Groups captured writes into complete synchronized-output frames. */
function framesOf(writes: readonly string[]): string[][] {
  const frames: string[][] = [];
  let current: string[] | null = null;
  for (const chunk of writes) {
    if (current === null) {
      if (!chunk.includes(SYNC_START)) continue;
      current = [];
    }
    current.push(chunk);
    if (chunk.includes(SYNC_END)) {
      frames.push(current);
      current = null;
    }
  }
  return frames;
}

const cursorMovesOf = (frame: string): string[] => frame.match(CURSOR_MOVE) ?? [];

describe("stdout renderer (chunked write integrity)", () => {
  it("writes a chunked frame byte for byte, with no interposed cursor move", () => {
    const { frames } = renderChunkedFrame();
    const chunks = frames.at(-1);
    expect(chunks).toBeDefined();
    expect(chunks!.length).toBeGreaterThan(1);

    const frame = chunks!.join("");
    // A chunked write is a partition of the frame: anything the renderer adds between
    // chunks (the IME pin #141 appended after every chunk) desynchronizes the terminal
    // cursor in the middle of a span and paints the rest of that span at the pin's cell.
    expect(Buffer.byteLength(frame, "utf8")).toBe(getStdoutRendererMetrics().lastFrameBytes);
    expect(getStdoutRendererMetrics().writeMode).toBe("chunked");
    expect(frame.split(ANCHOR).length - 1).toBe(1);
    // The frame's own anchor move stays its last cursor position.
    expect(cursorMovesOf(frame).at(-1)).toBe(ANCHOR);
    expect(frame.endsWith(SYNC_END)).toBe(true);
  });

  it("writes a chunked frame without an IME anchor byte for byte as well", () => {
    const { frames } = renderChunkedFrame({ anchor: null });
    const chunks = frames.at(-1);
    expect(chunks).toBeDefined();
    expect(chunks!.length).toBeGreaterThan(1);

    const frame = chunks!.join("");
    expect(Buffer.byteLength(frame, "utf8")).toBe(getStdoutRendererMetrics().lastFrameBytes);
    expect(frame.includes(ANCHOR)).toBe(false);
    expect(frame.endsWith(SYNC_END)).toBe(true);
  });

  it("parks a bottom-anchored frame on the anchor's absolute screen row", () => {
    const screenRows = 60;
    const { frames } = renderChunkedFrame({
      cols: 600,
      rows: 20,
      bottomAnchored: { screenRows },
      anchor: { cellX: 3, cellY: 2 },
    });
    const chunks = frames.at(-1);
    expect(chunks).toBeDefined();
    expect(chunks!.length).toBeGreaterThan(1);

    const frame = chunks!.join("");
    // 20 buffer rows occupy screen rows 41..60 (1-based); buffer row 2 maps to screen
    // row 43, so the anchor move must not use the local row 3.
    const localAnchor = "\u001B[3;4H";
    const absoluteAnchor = "\u001B[43;4H";
    expect(frame.includes(localAnchor)).toBe(false);
    expect(cursorMovesOf(frame).at(-1)).toBe(absoluteAnchor);
    expect(Buffer.byteLength(frame, "utf8")).toBe(getStdoutRendererMetrics().lastFrameBytes);
  });
});
