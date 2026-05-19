import { describe, expect, it, vi } from "vitest";
import { importNodeModule } from "../src/cli/node-module.js";

describe("importNodeModule", () => {
  it("falls back to native dynamic import when the transformed import rejects", async () => {
    vi.doMock("node:fs/promises", () => {
      throw new Error("mocked direct import failure");
    });

    try {
      await expect(import("node:fs/promises")).rejects.toThrow();

      const fs = await importNodeModule<typeof import("node:fs/promises")>("node:fs/promises");

      expect(fs?.readFile).toBeTypeOf("function");
    } finally {
      vi.doUnmock("node:fs/promises");
    }
  });
});
