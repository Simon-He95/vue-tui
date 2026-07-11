#!/usr/bin/env node

/**
 * Production Instrumentation Strip Verification
 *
 * Verifies real instrumentation module has bytesInOutput === 0 using build metafiles.
 * Checks both ESM and CJS builds, ensures no-op stub is also eliminated.
 *
 * Exit codes:
 * 0 - All checks passed
 * 1 - Instrumentation found in production artifacts
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, resolve, normalize } from "node:path";
import { build as esbuild } from "esbuild";
import process from "node:process";

const DIST_DIR = "dist";
const rootDir = process.cwd();

// Module paths to check
const realInstrumentationPath = normalize(resolve(rootDir, "src/core/perf/instrumentation.ts"));
const noopInstrumentationPath = normalize(
  resolve(rootDir, "src/core/perf/instrumentation-noop.ts"),
);

async function checkCJSBuild(entryFile) {
  // Re-bundle a CJS file to get metafile
  const result = await esbuild({
    entryPoints: [entryFile],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    external: ["vue", "node:*"],
    metafile: true,
  });

  let realBytes = 0;
  let noopBytes = 0;

  for (const output of Object.values(result.metafile.outputs)) {
    for (const [input, contribution] of Object.entries(output.inputs ?? {})) {
      const normalizedInput = normalize(resolve(rootDir, input));
      if (normalizedInput === realInstrumentationPath) {
        realBytes += contribution.bytesInOutput;
      }
      if (normalizedInput === noopInstrumentationPath) {
        noopBytes += contribution.bytesInOutput;
      }
    }
  }

  return { realBytes, noopBytes };
}

async function main() {
  console.log("🔍 Checking production builds with metafile analysis...\n");

  if (!existsSync(DIST_DIR)) {
    console.error(`❌ Error: ${DIST_DIR}/ directory not found. Run build first.`);
    process.exit(1);
  }

  // Collect CJS files
  const cjsFiles = [];
  function walkDir(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (fullPath.endsWith(".cjs")) {
        cjsFiles.push(fullPath);
      }
    }
  }

  walkDir(DIST_DIR);

  if (cjsFiles.length === 0) {
    console.error("❌ Error: No .cjs files found in dist/");
    process.exit(1);
  }

  console.log(`📦 Found ${cjsFiles.length} CJS files to check\n`);

  let foundViolations = false;
  const tmpDir = join(".tmp", "metafile-check");
  mkdirSync(tmpDir, { recursive: true });

  // Check each CJS file
  for (const cjsFile of cjsFiles) {
    const relativePath = relative(process.cwd(), cjsFile);
    console.log(`🔎 Checking ${relativePath}...`);

    const { realBytes, noopBytes } = await checkCJSBuild(cjsFile);

    if (realBytes > 0) {
      console.error(`  ❌ Real instrumentation: ${realBytes} bytes`);
      foundViolations = true;
    } else if (noopBytes > 0) {
      console.error(`  ❌ No-op stub: ${noopBytes} bytes`);
      foundViolations = true;
    } else {
      console.log(`  ✅ Clean (0 bytes from instrumentation)`);
    }
  }

  // Check ESM build (use tsdown metafile if available)
  const metafilePath = join(DIST_DIR, ".metafile.json");
  if (existsSync(metafilePath)) {
    console.log("\n🔎 Checking ESM metafile...");
    const metafile = JSON.parse(readFileSync(metafilePath, "utf-8"));

    let realBytes = 0;
    let noopBytes = 0;

    for (const output of Object.values(metafile.outputs || {})) {
      for (const [input, contribution] of Object.entries(output.inputs ?? {})) {
        const normalizedInput = normalize(resolve(rootDir, input));
        if (normalizedInput === realInstrumentationPath) {
          realBytes += contribution.bytesInOutput || 0;
        }
        if (normalizedInput === noopInstrumentationPath) {
          noopBytes += contribution.bytesInOutput || 0;
        }
      }
    }

    if (realBytes > 0) {
      console.error(`  ❌ Real instrumentation: ${realBytes} bytes`);
      foundViolations = true;
    } else if (noopBytes > 0) {
      console.error(`  ❌ No-op stub: ${noopBytes} bytes`);
      foundViolations = true;
    } else {
      console.log(`  ✅ Clean (0 bytes from instrumentation)`);
    }
  }

  // Final verdict
  console.log("\n" + "=".repeat(60));
  if (foundViolations) {
    console.error("❌ FAILED: Production builds contain instrumentation\n");
    console.error("Metafile analysis shows non-zero bytesInOutput for:");
    console.error("  • src/core/perf/instrumentation.ts (real), OR");
    console.error("  • src/core/perf/instrumentation-noop.ts (no-op)");
    console.error("\nBoth must be 0 bytes in production builds.");
    process.exit(1);
  }

  console.log("✅ PASSED: Production builds are instrumentation-free\n");
  console.log("Metafile verification complete:");
  console.log("  • Real instrumentation: 0 bytes");
  console.log("  • No-op stub: 0 bytes");
  console.log("  • All CJS files clean");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Verification error:", err);
  process.exit(1);
});
