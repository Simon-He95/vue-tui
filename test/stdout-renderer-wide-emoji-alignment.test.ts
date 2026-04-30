import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer";

describe("stdout renderer (wide emoji alignment)", () => {
  it("inserts a cursor fix after 2-cell emoji clusters", () => {
    const terminal = createTerminal({ cols: 20, rows: 1 });

    // Place a 2-cell emoji cluster, then a sentinel character.
    terminal.write("A⚠️B", { x: 0, y: 0 });
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
    });

    renderer.render();
    renderer.dispose();

    // After writing row 1, the emoji lead cell is at x=1 (0-based) and has width=2,
    // so the renderer should force the cursor to col=4 (1-based) to ensure alignment.
    expect(frame).toContain("\u001B[1;4H");
  });
});
