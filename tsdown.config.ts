import { defineConfig } from "tsdown";

export default defineConfig({
  target: "node14",
  entry: ["src/index.ts", "src/markdown.ts", "src/experimental.ts"],
  format: ["esm"],
  clean: false,
  dts: false,
  platform: "node",
  external: [
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
