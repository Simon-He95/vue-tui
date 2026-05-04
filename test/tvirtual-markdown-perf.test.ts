import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "./ui-regressions-support.js";

vi.mock("../src/vue/markdown/document.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/vue/markdown/document.js")>();
  return {
    ...actual,
    buildMarkdownVisualRows: vi.fn(actual.buildMarkdownVisualRows),
  };
});

import * as markdownDocument from "../src/vue/markdown/document.js";
import { TMarkdownText } from "../src/markdown.js";
import { h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

function dispatchWheel(container: HTMLElement): void {
  const wheel = new Event("wheel", { bubbles: true }) as any;
  wheel.clientX = 0;
  wheel.clientY = 0;
  wheel.deltaY = 100;
  container.dispatchEvent(wheel);
}

describe("TVirtualMarkdown performance", () => {
  it("does not rebuild markdown visual rows while scrolling a long document", async () => {
    const content = Array.from({ length: 5000 }, (_, index) => `- row-${index}`).join("\n");
    const { TVirtualMarkdown } = await import("../src/markdown.js");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 16,
          h: 6,
          content,
          autoFocus: true,
        }),
      24,
      10,
    );

    const buildSpy = vi.mocked(markdownDocument.buildMarkdownVisualRows);
    await nextTick();
    await nextTick();
    const beforeScrollCalls = buildSpy.mock.calls.length;
    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    dispatchWheel(mounted.container()!);
    dispatchWheel(mounted.container()!);
    dispatchWheel(mounted.container()!);
    await nextTick();
    await nextTick();

    off();
    expect(buildSpy.mock.calls.length).toBe(beforeScrollCalls);
    expect(
      commits.filter((rows) => rows != null).every((rows) => rows!.join(",") === "0,1,2,3,4,5"),
    ).toBe(true);
    mounted.unmount();
  });

  it("coalesces multiple streaming updates for TVirtualMarkdown into one rebuild per frame", async () => {
    const content = ref("- row-0");
    const { TVirtualMarkdown } = await import("../src/markdown.js");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          content: content.value,
          streaming: true,
        }),
      24,
      8,
    );

    const buildSpy = vi.mocked(markdownDocument.buildMarkdownVisualRows);
    await nextTick();
    await nextTick();
    const before = buildSpy.mock.calls.length;

    content.value = "- row-0\n- row-1";
    content.value = "- row-0\n- row-1\n- row-2";
    content.value = "- row-0\n- row-1\n- row-2\n- row-3";
    await nextTick();
    await nextTick();

    expect(buildSpy.mock.calls.length).toBe(before + 1);
    mounted.unmount();
  });

  it("emits a single viewport commit for a coalesced TVirtualMarkdown streaming rebuild", async () => {
    const content = ref("- row-0");
    const { TVirtualMarkdown } = await import("../src/markdown.js");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          content: content.value,
          streaming: true,
        }),
      24,
      8,
    );

    await nextTick();
    await nextTick();

    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    content.value = "- row-0\n- row-1";
    content.value = "- row-0\n- row-1\n- row-2";
    content.value = "- row-0\n- row-1\n- row-2\n- row-3";
    await nextTick();
    await nextTick();

    off();
    expect(commits).toHaveLength(1);
    expect(commits[0]?.join(",")).toBe("0,1,2,3");
    mounted.unmount();
  });

  it("coalesces multiple streaming updates for TMarkdownText into one rebuild per frame", async () => {
    const content = ref("- row-0");
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          content: content.value,
          streaming: true,
        }),
      24,
      8,
    );

    const buildSpy = vi.mocked(markdownDocument.buildMarkdownVisualRows);
    await nextTick();
    await nextTick();
    const before = buildSpy.mock.calls.length;

    content.value = "- row-0\n- row-1";
    content.value = "- row-0\n- row-1\n- row-2";
    content.value = "- row-0\n- row-1\n- row-2\n- row-3";
    await nextTick();
    await nextTick();

    expect(buildSpy.mock.calls.length).toBe(before + 1);
    mounted.unmount();
  });

  it("emits a single viewport commit for a coalesced TMarkdownText streaming rebuild", async () => {
    const content = ref("- row-0");
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          content: content.value,
          streaming: true,
        }),
      24,
      8,
    );

    await nextTick();
    await nextTick();

    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    content.value = "- row-0\n- row-1";
    content.value = "- row-0\n- row-1\n- row-2";
    content.value = "- row-0\n- row-1\n- row-2\n- row-3";
    await nextTick();
    await nextTick();

    off();
    expect(commits).toHaveLength(1);
    expect(commits[0]?.join(",")).toBe("0,1,2,3");
    mounted.unmount();
  });

  it("does not repaint the viewport when streaming appends stay fully offscreen", async () => {
    const content = ref(Array.from({ length: 50 }, (_, index) => `- row-${index}`).join("\n"));
    const { TVirtualMarkdown } = await import("../src/markdown.js");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          content: content.value,
          streaming: true,
          scrollTop: 0,
        }),
      24,
      8,
    );

    const buildSpy = vi.mocked(markdownDocument.buildMarkdownVisualRows);
    await nextTick();
    await nextTick();
    const beforeBuilds = buildSpy.mock.calls.length;
    const beforeLines = mounted.terminal
      .snapshot()
      .lines.slice(0, 4)
      .map((line) => line.trimEnd());
    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    content.value = `${content.value}\n- row-50\n- row-51\n- row-52`;
    await nextTick();
    await nextTick();

    off();
    expect(buildSpy.mock.calls.length).toBe(beforeBuilds + 1);
    expect(commits).toHaveLength(0);
    expect(
      mounted.terminal.snapshot().lines.slice(0, 4).map((line) => line.trimEnd()),
    ).toEqual(beforeLines);
    mounted.unmount();
  });

  it("keeps absolute scrollTop semantics instead of following tail on streaming append", async () => {
    const content = ref(Array.from({ length: 8 }, (_, index) => `- row-${index}`).join("\n"));
    const { TVirtualMarkdown } = await import("../src/markdown.js");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          content: content.value,
          streaming: true,
          scrollTop: 4,
        }),
      24,
      8,
    );

    content.value = `${content.value}\n- row-8\n- row-9`;
    await nextTick();
    await nextTick();

    expect(
      mounted.terminal.snapshot().lines.slice(0, 4).map((line) => line.trimEnd()),
    ).toEqual(["- row-4", "- row-5", "- row-6", "- row-7"]);
    mounted.unmount();
  });

  it("does not rebuild markdown rows when theme identity changes without semantic changes", async () => {
    const tick = ref(0);
    const App = defineComponent({
      name: "MarkdownThemeIdentityApp",
      setup() {
        return () =>
          h(TMarkdownText, {
            x: 0,
            y: 0,
            w: 16,
            h: 4,
            content: "- row-0",
            theme: { strong: { fg: "yellowBright" } },
            clear: tick.value >= 0,
          });
      },
    });
    const mounted = await mountTerminal(() => h(App), 24, 8);

    const buildSpy = vi.mocked(markdownDocument.buildMarkdownVisualRows);
    await nextTick();
    await nextTick();
    const before = buildSpy.mock.calls.length;

    tick.value++;
    await nextTick();
    await nextTick();

    expect(buildSpy.mock.calls.length).toBe(before);
    mounted.unmount();
  });
});
