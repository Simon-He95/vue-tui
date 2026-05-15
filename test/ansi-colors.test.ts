import { describe, expect, it } from "vitest";
import { ANSI16_COLORS, ANSI256_COLORS, ANSI8_COLORS, rgbToAnsi256 } from "../src/core.js";

const SGR_RESET = "\u001B[0m";

function wrapper(ansi256Index: number, text: string): string {
  return `${ANSI256_COLORS[ansi256Index]!.fgOpen}${text}${SGR_RESET}`;
}

describe("ansi colors", () => {
  it("exports 8/16/256 palettes", () => {
    expect(ANSI8_COLORS).toHaveLength(8);
    expect(ANSI16_COLORS).toHaveLength(16);
    expect(ANSI256_COLORS).toHaveLength(256);

    expect(ANSI8_COLORS[0]!.fgOpen).toBe("\u001B[30m");
    expect(ANSI8_COLORS[0]!.bgOpen).toBe("\u001B[40m");
    expect(ANSI16_COLORS[8]!.fgOpen).toBe("\u001B[90m");
    expect(ANSI16_COLORS[8]!.bgOpen).toBe("\u001B[100m");
    expect(ANSI256_COLORS[196]!.fgOpen).toBe("\u001B[38;5;196m");
    expect(ANSI256_COLORS[196]!.bgOpen).toBe("\u001B[48;5;196m");
  });

  it("maps RGB to correct xterm-256 index", () => {
    expect(rgbToAnsi256({ r: 255, g: 0, b: 0 })).toBe(196);
    expect(rgbToAnsi256({ r: 0, g: 255, b: 0 })).toBe(46);
    expect(rgbToAnsi256({ r: 0, g: 0, b: 255 })).toBe(21);
    expect(rgbToAnsi256({ r: 249, g: 38, b: 114 })).toBe(197);
  });

  it("wraps text with computed 256-color SGR", () => {
    const idx = rgbToAnsi256({ r: 249, g: 38, b: 114 });
    const colored = wrapper(idx, "nihao");
    expect(colored).toBe(`\u001B[38;5;197mnihao\u001B[0m`);
    console.log(colored);
  });
});
