import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const components = [
  "TerminalProvider",
  "TText",
  "TLinkifyText",
  "TMarkdownText",
  "TMermaid",
  "TMermaidText",
  "TBadge",
  "TTag",
  "TDivider",
  "TCode",
  "TBox",
  "TView",
  "TTable",
  "TDataTable",
  "TTree",
  "TAnchor",
  "TFlow",
  "TInput",
  "TInputBox",
  "TCheckbox",
  "TRadioGroup",
  "TSwitch",
  "TSlider",
  "TFormField",
  "TForm",
  "TPasswordInput",
  "TAutocompleteInput",
  "TList",
  "TVirtualList",
  "TVirtualMarkdown",
  "TSelect",
  "TPathPicker",
  "TDialog",
  "TCommandPalette",
  "TContextMenu",
  "TPopover",
  "TTooltip",
  "TToastViewport",
  "TProgress",
  "TSpinner",
  "TStatusBar",
  "TBreadcrumb",
  "TKeyHint",
  "TTabs",
  "TSplitPane",
  "TTransition",
  "TDebugOverlay",
  "TRouterView",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function hasDocsSection(markdown: string, componentName: string): boolean {
  return new RegExp(`^##\\s+${escapeRegExp(componentName)}\\s*$`, "m").test(markdown);
}

function apiDiffEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };

  delete env.GITHUB_BASE_REF;
  delete env.VUE_TUI_API_DIFF_BASE_REF;
  delete env.VUE_TUI_API_DIFF_ALLOW_MISSING_BASE;
  delete env.VUE_TUI_API_DIFF_ALLOW_NOTES;
  delete env.VUE_TUI_API_DIFF_FAIL_ON_NOTES;

  return { ...env, ...overrides };
}

