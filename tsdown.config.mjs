import { builtinModules } from "node:module";
import { defineConfig } from "tsdown";

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

// Production alias: replace instrumentation with no-op stub
const productionAlias = {
  "./perf/instrumentation.js": "./perf/instrumentation-noop.js",
  "../core/perf/instrumentation.js": "../core/perf/instrumentation-noop.js",
  "../../core/perf/instrumentation.js": "../../core/perf/instrumentation-noop.js",
};

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
    resolve: {
      alias: productionAlias,
    },
  },
  {
    target: "node16",
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    clean: false,
    dts: false,
    platform: "node",
    external: ["vue", ...nodeBuiltins],
    define: productionDefine,
    treeshake: true,
    resolve: {
      alias: productionAlias,
    },
  },
]);
