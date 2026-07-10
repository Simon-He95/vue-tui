/**
 * Phase 3.3: Bundle Size Comparison
 *
 * Compares bundle sizes between pre-Phase-3 and post-Phase-3
 */

import { execSync } from "node:child_process";
import { statSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const COMMIT_A = "697472b0cc5c000fb46baf16e85c60d84ee22471";
const COMMIT_B = "4d543ff7042f9c2400fa50a9dff921a0f36f77a3";

interface BundleStats {
  raw: number;
  gzip: number;
}

function log(msg: string) {
  console.log(`[Bundle] ${msg}`);
}

function getFileSize(path: string): number {
  return statSync(path).size;
}

function getGzipSize(path: string): number {
  const content = readFileSync(path);
  return gzipSync(content).length;
}

function analyzeBundles(): Record<string, BundleStats> {
  const entries = ["dist/core.js", "dist/vue.js", "dist/index.js"];
  const stats: Record<string, BundleStats> = {};

  for (const entry of entries) {
    try {
      stats[entry] = {
        raw: getFileSize(entry),
        gzip: getGzipSize(entry),
      };
    } catch (err) {
      log(`Warning: ${entry} not found`);
    }
  }

  return stats;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function main() {
  console.log("=".repeat(80));
  console.log("Phase 3.3: Bundle Size Comparison");
  console.log("=".repeat(80));
  console.log();

  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf-8",
  }).trim();

  try {
    // Build at commit A
    log(`Checking out Commit A (${COMMIT_A.substring(0, 8)})...`);
    execSync(`git checkout ${COMMIT_A}`, { stdio: "inherit" });

    log("Installing dependencies...");
    execSync("pnpm install", { stdio: "inherit" });

    log("Building...");
    execSync("pnpm run build", { stdio: "inherit" });

    const bundlesA = analyzeBundles();

    // Build at commit B
    log(`Checking out Commit B (${COMMIT_B.substring(0, 8)})...`);
    execSync(`git checkout ${COMMIT_B}`, { stdio: "inherit" });

    log("Installing dependencies...");
    execSync("pnpm install", { stdio: "inherit" });

    log("Building...");
    execSync("pnpm run build", { stdio: "inherit" });

    const bundlesB = analyzeBundles();

    // Compare
    console.log();
    console.log("=".repeat(80));
    console.log("RESULTS");
    console.log("=".repeat(80));
    console.log();

    const comparison: any = {
      commitA: COMMIT_A,
      commitB: COMMIT_B,
      timestamp: new Date().toISOString(),
      bundles: {},
    };

    for (const entry of Object.keys(bundlesA)) {
      const a = bundlesA[entry];
      const b = bundlesB[entry];

      const rawDelta = b.raw - a.raw;
      const gzipDelta = b.gzip - a.gzip;
      const gzipPercent = ((b.gzip / a.gzip - 1) * 100).toFixed(2);

      console.log(`${entry}:`);
      console.log(`  Commit A: ${formatBytes(a.raw)} raw, ${formatBytes(a.gzip)} gzip`);
      console.log(`  Commit B: ${formatBytes(b.raw)} raw, ${formatBytes(b.gzip)} gzip`);
      console.log(
        `  Delta:    ${rawDelta > 0 ? "+" : ""}${formatBytes(rawDelta)} raw, ${gzipDelta > 0 ? "+" : ""}${formatBytes(gzipDelta)} gzip (${gzipPercent}%)`,
      );

      const status = Math.abs(gzipDelta) > 2048 ? "⚠️  SIGNIFICANT" : "✅ ACCEPTABLE";
      console.log(`  Status:   ${status}`);
      console.log();

      comparison.bundles[entry] = {
        commitA: a,
        commitB: b,
        delta: { raw: rawDelta, gzip: gzipDelta },
        percentChange: parseFloat(gzipPercent),
      };
    }

    // Save results
    const outputPath = "docs/perf/phase3.3-bundle-sizes.json";
    writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
    log(`Results saved to ${outputPath}`);

    // Summary
    const totalGzipDelta = Object.values(comparison.bundles).reduce(
      (sum: number, b: any) => sum + b.delta.gzip,
      0,
    );

    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total gzip delta: ${totalGzipDelta > 0 ? "+" : ""}${formatBytes(totalGzipDelta)}`);

    if (Math.abs(totalGzipDelta) > 5120) {
      console.log("⚠️  SIGNIFICANT BUNDLE SIZE INCREASE");
      process.exitCode = 1;
    } else {
      console.log("✅ BUNDLE SIZE ACCEPTABLE");
    }
  } finally {
    log(`Restoring branch ${currentBranch}...`);
    execSync(`git checkout ${currentBranch}`, { stdio: "inherit" });
  }
}

main();
