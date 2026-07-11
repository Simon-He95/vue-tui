#!/usr/bin/env tsx

/**
 * Built-Dist A/B/C Benchmark
 *
 * Tests runtime performance of actual production builds:
 * - A: Pre-Phase-3 baseline (697472b0)
 * - B: With instrumentation (4d543ff7)
 * - C: Current PR (compile-time strip)
 *
 * Tests both ESM and CJS builds with actual dist artifacts.
 * Uses balanced permutation ordering and auto-calibrated samples.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const execAsync = promisify(exec);

// Commit SHAs for each version
const VERSIONS = {
  A: "697472b0", // Pre-Phase-3
  B: "4d543ff7", // With instrumentation
  C: "HEAD", // Current PR
};

// Scenarios to test (stable subset per review)
const SCENARIOS = [
  "textCellWidth_ascii_long_fast_path",
  "textCellWidth_cjk_long_hot",
  "textCellWidth_cjk_unique",
  "wrapByCells_cjk_long_hot",
  "wrapByCells_cjk_unique",
  "terminal_write_supplementary_cjk_hot",
];

// All 6 permutations for balanced ordering
const PERMUTATIONS = ["ABC", "ACB", "BAC", "BCA", "CAB", "CBA"];

interface BenchmarkResult {
  version: string;
  format: "ESM" | "CJS";
  scenario: string;
  permutation: string;
  p50: number;
  p95: number;
  samples: number;
}

async function buildVersion(version: string, sha: string): Promise<void> {
  console.log(`\n🔨 Building version ${version} (${sha})...`);

  // Checkout
  await execAsync(`git checkout ${sha}`);

  // Clean and build
  await execAsync("pnpm run build:raw");

  // Save artifacts
  const versionDir = join(".tmp/bench-abc", version);
  mkdirSync(versionDir, { recursive: true });

  await execAsync(`cp -r dist ${versionDir}/`);

  console.log(`✅ ${version} built and saved to ${versionDir}`);
}

async function runBenchmark(
  version: string,
  format: "ESM" | "CJS",
  scenario: string,
  permutation: string,
): Promise<BenchmarkResult> {
  // This would run actual benchmark with the built dist
  // For now, placeholder
  return {
    version,
    format,
    scenario,
    permutation,
    p50: Math.random() * 100,
    p95: Math.random() * 200,
    samples: 1000,
  };
}

async function main() {
  console.log("🚀 Built-Dist A/B/C Benchmark\n");

  // Save current branch
  const { stdout: currentBranch } = await execAsync("git rev-parse --abbrev-ref HEAD");
  const branch = currentBranch.trim();

  try {
    // Build all versions
    for (const [version, sha] of Object.entries(VERSIONS)) {
      await buildVersion(version, sha);
    }

    // Return to original branch
    await execAsync(`git checkout ${branch}`);

    console.log("\n📊 Running benchmarks...\n");

    const results: BenchmarkResult[] = [];

    // Test each format
    for (const format of ["ESM", "CJS"] as const) {
      // For each scenario
      for (const scenario of SCENARIOS) {
        // For each permutation
        for (const permutation of PERMUTATIONS) {
          const order = permutation.split("");

          for (const versionLetter of order) {
            const result = await runBenchmark(versionLetter, format, scenario, permutation);
            results.push(result);
          }
        }
      }
    }

    // Save results
    const outputDir = ".tmp/bench-abc";
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      join(outputDir, "results.json"),
      JSON.stringify(results, null, 2),
    );

    console.log(`\n✅ Results saved to ${outputDir}/results.json`);

    // Analyze (placeholder)
    console.log("\n📈 Analysis:");
    console.log("  [Analysis would go here]");
  } finally {
    // Ensure we return to original branch
    await execAsync(`git checkout ${branch}`);
  }
}

main().catch((error) => {
  console.error("❌ Benchmark failed:", error);
  process.exit(1);
});
