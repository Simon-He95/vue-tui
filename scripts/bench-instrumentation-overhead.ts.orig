/**
 * Phase 3.3: Instrumentation Overhead Validation (v4 - Final)
 *
 * All decision-quality issues fixed:
 * - Pre-registered gating scenarios
 * - Paired p50 and p95 analysis
 * - Deterministic bootstrap with seed
 * - Full audit trail preserved
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COMMIT_A = "697472b0cc5c000fb46baf16e85c60d84ee22471";
const COMMIT_B = "4d543ff7042f9c2400fa50a9dff921a0f36f77a3";
const PAIRS = 10;
const WARMUP = 50;
const ITERATIONS = 500;
const THRESHOLD = 0.05;
const BOOTSTRAP_ITERATIONS = 10000;
const BOOTSTRAP_SEED = 0x33120202; // Phase 3.3, Feb 2nd

// Pre-registered gating scenarios (instrumented paths)
const GATING_SCENARIOS = [
  "terminal_write_supplementary_cjk_hot",
  "terminal_write_supplementary_cjk_cycling_rows",
  "textCellWidth_ascii_long_fast_path",
  "textCellWidth_cjk_long_hot",
  "textCellWidth_cjk_unique",
  "textCellWidth_complex_grapheme_hot",
  "wrapByCells_cjk_long_hot",
  "wrapByCells_cjk_unique",
] as const;

interface BenchmarkReport {
  commit: string;
  node: string;
  v8: string;
  os: string;
  cpu: string;
  arch: string;
  gitDirty: boolean;
  warmup: number;
  samples: number;
  timestamp: string;
  results: Record<string, { p50: number; p95: number; p99: number; cv?: number }>;
}

interface PairedRun {
  index: number;
  order: "AB" | "BA";
  reportA: BenchmarkReport;
  reportB: BenchmarkReport;
}

interface MetricAnalysis {
  pairedRatios: number[];
  medianRatio: number;
  ciLower: number;
  ciUpper: number;
}

interface ScenarioResult {
  scenario: string;
  gating: boolean;
  p50: MetricAnalysis;
  p95: MetricAnalysis;
  status: "pass" | "fail" | "inconclusive" | "informational";
}

function log(msg: string) {
  console.log(`[Overhead] ${msg}`);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// Deterministic PRNG (LCG)
class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 2 ** 32;
    return this.state / 2 ** 32;
  }
}

function pairedBootstrapCI(ratios: number[], seed: number, iters: number): [number, number] {
  const rng = new SeededRandom(seed);
  const n = ratios.length;
  const boots: number[] = [];

  for (let i = 0; i < iters; i++) {
    const resampled: number[] = [];
    for (let j = 0; j < n; j++) {
      resampled.push(ratios[Math.floor(rng.next() * n)]);
    }
    boots.push(percentile(resampled, 50));
  }

  boots.sort((a, b) => a - b);
  return [percentile(boots, 2.5), percentile(boots, 97.5)];
}

function removeWorktree(path: string) {
  try {
    execFileSync("git", ["worktree", "remove", "--force", path], { stdio: "ignore" });
  } catch {}
}

function setupWorktrees(wA: string, wB: string) {
  log("Creating worktrees...");
  execFileSync("git", ["worktree", "add", "--detach", wA, COMMIT_A], { stdio: "inherit" });
  execFileSync("git", ["worktree", "add", "--detach", wB, COMMIT_B], { stdio: "inherit" });

  log("Installing...");
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: wA, stdio: "inherit" });
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: wB, stdio: "inherit" });

  log("Building...");
  execFileSync("pnpm", ["run", "build"], { cwd: wA, stdio: "inherit" });
  execFileSync("pnpm", ["run", "build"], { cwd: wB, stdio: "inherit" });
}

function runBench(wt: string, out: string): BenchmarkReport {
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "scripts/bench-perf-baseline.ts",
      "--warmup",
      String(WARMUP),
      "--samples",
      String(ITERATIONS),
      "--output",
      out,
    ],
    { cwd: wt, stdio: "inherit" },
  );
  const r = JSON.parse(readFileSync(out, "utf-8")) as BenchmarkReport;
  if (r.gitDirty) throw new Error("Git tree dirty");
  return r;
}

function validate(reportsA: BenchmarkReport[], reportsB: BenchmarkReport[]) {
  const f = reportsA[0];
  for (const r of [...reportsA, ...reportsB]) {
    if (r.node !== f.node) throw new Error("Node mismatch");
    if (r.v8 !== f.v8) throw new Error("V8 mismatch");
    if (r.os !== f.os) throw new Error("OS mismatch");
    if (r.cpu !== f.cpu) throw new Error("CPU mismatch");
    if (r.arch !== f.arch) throw new Error("Arch mismatch");
    if (r.warmup !== WARMUP) throw new Error("Warmup mismatch");
    if (r.samples !== ITERATIONS) throw new Error("Samples mismatch");
  }
  for (const r of reportsA) if (r.commit !== COMMIT_A) throw new Error("Commit A mismatch");
  for (const r of reportsB) if (r.commit !== COMMIT_B) throw new Error("Commit B mismatch");

  const sA = Object.keys(reportsA[0].results).sort().join();
  for (const r of [...reportsA, ...reportsB]) {
    if (Object.keys(r.results).sort().join() !== sA) throw new Error("Scenario mismatch");
  }

  // Validate gating scenarios exist
  for (const sc of GATING_SCENARIOS) {
    if (!reportsA[0].results[sc]) {
      throw new Error(`Gating scenario missing: ${sc}`);
    }
  }
}

function analyzeMetric(
  pairs: PairedRun[],
  scenario: string,
  metric: "p50" | "p95",
  seed: number,
): MetricAnalysis {
  const ratios: number[] = [];
  for (const p of pairs) {
    const vA = p.reportA.results[scenario]?.[metric];
    const vB = p.reportB.results[scenario]?.[metric];
    if (!vA || !vB || !isFinite(vA) || !isFinite(vB) || vA <= 0 || vB <= 0) {
      throw new Error(`Invalid ${metric} for ${scenario}`);
    }
    ratios.push(vB / vA);
  }
  const med = percentile(ratios, 50);
  const [ciL, ciU] = pairedBootstrapCI(ratios, seed, BOOTSTRAP_ITERATIONS);
  return { pairedRatios: ratios, medianRatio: med, ciLower: ciL, ciUpper: ciU };
}

function analyzeSc(pairs: PairedRun[], scenario: string, gating: boolean): ScenarioResult {
  const p50 = analyzeMetric(pairs, scenario, "p50", BOOTSTRAP_SEED);
  const p95 = analyzeMetric(pairs, scenario, "p95", BOOTSTRAP_SEED + 1);

  let status: "pass" | "fail" | "inconclusive" | "informational";

  if (!gating) {
    status = "informational";
  } else {
    // Decision based on p95 only
    if (p95.ciLower > 1 + THRESHOLD) {
      status = "fail";
    } else if (p95.ciUpper <= 1 + THRESHOLD) {
      status = "pass";
    } else {
      status = "inconclusive";
    }
  }

  return { scenario, gating, p50, p95, status };
}

function main() {
  console.log("=".repeat(80));
  console.log("Phase 3.3: Instrumentation Overhead Validation (v4)");
  console.log("=".repeat(80));
  console.log(`Pairs: ${PAIRS}, Threshold: ${THRESHOLD * 100}%`);
  console.log(
    `Bootstrap: ${BOOTSTRAP_ITERATIONS} iterations, seed: 0x${BOOTSTRAP_SEED.toString(16)}`,
  );
  console.log(`Gating scenarios: ${GATING_SCENARIOS.length}\n`);

  const base = join(tmpdir(), `phase3.3-${Date.now()}`);
  const outDir = join(base, "results");
  mkdirSync(outDir, { recursive: true });

  const wA = join(base, "commit-a");
  const wB = join(base, "commit-b");

  try {
    setupWorktrees(wA, wB);

    const pairs: PairedRun[] = [];
    for (let i = 0; i < PAIRS; i++) {
      const ord: "AB" | "BA" = i % 2 === 0 ? "AB" : "BA";
      log(`\n=== Pair ${i + 1}/${PAIRS} (${ord}) ===`);

      const oA = join(outDir, `pair-${i}-A.json`);
      const oB = join(outDir, `pair-${i}-B.json`);

      if (ord === "AB") {
        log("  A...");
        const rA = runBench(wA, oA);
        log("  B...");
        const rB = runBench(wB, oB);
        pairs.push({ index: i, order: ord, reportA: rA, reportB: rB });
      } else {
        log("  B...");
        const rB = runBench(wB, oB);
        log("  A...");
        const rA = runBench(wA, oA);
        pairs.push({ index: i, order: ord, reportA: rA, reportB: rB });
      }
    }

    validate(
      pairs.map((p) => p.reportA),
      pairs.map((p) => p.reportB),
    );

    const scenarios = Object.keys(pairs[0].reportA.results);
    const results: ScenarioResult[] = [];

    console.log("\n" + "=".repeat(80));
    console.log("RESULTS");
    console.log("=".repeat(80) + "\n");

    for (const sc of scenarios) {
      const gating = GATING_SCENARIOS.includes(sc as any);
      const r = analyzeSc(pairs, sc, gating);
      results.push(r);

      const sym =
        r.status === "pass"
          ? "✅"
          : r.status === "fail"
            ? "❌"
            : r.status === "inconclusive"
              ? "⚠️"
              : "ℹ️";
      const pct = ((r.p95.medianRatio - 1) * 100).toFixed(2);

      console.log(`${sym} ${sc} ${gating ? "(GATING)" : "(informational)"}`);
      console.log(
        `   p50: ${r.p50.medianRatio.toFixed(3)}, p95: ${r.p95.medianRatio.toFixed(3)} (${pct >= "0" ? "+" : ""}${pct}%)`,
      );
      console.log(`   p95 CI: [${r.p95.ciLower.toFixed(3)}, ${r.p95.ciUpper.toFixed(3)}]`);
      console.log(`   ${r.status.toUpperCase()}`);
      console.log();
    }

    // Save complete audit trail
    mkdirSync("docs/perf", { recursive: true });
    writeFileSync(
      "docs/perf/phase3.3-overhead-results.json",
      JSON.stringify(
        {
          config: {
            commitA: COMMIT_A,
            commitB: COMMIT_B,
            pairs: PAIRS,
            warmup: WARMUP,
            samples: ITERATIONS,
            threshold: THRESHOLD,
            bootstrapIterations: BOOTSTRAP_ITERATIONS,
            bootstrapSeed: BOOTSTRAP_SEED,
            gatingScenarios: Array.from(GATING_SCENARIOS),
          },
          environment: pairs[0].reportA,
          pairedRuns: pairs.map((p) => ({
            index: p.index,
            order: p.order,
            A: {
              timestamp: p.reportA.timestamp,
              commit: p.reportA.commit,
              results: p.reportA.results,
            },
            B: {
              timestamp: p.reportB.timestamp,
              commit: p.reportB.commit,
              results: p.reportB.results,
            },
          })),
          timestamp: new Date().toISOString(),
          results,
        },
        null,
        2,
      ),
    );

    log(`Results saved. Raw reports preserved in: ${outDir}`);

    // Summary (gating scenarios only)
    const gating = results.filter((r) => r.gating);
    const fail = gating.filter((r) => r.status === "fail").length;
    const inc = gating.filter((r) => r.status === "inconclusive").length;
    const pass = gating.filter((r) => r.status === "pass").length;

    console.log("=".repeat(80));
    console.log("SUMMARY (Gating Scenarios Only)");
    console.log("=".repeat(80));
    console.log(`Pass: ${pass}, Fail: ${fail}, Inconclusive: ${inc}\n`);

    if (fail > 0) {
      console.log("❌ REGRESSION > 5%");
      process.exitCode = 1;
    } else if (inc > 0) {
      console.log("⚠️  INCONCLUSIVE");
      process.exitCode = 2;
    } else {
      console.log("✅ PROVEN <= 5%");
    }
  } catch (err) {
    console.error("\n❌ Benchmark failed:", err);
    log(`Preserving data in: ${base}`);
    throw err;
  } finally {
    removeWorktree(wA);
    removeWorktree(wB);
    try {
      execFileSync("git", ["worktree", "prune"], { stdio: "ignore" });
    } catch {}
  }
}

main();
