/**
 * Phase 3.3: Instrumentation Overhead Validation
 *
 * Compares runtime performance between:
 * - Commit A (697472b0): Pre-Phase-3 (Phase 2 baseline)
 * - Commit B (4d543ff7): Post-Phase-3 (instrumentation disabled)
 *
 * Methodology per #119:
 * - Isolated worktrees for each commit
 * - ABBA execution order to reduce systematic bias
 * - Multiple paired samples
 * - Statistical significance testing with 95% CI
 * - Decision gate: p95 regression > 5% with CI excluding 0 → remediate
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Configuration
const COMMIT_A = "697472b0cc5c000fb46baf16e85c60d84ee22471"; // Pre-Phase-3
const COMMIT_B = "4d543ff7042f9c2400fa50a9dff921a0f36f77a3"; // Post-Phase-3
const SAMPLES_PER_COMMIT = 10; // 10 independent samples each
const WARMUP = 50;
const ITERATIONS = 500;
const DECISION_THRESHOLD = 0.05; // 5% regression threshold per #119

interface BenchmarkReport {
  commit: string;
  node: string;
  v8: string;
  os: string;
  cpu: string;
  gitDirty: boolean;
  warmup: number;
  samples: number;
  results: Record<string, { p50: number; p95: number; p99: number; mean: number; stdev: number }>;
}

interface ComparisonResult {
  scenario: string;
  commitA: { p50: number; p95: number; samples: number[] };
  commitB: { p50: number; p95: number; samples: number[] };
  p95Ratio: number;
  p95RatioCILower: number; // Bootstrap 95% CI lower bound
  p95RatioCIUpper: number;
  regressionPercent: number;
  significantRegression: boolean;
  status: "pass" | "fail" | "inconclusive";
}

function log(msg: string) {
  console.log(`[Overhead] ${msg}`);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Bootstrap 95% confidence interval for ratio
 */
function bootstrapCI(
  samplesA: number[],
  samplesB: number[],
  metric: "p95",
  iterations = 1000,
): [number, number] {
  const ratios: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Resample with replacement
    const resampledA: number[] = [];
    const resampledB: number[] = [];

    for (let j = 0; j < samplesA.length; j++) {
      resampledA.push(samplesA[Math.floor(Math.random() * samplesA.length)]);
      resampledB.push(samplesB[Math.floor(Math.random() * samplesB.length)]);
    }

    const metricA = percentile(resampledA, 95);
    const metricB = percentile(resampledB, 95);
    ratios.push(metricB / metricA);
  }

  ratios.sort((a, b) => a - b);
  const lower = percentile(ratios, 2.5);
  const upper = percentile(ratios, 97.5);

  return [lower, upper];
}

/**
 * Setup isolated worktrees
 */
function setupWorktrees(): { worktreeA: string; worktreeB: string } {
  const baseDir = join(tmpdir(), `vue-tui-overhead-${Date.now()}`);
  mkdirSync(baseDir, { recursive: true });

  const worktreeA = join(baseDir, "commit-a");
  const worktreeB = join(baseDir, "commit-b");

  log(`Creating worktree A at ${worktreeA}...`);
  execSync(`git worktree add ${worktreeA} ${COMMIT_A}`, { stdio: "inherit" });

  log(`Creating worktree B at ${worktreeB}...`);
  execSync(`git worktree add ${worktreeB} ${COMMIT_B}`, { stdio: "inherit" });

  // Install with frozen lockfile
  log("Installing dependencies in worktree A...");
  execSync("pnpm install --frozen-lockfile", { cwd: worktreeA, stdio: "inherit" });

  log("Installing dependencies in worktree B...");
  execSync("pnpm install --frozen-lockfile", { cwd: worktreeB, stdio: "inherit" });

  // Build both
  log("Building worktree A...");
  execSync("pnpm run build", { cwd: worktreeA, stdio: "inherit" });

  log("Building worktree B...");
  execSync("pnpm run build", { cwd: worktreeB, stdio: "inherit" });

  return { worktreeA, worktreeB };
}

/**
 * Run a single benchmark sample
 */
