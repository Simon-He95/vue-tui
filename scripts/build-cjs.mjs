import { build } from "esbuild";

await build({
  entryPoints: {
    index: "src/index.ts",
    experimental: "src/experimental.ts",
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
