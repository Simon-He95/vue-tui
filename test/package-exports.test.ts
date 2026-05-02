import { describe, expect, it } from "vitest";

describe("package exports", () => {
  it("keeps TVirtualList behind the experimental entrypoint", async () => {
    const root = await import("../src/index.js");
    const experimental = await import("../src/experimental.js");

    expect("TVirtualList" in root).toBe(false);
    expect(experimental.TVirtualList).toBeTruthy();
  });
});
