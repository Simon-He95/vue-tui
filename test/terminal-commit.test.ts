import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { getPlaneTerminal } from "../src/core/terminal/create-terminal.js";

describe("terminal commits", () => {
  it("clears dirtyAll state for every render plane in one all-plane commit", () => {
    const terminal = createTerminal({ cols: 6, rows: 2 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const chrome = getPlaneTerminal(terminal, "chrome");
    const overlay = getPlaneTerminal(terminal, "overlay");

    terminal.write("d", { x: 0, y: 0 });
    transcript.write("t", { x: 1, y: 0 });
    chrome.write("c", { x: 2, y: 0 });
    overlay.write("o", { x: 3, y: 0 });

    expect(terminal.commit({ sync: true })).toBeNull();
    expect(terminal.commit({ sync: true })).toEqual([]);

    terminal.resize(6, 3);

    expect(terminal.commit({ sync: true })).toEqual([]);
    expect(terminal.commit({ sync: true })).toEqual([]);

    terminal.dispose();
  });

  it("ignores non-numeric put coordinates from JavaScript consumers", () => {
    const terminal = createTerminal({ cols: 4, rows: 1 }) as any;

    expect(() => terminal.put("__proto__", 0, "x")).not.toThrow();
    expect(() => terminal.put(0, "__proto__", "x")).not.toThrow();
    expect(() => terminal.put(Number.POSITIVE_INFINITY, 0, "x")).not.toThrow();
    expect(() => terminal.put(0, Number.NaN, "x")).not.toThrow();

    expect(terminal.snapshot().lines[0]).toBe("    ");
    terminal.dispose();
  });
});
