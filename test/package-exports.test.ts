import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const distIndex = resolve("dist/index.js");
const distExperimental = resolve("dist/experimental.js");
const distTypes = resolve("dist/index.d.ts");
const distExperimentalTypes = resolve("dist/experimental.d.ts");
const requireDistExports = process.env.VUE_TUI_REQUIRE_DIST_EXPORTS === "1";

describe("package exports", () => {
  it("keeps high-throughput components behind the experimental entrypoint", async () => {
    const root = await import("../src/index.js");
    const experimental = await import("../src/experimental.js");

    expect("TVirtualList" in root).toBe(false);
    expect("TLogView" in root).toBe(false);
    expect("TLogScrollbar" in root).toBe(false);
    expect("TLogMinimap" in root).toBe(false);
    expect("TLogSearchResults" in root).toBe(false);
    expect("createAppendOnlyLogStore" in root).toBe(false);
    expect(root.createFramePerfStore).toBeTruthy();
    expect(root.framePerfNow).toBeTruthy();
    expect(experimental.TVirtualList).toBeTruthy();
    expect(experimental.TLogView).toBeTruthy();
    expect(experimental.TLogScrollbar).toBeTruthy();
    expect(experimental.TLogMinimap).toBeTruthy();
    expect(experimental.TLogSearchResults).toBeTruthy();
    expect(experimental.createAppendOnlyLogStore).toBeTruthy();
  });

  it("re-exports TLogView link navigation types from the experimental entrypoint", () => {
    const experimentalSource = readFileSync(resolve("src/experimental.ts"), "utf8");
    expect(experimentalSource).toContain("TLogViewVisibleLink");
    expect(experimentalSource).toContain("TLogViewLinkFocusPayload");
    expect(experimentalSource).toContain("TLogViewLinkActivatePayload");
    expect(experimentalSource).toContain("TLogViewSearchMode");
    expect(experimentalSource).toContain("TLogViewSearchError");
  });

  it.skipIf(!requireDistExports)("keeps built ESM/CJS experimental exports usable", async () => {
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
    expect(root.createFramePerfStore).toBeTruthy();
    expect(root.framePerfNow).toBeTruthy();
    expect(rootCjs.TerminalProvider).toBeTruthy();
    expect(rootCjs.createFramePerfStore).toBeTruthy();
    expect(rootCjs.framePerfNow).toBeTruthy();
    expect(experimental.TVirtualList).toBeTruthy();
    expect(experimental.TLogView).toBeTruthy();
    expect(experimental.TLogScrollbar).toBeTruthy();
    expect(experimental.TLogMinimap).toBeTruthy();
    expect(experimental.TLogSearchResults).toBeTruthy();
    expect(experimental.createAppendOnlyLogStore).toBeTruthy();
    expect(experimentalCjs.TVirtualList).toBeTruthy();
    expect(experimentalCjs.TLogView).toBeTruthy();
    expect(experimentalCjs.TLogScrollbar).toBeTruthy();
    expect(experimentalCjs.TLogMinimap).toBeTruthy();
    expect(experimentalCjs.TLogSearchResults).toBeTruthy();
    expect(experimentalCjs.createAppendOnlyLogStore).toBeTruthy();
  });
});
