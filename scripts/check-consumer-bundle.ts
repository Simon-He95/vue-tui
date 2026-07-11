#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { build, type Metafile } from "esbuild";

const VERSIONS = {
  A: "697472b0cc5c000fb46baf16e85c60d84ee22471",
  B: "4d543ff7042f9c2400fa50a9dff921a0f36f77a3",
  C: exec("git", ["rev-parse", "HEAD"]).trim(),
} as const;

const FIXTURES = {
  core: `
    import { createTerminal } from "@simon_he/vue-tui/core";
    export const terminal = createTerminal({ cols: 80, rows: 24 });
  `,
  textUtils: `
    import { textCellWidth, wrapByCells } from "@simon_he/vue-tui/vue";
    export { textCellWidth, wrapByCells };
  `,
  components: `
    import { TerminalProvider, TText } from "@simon_he/vue-tui/vue";
    export { TerminalProvider, TText };
  `,
} as const;

type Version = keyof typeof VERSIONS;
type Fixture = keyof typeof FIXTURES;

interface BundleMeasurement {
  raw: number;
  gzip: number;
  brotli: number;
  packageInputs: string[];
  instrumentationInputs: string[];
}

interface VersionContext {
  worktree: string;
  tarball: string;
  consumer: string;
}

function exec(command: string, args: string[], cwd = process.cwd()): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function packageInputs(metafile: Metafile): string[] {
  return Object.keys(metafile.inputs)
    .filter((input) => input.includes("node_modules/@simon_he/vue-tui/"))
    .sort();
}

function instrumentationInputs(inputs: string[]): string[] {
  return inputs.filter((input) => /(?:^|\/)instrumentation(?:-noop)?\.[cm]?js$/.test(input));
}

function installPackedConsumer(consumer: string, tarball: string): void {
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "vue-tui-consumer-check", private: true, type: "module" }, null, 2),
  );
  exec("pnpm", ["add", "--ignore-workspace", "--lockfile=false", tarball], consumer);
}

function prepareVersion(root: string, version: Version): VersionContext {
  const worktree = join(root, `worktree-${version}`);
  const packDir = join(root, `pack-${version}`);
  const consumer = join(root, `consumer-${version}`);
  mkdirSync(packDir, { recursive: true });

  console.log(`\n🔨 Preparing ${version} (${VERSIONS[version].slice(0, 8)})`);
  exec("git", ["worktree", "add", "--detach", worktree, VERSIONS[version]]);
  exec("pnpm", ["install", "--frozen-lockfile"], worktree);
  exec("pnpm", ["run", "build:raw"], worktree);

  const packJson = JSON.parse(
    exec("pnpm", ["pack", "--json", "--pack-destination", packDir], worktree),
  );
  const filename = Array.isArray(packJson) ? packJson[0]?.filename : packJson.filename;
  if (!filename) throw new Error(`pnpm pack did not report a tarball for ${version}`);
  const tarball = resolve(worktree, filename);
  if (!existsSync(tarball)) {
    const fallback = join(packDir, basename(filename));
    if (!existsSync(fallback))
      throw new Error(`Packed tarball missing for ${version}: ${filename}`);
    installPackedConsumer(consumer, fallback);
    return { worktree, tarball: fallback, consumer };
  }

  installPackedConsumer(consumer, tarball);
  return { worktree, tarball, consumer };
}

async function bundleFixture(
  context: VersionContext,
  fixture: Fixture,
): Promise<BundleMeasurement> {
  const entry = join(context.consumer, `${fixture}.ts`);
  writeFileSync(entry, FIXTURES[fixture]);

  const result = await build({
    absWorkingDir: context.consumer,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    minify: true,
    treeShaking: true,
    metafile: true,
    external: ["vue", "beautiful-mermaid"],
  });
  const output = result.outputFiles[0]?.contents;
  if (!output) throw new Error(`esbuild emitted no output for ${fixture}`);
  const inputs = packageInputs(result.metafile);
  if (inputs.length === 0) throw new Error(`${fixture} did not resolve the packed vue-tui package`);

  return {
    raw: output.byteLength,
    gzip: gzipSync(output).byteLength,
    brotli: brotliCompressSync(output).byteLength,
    packageInputs: inputs,
    instrumentationInputs: instrumentationInputs(inputs),
  };
}

function assertCleanCaller(): void {
  const status = exec("git", ["status", "--porcelain"]);
  if (status.trim()) {
    throw new Error(
      "Consumer A/B/C validation requires a clean caller worktree so C is exactly HEAD. Commit changes first.",
    );
  }
}

async function main(): Promise<void> {
  assertCleanCaller();
  const root = mkdtempSync(join(tmpdir(), "vue-tui-consumer-abc-"));
  const contexts: Partial<Record<Version, VersionContext>> = {};

  try {
    for (const version of Object.keys(VERSIONS) as Version[]) {
      contexts[version] = prepareVersion(root, version);
    }

    const measurements = {} as Record<Version, Record<Fixture, BundleMeasurement>>;
    for (const version of Object.keys(VERSIONS) as Version[]) {
      measurements[version] = {} as Record<Fixture, BundleMeasurement>;
      for (const fixture of Object.keys(FIXTURES) as Fixture[]) {
        measurements[version][fixture] = await bundleFixture(contexts[version]!, fixture);
      }
    }

    let failed = false;
    console.log("\n📊 Packed consumer A/B/C results (minified bundles)");
    for (const fixture of Object.keys(FIXTURES) as Fixture[]) {
      const a = measurements.A[fixture];
      const b = measurements.B[fixture];
      const c = measurements.C[fixture];
      const allowed = Math.max(512, Math.ceil(a.gzip * 0.01));
      const deltaCA = c.gzip - a.gzip;
      const deltaCB = c.gzip - b.gzip;
      const clean = c.instrumentationInputs.length === 0;
      const pass = clean && deltaCA <= allowed && c.gzip <= b.gzip;
      failed ||= !pass;

      console.log(`\n${pass ? "✅" : "❌"} ${fixture}`);
      console.log(`  A raw/gzip/br: ${a.raw}/${a.gzip}/${a.brotli}`);
      console.log(`  B raw/gzip/br: ${b.raw}/${b.gzip}/${b.brotli}`);
      console.log(`  C raw/gzip/br: ${c.raw}/${c.gzip}/${c.brotli}`);
      console.log(`  C-A gzip: ${deltaCA} B (allowed ${allowed} B)`);
      console.log(`  C-B gzip: ${deltaCB} B`);
      console.log(`  C instrumentation inputs: ${c.instrumentationInputs.length}`);
      console.log(`  C package closure: ${c.packageInputs.join(", ")}`);
    }

    mkdirSync(join(process.cwd(), "docs", "perf"), { recursive: true });
    writeFileSync(
      join(process.cwd(), "docs", "perf", "phase3.4-consumer-abc.json"),
      JSON.stringify({ commits: VERSIONS, measurements }, null, 2),
    );
    if (failed) throw new Error("Packed consumer A/B/C gate failed");
    console.log("\n✅ Packed consumer A/B/C gate passed");
  } finally {
    for (const context of Object.values(contexts)) {
      if (!context) continue;
      try {
        exec("git", ["worktree", "remove", "--force", context.worktree]);
      } catch {
        // Best-effort cleanup; the temp root is removed below.
      }
    }
    rmSync(root, { recursive: true, force: true });
    exec("git", ["worktree", "prune"]);
  }
}

main().catch((error) => {
  console.error("❌ Consumer A/B/C validation failed:", error);
  process.exit(1);
});
