import { describe, expect, it } from "vitest";
import { TMarkdownText } from "../src/index.js";
import { TVirtualMarkdown } from "../src/experimental.js";
import { h, mountTerminal, nextTick } from "./ui-regressions-support.js";

function rowText(mounted: Awaited<ReturnType<typeof mountTerminal>>, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function dispatchWheel(container: HTMLElement): void {
  const wheel = new Event("wheel", { bubbles: true }) as any;
  wheel.clientX = 0;
  wheel.clientY = 0;
  wheel.deltaY = 100;
  container.dispatchEvent(wheel);
}

describe("markdown components", () => {
  it("renders styled markdown rows without feeding raw AST into TText", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 24,
          h: 4,
          content: "# Title\n\nhello **world** [ok](https://example.com)",
        }),
      24,
      6,
    );

    expect(rowText(mounted, 0)).toBe("Title");
    expect(rowText(mounted, 2)).toBe("hello world ok");
    expect(mounted.terminal.getCell(0, 0).style.bold).toBe(true);
    expect(mounted.terminal.getCell(6, 2).style.bold).toBe(true);
    expect(mounted.terminal.getCell(12, 2).style.href).toBe("https://example.com");
    mounted.unmount();
  });

  it("virtualizes markdown rows and repaints the viewport on wheel scroll", async () => {
    const content = Array.from({ length: 12 }, (_, index) => `- item-${index}`).join("\n");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content,
          autoFocus: true,
        }),
      20,
      8,
    );

    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    dispatchWheel(mounted.container()!);
    await nextTick();
    await nextTick();

    off();
    expect(commits.some((rows) => rows != null && rows.join(",") === "0,1,2,3")).toBe(true);
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "- item-1",
      "- item-2",
      "- item-3",
      "- item-4",
    ]);
    mounted.unmount();
  });
});
