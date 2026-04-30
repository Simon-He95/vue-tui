import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";

describe("ansi", () => {
  it("maps 16-color SGR to palette name", () => {
    const t = createTerminal({ cols: 2, rows: 1 });
    t.writeAnsi("\x1B[31mA\x1B[0m", { x: 0, y: 0 });
    expect(t.getCell(0, 0).style.fg).toBe("red");
  });

  it("clamps 256-color SGR to palette name", () => {
    const t = createTerminal({ cols: 2, rows: 1 });
    t.writeAnsi("\x1B[38;5;196mA\x1B[0m", { x: 0, y: 0 });
    expect(t.getCell(0, 0).style.fg).toBe("red");
  });

  it("clamps truecolor SGR to palette name", () => {
    const t = createTerminal({ cols: 2, rows: 1 });
    t.writeAnsi("\x1B[38;2;1;2;3mA\x1B[0m", { x: 0, y: 0 });
    expect(t.getCell(0, 0).style.fg).toBe("black");
  });

  it("maps background color SGR", () => {
    const t = createTerminal({ cols: 2, rows: 1 });
    t.writeAnsi("\x1B[48;5;232mA\x1B[0m", { x: 0, y: 0 });
    expect(t.getCell(0, 0).style.bg).toBe("black");
  });
});
