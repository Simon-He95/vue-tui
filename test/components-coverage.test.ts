import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, watchEffect } from "vue";
import type { Terminal } from "../src/index.js";
import type { EventManager } from "../src/runtime.js";
import {
  TAnchor,
  TDebugOverlay,
  TFlex,
  TFlexItem,
  TFlow,
  TInput,
  TerminalProvider,
  TText,
  TView,
  useLayout,
  useTerminal,
} from "../src/vue.js";

// Make rAF deterministic in tests (TerminalProvider scheduler uses it).
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

async function waitFor<T>(fn: () => T | null | undefined, tries = 50): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await nextTick();
  }
  throw new Error("waitFor timeout");
}

type Mounted = {
  terminal: Terminal;
  events: () => EventManager | null;
  container: () => HTMLElement | null;
  unmount: () => void;
};

async function mountTerminal(
  children: () => any,
  cols = 40,
  rows = 10,
  providerProps: Record<string, unknown> = {},
): Promise<Mounted> {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const exposed = {
    terminal: null as Terminal | null,
    events: null as EventManager | null,
    container: null as HTMLElement | null,
  };

  const Expose = defineComponent({
    name: "ExposeTerminal",
    setup() {
      const ctx = useTerminal();
      exposed.terminal = ctx.terminal;
      watchEffect(() => {
        exposed.events = ctx.events.value;
        exposed.container = ctx.renderer.value?.container ?? null;
      });
      return () => null;
    },
  });

  const App = defineComponent({
    name: "TestApp",
    setup() {
      return () =>
        h(
          TerminalProvider,
          { cols, rows, ...providerProps },
          {
            default: () => [h(Expose), children()],
          },
        );
    },
  });

  const app = createApp(App);
  app.mount(root);
  await nextTick();

  const terminal = await waitFor(() => exposed.terminal);
  await waitFor(() => exposed.container);

  return {
    terminal,
    events: () => exposed.events,
    container: () => exposed.container,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

function setDeterministicMetrics(
  container: HTMLElement,
  events: EventManager,
  cols: number,
  rows: number,
): void {
  const cellWidth = 10;
  const cellHeight = 20;
  events.setMetrics({ cellWidth, cellHeight });
  container.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      x: 0,
      y: 0,
      width: cols * cellWidth,
      height: rows * cellHeight,
      right: cols * cellWidth,
      bottom: rows * cellHeight,
      toJSON() {},
    }) as any;
}

