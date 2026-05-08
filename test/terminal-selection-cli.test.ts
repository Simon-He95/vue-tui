import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/index.js";
import {
  defineComponent,
  h,
  nextTick,
  TText,
  TView,
  useTerminal,
} from "./ui-regressions-support.js";

async function settle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

describe("createTerminalApp selection", () => {
  it("drag-selects terminal rows, auto-copies, and suppresses activation", async () => {
    const writes: string[] = [];
    const copies: unknown[] = [];
    const contextCopies: unknown[] = [];
    const onPointerdown = vi.fn();
    const onPointerup = vi.fn();
    const onClick = vi.fn();
    const App = defineComponent({
      name: "CliSelectionProbe",
      setup() {
        const terminal = useTerminal();
        terminal.selection.onCopy((payload) => contextCopies.push(payload));
        return () =>
          h(
            TView,
            {
              x: 0,
              y: 0,
              w: 10,
              h: 1,
              selectable: true,
              onPointerdown,
              onPointerup,
              onClick,
            },
            () => h(TText, { x: 0, y: 0, value: "select me", style: { fg: "whiteBright" } }),
          );
      },
    });
    const app = createTerminalApp({
      cols: 12,
      rows: 2,
      component: App,
      selection: true,
      clipboard: {
        supported: true,
        readText: async () => writes[writes.length - 1] ?? "",
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
      onSelectionCopy: (payload) => copies.push(payload),
    });

    try {
      app.mount();
      await settle();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointermove", cellX: 5, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointerup", cellX: 5, cellY: 0, button: 0 });
      app.events.dispatch({ type: "click", cellX: 5, cellY: 0, button: 0 });
      await settle();
      app.scheduler.flushNow();

      expect(writes).toEqual(["select"]);
      expect(copies).toMatchObject([{ text: "select", rows: 1, ok: true }]);
      expect(contextCopies).toMatchObject([{ text: "select", rows: 1, ok: true }]);
      expect(onPointerdown).toHaveBeenCalledTimes(1);
      expect(onPointerup).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
      expect(app.terminal.getCell(0, 0).style.inverse).toBe(true);
      expect(app.terminal.getCell(5, 0).style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("does not start selection from focusable views unless they opt in", async () => {
    const writes: string[] = [];
    const onPointerup = vi.fn();
    const App = defineComponent({
      name: "CliNonSelectableProbe",
      setup() {
        return () =>
          h(
            TView,
            {
              x: 0,
              y: 0,
              w: 10,
              h: 1,
              focusable: true,
              onPointerup,
            },
            () => h(TText, { x: 0, y: 0, value: "input-ish", style: { fg: "whiteBright" } }),
          );
      },
    });
    const app = createTerminalApp({
      cols: 12,
      rows: 2,
      component: App,
      selection: true,
      clipboard: {
        supported: true,
        readText: async () => writes[writes.length - 1] ?? "",
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
    });

    try {
      app.mount();
      await settle();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointermove", cellX: 5, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointerup", cellX: 5, cellY: 0, button: 0 });
      await settle();

      expect(writes).toEqual([]);
      expect(onPointerup).toHaveBeenCalledTimes(1);
      expect(app.terminal.getCell(0, 0).style.inverse).toBeUndefined();
    } finally {
      app.dispose();
    }
  });

  it("auto-scrolls selectable views while dragging near their edge", async () => {
    const selectionScrollBy = vi.fn(() => true);
    const App = defineComponent({
      name: "CliSelectionAutoScrollProbe",
      setup() {
        return () =>
          h(
            TView,
            {
              x: 0,
              y: 0,
              w: 10,
              h: 2,
              selectable: true,
              selectionScrollBy,
            },
            () => h(TText, { x: 0, y: 0, value: "scroll me" }),
          );
      },
    });
    const app = createTerminalApp({
      cols: 12,
      rows: 3,
      component: App,
      selection: { autoCopy: false },
    });

    vi.useFakeTimers();
    try {
      app.mount();
      await settle();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointermove", cellX: 0, cellY: 1, button: 0 });
      vi.advanceTimersByTime(90);

      expect(selectionScrollBy).toHaveBeenCalledWith(1);
    } finally {
      app.dispose();
      vi.useRealTimers();
    }
  });
});
