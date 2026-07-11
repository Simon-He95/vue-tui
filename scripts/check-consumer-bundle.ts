#!/usr/bin/env tsx

/**
 * Consumer Bundle Validation (Packed Tarball)
 *
 * Tests consumer bundles from actual packed tarball, not monorepo source.
 * Verifies instrumentation is tree-shaken using metafile analysis.
 */

import { build as esbuild, type Metafile } from "esbuild";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve, normalize } from "node:path";

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

const rootDir = process.cwd();
const tmpDir = join(rootDir, ".tmp", "consumer-tarball-test");
const realInstrumentationPath = normalize(resolve(rootDir, "src/core/perf/instrumentation.ts"));
const noopInstrumentationPath = normalize(
  resolve(rootDir, "src/core/perf/instrumentation-noop.ts"),
);

function bytesInOutputs(metafile: Metafile, inputMatcher: (path: string) => boolean): number {
  let total = 0;

  for (const output of Object.values(metafile.outputs)) {
    for (const [input, contribution] of Object.entries(output.inputs ?? {})) {
      const normalizedInput = normalize(resolve(rootDir, input));
      if (inputMatcher(normalizedInput)) {
        total += contribution.bytesInOutput;
      }
    }
  }

  return total;
}

async function main() {
  console.log("🔍 Consumer Bundle Validation from Packed Tarball\n");

  // Clean tmp directory
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  mkdirSync(tmpDir, { recursive: true });

  // Pack the package
  console.log("📦 Packing package...");
  const packOutput = execSync("pnpm pack --pack-destination .tmp", {
    encoding: "utf-8",
    cwd: rootDir,
  });
  // Extract tarball path from output (last line)
  const lines = packOutput.trim().split("\n");
  const tarballPath = lines[lines.length - 1].trim();

  if (!existsSync(tarballPath)) {
    console.error("❌ Failed to find packed tarball:", tarballPath);
    process.exit(1);
  }

  console.log(`  Created: ${tarballPath}\n`);

  // Install in temp directory
  console.log("📥 Installing from tarball...");
  writeFileSync(
    join(tmpDir, "package.json"),
    JSON.stringify({ name: "test-consumer", version: "1.0.0" }, null, 2),
  );
  execSync(`pnpm add ${tarballPath}`, { cwd: tmpDir, stdio: "pipe" });
  console.log("  Installed\n");

  let allPassed = true;

  for (const [name, code] of Object.entries(FIXTURES)) {
    console.log(`📦 Testing fixture: ${name}`);

    // Write fixture
    const entryPath = join(tmpDir, `${name}.js`);
    writeFileSync(entryPath, code);

    // Bundle with tree-shaking and metafile
    const result = await esbuild({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: "esm",
      minify: true,
      treeShaking: true,
      external: ["vue"],
      metafile: true,
      // Important: resolve from temp directory where package is installed
      absWorkingDir: tmpDir,
    });

    const output = result.outputFiles[0].text;
    const metafile = result.metafile!;

    // Check bytes from instrumentation modules
    const realInstrBytes = bytesInOutputs(metafile, (path) => path === realInstrumentationPath);

    const noopInstrBytes = bytesInOutputs(metafile, (path) => path === noopInstrumentationPath);

    const rawSize = output.length;

    console.log(`  Raw size: ${rawSize} bytes`);
    console.log(`  Real instrumentation: ${realInstrBytes} bytes`);
    console.log(`  No-op instrumentation: ${noopInstrBytes} bytes`);

    // Both must be zero
    if (realInstrBytes > 0) {
      console.log(`  ❌ FAIL: Real instrumentation in bundle (${realInstrBytes} bytes)`);
      allPassed = false;
    } else if (noopInstrBytes > 0) {
      console.log(`  ❌ FAIL: No-op stub in bundle (${noopInstrBytes} bytes)`);
      allPassed = false;
    } else {
      console.log(`  ✅ PASS: No instrumentation bytes\n`);
    }
  }

  console.log("=".repeat(60));
  if (allPassed) {
    console.log("✅ All consumer bundles are instrumentation-free");
    console.log("\nVerified from packed tarball:");
    console.log("  • Real instrumentation: 0 bytes");
    console.log("  • No-op stub: 0 bytes");
    console.log("  • Tree-shaking complete");
    process.exit(0);
  } else {
    console.log("❌ Some bundles contain instrumentation");
    console.log("\nConsumer bundles must have zero bytes from:");
    console.log("  • src/core/perf/instrumentation.ts");
    console.log("  • src/core/perf/instrumentation-noop.ts");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