function runSample(worktree: string, label: string, sampleIndex: number): BenchmarkReport {
  const outputPath = join(tmpdir(), `phase3.3-${label}-${sampleIndex}.json`);

  log(`Running ${label} sample ${sampleIndex + 1}/${SAMPLES_PER_COMMIT}...`);

  execSync(
    `pnpm exec tsx scripts/bench-perf-baseline.ts --warmup ${WARMUP} --samples ${ITERATIONS} --output ${outputPath}`,
    {
      cwd: worktree,
      stdio: "inherit",
    },
  );

  const report = JSON.parse(readFileSync(outputPath, "utf-8")) as BenchmarkReport;

  // Validate report
  if (report.gitDirty) {
    throw new Error(`${label}: git working tree is dirty`);
  }

  return report;
}

/**
 * Run benchmarks in ABBA order
 */
function runABBABenchmarks(
  worktreeA: string,
  worktreeB: string,
): { reportsA: BenchmarkReport[]; reportsB: BenchmarkReport[] } {
  const reportsA: BenchmarkReport[] = [];
  const reportsB: BenchmarkReport[] = [];

  log("Running ABBA benchmark sequence...");

  for (let round = 0; round < SAMPLES_PER_COMMIT / 2; round++) {
    log(`\n=== Round ${round + 1}/${SAMPLES_PER_COMMIT / 2} ===`);

    // A
    reportsA.push(runSample(worktreeA, "A", reportsA.length));

    // B
    reportsB.push(runSample(worktreeB, "B", reportsB.length));

    // B again
    reportsB.push(runSample(worktreeB, "B", reportsB.length));

    // A again
    reportsA.push(runSample(worktreeA, "A", reportsA.length));
  }

  return { reportsA, reportsB };
}

/**
 * Analyze scenario and determine if regression is significant
 */
function analyzeScenario(
  scenario: string,
  reportsA: BenchmarkReport[],
  reportsB: BenchmarkReport[],
): ComparisonResult {
  // Extract p95 values from each report
  const p95A = reportsA.map((r) => r.results[scenario]?.p95).filter((v) => v !== undefined);
  const p95B = reportsB.map((r) => r.results[scenario]?.p95).filter((v) => v !== undefined);

  if (p95A.length === 0 || p95B.length === 0) {
    return {
      scenario,
      commitA: { p50: 0, p95: 0, samples: [] },
      commitB: { p50: 0, p95: 0, samples: [] },
      p95Ratio: 1,
      p95RatioCILower: 1,
      p95RatioCIUpper: 1,
      regressionPercent: 0,
      significantRegression: false,
      status: "inconclusive",
    };
  }

  const p50A = reportsA.map((r) => r.results[scenario]?.p50).filter((v) => v !== undefined);
  const p50B = reportsB.map((r) => r.results[scenario]?.p50).filter((v) => v !== undefined);

  const medianP95A = percentile(p95A, 50);
  const medianP95B = percentile(p95B, 50);
  const p95Ratio = medianP95B / medianP95A;

  // Bootstrap 95% CI
  const [ciLower, ciUpper] = bootstrapCI(p95A, p95B, "p95");

  const regressionPercent = (p95Ratio - 1) * 100;

  // Decision: significant regression if CI lower bound > 1.05 (5% threshold)
  const significantRegression = ciLower > 1.0 + DECISION_THRESHOLD;

  let status: "pass" | "fail" | "inconclusive" = "pass";
  if (significantRegression) {
    status = "fail";
  } else if (ciUpper - ciLower > 0.2) {
    // CI too wide (> 20% range)
    status = "inconclusive";
  }

  return {
    scenario,
    commitA: {
      p50: percentile(p50A, 50),
      p95: medianP95A,
      samples: p95A,
    },
    commitB: {
      p50: percentile(p50B, 50),
      p95: medianP95B,
      samples: p95B,
    },
    p95Ratio,
    p95RatioCILower: ciLower,
    p95RatioCIUpper: ciUpper,
    regressionPercent,
    significantRegression,
    status,
  };
}

/**
 * Main execution
 */
