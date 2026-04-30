import { describe, expect, it } from "vitest";
import { createDomRenderer, createTerminal } from "../src/index.js";

describe("DomRenderer sync flush", () => {
  it("flushes sync commits without scheduling rAF", () => {
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
});
