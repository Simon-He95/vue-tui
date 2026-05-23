import { readFileSync } from "node:fs";

type Maturity = "public" | "advanced" | "experimental";
type Runtime = "browser-safe" | "node-only" | "mixed";

type Manifest = {
  entrypoints: Record<
    string,
    {
      maturity: Maturity;
      runtime: Runtime;
      valueExports: string[];
      typeExports: string[];
    }
  >;
  components: Record<
    string,
    {
      entrypoint: string;
      maturity: Maturity;
      props: unknown[];
      events: unknown[];
    }
  >;
};

const manifest = JSON.parse(readFileSync("docs/generated/api-manifest.json", "utf8")) as Manifest;

const errors: string[] = [];

const expectedEntrypoints: Record<string, { maturity: Maturity; runtime: Runtime }> = {
  "@simon_he/vue-tui": { maturity: "public", runtime: "browser-safe" },
  "@simon_he/vue-tui/core": { maturity: "public", runtime: "browser-safe" },
  "@simon_he/vue-tui/renderer/dom": { maturity: "public", runtime: "browser-safe" },
  "@simon_he/vue-tui/vue": { maturity: "advanced", runtime: "browser-safe" },
  "@simon_he/vue-tui/runtime": { maturity: "advanced", runtime: "mixed" },
  "@simon_he/vue-tui/observability": { maturity: "advanced", runtime: "browser-safe" },
  "@simon_he/vue-tui/cli": { maturity: "public", runtime: "node-only" },
  "@simon_he/vue-tui/markdown": { maturity: "public", runtime: "browser-safe" },
  "@simon_he/vue-tui/experimental": { maturity: "experimental", runtime: "browser-safe" },
  "@simon_he/vue-tui/agent": { maturity: "experimental", runtime: "browser-safe" },
};

for (const [specifier, expected] of Object.entries(expectedEntrypoints)) {
  const actual = manifest.entrypoints[specifier];
  if (!actual) {
    errors.push(`${specifier} is missing from api-manifest entrypoints`);
    continue;
  }
  if (actual.maturity !== expected.maturity) {
    errors.push(
      `${specifier} maturity mismatch: expected ${expected.maturity}, got ${actual.maturity}`,
    );
  }
  if (actual.runtime !== expected.runtime) {
    errors.push(
      `${specifier} runtime mismatch: expected ${expected.runtime}, got ${actual.runtime}`,
    );
  }
}

for (const specifier of Object.keys(manifest.entrypoints)) {
  if (!expectedEntrypoints[specifier]) {
    errors.push(`${specifier} is present in api-manifest but not in expectedEntrypoints`);
  }
}

const root = manifest.entrypoints["@simon_he/vue-tui"];
if (root) {
  for (const forbidden of [
    "TForm",
    "TToastViewport",
    "TProgress",
    "TSpinner",
    "TTabs",
    "TSplitPane",
    "TVirtualList",
    "TLogView",
    "createTerminalApp",
    "createStdoutRenderer",
    "createStdinDriver",
    "createRuntime",
    "createFramePerfStore",
  ]) {
    if (root.valueExports.includes(forbidden)) {
      errors.push(`Root public entrypoint must not export ${forbidden}`);
    }
  }
}

for (const [name, component] of Object.entries(manifest.components)) {
  const entry = manifest.entrypoints[component.entrypoint];
  if (!entry) {
    errors.push(`${name} references missing entrypoint ${component.entrypoint}`);
    continue;
  }

  if (!entry.valueExports.includes(name)) {
    errors.push(`${name} is assigned to ${component.entrypoint} but is not exported there`);
  }

  if (component.maturity === "public" && entry.maturity !== "public") {
    errors.push(`${name} is Public but belongs to non-public entrypoint ${component.entrypoint}`);
  }

  if (component.entrypoint === "@simon_he/vue-tui" && component.maturity !== "public") {
    errors.push(`${name} is exported from root but is marked ${component.maturity}`);
  }

  if (
    component.entrypoint === "@simon_he/vue-tui/experimental" &&
    component.maturity !== "experimental"
  ) {
    errors.push(`${name} is exported from /experimental but is marked ${component.maturity}`);
  }

  if (!Array.isArray(component.props)) errors.push(`${name} has no props array in manifest`);
  if (!Array.isArray(component.events)) errors.push(`${name} has no events array in manifest`);
}

if (errors.length) {
  console.error("API manifest check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("API manifest check passed.");
