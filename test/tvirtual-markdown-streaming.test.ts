import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

describe("TVirtualMarkdown streaming", () => {
  it("repaints the viewport when final mode changes visible markdown styling", async () => {
    const content = "**dangling";
    const final = ref(false);
    const { TVirtualMarkdown } = await import("../src/markdown.js");

    const App = defineComponent({
      name: "MarkdownStreamingApp",
      setup() {
        return () =>
          h(TVirtualMarkdown, {
            x: 0,
            y: 0,
            w: 12,
            h: 2,
            content,
            final: final.value,
            streaming: true,
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 12, 4);
    expect(mounted.terminal.getCell(0, 0).style.bold).toBe(true);
    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    final.value = true;
    await nextTick();
    await nextTick();

    off();
    const visibleLines = mounted.terminal
      .snapshot()
      .lines.slice(0, 2)
      .map((line) => line.trimEnd());
    expect(commits.length).toBeGreaterThan(0);
    expect(visibleLines[0]).toBe("**dangling");
    expect(mounted.terminal.getCell(0, 0).style.bold).not.toBe(true);
    mounted.unmount();
  });

  it("renders the latest coalesced streaming content after one scheduled rebuild", async () => {
    const content = ref("a");
    const { TVirtualMarkdown } = await import("../src/markdown.js");

    const App = defineComponent({
      name: "MarkdownStreamingContentApp",
      setup() {
        return () =>
          h(TVirtualMarkdown, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            content: content.value,
            streaming: true,
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 12, 6);

    content.value = "a\nb";
    content.value = "a\nb\nc";
    await nextTick();
    await nextTick();

    const visibleLines = mounted.terminal
      .snapshot()
      .lines.slice(0, 4)
      .map((line) => line.trimEnd());
    expect(visibleLines.slice(0, 3)).toEqual(["a", "b", "c"]);
    mounted.unmount();
  });
});
