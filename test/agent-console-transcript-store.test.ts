import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Agent Console transcript store", () => {
  it("preserves reactive replay semantics with mutable history backing", () => {
    const output = execFileSync(
      "pnpm",
      ["-C", "examples/agent-console", "transcript-store:smoke"],
      { encoding: "utf8" },
    );
    expect(output).toContain("Agent transcript store smoke passed");
  });
});
