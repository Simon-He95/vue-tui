import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, watchEffect } from "vue";
import type { Terminal } from "../src/index.js";
import type { EventManager } from "../src/runtime.js";
import {
  TAnchor,
  TDebugOverlay,
  TFlow,
  TInput,
  TerminalProvider,
  TText,
  TView,
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
