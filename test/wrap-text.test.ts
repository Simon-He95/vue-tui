import { describe, expect, it } from "vitest";
import { charCellWidth } from "../src/core/buffer/width.js";

function wrapTextByWidth(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const result: string[] = [];
  for (const line of text.split("\n")) {
    if (line.length === 0) {
      result.push("");
      continue;
    }
    let currentLine = "";
    let cells = 0;
    for (const ch of line) {
      const w = charCellWidth(ch);
      if (cells + w > width) {
        result.push(currentLine);
        currentLine = ch;
        cells = w;
      } else {
        currentLine += ch;
        cells += w;
      }
    }
    if (currentLine || cells === 0) result.push(currentLine);
  }
  return result.length > 0 ? result : [""];
}

describe("wrapTextByWidth", () => {
  it("should wrap Chinese text correctly", () => {
    const text = `多行
修改了用户消息的处理逻辑（第397-403行），使用 wrapTextByWidth 函数对用户消息进行自动换行
之前用户消息只是简单按 \\n 分割，没有考虑长行的换行问题。现在会根据可用宽度（width - contentIndent）自动将超长的文本行拆分成`;

    const result = wrapTextByWidth(text, 80);

    // Should not hang and return an array of lines
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Each line should not exceed 80 cells
    for (const line of result) {
      let cells = 0;
      for (const ch of line) {
        cells += charCellWidth(ch);
      }
      expect(cells).toBeLessThanOrEqual(80);
    }
  });

  it("should handle simple text", () => {
    const text = "Hello World";
    const result = wrapTextByWidth(text, 5);
    expect(result).toEqual(["Hello", " Worl", "d"]);
  });

  it("should handle empty lines", () => {
    const text = "Hello\n\nWorld";
    const result = wrapTextByWidth(text, 80);
    expect(result).toEqual(["Hello", "", "World"]);
  });

  it("should not hang with width 0", () => {
    const text = "Hello";
    const result = wrapTextByWidth(text, 0);
    expect(result).toEqual(["Hello"]);
  });

  it("should not hang with width -1", () => {
    const text = "Hello";
    const result = wrapTextByWidth(text, -1);
    expect(result).toEqual(["Hello"]);
  });
});
