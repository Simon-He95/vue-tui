import { describe, expect, it } from "vitest";
import { TThinkingView, TUserMessageView } from "../src/agent.js";
import { h, mountTerminal } from "./ui-regressions-support.js";

function rowText(mounted: Awaited<ReturnType<typeof mountTerminal>>, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function cellStyle(mounted: Awaited<ReturnType<typeof mountTerminal>>, x: number, y: number) {
  return mounted.terminal.getCell(x, y).style;
}

describe("agent message views", () => {
  it("renders thinking header and hides body when collapsed", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TThinkingView, {
          x: 0,
          y: 0,
          w: 24,
          title: "Thinking",
          content: "Inspect code\nRun tests",
          collapsed: true,
        }),
      24,
      3,
    );

    try {
      expect(rowText(mounted, 0)).toBe("▸ Thinking");
      expect(rowText(mounted, 1)).toBe("");
      expect(cellStyle(mounted, 0, 0)).toMatchObject({
        fg: "magentaBright",
        bg: "black",
        bold: true,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("renders expanded thinking body rows", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TThinkingView, {
          x: 0,
          y: 0,
          w: 24,
          title: "Thinking",
          content: "Inspect code\nRun tests",
        }),
      24,
      3,
    );

    try {
      expect(rowText(mounted, 0)).toBe("▾ Thinking");
      expect(rowText(mounted, 1)).toBe("Inspect code");
      expect(rowText(mounted, 2)).toBe("Run tests");
      expect(cellStyle(mounted, 0, 1)).toMatchObject({
        fg: "white",
        bg: "black",
        dim: true,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("renders user message chrome and styled content segments", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TUserMessageView, {
          x: 0,
          y: 0,
          w: 24,
          label: "You",
          meta: "now",
          content: "hello world",
          topBlank: false,
          bottomBlank: false,
          segments: [{ start: 6, end: 11, href: "https://example.com" }],
        }),
      24,
      2,
    );

    try {
      expect(rowText(mounted, 0)).toBe("  > You now");
      expect(rowText(mounted, 1)).toBe("  hello world");
      expect(cellStyle(mounted, 2, 0)).toMatchObject({ fg: "greenBright", bold: true });
      expect(cellStyle(mounted, 4, 0)).toMatchObject({ fg: "greenBright", bold: true });
      expect(cellStyle(mounted, 8, 1)).toMatchObject({
        fg: "cyanBright",
        bg: "blackBright",
        underline: true,
        href: "https://example.com",
      });
    } finally {
      mounted.unmount();
    }
  });
});
