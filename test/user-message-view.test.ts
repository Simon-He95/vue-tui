import { describe, expect, it } from "vitest";
import { resolveTUserMessageViewModel, TUserMessageView } from "../src/agent.js";
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

describe("TUserMessageView", () => {
  it("exposes the same wrapped row model used by the component", () => {
    const content = "Open src/App.vue before editing";
    const start = content.indexOf("src/App.vue");
    const model = resolveTUserMessageViewModel({
      w: 42,
      label: "user",
      content,
      segments: [
        {
          start,
          end: start + "src/App.vue".length,
          href: "file:///tmp/src/App.vue",
          meta: { action: "open" },
        },
      ],
    });

    expect(model.headerText).toBe("> user");
    expect(model.headerSegments.map((segment) => segment.role)).toEqual(["prefix", "label"]);
    expect(model.rows[0]).toMatchObject({
      text: content,
      segments: [
        {
          href: "file:///tmp/src/App.vue",
          meta: { action: "open" },
        },
      ],
    });
  });

  it("matches best-agent user block spacing, header, and background", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TUserMessageView, {
          x: 0,
          y: 0,
          w: 52,
          label: "simon",
          content: "Run the agent console smoke scenario.",
        }),
      52,
      5,
    );

    try {
      expect(rowText(mounted, 0)).toBe("");
      expect(rowText(mounted, 1)).toBe("  > simon");
      expect(rowText(mounted, 2)).toBe("  Run the agent console smoke scenario.");
      expect(rowText(mounted, 3)).toBe("");
      for (let y = 0; y < 4; y++) {
        expect(cellStyle(mounted, 0, y)).toMatchObject({ bg: "blackBright" });
        expect(cellStyle(mounted, 51, y)).toMatchObject({ bg: "blackBright" });
      }
      expect(cellStyle(mounted, 2, 1)).toMatchObject({ fg: "greenBright", bold: true });
      expect(cellStyle(mounted, 4, 1)).toMatchObject({ fg: "greenBright", bold: true });
    } finally {
      mounted.unmount();
    }
  });

  it("keeps default foreground when style only overrides background", () => {
    const model = resolveTUserMessageViewModel({
      w: 24,
      content: "hello",
      style: { bg: "blue" },
    });

    expect(model.block).toMatchObject({ fg: "whiteBright", bg: "blue" });
    expect(model.header).toMatchObject({ fg: "white", bg: "blue" });
  });

  it("renders overridable content reference segments", async () => {
    const content = "Open src/App.vue before editing";
    const start = content.indexOf("src/App.vue");
    const mounted = await mountTerminal(
      () =>
        h(TUserMessageView, {
          x: 0,
          y: 0,
          w: 42,
          label: "user",
          content,
          segments: [
            {
              start,
              end: start + "src/App.vue".length,
              href: "file:///tmp/src/App.vue",
            },
          ],
        }),
      42,
      5,
    );

    try {
      expect(rowText(mounted, 2)).toBe("  Open src/App.vue before editing");
      expect(cellStyle(mounted, 7, 2)).toMatchObject({
        fg: "cyanBright",
        bg: "blackBright",
        underline: true,
        href: "file:///tmp/src/App.vue",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("allows style props and row slot overrides", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TUserMessageView,
          {
            x: 0,
            y: 0,
            w: 36,
            label: "me",
            content: "hello",
            style: { fg: "whiteBright", bg: "blue" },
            labelStyle: { fg: "yellowBright" },
          },
          {
            row: (ctx: { y: number; text: string }) =>
              h(TText, {
                x: 0,
                y: ctx.y,
                w: 36,
                value: `  custom:${ctx.text}`,
                style: { fg: "black", bg: "greenBright", bold: true },
              }),
          },
        ),
      36,
      4,
    );

    try {
      expect(rowText(mounted, 1)).toBe("  > me");
      expect(rowText(mounted, 2)).toBe("  custom:hello");
      expect(cellStyle(mounted, 0, 0)).toMatchObject({ bg: "blue" });
      expect(cellStyle(mounted, 4, 1)).toMatchObject({ fg: "yellowBright" });
      expect(cellStyle(mounted, 2, 2)).toMatchObject({ bg: "greenBright", bold: true });
    } finally {
      mounted.unmount();
    }
  });
});
