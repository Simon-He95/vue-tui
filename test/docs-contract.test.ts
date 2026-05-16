import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { describe, expect, it } from "vitest";

const movedRootExportMigrations = [
  ["TAnchor", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TFlow", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TRenderPlane", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TRenderLayer", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TTransition", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TInputBox", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TPathPicker", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TJsonEditor", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TMultilineModal", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TDebugOverlay", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["TRouterView", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useTerminal", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useRenderNode", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useLayout", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useTerminalRuntime", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useTerminalNode", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useVisibility", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useRoute", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["useRouter", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["createTerminalRouter", "@simon_he/vue-tui/vue", "../src/vue.js"],
  ["createRuntime", "@simon_he/vue-tui/runtime", "../src/runtime.js"],
  ["createFramePerfStore", "@simon_he/vue-tui/observability", "../src/observability.js"],
  ["framePerfNow", "@simon_he/vue-tui/observability", "../src/observability.js"],
  ["sanitizeDomHref", "@simon_he/vue-tui/core", "../src/core.js"],
  ["sanitizeTerminalHref", "@simon_he/vue-tui/core", "../src/core.js"],
  ["createDefaultTInputHostAdapter", "@simon_he/vue-tui/cli", "../src/cli.js"],
  ["defaultTInputHostPlugin", "@simon_he/vue-tui/cli", "../src/cli.js"],
  ["createTerminalApp", "@simon_he/vue-tui/cli", "../src/cli.js"],
  ["createStdoutRenderer", "@simon_he/vue-tui/cli", "../src/cli.js"],
  ["createStdinDriver", "@simon_he/vue-tui/cli", "../src/cli.js"],
  ["installTerminalCleanup", "@simon_he/vue-tui/cli", "../src/cli.js"],
] as const;

const releaseDocsFiles = [
  "README.md",
  "CHANGELOG.md",
  "package.json",
  ...listMarkdownFiles("docs"),
];

const staleReleaseText = [
  "0.1.0-rc",
  "0.x Release Candidate",
  "当前 npm 版本：0.0.8",
  "下一候选版本：0.1.0-rc.0",
  "migration-0.1.0",
  "packages/tui",
] as const;

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

describe("docs cleanup policy contract", () => {
  it("does not regress to stale 0.x release wording or old package paths", () => {
    for (const file of releaseDocsFiles) {
      const text = readFileSync(file, "utf8");

      for (const staleText of staleReleaseText) {
        expect(text, `${file} still contains ${staleText}`).not.toContain(staleText);
      }
    }
  });

  it("keeps package entrypoint docs aligned with exports", () => {
    const readme = readFileSync("README.md", "utf8");
    const maturity = readFileSync("docs/api-maturity.md", "utf8");
    const componentsApi = readFileSync("docs/generated/components-api.md", "utf8");
    const entrypoints = Object.keys(packageJson.exports)
      .filter((entrypoint) => entrypoint !== "./package.json")
      .map((entrypoint) =>
        entrypoint === "." ? "@simon_he/vue-tui" : `@simon_he/vue-tui/${entrypoint.slice(2)}`,
      );

    for (const entrypoint of entrypoints) {
      expect(readme).toContain(`\`${entrypoint}\``);
      expect(maturity).toContain(`\`${entrypoint}\``);
    }

    const exportedEntrypoints = new Set(entrypoints);
    const componentEntrypoints = Array.from(
      componentsApi.matchAll(/^Import: `([^`]+)`$/gm),
      (match) => match[1],
    );

    for (const entrypoint of componentEntrypoints) {
      expect(exportedEntrypoints.has(entrypoint)).toBe(true);
    }
  });

  it("documents installTerminalCleanup default signal policy as reraise", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain('By default, signal handling uses `signalPolicy: "reraise"`');
    expect(readme).toContain("those listeners keep ownership of termination");
    expect(readme).not.toContain("By default, signal handling is cleanup-only");
  });

  it("documents every moved root export migration", async () => {
    const migration = readFileSync("docs/migration-1.0.0-rc.0.md", "utf8");
    const root = await import("../src/index.js");
    const entries = new Map<string, any>();

    for (const [symbol, target, modulePath] of movedRootExportMigrations) {
      expect(migration).toMatch(new RegExp(String.raw`\|\s+\`${symbol}\`\s+\|`));
      expect(migration).toContain(target);
      expect(symbol in root).toBe(false);

      if (!entries.has(modulePath)) entries.set(modulePath, await import(modulePath));
      expect(symbol in entries.get(modulePath)).toBe(true);
    }
  });
});
