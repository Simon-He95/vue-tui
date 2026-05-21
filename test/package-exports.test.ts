import type { Plugin } from "esbuild";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoBrowserForbiddenCode } from "../scripts/browser-forbidden-code.js";

const distIndex = resolve("dist/index.js");
const distCore = resolve("dist/core.js");
const distRuntime = resolve("dist/runtime.js");
const distRendererDom = resolve("dist/renderer-dom.js");
const distObservability = resolve("dist/observability.js");
const distVue = resolve("dist/vue.js");
const distCli = resolve("dist/cli.js");
const distMarkdown = resolve("dist/markdown.js");
const distExperimental = resolve("dist/experimental.js");
const distAgent = resolve("dist/agent.js");
const distIndexCjs = resolve("dist/index.cjs");
const distCoreCjs = resolve("dist/core.cjs");
const distRuntimeCjs = resolve("dist/runtime.cjs");
const distRendererDomCjs = resolve("dist/renderer-dom.cjs");
const distObservabilityCjs = resolve("dist/observability.cjs");
const distVueCjs = resolve("dist/vue.cjs");
const distMarkdownCjs = resolve("dist/markdown.cjs");
const distExperimentalCjs = resolve("dist/experimental.cjs");
const distAgentCjs = resolve("dist/agent.cjs");
const distIndexCjsTypes = resolve("dist/index.d.cts");
const distCoreCjsTypes = resolve("dist/core.d.cts");
const distRuntimeCjsTypes = resolve("dist/runtime.d.cts");
const distRendererDomCjsTypes = resolve("dist/renderer-dom.d.cts");
const distObservabilityCjsTypes = resolve("dist/observability.d.cts");
const distVueCjsTypes = resolve("dist/vue.d.cts");
const distCliCjsTypes = resolve("dist/cli.d.cts");
const distMarkdownCjsTypes = resolve("dist/markdown.d.cts");
const distExperimentalCjsTypes = resolve("dist/experimental.d.cts");
const distAgentCjsTypes = resolve("dist/agent.d.cts");
const distTypes = resolve("dist/index.d.ts");
const distCoreTypes = resolve("dist/core.d.ts");
const distRuntimeTypes = resolve("dist/runtime.d.ts");
const distRendererDomTypes = resolve("dist/renderer-dom.d.ts");
const distObservabilityTypes = resolve("dist/observability.d.ts");
const distVueTypes = resolve("dist/vue.d.ts");
const distCliTypes = resolve("dist/cli.d.ts");
const distMarkdownTypes = resolve("dist/markdown.d.ts");
const distExperimentalTypes = resolve("dist/experimental.d.ts");
const distAgentTypes = resolve("dist/agent.d.ts");
const requireDistExports = process.env.VUE_TUI_REQUIRE_DIST_EXPORTS === "1";
const forbiddenNodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
};

function readFixtureDir(dir: string): string {
  return readdirSync(resolve(dir))
    .sort()
    .map((file) => readFileSync(resolve(dir, file), "utf8"))
    .join("");
}

const forbidNodeBuiltins: Plugin = {
  name: "forbid-node-builtins",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!forbiddenNodeBuiltins.has(args.path)) return null;
      return {
        errors: [
          {
            text: `Browser-safe entry resolved Node builtin: ${args.path} imported by ${args.importer}`,
          },
        ],
      };
    });
  },
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

function expectNoBrowserForbiddenCode(file: string): void {
  const source = readFileSync(file, "utf8");
  assertNoBrowserForbiddenCode(source, file);
}

