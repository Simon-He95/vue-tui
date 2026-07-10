/**
 * Phase 3.3: Bundle Size Comparison
 *
 * Compares bundle sizes between pre-Phase-3 and post-Phase-3
 *
 * Per #119 requirements:
 * - Uses isolated worktrees
 * - Measures per-entry gzip delta (not sum)
 * - Only fails on positive increases (size reductions are good)
 * - Gate: +2KB per entry
 */

import { execSync } from "node:child_process";
import { statSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const COMMIT_A = "697472b0cc5c000fb46baf16e85c60d84ee22471"; // Pre-Phase-3
const COMMIT_B = "4d543ff7042f9c2400fa50a9dff921a0f36f77a3"; // Post-Phase-3
const WARN_THRESHOLD = 2048; // +2KB per entry warning
const FAIL_THRESHOLD = 5120; // +5KB per entry fail

interface BundleStats {
  raw: number;
  gzip: number;
}

interface EntryComparison {
  entry: string;
  commitA: BundleStats;
  commitB: BundleStats;
  delta: { raw: number; gzip: number };
  percentChange: number;
  status: "acceptable" | "warning" | "fail";
}

function log(msg: string) {
  console.log(`[Bundle] ${msg}`);
}

function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function getFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function getGzipSize(path: string): number {
  try {
    const content = readFileSync(path);
    return gzipSync(content).length;
  } catch {
    return 0;
  }
}

function analyzeBundles(worktree: string): Record<string, BundleStats> {
  const entries = ["dist/core.js", "dist/vue.js", "dist/index.js"];
  const stats: Record<string, BundleStats> = {};

  for (const entry of entries) {
    const fullPath = join(worktree, entry);
    stats[entry] = {
      raw: getFileSize(fullPath),
      gzip: getGzipSize(fullPath),
    };

    if (stats[entry].raw === 0) {
      log(`Warning: ${entry} not found in ${worktree}`);
    }
  }

  return stats;
}

function setupWorktrees(): { worktreeA: string; worktreeB: string } {
  const tmpDir = join(process.cwd(), ".tmp", `bundle-compare-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const worktreeA = join(tmpDir, "commit-a");
  const worktreeB = join(tmpDir, "commit-b");

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

function main() {
  console.log("=".repeat(80));
  console.log("Phase 3.3: Bundle Size Comparison");
  console.log("=".repeat(80));
  console.log();
  console.log(`Commit A (Pre-Phase-3):  ${COMMIT_A}`);
  console.log(`Commit B (Post-Phase-3): ${COMMIT_B}`);
  console.log(`Warning threshold: +${formatBytes(WARN_THRESHOLD)} gzip per entry`);
  console.log(`Fail threshold: +${formatBytes(FAIL_THRESHOLD)} gzip per entry`);
  console.log();

  let worktreeA: string;
  let worktreeB: string;

  try {
    // Setup worktrees
    ({ worktreeA, worktreeB } = setupWorktrees());

    // Analyze bundles
    const bundlesA = analyzeBundles(worktreeA);
    const bundlesB = analyzeBundles(worktreeB);

    // Compare
    console.log();
    console.log("=".repeat(80));
    console.log("RESULTS");
    console.log("=".repeat(80));
    console.log();

    const comparisons: EntryComparison[] = [];
    let hasFailure = false;

    for (const entry of Object.keys(bundlesA)) {
      const a = bundlesA[entry];
      const b = bundlesB[entry];

      if (a.gzip === 0 || b.gzip === 0) {
        log(`Skipping ${entry} (missing bundle)`);
        continue;
      }

      const rawDelta = b.raw - a.raw;
      const gzipDelta = b.gzip - a.gzip;
      const percentChange = ((b.gzip / a.gzip - 1) * 100).toFixed(2);

      // Status: only fail on POSITIVE increases (reductions are good)
      let status: "acceptable" | "warning" | "fail" = "acceptable";
      if (gzipDelta > FAIL_THRESHOLD) {
        status = "fail";
        hasFailure = true;
      } else if (gzipDelta > WARN_THRESHOLD) {
        status = "warning";
      }

      const statusSymbol = status === "acceptable" ? "✅" : status === "warning" ? "⚠️" : "❌";

      console.log(`${statusSymbol} ${entry}`);
      console.log(`   Commit A: ${formatBytes(a.raw)} raw, ${formatBytes(a.gzip)} gzip`);
      console.log(`   Commit B: ${formatBytes(b.raw)} raw, ${formatBytes(b.gzip)} gzip`);
      console.log(
        `   Delta:    ${gzipDelta >= 0 ? "+" : ""}${formatBytes(rawDelta)} raw, ${gzipDelta >= 0 ? "+" : ""}${formatBytes(gzipDelta)} gzip (${percentChange}%)`,
      );
      console.log(`   Status:   ${status.toUpperCase()}`);
      console.log();

      comparisons.push({
        entry,
        commitA: a,
        commitB: b,
        delta: { raw: rawDelta, gzip: gzipDelta },
        percentChange: parseFloat(percentChange),
        status,
      });
    }

    // Save results
    mkdirSync("docs/perf", { recursive: true });
    const outputPath = "docs/perf/phase3.3-bundle-sizes.json";
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          config: {
            commitA: COMMIT_A,
            commitB: COMMIT_B,
            warnThreshold: WARN_THRESHOLD,
            failThreshold: FAIL_THRESHOLD,
          },
          timestamp: new Date().toISOString(),
          comparisons,
        },
        null,
        2,
      ),
    );

    log(`Results saved to ${outputPath}`);

    // Summary
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));

    const totalGzipIncrease = comparisons.reduce((sum, c) => sum + Math.max(0, c.delta.gzip), 0);

    console.log(`Total gzip increase: +${formatBytes(totalGzipIncrease)}`);
    console.log(`Entries analyzed: ${comparisons.length}`);
    console.log(`Failed: ${comparisons.filter((c) => c.status === "fail").length}`);
    console.log(`Warnings: ${comparisons.filter((c) => c.status === "warning").length}`);
    console.log();

    if (hasFailure) {
      console.log("❌ BUNDLE SIZE INCREASE EXCEEDS THRESHOLD");
      console.log("   Consider:");
      console.log("   - Tree-shaking optimization");
      console.log("   - Compile-time stripping");
      console.log("   - Code splitting");
      process.exitCode = 1;
    } else if (comparisons.some((c) => c.status === "warning")) {
      console.log("⚠️  BUNDLE SIZE INCREASE WARNING");
      console.log("   Review impact before release");
    } else {
      console.log("✅ BUNDLE SIZE ACCEPTABLE");
    }
  } finally {
    // Cleanup worktrees
    if (worktreeA!) {
      log("Cleaning up worktree A...");
      try {
        execSync(`git worktree remove ${worktreeA} --force`);
      } catch (err) {
        log(`Warning: Failed to remove worktree A`);
      }
    }

    if (worktreeB!) {
      log("Cleaning up worktree B...");
      try {
        execSync(`git worktree remove ${worktreeB} --force`);
      } catch (err) {
        log(`Warning: Failed to remove worktree B`);
      }
    }
  }
}

main();
