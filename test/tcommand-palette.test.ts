import { describe, expect, it, vi } from "vitest";
import { TCommandPalette, filterCommandPaletteItems } from "../src/agent.js";
import { createTerminalApp } from "../src/cli.js";
import { defineComponent, h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

function lines(mounted: Awaited<ReturnType<typeof mountTerminal>>): string[] {
  const out: string[] = [];
  const { rows } = mounted.terminal.size();
  for (let y = 0; y < rows; y++) {
    out.push(
      mounted.terminal
        .getRow(y)
        .map((cell) => cell.ch)
        .join("")
        .trimEnd(),
    );
  }
  return out;
}

function appLine(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("");
}

describe("TCommandPalette", () => {
  it("filters items with label detail and keywords", () => {
    const filtered = filterCommandPaletteItems(
      [
        { label: "Open Session", detail: "Resume work" },
        { label: "Switch Provider", keywords: ["model"] },
        { kind: "separator", label: "Providers" },
      ],
      "model",
    );

    expect(filtered.map((x) => x.item.label)).toEqual(["Switch Provider"]);
    expect(filtered[0]?.labelHighlightRanges).toEqual([]);
  });

  it("renders a searchable command surface", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TCommandPalette, {
          modelValue: true,
          title: "Commands",
          placeholder: "Find",
          hint: "Enter select",
          items: [
            { label: "Open Session", detail: "Resume work" },
            { label: "Switch Provider", detail: "Change model" },
          ],
          selectedIndex: 1,
          showRowDetails: true,
          chromeStyle: { bg: "black", fg: "whiteBright" },
          inputStyle: { bg: "black", fg: "whiteBright" },
          highlightStyle: { bg: "blue", fg: "whiteBright" },
        }),
      64,
      20,
    );

    try {
      await nextTick();
      const text = lines(mounted).join("\n");
      expect(text).toContain("Commands");
      expect(text).toContain("Open Session");
      expect(text).toContain("Switch Provider");
      expect(text).toContain("Enter select");
    } finally {
      mounted.unmount();
    }
  });

  it("closes on Escape", async () => {
    const open = ref(true);
    const close = vi.fn();
    const App = defineComponent({
      name: "CommandPaletteEscapeApp",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: open.value,
            items: [{ label: "Open Session" }],
            "onUpdate:modelValue": (value: boolean) => {
              open.value = value;
            },
            onClose: close,
          });
      },
    });
    const app = createTerminalApp({ cols: 64, rows: 20, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "Escape", code: "Escape" } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(open.value).toBe(false);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      app.dispose();
    }
  });

  it("keeps the dialog inside small terminal heights and still closes on Escape", async () => {
    for (const rows of [5, 8]) {
      const open = ref(true);
      const close = vi.fn();
      const App = defineComponent({
        name: "CommandPaletteSmallTerminalApp",
        setup() {
          return () =>
            h(TCommandPalette, {
              modelValue: open.value,
              items: [{ label: "Open Session" }],
              "onUpdate:modelValue": (value: boolean) => {
                open.value = value;
              },
              onClose: close,
            });
        },
      });
      const app = createTerminalApp({ cols: 20, rows, component: App });

      try {
        app.mount();
        await nextTick();
        app.scheduler.flushNow();

        expect(appLine(app, 0)[0]).toBe("┌");
        expect(appLine(app, rows - 1)[0]).toBe("└");
        expect(appLine(app, rows - 1)[19]).toBe("┘");

        app.events.dispatch({ type: "keydown", key: "Escape", code: "Escape" } as any);
        await nextTick();
        app.scheduler.flushNow();

        expect(open.value).toBe(false);
        expect(close).toHaveBeenCalledTimes(1);
      } finally {
        app.dispose();
      }
    }
  });

  it("skips separators when moving and selects with Enter", async () => {
    const selected = ref(0);
    const select = vi.fn();
    const App = defineComponent({
      name: "CommandPaletteSeparatorKeyboardApp",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: true,
            items: [
              { kind: "separator", label: "Group" },
              { label: "Open Session" },
              { label: "Switch Provider" },
            ],
            selectedIndex: selected.value,
            "onUpdate:selectedIndex": (value: number) => {
              selected.value = value;
            },
            onSelect: select,
          });
      },
    });
    const app = createTerminalApp({ cols: 64, rows: 20, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
      await nextTick();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter" } as any);

      expect(selected.value).toBe(1);
      expect(select).toHaveBeenCalledTimes(1);
      expect(select.mock.calls[0]?.[0]).toMatchObject({ label: "Open Session" });
      expect(select.mock.calls[0]?.[1]).toBe(1);
    } finally {
      app.dispose();
    }
  });

  it("emits query updates and accepts custom filters", async () => {
    const query = ref("");
    const select = vi.fn();
    const App = defineComponent({
      name: "CommandPaletteQueryFilterApp",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: true,
            items: [{ label: "Open Session" }, { label: "Switch Provider" }],
            filter: (items, q) => [
              {
                index: 1,
                item: items[1]!,
                score: 1,
                labelHighlightRanges: q ? [{ start: 0, end: 1 }] : [],
                detailHighlightRanges: [],
              },
            ],
            "onUpdate:query": (value: string) => {
              query.value = value;
            },
            onSelect: select,
          });
      },
    });
    const app = createTerminalApp({ cols: 64, rows: 20, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "s", code: "KeyS" } as any);
      await nextTick();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter" } as any);

      expect(query.value).toBe("s");
      expect(select).toHaveBeenCalledTimes(1);
      expect(select.mock.calls[0]?.[0]).toMatchObject({ label: "Switch Provider" });
      expect(select.mock.calls[0]?.[1]).toBe(1);
    } finally {
      app.dispose();
    }
  });
});
