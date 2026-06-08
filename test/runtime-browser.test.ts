import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/runtime/index.js";

describe("runtime (browser-ish)", () => {
  it("detects browser in happy-dom", () => {
    const r = createRuntime();
    expect(r.env.isBrowser).toBe(true);
    expect(r.getWindow()).not.toBe(null);
    expect(r.getDocument()).not.toBe(null);
  });

  it("measureText is safe", () => {
    const r = createRuntime();
    const w = r.measureText("hello", { font: "12px monospace" });
    expect(w === null || (typeof w === "number" && Number.isFinite(w))).toBe(true);
  });

  it("reads browser clipboard dynamically", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    try {
      const r = createRuntime("browser");
      expect(r.clipboard.supported).toBe(false);
      expect(r.clipboard.canRead).toBe(false);
      expect(r.clipboard.canWrite).toBe(false);

      const writes: string[] = [];
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: {
          readText: async () => writes[writes.length - 1] ?? "",
          writeText: async (text: string) => {
            writes.push(text);
          },
        },
        configurable: true,
      });

      expect(r.clipboard.supported).toBe(true);
      expect(r.clipboard.canRead).toBe(true);
      expect(r.clipboard.canWrite).toBe(true);

      await r.clipboard.writeText("selected text");
      expect(await r.clipboard.readText()).toBe("selected text");
      expect(writes).toEqual(["selected text"]);
    } finally {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
  });
});
