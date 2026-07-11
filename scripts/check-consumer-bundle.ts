#!/usr/bin/env tsx

/**
 * Consumer Bundle Validation
 *
 * Verifies that instrumentation is tree-shaken from consumer bundles.
 * Tests three realistic fixtures with esbuild's tree-shaking.
 */

import { build } from "esbuild";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = {
  core: `
    import { createTerminal } from "@simon_he/vue-tui/core";
    const terminal = createTerminal({ cols: 80, rows: 24 });
    console.log(terminal);
  `,
  textUtils: `
    import { textCellWidth, wrapByCells } from "@simon_he/vue-tui/vue";
    console.log(textCellWidth("Hello"), wrapByCells("Test", 10));
  `,
  components: `
    import { TerminalProvider, TText } from "@simon_he/vue-tui/vue";
    console.log(TerminalProvider, TText);
  `,
};

async function main() {
  console.log("🔍 Consumer Bundle Validation\n");

  const tmpDir = join(".tmp", "consumer-bundle-test");
  mkdirSync(tmpDir, { recursive: true });

  let allPassed = true;

  for (const [name, code] of Object.entries(FIXTURES)) {
    console.log(`\n📦 Testing fixture: ${name}`);

    // Write fixture
    const entryPath = join(tmpDir, `${name}.js`);
    writeFileSync(entryPath, code);

    // Bundle with tree-shaking
    const result = await build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: "esm",
      minify: true,
      treeShaking: true,
      external: ["vue"],
      metafile: true,
    });

    const output = result.outputFiles[0].text;
    const meta = result.metafile;

    // Check for instrumentation marker (the unique string that should never be in production)
    const hasInstrumentation = output.includes("vue-tui-internal-perf-instrumentation");

    const rawSize = output.length;

    console.log(`  Size: ${rawSize} bytes`);
    console.log(`  Has instrumentation: ${hasInstrumentation ? "❌ YES" : "✅ NO"}`);

    if (hasInstrumentation) {
      console.log(`  ❌ FAIL: Instrumentation marker found in consumer bundle`);
      allPassed = false;
    } else {
      console.log(`  ✅ PASS: Bundle is clean`);
    }
  }

  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("✅ All consumer bundles are instrumentation-free");
    process.exit(0);
  } else {
    console.log("❌ Some bundles contain instrumentation");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
