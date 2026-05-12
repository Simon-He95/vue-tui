import type { ClipboardApi } from "../src/runtime/index.js";
import type { SelectionTextProvider, TerminalSelectionRange } from "../src/selection/terminal-selection.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminal } from "../src/core/index.js";
import { getPlaneTerminal } from "../src/core/terminal/create-terminal.js";
import { createTerminalSelectionController, terminalSelectionVisibleRowSpans } from "../src/selection/terminal-selection.js";

function memoryClipboard(options?: { supported?: boolean; fail?: boolean }) {
  const writes: string[] = [];
  const api: ClipboardApi = {
    supported: options?.supported ?? true,
    async readText() {
      return writes[writes.length - 1] ?? "";
    },
    async writeText(text: string) {
      if (options?.fail) throw new Error("denied");
      writes.push(text);
    },
  };
  return { api, writes };
}

describe("terminal selection", () => {
  it("copies a linear row selection on finish", async () => {
    const terminal = createTerminal({ cols: 12, rows: 3 });
    terminal.write("0123456789", { x: 0, y: 1, style: { fg: "whiteBright" } });
    const clipboard = memoryClipboard();
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
    });

    selection.start({ x: 2, y: 1 });
    selection.update({ x: 8, y: 1 });

    expect(selection.state.value.text).toBe("");
    expect(selection.state.value.hasRange).toBe(true);

    await selection.finish();

    expect(selection.state.value.text).toBe("2345678");
    expect(clipboard.writes).toEqual(["2345678"]);
  });

  it("clears an empty click selection on finish", async () => {
    const terminal = createTerminal({ cols: 12, rows: 3 });
    terminal.write("0123456789", { x: 0, y: 1, style: { fg: "whiteBright" } });
    const clipboard = memoryClipboard();
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
    });

    selection.start({ x: 2, y: 1 });
    await selection.finish();

    expect(selection.state.value.active).toBe(false);
    expect(selection.state.value.text).toBe("");
    expect(clipboard.writes).toEqual([]);
  });

  it("copies multi-line selections without terminal padding", async () => {
    const terminal = createTerminal({ cols: 8, rows: 3 });
    terminal.write("abc", { x: 0, y: 0 });
    terminal.write("defgh", { x: 0, y: 1 });
    const clipboard = memoryClipboard();
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
    });

    selection.start({ x: 1, y: 0 });
    selection.update({ x: 2, y: 1 });
    await selection.finish();

    expect(clipboard.writes).toEqual(["bc\ndef"]);
  });

  it("extends from the existing anchor", async () => {
    const terminal = createTerminal({ cols: 10, rows: 3 });
    terminal.write("0123456789", { x: 0, y: 0 });
    terminal.write("abcdef", { x: 0, y: 1 });
    const clipboard = memoryClipboard();
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
    });

    selection.start({ x: 2, y: 0 });
    selection.update({ x: 4, y: 0 });
    selection.start({ x: 1, y: 1 }, { extend: true });

    expect(selection.state.value.anchor).toEqual({ x: 2, y: 0 });
    expect(selection.state.value.focus).toEqual({ x: 1, y: 1 });
    expect(selection.state.value.text).toBe("");
    expect(selection.state.value.hasRange).toBe(true);

    await selection.finish();

    expect(selection.state.value.text).toBe("23456789\nab");
  });

  it("uses text provider points when viewport content scrolls during selection", async () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    const clipboard = memoryClipboard();
    let sourceTop = 0;
    const sourceRows = Array.from({ length: 10 }, (_, index) => `row-${index}`);
    const getText = vi.fn((range: TerminalSelectionRange) => {
      const start = Math.min(range.anchor.y, range.focus.y);
      const end = Math.max(range.anchor.y, range.focus.y);
      return sourceRows.slice(start, end + 1).join("\n");
    });
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
      getTextProviders: () => [
        {
          id: "source",
          rect: { x: 0, y: 0, w: 8, h: 4 },
          canHandle: () => false,
          pointForCell: (point) => ({ x: point.x, y: sourceTop + point.y }),
          getText,
        },
      ],
    });

    selection.start({ x: 0, y: 1 });
    sourceTop = 1;
    selection.update({ x: 3, y: 3 });

    expect(getText).not.toHaveBeenCalled();

    await selection.finish();

    expect(getText).toHaveBeenCalledTimes(1);
    expect(selection.state.value.text).toBe("row-1\nrow-2\nrow-3\nrow-4");
  });

  it("tracks provider ranges even when the viewport cell does not change", async () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    const clipboard = memoryClipboard();
    let sourceTop = 0;
    const getText = vi.fn((range: TerminalSelectionRange) => {
      const start = Math.min(range.anchor.y, range.focus.y);
      const end = Math.max(range.anchor.y, range.focus.y);
      return Array.from({ length: end - start + 1 }, (_, index) => `row-${start + index}`).join(
        "\n",
      );
    });
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
      getTextProviders: () => [
        {
          id: "source",
          rect: { x: 0, y: 0, w: 8, h: 4 },
          canHandle: () => false,
          pointForCell: (point) => ({ x: point.x, y: sourceTop + point.y }),
          getText,
        },
      ],
    });

    selection.start({ x: 0, y: 1 });
    sourceTop = 1;
    selection.update({ x: 0, y: 1 });

    expect(selection.state.value.hasRange).toBe(true);
    expect(getText).not.toHaveBeenCalled();

    await selection.finish();

    expect(getText).toHaveBeenCalledTimes(1);
    expect(selection.state.value.text).toBe("row-1\nrow-2");
  });

  it("reports unsupported clipboard without throwing", async () => {
    const terminal = createTerminal({ cols: 6, rows: 1 });
    terminal.write("abcdef", { x: 0, y: 0 });
    const clipboard = memoryClipboard({ supported: false });
    const copies: unknown[] = [];
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
      onCopy: (payload) => copies.push(payload),
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 2, y: 0 });

    await expect(selection.finish()).resolves.toBeUndefined();
    expect(clipboard.writes).toEqual([]);
    expect(copies).toMatchObject([{ text: "abc", ok: false }]);
  });

  it("paints and clears the overlay rows", () => {
    const terminal = createTerminal({ cols: 6, rows: 1 });
    terminal.write("abcdef", { x: 0, y: 0, style: { fg: "whiteBright" } });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
    });

    selection.start({ x: 1, y: 0 });
    selection.update({ x: 3, y: 0 });
    selection.paint();
    terminal.commit({ planes: ["overlay"], sync: true });

    expect(terminal.getCell(1, 0).style.inverse).toBe(true);
    expect(terminal.getCell(3, 0).style.inverse).toBe(true);
    expect(terminal.getCell(4, 0).style.inverse).toBeUndefined();

    selection.clear();
    overlay.clear(0, 0, 6, 1);
    selection.paint([0]);
    terminal.commit({ planes: ["overlay"], sync: true });

    expect(terminal.getCell(1, 0).style.inverse).toBeUndefined();
  });

  it("does not preserve link href on overlay selection cells", () => {
    const terminal = createTerminal({ cols: 6, rows: 1 });
    terminal.write("abcdef", {
      x: 0,
      y: 0,
      style: { fg: "cyanBright", href: "https://example.com", underline: true },
    });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
    });

    selection.start({ x: 1, y: 0 });
    selection.update({ x: 3, y: 0 });
    selection.paint();
    terminal.commit({ planes: ["overlay"], sync: true });

    expect(terminal.getCell(1, 0).style.href).toBeUndefined();
    expect(terminal.getCell(1, 0).style.underline).toBe(true);
    expect(terminal.getCell(1, 0).style.inverse).toBe(true);
    expect(terminal.getCell(4, 0).style.href).toBe("https://example.com");
  });

  it("uses provider getVisibleSpans when available for overlay highlight", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    terminal.write("aaa", { x: 0, y: 0 });
    terminal.write("bbb", { x: 0, y: 1 });
    terminal.write("ccc", { x: 0, y: 2 });
    terminal.write("ddd", { x: 0, y: 3 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();
    let sourceTop = 0;
    const getVisibleSpans = vi.fn(
      (
        _providerRange: TerminalSelectionRange,
        _screenRange: TerminalSelectionRange,
      ) => {
        // Simulate a virtual scroll where the provider knows which rows
        // are currently visible. Return only rows that are in the viewport.
        const spans: Array<{ y: number; x0: number; x1: number }> = [];
        // After scroll, visible range is sourceTop..sourceTop+3
        // If selection covers source rows 1-4, only visible portion should be highlighted
        for (let i = sourceTop; i < sourceTop + 4; i++) {
          if (i >= 1 && i <= 4) {
            spans.push({ y: i - sourceTop, x0: 0, x1: 3 });
          }
        }
        return spans;
      },
    );
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
      getTextProviders: () => [
        {
          id: "source",
          rect: { x: 0, y: 0, w: 8, h: 4 },
          canHandle: () => false,
          pointForCell: (point) => ({ x: point.x, y: sourceTop + point.y }),
          getText: () => "text",
          getVisibleSpans,
        },
      ],
    });

    // Start selection at screen row 1
    selection.start({ x: 0, y: 1 });
    // Scroll: sourceTop moves to 1
    sourceTop = 1;
    // Update focus at screen row 3
    selection.update({ x: 3, y: 3 });

    // getVisibleSpans should have been called because the provider has it
    expect(getVisibleSpans).toHaveBeenCalled();

    selection.paint();
    terminal.commit({ planes: ["overlay"], sync: true });

    // After scroll, the visible rows should be highlighted correctly.
    // With sourceTop=1, the visible rows are source rows 1-4.
    // Row 0 (screen y=0) maps to source row 1, which IS in the selection range.
    expect(terminal.getCell(0, 0).style.inverse).toBe(true);
  });

  it("falls back to terminal buffer spans when provider has no getVisibleSpans", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    terminal.write("aaa", { x: 0, y: 0 });
    terminal.write("bbb", { x: 0, y: 1 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();
    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
      getTextProviders: () => [
        {
          id: "source",
          rect: { x: 0, y: 0, w: 8, h: 4 },
          canHandle: () => false,
          pointForCell: (point) => ({ x: point.x, y: point.y }),
          getText: () => "text",
          // No getVisibleSpans - should fall back to terminal buffer spans
        },
      ],
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 3, y: 1 });
    selection.paint();
    terminal.commit({ planes: ["overlay"], sync: true });

    // Standard terminal buffer overlay should work
    expect(terminal.getCell(0, 0).style.inverse).toBe(true);
    expect(terminal.getCell(0, 1).style.inverse).toBe(true);
  });

  it("computes visible spans without materializing the full selected range", () => {
    const spans = terminalSelectionVisibleRowSpans(
      {
        anchor: { x: 0, y: 10 },
        focus: { x: 5, y: 9000 },
        mode: "linear",
      },
      80,
      10_000,
      500,
      524,
    );

    expect(spans.length).toBeLessThanOrEqual(24);
    expect(spans[0]?.y).toBe(500);
    expect(spans.at(-1)?.y).toBe(523);
  });

  it("passes provider-space range to provider getText when resolved via canHandle", async () => {
    const terminal = createTerminal({ cols: 10, rows: 5 });
    const clipboard = memoryClipboard();

    const received: TerminalSelectionRange[] = [];

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
      getTextProviders: () => [
        {
          id: "provider",
          rect: { x: 0, y: 0, w: 10, h: 5 },
          canHandle: () => true,
          pointForCell: (point) => ({ x: point.x, y: point.y + 100 }),
          getText: (range) => {
            received.push(range);
            return "ok";
          },
        },
      ],
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 2, y: 1 });
    await selection.finish();

    expect(received[0]).toMatchObject({
      anchor: { x: 0, y: 100 },
      focus: { x: 2, y: 101 },
    });
  });

  it("clears active selection when its provider unregisters", async () => {
    const terminal = createTerminal({ cols: 10, rows: 4 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();

    const providers: SelectionTextProvider[] = [
      {
        id: "source",
        rect: { x: 0, y: 0, w: 10, h: 4 },
        canHandle: () => true,
        pointForCell: (point) => ({ x: point.x, y: point.y + 100 }),
        getText: () => "provider text",
      },
    ];

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
      getTextProviders: () => providers,
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 4, y: 1 });

    expect(selection.state.value.active).toBe(true);
    expect(selection.state.value.hasRange).toBe(true);

    // Simulate provider unregister.
    providers.length = 0;
    selection.clearProvider("source");

    expect(selection.state.value.active).toBe(false);
    expect(selection.state.value.hasRange).toBe(false);
  });

  it("does not clear selection when an unrelated provider unregisters", async () => {
    const terminal = createTerminal({ cols: 10, rows: 4 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();

    const providers: SelectionTextProvider[] = [
      {
        id: "source",
        rect: { x: 0, y: 0, w: 10, h: 4 },
        canHandle: () => true,
        pointForCell: (point) => ({ x: point.x, y: point.y + 100 }),
        getText: () => "provider text",
      },
    ];

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
      getTextProviders: () => providers,
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 4, y: 1 });

    expect(selection.state.value.active).toBe(true);

    // Unregister an unrelated provider.
    selection.clearProvider("other");

    expect(selection.state.value.active).toBe(true);
    expect(selection.state.value.hasRange).toBe(true);
  });

  it("clears overlay highlight when provider unregisters", () => {
    const terminal = createTerminal({ cols: 10, rows: 2 });
    terminal.write("abcdefghij", { x: 0, y: 0, style: { fg: "whiteBright" } });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();

    const providers: SelectionTextProvider[] = [
      {
        id: "source",
        rect: { x: 0, y: 0, w: 10, h: 2 },
        canHandle: () => true,
        pointForCell: (point) => ({ x: point.x, y: point.y + 100 }),
        getText: () => "provider text",
      },
    ];

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
      getTextProviders: () => providers,
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 4, y: 0 });
    selection.paint();
    terminal.commit({ planes: ["overlay"], sync: true });

    // Verify overlay is applied
    expect(terminal.getCell(0, 0).style.inverse).toBe(true);
    expect(terminal.getCell(4, 0).style.inverse).toBe(true);

    // Simulate provider unregister — should clear selection and dirty rows.
    providers.length = 0;
    selection.clearProvider("source");

    // Clear overlay and repaint to verify highlight is removed.
    overlay.clear(0, 0, 10, 2);
    selection.paint([0]);
    terminal.commit({ planes: ["overlay"], sync: true });

    expect(terminal.getCell(0, 0).style.inverse).toBeUndefined();
    expect(terminal.getCell(4, 0).style.inverse).toBeUndefined();
  });

  it("does not resolve provider text on finish when autoCopy is disabled", async () => {
    const terminal = createTerminal({ cols: 10, rows: 5 });
    const clipboard = memoryClipboard();
    const getText = vi.fn(() => "large text");

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
      getOptions: () => ({ autoCopy: false, copyOnMouseUp: false }),
      getTextProviders: () => [
        {
          id: "provider",
          rect: { x: 0, y: 0, w: 10, h: 5 },
          canHandle: () => true,
          pointForCell: (p: any) => p,
          getText,
        },
      ],
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 5, y: 3 });
    await selection.finish();

    expect(getText).not.toHaveBeenCalled();
    expect(selection.state.value.text).toBe("");
    expect(clipboard.writes).toEqual([]);

    // Explicit copy() should still resolve text lazily
    await selection.copy();

    expect(getText).toHaveBeenCalledTimes(1);
    expect(clipboard.writes).toEqual(["large text"]);
  });

  it("does not resolve provider text on finish when copyOnMouseUp is false", async () => {
    const terminal = createTerminal({ cols: 10, rows: 5 });
    const clipboard = memoryClipboard();
    const getText = vi.fn(() => "large text");

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
      getOptions: () => ({ autoCopy: true, copyOnMouseUp: false }),
      getTextProviders: () => [
        {
          id: "provider",
          rect: { x: 0, y: 0, w: 10, h: 5 },
          canHandle: () => true,
          pointForCell: (p: any) => p,
          getText,
        },
      ],
    });

    selection.start({ x: 0, y: 0 });
    selection.update({ x: 5, y: 3 });
    await selection.finish();

    expect(getText).not.toHaveBeenCalled();
    expect(selection.state.value.text).toBe("");
    expect(clipboard.writes).toEqual([]);
  });

  it("clears selection with no hasRange on finish even when autoCopy is disabled", async () => {
    const terminal = createTerminal({ cols: 10, rows: 5 });
    const clipboard = memoryClipboard();

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: getPlaneTerminal(terminal, "overlay"),
      clipboard: clipboard.api,
      getOptions: () => ({ autoCopy: false, copyOnMouseUp: false }),
    });

    selection.start({ x: 3, y: 2 });
    // No update — anchor === focus means no range
    await selection.finish();

    expect(selection.state.value.active).toBe(false);
  });

  it("clears previous overlay when provider visible spans become empty after scroll", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    terminal.write("row0", { x: 0, y: 0 });
    terminal.write("row1", { x: 0, y: 1 });

    const overlay = getPlaneTerminal(terminal, "overlay");
    const clipboard = memoryClipboard();

    let visible = true;

    const selection = createTerminalSelectionController({
      terminal,
      overlayTerminal: overlay,
      clipboard: clipboard.api,
      getTextProviders: () => [
        {
          id: "source",
          rect: { x: 0, y: 0, w: 8, h: 4 },
          canHandle: () => true,
          pointForCell: (point) => point,
          getText: () => "text",
          getVisibleSpans: () => visible ? [{ y: 1, x0: 0, x1: 4 }] : [],
        },
      ],
    });

    selection.start({ x: 0, y: 1 });
    selection.update({ x: 3, y: 1 });
    selection.paint();
    terminal.commit({ planes: ["overlay"], sync: true });

    expect(terminal.getCell(0, 1).style.inverse).toBe(true);

    visible = false;
    selection.refresh();

    overlay.clear(0, 0, 8, 4);
    selection.paint([1]);
    terminal.commit({ planes: ["overlay"], sync: true });

    expect(terminal.getCell(0, 1).style.inverse).toBeUndefined();
  });
});
