import { describe, expect, it, vi } from "vitest";

vi.mock("../src/vue/markdown/document.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/vue/markdown/document.js")>();
  return {
    ...actual,
    buildMarkdownVisualRows: vi.fn(actual.buildMarkdownVisualRows),
  };
});

import * as markdownDocument from "../src/vue/markdown/document.js";
import { h, mountTerminal, nextTick } from "./ui-regressions-support.js";

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
    const { TVirtualMarkdown } = await import("../src/experimental.js");
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
});
