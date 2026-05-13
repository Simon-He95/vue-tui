import { defineConfig } from "tsdown";

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
    target: "node18",
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    clean: false,
    dts: true,
    platform: "node",
    external: [
      "vue",
      "fs",
      "node:fs",
      "node:fs/promises",
      "child_process",
      "node:child_process",
      "node:events",
      "node:buffer",
      "process",
      "node:process",
      "url",
      "node:url",
      "util",
    ],
  },
]);
