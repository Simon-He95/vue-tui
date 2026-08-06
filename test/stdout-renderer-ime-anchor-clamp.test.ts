import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer";

describe("stdout renderer (IME anchor clamping)", () => {
  it("clamps IME anchor to the viewport in the rendered frame", () => {
    const terminal = createTerminal({ cols: 10, rows: 5 });
    terminal.commit();

    let frame = "";
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk) => {
          frame += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      trackResize: false,
      getImeAnchor: () => ({ cellX: 999, cellY: 999 }),
    });

    renderer.render();
    renderer.dispose();

    // Clamped to last cell: (x=9,y=4) => row=5,col=10 (1-based)
    expect(frame).toContain("\u001B[5;10H");
  });

  it("maps a bottom-anchored IME cursor to its absolute screen row", () => {
    const terminal = createTerminal({ cols: 10, rows: 3 });
    terminal.commit();

    let frame = "";
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk) => {
          frame += chunk;
        },
      },
      clear: false,
      hideCursor: true,
      altScreen: false,
      trackResize: false,
      anchor: "bottom",
      screenRows: () => 10,
      getImeAnchor: () => ({ cellX: 4, cellY: 1 }),
    });

    renderer.render();
    renderer.dispose();

    // The 3-row bar occupies screen rows 8..10 (1-based). Its local row 2
    // (cellY=1) maps to absolute row 9; cellX=4 maps to column 5.
    expect(frame).toContain("\u001B[9;5H");
    expect(frame).not.toContain("\u001B[2;5H");
  });

  it("clamps explicit setCursor calls to the viewport", () => {
    const terminal = createTerminal({ cols: 10, rows: 5 });
    terminal.commit();

    let out = "";
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk) => {
          out += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      trackResize: false,
    });

    renderer.setCursor(999, 999);
    renderer.dispose();

    expect(out).toContain("\u001B[5;10H");
  });
});
