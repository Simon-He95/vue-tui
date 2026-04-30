import { describe, expect, it } from "vitest";
import { createStdoutRenderer, createTerminal } from "../src/index.js";

describe("stdout renderer style diffing", () => {
  it("avoids per-run resets when only setting attributes", () => {
    const terminal = createTerminal({ cols: 4, rows: 1 });
    let out = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };

    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    out = "";
    terminal.put(0, 0, "A", { fg: "red" });
    terminal.put(1, 0, "B", { fg: "green" });
    terminal.put(2, 0, "C", { fg: "blue" });
    terminal.put(3, 0, "D", { fg: "yellow" });
    terminal.commit();

    const resets = out.match(/\u001B\[0m/g) ?? [];
    // Reset at frame start + reset to clear fg before EOL clear + reset at frame end.
    // Critically, we do not emit a reset for every color run.
    expect(resets.length).toBe(3);

    renderer.dispose();
  });
});
