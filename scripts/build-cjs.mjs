import { builtinModules } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const nodeBuiltins = Array.from(
  new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
    "process",
    "node:process",
  ]),
);

const browserCjsNodeBuiltins = new Set(nodeBuiltins);
const forbidNodeBuiltinsPlugin = {
  name: "forbid-node-builtins",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!browserCjsNodeBuiltins.has(args.path)) return null;
      return {
        errors: [
          {
            text: `Browser-facing CJS entry imported Node builtin: ${args.path} from ${args.importer}`,
          },
        ],
      };
    });
  },
};

// Keep CJS as a separate esbuild step so the package can publish named `.cjs`
// files alongside tsdown's ESM and declaration output.
await build({
  entryPoints: {
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
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  format: "cjs",
  platform: "neutral",
  target: ["es2020"],
  sourcemap: false,
  // CJS intentionally bundles stream-markdown-parser because it only exposes
  // ESM entrypoints. Keep beautiful-mermaid external so the CJS bridge can
  // load the optional ESM peer through dynamic import at render time.
  external: ["vue", "beautiful-mermaid"],
  plugins: [forbidNodeBuiltinsPlugin],
});

mkdirSync("dist/agent", { recursive: true });
// Keep /agent/mermaid as a thin bridge over /mermaid so both entrypoints share
// the same optional-peer loader/cache and exported component identities.
writeFileSync("dist/agent/mermaid.js", `export * from "../mermaid.js";\n`);
writeFileSync(
  "dist/agent/mermaid.cjs",
  `"use strict";\nmodule.exports = require("../mermaid.cjs");\n`,
);

await build({
  entryPoints: {
    cli: "src/cli.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["node16"],
  sourcemap: false,
  external: ["vue"],
});
