import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nodeBuiltins = Array.from(
  new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
    "process",
    "node:process",
  ]),
);

export default defineConfig({
  target: "node18",
  entry: {
    cli: "src/cli.ts",
  },
  format: ["esm"],
  platform: "node",
  clean: true,
  dts: false,
  external: nodeBuiltins,
  noExternal: ["vue", /^@vue\//u, "@simon_he/vue-tui", /^@simon_he\/vue-tui\//u],
  alias: {
    "@simon_he/vue-tui": resolve(rootDir, "src/index.ts"),
    "@simon_he/vue-tui/cli": resolve(rootDir, "src/cli.ts"),
    "@simon_he/vue-tui/core": resolve(rootDir, "src/core.ts"),
    "@simon_he/vue-tui/vue": resolve(rootDir, "src/vue.ts"),
  },
});
