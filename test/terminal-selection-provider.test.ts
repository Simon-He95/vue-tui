import { describe, expect, it, vi } from "vitest";
import { TLogView } from "../src/experimental.js";
import { TVirtualMarkdown } from "../src/markdown.js";
import { h, mountTerminal, nextTick, TInputBox, TText } from "./ui-regressions-support";
import { TView, TVirtualList } from "./ui-regressions-support";

function installNavigatorClipboard(writes: string[]) {
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

function rowText(
  mounted: { terminal: { getRow: (y: number) => readonly { ch: string }[] } },
  y: number,
) {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function pointerEvent(type: string, init: MouseEventInit & { pointerId?: number }): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  return event;
}

describe("TerminalProvider selection", () => {
  it("drag-selects visible terminal rows and auto-copies on mouseup", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const copies: unknown[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TText, {
          x: 0,
          y: 1,
          value: "0123456789",
          style: { fg: "whiteBright" },
        }),
      12,
      3,
      {
        selection: true,
        onSelectionCopy: (payload: unknown) => copies.push(payload),
      },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 2, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 8, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 8, clientY: 1, bubbles: true }));
      await settleClipboard();

      expect(writes).toEqual(["2345678"]);
      expect(copies).toMatchObject([{ text: "2345678", rows: 1, ok: true }]);
      expect(mounted.terminal.getCell(2, 1).style.inverse).toBe(true);
    } finally {
      mounted.unmount();
      restore();
    }
  });

  it("uses injected clipboard for browser auto-copy", async () => {
    const writes: string[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TText, {
          x: 0,
          y: 0,
          value: "clipboard injection",
          style: { fg: "whiteBright" },
        }),
      24,
      2,
      {
        selection: true,
        clipboard: {
          supported: true,
          readText: async () => writes[writes.length - 1] ?? "",
          writeText: async (text: string) => {
            writes.push(text);
          },
        },
      },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 8, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 8, clientY: 0, bubbles: true }));
      await settleClipboard();

      expect(writes).toEqual(["clipboard"]);
    } finally {
      mounted.unmount();
    }
  });

  it("reports clipboard write failures without clearing the selection", async () => {
    const error = new Error("denied");
    const writeText = vi.fn(async () => {
      throw error;
    });
    const copies: unknown[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TText, {
          x: 0,
          y: 0,
          value: "clipboard failure",
          style: { fg: "whiteBright" },
        }),
      24,
      2,
      {
        selection: true,
        clipboard: {
          supported: true,
          readText: async () => "",
          writeText,
        },
        onSelectionCopy: (payload: unknown) => copies.push(payload),
      },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 8, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 8, clientY: 0, bubbles: true }));
      await settleClipboard();

      expect(writeText).toHaveBeenCalledWith("clipboard");
      expect(copies).toMatchObject([{ text: "clipboard", rows: 1, ok: false, error }]);
      expect(mounted.terminal.getCell(0, 0).style.inverse).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("extends an existing selection with Shift+mousedown", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const mounted = await mountTerminal(
      () => [
        h(TText, { x: 0, y: 0, value: "0123456789", style: { fg: "whiteBright" } }),
        h(TText, { x: 0, y: 1, value: "abcdef", style: { fg: "whiteBright" } }),
      ],
      12,
      3,
      { selection: true },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 2, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 4, clientY: 0, bubbles: true }));
      await settleClipboard();

      container.dispatchEvent(
        new MouseEvent("mousedown", {
          clientX: 1,
          clientY: 1,
          shiftKey: true,
          bubbles: true,
        }),
      );
      container.dispatchEvent(
        new MouseEvent("mouseup", {
          clientX: 1,
          clientY: 1,
          shiftKey: true,
          bubbles: true,
        }),
      );
      await settleClipboard();

      expect(writes).toEqual(["234", "23456789\nab"]);
    } finally {
      mounted.unmount();
      restore();
    }
  });

  it("clears selection on Escape", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const mounted = await mountTerminal(
      () => h(TText, { x: 0, y: 0, value: "abcdef", style: { fg: "whiteBright" } }),
      8,
      2,
      { selection: true },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 3, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 3, clientY: 0, bubbles: true }));
      await settleClipboard();

      expect(mounted.terminal.getCell(1, 0).style.inverse).toBe(true);
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
      await nextTick();

      expect(mounted.terminal.getCell(1, 0).style.inverse).toBeUndefined();
    } finally {
      mounted.unmount();
      restore();
    }
  });

  it("does not start terminal selection from focusable inputs", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const mounted = await mountTerminal(
      () =>
        h(TInputBox, {
          x: 0,
          y: 0,
          w: 14,
          h: 3,
          modelValue: "abcdef",
          cursorBlink: false,
        }),
      16,
      4,
      { selection: true },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 2, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 6, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 6, clientY: 1, bubbles: true }));
      await settleClipboard();

      expect(writes).toEqual([]);
    } finally {
      mounted.unmount();
      restore();
    }
  });

  it("allows a plain click on selectable views without drag", async () => {
    const onClick = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TView,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 1,
            selectable: true,
            onClick,
          },
          () => h(TText, { x: 0, y: 0, value: "click me", style: { fg: "whiteBright" } }),
        ),
      12,
      2,
      { selection: true },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 2, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 2, clientY: 0, bubbles: true }));
      container.dispatchEvent(new MouseEvent("click", { clientX: 2, clientY: 0, bubbles: true }));
      await settleClipboard();

      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });

  it("suppresses click events after dragging selection over selectable views", async () => {
    const onClick = vi.fn();
    const onDblclick = vi.fn();
    const onContextmenu = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TView,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 1,
            selectable: true,
            onClick,
            onDblclick,
          },
          () => h(TText, { x: 0, y: 0, value: "select me", style: { fg: "whiteBright" } }),
        ),
      12,
      2,
      { selection: { autoCopy: false } },
    );

    try {
      const container = mounted.container()!;
      container.addEventListener("contextmenu", onContextmenu);

      for (const type of ["click", "dblclick", "contextmenu"] as const) {
        container.dispatchEvent(
          new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
        );
        container.dispatchEvent(
          new MouseEvent("mousemove", { clientX: 4, clientY: 0, bubbles: true }),
        );
        container.dispatchEvent(
          new MouseEvent("mouseup", { clientX: 4, clientY: 0, bubbles: true }),
        );
        container.dispatchEvent(new MouseEvent(type, { clientX: 2, clientY: 0, bubbles: true }));
      }

      expect(onClick).not.toHaveBeenCalled();
      expect(onDblclick).not.toHaveBeenCalled();
      expect(onContextmenu).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("does not replay pointer selection through compatibility mouse events", async () => {
    const onPointerdown = vi.fn();
    const onPointerup = vi.fn();
    const onClick = vi.fn();
    const mounted = await mountTerminal(
      () =>
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
        ),
      12,
      2,
      { selection: { autoCopy: false } },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 0 }));
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(pointerEvent("pointermove", { clientX: 4, clientY: 0, button: 0 }));
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 0, button: 0 }));
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 4, clientY: 0, bubbles: true }));
      container.dispatchEvent(new MouseEvent("click", { clientX: 4, clientY: 0, bubbles: true }));

      expect(onPointerdown).toHaveBeenCalledTimes(1);
      expect(onPointerup).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("suppresses TLogView linkClick after dragging selection over link text", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const onLinkClick = vi.fn();
    const source = {
      lineCount: () => 1,
      getLine: () => "go \x1b]8;;https://example.com\x07link\x1b]8;;\x07",
      getLineKey: () => "line",
    };
    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 10,
          h: 1,
          source,
          version: 1,
          ansi: true,
          links: true,
          onLinkClick,
        }),
      10,
      2,
      { selection: true },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 3, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 6, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 6, clientY: 0, bubbles: true }));
      await settleClipboard();
      container.dispatchEvent(new MouseEvent("click", { clientX: 4, clientY: 0, bubbles: true }));

      expect(writes).toEqual(["link"]);
      expect(onLinkClick).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
      restore();
    }
  });

  it("auto-scrolls TLogView while dragging selection near its edge", async () => {
    const source = {
      lineCount: () => 20,
      getLine: (index: number) => `line-${index}`,
    };
    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          source,
          version: 1,
          defaultScrollTop: 0,
          autoStickToBottom: false,
        }),
      12,
      4,
      { selection: { autoCopy: false } },
    );

    vi.useFakeTimers();
    try {
      expect(rowText(mounted, 0)).toBe("line-0");
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 0, clientY: 3, bubbles: true }),
      );
      vi.advanceTimersByTime(90);
      await nextTick();

      expect(rowText(mounted, 0)).toBe("line-1");
    } finally {
      mounted.unmount();
      vi.useRealTimers();
    }
  });

  it("copies TLogView source rows across selection auto-scroll", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const source = {
      lineCount: () => 20,
      getLine: (index: number) => `line-${index}`,
    };
    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          source,
          version: 1,
          defaultScrollTop: 0,
          autoStickToBottom: false,
        }),
      12,
      4,
      { selection: true },
    );

    vi.useFakeTimers();
    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 3, bubbles: true }),
      );
      vi.advanceTimersByTime(90);
      await nextTick();
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 3, bubbles: true }));
      await settleClipboard();

      expect(writes).toEqual(["line-1\nline-2\nline-3\nline-4"]);
    } finally {
      mounted.unmount();
      vi.useRealTimers();
      restore();
    }
  });

  it("auto-scrolls selectable TVirtualList while dragging selection near its edge", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          itemCount: 20,
          itemVersion: 1,
          getItem: (index: number) => `item-${index}`,
          selectable: true,
        }),
      12,
      4,
      { selection: { autoCopy: false } },
    );

    vi.useFakeTimers();
    try {
      expect(rowText(mounted, 0)).toBe("item-0");
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 0, clientY: 3, bubbles: true }),
      );
      vi.advanceTimersByTime(90);
      await nextTick();

      expect(rowText(mounted, 0)).toBe("item-1");
    } finally {
      mounted.unmount();
      vi.useRealTimers();
    }
  });

  it("copies TVirtualMarkdown visual rows across selection auto-scroll", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const content = Array.from({ length: 20 }, (_, index) => `- row-${index}`).join("\n");
    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content,
        }),
      12,
      4,
      { selection: true },
    );

    vi.useFakeTimers();
    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 6, clientY: 3, bubbles: true }),
      );
      vi.advanceTimersByTime(90);
      await nextTick();
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 6, clientY: 3, bubbles: true }));
      await settleClipboard();

      expect(writes).toEqual(["- row-1\n- row-2\n- row-3\n- row-4"]);
    } finally {
      mounted.unmount();
      vi.useRealTimers();
      restore();
    }
  });
});
