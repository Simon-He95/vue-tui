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
});
