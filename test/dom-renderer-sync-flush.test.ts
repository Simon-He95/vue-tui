import { describe, expect, it, vi } from "vitest";
import { getPlaneTerminal } from "../src/core/terminal/create-terminal.js";
import { createDomRenderer, createTerminal } from "../src/index.js";

function rowText(container: HTMLElement, y: number, plane = "default"): string {
  // The DOM renderer structures: container > [data-vt-plane] > contentEl > line divs
  const defaultPlane = container.querySelector(`[data-vt-plane="${plane}"]`);
  if (!defaultPlane) return "";
  const lines = defaultPlane.children[0]?.children;
  if (!lines || y >= lines.length) return "";
  return (lines[y] as HTMLElement).textContent ?? "";
}

describe("DomRenderer sync flush", () => {
  it("flushes small sync commits within budget without scheduling rAF", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    let rafCalls = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCalls++;
      cb(0);
      return rafCalls;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    try {
      const terminal = createTerminal({ cols: 4, rows: 1 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      rafCalls = 0;

      terminal.write("A", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      expect(rafCalls).toBe(0);
      expect(container.textContent).toContain("A");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("keeps normal commits deferred to rAF", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    let rafCalls = 0;
    let pending: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCalls++;
      pending = cb;
      return rafCalls;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    try {
      const terminal = createTerminal({ cols: 4, rows: 1 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      pending?.(0);
      rafCalls = 0;
      pending = null;

      terminal.write("B", { x: 0, y: 0 });
      terminal.commit();

      expect(rafCalls).toBe(1);
      expect(container.textContent).not.toContain("B");
      pending?.(0);
      expect(container.textContent).toContain("B");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("cancels a pending rAF before sync flush", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const callbacks = new Map<number, FrameRequestCallback>();
    const canceled = new Set<number>();
    let rafId = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = ++rafId;
      callbacks.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      canceled.add(id);
      callbacks.delete(id);
    }) as typeof cancelAnimationFrame;

    try {
      const terminal = createTerminal({ cols: 4, rows: 1 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      callbacks.get(1)?.(0);
      callbacks.clear();
      canceled.clear();

      terminal.write("A", { x: 0, y: 0 });
      terminal.commit();
      expect(callbacks.has(2)).toBe(true);

      terminal.write("B", { x: 1, y: 0 });
      terminal.commit({ sync: true });
      expect(canceled.has(2)).toBe(true);
      expect(container.textContent).toContain("AB");

      terminal.write("C", { x: 2, y: 0 });
      terminal.commit();
      expect(callbacks.size).toBe(1);
      const next = Array.from(callbacks.values())[0]!;
      next(0);
      expect(container.textContent).toContain("ABC");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("sync commit does not flush unrelated pending rows", () => {
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

    try {
      const terminal = createTerminal({ cols: 4, rows: 4 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      // Flush initial commit
      callbacks.get(1)?.(0);
      callbacks.clear();

      // Normal commit: fill all rows — pending but rAF not yet run
      for (let y = 0; y < 4; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit();
      // rAF id 2 is now pending but not yet executed

      // Sync commit: only update row 0
      terminal.write("B", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      // Row 0 was in the sync scope and should be flushed immediately
      expect(rowText(container, 0)).toContain("B");

      // Rows 1-3 should remain pending (not forced sync)
      expect(rowText(container, 1)).not.toContain("A");
      expect(rowText(container, 2)).not.toContain("A");
      expect(rowText(container, 3)).not.toContain("A");

      // A new rAF should be scheduled for the remaining pending rows
      expect(callbacks.size).toBeGreaterThanOrEqual(1);

      // Execute the pending rAF — rows 1-3 should now be rendered
      const remaining = Array.from(callbacks.values())[0]!;
      remaining(0);
      expect(rowText(container, 1)).toContain("A");
      expect(rowText(container, 2)).toContain("A");
      expect(rowText(container, 3)).toContain("A");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("sync commit flushes overlapping pending row and keeps other rows pending", () => {
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

    try {
      const terminal = createTerminal({ cols: 4, rows: 3 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      callbacks.get(1)?.(0);
      callbacks.clear();

      for (let y = 0; y < 3; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit();

      terminal.write("B", { x: 0, y: 1 });
      terminal.commit({ sync: true });

      expect(rowText(container, 1)).toContain("B");
      expect(rowText(container, 0)).not.toContain("A");
      expect(rowText(container, 2)).not.toContain("A");

      const remaining = Array.from(callbacks.values())[0]!;
      remaining(0);
      expect(rowText(container, 0)).toContain("A");
      expect(rowText(container, 2)).toContain("A");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("consecutive sync commits do not starve pending normal rows", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const callbacks = new Map<number, FrameRequestCallback>();
    const canceled = new Set<number>();
    let rafId = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = ++rafId;
      callbacks.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      canceled.add(id);
      callbacks.delete(id);
    }) as typeof cancelAnimationFrame;

    try {
      const terminal = createTerminal({ cols: 4, rows: 4 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      // Flush initial commit
      callbacks.get(1)?.(0);
      callbacks.clear();

      // Normal commit: fill all rows with "A" — pending but rAF not yet run
      for (let y = 0; y < 4; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit();
      const normalRafId = rafId;

      for (let i = 0; i < 50; i++) {
        terminal.write(String(i % 10), { x: 0, y: 0 });
        terminal.commit({ sync: true });
      }
      expect(rowText(container, 0)).toContain("9");

      // Rows 1-3 should still be pending and the original rAF should remain scheduled.
      expect(rowText(container, 1)).not.toContain("A");
      expect(rowText(container, 2)).not.toContain("A");
      expect(rowText(container, 3)).not.toContain("A");
      expect(canceled.has(normalRafId)).toBe(false);
      expect(callbacks.has(normalRafId)).toBe(true);

      // Execute pending rAF — all rows should now be rendered
      const remaining = callbacks.get(normalRafId)!;
      remaining(0);
      expect(rowText(container, 1)).toContain("A");
      expect(rowText(container, 2)).toContain("A");
      expect(rowText(container, 3)).toContain("A");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("refresh clears pending rows and cancels pending rAF", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const callbacks = new Map<number, FrameRequestCallback>();
    const canceled = new Set<number>();
    let rafId = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = ++rafId;
      callbacks.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      canceled.add(id);
      callbacks.delete(id);
    }) as typeof cancelAnimationFrame;

    try {
      const terminal = createTerminal({ cols: 4, rows: 3 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      callbacks.get(1)?.(0);
      callbacks.clear();

      for (let y = 0; y < 3; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit();
      const normalRafId = rafId;
      expect(callbacks.has(normalRafId)).toBe(true);

      renderer.refresh();

      expect(canceled.has(normalRafId)).toBe(true);
      expect(callbacks.has(normalRafId)).toBe(false);
      expect(rowText(container, 2)).toContain("A");

      terminal.write("B", { x: 0, y: 0 });
      terminal.commit({ sync: true });

      expect(rowText(container, 0)).toContain("B");
      expect(callbacks.size).toBe(0);

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("defers large sync full repaint and warns in debug perf mode", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const previousDebugPerf = (globalThis as any).__VT_DEBUG_PERF__;
    let pending: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      pending = cb;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const terminal = createTerminal({ cols: 4, rows: 40 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      pending?.(0);

      for (let y = 0; y < 40; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit({ sync: true });
      expect(rowText(container, 39)).not.toContain("A");
      pending?.(0);
      expect(rowText(container, 39)).toContain("A");

      (globalThis as any).__VT_DEBUG_PERF__ = true;
      terminal.clear();
      terminal.commit({ sync: true });

      expect(warn).toHaveBeenCalledWith(
        "[vue-tui] sync DOM flush request deferred to rAF: rows=40 maxRows=32 cols=4 planes=4 cells=640 maxCells=4096",
      );
      expect(rowText(container, 39)).toContain("A");
      pending?.(0);
      expect(rowText(container, 39)).not.toContain("A");

      renderer.dispose();
      container.remove();
    } finally {
      warn.mockRestore();
      (globalThis as any).__VT_DEBUG_PERF__ = previousDebugPerf;
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("rate limits large sync flush warnings", () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const previousDebugPerf = (globalThis as any).__VT_DEBUG_PERF__;
    const dateNow = vi.spyOn(Date, "now");
    let now = 1_000;
    dateNow.mockImplementation(() => now);
    let pending: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      pending = cb;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      (globalThis as any).__VT_DEBUG_PERF__ = true;
      const terminal = createTerminal({ cols: 4, rows: 40 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      pending?.(0);

      terminal.clear();
      terminal.commit({ sync: true });
      terminal.fill(0, 0, 4, 40, "A");
      terminal.commit({ sync: true });

      expect(warn).toHaveBeenCalledTimes(1);

      now += 1_001;
      terminal.clear();
      terminal.commit({ sync: true });

      expect(warn).toHaveBeenCalledTimes(2);

      renderer.dispose();
      container.remove();
    } finally {
      warn.mockRestore();
      dateNow.mockRestore();
      (globalThis as any).__VT_DEBUG_PERF__ = previousDebugPerf;
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("sync flush budget accounts for active plane count", () => {
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

    try {
      const terminal = createTerminal({ cols: 200, rows: 6 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      callbacks.get(1)?.(0);
      callbacks.clear();

      for (let y = 0; y < 6; y++) terminal.fill(0, y, 200, 1, "A");
      terminal.commit({ sync: true });

      expect(rowText(container, 5)).not.toContain("A");
      expect(callbacks.size).toBeGreaterThanOrEqual(1);
      Array.from(callbacks.values())[0]?.(0);
      callbacks.clear();
      expect(rowText(container, 5)).toContain("A");

      for (let y = 0; y < 6; y++) terminal.fill(0, y, 200, 1, "B");
      terminal.commit({ planes: ["default"], sync: true });

      expect(rowText(container, 5)).toContain("B");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("uses configured sync flush budget", () => {
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

    try {
      const terminal = createTerminal({ cols: 4, rows: 2 });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container, {
        syncFlushMaxRows: 1,
        syncFlushCellBudget: 16,
      });
      callbacks.get(1)?.(0);
      callbacks.clear();

      terminal.fill(0, 0, 4, 2, "A");
      terminal.commit({ sync: true });

      expect(rowText(container, 1)).not.toContain("A");
      expect(callbacks.size).toBeGreaterThanOrEqual(1);
      Array.from(callbacks.values())[0]?.(0);
      expect(rowText(container, 1)).toContain("A");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("sync commit flushes only active planes and leaves other planes pending", () => {
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

    try {
      const terminal = createTerminal({ cols: 4, rows: 1 });
      const overlay = getPlaneTerminal(terminal, "overlay");
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = createDomRenderer(terminal, container);
      callbacks.get(1)?.(0);
      callbacks.clear();

      terminal.write("D", { x: 0, y: 0 });
      terminal.commit({ planes: ["default"] });
      overlay.write("O", { x: 0, y: 0 });
      overlay.commit();

      overlay.write("S", { x: 1, y: 0 });
      overlay.commit({ sync: true });

      expect(rowText(container, 0, "overlay")).toContain("OS");
      expect(rowText(container, 0, "default")).not.toContain("D");

      const remaining = Array.from(callbacks.values())[0]!;
      remaining(0);
      expect(rowText(container, 0, "default")).toContain("D");

      renderer.dispose();
      container.remove();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });
});
