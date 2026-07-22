import { builtinModules } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "tsdown";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname);

const nodeBuiltins = Array.from(
  new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
    "fs/promises",
    "node:fs/promises",
    "process",
    "node:process",
  ]),
);

const browserExternals = ["vue", "stream-markdown-parser", "beautiful-mermaid"];

// Production builds: strip performance instrumentation via dead-code elimination
const productionDefine = {
  __VUE_TUI_PERF_INSTRUMENTATION__: "false",
};

// Module paths for instrumentation replacement
const realInstrumentationPath = resolve(rootDir, "src/core/perf/instrumentation.ts");
const noopInstrumentationPath = resolve(rootDir, "src/core/perf/instrumentation-noop.ts");

// Rollup plugin to replace instrumentation imports with no-op stub
const instrumentationStripPlugin = (metafileName) => ({
  name: `instrumentation-strip-${metafileName}`,
  generateBundle(_options, bundle) {
    const outputs = {};
    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type !== "chunk") continue;
      const inputs = {};
      for (const moduleId of Object.keys(output.modules)) {
        inputs[moduleId] = {
          bytesInOutput: output.modules[moduleId].renderedLength ?? 0,
        };
      }
      outputs[`dist/${fileName}`] = { inputs };
    }
    mkdirSync(resolve(rootDir, ".tmp/build-metafiles"), { recursive: true });
    writeFileSync(
      resolve(rootDir, `.tmp/build-metafiles/${metafileName}.json`),
      JSON.stringify({ outputs }, null, 2),
    );
  },
  resolveId(source, importer) {
    // Handle relative imports with .js extension
    if (importer && source.includes("/perf/instrumentation")) {
      const importerDir = dirname(importer);
      // Remove .js if present for resolution
      const sourceWithoutExt = source.replace(/\.js$/, "");
      const resolved = resolve(importerDir, sourceWithoutExt + ".ts");

      if (resolved === realInstrumentationPath) {
        return noopInstrumentationPath;
      }
    }

    return null;
  },
});

export default defineConfig([
  {
    target: "es2020",
    entry: {
      index: "src/index.ts",
      core: "src/core.ts",
      runtime: "src/runtime.ts",
      "renderer-dom": "src/renderer-dom.ts",
      observability: "src/observability.ts",
      vue: "src/vue.ts",
      markdown: "src/markdown.ts",
      experimental: "src/experimental.ts",
      agent: "src/agent.ts",
      "agent/mermaid": "src/agent/mermaid.ts",
      mermaid: "src/mermaid.ts",
    },
    format: ["esm"],
    clean: false,
    dts: false,
    platform: "neutral",
    external: browserExternals,
    define: productionDefine,
    treeshake: true,
    plugins: [instrumentationStripPlugin("esm-browser")],
  },
  {
    target: "node16",
    entry: {
      cli: "src/cli.ts",
      "experimental/video/node": "src/experimental/video/node.ts",
    },
    format: ["esm"],
    clean: false,
    dts: false,
    platform: "node",
    external: ["vue", ...nodeBuiltins],
    define: productionDefine,
    treeshake: true,
    plugins: [instrumentationStripPlugin("esm-cli")],
  },
]);
