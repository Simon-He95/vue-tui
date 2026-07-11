#!/usr/bin/env tsx

/**
 * Phase 3.4 built-artifact A/B/C runtime validation.
 *
 * A: Phase 2 baseline (pre-instrumentation)
 * B: Phase 3 instrumentation, disabled
 * C: the commit that invokes this script (production strip)
 *
 * Every measurement runs in a fresh Node process against dist/*.js or
 * dist/*.cjs. The coordinator uses all six balanced A/B/C permutations and
 * bootstraps paired p50 ratios. It never checks out or modifies the caller's
 * worktree.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COMMITS = {
  A: "697472b0cc5c000fb46baf16e85c60d84ee22471",
  B: "4d543ff7042f9c2400fa50a9dff921a0f36f77a3",
  C: exec("git", ["rev-parse", "HEAD"]).trim(),
} as const;

const PERMUTATIONS = ["ABC", "ACB", "BAC", "BCA", "CAB", "CBA"] as const;
const FORMATS = ["esm", "cjs"] as const;
const THRESHOLD = 1.05;
const BOOTSTRAP_ITERATIONS = 10_000;
const BOOTSTRAP_SEED = 0x33414243;

type Version = keyof typeof COMMITS;
type Format = (typeof FORMATS)[number];
type ScenarioResult = { iterations: number; p50: number; samples: number[] };
type ChildResult = { format: Format; scenarios: Record<string, ScenarioResult> };

const CHILD_SOURCE = String.raw`
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [vuePath, corePath, format] = process.argv.slice(2);
const load = async (path) => format === "cjs"
  ? createRequire(import.meta.url)(path)
  : import(pathToFileURL(path).href);
const vue = await load(vuePath);
const core = await load(corePath);
const { textCellWidth, wrapByCells } = vue;
const { createTerminal } = core;
if (typeof textCellWidth !== "function" || typeof wrapByCells !== "function" || typeof createTerminal !== "function") {
  throw new Error("Expected built exports are unavailable");
}
const targetNs = 3_000_000n;
const maxIterations = 1 << 22;
const sampleCount = 80;
let sink = 0;
const measure = (fn, iterations) => {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) sink ^= fn(i) | 0;
  return process.hrtime.bigint() - start;
};
const calibrate = (fn) => {
  let iterations = 1;
  while (iterations < maxIterations) {
    if (measure(fn, iterations) >= targetNs) return iterations;
    iterations *= 2;
  }
  return iterations;
};
const percentile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
};
const benchmark = (factory) => {
  const calibrationFn = factory();
  const iterations = calibrate(calibrationFn);
  for (let i = 0; i < 12; i++) measure(factory(), iterations);
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    const fn = factory();
    samples.push(Number(measure(fn, iterations)) / iterations);
  }
  return { iterations, p50: percentile(samples, 0.5), samples };
};
const ascii = "a".repeat(100);
const cjk = "中文測試終端介面".repeat(13).slice(0, 100);
const uniqueCjk = Array.from({ length: 8192 }, (_, i) => "唯一中文內容" + i.toString(36) + "測試");
const uniqueWrap = Array.from({ length: 8192 }, (_, i) => "換行中文內容" + i.toString(36) + "測試".repeat(8));
const results = {
  textCellWidth_ascii_long_fast_path: benchmark(() => () => textCellWidth(ascii)),
  textCellWidth_cjk_long_hot: benchmark(() => () => textCellWidth(cjk)),
  textCellWidth_cjk_cycling_working_set: benchmark(() => { let i = 0; return () => textCellWidth(uniqueCjk[i++ & 8191]); }),
  wrapByCells_cjk_long_hot: benchmark(() => () => wrapByCells(cjk, 40).length),
  wrapByCells_cjk_cycling_working_set: benchmark(() => { let i = 0; return () => wrapByCells(uniqueWrap[i++ & 8191], 40).length; }),
  terminal_write_supplementary_cjk_hot: benchmark(() => {
    const terminal = createTerminal({ cols: 80, rows: 24 });
    return () => { terminal.setCursor(0, 0); terminal.write("𠀀𠮷𠀀𠮷"); return 1; };
  }),
};
process.stdout.write(JSON.stringify({ format, scenarios: results, sink }));
`;

function exec(command: string, args: string[], cwd?: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function bootstrapMedianCI(values: number[], seed: number): [number, number] {
  const random = rng(seed);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration++) {
    const sample = Array.from(
      { length: values.length },
      () => values[Math.floor(random() * values.length)]!,
    );
    estimates.push(median(sample));
  }
  estimates.sort((a, b) => a - b);
  return [
    estimates[Math.floor(estimates.length * 0.025)]!,
    estimates[Math.floor(estimates.length * 0.975)]!,
  ];
}

function addWorktree(repository: string, directory: string, commit: string): void {
  exec("git", ["worktree", "add", "--detach", directory, commit], repository);
}

function removeWorktree(repository: string, directory: string): void {
  try {
    exec("git", ["worktree", "remove", "--force", directory], repository);
  } catch {
    // The temporary root is removed below even if git already pruned it.
  }
}

function main(): void {
  const repository = exec("git", ["rev-parse", "--show-toplevel"]).trim();
  if (exec("git", ["status", "--porcelain"], repository).trim()) {
    throw new Error("Commit or discard local changes before running built-dist A/B/C validation");
  }

  const root = mkdtempSync(join(tmpdir(), "vue-tui-built-abc-"));
  const childPath = join(root, "run-built-benchmark.mjs");
  const resultPath = join(repository, "docs", "perf", "phase3.4-built-dist-abc.json");
  writeFileSync(childPath, CHILD_SOURCE);
  mkdirSync(join(repository, "docs", "perf"), { recursive: true });

  const worktrees = {} as Record<Version, string>;
  try {
    for (const version of Object.keys(COMMITS) as Version[]) {
      const directory = join(root, version);
      addWorktree(repository, directory, COMMITS[version]);
      worktrees[version] = directory;
      exec("pnpm", ["install", "--frozen-lockfile"], directory);
      exec("pnpm", ["run", "build:raw"], directory);
    }

    const observations: Record<Format, Record<Version, ChildResult[]>> = {
      esm: { A: [], B: [], C: [] },
      cjs: { A: [], B: [], C: [] },
    };

    for (const format of FORMATS) {
      for (const permutation of PERMUTATIONS) {
        for (const version of permutation.split("") as Version[]) {
          const dist = join(worktrees[version], "dist");
          const extension = format === "esm" ? "js" : "cjs";
          const output = exec("node", [
            childPath,
            join(dist, `vue.${extension}`),
            join(dist, `core.${extension}`),
            format,
          ]);
          observations[format][version].push(JSON.parse(output) as ChildResult);
        }
      }
    }

    const analysis: Record<string, unknown> = {};
    let failed = false;
    for (const format of FORMATS) {
      const scenarios = Object.keys(observations[format].A[0]!.scenarios);
      analysis[format] = {};
      for (let index = 0; index < scenarios.length; index++) {
        const scenario = scenarios[index]!;
        const ratios = (numerator: Version, denominator: Version) =>
          observations[format][numerator].map(
            (run, runIndex) =>
              run.scenarios[scenario]!.p50 /
              observations[format][denominator][runIndex]!.scenarios[scenario]!.p50,
          );
        const ca = ratios("C", "A");
        const ba = ratios("B", "A");
        const cb = ratios("C", "B");
        const ci = bootstrapMedianCI(ca, BOOTSTRAP_SEED + index + (format === "cjs" ? 100 : 0));
        const status = ci[1] <= THRESHOLD ? "PASS" : ci[0] > THRESHOLD ? "FAIL" : "INCONCLUSIVE";
        if (status !== "PASS") failed = true;
        (analysis[format] as Record<string, unknown>)[scenario] = {
          status,
          cOverA: { ratios: ca, median: median(ca), ci95: ci },
          bOverA: { ratios: ba, median: median(ba) },
          cOverB: { ratios: cb, median: median(cb) },
        };
        console.log(
          `${format} ${scenario}: ${status} C/A=${median(ca).toFixed(4)} CI=[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`,
        );
      }
    }

    writeFileSync(
      resultPath,
      JSON.stringify(
        {
          config: {
            commits: COMMITS,
            permutations: PERMUTATIONS,
            formats: FORMATS,
            threshold: THRESHOLD,
          },
          observations,
          analysis,
        },
        null,
        2,
      ),
    );
    if (failed) process.exitCode = 2;
  } finally {
    for (const directory of Object.values(worktrees)) removeWorktree(repository, directory);
    rmSync(root, { recursive: true, force: true });
  }
}

main();
