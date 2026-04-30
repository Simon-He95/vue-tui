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
});
