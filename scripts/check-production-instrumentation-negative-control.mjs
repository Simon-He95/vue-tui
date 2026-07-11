#!/usr/bin/env node

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const realPath = normalize(resolve(rootDir, "src/core/perf/instrumentation.ts"));
const noopPath = normalize(resolve(rootDir, "src/core/perf/instrumentation-noop.ts"));

function bytes(metafile, path) {
  let total = 0;
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, contribution] of Object.entries(output.inputs ?? {})) {
      if (normalize(resolve(rootDir, input)) === path) total += contribution.bytesInOutput;
    }
  }
  return total;
}

async function run(mode) {
  const stripped = mode === "stripped";
  const outdir = mkdtempSync(join(tmpdir(), `vue-tui-${mode}-`));
  const real = resolve(rootDir, "src/core/perf/instrumentation.ts");
  const noop = resolve(rootDir, "src/core/perf/instrumentation-noop.ts");
  const plugin = {
    name: "strip-control",
    setup(ctx) {
      if (!stripped) return;
      ctx.onResolve({ filter: /instrumentation/ }, (args) => {
        const resolved = resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
        return resolved === real ? { path: noop } : null;
      });
    },
  };
  try {
    const result = await build({
      entryPoints: ["src/core.ts", "src/vue.ts"],
      outdir,
      bundle: true,
      format: "esm",
      platform: "neutral",
      external: ["vue", "stream-markdown-parser", "beautiful-mermaid"],
      define: { __VUE_TUI_PERF_INSTRUMENTATION__: stripped ? "false" : "true" },
      minifySyntax: true,
      treeShaking: true,
      metafile: true,
      plugins: [plugin],
    });
    return { real: bytes(result.metafile, realPath), noop: bytes(result.metafile, noopPath) };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

const baseline = await run("baseline");
const stripped = await run("stripped");
console.log(`B control: real=${baseline.real}, noop=${baseline.noop}`);
console.log(`C control: real=${stripped.real}, noop=${stripped.noop}`);
if (baseline.real <= 0)
  throw new Error("Negative control failed: B did not contain real instrumentation");
if (stripped.real !== 0 || stripped.noop !== 0) {
  throw new Error("Positive control failed: C retained instrumentation bytes");
}
console.log("✅ Negative control B fails and stripped control C passes");
