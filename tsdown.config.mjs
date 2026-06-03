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
      mermaid: "src/mermaid.ts",
    },
    format: ["esm"],
    clean: false,
    dts: false,
    platform: "neutral",
    external: browserExternals,
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
  },
]);
