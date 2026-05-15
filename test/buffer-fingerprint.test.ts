import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/core/index.js";
import type { Style } from "../src/core/types.js";

function fp(ch: string, _style: Style): number {
  return ch.charCodeAt(0) || 0;
}

function rowFp(text: string): number[] {
  return Array.from(text).map((ch) => ch.charCodeAt(0));
}

describe("buffer fingerprints", () => {
  it("keeps fingerprints in sync after scrolling down", () => {
    const terminal = createTerminal({ cols: 3, rows: 3 });
    terminal.setFingerprintFn(fp);

    terminal.write("AAA", { x: 0, y: 0 });
    terminal.write("BBB", { x: 0, y: 1 });
    terminal.write("CCC", { x: 0, y: 2 });
    terminal.commit({ sync: true });

    terminal.scroll(1);
    terminal.commit({ sync: true });

    expect(Array.from(terminal.getRowFingerprints(0)!)).toEqual(rowFp("BBB"));
    expect(Array.from(terminal.getRowFingerprints(1)!)).toEqual(rowFp("CCC"));
    expect(Array.from(terminal.getRowFingerprints(2)!)).toEqual(rowFp("   "));
  });

  it("keeps fingerprints in sync after reverse scrolling", () => {
    const terminal = createTerminal({ cols: 3, rows: 3 });
    terminal.setFingerprintFn(fp);

    terminal.write("AAA", { x: 0, y: 0 });
    terminal.write("BBB", { x: 0, y: 1 });
    terminal.write("CCC", { x: 0, y: 2 });
    terminal.commit({ sync: true });

    terminal.scroll(-1);
    terminal.commit({ sync: true });

    expect(Array.from(terminal.getRowFingerprints(0)!)).toEqual(rowFp("   "));
    expect(Array.from(terminal.getRowFingerprints(1)!)).toEqual(rowFp("AAA"));
    expect(Array.from(terminal.getRowFingerprints(2)!)).toEqual(rowFp("BBB"));
  });
});
