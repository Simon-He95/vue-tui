import { describe, expect, it } from "vitest";
import { TMarkdownText, TVirtualMarkdown } from "../src/markdown.js";
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

  it("updates href metadata when only the markdown link target changes", async () => {
    const content = ref("[ok](https://a.example)");
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 24,
          h: 2,
          content: content.value,
        }),
      24,
      4,
    );

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://a.example");

    content.value = "[ok](https://b.example)";
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://b.example");
    mounted.unmount();
  });

  it("keeps href metadata for bare relative markdown links", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 24,
          h: 2,
          content: "[guide](guide/parser-api)",
        }),
      24,
      4,
    );

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("guide/parser-api");
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

  it("updates href metadata inside TVirtualMarkdown when only the link target changes", async () => {
    const content = ref("[ok](https://a.example)");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 24,
          h: 2,
          content: content.value,
        }),
      24,
      4,
    );

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://a.example");

    content.value = "[ok](https://b.example)";
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://b.example");
    mounted.unmount();
  });

  it("keeps native text selection enabled for TVirtualMarkdown by default", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 2,
          content: "hello",
        }),
      20,
      4,
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    expect(container.style.userSelect).toBe("text");
    container.dispatchEvent(new MouseEvent("mouseup", { clientX: 0, clientY: 0, bubbles: true }));
    expect(container.style.userSelect).toBe("text");
    mounted.unmount();
  });

  it("can disable native text selection for TVirtualMarkdown", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 2,
          content: "hello",
          selectable: false,
        }),
      20,
      4,
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    expect(container.style.userSelect).toBe("none");
    container.dispatchEvent(new MouseEvent("mouseup", { clientX: 0, clientY: 0, bubbles: true }));
    expect(container.style.userSelect).toBe("text");
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

  it("emits clamped scrollTop when a controlled scrollTop prop becomes out of range", async () => {
    const scrollTop = ref(0);
    const updates: number[] = [];
    const content = Array.from({ length: 20 }, (_, index) => `- row-${index}`).join("\n");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content,
          scrollTop: scrollTop.value,
          "onUpdate:scrollTop": (value: number) => {
            updates.push(value);
          },
        }),
      20,
      8,
    );

    scrollTop.value = 999;
    await nextTick();
    await nextTick();

    expect(updates).toContain(16);
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "- row-16",
      "- row-17",
      "- row-18",
      "- row-19",
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

  it("reflows auto-height markdown text to the latest coalesced streaming content", async () => {
    const content = ref("one");
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 12,
          content: content.value,
          streaming: true,
        }),
      16,
      6,
    );

    content.value = "one\n\ntwo";
    content.value = "one\n\ntwo\n\nthree";
    await nextTick();
    await nextTick();

    expect([0, 1, 2, 3, 4].map((y) => rowText(mounted, y))).toEqual([
      "one",
      "",
      "two",
      "",
      "three",
    ]);
    mounted.unmount();
  });

  it("reflows streaming markdown text when width changes", async () => {
    const width = ref(12);
    const content = ref("你好hello world");
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: width.value,
          content: content.value,
          streaming: true,
        }),
      16,
      6,
    );

    width.value = 4;
    await nextTick();
    await nextTick();

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual(["你好", "hell", "o wo", "rld"]);
    mounted.unmount();
  });

  it("clears old rows when auto-height markdown text shrinks", async () => {
    const content = ref("one\n\ntwo\n\nthree");
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 12,
          content: content.value,
        }),
      16,
      6,
    );

    content.value = "one";
    await nextTick();
    await nextTick();

    expect([0, 1, 2, 3, 4].map((y) => rowText(mounted, y))).toEqual(["one", "", "", "", ""]);
    mounted.unmount();
  });

  it("reflows markdown immediately when width changes", async () => {
    const width = ref(12);
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: width.value,
          content: "你好hello world",
        }),
      16,
      6,
    );

    width.value = 4;
    await nextTick();

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual(["你好", "hell", "o wo", "rld"]);
    mounted.unmount();
  });

  it("honors same-tick controlled scrollTop updates when content appends", async () => {
    const content = ref(Array.from({ length: 50 }, (_, index) => `- row-${index}`).join("\n"));
    const scrollTop = ref(46);
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content: content.value,
          scrollTop: scrollTop.value,
        }),
      20,
      8,
    );

    content.value = Array.from({ length: 100 }, (_, index) => `- row-${index}`).join("\n");
    scrollTop.value = 96;
    await nextTick();
    await nextTick();

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "- row-96",
      "- row-97",
      "- row-98",
      "- row-99",
    ]);
    mounted.unmount();
  });

  it("keeps absolute scrollTop semantics when content is inserted before the viewport", async () => {
    const content = ref(Array.from({ length: 100 }, (_, index) => `- row-${index}`).join("\n"));
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content: content.value,
          scrollTop: 50,
        }),
      20,
      8,
    );

    content.value = [
      "- pre-0",
      "- pre-1",
      "- pre-2",
      content.value,
    ].join("\n");
    await nextTick();
    await nextTick();

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "- row-47",
      "- row-48",
      "- row-49",
      "- row-50",
    ]);
    mounted.unmount();
  });

  it("does not paint TMarkdownText outside its rect when dirty rows include other components", async () => {
    const top = ref("top-a");
    const markdown = ref("**markdown-a**");
    const mounted = await mountTerminal(
      () => [
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 20,
          h: 1,
          content: top.value,
        }),
        h(TMarkdownText, {
          x: 0,
          y: 3,
          w: 20,
          h: 1,
          content: markdown.value,
        }),
      ],
      20,
      6,
    );

    top.value = "top-b";
    markdown.value = "**markdown-b**";
    await nextTick();
    await nextTick();

    expect(rowText(mounted, 0)).toBe("top-b");
    expect(rowText(mounted, 3)).toBe("markdown-b");
    mounted.unmount();
  });

  it("does not let TVirtualMarkdown clear rows outside its rect when dirty rows include other components", async () => {
    const top = ref("top-a");
    const markdown = ref(Array.from({ length: 8 }, (_, index) => `- item-${index}`).join("\n"));
    const mounted = await mountTerminal(
      () => [
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 20,
          h: 1,
          content: top.value,
        }),
        h(TVirtualMarkdown, {
          x: 0,
          y: 2,
          w: 20,
          h: 3,
          content: markdown.value,
        }),
      ],
      20,
      6,
    );

    top.value = "top-b";
    markdown.value = Array.from({ length: 8 }, (_, index) => `- next-${index}`).join("\n");
    await nextTick();
    await nextTick();

    expect(rowText(mounted, 0)).toBe("top-b");
    expect([2, 3, 4].map((y) => rowText(mounted, y))).toEqual(["- next-0", "- next-1", "- next-2"]);
    mounted.unmount();
  });
});
