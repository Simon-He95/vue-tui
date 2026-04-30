// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src/runtime/index.js";

function restoreGlobal(key: string, value: unknown): void {
  if (value === undefined) {
    delete (globalThis as any)[key];
    return;
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;
const originalNavigator = (globalThis as any).navigator;

beforeEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).navigator;
});

afterEach(() => {
  restoreGlobal("window", originalWindow);
  restoreGlobal("document", originalDocument);
  restoreGlobal("navigator", originalNavigator);
});

describe("runtime (terminal/node)", () => {
  it("detects terminal in node env", () => {
    const r = createRuntime();
    expect(r.env.isTerminal).toBe(true);
    expect(r.env.isBrowser).toBe(false);
    expect(r.getWindow()).toBe(null);
    expect(r.getDocument()).toBe(null);
  });

  it("clipboard wrapper rejects", async () => {
    const r = createRuntime();
    expect(r.clipboard.supported).toBe(false);
    await expect(r.clipboard.writeText("x")).rejects.toThrow(/Clipboard not available/);
  });

  it("raf wrapper runs via timers", () => {
    vi.useFakeTimers();
    const r = createRuntime();
    const cb = vi.fn();
    r.raf.request(cb as any);
    vi.advanceTimersByTime(20);
    expect(cb).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
