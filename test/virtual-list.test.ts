import { describe, expect, it } from "vitest";
import { h, mountTerminal, nextTick, TVirtualList } from "./ui-regressions-support.js";

describe("TVirtualList", () => {
  it("uses only the exposed row as dirty rows during slow wheel scroll", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          itemCount: items.length,
          itemVersion: 1,
          getItem: (index: number) => items[index],
          autoFocus: true,
        }),
      20,
      8,
    );

    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    const container = mounted.container()!;
    const wheel = new Event("wheel", { bubbles: true }) as any;
    wheel.clientX = 0;
    wheel.clientY = 0;
    wheel.deltaY = 100;
    container.dispatchEvent(wheel);
    await nextTick();
    await nextTick();

    off();
    expect(commits.some((rows) => rows != null && rows.length === 1 && rows[0] === 3)).toBe(true);
    expect(mounted.terminal.getCell(5, 3).ch).toBe("4");
    mounted.unmount();
  });
});
