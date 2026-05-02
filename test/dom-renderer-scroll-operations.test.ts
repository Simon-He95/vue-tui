import { describe, expect, it } from "vitest";
import { getPlaneTerminal, scrollPlaneRows } from "../src/core/terminal/create-terminal.js";
import { createDomRenderer, createTerminal } from "../src/index.js";

function lineEls(container: HTMLElement, plane = "default"): HTMLElement[] {
  const layer = container.querySelector(`[data-vt-plane="${plane}"]`);
  const lines = layer?.children[0]?.children;
  return lines ? (Array.from(lines) as HTMLElement[]) : [];
}

function rowText(container: HTMLElement, y: number, plane = "default"): string {
  return lineEls(container, plane)[y]?.textContent?.trimEnd() ?? "";
}

describe("DomRenderer scrollOperations", () => {
  it("shifts DOM line nodes and sync-flushes only exposed rows", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    let rafCalls = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCalls++;
      cb(0);
      return rafCalls;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    const terminal = createTerminal({ cols: 8, rows: 4 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    try {
      for (let y = 0; y < 4; y++) terminal.write(`item-${y}`, { x: 0, y });
      terminal.commit({ planes: ["default"], sync: true });
      const before = lineEls(container);
      rafCalls = 0;

      scrollPlaneRows(terminal, "default", 0, 4, 1);
      terminal.write("item-4", { x: 0, y: 3 });
      const dirtyRows = terminal.commit({ planes: ["default"], sync: true });

      expect(dirtyRows).toEqual([3]);
      expect(rafCalls).toBe(0);
      expect(lineEls(container)[0]).toBe(before[1]);
      expect(lineEls(container)[3]).toBe(before[0]);
      expect([0, 1, 2, 3].map((y) => rowText(container, y))).toEqual([
        "item-1",
        "item-2",
        "item-3",
        "item-4",
      ]);
      expect(renderer.debugStats.flush.last).toMatchObject({
        mode: "sync",
        planeRows: 1,
        planes: 1,
      });

      scrollPlaneRows(terminal, "default", 0, 4, 1);
      terminal.write("item-5", { x: 0, y: 3 });
      terminal.commit({ planes: ["default"], sync: true });

      expect([0, 1, 2, 3].map((y) => rowText(container, y))).toEqual([
        "item-2",
        "item-3",
        "item-4",
        "item-5",
      ]);
      expect(renderer.debugStats.flush.last).toMatchObject({
        mode: "sync",
        planeRows: 1,
        planes: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("shifts DOM line nodes downward for negative scroll delta", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    try {
      for (let y = 0; y < 4; y++) terminal.write(`item-${y}`, { x: 0, y });
      terminal.commit({ planes: ["default"], sync: true });
      const before = lineEls(container);

      scrollPlaneRows(terminal, "default", 0, 4, -1);
      terminal.write("new", { x: 0, y: 0 });
      const dirtyRows = terminal.commit({ planes: ["default"], sync: true });

      expect(dirtyRows).toEqual([0]);
      expect(lineEls(container)[1]).toBe(before[0]);
      expect(lineEls(container)[3]).toBe(before[2]);
      expect([0, 1, 2, 3].map((y) => rowText(container, y))).toEqual([
        "new",
        "item-0",
        "item-1",
        "item-2",
      ]);
      expect(renderer.debugStats.flush.last).toMatchObject({
        mode: "sync",
        planeRows: 1,
        planes: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("falls back to repainting the scroll range when scrollOperations are disabled", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container, {
      enableScrollOperations: false,
    });

    try {
      expect(renderer.capabilities.scrollOperations).toBe(false);
      for (let y = 0; y < 4; y++) terminal.write(`item-${y}`, { x: 0, y });
      terminal.commit({ planes: ["default"], sync: true });

      scrollPlaneRows(terminal, "default", 0, 4, 1);
      terminal.write("item-4", { x: 0, y: 3 });
      const dirtyRows = terminal.commit({ planes: ["default"], sync: true });

      expect(dirtyRows).toEqual([3]);
      expect([0, 1, 2, 3].map((y) => rowText(container, y))).toEqual([
        "item-1",
        "item-2",
        "item-3",
        "item-4",
      ]);
      expect(renderer.debugStats.flush.last).toMatchObject({
        mode: "sync",
        planeRows: 4,
        planes: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("falls back to repainting the affected range when pending rows overlap", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const callbacks = new Map<number, FrameRequestCallback>();
    let rafId = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = ++rafId;
      callbacks.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      callbacks.delete(id);
    }) as typeof cancelAnimationFrame;

    const terminal = createTerminal({ cols: 8, rows: 4 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    try {
      Array.from(callbacks.values()).forEach((cb) => cb(0));
      callbacks.clear();
      for (let y = 0; y < 4; y++) terminal.write(`row-${y}`, { x: 0, y });
      terminal.commit({ planes: ["default"], sync: true });
      callbacks.clear();

      terminal.write("pend-1", { x: 0, y: 1 });
      terminal.commit({ planes: ["default"] });
      expect(rowText(container, 1)).toBe("row-1");

      scrollPlaneRows(terminal, "default", 0, 4, 1);
      terminal.write("row-4", { x: 0, y: 3 });
      terminal.commit({ planes: ["default"], sync: true });

      expect(callbacks.size).toBe(0);
      expect([0, 1, 2, 3].map((y) => rowText(container, y))).toEqual([
        "pend-1",
        "row-2",
        "row-3",
        "row-4",
      ]);
      expect(renderer.debugStats.flush.last).toMatchObject({
        mode: "sync",
        planeRows: 4,
        planes: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("only shifts active planes from the commit", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    try {
      for (let y = 0; y < 4; y++) {
        terminal.write(`def-${y}`, { x: 0, y });
        overlay.write(`ovr-${y}`, { x: 0, y });
      }
      terminal.commit({ sync: true });
      const defaultBefore = lineEls(container, "default");
      const overlayBefore = lineEls(container, "overlay");

      scrollPlaneRows(terminal, "overlay", 0, 4, 1);
      overlay.write("ovr-4", { x: 0, y: 3 });
      terminal.commit({ planes: ["overlay"], sync: true });

      expect(lineEls(container, "default")[0]).toBe(defaultBefore[0]);
      expect(lineEls(container, "overlay")[0]).toBe(overlayBefore[1]);
      expect([0, 1, 2, 3].map((y) => rowText(container, y, "default"))).toEqual([
        "def-0",
        "def-1",
        "def-2",
        "def-3",
      ]);
      expect([0, 1, 2, 3].map((y) => rowText(container, y, "overlay"))).toEqual([
        "ovr-1",
        "ovr-2",
        "ovr-3",
        "ovr-4",
      ]);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps DOM output correct when commit omits planes and scrollOperations are present", () => {
    const terminal = createTerminal({ cols: 8, rows: 4 });
    const overlay = getPlaneTerminal(terminal, "overlay");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    try {
      for (let y = 0; y < 4; y++) {
        terminal.write(`def-${y}`, { x: 0, y });
        overlay.write(`ovr-${y}`, { x: 0, y });
      }
      terminal.commit({ sync: true });

      scrollPlaneRows(terminal, "overlay", 0, 4, 1);
      overlay.write("ovr-4", { x: 0, y: 3 });
      terminal.commit({ sync: true });

      expect([0, 1, 2, 3].map((y) => rowText(container, y, "default"))).toEqual([
        "def-0",
        "def-1",
        "def-2",
        "def-3",
      ]);
      expect([0, 1, 2, 3].map((y) => rowText(container, y, "overlay"))).toEqual([
        "ovr-1",
        "ovr-2",
        "ovr-3",
        "ovr-4",
      ]);
      expect(renderer.debugStats.flush.last).toMatchObject({
        mode: "sync",
        planeRows: 16,
        planes: 4,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });
});
