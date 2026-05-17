import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import {
  TTranscriptView,
  type TTranscriptDataSource,
  type TTranscriptRow,
  type TTranscriptViewHandle,
} from "../src/experimental.js";
import { defineComponent, h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";
import { installManualRaf } from "./helpers/manual-raf.js";

function createSource(rows: readonly TTranscriptRow[]): TTranscriptDataSource {
  return {
    rowCount: () => rows.length,
    getRow: (index) => rows[index]!,
  };
}

function rowText(
  mounted: { terminal: { getRow: (y: number) => readonly { ch: string }[] } },
  y: number,
): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function installNavigatorClipboard(writes: string[]): () => void {
  const previous = (navigator as any).clipboard;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn(async () => writes[writes.length - 1] ?? ""),
      writeText: vi.fn(async (text: string) => {
        writes.push(text);
      }),
    },
  });
  return () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: previous,
    });
  };
}

async function settleClipboard(): Promise<void> {
  await nextTick();
  await Promise.resolve();
}

async function copyWrappedSelection(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<string> {
  const writes: string[] = [];
  const restore = installNavigatorClipboard(writes);
  const mounted = await mountTerminal(
    () =>
      h(TTranscriptView, {
        x: 0,
        y: 0,
        w: 3,
        h: 2,
        source: createSource([
          {
            kind: "message",
            key: "msg",
            segments: [{ text: "abcdef" }],
          },
        ]),
        version: 1,
        wrap: true,
        selectable: true,
      }),
    3,
    2,
    { selection: true },
  );

  try {
    const container = mounted.container()!;
    container.dispatchEvent(
      new MouseEvent("mousedown", { clientX: start.x, clientY: start.y, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent("mousemove", { clientX: end.x, clientY: end.y, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent("mouseup", { clientX: end.x, clientY: end.y, bubbles: true }),
    );
    await settleClipboard();
    return writes[0] ?? "";
  } finally {
    mounted.unmount();
    restore();
  }
}

describe("TTranscriptView", () => {
  it("copies wrapped visual rows without repeating the full message", async () => {
    await expect(copyWrappedSelection({ x: 0, y: 0 }, { x: 2, y: 0 })).resolves.toBe("abc");
    await expect(copyWrappedSelection({ x: 0, y: 1 }, { x: 2, y: 1 })).resolves.toBe("def");
    await expect(copyWrappedSelection({ x: 0, y: 0 }, { x: 2, y: 1 })).resolves.toBe("abc\ndef");
  });

  it("waits for parent-controlled scrollTop before repainting", async () => {
    const raf = installManualRaf();
    const updates: number[] = [];
    const scrolls: number[] = [];
    const rows = Array.from(
      { length: 20 },
      (_, index): TTranscriptRow => ({
        kind: "message",
        key: index,
        segments: [{ text: `row-${index}` }],
      }),
    );
    const App = defineComponent({
      name: "TranscriptControlledScrollApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 10,
            h: 2,
            source: createSource(rows),
            version: 1,
            scrollTop: 0,
            autoFocus: true,
            onScroll: (payload: { scrollTop: number }) => {
              scrolls.push(payload.scrollTop);
            },
            "onUpdate:scrollTop": (value: number) => {
              updates.push(value);
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 10, rows: 4, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("row-0");

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      expect(raf.pending()).toBe(1);
      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(updates).toEqual([1]);
      expect(scrolls).toEqual([1]);
      expect(rowText(app, 0)).toBe("row-0");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("does not focus or click disabled actions", async () => {
    const actionClick = vi.fn();
    const viewRef = ref<TTranscriptViewHandle | null>(null);
    const row: TTranscriptRow = {
      kind: "approval",
      key: "approval",
      title: "Allow?",
      actions: [{ id: "approve", label: "Approve", disabled: true }],
    };
    const App = defineComponent({
      name: "TranscriptDisabledActionApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            ref: viewRef,
            x: 0,
            y: 0,
            w: 24,
            h: 2,
            source: createSource([row]),
            version: 1,
            onActionClick: actionClick,
          });
      },
    });
    const app = createTerminalApp({ cols: 24, rows: 4, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      const firstRow = rowText(app, 0);
      const actionX = firstRow.indexOf("[Approve]");
      expect(actionX).toBeGreaterThanOrEqual(0);

      app.events.dispatch({ type: "click", cellX: actionX, cellY: 0, time: 1_000 } as any);
      expect(viewRef.value?.focusNextRegion()).toBe(false);
      expect(viewRef.value?.activateFocusedRegion()).toBe(false);
      expect(actionClick).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });
});