describe("package exports", () => {
  it("publishes every package export target through the files allowlist", () => {
    expect(packageJson.files).toEqual(["dist"]);
    expect(packageJson.main).toBe("./dist/index.cjs");
    expect(packageJson.module).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");

    const targets = [
      packageJson.main,
      packageJson.module,
      packageJson.types,
      ...collectExportTargets(packageJson.exports),
    ].filter((target): target is string => typeof target === "string" && target.startsWith("./"));

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      if (target === "./package.json") continue;
      expect(target).toMatch(/^\.\/dist\//);
    }
  });

  it("exports package metadata for tooling", async () => {
    const specifier = "@simon_he/vue-tui/package.json";
    const pkg = await import(specifier, { with: { type: "json" } });

    expect(pkg.default.name).toBe("@simon_he/vue-tui");
  });

  it("does not pin Vue consumers to a single patch line", () => {
    expect(packageJson.peerDependencies?.vue).toBe(">=3.3.0 <4");
  });

  it("does not import the mixed renderer barrel from CLI app runtime", () => {
    const source = readFileSync(resolve("src/create-terminal-app.ts"), "utf8");
    expect(source).not.toContain("./renderer/index.js");
  });

  it("does not import cli modules from the browser root entry", () => {
    const source = readFileSync(resolve("src/index.ts"), "utf8");
    expect(source).not.toMatch(/from "\.\/cli\//);
  });

  it("detects bare Node builtins in browser forbidden code scans", () => {
    for (const bad of [
      `const fs = require("fs")`,
      `const fs = require("node:fs")`,
      `import path from "path"`,
      `import "path"`,
      `export { readFile } from "fs"`,
      `await import("child_process")`,
      `await import("node:child_process")`,
      `process.env.NODE_ENV`,
      `process?.env?.NODE_ENV`,
    ]) {
      expect(() => assertNoBrowserForbiddenCode(bad)).toThrow(/forbidden code/);
    }
    expect(() => assertNoBrowserForbiddenCode(`globalThis.process?.env?.NODE_ENV`)).not.toThrow();
  });

  it("keeps Vue declaration compatibility patch output stable", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/fix-vue-dts-compat.mjs", "--input", "test/fixtures/dts-before", "--stdout"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const formatted = execFileSync(
      "pnpm",
      ["exec", "oxfmt", "--stdin-filepath", "test/fixtures/dts-after/vue-component.d.ts"],
      { cwd: process.cwd(), encoding: "utf8", input: output },
    );

    expect(formatted).toBe(readFixtureDir("test/fixtures/dts-after"));
  });

  it("checks already patched Vue declaration compatibility output", () => {
    execFileSync(
      process.execPath,
      ["scripts/fix-vue-dts-compat.mjs", "--input", "test/fixtures/dts-after", "--check"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
  });

  it("keeps high-throughput components behind the experimental entrypoint", async () => {
    const root = await import("../src/index.js");
    const core = await import("../src/core.js");
    const runtime = await import("../src/runtime.js");
    const observability = await import("../src/observability.js");
    const rendererDom = await import("../src/renderer-dom.js");
    const vue = await import("../src/vue.js");
    const cli = await import("../src/cli.js");
    const markdown = await import("../src/markdown.js");
    const experimental = await import("../src/experimental.js");
    const agent = await import("../src/agent.js");

    expect("createTerminalApp" in root).toBe(false);
    expect("createStdoutRenderer" in root).toBe(false);
    expect("createStdinDriver" in root).toBe(false);
    expect("createCliEventManager" in root).toBe(false);
    expect("createNodePathPickerProvider" in root).toBe(false);
    expect("createNodeMentionPathProvider" in root).toBe(false);
    expect("readEventLog" in root).toBe(false);
    expect("writeEventLog" in root).toBe(false);
    expect("writeSnapshot" in root).toBe(false);
    expect("getCliLatencyProfiler" in root).toBe(false);
    expect("createOsc52ClipboardProvider" in root).toBe(false);
    expect("createDefaultTInputHostAdapter" in root).toBe(false);
    expect("defaultTInputHostPlugin" in root).toBe(false);
    expect(Object.keys(root).sort()).toEqual([
      "TBox",
      "TDialog",
      "TInput",
      "TList",
      "TSelect",
      "TText",
      "TView",
      "TerminalProvider",
      "createDomRenderer",
      "createTInputHostPlugin",
      "createTerminal",
    ]);
    expect(cli.createTerminalApp).toBeTruthy();
    expect(cli.createStdoutRenderer).toBeTruthy();
    expect(cli.createStdinDriver).toBeTruthy();
    expect(cli.createCliEventManager).toBeTruthy();
    expect(cli.createNodePathPickerProvider).toBeTruthy();
    expect(cli.createNodeMentionPathProvider).toBeTruthy();
    expect(cli.readEventLog).toBeTruthy();
    expect(cli.writeEventLog).toBeTruthy();
    expect(cli.writeSnapshot).toBeTruthy();
    expect(cli.getCliLatencyProfiler).toBeTruthy();
    expect(cli.createOsc52ClipboardProvider).toBeTruthy();
    expect(cli.createDefaultTInputHostAdapter).toBeTruthy();
    expect(cli.defaultTInputHostPlugin).toBeTruthy();
    expect(cli.installNodeFileWriters).toBeTruthy();
    expect(cli.resetNodeFileWriters).toBeTruthy();
    expect(cli.STDOUT_RENDERER_CAPABILITIES).toEqual({
      syncFlush: true,
      scrollOperations: true,
      domRows: false,
    });
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
    expect("createRuntime" in root).toBe(false);
    expect("createFramePerfStore" in root).toBe(false);
    expect("framePerfNow" in root).toBe(false);
    expect("sanitizeDomHref" in root).toBe(false);
    expect("isSafeRelativeHref" in root).toBe(false);
    expect("terminalSelectionVisibleRowSpans" in root).toBe(false);
    expect("createOsc52ClipboardProvider" in runtime).toBe(false);
    expect("createDefaultTInputHostAdapter" in vue).toBe(false);
    expect("defaultTInputHostPlugin" in vue).toBe(false);
    expect(core.sanitizeDomHref("https://example.com")).toBe("https://example.com/");
    expect(core.isSafeRelativeHref("#section")).toBe(true);
    expect(runtime.createRuntime).toBeTruthy();
    expect(runtime.terminalSelectionVisibleRowSpans).toBeTruthy();
    expect(observability.createFramePerfStore).toBeTruthy();
    expect(observability.framePerfNow).toBeTruthy();
    expect(rendererDom.createDomRenderer).toBe(root.createDomRenderer);
    expect(vue.useTerminal).toBeTruthy();
    expect("TMarkdownText" in experimental).toBe(false);
    expect(experimental.TVirtualList).toBeTruthy();
    expect("TVirtualMarkdown" in experimental).toBe(false);
    expect(markdown.TMarkdownText).toBeTruthy();
    expect(markdown.TVirtualMarkdown).toBeTruthy();
    expect(markdown.createMarkdownBlockSource).toBeTruthy();
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
    expect(agent.TAgentTranscript).toBe(experimental.TTranscriptView);
    expect(agent.TToolCallView).toBeTruthy();
    expect(agent.TToolLogView).toBe(experimental.TLogView);
    expect(agent.TVirtualMarkdown).toBe(markdown.TVirtualMarkdown);
    expect(agent.createMarkdownBlockSource).toBe(markdown.createMarkdownBlockSource);
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

  it("keeps the root/markdown/experimental entrypoints browser-bundleable without Node built-ins", async () => {
    const { build } = await import("esbuild");
    const result = await build({
      stdin: {
        contents: `
          import * as root from "./src/index.ts";
          import * as core from "./src/core.ts";
          import * as runtime from "./src/runtime.ts";
          import * as rendererDom from "./src/renderer-dom.ts";
          import * as observability from "./src/observability.ts";
          import * as vue from "./src/vue.ts";
          import * as markdown from "./src/markdown.ts";
          import * as experimental from "./src/experimental.ts";
          import * as agent from "./src/agent.ts";
          console.log(root, core, runtime, rendererDom, observability, vue, markdown, experimental, agent);
        `,
        resolveDir: process.cwd(),
        sourcefile: "vue-tui-browser-smoke.ts",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      external: ["vue"],
      plugins: [forbidNodeBuiltins],
    });
    const output = result.outputFiles
      .map((file) => new TextDecoder().decode(file.contents))
      .join("\n");
    assertNoBrowserForbiddenCode(output, "source browser bundle");
  });

  it.skipIf(!requireDistExports)(
    "keeps the built browser entrypoints browser-bundleable without Node built-ins",
    async () => {
      expect(existsSync(distIndex)).toBe(true);
      expect(existsSync(distMarkdown)).toBe(true);
      expect(existsSync(distExperimental)).toBe(true);
      expect(existsSync(distAgent)).toBe(true);

      const { build } = await import("esbuild");
      const result = await build({
        stdin: {
          contents: `
            import * as root from "./dist/index.js";
            import * as core from "./dist/core.js";
            import * as runtime from "./dist/runtime.js";
            import * as rendererDom from "./dist/renderer-dom.js";
            import * as observability from "./dist/observability.js";
            import * as vue from "./dist/vue.js";
            import * as markdown from "./dist/markdown.js";
            import * as experimental from "./dist/experimental.js";
            import * as agent from "./dist/agent.js";
            console.log(root, core, runtime, rendererDom, observability, vue, markdown, experimental, agent);
          `,
          resolveDir: process.cwd(),
          sourcefile: "vue-tui-dist-browser-smoke.ts",
        },
        bundle: true,
        write: false,
        platform: "browser",
        format: "esm",
        external: ["vue"],
        plugins: [forbidNodeBuiltins],
      });
      const output = result.outputFiles
        .map((file) => new TextDecoder().decode(file.contents))
        .join("\n");
      assertNoBrowserForbiddenCode(output, "dist browser bundle");
    },
  );

  it.skipIf(!requireDistExports)("does not emit Node-only code into browser dist entries", () => {
    for (const file of [
      distIndex,
      distCore,
      distRuntime,
      distRendererDom,
      distObservability,
      distVue,
      distMarkdown,
      distExperimental,
      distAgent,
      distIndexCjs,
      distCoreCjs,
      distRuntimeCjs,
      distRendererDomCjs,
      distObservabilityCjs,
      distVueCjs,
      distMarkdownCjs,
      distExperimentalCjs,
      distAgentCjs,
      distIndexCjsTypes,
      distCoreCjsTypes,
      distRuntimeCjsTypes,
      distRendererDomCjsTypes,
      distObservabilityCjsTypes,
      distVueCjsTypes,
      distMarkdownCjsTypes,
      distExperimentalCjsTypes,
      distAgentCjsTypes,
      distTypes,
      distCoreTypes,
      distRuntimeTypes,
      distRendererDomTypes,
      distObservabilityTypes,
      distVueTypes,
      distMarkdownTypes,
      distExperimentalTypes,
      distAgentTypes,
    ]) {
      expect(existsSync(file)).toBe(true);
      expectNoBrowserForbiddenCode(file);
    }
  });

  it.skipIf(!requireDistExports)("keeps built ESM/CJS experimental exports usable", async () => {
    expect(existsSync(distIndex)).toBe(true);
    expect(existsSync(distCore)).toBe(true);
    expect(existsSync(distRuntime)).toBe(true);
    expect(existsSync(distRendererDom)).toBe(true);
    expect(existsSync(distObservability)).toBe(true);
    expect(existsSync(distVue)).toBe(true);
    expect(existsSync(distCli)).toBe(true);
    expect(existsSync(distMarkdown)).toBe(true);
    expect(existsSync(distExperimental)).toBe(true);
    expect(existsSync(distAgent)).toBe(true);
    expect(existsSync(distIndexCjsTypes)).toBe(true);
    expect(existsSync(distCoreCjsTypes)).toBe(true);
    expect(existsSync(distRuntimeCjsTypes)).toBe(true);
    expect(existsSync(distRendererDomCjsTypes)).toBe(true);
    expect(existsSync(distObservabilityCjsTypes)).toBe(true);
    expect(existsSync(distVueCjsTypes)).toBe(true);
    expect(existsSync(distCliCjsTypes)).toBe(true);
    expect(existsSync(distMarkdownCjsTypes)).toBe(true);
    expect(existsSync(distExperimentalCjsTypes)).toBe(true);
    expect(existsSync(distAgentCjsTypes)).toBe(true);
    expect(existsSync(distTypes)).toBe(true);
    expect(existsSync(distCoreTypes)).toBe(true);
    expect(existsSync(distRuntimeTypes)).toBe(true);
    expect(existsSync(distRendererDomTypes)).toBe(true);
    expect(existsSync(distObservabilityTypes)).toBe(true);
    expect(existsSync(distVueTypes)).toBe(true);
    expect(existsSync(distCliTypes)).toBe(true);
    expect(existsSync(distMarkdownTypes)).toBe(true);
    expect(existsSync(distExperimentalTypes)).toBe(true);
    expect(existsSync(distAgentTypes)).toBe(true);
    expect(readFileSync(distCliTypes, "utf8")).toContain("Osc52ClipboardOptions");

    const root = await import(/* @vite-ignore */ pathToFileURL(distIndex).href);
    const core = await import(/* @vite-ignore */ pathToFileURL(distCore).href);
    const runtime = await import(/* @vite-ignore */ pathToFileURL(distRuntime).href);
    const rendererDom = await import(/* @vite-ignore */ pathToFileURL(distRendererDom).href);
    const observability = await import(/* @vite-ignore */ pathToFileURL(distObservability).href);
    const vue = await import(/* @vite-ignore */ pathToFileURL(distVue).href);
    const cli = await import(/* @vite-ignore */ pathToFileURL(distCli).href);
    const markdown = await import(/* @vite-ignore */ pathToFileURL(distMarkdown).href);
    const experimental = await import(/* @vite-ignore */ pathToFileURL(distExperimental).href);
    const agent = await import(/* @vite-ignore */ pathToFileURL(distAgent).href);
    const require = createRequire(import.meta.url);
    const rootCjs = require("../dist/index.cjs");
    const coreCjs = require("../dist/core.cjs");
    const runtimeCjs = require("../dist/runtime.cjs");
    const rendererDomCjs = require("../dist/renderer-dom.cjs");
    const observabilityCjs = require("../dist/observability.cjs");
    const vueCjs = require("../dist/vue.cjs");
    const cliCjs = require("../dist/cli.cjs");
    const markdownCjs = require("../dist/markdown.cjs");
    const experimentalCjs = require("../dist/experimental.cjs");
    const agentCjs = require("../dist/agent.cjs");

    expect("createTerminalApp" in root).toBe(false);
    expect("createStdoutRenderer" in root).toBe(false);
    expect("TVirtualList" in root).toBe(false);
    expect("createDefaultTInputHostAdapter" in root).toBe(false);
    expect("defaultTInputHostPlugin" in root).toBe(false);
    expect(root.TerminalProvider).toBeTruthy();
    expect("createRuntime" in root).toBe(false);
    expect("createFramePerfStore" in root).toBe(false);
    expect("framePerfNow" in root).toBe(false);
    expect("sanitizeTerminalHref" in root).toBe(false);
    expect("sanitizeDomHref" in root).toBe(false);
    expect("createOsc52ClipboardProvider" in runtime).toBe(false);
    expect("createDefaultTInputHostAdapter" in vue).toBe(false);
    expect("defaultTInputHostPlugin" in vue).toBe(false);
    expect(core.sanitizeTerminalHref("https://example.com")).toBe("https://example.com");
    expect(core.sanitizeDomHref("https://example.com")).toBe("https://example.com/");
    expect(core.isSafeRelativeHref("#section")).toBe(true);
    expect(runtime.createRuntime).toBeTruthy();
    expect(runtime.terminalSelectionVisibleRowSpans).toBeTruthy();
    expect(rendererDom.createDomRenderer).toBeTruthy();
    expect(observability.createFramePerfStore).toBeTruthy();
    expect(observability.framePerfNow).toBeTruthy();
    expect(vue.useTerminal).toBeTruthy();
    expect(cli.createTerminalApp).toBeTruthy();
    expect(cli.createStdoutRenderer).toBeTruthy();
    expect(cli.createStdinDriver).toBeTruthy();
    expect(cli.createOsc52ClipboardProvider).toBeTruthy();
    expect(cli.createDefaultTInputHostAdapter).toBeTruthy();
    expect(cli.defaultTInputHostPlugin).toBeTruthy();
    expect(cli.installNodeFileWriters).toBeTruthy();
    expect(cli.resetNodeFileWriters).toBeTruthy();
    expect(cli.STDOUT_RENDERER_CAPABILITIES).toEqual({
      syncFlush: true,
      scrollOperations: true,
      domRows: false,
    });
    expect(cli.sanitizeTerminalHref("file:///tmp/a")).toBeNull();
    expect("createTerminalApp" in rootCjs).toBe(false);
    expect("createStdoutRenderer" in rootCjs).toBe(false);
    expect("createDefaultTInputHostAdapter" in rootCjs).toBe(false);
    expect("defaultTInputHostPlugin" in rootCjs).toBe(false);
    expect(rootCjs.TerminalProvider).toBeTruthy();
    expect("createRuntime" in rootCjs).toBe(false);
    expect("createFramePerfStore" in rootCjs).toBe(false);
    expect("framePerfNow" in rootCjs).toBe(false);
    expect("sanitizeTerminalHref" in rootCjs).toBe(false);
    expect("sanitizeDomHref" in rootCjs).toBe(false);
    expect("createOsc52ClipboardProvider" in runtimeCjs).toBe(false);
    expect("createDefaultTInputHostAdapter" in vueCjs).toBe(false);
    expect("defaultTInputHostPlugin" in vueCjs).toBe(false);
    expect(coreCjs.sanitizeTerminalHref("https://example.com")).toBe("https://example.com");
    expect(coreCjs.sanitizeDomHref("https://example.com")).toBe("https://example.com/");
    expect(coreCjs.isSafeRelativeHref("#section")).toBe(true);
    expect(runtimeCjs.createRuntime).toBeTruthy();
    expect(runtimeCjs.terminalSelectionVisibleRowSpans).toBeTruthy();
    expect(rendererDomCjs.createDomRenderer).toBeTruthy();
    expect(observabilityCjs.createFramePerfStore).toBeTruthy();
    expect(observabilityCjs.framePerfNow).toBeTruthy();
    expect(vueCjs.useTerminal).toBeTruthy();
    expect(cliCjs.createTerminalApp).toBeTruthy();
    expect(cliCjs.createStdoutRenderer).toBeTruthy();
    expect(cliCjs.createStdinDriver).toBeTruthy();
    expect(cliCjs.createOsc52ClipboardProvider).toBeTruthy();
    expect(cliCjs.createDefaultTInputHostAdapter).toBeTruthy();
    expect(cliCjs.defaultTInputHostPlugin).toBeTruthy();
    expect(cliCjs.installNodeFileWriters).toBeTruthy();
    expect(cliCjs.resetNodeFileWriters).toBeTruthy();
    expect(cliCjs.STDOUT_RENDERER_CAPABILITIES).toEqual({
      syncFlush: true,
      scrollOperations: true,
      domRows: false,
    });
    expect(cliCjs.sanitizeTerminalHref("file:///tmp/a")).toBeNull();
    expect(markdown.TMarkdownText).toBeTruthy();
    expect(markdown.TVirtualMarkdown).toBeTruthy();
    expect(markdown.createMarkdownBlockSource).toBeTruthy();
    expect(markdown.createTuiMarkdownParser).toBeTruthy();
    expect(markdown.buildMarkdownBlocks).toBeTruthy();
    expect(markdown.buildMarkdownVisualRows).toBeTruthy();
    expect(markdown.layoutMarkdownBlocks).toBeTruthy();
    expect(markdownCjs.TMarkdownText).toBeTruthy();
    expect(markdownCjs.TVirtualMarkdown).toBeTruthy();
    expect(markdownCjs.createMarkdownBlockSource).toBeTruthy();
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
    expect(experimental.detectTLogUrls("https://example.com")).toHaveLength(1);
    expect(experimental.sanitizeTerminalHref("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
    expect(experimental.tlogDefaultPreset).toBeTruthy();
    expect(agent.TAgentTranscript).toBe(experimental.TTranscriptView);
    expect(agent.TToolCallView).toBeTruthy();
    expect(agent.TToolLogView).toBe(experimental.TLogView);
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
    expect(experimentalCjs.detectTLogUrls("https://example.com")).toHaveLength(1);
    expect(experimentalCjs.sanitizeTerminalHref("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
    expect(experimentalCjs.tlogDefaultPreset).toBeTruthy();
    expect(agentCjs.TAgentTranscript).toBeTruthy();
    expect(agentCjs.TToolCallView).toBeTruthy();
    expect(agentCjs.TToolLogView).toBeTruthy();

    const { h, nextTick, ref } = require("vue");
    const log = experimentalCjs.createAppendOnlyLogStore({ maxLines: 4 });
    log.appendLines(["INFO cjs consumer", "WARN https://safe.dev"]);
    const Consumer = {
      setup() {
        return () =>
          h(
            rootCjs.TBox,
            { x: 0, y: 0, w: 32, h: 6, title: "CJS" },
            {
              default: () => [
                h(rootCjs.TText, { x: 0, y: 0, w: 28, value: "root text" }),
                h(experimentalCjs.TLogView, {
                  x: 0,
                  y: 2,
                  w: 28,
                  h: 2,
                  source: log.source,
                  version: log.version.value,
                  links: true,
                }),
              ],
            },
          );
      },
    };
    const app = cliCjs.createTerminalApp({ cols: 32, rows: 6, component: Consumer });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      const screen = Array.from({ length: app.terminal.size().rows }, (_, y) =>
        app.terminal
          .getRow(y)
          .map((cell: any) => cell.ch)
          .join(""),
      ).join("\n");
      expect(screen).toContain("root text");
      expect(screen).toContain("INFO cjs consumer");
      expect(screen).toContain("https://safe.dev");
    } finally {
      app.dispose();
    }

    const showOverlay = ref(true);
    const PlaneConsumer = {
      setup() {
        return () =>
          h(rootCjs.TView, { x: 0, y: 0, w: 24, h: 4 }, () => [
            h(vueCjs.TRenderPlane, { plane: "transcript" }, () =>
              h(rootCjs.TText, { x: 0, y: 0, w: 24, value: "transcript text" }),
            ),
            showOverlay.value
              ? h(vueCjs.TRenderPlane, { plane: "overlay" }, () =>
                  h(rootCjs.TText, { x: 0, y: 0, w: 24, value: "overlay text" }),
                )
              : null,
          ]);
      },
    };
    const planeApp = cliCjs.createTerminalApp({ cols: 24, rows: 4, component: PlaneConsumer });
    try {
      planeApp.mount();
      await nextTick();
      planeApp.scheduler.flushNow();
      expect(
        planeApp.terminal
          .getRow(0)
          .map((cell: any) => cell.ch)
          .join(""),
      ).toContain("overlay text");

      showOverlay.value = false;
      await nextTick();
      planeApp.scheduler.flushNow();
      expect(
        planeApp.terminal
          .getRow(0)
          .map((cell: any) => cell.ch)
          .join(""),
      ).toContain("transcript text");
    } finally {
      planeApp.dispose();
    }
  });
});
