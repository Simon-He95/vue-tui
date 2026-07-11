#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { build } from "esbuild";

const fixtures = {
  core: `import { createTerminal } from "@simon_he/vue-tui/core"; export const terminal = createTerminal({ cols: 80, rows: 24 });`,
  text: `import { textCellWidth, wrapByCells } from "@simon_he/vue-tui/vue"; export { textCellWidth, wrapByCells };`,
  components: `import { TerminalProvider, TText } from "@simon_he/vue-tui/vue"; export { TerminalProvider, TText };`,
};
const forbidden = [
  "cellCacheHitWidth1",
  "registeredBucketSizeP95Width1",
  "graphemeSegmentationRequiredCalls",
  "instrumentationEnabled",
];
function run(command: string, args: string[], cwd = process.cwd()): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const root = mkdtempSync(join(tmpdir(), "vue-tui-consumer-check-"));
try {
  const packDir = join(root, "pack");
  const consumer = join(root, "consumer");
  mkdirSync(packDir);
  mkdirSync(consumer);
  const pack = JSON.parse(run("pnpm", ["pack", "--json", "--pack-destination", packDir]));
  const filename = Array.isArray(pack) ? pack[0]?.filename : pack.filename;
  if (!filename) throw new Error("pnpm pack did not report a tarball");
  const tarball = filename.startsWith("/") ? filename : resolve(packDir, basename(filename));
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "consumer-check", private: true, type: "module" }),
  );
  run("pnpm", ["add", "--ignore-workspace", "--lockfile=false", tarball], consumer);
  for (const [name, source] of Object.entries(fixtures)) {
    const entry = join(consumer, `${name}.ts`);
    writeFileSync(entry, source);
    const result = await build({
      absWorkingDir: consumer,
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "esm",
      minify: true,
      treeShaking: true,
      external: ["vue", "beautiful-mermaid"],
      metafile: true,
    });
    const text = result.outputFiles[0]!.text;
    const packageInputs = Object.keys(result.metafile!.inputs).filter(
      (input) =>
        input.includes("node_modules/@simon_he/vue-tui/") ||
        input.includes("node_modules/.pnpm/@simon_he+vue-tui@"),
    );
    if (!packageInputs.length)
      throw new Error(`${name}: packed package was not in the module closure`);
    const instrumentationInputs = packageInputs.filter((input) =>
      /instrumentation(?:-noop)?\.[cm]?js$/.test(input),
    );
    const sentinels = forbidden.filter((value) => text.includes(value));
    if (instrumentationInputs.length || sentinels.length)
      throw new Error(
        `${name}: instrumentation leaked (${[...instrumentationInputs, ...sentinels].join(", ")})`,
      );
    console.log(
      `✅ ${name}: packed closure clean (${result.outputFiles[0]!.contents.byteLength} bytes)`,
    );
  }
  console.log("✅ Current packed consumer instrumentation closure check passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
