/**
 * Phase 3.3: Bundle Size Comparison (v5 - Final)
 *
 * Fixes:
 * - Tests ALL emitted JS/CJS files in dist/
 * - Validates no unexpected files
 * - Compares both exports and aggregate
 */

import { execFileSync } from "node:child_process";
import {
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const COMMIT_A = "697472b0cc5c000fb46baf16e85c60d84ee22471";
const COMMIT_B = "4d543ff7042f9c2400fa50a9dff921a0f36f77a3";
const WARN_THRESHOLD = 2048;
const FAIL_THRESHOLD = 5120;

interface BundleStats {
  raw: number;
  gzip: number;
}

interface EntryComp {
  entry: string;
  commitA: BundleStats;
  commitB: BundleStats;
  delta: { raw: number; gzip: number };
  status: "acceptable" | "warning" | "fail";
}

function log(msg: string) {
  console.log(`[Bundle] ${msg}`);
}

function fmt(b: number): string {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(2)} KB`;
}

function getSize(p: string): BundleStats {
  if (!existsSync(p)) throw new Error(`Expected bundle missing: ${p}`);
  const raw = statSync(p).size;
  const gzip = gzipSync(readFileSync(p)).length;
  return { raw, gzip };
}

function listRuntimeFiles(distDir: string): string[] {
  const files: string[] = [];
  function scan(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        scan(full);
      } else if (ent.name.endsWith(".js") || ent.name.endsWith(".cjs")) {
        files.push(relative(distDir, full));
      }
    }
  }
  scan(distDir);
  return files.sort();
}

function extractExportPaths(pkgPath: string): string[] {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const paths = new Set<string>();

  function walk(obj: any) {
    if (typeof obj === "string") {
      if (obj.startsWith("./dist/") && (obj.endsWith(".js") || obj.endsWith(".cjs"))) {
        paths.add(obj.substring(7)); // Remove ./dist/
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const v of Object.values(obj)) {
        walk(v);
      }
    }
  }

  if (pkg.exports) {
    walk(pkg.exports);
  }

  return Array.from(paths).sort();
}

function removeWorktree(path: string) {
  try {
    execFileSync("git", ["worktree", "remove", "--force", path], { stdio: "ignore" });
  } catch {}
}

function setup(wA: string, wB: string) {
  log("Creating worktrees...");
  execFileSync("git", ["worktree", "add", "--detach", wA, COMMIT_A], { stdio: "inherit" });
  execFileSync("git", ["worktree", "add", "--detach", wB, COMMIT_B], { stdio: "inherit" });

  log("Installing...");
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: wA, stdio: "inherit" });
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: wB, stdio: "inherit" });

  log("Building...");
  execFileSync("pnpm", ["run", "build"], { cwd: wA, stdio: "inherit" });
  execFileSync("pnpm", ["run", "build"], { cwd: wB, stdio: "inherit" });
}

function main() {
  console.log("=".repeat(80));
  console.log("Phase 3.3: Bundle Size Comparison (v5)");
  console.log("=".repeat(80) + "\n");

  const base = join(tmpdir(), `bundle-${Date.now()}`);
  mkdirSync(base, { recursive: true });

  const wA = join(base, "commit-a");
  const wB = join(base, "commit-b");

  try {
    setup(wA, wB);

    // List all emitted runtime files
    const emittedA = listRuntimeFiles(join(wA, "dist"));
    const emittedB = listRuntimeFiles(join(wB, "dist"));

    if (emittedA.join() !== emittedB.join()) {
      throw new Error("Emitted file set changed between commits");
    }

    log(`Found ${emittedA.length} emitted JS/CJS files\n`);

    // Extract export targets for focused reporting
    const exportsA = extractExportPaths(join(wA, "package.json"));
    const exportsB = extractExportPaths(join(wB, "package.json"));

    if (exportsA.sort().join() !== exportsB.sort().join()) {
      throw new Error("Export paths changed between commits");
    }

    // Compare all emitted files
    const comps: EntryComp[] = [];
    let totalRawA = 0;
    let totalRawB = 0;
    let totalGzipA = 0;
    let totalGzipB = 0;

    console.log("PUBLIC EXPORTS:");
    console.log("=".repeat(80) + "\n");

    for (const entry of exportsA) {
      const a = getSize(join(wA, "dist", entry));
      const b = getSize(join(wB, "dist", entry));

      totalRawA += a.raw;
      totalRawB += b.raw;
      totalGzipA += a.gzip;
      totalGzipB += b.gzip;

      const raw = b.raw - a.raw;
      const gzip = b.gzip - a.gzip;

      let status: "acceptable" | "warning" | "fail" = "acceptable";
      if (gzip > FAIL_THRESHOLD) status = "fail";
      else if (gzip > WARN_THRESHOLD) status = "warning";

      comps.push({ entry, commitA: a, commitB: b, delta: { raw, gzip }, status });

      const sym = status === "acceptable" ? "✅" : status === "warning" ? "⚠️" : "❌";
      const pct = ((b.gzip / a.gzip - 1) * 100).toFixed(2);
      console.log(`${sym} ${entry}`);
      console.log(`   A: ${fmt(a.gzip)} gzip`);
      console.log(`   B: ${fmt(b.gzip)} gzip`);
      console.log(`   Δ: ${gzip >= 0 ? "+" : ""}${fmt(gzip)} (${pct}%)`);
      console.log(`   ${status.toUpperCase()}`);
      console.log();
    }

    // Check for non-export emitted files
    const nonExports = emittedA.filter((f) => !exportsA.includes(f));
    if (nonExports.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("NON-EXPORT RUNTIME FILES:");
      console.log("=".repeat(80) + "\n");

      for (const entry of nonExports) {
        const a = getSize(join(wA, "dist", entry));
        const b = getSize(join(wB, "dist", entry));

        totalRawA += a.raw;
        totalRawB += b.raw;
        totalGzipA += a.gzip;
        totalGzipB += b.gzip;

        const gzip = b.gzip - a.gzip;
        console.log(
          `ℹ️  ${entry}: ${fmt(a.gzip)} → ${fmt(b.gzip)} (${gzip >= 0 ? "+" : ""}${fmt(gzip)})`,
        );
      }
      console.log();
    }

    // Aggregate comparison
    const aggRawDelta = totalRawB - totalRawA;
    const aggGzipDelta = totalGzipB - totalGzipA;

    console.log("=".repeat(80));
    console.log("AGGREGATE (All Emitted JS/CJS)");
    console.log("=".repeat(80));
    console.log(`Total files: ${emittedA.length}`);
    console.log(
      `Total raw: ${fmt(totalRawA)} → ${fmt(totalRawB)} (${aggRawDelta >= 0 ? "+" : ""}${fmt(aggRawDelta)})`,
    );
    console.log(
      `Total gzip: ${fmt(totalGzipA)} → ${fmt(totalGzipB)} (${aggGzipDelta >= 0 ? "+" : ""}${fmt(aggGzipDelta)})`,
    );
    console.log();

    mkdirSync("docs/perf", { recursive: true });
    writeFileSync(
      "docs/perf/phase3.3-bundle-sizes.json",
      JSON.stringify(
        {
          config: {
            commitA: COMMIT_A,
            commitB: COMMIT_B,
            warnThreshold: WARN_THRESHOLD,
            failThreshold: FAIL_THRESHOLD,
          },
          timestamp: new Date().toISOString(),
          exports: comps,
          aggregate: {
            totalFiles: emittedA.length,
            commitA: { raw: totalRawA, gzip: totalGzipA },
            commitB: { raw: totalRawB, gzip: totalGzipB },
            delta: { raw: aggRawDelta, gzip: aggGzipDelta },
          },
          nonExportFiles: nonExports,
        },
        null,
        2,
      ),
    );

    const fail = comps.filter((c) => c.status === "fail").length;
    const warn = comps.filter((c) => c.status === "warning").length;

    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Exports tested: ${comps.length}, Fail: ${fail}, Warning: ${warn}`);
    console.log(`Aggregate gzip delta: ${aggGzipDelta >= 0 ? "+" : ""}${fmt(aggGzipDelta)}\n`);

    if (fail > 0) {
      console.log("❌ BUNDLE SIZE FAIL");
      process.exitCode = 1;
    } else if (warn > 0 || aggGzipDelta > 10240) {
      console.log("⚠️  BUNDLE SIZE WARNING");
    } else {
      console.log("✅ BUNDLE SIZE ACCEPTABLE");
    }
  } catch (err) {
    console.error("\n❌ Bundle comparison failed:", err);
    throw err;
  } finally {
    removeWorktree(wA);
    removeWorktree(wB);
    try {
      execFileSync("git", ["worktree", "prune"], { stdio: "ignore" });
    } catch {}
    try {
      rmSync(base, { recursive: true, force: true });
    } catch {}
  }
}

main();
