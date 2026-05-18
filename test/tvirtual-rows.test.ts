import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import { TVirtualRows } from "../src/vue/components/TVirtualRows.js";
import { defineComponent, h, nextTick } from "./ui-regressions-support.js";

function createRowsApp(itemClick: (payload: unknown) => void) {
  const rows = ["zero", "one", "two"];
  const App = defineComponent({
    name: "VirtualRowsPointerApp",
    setup() {
      return () =>
        h(TVirtualRows, {
          x: 0,
          y: 0,
          w: 12,
          h: 3,
          itemCount: rows.length,
          itemVersion: 1,
          getItem: (index: number) => rows[index],
          paintItem: () => {},
          onItemClick: itemClick,
        });
    },
  });
  return createTerminalApp({ cols: 12, rows: 3, component: App });
}

describe("TVirtualRows", () => {
  it("emits itemClick from matching pointerdown and pointerup without a click event", async () => {
    const itemClick = vi.fn();
    const app = createRowsApp(itemClick);

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerdown", cellX: 1, cellY: 1, button: 0 } as any);
      app.events.dispatch({ type: "pointerup", cellX: 1, cellY: 1, button: 0 } as any);
      app.events.dispatch({ type: "click", cellX: 1, cellY: 1, button: 0 } as any);

      expect(itemClick).toHaveBeenCalledTimes(1);
      expect(itemClick.mock.calls[0]?.[0]).toMatchObject({ index: 1, item: "one" });
    } finally {
      app.dispose();
    }
  });

  it("ignores pointerup activation without a matching pointerdown on the same item", async () => {
    const itemClick = vi.fn();
    const app = createRowsApp(itemClick);

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerup", cellX: 1, cellY: 1, button: 0 } as any);
      app.events.dispatch({ type: "pointerdown", cellX: 1, cellY: 0, button: 0 } as any);
      app.events.dispatch({ type: "pointerup", cellX: 1, cellY: 1, button: 0 } as any);

      expect(itemClick).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("ignores pointerup activation after pointer movement", async () => {
    const itemClick = vi.fn();
    const app = createRowsApp(itemClick);

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerdown", cellX: 1, cellY: 1, button: 0 } as any);
      app.events.dispatch({ type: "pointermove", cellX: 2, cellY: 1, button: 0 } as any);
      app.events.dispatch({ type: "pointerup", cellX: 2, cellY: 1, button: 0 } as any);

      expect(itemClick).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });
});
