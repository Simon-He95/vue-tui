import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const components = [
  "TerminalProvider",
  "TText",
  "TLinkifyText",
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

describe("docs: components coverage", () => {
  it("docs/components.md lists all exported components", () => {
    const md = readFileSync(resolve(process.cwd(), "docs/components.md"), "utf8");
    for (const name of components) expect(md).toContain(`## ${name}`);
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

  it("only skips a missing API diff base for the first manifest baseline or explicit env", () => {
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
      });
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain("api:diff missing base manifest");

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

      const skippedFirstBaseline = spawnSync(tsx, [script], {
        cwd: repo,
        encoding: "utf8",
      });
      expect(skippedFirstBaseline.status).toBe(0);
      expect(skippedFirstBaseline.stdout).toContain(
        "api:diff missing base manifest; skipped for first manifest baseline after v0.0.0",
      );

      const skipped = spawnSync(tsx, [script], {
        cwd: tmp,
        encoding: "utf8",
        env: { ...process.env, VUE_TUI_API_DIFF_ALLOW_MISSING_BASE: "1" },
      });
      expect(skipped.status).toBe(0);
      expect(skipped.stdout).toContain("api:diff missing base manifest; skipped by explicit env");
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
