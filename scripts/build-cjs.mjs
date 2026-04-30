import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.cjs",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["node14"],
  sourcemap: false,
  external: ["vue"],
});
