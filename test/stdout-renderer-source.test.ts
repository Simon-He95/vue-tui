import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("stdout renderer source", () => {
  it("does not rely on globalThis.require for stdout sync writes", () => {
    const source = readFileSync(resolve("src/renderer/cli/stdout-renderer.ts"), "utf8");

    expect(source).not.toContain("globalThis as any).require");
    expect(source).toContain('from "node:fs"');
  });
});
