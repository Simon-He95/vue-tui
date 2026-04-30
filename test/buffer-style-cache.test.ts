import { describe, expect, test } from "vitest";
import {
  createBlankCell,
  createContinuationCell,
  normalizeStyle,
} from "../src/core/buffer/buffer.js";

describe("buffer style normalization caching", () => {
  test("normalizeStyle(undefined) returns a stable default style", () => {
    expect(normalizeStyle()).toBe(normalizeStyle());
  });

  test("normalizeStyle returns frozen clones for mutable styles and memoizes by identity", () => {
    const input = { fg: "red" } as any;
    const a = normalizeStyle(input);
    const b = normalizeStyle(input);
    expect(a).toBe(b);
    expect(a).not.toBe(input);
    expect(Object.isFrozen(a)).toBe(true);
  });

  test("normalizeStyle returns the same frozen style object when already frozen", () => {
    const frozen = Object.freeze({ fg: "blue" }) as any;
    expect(normalizeStyle(frozen)).toBe(frozen);
  });

  test("blank/continuation cells are cached per normalized style", () => {
    const style = { fg: "green" } as any;
    const blankA = createBlankCell(style);
    const blankB = createBlankCell(style);
    expect(blankA).toBe(blankB);

    const contA = createContinuationCell(style);
    const contB = createContinuationCell(style);
    expect(contA).toBe(contB);
  });
});