function clickCell(container: HTMLElement, cellX: number, cellY: number): void {
  container.dispatchEvent(
    new MouseEvent("click", {
      clientX: cellX * 10 + 1,
      clientY: cellY * 20 + 1,
      bubbles: true,
    }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("component coverage (docs + acceptance gates)", () => {
  it("TAnchor positions via right/bottom and receives click events", async () => {
    const onClick = vi.fn();
    const cols = 20;
    const rows = 6;
    const mounted = await mountTerminal(
      () =>
        h(TAnchor, { right: 0, bottom: 0, w: 5, h: 2, onClick }, () =>
          h(TText, { x: 0, y: 0, w: 5, value: "ABCDE" }),
        ),
      cols,
      rows,
    );

    expect(mounted.terminal.snapshot().lines[rows - 2]?.slice(cols - 5, cols)).toBe("ABCDE");

    const container = mounted.container()!;
    const events = mounted.events()!;
    setDeterministicMetrics(container, events, cols, rows);

    clickCell(container, cols - 5, rows - 2);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]?.cellX).toBe(cols - 5);
    expect(onClick.mock.calls[0]?.[0]?.cellY).toBe(rows - 2);

    mounted.unmount();
  });

  it("TAnchor computes width from left/right when w is omitted", async () => {
    const cols = 16;
    const rows = 4;
    const mounted = await mountTerminal(
      () =>
        h(TAnchor, { left: 2, right: 3, top: 1, h: 1 }, () =>
          h(TText, { x: 0, y: 0, value: "X".repeat(50) }),
        ),
      cols,
      rows,
    );

    const expectedW = cols - 2 - 3;
    const line = mounted.terminal.snapshot().lines[1]!;
    expect(line.slice(2, 2 + expectedW)).toBe("X".repeat(expectedW));
    mounted.unmount();
  });

  it("TFlow lays out items vertically and horizontally", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlow,
          {
            x: 0,
            y: 0,
            w: 12,
            h: 9,
            items: [0, 1, 2],
            itemSize: 2,
            gap: 1,
            direction: "vertical",
          },
          {
            item: ({ index }: any) => h(TText, { x: 0, y: 0, w: 12, value: `v${index}` }),
          },
        ),
      20,
      10,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.startsWith("v0")).toBe(true);
    expect(lines[3]?.startsWith("v1")).toBe(true);
    expect(lines[6]?.startsWith("v2")).toBe(true);
    mounted.unmount();

    const mounted2 = await mountTerminal(
      () =>
        h(
          TFlow,
          {
            x: 0,
            y: 0,
            w: 18,
            h: 2,
            items: [0, 1, 2],
            itemSize: 5,
            gap: 1,
            direction: "horizontal",
          },
          {
            item: ({ index }: any) => h(TText, { x: 0, y: 0, w: 5, value: `h${index}` }),
          },
        ),
      20,
      4,
    );

    const l0 = mounted2.terminal.snapshot().lines[0]!;
    expect(l0.slice(0, 2)).toBe("h0");
    expect(l0.slice(6, 8)).toBe("h1");
    expect(l0.slice(12, 14)).toBe("h2");
    mounted2.unmount();
  });

  it("TFlex distributes row space with grow, min size, gap, and padding", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 12,
            h: 3,
            direction: "row",
            gap: 1,
            padding: 1,
          },
          () => [
            h(
              TFlexItem,
              { grow: 1, minWidth: 3 },
              {
                default: ({ rect }: any) =>
                  h(TText, { x: 0, y: 0, w: rect.w, value: `L${rect.w}` }),
              },
            ),
            h(
              TFlexItem,
              { grow: 2 },
              {
                default: ({ rect }: any) =>
                  h(TText, { x: 0, y: 0, w: rect.w, value: `R${rect.w}` }),
              },
            ),
          ],
        ),
      20,
      5,
    );

    const line = mounted.terminal.snapshot().lines[1]!;
    expect(line.slice(1, 3)).toBe("L5");
    expect(line.slice(7, 9)).toBe("R4");
    mounted.unmount();
  });

  it("TFlex lays out fixed and growing column items", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 6,
            direction: "column",
          },
          () => [
            h(TFlexItem, { height: 1 }, () => h(TText, { x: 0, y: 0, value: "H" })),
            h(TFlexItem, { grow: 1 }, () => h(TText, { x: 0, y: 0, value: "M" })),
            h(TFlexItem, { height: 1 }, () => h(TText, { x: 0, y: 0, value: "F" })),
          ],
        ),
      12,
      8,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.startsWith("H")).toBe(true);
    expect(lines[1]?.startsWith("M")).toBe(true);
    expect(lines[5]?.startsWith("F")).toBe(true);
    mounted.unmount();
  });

  it("TFlexItem order controls visual order", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 6,
            h: 1,
            direction: "row",
          },
          () => [
            h(TFlexItem, { width: 1, order: 2 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: 1, order: -1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: 1 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      8,
      3,
    );

    expect(mounted.terminal.snapshot().lines[0]?.slice(0, 3)).toBe("BCA");
    mounted.unmount();
  });

  it("TFlexItem fallback keys preserve state when order changes", async () => {
    const flipped = ref(false);
    const StatefulText = defineComponent({
      name: "StatefulFlexItemText",
      props: {
        value: { type: String, required: true },
      },
      setup(props) {
        const initial = props.value;
        return () => h(TText, { x: 0, y: 0, value: initial });
      },
    });

    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 4,
            h: 1,
            direction: "row",
          },
          () => [
            h(TFlexItem, { width: 1, height: 1, order: flipped.value ? 2 : 1 }, () =>
              h(StatefulText, { value: "A" }),
            ),
            h(TFlexItem, { width: 1, height: 1, order: flipped.value ? 1 : 2 }, () =>
              h(StatefulText, { value: "B" }),
            ),
          ],
        ),
      6,
      3,
    );

    expect(mounted.terminal.snapshot().lines[0]?.slice(0, 2)).toBe("AB");
    flipped.value = true;
    await nextTick();
    await nextTick();

    expect(mounted.terminal.snapshot().lines[0]?.slice(0, 2)).toBe("BA");
    mounted.unmount();
  });

  it("TFlex applies justifyContent and alignItems", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 5,
            direction: "row",
            justifyContent: "center",
            alignItems: "center",
          },
          () => [
            h(TFlexItem, { width: 2, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: 2, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      12,
      6,
    );

    const line = mounted.terminal.snapshot().lines[2]!;
    expect(line[3]).toBe("A");
    expect(line[5]).toBe("B");
    mounted.unmount();
  });

  it("TFlex supports justifyContent end and space-between", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TFlex, { x: 0, y: 0, w: 5, h: 1, direction: "row", justifyContent: "end" }, () => [
          h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
        ]),
        h(
          TFlex,
          { x: 0, y: 1, w: 5, h: 1, direction: "row", justifyContent: "space-between" },
          () => [
            h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      ],
      7,
      4,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[4]).toBe("A");
    expect(lines[1]?.[0]).toBe("B");
    expect(lines[1]?.[4]).toBe("C");
    mounted.unmount();
  });

  it("TFlex applies basis and shrink when content overflows", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 9,
            h: 3,
            direction: "row",
            alignItems: "start",
          },
          () => [
            h(
              TFlexItem,
              { basis: 6, shrink: 1, height: 2 },
              {
                default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: rect.h - 1, value: "A" }),
              },
            ),
            h(
              TFlexItem,
              { basis: 6, shrink: 3, height: 1 },
              {
                default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: 0, value: "B" }),
              },
            ),
          ],
        ),
      11,
      4,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[1]?.[4]).toBe("A");
    expect(lines[0]?.[8]).toBe("B");
    mounted.unmount();
  });

  it("TFlex applies w/h aliases and cross-axis min/max constraints", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 8,
            h: 5,
            direction: "row",
            alignItems: "stretch",
          },
          () => [
            h(
              TFlexItem,
              { w: 3, minHeight: 2, maxHeight: 2 },
              {
                default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: rect.h - 1, value: "A" }),
              },
            ),
            h(
              TFlexItem,
              { width: 2, h: 3 },
              {
                default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: rect.h - 1, value: "B" }),
              },
            ),
          ],
        ),
      10,
      6,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[1]?.[2]).toBe("A");
    expect(lines[2]?.[4]).toBe("B");
    mounted.unmount();
  });

  it("TFlex resolves percentage width and height against the content box", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 12,
            h: 6,
            direction: "row",
            gap: 1,
            padding: 1,
            alignItems: "start",
          },
          () => [
            h(
              TFlexItem,
              { width: "50%", height: "50%" },
              {
                default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: rect.h - 1, value: "A" }),
              },
            ),
            h(TFlexItem, { width: "25%", height: "100%" }, () =>
              h(TText, { x: 0, y: 0, value: "B" }),
            ),
          ],
        ),
      14,
      8,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[2]?.[4]).toBe("A");
    expect(lines[1]?.[6]).toBe("B");
    mounted.unmount();
  });

  it("TFlex responds when terminal resize updates layout-provided dimensions", async () => {
    const ResponsiveFlex = defineComponent({
      name: "ResponsiveFlexTest",
      setup() {
        const layout = useLayout();
        return () =>
          h(
            TFlex,
            {
              x: 1,
              y: 1,
              w: Math.max(0, (layout.clipRect?.w ?? 0) - 2),
              h: 1,
              direction: "row",
              gap: 1,
              alignItems: "start",
            },
            () => [
              h(TFlexItem, { width: 3, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
              h(
                TFlexItem,
                { grow: 1, height: 1 },
                {
                  default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: 0, value: "B" }),
                },
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(ResponsiveFlex), 12, 4);
    expect(mounted.terminal.snapshot().lines[1]?.[1]).toBe("A");
    expect(mounted.terminal.snapshot().lines[1]?.[10]).toBe("B");

    mounted.terminal.resize(16, 4);
    await nextTick();
    await nextTick();

    expect(mounted.terminal.snapshot().lines[1]?.[14]).toBe("B");
    mounted.unmount();
  });

  it("TFlex applies percentage min and max constraints", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            direction: "row",
          },
          () => [
            h(
              TFlexItem,
              { grow: 1, minWidth: "50%", maxWidth: "50%" },
              {
                default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: 0, value: "A" }),
              },
            ),
            h(TFlexItem, { grow: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      22,
      5,
    );

    const line = mounted.terminal.snapshot().lines[0]!;
    expect(line[9]).toBe("A");
    expect(line[10]).toBe("B");
    mounted.unmount();
  });

  it("TFlex wraps row items into multiple lines", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 5,
            direction: "row",
            gap: 1,
            wrap: true,
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      12,
      6,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[0]).toBe("A");
    expect(lines[0]?.[5]).toBe("B");
    expect(lines[2]?.[0]).toBe("C");
    mounted.unmount();
  });

  it("TFlex wraps percentage row items after reserving main-axis gaps", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 3,
            direction: "row",
            columnGap: 1,
            rowGap: 0,
            wrap: true,
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: "50%", height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: "50%", height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: "50%", height: 1 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      12,
      4,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[0]).toBe("A");
    expect(lines[0]?.[5]).toBe("B");
    expect(lines[1]?.[0]).toBe("C");
    mounted.unmount();
  });

  it("TFlex wraps column items into multiple columns", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 7,
            h: 5,
            direction: "column",
            gap: 1,
            wrap: true,
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 1, height: 2 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: 1, height: 2 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: 1, height: 2 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      10,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[0]).toBe("A");
    expect(lines[3]?.[0]).toBe("B");
    expect(lines[0]?.[2]).toBe("C");
    mounted.unmount();
  });

  it("TFlex maps rowGap and columnGap onto wrapped column axes", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 6,
            h: 6,
            direction: "column",
            rowGap: 1,
            columnGap: 2,
            wrap: true,
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 1, height: 2 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: 1, height: 2 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: 1, height: 2 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      8,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[0]).toBe("A");
    expect(lines[3]?.[0]).toBe("B");
    expect(lines[0]?.[3]).toBe("C");
    mounted.unmount();
  });

  it("TFlex maps rowGap and columnGap onto wrapped row axes", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 6,
            direction: "row",
            columnGap: 1,
            rowGap: 2,
            wrap: true,
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      12,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[0]).toBe("A");
    expect(lines[0]?.[5]).toBe("B");
    expect(lines[3]?.[0]).toBe("C");
    mounted.unmount();
  });

  it("TFlex distributes wrapped rows with alignContent", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 7,
            direction: "row",
            gap: 1,
            wrap: true,
            alignItems: "start",
            alignContent: "space-between",
          },
          () => [
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "C" })),
          ],
        ),
      12,
      8,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[0]).toBe("A");
    expect(lines[0]?.[5]).toBe("B");
    expect(lines[6]?.[0]).toBe("C");
    mounted.unmount();
  });

  it("TFlex stretches wrapped rows with alignContent", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 7,
            h: 6,
            direction: "row",
            columnGap: 1,
            rowGap: 0,
            wrap: true,
            alignItems: "stretch",
            alignContent: "stretch",
          },
          () => [
            h(
              TFlexItem,
              { width: 3 },
              {
                default: ({ rect }: any) => h(TText, { x: 0, y: rect.h - 1, value: "A" }),
              },
            ),
            h(TFlexItem, { width: 3 }, () => h(TText, { x: 0, y: 0, value: "B" })),
            h(
              TFlexItem,
              { width: 3 },
              {
                default: ({ rect }: any) => h(TText, { x: 0, y: rect.h - 1, value: "C" }),
              },
            ),
          ],
        ),
      9,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[2]?.[0]).toBe("A");
    expect(lines[0]?.[4]).toBe("B");
    expect(lines[5]?.[0]).toBe("C");
    mounted.unmount();
  });

  it("TFlex does not overlap wrapped rows when cross-axis space overflows", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 3,
            h: 2,
            direction: "row",
            columnGap: 0,
            rowGap: 0,
            wrap: true,
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 3, height: 2 }, () => h(TText, { x: 0, y: 1, value: "A" })),
            h(TFlexItem, { width: 3, height: 2 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      5,
      4,
    );

    expect(mounted.terminal.snapshot().lines[1]?.[0]).toBe("A");
    mounted.unmount();
  });

  it("TFlex applies axis and side padding overrides", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 12,
            h: 5,
            direction: "row",
            paddingX: 2,
            paddingTop: 1,
            paddingRight: 3,
            alignItems: "start",
          },
          () => [h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" }))],
        ),
      14,
      6,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[1]?.[2]).toBe("A");
    mounted.unmount();
  });

  it("TFlex applies remaining side padding overrides", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 8,
            h: 6,
            direction: "row",
            paddingY: 1,
            paddingLeft: 2,
            paddingBottom: 2,
            alignItems: "stretch",
          },
          () => [
            h(
              TFlexItem,
              { width: 1 },
              {
                default: ({ rect }: any) => h(TText, { x: 0, y: rect.h - 1, value: "A" }),
              },
            ),
          ],
        ),
      10,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[3]?.[2]).toBe("A");
    mounted.unmount();
  });

  it("TFlex applies margin shorthand and axis overrides", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 9,
            h: 4,
            direction: "row",
            alignItems: "start",
          },
          () => [
            h(
              TFlexItem,
              { width: 1, height: 1, margin: 1, marginX: 2, marginY: 2, marginBottom: 1 },
              () => h(TText, { x: 0, y: 0, value: "A" }),
            ),
            h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      11,
      5,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[2]?.[2]).toBe("A");
    expect(lines[0]?.[5]).toBe("B");
    mounted.unmount();
  });

  it("TFlexItem margins offset item rects", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 4,
            direction: "row",
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 2, height: 1, marginLeft: 1, marginRight: 2, marginTop: 1 }, () =>
              h(TText, { x: 0, y: 0, value: "A" }),
            ),
            h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      12,
      5,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[1]?.[1]).toBe("A");
    expect(lines[0]?.[5]).toBe("B");
    mounted.unmount();
  });

  it("TFlex includes margins when wrapping items", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 8,
            h: 4,
            direction: "row",
            wrap: true,
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 4, height: 1, marginRight: 1 }, () =>
              h(TText, { x: 0, y: 0, value: "A" }),
            ),
            h(TFlexItem, { width: 4, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      11,
      5,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.[0]).toBe("A");
    expect(lines[1]?.[0]).toBe("B");
    mounted.unmount();
  });

  it("TFlexItem alignSelf overrides cross-axis alignment", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            direction: "row",
            alignItems: "start",
          },
          () => [
            h(TFlexItem, { width: 1, height: 1, alignSelf: "end" }, () =>
              h(TText, { x: 0, y: 0, value: "A" }),
            ),
            h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      8,
      5,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[3]?.[0]).toBe("A");
    expect(lines[0]?.[1]).toBe("B");
    mounted.unmount();
  });

  it("TFlex uses measured item size when no explicit size is provided", async () => {
    const constraints: any[] = [];
    const measure = (next: any) => {
      constraints.push(next);
      return { width: 6, height: 2 };
    };
    const mounted = await mountTerminal(
      () =>
        h(
          TFlex,
          {
            x: 0,
            y: 0,
            w: 20,
            h: 5,
            direction: "row",
            alignItems: "start",
          },
          () => [
            h(
              TFlexItem,
              { measure },
              {
                default: ({ rect }: any) => h(TText, { x: rect.w - 1, y: rect.h - 1, value: "A" }),
              },
            ),
            h(TFlexItem, { grow: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
          ],
        ),
      22,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[1]?.[5]).toBe("A");
    expect(lines[0]?.[6]).toBe("B");
    expect(constraints[0]).toEqual({ maxWidth: 20, maxHeight: 5, direction: "row" });
    expect(constraints).toHaveLength(1);
    mounted.unmount();
  });

  it("TFlex root zIndex participates in stack order", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TFlex, { x: 0, y: 0, w: 2, h: 1, direction: "row", zIndex: 1 }, () => [
          h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "A" })),
        ]),
        h(TFlex, { x: 0, y: 0, w: 2, h: 1, direction: "row", zIndex: 2 }, () => [
          h(TFlexItem, { width: 1, height: 1 }, () => h(TText, { x: 0, y: 0, value: "B" })),
        ]),
      ],
      4,
      3,
    );

    expect(mounted.terminal.snapshot().lines[0]?.[0]).toBe("B");
    mounted.unmount();
  });

  it("TFlexItem zIndex participates in stack order", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TText, { x: 0, y: 0, w: 1, value: "B", zIndex: 5 }),
        h(TFlex, { x: 0, y: 0, w: 2, h: 1, direction: "row" }, () => [
          h(TFlexItem, { width: 1, height: 1, zIndex: 10 }, () =>
            h(TText, { x: 0, y: 0, value: "A" }),
          ),
        ]),
      ],
      4,
      3,
    );

    expect(mounted.terminal.snapshot().lines[0]?.[0]).toBe("A");
    mounted.unmount();
  });

  it("TText wrap with huge content does not write outside its rect", async () => {
    const cols = 30;
    const rows = 8;
    const mounted = await mountTerminal(
      () =>
        h(TView, { x: 0, y: 0, w: cols, h: rows }, () => [
          h(TText, { x: 0, y: 0, w: cols, h: 2, value: "KEEP", clear: true }),
          h(TText, {
            x: 0,
            y: 2,
            w: 10,
            h: 3,
            wrap: true,
            value: "你".repeat(2000),
          }),
          h(TText, { x: 0, y: 6, w: cols, h: 2, value: "TAIL", clear: true }),
        ]),
      cols,
      rows,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.startsWith("KEEP")).toBe(true);
    expect(lines[6]?.startsWith("TAIL")).toBe(true);
    // Rows outside [2..4] should remain untouched by the huge wrapped text.
    expect(lines[5]).toBe(" ".repeat(cols));
    mounted.unmount();
  });

  it("TDebugOverlay renders panel text and focus rect border (smoke)", async () => {
    const cols = 40;
    const rows = 10;
    const value = ref("");
    const focusTick = ref(0);

    const Demo = defineComponent({
      name: "DebugOverlayDemo",
      setup() {
        return () => [
          h(TInput, {
            x: 5,
            y: 6,
            w: 10,
            h: 3,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            onFocus: () => (focusTick.value += 1),
          }),
          // Remount overlay on focus so it reads fresh focus/rects in render().
          h(TDebugOverlay as any, { key: focusTick.value, panel: true }),
        ];
      },
    });

    const mounted = await mountTerminal(() => h(Demo), cols, rows);

    const mgr = await waitFor(() => mounted.events());
    const focusedId = await waitFor(() => mgr.getFocused());
    const rect = mgr.debugNodes().find((n) => n.id === focusedId)?.rect ?? null;
    expect(rect).not.toBe(null);

    let lastLines: readonly string[] = [];
    let matched: readonly string[] | null = null;
    for (let i = 0; i < 80; i++) {
      const lines = mounted.terminal.snapshot().lines;
      lastLines = lines;
      const hasPanel = lines[0]?.includes("debug") && lines.some((l) => l.includes("trace:"));
      const { x, y, w, h } = rect!;
      const hasFocusBorder =
        lines[y]?.[x] === "┌" &&
        lines[y]?.[x + w - 1] === "┐" &&
        lines[y + h - 1]?.[x] === "└" &&
        lines[y + h - 1]?.[x + w - 1] === "┘";
      if (hasPanel && hasFocusBorder) {
        matched = lines;
        break;
      }
      await nextTick();
    }
    if (!matched) {
      throw new Error(
        `waitFor timeout\nfocusedRect=${JSON.stringify(rect)}\n${lastLines.join("\n")}`,
      );
    }
    const lines = matched;

    expect(lines[0]?.includes("debug")).toBe(true);
    expect(lines.some((l) => l.includes("trace:"))).toBe(true);

    mounted.unmount();
  });
});
