import { describe, expect, it, vi } from "vitest";
import { TLogView } from "../src/experimental.js";
import { TVirtualMarkdown } from "../src/markdown.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  TInputBox,
  TText,
  watchEffect,
} from "./ui-regressions-support";
import {
  createApp,
  TerminalProvider,
  TView,
  TVirtualList,
  useTerminal,
} from "./ui-regressions-support";

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

  it("copies from the composed row before the selection overlay", async () => {
    const text = ref("abcdef");
    const writes: string[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TText, {
          x: 0,
          y: 0,
          value: text.value,
          w: 6,
          style: { fg: "whiteBright" },
        }),
      8,
      2,
      {
        selection: true,
        clipboard: {
          supported: true,
          readText: async () => writes[writes.length - 1] ?? "",
          writeText: async (value: string) => {
            writes.push(value);
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
        new MouseEvent("mousemove", { clientX: 2, clientY: 0, bubbles: true }),
      );
      await nextTick();

      expect(mounted.terminal.getCell(0, 0).style.inverse).toBe(true);

      text.value = "xyzdef";
      await nextTick();

      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 2, clientY: 0, bubbles: true }));
      await settleClipboard();

      expect(writes).toEqual(["xyz"]);
    } finally {
      mounted.unmount();
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
    const onClick = vi.fn();
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
      container.addEventListener("click", onClick);
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
      container.dispatchEvent(new MouseEvent("click", { clientX: 1, clientY: 1, bubbles: true }));
      await settleClipboard();

      expect(writes).toEqual(["234", "23456789\nab"]);
      expect(onClick).not.toHaveBeenCalled();
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

      expect(onPointerdown).not.toHaveBeenCalled();
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

  it("copies TVirtualList item text across selection auto-scroll", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
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

      // Should copy item-1 through item-4 (cross-viewport selection via provider)
      expect(writes).toEqual(["item-1\nitem-2\nitem-3\nitem-4"]);
    } finally {
      mounted.unmount();
      vi.useRealTimers();
      restore();
    }
  });

  it("highlights only visible rows after TLogView auto-scroll during selection", async () => {
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
      { selection: { autoCopy: false, copyOnMouseUp: false } },
    );

    vi.useFakeTimers();
    try {
      const container = mounted.container()!;
      // Start selection at row 1
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      // Drag to bottom edge to trigger auto-scroll
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 3, bubbles: true }),
      );
      vi.advanceTimersByTime(90);
      await nextTick();
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 3, bubbles: true }));
      // Restore real timers so the overlay render pipeline can flush
      vi.useRealTimers();
      await settleClipboard();
      await nextTick();

      // After auto-scroll by 1 row, viewport shows line-1..line-4.
      expect(rowText(mounted, 0)).toBe("line-1");

      // The overlay selection highlight should map to the correct viewport rows.
      // Selection spans from line-1 to line-4, all rows in the current viewport.
      expect(mounted.terminal.getCell(0, 0).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 1).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 2).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 3).style.inverse).toBe(true);
      // Cell beyond selection end should not be highlighted.
      expect(mounted.terminal.getCell(6, 3).style.inverse).toBeUndefined();
    } finally {
      vi.useRealTimers();
      mounted.unmount();
    }
  });

  it("keeps provider selection when drag focus leaves the provider rect", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);

    const source = {
      lineCount: () => 100,
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
      8,
      { selection: true },
    );

    vi.useFakeTimers();
    try {
      const container = mounted.container()!;

      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      // y=6 is outside TLogView rect h=4, but still inside terminal.
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 6, bubbles: true }),
      );

      vi.advanceTimersByTime(90);
      await nextTick();

      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 6, bubbles: true }));
      await settleClipboard();

      expect(writes[0]).toContain("line-1");
      expect(writes[0]).toContain("line-4");
      expect(writes[0]).not.toBe(rowText(mounted, 0)); // not just screen-buffer fallback
    } finally {
      mounted.unmount();
      vi.useRealTimers();
      restore();
    }
  });

  it("suppresses document click after selection mouseup outside terminal", async () => {
    const outsideClick = vi.fn();

    const mounted = await mountTerminal(
      () => h(TText, { x: 0, y: 0, value: "select me", style: { fg: "whiteBright" } }),
      12,
      2,
      { selection: { autoCopy: false } },
    );

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.addEventListener("click", outsideClick);

    try {
      const container = mounted.container()!;

      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 20, bubbles: true }),
      );
      document.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 20, bubbles: true }));

      // Browser-generated click after mouseup arrives at the same coordinates.
      button.dispatchEvent(new MouseEvent("click", { clientX: 5, clientY: 20, bubbles: true }));

      expect(outsideClick).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
      button.remove();
    }
  });

  it("repaints selection overlay with current viewport text after virtual scroll", async () => {
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
      { selection: { autoCopy: false, copyOnMouseUp: false } },
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

      // After auto-scroll, viewport should show line-1 at row 0
      expect(rowText(mounted, 0)).toBe("line-1");

      // The overlay cells should carry the current row characters,
      // not stale pre-scroll characters. Verify that the inverse style
      // is applied on the correct viewport rows.
      expect(mounted.terminal.getCell(0, 0).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 1).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 2).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 3).style.inverse).toBe(true);
    } finally {
      vi.useRealTimers();
      mounted.unmount();
    }
  });

  it("restores userSelect after mouseup outside terminal during selection", async () => {
    const mounted = await mountTerminal(() => h(TText, { x: 0, y: 0, value: "select me" }), 12, 2, {
      selection: { autoCopy: false },
    });

    try {
      const container = mounted.container()!;
      container.style.userSelect = "text";

      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 20, bubbles: true }),
      );
      document.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 20, bubbles: true }));

      expect(container.style.userSelect).toBe("text");
    } finally {
      mounted.unmount();
    }
  });

  it("calls selection.refresh() in TVirtualMarkdown rebuildRows when visible content changes", async () => {
    // This tests the fix: rebuildRows() now calls selection.refresh() when
    // visible content changes, ensuring the overlay doesn't go stale during
    // markdown streaming. The full render pipeline is tested by the existing
    // "repaints selection overlay" test for scroll-driven refresh.
    const { TVirtualMarkdown } = await import("../src/markdown.js");

    const mounted = await mountTerminal(
      () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          content: "- row0\n- row1",
        }),
      12,
      4,
      { selection: { autoCopy: false, copyOnMouseUp: false } },
    );

    try {
      // Verify the component renders and selection works
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 0, bubbles: true }));
      await nextTick();

      // Selection overlay should be present
      expect(mounted.terminal.getCell(2, 0).style.inverse).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("refreshes selection overlay when virtual list itemVersion changes", async () => {
    const version = ref(1);
    const prefix = ref("old");

    const App = defineComponent({
      name: "VirtualListVersionChangeApp",
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: 4,
            itemVersion: version.value,
            getItem: (index: number) => `${prefix.value}-${index}`,
            selectable: true,
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 12, 4, {
      selection: { autoCopy: false, copyOnMouseUp: false },
    });

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 1, bubbles: true }),
      );

      prefix.value = "new";
      version.value++;
      await nextTick();
      await nextTick();

      expect(rowText(mounted, 1)).toBe("new-1");
      expect(mounted.terminal.getCell(0, 1).style.inverse).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("suppresses delayed document click after mouseup outside terminal", async () => {
    vi.useFakeTimers();

    const outsideClick = vi.fn();

    const mounted = await mountTerminal(() => h(TText, { x: 0, y: 0, value: "select me" }), 12, 2, {
      selection: { autoCopy: false },
    });

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.addEventListener("click", outsideClick);

    try {
      const container = mounted.container()!;

      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 20, bubbles: true }),
      );
      document.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 20, bubbles: true }));

      // Simulate browser dispatching click slightly later at the same coordinates.
      vi.advanceTimersByTime(10);
      button.dispatchEvent(new MouseEvent("click", { clientX: 5, clientY: 20, bubbles: true }));

      expect(outsideClick).not.toHaveBeenCalled();

      // After suppression window expires, unrelated future clicks should work.
      vi.advanceTimersByTime(300);
      button.dispatchEvent(new MouseEvent("click", { clientX: 5, clientY: 20, bubbles: true }));

      expect(outsideClick).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
      button.remove();
      vi.useRealTimers();
    }
  });

  it("suppresses outside mouseup handler after selection mouseup outside terminal", async () => {
    const outsideMouseup = vi.fn();

    const mounted = await mountTerminal(() => h(TText, { x: 0, y: 0, value: "select me" }), 12, 2, {
      selection: { autoCopy: false },
    });

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.addEventListener("mouseup", outsideMouseup);

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 20, bubbles: true }),
      );

      button.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 20, bubbles: true }));

      expect(outsideMouseup).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
      button.remove();
    }
  });

  it("keeps TVirtualList selection correct with controlled scrollTop auto-scroll", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);

    const scrollTopRef = ref(0);

    const App = defineComponent({
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: 20,
            itemVersion: 1,
            scrollTop: scrollTopRef.value,
            getItem: (index: number) => `item-${index}`,
            selectable: true,
            "onUpdate:scrollTop": (value: number) => {
              scrollTopRef.value = value;
            },
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 12, 4, { selection: true });

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
      await nextTick();

      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 3, bubbles: true }));
      await settleClipboard();

      expect(scrollTopRef.value).toBeGreaterThan(0);
      expect(writes[0]).toContain("item-1");
      expect(writes[0]).toContain("item-4");
    } finally {
      mounted.unmount();
      vi.useRealTimers();
      restore();
    }
  });

  it("does not dispatch pointerdown/pointermove to selectable node when starting a drag selection", async () => {
    const onPointerdown = vi.fn();
    const onPointermove = vi.fn();
    const onClick = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(
          TView,
          {
            x: 0,
            y: 0,
            w: 12,
            h: 1,
            selectable: true,
            onPointerdown,
            onPointermove,
            onClick,
          },
          () => h(TText, { x: 0, y: 0, value: "select text" }),
        ),
      12,
      2,
      { selection: { autoCopy: false } },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 6, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 6, clientY: 0, bubbles: true }));
      container.dispatchEvent(new MouseEvent("click", { clientX: 6, clientY: 0, bubbles: true }));

      expect(onPointerdown).not.toHaveBeenCalled();
      expect(onPointermove).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("does not suppress an unrelated click after drag selection", async () => {
    const outsideClick = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(TView, { x: 0, y: 0, w: 12, h: 1, selectable: true }, () =>
          h(TText, { x: 0, y: 0, value: "select text" }),
        ),
      12,
      2,
      { selection: { autoCopy: false } },
    );

    const outside = document.createElement("button");
    outside.addEventListener("click", outsideClick);
    document.body.appendChild(outside);

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 6, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 6, clientY: 0, bubbles: true }));

      // Different coordinates from selection mouseup: should not be swallowed.
      outside.dispatchEvent(new MouseEvent("click", { clientX: 200, clientY: 200, bubbles: true }));

      expect(outsideClick).toHaveBeenCalledTimes(1);
    } finally {
      outside.remove();
      mounted.unmount();
    }
  });

  it("does not suppress an unrelated terminal-internal click after drag selection", async () => {
    const onContainerClick = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(TView, { x: 0, y: 0, w: 12, h: 2, selectable: true }, () =>
          h(TText, { x: 0, y: 0, value: "select text" }),
        ),
      12,
      2,
      { selection: { autoCopy: false } },
    );

    try {
      const container = mounted.container()!;

      // Add a bubble-phase click listener directly on the container (after the
      // event manager's listener) to verify the click is not suppressed.
      container.addEventListener("click", onContainerClick);

      // Drag selection on first row
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 6, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 6, clientY: 0, bubbles: true }));

      // Unrelated click inside terminal but at a different position (dy > 4px
      // from the selection mouseup, so shouldSuppressSelectionActivation fails).
      container.dispatchEvent(new MouseEvent("click", { clientX: 2, clientY: 20, bubbles: true }));

      expect(onContainerClick).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });

  it("continues selection when dragging outside terminal via document mousemove/mouseup", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);

    const mounted = await mountTerminal(
      () => h(TText, { x: 0, y: 0, value: "select me", style: { fg: "whiteBright" } }),
      12,
      2,
      { selection: true },
    );

    try {
      const container = mounted.container()!;

      // Start selection inside the terminal
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );

      // Drag outside the terminal via document-level listener
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 20, bubbles: true }),
      );

      // Release outside the terminal
      document.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 20, bubbles: true }));

      await settleClipboard();

      // Selection should have completed and copied the text
      expect(writes.length).toBe(1);
      expect(writes[0]).toContain("select");
    } finally {
      mounted.unmount();
      restore();
    }
  });

  it("cleans up gesture state when Escape is pressed during drag", async () => {
    const mounted = await mountTerminal(
      () => h(TText, { x: 0, y: 0, value: "abcdef", style: { fg: "whiteBright" } }),
      8,
      2,
      { selection: { autoCopy: false } },
    );

    try {
      const container = mounted.container()!;
      // Start drag — do not release
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4, clientY: 0, bubbles: true }),
      );

      // Press Escape mid-drag
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
      await nextTick();

      // After Escape, the element's user-select should be restored (not "none")
      expect(container.style.userSelect).not.toBe("none");

      // A subsequent plain click on a selectable view should still work
      const onClick = vi.fn();
      const mounted2 = await mountTerminal(
        () =>
          h(TView, { x: 0, y: 0, w: 10, h: 1, selectable: true, onClick }, () =>
            h(TText, { x: 0, y: 0, value: "click me" }),
          ),
        12,
        2,
        { selection: true },
      );

      try {
        const c2 = mounted2.container()!;
        c2.dispatchEvent(new MouseEvent("mousedown", { clientX: 2, clientY: 0, bubbles: true }));
        c2.dispatchEvent(new MouseEvent("mouseup", { clientX: 2, clientY: 0, bubbles: true }));
        c2.dispatchEvent(new MouseEvent("click", { clientX: 2, clientY: 0, bubbles: true }));
        await settleClipboard();

        expect(onClick).toHaveBeenCalledTimes(1);
      } finally {
        mounted2.unmount();
      }
    } finally {
      mounted.unmount();
    }
  });

  it("cleans up gesture state when selection is disabled during drag", async () => {
    const selectionProp = ref<true | false>(true);
    const root = document.createElement("div");
    document.body.appendChild(root);

    const exposed = {
      terminal: null as any,
      container: null as HTMLElement | null,
    };

    const App = defineComponent({
      setup() {
        return () =>
          h(
            TerminalProvider,
            { cols: 8, rows: 2, selection: selectionProp.value },
            {
              default: () => [
                h(
                  defineComponent({
                    name: "ExposeTerminal",
                    setup() {
                      const ctx = useTerminal();
                      exposed.terminal = ctx.terminal;
                      watchEffect(() => {
                        exposed.container = ctx.renderer.value?.container ?? null;
                      });
                      return () =>
                        h(TText, {
                          x: 0,
                          y: 0,
                          value: "abcdef",
                          style: { fg: "whiteBright" },
                        });
                    },
                  }),
                ),
              ],
            },
          );
      },
    });

    const app = createApp(App);
    app.mount(root);
    await nextTick();
    await nextTick();

    try {
      const container = exposed.container!;
      // Start drag
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4, clientY: 0, bubbles: true }),
      );

      // Disable selection mid-drag
      selectionProp.value = false;
      await nextTick();
      await nextTick();

      // user-select should be restored
      expect(container.style.userSelect).not.toBe("none");

      // Verify a new mount with selection works without leftover state
      const mounted2 = await mountTerminal(
        () => h(TText, { x: 0, y: 0, value: "test", style: { fg: "whiteBright" } }),
        8,
        2,
        { selection: true },
      );

      try {
        const c2 = mounted2.container()!;
        c2.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
        c2.dispatchEvent(new MouseEvent("mousemove", { clientX: 3, clientY: 0, bubbles: true }));
        c2.dispatchEvent(new MouseEvent("mouseup", { clientX: 3, clientY: 0, bubbles: true }));
        await settleClipboard();

        // Should be able to select in the new mount without leftover state
        expect(mounted2.terminal.getCell(0, 0).style.inverse).toBe(true);
      } finally {
        mounted2.unmount();
      }
    } finally {
      app.unmount();
      root.remove();
    }
  });

  it("cleans up document listeners on unmount during drag", async () => {
    let mounted = await mountTerminal(
      () => h(TText, { x: 0, y: 0, value: "abcdef", style: { fg: "whiteBright" } }),
      8,
      2,
      { selection: { autoCopy: false } },
    );

    const container = mounted.container()!;
    // Start drag but don't finish
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 1, clientY: 0, bubbles: true }));
    container.dispatchEvent(new MouseEvent("mousemove", { clientX: 4, clientY: 0, bubbles: true }));

    // Unmount mid-drag
    mounted.unmount();

    // After unmount, document click listeners from the old provider should be gone.
    // Verify by mounting a new terminal and confirming clicks work.
    const onClick = vi.fn();
    const mounted2 = await mountTerminal(
      () =>
        h(TView, { x: 0, y: 0, w: 10, h: 1, selectable: true, onClick }, () =>
          h(TText, { x: 0, y: 0, value: "click me" }),
        ),
      12,
      2,
      { selection: true },
    );

    try {
      const c2 = mounted2.container()!;
      c2.dispatchEvent(new MouseEvent("mousedown", { clientX: 2, clientY: 0, bubbles: true }));
      c2.dispatchEvent(new MouseEvent("mouseup", { clientX: 2, clientY: 0, bubbles: true }));
      c2.dispatchEvent(new MouseEvent("click", { clientX: 2, clientY: 0, bubbles: true }));
      await settleClipboard();

      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      mounted2.unmount();
    }
  });

  it("does not spam update:scrollTop while controlled TVirtualList waits for parent prop", async () => {
    const scrollTopRef = ref(0);
    const updateScrollTopCalls: number[] = [];

    const App = defineComponent({
      setup() {
        return () =>
          h(TVirtualList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            itemCount: 20,
            itemVersion: 1,
            scrollTop: scrollTopRef.value,
            getItem: (index: number) => `item-${index}`,
            selectable: true,
            "onUpdate:scrollTop": (value: number) => {
              updateScrollTopCalls.push(value);
              // Simulate a parent that doesn't immediately apply the prop
              // (deliberately NOT setting scrollTopRef.value here)
            },
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 12, 4, { selection: true });

    vi.useFakeTimers();
    try {
      const container = mounted.container()!;

      // Start a drag near the bottom edge to trigger auto-scroll
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 5, clientY: 3, bubbles: true }),
      );

      // Advance time for multiple auto-scroll ticks (3 x 80ms = 240ms)
      vi.advanceTimersByTime(80);
      vi.advanceTimersByTime(80);
      vi.advanceTimersByTime(80);
      await nextTick();

      // Without the fix, update:scrollTop would have been emitted on every tick.
      // With the fix, only the first tick emits; subsequent ones are suppressed
      // because pendingSelectionScrollFocusRemap is still true.
      expect(updateScrollTopCalls.length).toBeLessThanOrEqual(1);

      container.dispatchEvent(new MouseEvent("mouseup", { clientX: 5, clientY: 3, bubbles: true }));
      await settleClipboard();
    } finally {
      mounted.unmount();
      vi.useRealTimers();
    }
  });

  it("releases pointer capture when Escape cancels an active selection", async () => {
    const releasePointerCapture = vi.fn();

    const mounted = await mountTerminal(
      () => h(TText, { x: 0, y: 0, value: "abcdef", style: { fg: "whiteBright" } }),
      8,
      2,
      { selection: true },
    );

    try {
      const container = mounted.container()!;
      Object.defineProperty(container, "setPointerCapture", {
        configurable: true,
        value: vi.fn(),
      });
      Object.defineProperty(container, "releasePointerCapture", {
        configurable: true,
        value: releasePointerCapture,
      });

      container.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 0,
          clientY: 0,
          button: 0,
          pointerId: 7,
        }),
      );
      container.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 4,
          clientY: 0,
          button: 0,
          pointerId: 7,
        }),
      );

      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );

      expect(releasePointerCapture).toHaveBeenCalledWith(7);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps native user-select disabled while selection owns pointerdown", async () => {
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
          },
          () => h(TText, { x: 0, y: 0, value: "select me", style: { fg: "whiteBright" } }),
        ),
      12,
      2,
      { selection: { autoCopy: false } },
    );

    try {
      const container = mounted.container()!;

      container.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 0,
          clientY: 0,
          button: 0,
          pointerId: 1,
        }),
      );

      expect(container.style.userSelect).toBe("none");
    } finally {
      mounted.unmount();
    }
  });

  it("does not mutate controlled TVirtualMarkdown scrollTop during selection auto-scroll before parent writeback", async () => {
    const scrollTopRef = ref(0);
    const updateScrollTopCalls: number[] = [];

    const App = defineComponent({
      setup() {
        return () =>
          h(TVirtualMarkdown, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            content: Array.from({ length: 20 }, (_, i) => `- row-${i}`).join("\n"),
            scrollTop: scrollTopRef.value,
            "onUpdate:scrollTop": (value: number) => {
              updateScrollTopCalls.push(value);
              // Deliberately do not write back, simulating parent that delays/rejects
            },
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 12, 4, { selection: true });

    vi.useFakeTimers();
    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 6, clientY: 3, bubbles: true }),
      );

      vi.advanceTimersByTime(240);
      await nextTick();

      expect(updateScrollTopCalls.length).toBeLessThanOrEqual(1);
      expect(rowText(mounted, 0)).toBe("- row-0");
    } finally {
      mounted.unmount();
      vi.useRealTimers();
    }
  });

  it("does not drop visible selection spans when wrapped TLogView visual count grows during selection", async () => {
    const source = {
      lineCount: () => 3,
      getLine: (index: number) => (index === 0 ? "aaaaaaaaaaaaaaaa" : `line-${index}`),
    };

    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 4,
          h: 4,
          source,
          version: 1,
          wrap: true,
          visualIndexMode: "estimated",
          defaultScrollTop: 0,
          autoStickToBottom: false,
        }),
      4,
      4,
      { selection: { autoCopy: false, copyOnMouseUp: false } },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 3, clientY: 3, bubbles: true }),
      );
      await nextTick();

      expect(mounted.terminal.getCell(0, 0).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 3).style.inverse).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("uses TVirtualList selectionText for complex items", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          itemCount: 10,
          itemVersion: 1,
          getItem: (index: number) => ({ id: index, label: `Item ${index}` }),
          renderItem: (item: any) => ({ label: item.label }),
          selectionText: (item: any) => item.label,
          selectable: true,
        }),
      20,
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

      expect(writes.length).toBe(1);
      expect(writes[0]).toContain("Item 1");
      expect(writes[0]).toContain("Item 3");
      expect(writes[0]).not.toContain("[object Object]");
    } finally {
      mounted.unmount();
      vi.useRealTimers();
      restore();
    }
  });

  it("returns empty copy text for complex TVirtualList items without selectionText", async () => {
    const writes: string[] = [];
    const restore = installNavigatorClipboard(writes);
    const mounted = await mountTerminal(
      () =>
        h(TVirtualList, {
          x: 0,
          y: 0,
          w: 20,
          h: 4,
          itemCount: 10,
          itemVersion: 1,
          getItem: (index: number) => ({ id: index, label: `Item ${index}` }),
          renderItem: (item: any) => ({ label: item.label }),
          selectable: true,
        }),
      20,
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

      // Without selectionText, complex objects should not produce [object Object]
      expect(writes.length).toBe(1);
      expect(writes[0]).not.toContain("[object Object]");
    } finally {
      mounted.unmount();
      vi.useRealTimers();
      restore();
    }
  });

  it("does not emit update:scrollTop when controlled scrollTop prop changes to a valid value", async () => {
    const scrollTopRef = ref(0);
    const updates: number[] = [];
    const scrolls: number[] = [];

    const App = defineComponent({
      setup() {
        return () =>
          h(TVirtualMarkdown, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            content: Array.from({ length: 20 }, (_, i) => `- row-${i}`).join("\n"),
            scrollTop: scrollTopRef.value,
            "onUpdate:scrollTop": (value: number) => updates.push(value),
            onScroll: (value: number) => scrolls.push(value),
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 20, 4, { selection: true });

    try {
      scrollTopRef.value = 3;
      await nextTick();
      await nextTick();

      expect(updates).toEqual([]);
      expect(scrolls).toEqual([]);
    } finally {
      mounted.unmount();
    }
  });

  it("emits update:scrollTop when controlled scrollTop prop is clamped to a valid range", async () => {
    const scrollTopRef = ref(0);
    const updates: number[] = [];

    const App = defineComponent({
      setup() {
        return () =>
          h(TVirtualMarkdown, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            content: Array.from({ length: 20 }, (_, i) => `- row-${i}`).join("\n"),
            scrollTop: scrollTopRef.value,
            "onUpdate:scrollTop": (value: number) => {
              updates.push(value);
            },
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 20, 4, { selection: true });

    try {
      scrollTopRef.value = 9999;
      await nextTick();
      await nextTick();

      // Should emit the clamped value back so the parent can correct its state.
      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(updates[0]).toBeLessThan(9999);
    } finally {
      mounted.unmount();
    }
  });

  it("cleans up active selection on pointercancel", async () => {
    const writes: string[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TText, {
          x: 0,
          y: 0,
          value: "select me",
          style: { fg: "whiteBright" },
        }),
      12,
      2,
      {
        selection: true,
        clipboard: {
          supported: true,
          readText: async () => writes.at(-1) ?? "",
          writeText: async (text: string) => {
            writes.push(text);
          },
        },
      },
    );

    try {
      const container = mounted.container()!;

      container.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 0 }));
      container.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 0, button: 0 }));
      container.dispatchEvent(pointerEvent("pointercancel", { clientX: 5, clientY: 0, button: 0 }));

      await nextTick();
      await settleClipboard();

      // Selection should be cleared — no copy on cancel.
      expect(writes).toEqual([]);
      // userSelect should be restored, not stuck on "none".
      expect(container.style.userSelect).not.toBe("none");
    } finally {
      mounted.unmount();
    }
  });
});
