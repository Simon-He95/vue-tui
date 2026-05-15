import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("docs cleanup policy contract", () => {
  it("documents installTerminalCleanup default signal policy as reraise", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain('By default, signal handling uses `signalPolicy: "reraise"`');
    expect(readme).not.toContain("By default, signal handling is cleanup-only");
  });
});
