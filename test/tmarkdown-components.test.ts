import { describe, expect, it } from "vitest";
import { TMarkdownText, TVirtualMarkdown } from "../src/markdown.js";
import { h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

const TINY_PNG_DATA_URL =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

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

function dispatchTimedWheel(container: HTMLElement, timeStamp: number): void {
  const wheel = new Event("wheel", { bubbles: true, cancelable: true }) as any;
  Object.defineProperties(wheel, {
    clientX: { value: 0 },
    clientY: { value: 0 },
    deltaY: { value: 100 },
    timeStamp: { value: timeStamp },
  });
  container.dispatchEvent(wheel);
}

function clickCell(
  mounted: Awaited<ReturnType<typeof mountTerminal>>,
  cellX: number,
  cellY: number,
): void {
  mounted
    .container()
    ?.dispatchEvent(new MouseEvent("click", { clientX: cellX, clientY: cellY, bubbles: true }));
}

function complexEmojiTable(): { content: string; icons: readonly string[] } {
  const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
  const pirateFlag = "\u{1F3F4}\u200D\u2620\uFE0F";
  const englandFlag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
  const keycapOne = "1\uFE0F\u20E3";
  return {
    content: [
      "| Icon | Name |",
      "|---|---|",
      `| ${coder} | coder |`,
      `| ${pirateFlag} | pirate |`,
      `| ${englandFlag} | england |`,
      `| ${keycapOne} | keycap |`,
    ].join("\n"),
    icons: [coder, pirateFlag, englandFlag, keycapOne],
  };
}

function expectComplexEmojiTableBorders(
  mounted: Awaited<ReturnType<typeof mountTerminal>>,
  icons: readonly string[],
): void {
  const rightX = 17;
  expect(mounted.terminal.getCell(rightX, 0).ch).toBe("╮");
  expect(mounted.terminal.getCell(rightX, 1).ch).toBe("│");
  expect(mounted.terminal.getCell(rightX, 2).ch).toBe("┤");
  expect(mounted.terminal.getCell(rightX, 7).ch).toBe("╯");
  icons.forEach((icon, index) => {
    const y = index + 3;
    expect(mounted.terminal.getCell(rightX, y).ch).toBe("│");
    expect(mounted.terminal.getCell(2, y).ch).toBe(icon);
    expect(mounted.terminal.getCell(2, y).width).toBe(2);
    expect(mounted.terminal.getCell(3, y).continuation).toBe(true);
  });
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
    expect(mounted.terminal.getCell(12, 2).style.href).toBe("https://example.com/");
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

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://a.example/");

    content.value = "[ok](https://b.example)";
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://b.example/");
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

  it("keeps TMarkdownText table borders aligned with cjk widthProvider", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 12,
          h: 5,
          content: ["| A |", "|---|", "| Ω |"].join("\n"),
        }),
      12,
      6,
      { widthProvider: "cjk" },
    );

    expect(mounted.terminal.getCell(5, 0).ch).toBe("╮");
    expect(mounted.terminal.getCell(5, 1).ch).toBe("│");
    expect(mounted.terminal.getCell(5, 2).ch).toBe("┤");
    expect(mounted.terminal.getCell(5, 3).ch).toBe("│");
    expect(mounted.terminal.getCell(5, 4).ch).toBe("╯");
    expect(mounted.terminal.getCell(2, 3).ch).toBe("Ω");
    expect(mounted.terminal.getCell(2, 3).width).toBe(2);
    expect(mounted.terminal.getCell(3, 3).continuation).toBe(true);
    mounted.unmount();
  });

  it("keeps TMarkdownText complex emoji table borders aligned with cjk widthProvider", async () => {
    const table = complexEmojiTable();
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 40,
          h: 8,
          content: table.content,
        }),
      40,
      9,
      { widthProvider: "cjk" },
    );

    expectComplexEmojiTableBorders(mounted, table.icons);
    mounted.unmount();
  });

  it("keeps styled emoji table cell links from leaking into padding and borders", async () => {
    const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 24,
          h: 5,
          content: [
            "| Icon | Link |",
            "|---|---|",
            `| [${coder}](https://example.com) | coder |`,
          ].join("\n"),
        }),
      24,
      6,
    );

    expect(mounted.terminal.getCell(15, 3).ch).toBe("│");
    expect(mounted.terminal.getCell(15, 3).style).toMatchObject({ dim: true });
    expect(mounted.terminal.getCell(15, 3).style.href).toBeUndefined();
    expect(mounted.terminal.getCell(2, 3).style.href).toBe("https://example.com/");
    expect(mounted.terminal.getCell(14, 3).style.href).toBeUndefined();
    mounted.unmount();
  });

  it("keeps TVirtualMarkdown table borders aligned with cjk widthProvider", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 5,
          content: ["| A |", "|---|", "| Ω |"].join("\n"),
        }),
      12,
      6,
      { widthProvider: "cjk" },
    );

    expect(mounted.terminal.getCell(5, 0).ch).toBe("╮");
    expect(mounted.terminal.getCell(5, 1).ch).toBe("│");
    expect(mounted.terminal.getCell(5, 2).ch).toBe("┤");
    expect(mounted.terminal.getCell(5, 3).ch).toBe("│");
    expect(mounted.terminal.getCell(5, 4).ch).toBe("╯");
    expect(mounted.terminal.getCell(2, 3).ch).toBe("Ω");
    expect(mounted.terminal.getCell(2, 3).width).toBe(2);
    expect(mounted.terminal.getCell(3, 3).continuation).toBe(true);
    mounted.unmount();
  });

  it("keeps TVirtualMarkdown complex emoji table borders aligned with cjk widthProvider", async () => {
    const table = complexEmojiTable();
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 40,
          h: 8,
          content: table.content,
        }),
      40,
      9,
      { widthProvider: "cjk" },
    );

    expectComplexEmojiTableBorders(mounted, table.icons);
    mounted.unmount();
  });

  it("does not render unsafe markdown links with active link styling", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 32,
          h: 2,
          content: "[safe](https://example.com) [unsafe](javascript:alert(1))",
        }),
      32,
      4,
    );

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://example.com/");
    expect(mounted.terminal.getCell(0, 0).style.underline).toBe(true);
    expect(mounted.terminal.getCell(5, 0).style.href).toBeUndefined();
    expect(mounted.terminal.getCell(5, 0).style.underline).not.toBe(true);
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

  it("resets wheel timing after markdown content shrink", async () => {
    const content = ref(Array.from({ length: 20 }, (_, index) => `- row-${index}`).join("\n"));
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content: content.value,
          autoFocus: true,
        }),
      20,
      8,
    );

    dispatchTimedWheel(mounted.container()!, 100);
    await nextTick();

    content.value = Array.from({ length: 10 }, (_, index) => `- row-${index}`).join("\n");
    await nextTick();
    await nextTick();

    dispatchTimedWheel(mounted.container()!, 102);
    await nextTick();

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "- row-2",
      "- row-3",
      "- row-4",
      "- row-5",
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

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://a.example/");

    content.value = "[ok](https://b.example)";
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://b.example/");
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

  it("emits clamped scrollTop when controlled value is negative and internal is already at clamped value", async () => {
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
    await nextTick();
    await nextTick();

    // Internal scrollTop starts at 0. Passing -10 should clamp to 0 and
    // still emit update:scrollTop(0) so the parent sees the normalized value.
    updates.length = 0;
    scrollTop.value = -10;
    await nextTick();
    await nextTick();

    expect(updates).toContain(0);
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

    content.value = ["- pre-0", "- pre-1", "- pre-2", content.value].join("\n");
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

  it("emits imageAction when a TMarkdownText image is clicked", async () => {
    const actions: unknown[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 2,
          y: 1,
          w: 32,
          h: 8,
          content: `image: ![tiny](${TINY_PNG_DATA_URL})`,
          imageActions: true,
          imageMinWidth: 6,
          imageMaxWidth: 6,
          imageMinHeight: 3,
          imageMaxHeight: 3,
          imagePreserveAspectRatio: false,
          onImageAction: (payload: unknown) => actions.push(payload),
        }),
      40,
      10,
    );

    clickCell(mounted, 10, 2);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      rect: { x: 9, y: 1, w: 6, h: 3 },
      cellX: 10,
      cellY: 2,
      image: { src: TINY_PNG_DATA_URL, displayWidth: 6, displayHeight: 3 },
    });
    mounted.unmount();
  });

  it("emits linkAction instead of imageAction when fallback alt image is clicked", async () => {
    const imageActions: unknown[] = [];
    const linkActions: unknown[] = [];
    const url = "http://localhost:19999/missing.png";
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 2,
          y: 1,
          w: 48,
          h: 4,
          content: `broken: ![copy fallback url](${url})`,
          imageActions: true,
          linkActions: true,
          imageRenderer: () => null,
          onImageAction: (payload: unknown) => imageActions.push(payload),
          onLinkAction: (payload: unknown) => linkActions.push(payload),
        }),
      56,
      8,
    );

    await nextTick();
    clickCell(mounted, 12, 1);

    expect(imageActions).toHaveLength(0);
    expect(linkActions).toHaveLength(1);
    expect(linkActions[0]).toMatchObject({
      cellX: 12,
      cellY: 1,
      href: url,
      text: "copy fallback url",
    });
    mounted.unmount();
  });

  it("emits mathAction with original KaTeX text when formula is clicked", async () => {
    const actions: unknown[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 2,
          y: 1,
          w: 48,
          h: 4,
          content: "formula: $\\frac{a}{b}$ and $\\operatorname{softmax}(x)$",
          mathActions: true,
          onMathAction: (payload: unknown) => actions.push(payload),
        }),
      56,
      8,
    );

    await nextTick();
    clickCell(mounted, 12, 1);
    clickCell(mounted, 25, 1);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      cellX: 12,
      cellY: 1,
      math: { raw: "$\\frac{a}{b}$", source: "\\frac{a}{b}", rendered: true },
    });
    expect(actions[1]).toMatchObject({
      cellY: 1,
      math: {
        raw: "$\\operatorname{softmax}(x)$",
        source: "\\operatorname{softmax}(x)",
        rendered: false,
      },
    });
    mounted.unmount();
  });

  it("emits imageAction for visible TVirtualMarkdown images after scrolling", async () => {
    const actions: unknown[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 24,
          h: 3,
          content: ["before", "", `![tiny](${TINY_PNG_DATA_URL})`, "", "after", "", "tail"].join(
            "\n",
          ),
          scrollTop: 2,
          imageActions: true,
          imageMinWidth: 5,
          imageMaxWidth: 5,
          imageMinHeight: 2,
          imageMaxHeight: 2,
          imagePreserveAspectRatio: false,
          onImageAction: (payload: unknown) => actions.push(payload),
        }),
      32,
      8,
    );

    await nextTick();
    clickCell(mounted, 2, 1);
    clickCell(mounted, 20, 1);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      rect: { x: 0, y: 0, w: 5, h: 2 },
      cellX: 2,
      cellY: 1,
      rowIndex: 2,
      image: { src: TINY_PNG_DATA_URL, displayWidth: 5, displayHeight: 2 },
    });
    mounted.unmount();
  });
});
