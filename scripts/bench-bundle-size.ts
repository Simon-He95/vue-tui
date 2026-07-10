/**
 * Phase 3.3: Bundle Size Comparison (v4 - Final)
 *
 * Fixes:
 * - Derives entries from package.json exports
 * - Tests all published JS/CJS files
 * - Robust cleanup
 */

import { execFileSync } from "node:child_process";
import { statSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function extractExportPaths(pkgPath: string): string[] {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const paths = new Set<string>();

  function walk(obj: any) {
    if (typeof obj === "string") {
      if (obj.startsWith("./dist/") && (obj.endsWith(".js") || obj.endsWith(".cjs"))) {
        paths.add(obj.substring(2)); // Remove leading ./
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
  console.log("Phase 3.3: Bundle Size Comparison (v4)");
  console.log("=".repeat(80) + "\n");

  const base = join(tmpdir(), `bundle-${Date.now()}`);
  mkdirSync(base, { recursive: true });

  const wA = join(base, "commit-a");
  const wB = join(base, "commit-b");

  try {
    setup(wA, wB);

    // Extract entries from package.json
    const entriesA = extractExportPaths(join(wA, "package.json"));
    const entriesB = extractExportPaths(join(wB, "package.json"));

    if (entriesA.sort().join() !== entriesB.sort().join()) {
      throw new Error("Export paths changed between commits");
    }

    log(`Found ${entriesA.length} published entries\n`);

    const comps: EntryComp[] = [];
    for (const entry of entriesA) {
      const a = getSize(join(wA, entry));
      const b = getSize(join(wB, entry));

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

    if (comps.length !== entriesA.length) {
      throw new Error("Incomplete bundle comparison");
    }

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
          comparisons: comps,
        },
        null,
        2,
      ),
    );

    const fail = comps.filter((c) => c.status === "fail").length;
    const warn = comps.filter((c) => c.status === "warning").length;
    const totalIncrease = comps.reduce((sum, c) => sum + Math.max(0, c.delta.gzip), 0);

    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Entries: ${comps.length}, Fail: ${fail}, Warning: ${warn}`);
    console.log(`Total gzip increase: +${fmt(totalIncrease)}\n`);

    if (fail > 0) {
      console.log("❌ BUNDLE SIZE FAIL");
      process.exitCode = 1;
    } else if (warn > 0) {
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
