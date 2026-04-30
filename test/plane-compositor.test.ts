import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/core/index.js";
import { getPlaneTerminal } from "../src/core/terminal/create-terminal.js";

describe("plane compositor", () => {
  it("preserves transcript output when chrome updates another row", () => {
    const terminal = createTerminal({ cols: 12, rows: 3 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const chrome = getPlaneTerminal(terminal, "chrome");

    transcript.write("body", { x: 0, y: 0 });
    terminal.commit({ planes: ["transcript"] });

    chrome.write("footer", { x: 0, y: 2 });
    terminal.commit({ planes: ["chrome"] });

    const lines = terminal.snapshot().lines;
    expect(lines[0]?.slice(0, 4)).toBe("body");
    expect(lines[2]?.slice(0, 6)).toBe("footer");
  });

  it("treats untouched overlay cells as transparent", () => {
    const terminal = createTerminal({ cols: 8, rows: 2 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const overlay = getPlaneTerminal(terminal, "overlay");

    transcript.write("abcd", { x: 0, y: 0 });
    terminal.commit({ planes: ["transcript"] });

    overlay.write("X", { x: 2, y: 0 });
    terminal.commit({ planes: ["overlay"] });

    expect(terminal.snapshot().lines[0]?.slice(0, 4)).toBe("abXd");
  });

  it("lets upper planes blank underlying content with spaces", () => {
    const terminal = createTerminal({ cols: 8, rows: 2 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const chrome = getPlaneTerminal(terminal, "chrome");

    transcript.write("abcd", { x: 0, y: 0 });
    terminal.commit({ planes: ["transcript"] });

    chrome.write("  ", { x: 1, y: 0 });
    terminal.commit({ planes: ["chrome"] });

    expect(terminal.snapshot().lines[0]?.slice(0, 4)).toBe("a  d");
  });
});
