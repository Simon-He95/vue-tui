import { build } from "esbuild";

// Keep CJS as a separate esbuild step so the package can publish named `.cjs`
// files alongside tsdown's ESM and declaration output.
await build({
  entryPoints: {
    index: "src/index.ts",
    markdown: "src/markdown.ts",
    experimental: "src/experimental.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  format: "cjs",
  platform: "neutral",
  target: ["es2020"],
  sourcemap: false,
  // CJS intentionally bundles stream-markdown-parser because it only exposes
  // ESM entrypoints. ESM keeps it external via tsdown.
  external: ["vue"],
});

await build({
  entryPoints: {
    cli: "src/cli.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["node18"],
  sourcemap: false,
  external: ["vue"],
});
