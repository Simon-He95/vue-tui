import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const distIndex = resolve("dist/index.js");
const distExperimental = resolve("dist/experimental.js");
const distTypes = resolve("dist/index.d.ts");
const distExperimentalTypes = resolve("dist/experimental.d.ts");
const requireDistExports = process.env.VUE_TUI_REQUIRE_DIST_EXPORTS === "1";

describe("package exports", () => {
  it("keeps TVirtualList behind the experimental entrypoint", async () => {
    const root = await import("../src/index.js");
    const experimental = await import("../src/experimental.js");

    expect("TVirtualList" in root).toBe(false);
    expect(experimental.TVirtualList).toBeTruthy();
  });

  it.skipIf(!requireDistExports && !existsSync(distIndex))(
    "keeps built ESM/CJS experimental exports usable",
    async () => {
      expect(existsSync(distIndex)).toBe(true);
      expect(existsSync(distExperimental)).toBe(true);
      expect(existsSync(distTypes)).toBe(true);
      expect(existsSync(distExperimentalTypes)).toBe(true);

      const root = await import(/* @vite-ignore */ pathToFileURL(distIndex).href);
      const experimental = await import(/* @vite-ignore */ pathToFileURL(distExperimental).href);
      const require = createRequire(import.meta.url);
      const rootCjs = require("../dist/index.cjs");
      const experimentalCjs = require("../dist/experimental.cjs");

      expect("TVirtualList" in root).toBe(false);
      expect(root.TerminalProvider).toBeTruthy();
      expect(rootCjs.TerminalProvider).toBeTruthy();
      expect(experimental.TVirtualList).toBeTruthy();
      expect(experimentalCjs.TVirtualList).toBeTruthy();
    },
  );
});
