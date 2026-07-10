/**
 * Phase 3.3: Instrumentation Overhead Validation (v3)
 *
 * Critical fixes:
 * - Paired AB/BA bootstrap matching point estimate
 * - Non-inferiority decision logic
 * - Proper validation (fail-closed)
 * - execFileSync for shell safety
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
  results: Record<string, { p50: number; p95: number; p99: number }>;
}

interface PairedRun {
  order: "AB" | "BA";
  reportA: BenchmarkReport;
  reportB: BenchmarkReport;
}

interface ScenarioResult {
  scenario: string;
  pairedP95Ratios: number[];
  medianRatio: number;
  ciLower: number;
  ciUpper: number;
  status: "pass" | "fail" | "inconclusive";
}

function log(msg: string) {
  console.log(`[Overhead] ${msg}`);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function pairedBootstrapCI(ratios: number[], iters = 1000): [number, number] {
  const n = ratios.length;
  const boots: number[] = [];
  for (let i = 0; i < iters; i++) {
    const resampled: number[] = [];
    for (let j = 0; j < n; j++) {
      resampled.push(ratios[Math.floor(Math.random() * n)]);
    }
    boots.push(percentile(resampled, 50));
  }
  boots.sort((a, b) => a - b);
  return [percentile(boots, 2.5), percentile(boots, 97.5)];
}

function setupWorktrees(baseDir: string) {
  const wA = join(baseDir, "commit-a");
  const wB = join(baseDir, "commit-b");

  log("Creating worktrees...");
  execFileSync("git", ["worktree", "add", "--detach", wA, COMMIT_A], { stdio: "inherit" });
  execFileSync("git", ["worktree", "add", "--detach", wB, COMMIT_B], { stdio: "inherit" });

  log("Installing...");
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: wA, stdio: "inherit" });
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: wB, stdio: "inherit" });

  log("Building...");
  execFileSync("pnpm", ["run", "build"], { cwd: wA, stdio: "inherit" });
  execFileSync("pnpm", ["run", "build"], { cwd: wB, stdio: "inherit" });

  return { wA, wB };
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
}

function analyzeSc(sc: string, pairs: PairedRun[]): ScenarioResult {
  const ratios: number[] = [];
  for (const p of pairs) {
    const pA = p.reportA.results[sc]?.p95;
    const pB = p.reportB.results[sc]?.p95;
    if (!pA || !pB || !isFinite(pA) || !isFinite(pB) || pA <= 0 || pB <= 0) {
      throw new Error(`Invalid p95 for ${sc}`);
    }
    ratios.push(pB / pA);
  }
  const med = percentile(ratios, 50);
  const [ciL, ciU] = pairedBootstrapCI(ratios);

  let status: "pass" | "fail" | "inconclusive";
  if (ciL > 1 + THRESHOLD) status = "fail";
  else if (ciU <= 1 + THRESHOLD) status = "pass";
  else status = "inconclusive";

  return {
    scenario: sc,
    pairedP95Ratios: ratios,
    medianRatio: med,
    ciLower: ciL,
    ciUpper: ciU,
    status,
  };
}

function main() {
  console.log("=".repeat(80));
  console.log("Phase 3.3: Instrumentation Overhead Validation (v3)");
  console.log("=".repeat(80));
  console.log(`Pairs: ${PAIRS} AB/BA\n`);

  const base = join(tmpdir(), `phase3.3-${Date.now()}`);
  const outDir = join(base, "results");
  mkdirSync(outDir, { recursive: true });

  let wA: string | undefined, wB: string | undefined;
  try {
    ({ wA, wB } = setupWorktrees(base));

    const pairs: PairedRun[] = [];
    for (let i = 0; i < PAIRS; i++) {
      const ord: "AB" | "BA" = i % 2 === 0 ? "AB" : "BA";
      log(`\n=== Pair ${i + 1}/${PAIRS} (${ord}) ===`);

      const oA = join(outDir, `pair-${i}-A.json`);
      const oB = join(outDir, `pair-${i}-B.json`);

      if (ord === "AB") {
        log("  Running A...");
        const rA = runBench(wA, oA);
        log("  Running B...");
        const rB = runBench(wB, oB);
        pairs.push({ order: ord, reportA: rA, reportB: rB });
      } else {
        log("  Running B...");
        const rB = runBench(wB, oB);
        log("  Running A...");
        const rA = runBench(wA, oA);
        pairs.push({ order: ord, reportA: rA, reportB: rB });
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
      const r = analyzeSc(sc, pairs);
      results.push(r);
      const sym = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⚠️";
      const pct = ((r.medianRatio - 1) * 100).toFixed(2);
      console.log(`${sym} ${sc}`);
      console.log(`   Median: ${r.medianRatio.toFixed(3)} (${pct >= "0" ? "+" : ""}${pct}%)`);
      console.log(`   95% CI: [${r.ciLower.toFixed(3)}, ${r.ciUpper.toFixed(3)}]`);
      console.log(`   ${r.status.toUpperCase()}`);
      console.log();
    }

    mkdirSync("docs/perf", { recursive: true });
    writeFileSync(
      "docs/perf/phase3.3-overhead-results.json",
      JSON.stringify(
        {
          config: { commitA: COMMIT_A, commitB: COMMIT_B, pairs: PAIRS, threshold: THRESHOLD },
          environment: pairs[0].reportA,
          timestamp: new Date().toISOString(),
          results,
        },
        null,
        2,
      ),
    );

    const fail = results.filter((r) => r.status === "fail").length;
    const inc = results.filter((r) => r.status === "inconclusive").length;
    const pass = results.filter((r) => r.status === "pass").length;

    console.log("=".repeat(80));
    console.log("SUMMARY");
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
  } finally {
    if (wA)
      try {
        execFileSync("git", ["worktree", "remove", "--force", wA]);
      } catch {}
    if (wB)
      try {
        execFileSync("git", ["worktree", "remove", "--force", wB]);
      } catch {}
    try {
      execFileSync("git", ["worktree", "prune"]);
    } catch {}
    try {
      rmSync(base, { recursive: true, force: true });
    } catch {}
  }
}

main();
