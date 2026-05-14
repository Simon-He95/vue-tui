import { builtinModules } from "node:module";
import { defineConfig } from "tsdown";

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig([
  {
    target: "es2020",
    entry: {
      index: "src/index.ts",
      markdown: "src/markdown.ts",
      experimental: "src/experimental.ts",
    },
    format: ["esm"],
    clean: true,
    dts: true,
    platform: "neutral",
    external: ["vue", "stream-markdown-parser"],
  },
  {
    target: "node16",
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    clean: false,
    dts: true,
    platform: "node",
    external: ["vue", ...nodeBuiltins],
  },
]);
