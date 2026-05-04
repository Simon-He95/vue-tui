import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

describe("TVirtualMarkdown streaming", () => {
  it("repaints the viewport when final mode changes for visible markdown", async () => {
    const content = "before\n\n```ts\nconst a = 1";
    const final = ref(false);
    const { TVirtualMarkdown } = await import("../src/experimental.js");

    const App = defineComponent({
      name: "MarkdownStreamingApp",
      setup() {
        return () =>
          h(TVirtualMarkdown, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            content,
            final: final.value,
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 20, 6);
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
      .lines.slice(0, 4)
      .map((line) => line.trimEnd());
    expect(commits.length).toBeGreaterThan(0);
    expect(visibleLines).toContain("before");
    expect(visibleLines.some((line) => line.includes("const a = 1"))).toBe(true);
    mounted.unmount();
  });
});
