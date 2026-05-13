import { defineConfig } from "tsdown";

export default defineConfig({
  target: "node14",
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    markdown: "src/markdown.ts",
    experimental: "src/experimental.ts",
  },
  format: ["esm"],
  clean: true,
  dts: true,
  platform: "node",
  external: [
    "vue",
    "stream-markdown-parser",
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
});
