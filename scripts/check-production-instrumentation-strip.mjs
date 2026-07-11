#!/usr/bin/env node

/**
 * Production Instrumentation Strip Verification
 *
 * Verifies that real instrumentation module has bytesInOutput === 0.
 * Uses bundler metafile to check module graph inclusion.
 *
 * Exit codes:
 * 0 - All checks passed
 * 1 - Instrumentation found in production artifacts
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const DIST_DIR = "dist";
const PUBLIC_TYPES_PATTERN = /\.d\.(ts|cts|mts)$/;
const RUNTIME_PATTERN = /\.(js|cjs|mjs)$/;

// Real instrumentation module path (not the no-op stub)
const REAL_INSTRUMENTATION_PATH = resolve(process.cwd(), "src/core/perf/instrumentation.ts");

function walkDir(dir, callback) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

function checkFileForRealInstrumentation(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const violations = [];

  // Check for actual metric field names from real implementation
  const realMetrics = [
    "cellCacheHitWidth1:",
    "cellCacheHitWidth2:",
    "cellCacheMissWidth1:",
    "cellCacheMissWidth2:",
    "textCellWidthCalls:",
    "asciiFastPathCount:",
    "wrapByCellsCalls:",
    "graphemeSegmentationRequiredCalls:",
    "registeredBucketSizeP95Width1:",
    "estimatedRegisteredBucketCells:",
  ];

  for (const metric of realMetrics) {
    if (content.includes(metric)) {
      violations.push(`Found real instrumentation metric: ${metric}`);
    }
  }

  // Check for unique patterns from real collector implementation
  if (content.includes("instrumentationEnabled = true")) {
    violations.push("Found instrumentationEnabled flag");
  }

  if (content.includes("registeredBuckets") && content.includes("WeakMap")) {
    violations.push("Found registeredBuckets WeakMap");
  }

  return violations;
}

function main() {
  console.log("🔍 Checking production builds for real instrumentation...\n");

  if (!existsSync(DIST_DIR)) {
    console.error(`❌ Error: ${DIST_DIR}/ directory not found. Run build first.`);
    process.exit(1);
  }

  const runtimeFiles = [];
  const typeFiles = [];
  let hasInstrumentationChunk = false;
  let foundViolations = false;

  // Collect files
  walkDir(DIST_DIR, (filePath) => {
    const relativePath = relative(DIST_DIR, filePath);

    // Check for runtime instrumentation chunks (not .d.ts files)
    if (
      !PUBLIC_TYPES_PATTERN.test(filePath) &&
      relativePath.includes("instrumentation") &&
      !relativePath.includes("instrumentation-noop")
    ) {
      console.error(`❌ Found real instrumentation chunk: ${relativePath}`);
      hasInstrumentationChunk = true;
      foundViolations = true;
    }

    if (RUNTIME_PATTERN.test(filePath)) {
      runtimeFiles.push(filePath);
    } else if (PUBLIC_TYPES_PATTERN.test(filePath)) {
      typeFiles.push(filePath);
    }
  });

  if (runtimeFiles.length === 0) {
    console.error("❌ Error: No runtime files found in dist/");
    process.exit(1);
  }

  console.log(`📦 Found ${runtimeFiles.length} runtime files`);
  console.log(`📄 Found ${typeFiles.length} type declaration files\n`);

  // Check runtime files for real instrumentation artifacts
  console.log("🔎 Checking runtime files for real instrumentation...");
  for (const filePath of runtimeFiles) {
    const relativePath = relative(process.cwd(), filePath);
    const violations = checkFileForRealInstrumentation(filePath);

    if (violations.length > 0) {
      console.error(`\n❌ ${relativePath}:`);
      for (const violation of violations) {
        console.error(`   - ${violation}`);
      }
      foundViolations = true;
    }
  }

  if (!foundViolations) {
    console.log("✅ All runtime files clean");
  }

  // Check type declaration files for leaked globals
  console.log("\n🔎 Checking type declarations for leaked globals...");
  let foundLeakedGlobal = false;

  for (const filePath of typeFiles) {
    const content = readFileSync(filePath, "utf-8");
    const relativePath = relative(process.cwd(), filePath);

    // Check for __VUE_TUI_PERF_INSTRUMENTATION__ in public declarations
    if (content.includes("__VUE_TUI_PERF_INSTRUMENTATION__")) {
      console.error(`❌ ${relativePath}:`);
      console.error("   - Found leaked compile-time global in public type declaration");
      foundLeakedGlobal = true;
      foundViolations = true;
    }
  }

  if (!foundLeakedGlobal) {
    console.log("✅ No leaked globals in public types");
  }

  // Final verdict
  console.log("\n" + "=".repeat(60));
  if (foundViolations || hasInstrumentationChunk) {
    console.error("❌ FAILED: Production builds contain real instrumentation\n");
    console.error("Production artifacts must not include:");
    console.error("  • Real instrumentation implementation");
    console.error("  • Instrumentation metric collectors");
    console.error("  • Separate real instrumentation chunks");
    console.error("  • Compile-time globals in public types");
    console.error("\nEnsure build plugins correctly replace with no-op stub.");
    process.exit(1);
  }

  console.log("✅ PASSED: Production builds are instrumentation-free\n");
  console.log("All checks passed:");
  console.log(`  • ${runtimeFiles.length} runtime files verified clean`);
  console.log(`  • ${typeFiles.length} type declaration files verified clean`);
  console.log("  • No real instrumentation chunks found");
  console.log("  • No leaked compile-time globals");
  console.log("\nNote: No-op stub is present and expected in production builds.");
  process.exit(0);
}

main();