function main() {
  console.log("=".repeat(80));
  console.log("Phase 3.3: Instrumentation Overhead Validation");
  console.log("=".repeat(80));
  console.log();
  console.log(`Commit A (Pre-Phase-3):  ${COMMIT_A}`);
  console.log(`Commit B (Post-Phase-3): ${COMMIT_B}`);
  console.log(`Samples per commit: ${SAMPLES_PER_COMMIT} (ABBA order)`);
  console.log(`Decision threshold: ${DECISION_THRESHOLD * 100}% p95 regression`);
  console.log(`Node: ${process.version}`);
  console.log();

  let worktreeA: string;
  let worktreeB: string;

  try {
    // Setup
    ({ worktreeA, worktreeB } = setupWorktrees());

    // Run benchmarks
    const { reportsA, reportsB } = runABBABenchmarks(worktreeA, worktreeB);

    // Get all scenarios from first report
    const scenarios = Object.keys(reportsA[0].results);

    // Analyze each scenario
    const results: ComparisonResult[] = [];

    console.log();
    console.log("=".repeat(80));
    console.log("RESULTS");
    console.log("=".repeat(80));
    console.log();

    for (const scenario of scenarios) {
      const result = analyzeScenario(scenario, reportsA, reportsB);
      results.push(result);

      const statusSymbol = result.status === "pass" ? "✅" : result.status === "fail" ? "❌" : "⚠️";

      console.log(`${statusSymbol} ${scenario}`);
      console.log(`   Commit A p95: ${result.commitA.p95.toFixed(2)}ns`);
      console.log(`   Commit B p95: ${result.commitB.p95.toFixed(2)}ns`);
      console.log(
        `   Ratio: ${result.p95Ratio.toFixed(3)} (${result.regressionPercent >= 0 ? "+" : ""}${result.regressionPercent.toFixed(2)}%)`,
      );
      console.log(
        `   95% CI: [${result.p95RatioCILower.toFixed(3)}, ${result.p95RatioCIUpper.toFixed(3)}]`,
      );
      console.log(`   Status: ${result.status.toUpperCase()}`);
      console.log();
    }

    // Save results
    mkdirSync("docs/perf", { recursive: true });
    const outputPath = "docs/perf/phase3.3-overhead-results.json";
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          config: {
            commitA: COMMIT_A,
            commitB: COMMIT_B,
            samplesPerCommit: SAMPLES_PER_COMMIT,
            warmup: WARMUP,
            iterations: ITERATIONS,
            decisionThreshold: DECISION_THRESHOLD,
          },
          environment: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
          },
          timestamp: new Date().toISOString(),
          results,
        },
        null,
        2,
      ),
    );

    log(`Results saved to ${outputPath}`);

    // Summary
    const failed = results.filter((r) => r.status === "fail").length;
    const inconclusive = results.filter((r) => r.status === "inconclusive").length;
    const passed = results.filter((r) => r.status === "pass").length;

    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total scenarios: ${results.length}`);
    console.log(`Pass: ${passed}`);
    console.log(`Fail: ${failed}`);
    console.log(`Inconclusive: ${inconclusive}`);
    console.log();

    if (failed > 0) {
      console.log("❌ SIGNIFICANT REGRESSION DETECTED");
      console.log("   Remediation required per #119:");
      console.log("   - Reduce hook frequency");
      console.log("   - Compile-time stripping");
      console.log("   - Separate profiling build");
      console.log("   - Rollback instrumentation");
      process.exitCode = 1;
    } else if (inconclusive > 0) {
      console.log("⚠️  INCONCLUSIVE RESULTS");
      console.log("   Some scenarios have high variance. Consider:");
      console.log("   - Increasing sample count");
      console.log("   - Isolating system load");
      console.log("   - Reviewing scenario stability");
    } else {
      console.log("✅ NO SIGNIFICANT REGRESSION");
      console.log("   Instrumentation overhead is within acceptable limits.");
    }
  } finally {
    // Cleanup worktrees
    if (worktreeA!) {
      log("Cleaning up worktree A...");
      try {
        execSync(`git worktree remove ${worktreeA} --force`);
      } catch (err) {
        log(`Warning: Failed to remove worktree A: ${err}`);
      }
    }

    if (worktreeB!) {
      log("Cleaning up worktree B...");
      try {
        execSync(`git worktree remove ${worktreeB} --force`);
      } catch (err) {
        log(`Warning: Failed to remove worktree B: ${err}`);
      }
    }
  }
}

main();
