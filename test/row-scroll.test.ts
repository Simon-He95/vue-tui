import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { getPlaneTerminal } from "../src/core/terminal/create-terminal.js";
import { createRenderManager } from "../src/vue/render/render-manager.js";
import { prepareUnsafeFullRowScroll } from "../src/vue/utils/row-scroll.js";

describe("row-scroll utils", () => {
  it("does not mutate terminal rows until the prepared plan is applied", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const render = createRenderManager(terminal);

    transcript.write("row0".padEnd(8), { x: 0, y: 0 });
    transcript.write("row1".padEnd(8), { x: 0, y: 1 });
    transcript.write("row2".padEnd(8), { x: 0, y: 2 });
    transcript.write("row3".padEnd(8), { x: 0, y: 3 });
    terminal.commit({ planes: ["transcript"], sync: true });

    const before = terminal.snapshot().lines;

    const plan = prepareUnsafeFullRowScroll({
      render,
      plane: "transcript",
      rect: { x: 0, y: 0, w: 8, h: 4 },
      terminalSize: terminal.size(),
      delta: 1,
      rowScrollMode: "unsafe-full-row",
      rendererCapabilities: { scrollOperations: true },
      isClipped: false,
      hasPendingDirtyRows: false,
      strategy: "auto",
    });

    expect(plan?.exposedRows).toEqual([3]);
    expect(terminal.snapshot().lines).toEqual(before);

    plan?.apply();
    terminal.commit({ planes: ["transcript"], sync: true });

    expect(terminal.snapshot().lines[0]?.trimEnd()).toBe("row1");
    expect(terminal.snapshot().lines[1]?.trimEnd()).toBe("row2");
    expect(terminal.snapshot().lines[2]?.trimEnd()).toBe("row3");

    terminal.dispose();
  });
});
