import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import {
  defineComponent,
  h,
  nextTick,
  TRenderPlane,
  TText,
  TView,
  useTerminal,
} from "./ui-regressions-support.js";

async function settle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

function rowText(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => (cell.continuation ? "" : cell.ch || " "))
    .join("")
    .trimEnd();
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
      expect(onPointerdown).not.toHaveBeenCalled();
      expect(onPointerup).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
      expect(app.terminal.getCell(0, 0).style.bg).toBe("blue");
      expect(app.terminal.getCell(5, 0).style.bg).toBe("blue");
    } finally {
      app.dispose();
    }
  });

  it("keeps transcript-plane text visible under selection highlight", async () => {
    const App = defineComponent({
      name: "CliSelectionTranscriptPlaneProbe",
      setup() {
        return () =>
          h(TRenderPlane, { plane: "transcript" }, () =>
            h(
              TView,
              {
                x: 0,
                y: 0,
                w: 14,
                h: 1,
                selectable: true,
              },
              () =>
                h(TText, {
                  x: 0,
                  y: 0,
                  value: "维护成本高",
                  style: { fg: "whiteBright" },
                }),
            ),
          );
      },
    });
    const app = createTerminalApp({
      cols: 16,
      rows: 2,
      component: App,
      selection: { autoCopy: false },
    });

    try {
      app.mount();
      await settle();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointermove", cellX: 7, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointerup", cellX: 7, cellY: 0, button: 0 });
      await settle();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("维护成本高");
      expect(app.terminal.getCell(0, 0).style.bg).toBe("blue");
      expect(app.terminal.getCell(0, 0).style.fg).toBe("whiteBright");
      expect(app.terminal.getCell(7, 0).style.bg).toBe("blue");
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
      expect(app.terminal.getCell(0, 0).style.bg).toBeUndefined();
    } finally {
      app.dispose();
    }
  });

  it("starts selection from a text provider inside a non-selectable event node", async () => {
    const writes: string[] = [];
    const App = defineComponent({
      name: "CliSelectionProviderProbe",
      setup() {
        const terminal = useTerminal();
        terminal.selection.registerTextProvider({
          id: "provider",
          rect: { x: 0, y: 0, w: 10, h: 1 },
          canHandle: (range) => range.anchor.y === 0 && range.focus.y === 0,
          pointForCell: (point) => point,
          getText: (range) => "provider text".slice(range.anchor.x, range.focus.x + 1),
        });
        return () =>
          h(
            TView,
            {
              x: 0,
              y: 0,
              w: 10,
              h: 1,
              selectable: false,
            },
            () => h(TText, { x: 0, y: 0, value: "provider text" }),
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
      app.events.dispatch({ type: "pointermove", cellX: 7, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointerup", cellX: 7, cellY: 0, button: 0 });
      await settle();
      app.scheduler.flushNow();

      expect(writes).toEqual(["provider"]);
      expect(app.terminal.getCell(0, 0).style.bg).toBe("blue");
    } finally {
      app.dispose();
    }
  });

  it("replays a plain pointer click when no selection range is created", async () => {
    const onPointerdown = vi.fn();
    const onPointerup = vi.fn();
    const App = defineComponent({
      name: "CliSelectionPlainClickProbe",
      setup() {
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
            },
            () => h(TText, { x: 0, y: 0, value: "click me" }),
          );
      },
    });
    const app = createTerminalApp({
      cols: 12,
      rows: 2,
      component: App,
      selection: true,
    });

    try {
      app.mount();
      await settle();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointerup", cellX: 0, cellY: 0, button: 0 });
      await settle();

      expect(onPointerdown).toHaveBeenCalledTimes(1);
      expect(onPointerup).toHaveBeenCalledTimes(1);
      expect(app.terminal.getCell(0, 0).style.bg).toBeUndefined();
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

  it("does not dispatch pointerdown/pointermove to node when selection starts a drag", async () => {
    const onPointerdown = vi.fn();
    const onPointermove = vi.fn();
    const onClick = vi.fn();
    const App = defineComponent({
      name: "CliPointerSuppressProbe",
      setup() {
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
              onPointermove,
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
      selection: { autoCopy: false },
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

      expect(onPointerdown).not.toHaveBeenCalled();
      expect(onPointermove).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });
});
