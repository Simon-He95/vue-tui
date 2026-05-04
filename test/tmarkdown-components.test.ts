import { describe, expect, it } from "vitest";
import { TMarkdownText } from "../src/index.js";
import { TVirtualMarkdown } from "../src/experimental.js";
import { h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

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

  it("honors initial controlled scrollTop after markdown rows are built", async () => {
    const content = Array.from({ length: 40 }, (_, index) => `- row-${index}`).join("\n");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content,
          scrollTop: 20,
        }),
      20,
      8,
    );

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "- row-20",
      "- row-21",
      "- row-22",
      "- row-23",
    ]);
    mounted.unmount();
  });

  it("emits clamped scrollTop when controlled content shrinks below the current viewport", async () => {
    const content = ref(Array.from({ length: 100 }, (_, index) => `- row-${index}`).join("\n"));
    const updates: number[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content: content.value,
          scrollTop: 90,
          "onUpdate:scrollTop": (value: number) => {
            updates.push(value);
          },
        }),
      20,
      8,
    );

    content.value = Array.from({ length: 10 }, (_, index) => `- row-${index}`).join("\n");
    await nextTick();
    await nextTick();

    expect(updates).toContain(6);
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "- row-6",
      "- row-7",
      "- row-8",
      "- row-9",
    ]);
    mounted.unmount();
  });

  it("preserves trailing cells when TMarkdownText clear=false", async () => {
    const content = ref("hello world");
    const mounted = await mountTerminal(
      () => [
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 12,
          h: 1,
          content: "ABCDEFGHIJKL",
        }),
        h(TMarkdownText, {
          x: 0,
          y: 0,
          zIndex: 1,
          w: 12,
          h: 1,
          content: content.value,
          clear: false,
        }),
      ],
      16,
      4,
    );

    content.value = "hi";
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).ch).toBe("h");
    expect(mounted.terminal.getCell(1, 0).ch).toBe("i");
    expect(mounted.terminal.getCell(2, 0).ch).toBe("C");
    expect(rowText(mounted, 0)).toBe("hiCDEFGHIJKL");
    mounted.unmount();
  });
});
