import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: "node",
  external: [
    "@simon_he/vue-tui",
    "@simon_he/vue-tui/cli",
    "@simon_he/vue-tui/experimental",
    "vue",
    "node:zlib",
  ],
  unbundle: true,
});
