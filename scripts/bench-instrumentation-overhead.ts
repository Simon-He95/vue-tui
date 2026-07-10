/**
 * Phase 3.3: Instrumentation Overhead Validation
 *
 * Simple A/B comparison using existing Phase 2 baseline harness
 *
 * Compares:
 * - Commit A (697472b0): Pre-Phase-3
 * - Commit B (4d543ff7): Post-Phase-3 (instrumentation disabled)
 *
 * Usage:
 *   pnpm run bench:overhead
 */

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const COMMIT_A = "697472b0cc5c000fb46baf16e85c60d84ee22471"; // Pre-Phase-3
const COMMIT_B = "4d543ff7042f9c2400fa50a9dff921a0f36f77a3"; // Post-Phase-3

function log(msg: string) {
  console.log(`[Overhead] ${msg}`);
}

function runBenchmarkAt(commit: string, label: string): any {
  log(`Checking out ${label} (${commit.substring(0, 8)})...`);
  execSync(`git checkout ${commit}`, { stdio: "inherit" });

  log(`Installing dependencies...`);
  execSync("pnpm install", { stdio: "inherit" });

  log(`Building...`);
  execSync("pnpm run build", { stdio: "inherit" });

  log(`Running baseline benchmark...`);
  const output = execSync("pnpm run bench:perf-baseline:smoke", {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  // Parse JSON output
  const jsonMatch = output.match(/```json\n([\s\S]*?)\n```/);
  if (!jsonMatch) {
    throw new Error("Failed to parse benchmark output");
  }

  return JSON.parse(jsonMatch[1]);
}

function calculateRatio(a: number, b: number): number {
  return b / a;
}

function main() {
  console.log("=".repeat(80));
  console.log("Phase 3.3: Instrumentation Overhead Validation");
  console.log("=".repeat(80));
  console.log();
  console.log(`Commit A (Pre-Phase-3):  ${COMMIT_A}`);
  console.log(`Commit B (Post-Phase-3): ${COMMIT_B}`);
  console.log(`Node: ${process.version}`);
  console.log();

  // Save current branch
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf-8",
  }).trim();

  try {
    // Run benchmarks
    log("Running benchmark at Commit A...");
    const resultsA = runBenchmarkAt(COMMIT_A, "Commit A");

    log("Running benchmark at Commit B...");
    const resultsB = runBenchmarkAt(COMMIT_B, "Commit B");

    // Compare results
    console.log();
    console.log("=".repeat(80));
    console.log("RESULTS");
    console.log("=".repeat(80));
    console.log();

    const scenarios = Object.keys(resultsA.results);
    const comparison: any = {
      commitA: COMMIT_A,
      commitB: COMMIT_B,
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      scenarios: {},
    };

    for (const scenario of scenarios) {
      const a = resultsA.results[scenario];
      const b = resultsB.results[scenario];

      if (!a || !b) continue;

      const p50Ratio = calculateRatio(a.p50, b.p50);
      const p95Ratio = calculateRatio(a.p95, b.p95);

      const regressionPercent = (p95Ratio - 1) * 100;
      let status = "✅ PASS";
      if (regressionPercent > 10) status = "❌ FAIL";
      else if (regressionPercent > 5) status = "⚠️  WARN";

      console.log(`${scenario}:`);
      console.log(`  Commit A: p50=${a.p50.toFixed(2)}ns p95=${a.p95.toFixed(2)}ns`);
      console.log(`  Commit B: p50=${b.p50.toFixed(2)}ns p95=${b.p95.toFixed(2)}ns`);
      console.log(
        `  Ratio:    p50=${(p50Ratio * 100 - 100).toFixed(2)}% p95=${(p95Ratio * 100 - 100).toFixed(2)}%`,
      );
      console.log(`  Status:   ${status}`);
      console.log();

      comparison.scenarios[scenario] = {
        commitA: { p50: a.p50, p95: a.p95, p99: a.p99 },
        commitB: { p50: b.p50, p95: b.p95, p99: b.p99 },
        ratio: { p50: p50Ratio, p95: p95Ratio },
        regressionPercent,
        status: status.includes("FAIL") ? "fail" : status.includes("WARN") ? "warning" : "pass",
      };
    }

    // Save results
    const outputDir = "docs/perf";
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = join(outputDir, "phase3.3-overhead-results.json");
    writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
    log(`Results saved to ${outputPath}`);

    // Summary
    const failed = Object.values(comparison.scenarios).filter(
      (s: any) => s.status === "fail",
    ).length;
    const warned = Object.values(comparison.scenarios).filter(
      (s: any) => s.status === "warning",
    ).length;

    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Scenarios tested: ${scenarios.length}`);
    console.log(`Pass: ${scenarios.length - failed - warned}`);
    console.log(`Warning: ${warned}`);
    console.log(`Fail: ${failed}`);
    console.log();

    if (failed > 0) {
      console.log("❌ REGRESSION DETECTED - Remediation required");
      console.log("   Consider: reduce hooks, compile-out, or rollback");
      process.exitCode = 1;
    } else if (warned > 0) {
      console.log("⚠️  MINOR REGRESSION - Review recommended");
    } else {
      console.log("✅ NO SIGNIFICANT REGRESSION DETECTED");
    }
  } finally {
    // Restore original branch
    log(`Restoring branch ${currentBranch}...`);
    execSync(`git checkout ${currentBranch}`, { stdio: "inherit" });
  }
}

main();