describe("docs: components coverage", () => {
  it("docs/components.md lists all exported components", () => {
    const md = readFileSync(resolve(process.cwd(), "docs/components.md"), "utf8");
    for (const name of components) expect(hasDocsSection(md, name)).toBe(true);
  });

  it("docs/generated/components-api.md mentions key components", () => {
    const md = readFileSync(resolve(process.cwd(), "docs/generated/components-api.md"), "utf8");
    for (const name of components) {
      // Generated API doc should mention every exported component.
      expect(md).toContain(name);
    }
  });

  it("documents API maturity and platform contracts", () => {
    const generated = readFileSync(
      resolve(process.cwd(), "docs/generated/components-api.md"),
      "utf8",
    );
    expect(generated).toContain("API maturity: **Public**");
    expect(generated).toContain("API maturity: **Advanced**");
    expect(generated).toContain("API maturity: **Experimental**");
    expect(generated).toContain(
      "> 此文件由 `scripts/generate-component-api-docs.ts` 自动生成，请勿手改。",
    );
    expect(generated).toMatch(
      /## TAnchor[\s\S]*?API maturity: \*\*Advanced\*\*[\s\S]*?Import: `@simon_he\/vue-tui\/vue`/u,
    );
    expect(generated).toMatch(
      /## TBox[\s\S]*?API maturity: \*\*Public\*\*[\s\S]*?Import: `@simon_he\/vue-tui`/u,
    );
    expect(generated).toMatch(
      /## TVirtualList[\s\S]*?API maturity: \*\*Experimental\*\*[\s\S]*?Import: `@simon_he\/vue-tui\/experimental`/u,
    );
    expect(generated).toContain("Import: `@simon_he/vue-tui/experimental`");

    const maturity = readFileSync(resolve(process.cwd(), "docs/api-maturity.md"), "utf8");
    expect(maturity).toContain("Public");
    expect(maturity).toContain("Advanced");
    expect(maturity).toContain("Experimental");
    expect(maturity).toContain("Internal");
    expect(maturity).toContain("Experimental Graduation");

    const contracts = readFileSync(resolve(process.cwd(), "docs/platform-contracts.md"), "utf8");
    expect(contracts).toContain("Browser Accessibility");
    expect(contracts).toContain("Renderer Capabilities");
    expect(contracts).toContain("Terminal Permissions");
  });

  it("keeps ambiguous public prop descriptions component-specific", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "docs/generated/api-manifest.json"), "utf8"),
    );

    const commandPaletteCloseOnSelect = manifest.components.TCommandPalette.props.find(
      (prop: { name: string }) => prop.name === "closeOnSelect",
    )?.description;
    const dataTableSelectable = manifest.components.TDataTable.props.find(
      (prop: { name: string }) => prop.name === "selectable",
    )?.description;

    expect(commandPaletteCloseOnSelect).toContain("command palette");
    expect(commandPaletteCloseOnSelect).not.toContain("suggestions");
    expect(dataTableSelectable).toBe("Enables row selection.");
  });

  it("records public markdown components in the component manifest", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "docs/generated/api-manifest.json"), "utf8"),
    );

    expect(manifest.components.TMarkdownText).toMatchObject({
      entrypoint: "@simon_he/vue-tui/markdown",
      maturity: "public",
    });
    expect(manifest.components.TVirtualMarkdown).toMatchObject({
      entrypoint: "@simon_he/vue-tui/markdown",
      maturity: "public",
    });
  });

  it("does not treat type-only exports as components", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "docs/generated/api-manifest.json"), "utf8"),
    );

    expect(manifest.components).not.toHaveProperty("TFormRule");
    expect(manifest.components).not.toHaveProperty("TFormContext");
    expect(manifest.components).not.toHaveProperty("TSelectValueMode");
    expect(manifest.components).not.toHaveProperty("TCommandPaletteMatcher");
  });

  it("records and diffs type-only entrypoint exports", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const root = manifest.entrypoints["@simon_he/vue-tui"];

    expect(root.valueExports).toContain("TSelect");
    expect(root.typeExports).toEqual(
      expect.arrayContaining([
        "TCommandPaletteSelectPayload",
        "TDataTableSorter",
        "TSelectValueMode",
      ]),
    );

    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));
    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const base = JSON.parse(JSON.stringify(manifest));
      base.entrypoints["@simon_he/vue-tui"].typeExports.push("RemovedPublicType");
      writeFileSync(basePath, `${JSON.stringify(base)}\n`);

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        ["scripts/diff-api-manifest.ts", "--base", basePath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "@simon_he/vue-tui.RemovedPublicType type export was removed",
      );
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("reports newly added public API surface as notes", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));
    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const base = JSON.parse(JSON.stringify(manifest));
      delete base.entrypoints["@simon_he/vue-tui/markdown"];
      base.entrypoints["@simon_he/vue-tui"].valueExports = base.entrypoints[
        "@simon_he/vue-tui"
      ].valueExports.filter((name: string) => name !== "TBadge");
      base.entrypoints["@simon_he/vue-tui"].typeExports = base.entrypoints[
        "@simon_he/vue-tui"
      ].typeExports.filter((name: string) => name !== "TFeedbackTone");
      delete base.components.TTag;
      base.components.TSelect.props = base.components.TSelect.props.filter(
        (prop: { name: string }) => prop.name !== "valueMode",
      );
      base.components.TSelect.events = base.components.TSelect.events.filter(
        (event: { name: string }) => event.name !== "change",
      );
      writeFileSync(basePath, `${JSON.stringify(base)}\n`);

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        ["scripts/diff-api-manifest.ts", "--base", basePath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("@simon_he/vue-tui/markdown entrypoint was added");
      expect(result.stdout).toContain("@simon_he/vue-tui.TBadge value export was added");
      expect(result.stdout).toContain("@simon_he/vue-tui.TFeedbackTone type export was added");
      expect(result.stdout).toContain("TTag component was added at @simon_he/vue-tui");
      expect(result.stdout).toContain("TSelect.valueMode optional prop was added");
      expect(result.stdout).toContain("TSelect.change event was added");
      expect(result.stdout).not.toContain("No API drift detected.");
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("flags public entrypoint maturity and runtime drift", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));

    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const current = JSON.parse(JSON.stringify(manifest));
      current.entrypoints["@simon_he/vue-tui"].maturity = "advanced";
      current.entrypoints["@simon_he/vue-tui"].runtime = "node-only";

      mkdirSync(resolve(tmp, "docs/generated"), { recursive: true });
      writeFileSync(basePath, `${JSON.stringify(manifest)}\n`);
      writeFileSync(
        resolve(tmp, "docs/generated/api-manifest.json"),
        `${JSON.stringify(current)}\n`,
      );

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        [resolve(process.cwd(), "scripts/diff-api-manifest.ts"), "--base", basePath],
        { cwd: tmp, encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "@simon_he/vue-tui entrypoint maturity changed public -> advanced",
      );
      expect(result.stderr).toContain(
        "@simon_he/vue-tui entrypoint runtime changed browser-safe -> node-only",
      );
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("flags newly added required public props as breaking", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));
    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const base = JSON.parse(JSON.stringify(manifest));
      base.components.TBadge.props = base.components.TBadge.props.filter(
        (prop: { name: string }) => prop.name !== "value",
      );
      writeFileSync(basePath, `${JSON.stringify(base)}\n`);

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        ["scripts/diff-api-manifest.ts", "--base", basePath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("TBadge.value required prop was added");
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("flags public prop default changes as breaking", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));
    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const base = JSON.parse(JSON.stringify(manifest));
      const prop = base.components.TAutocompleteInput.props.find(
        (candidate: { name: string }) => candidate.name === "closeOnSelect",
      );
      prop.defaultValue = "false";
      writeFileSync(basePath, `${JSON.stringify(base)}\n`);

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        ["scripts/diff-api-manifest.ts", "--base", basePath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("TAutocompleteInput.closeOnSelect changed default");
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("reports public props becoming optional as non-breaking notes", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));
    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const current = JSON.parse(JSON.stringify(manifest));
      const prop = current.components.TBadge.props.find(
        (candidate: { name: string }) => candidate.name === "value",
      );
      prop.required = false;

      mkdirSync(resolve(tmp, "docs/generated"), { recursive: true });
      writeFileSync(basePath, `${JSON.stringify(manifest)}\n`);
      writeFileSync(
        resolve(tmp, "docs/generated/api-manifest.json"),
        `${JSON.stringify(current)}\n`,
      );

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        [resolve(process.cwd(), "scripts/diff-api-manifest.ts"), "--base", basePath],
        { cwd: tmp, encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("TBadge.value changed required true -> false");
      expect(result.stderr).not.toContain("Non-public API changes require");
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("fails non-public API notes in CI unless explicitly allowed", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));

    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const base = JSON.parse(JSON.stringify(manifest));
      base.entrypoints["@simon_he/vue-tui/vue"].typeExports.push("RemovedAdvancedType");
      writeFileSync(basePath, `${JSON.stringify(base)}\n`);

      const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
      const args = ["scripts/diff-api-manifest.ts", "--base", basePath];
      const local = spawnSync(tsx, args, {
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "false",
          VUE_TUI_API_DIFF_ALLOW_NOTES: "0",
          VUE_TUI_API_DIFF_FAIL_ON_NOTES: "0",
        },
      });

      expect(local.status).toBe(0);
      expect(local.stdout).toContain(
        "@simon_he/vue-tui/vue.RemovedAdvancedType type export was removed",
      );

      const ciFailed = spawnSync(tsx, args, {
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "true",
          VUE_TUI_API_DIFF_ALLOW_NOTES: "0",
          VUE_TUI_API_DIFF_FAIL_ON_NOTES: "0",
        },
      });

      expect(ciFailed.status).toBe(1);
      expect(ciFailed.stderr).toContain(
        "Non-public API changes require a release note, migration note, API maturity note with an API review marker, or explicit CI override.",
      );

      const allowed = spawnSync(tsx, args, {
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "true",
          VUE_TUI_API_DIFF_ALLOW_NOTES: "1",
          VUE_TUI_API_DIFF_FAIL_ON_NOTES: "0",
        },
      });

      expect(allowed.status).toBe(0);
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("accepts non-public API notes in CI when a release or migration note has a review marker", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));

    try {
      const repo = resolve(tmp, "repo");
      mkdirSync(resolve(repo, "docs/generated"), { recursive: true });
      expect(spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" }).status).toBe(0);

      const base = JSON.parse(JSON.stringify(manifest));
      base.entrypoints["@simon_he/vue-tui/vue"].typeExports.push("RemovedAdvancedType");
      writeFileSync(resolve(repo, "docs/generated/api-manifest.json"), `${JSON.stringify(base)}\n`);
      expect(
        spawnSync("git", ["add", "docs/generated/api-manifest.json"], {
          cwd: repo,
          encoding: "utf8",
        }).status,
      ).toBe(0);
      expect(
        spawnSync(
          "git",
          [
            "-c",
            "user.name=vue-tui-test",
            "-c",
            "user.email=vue-tui-test@example.com",
            "commit",
            "-m",
            "base",
          ],
          { cwd: repo, encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(spawnSync("git", ["branch", "base"], { cwd: repo, encoding: "utf8" }).status).toBe(0);

      writeFileSync(
        resolve(repo, "docs/generated/api-manifest.json"),
        `${JSON.stringify(manifest)}\n`,
      );

      const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
      const script = resolve(process.cwd(), "scripts/diff-api-manifest.ts");
      const failed = spawnSync(tsx, [script, "--base-ref", "base"], {
        cwd: repo,
        encoding: "utf8",
        env: apiDiffEnv({ CI: "true" }),
      });

      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain(
        "Non-public API changes require a release note, migration note, API maturity note with an API review marker, or explicit CI override.",
      );

      mkdirSync(resolve(repo, "docs"), { recursive: true });
      writeFileSync(
        resolve(repo, "docs/migration-non-public.md"),
        "Non-public API migration note.\n",
      );
      expect(
        spawnSync(
          "git",
          ["add", "docs/generated/api-manifest.json", "docs/migration-non-public.md"],
          {
            cwd: repo,
            encoding: "utf8",
          },
        ).status,
      ).toBe(0);
      expect(
        spawnSync(
          "git",
          [
            "-c",
            "user.name=vue-tui-test",
            "-c",
            "user.email=vue-tui-test@example.com",
            "commit",
            "-m",
            "api notes",
          ],
          { cwd: repo, encoding: "utf8" },
        ).status,
      ).toBe(0);

      const stillFailed = spawnSync(tsx, [script, "--base-ref", "base"], {
        cwd: repo,
        encoding: "utf8",
        env: apiDiffEnv({ CI: "true" }),
      });

      expect(stillFailed.status).toBe(1);
      expect(stillFailed.stderr).toContain(
        "Non-public API changes require a release note, migration note, API maturity note with an API review marker, or explicit CI override.",
      );

      writeFileSync(
        resolve(repo, "docs/migration-non-public.md"),
        "# Non-public API migration note\n\n<!-- vue-tui-api-diff-reviewed -->\n",
      );
      expect(
        spawnSync("git", ["add", "docs/migration-non-public.md"], {
          cwd: repo,
          encoding: "utf8",
        }).status,
      ).toBe(0);
      expect(
        spawnSync(
          "git",
          [
            "-c",
            "user.name=vue-tui-test",
            "-c",
            "user.email=vue-tui-test@example.com",
            "commit",
            "-m",
            "api review marker",
          ],
          { cwd: repo, encoding: "utf8" },
        ).status,
      ).toBe(0);

      const passed = spawnSync(tsx, [script, "--base-ref", "base"], {
        cwd: repo,
        encoding: "utf8",
        env: apiDiffEnv({ CI: "true" }),
      });

      expect(passed.status).toBe(0);
      expect(passed.stdout).toContain(
        "Non-public API changes were accepted because a release/migration/API maturity note includes an API review marker.",
      );
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("only skips a missing API diff base for the first manifest baseline, non-CI no-tag clones, or explicit env", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));

    try {
      mkdirSync(resolve(tmp, "docs/generated"), { recursive: true });
      writeFileSync(
        resolve(tmp, "docs/generated/api-manifest.json"),
        `${JSON.stringify(manifest)}\n`,
      );

      const script = resolve(process.cwd(), "scripts/diff-api-manifest.ts");
      const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
      const failed = spawnSync(tsx, [script], {
        cwd: tmp,
        encoding: "utf8",
        env: apiDiffEnv({ CI: "true" }),
      });
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain("api:diff missing base manifest");

      const skippedNoTag = spawnSync(tsx, [script], {
        cwd: tmp,
        encoding: "utf8",
        env: apiDiffEnv({ CI: "false" }),
      });
      expect(skippedNoTag.status).toBe(0);
      expect(skippedNoTag.stdout).toContain(
        "api:diff missing base manifest; skipped because no git tag was found outside CI",
      );

      const repo = resolve(tmp, "repo");
      mkdirSync(repo);
      expect(spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" }).status).toBe(0);
      writeFileSync(resolve(repo, "README.md"), "baseline\n");
      expect(spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" }).status).toBe(
        0,
      );
      expect(
        spawnSync(
          "git",
          [
            "-c",
            "user.name=vue-tui-test",
            "-c",
            "user.email=vue-tui-test@example.com",
            "commit",
            "-m",
            "baseline",
          ],
          { cwd: repo, encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(spawnSync("git", ["tag", "v0.0.0"], { cwd: repo, encoding: "utf8" }).status).toBe(0);
      mkdirSync(resolve(repo, "docs/generated"), { recursive: true });
      writeFileSync(
        resolve(repo, "docs/generated/api-manifest.json"),
        `${JSON.stringify(manifest)}\n`,
      );
      expect(
        spawnSync("git", ["add", "docs/generated/api-manifest.json"], {
          cwd: repo,
          encoding: "utf8",
        }).status,
      ).toBe(0);
      expect(
        spawnSync(
          "git",
          [
            "-c",
            "user.name=vue-tui-test",
            "-c",
            "user.email=vue-tui-test@example.com",
            "commit",
            "-m",
            "current manifest",
          ],
          { cwd: repo, encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(spawnSync("git", ["tag", "v0.0.1"], { cwd: repo, encoding: "utf8" }).status).toBe(0);

      const skippedFirstBaseline = spawnSync(tsx, [script], {
        cwd: repo,
        encoding: "utf8",
        env: apiDiffEnv(),
      });
      expect(skippedFirstBaseline.status).toBe(0);
      expect(skippedFirstBaseline.stdout).toContain(
        "api:diff missing base manifest; skipped for first manifest baseline after v0.0.0",
      );

      const skipped = spawnSync(tsx, [script], {
        cwd: tmp,
        encoding: "utf8",
        env: apiDiffEnv({ VUE_TUI_API_DIFF_ALLOW_MISSING_BASE: "1" }),
      });
      expect(skipped.status).toBe(0);
      expect(skipped.stdout).toContain("api:diff missing base manifest; skipped by explicit env");
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("reads the API diff base manifest from an explicit ref", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));

    try {
      const repo = resolve(tmp, "repo");
      mkdirSync(resolve(repo, "docs/generated"), { recursive: true });
      expect(spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" }).status).toBe(0);

      const base = JSON.parse(JSON.stringify(manifest));
      base.components.TBadge.props = base.components.TBadge.props.filter(
        (prop: { name: string }) => prop.name !== "value",
      );
      writeFileSync(resolve(repo, "docs/generated/api-manifest.json"), `${JSON.stringify(base)}\n`);
      expect(
        spawnSync("git", ["add", "docs/generated/api-manifest.json"], {
          cwd: repo,
          encoding: "utf8",
        }).status,
      ).toBe(0);
      expect(
        spawnSync(
          "git",
          [
            "-c",
            "user.name=vue-tui-test",
            "-c",
            "user.email=vue-tui-test@example.com",
            "commit",
            "-m",
            "base",
          ],
          { cwd: repo, encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(spawnSync("git", ["branch", "base"], { cwd: repo, encoding: "utf8" }).status).toBe(0);

      writeFileSync(
        resolve(repo, "docs/generated/api-manifest.json"),
        `${JSON.stringify(manifest)}\n`,
      );

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        [resolve(process.cwd(), "scripts/diff-api-manifest.ts"), "--base-ref", "base"],
        { cwd: repo, encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("TBadge.value required prop was added");
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("skips API diff when an explicit ref has no manifest", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));

    try {
      const repo = resolve(tmp, "repo");
      mkdirSync(resolve(repo, "docs/generated"), { recursive: true });
      expect(spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" }).status).toBe(0);
      writeFileSync(resolve(repo, "README.md"), "baseline\n");
      expect(spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" }).status).toBe(
        0,
      );
      expect(
        spawnSync(
          "git",
          [
            "-c",
            "user.name=vue-tui-test",
            "-c",
            "user.email=vue-tui-test@example.com",
            "commit",
            "-m",
            "base",
          ],
          { cwd: repo, encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(spawnSync("git", ["branch", "base"], { cwd: repo, encoding: "utf8" }).status).toBe(0);

      writeFileSync(
        resolve(repo, "docs/generated/api-manifest.json"),
        `${JSON.stringify(manifest)}\n`,
      );

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        [resolve(process.cwd(), "scripts/diff-api-manifest.ts"), "--base-ref", "base"],
        { cwd: repo, encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "api:diff missing base manifest; skipped for first manifest baseline against base",
      );
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });

  it("flags public component entrypoint and maturity drift", () => {
    const manifestPath = resolve(process.cwd(), "docs/generated/api-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tmp = mkdtempSync(resolve(tmpdir(), "vue-tui-api-"));

    try {
      const basePath = resolve(tmp, "api-manifest.json");
      const current = JSON.parse(JSON.stringify(manifest));
      current.components.TBadge.entrypoint = "@simon_he/vue-tui/vue";
      current.components.TBadge.maturity = "advanced";

      mkdirSync(resolve(tmp, "docs/generated"), { recursive: true });
      writeFileSync(basePath, `${JSON.stringify(manifest)}\n`);
      writeFileSync(
        resolve(tmp, "docs/generated/api-manifest.json"),
        `${JSON.stringify(current)}\n`,
      );

      const result = spawnSync(
        resolve(process.cwd(), "node_modules/.bin/tsx"),
        [resolve(process.cwd(), "scripts/diff-api-manifest.ts"), "--base", basePath],
        { cwd: tmp, encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "TBadge entrypoint changed @simon_he/vue-tui -> @simon_he/vue-tui/vue",
      );
      expect(result.stderr).toContain("TBadge maturity changed public -> advanced");
    } finally {
      rmSync(tmp, { force: true, recursive: true });
    }
  });
});
