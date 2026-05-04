import { build } from "esbuild";

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
  platform: "node",
  target: ["node14"],
  sourcemap: false,
  external: ["vue"],
});
