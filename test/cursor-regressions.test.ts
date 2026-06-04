import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("cursor regressions (native cursor flicker / double caret)", () => {
  it("does not show native cursor in `examples/basic/src/terminal.ts` (non-smoke)", async () => {
    const text = await readText("examples/basic/src/terminal.ts");
    expect(text).toMatch(
      /:\s*\{\s*output:\s*process\.stdout,[^}]*hideCursor:\s*true,[^}]*allowFileUrls:\s*true[^}]*\}/s,
    );
    expect(text).not.toContain("showCursor(true)");
  });
});
