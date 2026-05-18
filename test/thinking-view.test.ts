import { describe, expect, it } from "vitest";
import { resolveTThinkingViewModel, TThinkingView } from "../src/agent.js";
import { h, mountTerminal } from "./ui-regressions-support.js";

function rowText(
  mounted: { terminal: { getRow: (y: number) => readonly { ch: string }[] } },
  y: number,
): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

describe("TThinkingView", () => {
  it("exposes the same collapsed pulse model used by the component", () => {
    const model = resolveTThinkingViewModel({
      w: 40,
      title: "abc",
      collapsed: true,
      pulseFrame: 1,
    });

    expect(model.headerText).toBe("▸ aBc");
    expect(model.bodyRows).toEqual([]);
  });

  it("renders expanded body rows", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TThinkingView, {
          x: 0,
          y: 0,
          w: 42,
          title: "Thinking",
          content: "alpha\nbeta",
        }),
      42,
      4,
    );

    try {
      expect(rowText(mounted, 0)).toBe("▾ Thinking");
      expect(rowText(mounted, 1)).toBe("  alpha");
      expect(rowText(mounted, 2)).toBe("  beta");
    } finally {
      mounted.unmount();
    }
  });
});
