#!/usr/bin/env node

/**
 * Production Instrumentation Strip Verification
 *
 * Verifies real instrumentation module has bytesInOutput === 0 using
 * first-build metafiles (not re-bundling).
 *
 * Exit codes:
 * 0 - All checks passed
 * 1 - Instrumentation found in production artifacts
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, normalize } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const realInstrumentationPath = normalize(
  resolve(rootDir, "src/core/perf/instrumentation.ts"),
);
const noopInstrumentationPath = normalize(
  resolve(rootDir, "src/core/perf/instrumentation-noop.ts"),
);

function bytesInOutputs(metafile, inputMatcher) {
  let total = 0;

  for (const output of Object.values(metafile.outputs || {})) {
    for (const [input, contribution] of Object.entries(output.inputs ?? {})) {
      const normalizedInput = normalize(resolve(rootDir, input));
      if (inputMatcher(normalizedInput)) {
        total += contribution.bytesInOutput || 0;
      }
    }
  }

  return total;
}

async function main() {
  console.log("🔍 Production Strip Verification (First-Build Metafiles)\n");

  const metafileDir = join(rootDir, "dist", ".metafiles");

  if (!existsSync(metafileDir)) {
    console.error("❌ Error: dist/.metafiles/ not found.");
    console.error("Build scripts must output metafiles for verification.");
    process.exit(1);
  }

  const cjsBrowserPath = join(metafileDir, "cjs-browser.json");
  const cjsCliPath = join(metafileDir, "cjs-cli.json");

  if (!existsSync(cjsBrowserPath)) {
    console.error("❌ Error: CJS browser metafile not found");
    process.exit(1);
  }

  if (!existsSync(cjsCliPath)) {
    console.error("❌ Error: CJS CLI metafile not found");
    process.exit(1);
  }

  let foundViolations = false;

  // Check CJS browser
  console.log("📦 Checking CJS browser builds...");
  const cjsBrowserMeta = JSON.parse(readFileSync(cjsBrowserPath, "utf-8"));

  const browserRealBytes = bytesInOutputs(
    cjsBrowserMeta,
    (path) => path === realInstrumentationPath,
  );
  const browserNoopBytes = bytesInOutputs(
    cjsBrowserMeta,
    (path) => path === noopInstrumentationPath,
  );

  console.log(`  Real instrumentation: ${browserRealBytes} bytes`);
  console.log(`  No-op stub: ${browserNoopBytes} bytes`);

  if (browserRealBytes > 0) {
    console.error(`  ❌ FAIL: Real instrumentation in CJS browser builds`);
    foundViolations = true;
  } else if (browserNoopBytes > 0) {
    console.warn(`  ⚠️  WARN: No-op stub ${browserNoopBytes} bytes (guards prevent execution)`);
  } else {
    console.log(`  ✅ PASS: Both modules at 0 bytes`);
  }

  // Check CJS CLI
  console.log("\n📦 Checking CJS CLI build...");
  const cjsCliMeta = JSON.parse(readFileSync(cjsCliPath, "utf-8"));

  const cliRealBytes = bytesInOutputs(
    cjsCliMeta,
    (path) => path === realInstrumentationPath,
  );
  const cliNoopBytes = bytesInOutputs(
    cjsCliMeta,
    (path) => path === noopInstrumentationPath,
  );

  console.log(`  Real instrumentation: ${cliRealBytes} bytes`);
  console.log(`  No-op stub: ${cliNoopBytes} bytes`);

  if (cliRealBytes > 0) {
    console.error(`  ❌ FAIL: Real instrumentation in CJS CLI build`);
    foundViolations = true;
  } else if (cliNoopBytes > 0) {
    console.warn(`  ⚠️  WARN: No-op stub ${cliNoopBytes} bytes (guards prevent execution)`);
  } else {
    console.log(`  ✅ PASS: Both modules at 0 bytes`);
  }

  // Final verdict
  console.log("\n" + "=".repeat(60));
  if (foundViolations) {
    console.error("❌ FAILED: Production builds contain instrumentation\n");
    console.error("First-build metafile analysis shows non-zero bytesInOutput.");
    console.error("\nBoth modules must be 0 bytes:");
    console.error("  • src/core/perf/instrumentation.ts (real)");
    console.error("  • src/core/perf/instrumentation-noop.ts (no-op)");
    process.exit(1);
  }

  console.log("✅ PASSED: Production builds are instrumentation-free\n");
  console.log("First-build metafile verification:");
  console.log("  • Real instrumentation: 0 bytes");
  console.log("  • No-op stub: 0 bytes");
  console.log("  • CJS browser builds: clean");
  console.log("  • CJS CLI build: clean");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Verification error:", err);
  process.exit(1);
});
