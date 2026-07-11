#!/usr/bin/env node

/**
 * Production Instrumentation Strip Verification
 *
 * Verifies that standard production builds exclude all performance instrumentation.
 *
 * Checks:
 * 1. No instrumentation method names in dist files
 * 2. No instrumentation marker strings
 * 3. No separate instrumentation chunks
 * 4. Declaration file not leaked to public types
 *
 * Exit codes:
 * 0 - All checks passed
 * 1 - Instrumentation found in production artifacts
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

// Unique marker string that should NEVER appear in production builds
const INSTRUMENTATION_MARKER = "vue-tui-internal-perf-instrumentation";

// Method names that indicate instrumentation presence
const INSTRUMENTATION_METHODS = [
  "recordTextCellWidthCall",
  "recordCreateCellCall",
  "recordWrapByCellsCall",
  "recordSegmentedGraphemesCall",
  "recordCacheHit",
  "recordCacheMiss",
  "recordNewCell",
  "recordBlankCacheHit",
  "recordContinuationCacheHit",
  "recordTextWidthCacheHit",
  "recordWrapCacheHit",
  "recordCacheClear",
  "recordTextWidthCacheSet",
  "recordTextWidthCacheEvict",
  "recordWrapCacheSet",
  "recordWrapCacheClear",
  "recordWrapWidthBucketMapClear",
  "recordRenderPassCacheHit",
  "recordRenderPassCacheMiss",
  "recordSegmentationRequiredInput",
  "recordIntlSegmenterUsed",
  "recordFallbackSegmenterUsed",
  "registerCacheBucket",
  "updateMaxCacheSize",
  "recordCharCellWidthCall",
];

// Global state identifiers
const INSTRUMENTATION_GLOBALS = [
  "instrumentationEnabled",
  "enableInstrumentation",
  "disableInstrumentation",
  "resetInstrumentation",
  "getInstrumentationMetrics",
];

// Metric field patterns
const INSTRUMENTATION_METRICS = [
  "registeredBucketSizeP95Width1",
  "registeredBucketSizeP95Width2",
  "estimatedRegisteredBucketCells",
  "maxCacheSizeWidth1",
  "maxCacheSizeWidth2",
  "textCellWidthCalls",
  "asciiFastPathCount",
  "wrapByCellsCalls",
  "segmentedGraphemesCalls",
];

const DIST_DIR = "dist";
const PUBLIC_TYPES_PATTERN = /\.d\.(ts|cts|mts)$/;
const RUNTIME_PATTERN = /\.(js|cjs|mjs)$/;

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

function checkFileForInstrumentation(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const violations = [];

  // Check marker
  if (content.includes(INSTRUMENTATION_MARKER)) {
    violations.push(`Found instrumentation marker: ${INSTRUMENTATION_MARKER}`);
  }

  // Check methods
  for (const method of INSTRUMENTATION_METHODS) {
    if (content.includes(method)) {
      violations.push(`Found instrumentation method: ${method}`);
    }
  }

  // Check globals
  for (const global of INSTRUMENTATION_GLOBALS) {
    if (content.includes(global)) {
      violations.push(`Found instrumentation global: ${global}`);
    }
  }

  // Check metrics
  for (const metric of INSTRUMENTATION_METRICS) {
    if (content.includes(metric)) {
      violations.push(`Found instrumentation metric: ${metric}`);
    }
  }

  return violations;
}

function main() {
  console.log("🔍 Checking production builds for instrumentation...\n");

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

    // Check for instrumentation chunks
    if (
      relativePath.includes("instrumentation") ||
      relativePath.includes("perf-instrumentation")
    ) {
      console.error(`❌ Found instrumentation chunk: ${relativePath}`);
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

  // Check runtime files
  console.log("🔎 Checking runtime files...");
  for (const filePath of runtimeFiles) {
    const relativePath = relative(process.cwd(), filePath);
    const violations = checkFileForInstrumentation(filePath);

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

  // Check type declaration files for leaked global
  console.log("\n🔎 Checking type declarations for leaked globals...");
  let foundLeakedGlobal = false;

  for (const filePath of typeFiles) {
    const content = readFileSync(filePath, "utf-8");
    const relativePath = relative(process.cwd(), filePath);

    // Check for __VUE_TUI_PERF_INSTRUMENTATION__ in public declarations
    // (It should only be in internal source, not emitted .d.ts)
    if (content.includes("__VUE_TUI_PERF_INSTRUMENTATION__")) {
      console.error(`❌ ${relativePath}:`);
      console.error(
        "   - Found leaked compile-time global in public type declaration",
      );
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
    console.error(
      "❌ FAILED: Production builds contain instrumentation\n",
    );
    console.error("Production artifacts must not include:");
    console.error("  • Instrumentation method calls");
    console.error("  • Instrumentation marker strings");
    console.error("  • Separate instrumentation chunks");
    console.error("  • Compile-time globals in public types");
    console.error(
      "\nEnsure __VUE_TUI_PERF_INSTRUMENTATION__ is defined as false in builds.",
    );
    process.exit(1);
  }

  console.log("✅ PASSED: Production builds are instrumentation-free\n");
  console.log("All checks passed:");
  console.log(
    `  • ${runtimeFiles.length} runtime files verified clean`,
  );
  console.log(
    `  • ${typeFiles.length} type declaration files verified clean`,
  );
  console.log("  • No instrumentation chunks found");
  console.log("  • No leaked compile-time globals");
  process.exit(0);
}

main();
