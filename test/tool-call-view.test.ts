import { describe, expect, it } from "vitest";
import { TToolCallView } from "../src/agent.js";
import { h, mountTerminal, TText } from "./ui-regressions-support.js";

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

function cellStyle(
  mounted: { terminal: { getRow: (y: number) => readonly { style: Record<string, unknown> }[] } },
  x: number,
  y: number,
): Record<string, unknown> {
  return mounted.terminal.getRow(y)[x]?.style ?? {};
}

describe("TToolCallView", () => {
  it("matches best-agent collapsed streaming tool_call header and preview", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TToolCallView, {
          x: 2,
          y: 0,
          w: 42,
          title: "shell",
          collapsed: true,
          suffix: "pnpm test",
          preview: "latest",
        }),
      46,
      2,
    );

    try {
      expect(rowText(mounted, 0).trim()).toBe("▸ ● shell pnpm test");
      expect(rowText(mounted, 1).trim()).toBe("⎿ latest");
      expect(cellStyle(mounted, 2, 0)).toMatchObject({
        fg: "yellowBright",
        bg: "black",
        dim: true,
      });
      expect(cellStyle(mounted, 4, 0)).toMatchObject({
        fg: "white",
        bg: "black",
        dim: true,
      });
      expect(cellStyle(mounted, 6, 0)).toMatchObject({
        fg: "yellowBright",
        bg: "black",
        dim: false,
      });
      expect(cellStyle(mounted, 12, 0)).toMatchObject({
        fg: "white",
        bg: "black",
        dim: true,
      });
      expect(cellStyle(mounted, 4, 1)).toMatchObject({
        fg: "yellowBright",
        bg: "black",
        dim: true,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("hides suffix and preview when expanded like best-agent", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TToolCallView, {
          x: 0,
          y: 0,
          w: 42,
          title: "write-workspace",
          collapsed: false,
          status: "success",
          suffix: "src/a.ts (+3)",
          preview: "latest",
        }),
      42,
      2,
    );

    try {
      expect(rowText(mounted, 0).trim()).toBe("▾ ● write-workspace");
      expect(rowText(mounted, 0)).not.toContain("src/a.ts");
      expect(rowText(mounted, 1).trim()).toBe("");
      expect(cellStyle(mounted, 2, 0)).toMatchObject({
        fg: "greenBright",
        bg: "black",
        bold: true,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("maps error and warning status dots to overridable renderer styles", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TToolCallView, {
          x: 0,
          y: 0,
          w: 24,
          title: "read",
          status: "error",
        }),
        h(TToolCallView, {
          x: 0,
          y: 1,
          w: 24,
          title: "search",
          status: "warning",
        }),
      ],
      24,
      2,
    );

    try {
      expect(cellStyle(mounted, 2, 0)).toMatchObject({
        fg: "redBright",
        bg: "black",
        bold: true,
      });
      expect(cellStyle(mounted, 2, 1)).toMatchObject({
        fg: "yellowBright",
        bg: "black",
        bold: true,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("allows style props and slots to replace the default chrome", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TToolCallView,
          {
            x: 0,
            y: 0,
            w: 36,
            title: "shell",
            collapsed: true,
            suffix: "pnpm test",
            preview: "latest",
            style: { fg: "cyanBright", bg: "blue" },
            titleStyle: { fg: "yellowBright" },
            suffixStyle: { fg: "magentaBright" },
          },
          {
            preview: (ctx: { preview: string }) =>
              h(TText, {
                x: 0,
                y: 1,
                w: 36,
                value: `custom:${ctx.preview}`,
                style: { fg: "black", bg: "greenBright", bold: true },
              }),
          },
        ),
      36,
      2,
    );

    try {
      expect(rowText(mounted, 0).trim()).toBe("▸ ● shell pnpm test");
      expect(rowText(mounted, 1).trim()).toBe("custom:latest");
      expect(cellStyle(mounted, 0, 0)).toMatchObject({ bg: "blue" });
      expect(cellStyle(mounted, 4, 0)).toMatchObject({ fg: "yellowBright" });
      expect(cellStyle(mounted, 10, 0)).toMatchObject({ fg: "magentaBright" });
      expect(cellStyle(mounted, 0, 1)).toMatchObject({
        fg: "black",
        bg: "greenBright",
        bold: true,
      });
    } finally {
      mounted.unmount();
    }
  });
});
