import type { ClipboardApi } from "../src/runtime/index.js";
import type { TerminalSelectionRange } from "../src/selection/terminal-selection.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminal } from "../src/core/index.js";
import { getPlaneTerminal } from "../src/core/terminal/create-terminal.js";
import { createTerminalSelectionController } from "../src/selection/terminal-selection.js";

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
});
