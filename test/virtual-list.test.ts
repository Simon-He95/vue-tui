import { describe, expect, it, vi } from "vitest";
import { createTerminal } from "../src/index.js";
import { createRenderManager } from "../src/vue/render/render-manager.js";
import { h, mountTerminal, nextTick, TVirtualList } from "./ui-regressions-support.js";

function dispatchWheel(container: HTMLElement): void {
  const wheel = new Event("wheel", { bubbles: true }) as any;
  wheel.clientX = 0;
  wheel.clientY = 0;
  wheel.deltaY = 100;
  container.dispatchEvent(wheel);
}

function rowText(mounted: Awaited<ReturnType<typeof mountTerminal>>, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

describe("TVirtualList", () => {
  it("repaints the full viewport in DOM so slow wheel scroll updates visible rows", async () => {
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

    dispatchWheel(mounted.container()!);
    await nextTick();
    await nextTick();

    off();
    expect(commits.some((rows) => rows != null && rows.join(",") === "0,1,2,3")).toBe(true);
    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    expect(mounted.container()!.textContent).toContain("item-1");
    expect(mounted.container()!.textContent).toContain("item-4");
    expect(mounted.container()!.textContent).not.toContain("item-0");
    mounted.unmount();
  });

  it("coalesces consecutive DOM wheel ticks without stale or blank rows", async () => {
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

    const container = mounted.container()!;
    const dateNow = vi.spyOn(Date, "now");
    try {
      let now = 1_000;
      dateNow.mockImplementation(() => now);
      dispatchWheel(container);
      await nextTick();
      now += 10;
      dispatchWheel(container);
      await nextTick();
      await nextTick();
    } finally {
      dateNow.mockRestore();
    }

    expect([0, 1, 2, 3].map((y) => rowText(mounted, y))).toEqual([
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
    expect(container.textContent).toContain("item-2");
    expect(container.textContent).toContain("item-5");
    expect(container.textContent).not.toContain("item-0");
    mounted.unmount();
  });

  it("keeps scrollPlane fast path to exposed rows when no DOM renderer is attached", () => {
    const terminal = createTerminal({ cols: 12, rows: 6 });
    const render = createRenderManager(terminal);
    const items = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    let top = 0;
    let dirtyRowsHint: readonly number[] | undefined;

    const node = render.register({
      stack: render.rootStack,
      rect: { x: 0, y: 0, w: 12, h: 4 },
      paint: (dirtyRows) => {
        const rows = dirtyRows ?? dirtyRowsHint ?? [0, 1, 2, 3];
        for (const y of rows) terminal.write(items[top + y] ?? "", { x: 0, y });
      },
    });
    render.render();
    terminal.commit();

    top = 1;
    render.scrollPlane("default", 0, 4, 1);
    dirtyRowsHint = [3];
    render.update(node.id, { dirtyRowsHint });
    render.render();
    const committedRows = terminal.commit({ sync: true });

    expect(committedRows).toEqual([3]);
    expect(terminal.getCell(5, 3).ch).toBe("4");
  });
});
