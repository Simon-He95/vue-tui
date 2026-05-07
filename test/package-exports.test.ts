import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const distIndex = resolve("dist/index.js");
const distMarkdown = resolve("dist/markdown.js");
const distExperimental = resolve("dist/experimental.js");
const distTypes = resolve("dist/index.d.ts");
const distMarkdownTypes = resolve("dist/markdown.d.ts");
const distExperimentalTypes = resolve("dist/experimental.d.ts");
const requireDistExports = process.env.VUE_TUI_REQUIRE_DIST_EXPORTS === "1";
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
};

function collectExportTargets(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectExportTargets(child, out);
  }
  return out;
}

describe("package exports", () => {
  it("publishes every package export target through the files allowlist", () => {
    expect(packageJson.files).toEqual(["dist"]);

    const targets = [
      packageJson.main,
      packageJson.module,
      packageJson.types,
      ...collectExportTargets(packageJson.exports),
    ].filter((target): target is string => typeof target === "string" && target.startsWith("./"));

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target).toMatch(/^\.\/dist\//);
    }
  });

  it("does not pin Vue consumers to a single patch line", () => {
    expect(packageJson.peerDependencies?.vue).toBe(">=3.3.0 <4");
  });

  it("keeps high-throughput components behind the experimental entrypoint", async () => {
    const root = await import("../src/index.js");
    const markdown = await import("../src/markdown.js");
    const experimental = await import("../src/experimental.js");

    expect("TMarkdownText" in root).toBe(false);
    expect("TVirtualList" in root).toBe(false);
    expect("TVirtualMarkdown" in root).toBe(false);
    expect("TLogView" in root).toBe(false);
    expect("TLogScrollbar" in root).toBe(false);
    expect("TLogMinimap" in root).toBe(false);
    expect("TLogSearchBar" in root).toBe(false);
    expect("TLogSearchResults" in root).toBe(false);
    expect("TLogSearchPager" in root).toBe(false);
    expect("TLogLinksPanel" in root).toBe(false);
    expect("useTLogSearchController" in root).toBe(false);
    expect("useTLogSearchResultsPage" in root).toBe(false);
    expect("useTLogLinkController" in root).toBe(false);
    expect("createAppendOnlyLogStore" in root).toBe(false);
    expect(root.createFramePerfStore).toBeTruthy();
    expect(root.framePerfNow).toBeTruthy();
    expect("TMarkdownText" in experimental).toBe(false);
    expect(experimental.TVirtualList).toBeTruthy();
    expect("TVirtualMarkdown" in experimental).toBe(false);
    expect(markdown.TMarkdownText).toBeTruthy();
    expect(markdown.TVirtualMarkdown).toBeTruthy();
    expect(markdown.createTuiMarkdownParser).toBeTruthy();
    expect(markdown.buildMarkdownBlocks).toBeTruthy();
    expect(markdown.buildMarkdownVisualRows).toBeTruthy();
    expect(markdown.layoutMarkdownBlocks).toBeTruthy();
    expect(experimental.TLogView).toBeTruthy();
    expect(experimental.TLogScrollbar).toBeTruthy();
    expect(experimental.TLogMinimap).toBeTruthy();
    expect(experimental.TLogSearchBar).toBeTruthy();
    expect(experimental.TLogSearchResults).toBeTruthy();
    expect(experimental.TLogVirtualSearchResults).toBeTruthy();
    expect(experimental.TLogSearchPager).toBeTruthy();
    expect(experimental.TLogLinksPanel).toBeTruthy();
    expect(experimental.TLogVirtualLinksPanel).toBeTruthy();
    expect(experimental.useTLogSearchController).toBeTruthy();
    expect(experimental.useTLogSearchResultsPage).toBeTruthy();
    expect(experimental.useTLogVirtualSearchResults).toBeTruthy();
    expect(experimental.useTLogLinkController).toBeTruthy();
    expect(experimental.useTLogRetainedIndex).toBeTruthy();
    expect(experimental.createAppendOnlyLogStore).toBeTruthy();
    expect(experimental.createTLogViewSessionStore).toBeTruthy();
    expect(experimental.createTLogLevelPlugin).toBeTruthy();
    expect(experimental.tlogDefaultPreset).toBeTruthy();
  });

  it("re-exports TLogView link navigation types from the experimental entrypoint", () => {
    const experimentalSource = readFileSync(resolve("src/experimental.ts"), "utf8");
    expect(experimentalSource).toContain("TLogViewVisibleLink");
    expect(experimentalSource).toContain("TLogViewLinkFocusPayload");
    expect(experimentalSource).toContain("TLogViewLinkActivatePayload");
    expect(experimentalSource).toContain("TLogViewSearchMode");
    expect(experimentalSource).toContain("TLogViewSearchError");
    expect(experimentalSource).toContain("TLogLinksPanel");
    expect(experimentalSource).toContain("TLogLinkPanelItem");
    expect(experimentalSource).toContain("TLogLinkAction");
    expect(experimentalSource).toContain("useTLogLinkController");
    expect(experimentalSource).toContain("TLogSearchBarState");
    expect(experimentalSource).toContain("TLogSearchBarMode");
    expect(experimentalSource).toContain("TLogSavedSearch");
    expect(experimentalSource).toContain("useTLogSearchController");
    expect(experimentalSource).toContain("TLogVirtualSearchResults");
    expect(experimentalSource).toContain("TLogVirtualLinksPanel");
    expect(experimentalSource).toContain("useTLogRetainedIndex");
    expect(experimentalSource).toContain("createTLogViewSessionStore");
    expect(experimentalSource).toContain("createTLogLevelPlugin");
    expect(experimentalSource).toContain("tlogDefaultPreset");
  });

  it("keeps the runnable tlog lab symbol set importable from the experimental entrypoint", async () => {
    const {
      TLogView,
      TLogSearchBar,
      TLogSearchResults,
      TLogVirtualSearchResults,
      TLogSearchPager,
      TLogScrollbar,
      TLogMinimap,
      TLogLinksPanel,
      TLogVirtualLinksPanel,
      createAppendOnlyLogStore,
      createTLogViewSessionStore,
      createTLogLevelPlugin,
      tlogDefaultPreset,
      useTLogSearchController,
      useTLogLinkController,
      useTLogRetainedIndex,
      useTLogVirtualSearchResults,
    } = await import("../src/experimental.js");

    expect(TLogView).toBeTruthy();
    expect(TLogSearchBar).toBeTruthy();
    expect(TLogSearchResults).toBeTruthy();
    expect(TLogVirtualSearchResults).toBeTruthy();
    expect(TLogSearchPager).toBeTruthy();
    expect(TLogScrollbar).toBeTruthy();
    expect(TLogMinimap).toBeTruthy();
    expect(TLogLinksPanel).toBeTruthy();
    expect(TLogVirtualLinksPanel).toBeTruthy();
    expect(createAppendOnlyLogStore).toBeTruthy();
    expect(createTLogViewSessionStore).toBeTruthy();
    expect(createTLogLevelPlugin).toBeTruthy();
    expect(tlogDefaultPreset).toBeTruthy();
    expect(useTLogSearchController).toBeTruthy();
    expect(useTLogLinkController).toBeTruthy();
    expect(useTLogRetainedIndex).toBeTruthy();
    expect(useTLogVirtualSearchResults).toBeTruthy();
  });

  it.skipIf(!requireDistExports)("keeps built ESM/CJS experimental exports usable", async () => {
    expect(existsSync(distIndex)).toBe(true);
    expect(existsSync(distMarkdown)).toBe(true);
    expect(existsSync(distExperimental)).toBe(true);
    expect(existsSync(distTypes)).toBe(true);
    expect(existsSync(distMarkdownTypes)).toBe(true);
    expect(existsSync(distExperimentalTypes)).toBe(true);

    const root = await import(/* @vite-ignore */ pathToFileURL(distIndex).href);
    const markdown = await import(/* @vite-ignore */ pathToFileURL(distMarkdown).href);
    const experimental = await import(/* @vite-ignore */ pathToFileURL(distExperimental).href);
    const require = createRequire(import.meta.url);
    const rootCjs = require("../dist/index.cjs");
    const markdownCjs = require("../dist/markdown.cjs");
    const experimentalCjs = require("../dist/experimental.cjs");

    expect("TVirtualList" in root).toBe(false);
    expect(root.TerminalProvider).toBeTruthy();
    expect(root.createFramePerfStore).toBeTruthy();
    expect(root.framePerfNow).toBeTruthy();
    expect(rootCjs.TerminalProvider).toBeTruthy();
    expect(rootCjs.createFramePerfStore).toBeTruthy();
    expect(rootCjs.framePerfNow).toBeTruthy();
    expect(markdown.TMarkdownText).toBeTruthy();
    expect(markdown.TVirtualMarkdown).toBeTruthy();
    expect(markdown.createTuiMarkdownParser).toBeTruthy();
    expect(markdown.buildMarkdownBlocks).toBeTruthy();
    expect(markdown.buildMarkdownVisualRows).toBeTruthy();
    expect(markdown.layoutMarkdownBlocks).toBeTruthy();
    expect(markdownCjs.TMarkdownText).toBeTruthy();
    expect(markdownCjs.TVirtualMarkdown).toBeTruthy();
    expect(markdownCjs.createTuiMarkdownParser).toBeTruthy();
    expect(markdownCjs.buildMarkdownBlocks).toBeTruthy();
    expect(markdownCjs.buildMarkdownVisualRows).toBeTruthy();
    expect(markdownCjs.layoutMarkdownBlocks).toBeTruthy();
    expect(experimental.TVirtualList).toBeTruthy();
    expect(experimental.TLogView).toBeTruthy();
    expect(experimental.TLogScrollbar).toBeTruthy();
    expect(experimental.TLogMinimap).toBeTruthy();
    expect(experimental.TLogSearchBar).toBeTruthy();
    expect(experimental.TLogSearchResults).toBeTruthy();
    expect(experimental.TLogVirtualSearchResults).toBeTruthy();
    expect(experimental.TLogSearchPager).toBeTruthy();
    expect(experimental.TLogLinksPanel).toBeTruthy();
    expect(experimental.TLogVirtualLinksPanel).toBeTruthy();
    expect(experimental.useTLogSearchController).toBeTruthy();
    expect(experimental.useTLogSearchResultsPage).toBeTruthy();
    expect(experimental.useTLogVirtualSearchResults).toBeTruthy();
    expect(experimental.useTLogLinkController).toBeTruthy();
    expect(experimental.useTLogRetainedIndex).toBeTruthy();
    expect(experimental.createAppendOnlyLogStore).toBeTruthy();
    expect(experimental.createTLogViewSessionStore).toBeTruthy();
    expect(experimental.createTLogLevelPlugin).toBeTruthy();
    expect(experimental.tlogDefaultPreset).toBeTruthy();
    expect("TMarkdownText" in experimentalCjs).toBe(false);
    expect("TVirtualMarkdown" in experimentalCjs).toBe(false);
    expect(experimentalCjs.TVirtualList).toBeTruthy();
    expect(experimentalCjs.TLogView).toBeTruthy();
    expect(experimentalCjs.TLogScrollbar).toBeTruthy();
    expect(experimentalCjs.TLogMinimap).toBeTruthy();
    expect(experimentalCjs.TLogSearchBar).toBeTruthy();
    expect(experimentalCjs.TLogSearchResults).toBeTruthy();
    expect(experimentalCjs.TLogVirtualSearchResults).toBeTruthy();
    expect(experimentalCjs.TLogSearchPager).toBeTruthy();
    expect(experimentalCjs.TLogLinksPanel).toBeTruthy();
    expect(experimentalCjs.TLogVirtualLinksPanel).toBeTruthy();
    expect(experimentalCjs.useTLogSearchController).toBeTruthy();
    expect(experimentalCjs.useTLogSearchResultsPage).toBeTruthy();
    expect(experimentalCjs.useTLogVirtualSearchResults).toBeTruthy();
    expect(experimentalCjs.useTLogLinkController).toBeTruthy();
    expect(experimentalCjs.useTLogRetainedIndex).toBeTruthy();
    expect(experimentalCjs.createAppendOnlyLogStore).toBeTruthy();
    expect(experimentalCjs.createTLogViewSessionStore).toBeTruthy();
    expect(experimentalCjs.createTLogLevelPlugin).toBeTruthy();
    expect(experimentalCjs.tlogDefaultPreset).toBeTruthy();
  });
});
