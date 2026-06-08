// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src/runtime/index.js";
import { createOsc52ClipboardProvider } from "../src/runtime/osc52.js";

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

  it("uses injected terminal clipboard", async () => {
    const writes: string[] = [];
    const r = createRuntime("terminal", {
      clipboard: {
        supported: true,
        async readText() {
          return writes[writes.length - 1] ?? "";
        },
        async writeText(text: string) {
          writes.push(text);
        },
      },
    });

    await r.clipboard.writeText("selected text");
    expect(await r.clipboard.readText()).toBe("selected text");
    expect(writes).toEqual(["selected text"]);
  });

  it("supports write-only browser clipboard for copy operations", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText,
        },
      },
      configurable: true,
    });

    const r = createRuntime("browser");

    expect(r.clipboard.supported).toBe(false);
    expect(r.clipboard.canRead).toBe(false);
    expect(r.clipboard.canWrite).toBe(true);

    await r.clipboard.writeText("graph LR\n  A --> B");
    expect(writeText).toHaveBeenCalledWith("graph LR\n  A --> B");

    await expect(r.clipboard.readText()).rejects.toThrow(
      "Clipboard read not available in this runtime",
    );
  });

  it("writes OSC52 clipboard sequences when explicitly configured", async () => {
    const writes: string[] = [];
    const clipboard = createOsc52ClipboardProvider({
      supported: true,
      write: (sequence) => {
        writes.push(sequence);
      },
    });

    await clipboard.writeText("copy me");

    expect(clipboard.supported).toBe(true);
    expect(clipboard.canRead).toBe(false);
    expect(clipboard.canWrite).toBe(true);
    expect(writes).toEqual(["\u001B]52;c;Y29weSBtZQ==\u0007"]);

    await expect(clipboard.readText()).rejects.toThrow(
      "Clipboard read not available in this runtime",
    );
  });

  it("rejects oversized OSC52 clipboard payloads", async () => {
    const writes: string[] = [];
    const clipboard = createOsc52ClipboardProvider({
      supported: true,
      maxBytes: 4,
      write: (sequence) => {
        writes.push(sequence);
      },
    });

    await expect(clipboard.writeText("12345")).rejects.toThrow(/payload too large/);
    expect(writes).toEqual([]);
  });

  it("does not let invalid OSC52 maxBytes disable the payload limit", async () => {
    const writes: string[] = [];
    const clipboard = createOsc52ClipboardProvider({
      supported: true,
      maxBytes: Number.NaN,
      write: (sequence) => {
        writes.push(sequence);
      },
    });

    await expect(clipboard.writeText("x".repeat(101 * 1024))).rejects.toThrow(/payload too large/i);
    expect(writes).toEqual([]);
  });

  it("does not allow Infinity as an OSC52 payload limit", async () => {
    const writes: string[] = [];
    const clipboard = createOsc52ClipboardProvider({
      supported: true,
      maxBytes: Infinity,
      write: (sequence) => {
        writes.push(sequence);
      },
    });

    await expect(clipboard.writeText("x".repeat(101 * 1024))).rejects.toThrow(/payload too large/i);
    expect(writes).toEqual([]);
  });

  it("sanitizes OSC52 target", async () => {
    const writes: string[] = [];
    const clipboard = createOsc52ClipboardProvider({
      supported: true,
      target: "c;\u0007bad",
      write: (sequence) => {
        writes.push(sequence);
      },
    });

    await clipboard.writeText("x");

    expect(writes).toEqual(["\u001B]52;c;eA==\u0007"]);
  });

  it("raf wrapper runs via timers with a finite timestamp", () => {
    vi.useFakeTimers();
    try {
      const r = createRuntime("terminal");
      const cb = vi.fn();
      r.raf.request(cb as any);
      vi.advanceTimersByTime(20);
      expect(cb).toHaveBeenCalled();
      const timestamp = cb.mock.calls[0]?.[0];
      expect(typeof timestamp).toBe("number");
      expect(Number.isFinite(timestamp)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
