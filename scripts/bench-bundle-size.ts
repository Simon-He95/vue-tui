/**
 * Phase 3.3: Bundle Size Comparison (Final + Non-blocking improvements)
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

interface FileComp {
  file: string;
  kind: "export" | "non-export";
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

function getSizeOrZero(p: string): BundleStats {
  if (!existsSync(p)) return { raw: 0, gzip: 0 };
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
  if (existsSync(distDir)) scan(distDir);
  return files.sort();
}

function extractExportPaths(pkgPath: string): string[] {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const paths = new Set<string>();
  function walk(obj: any) {
    if (typeof obj === "string") {
      if (obj.startsWith("./dist/") && (obj.endsWith(".js") || obj.endsWith(".cjs"))) {
        paths.add(obj.substring(7));
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const v of Object.values(obj)) walk(v);
    }
  }
  if (pkg.exports) walk(pkg.exports);
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
  console.log("Phase 3.3: Bundle Size Comparison");
  console.log("=".repeat(80) + "\n");

  const base = join(tmpdir(), `bundle-${Date.now()}`);
  mkdirSync(base, { recursive: true });

  const wA = join(base, "commit-a");
  const wB = join(base, "commit-b");

  try {
    setup(wA, wB);

    const emittedA = listRuntimeFiles(join(wA, "dist"));
    const emittedB = listRuntimeFiles(join(wB, "dist"));
    const allFiles = Array.from(new Set([...emittedA, ...emittedB])).sort();

    // Non-blocking improvement: Assert non-empty
    if (allFiles.length === 0) {
      throw new Error("No JS/CJS runtime files emitted");
    }

    const exportsA = extractExportPaths(join(wA, "package.json"));
    const exportsB = extractExportPaths(join(wB, "package.json"));

    if (exportsA.sort().join() !== exportsB.sort().join()) {
      throw new Error("Export paths changed between commits");
    }

    // Non-blocking improvement: Validate exports exist
    for (const file of exportsA) {
      if (!emittedA.includes(file)) {
        throw new Error(`Commit A did not emit declared export: ${file}`);
      }
      if (!emittedB.includes(file)) {
        throw new Error(`Commit B did not emit declared export: ${file}`);
      }
    }

    log(`Found ${allFiles.length} total files (${exportsA.length} exports)\n`);

    const comps: FileComp[] = [];
    let totalRawA = 0;
    let totalRawB = 0;
    let totalGzipA = 0;
    let totalGzipB = 0;

    for (const file of allFiles) {
      const a = getSizeOrZero(join(wA, "dist", file));
      const b = getSizeOrZero(join(wB, "dist", file));

      totalRawA += a.raw;
      totalRawB += b.raw;
      totalGzipA += a.gzip;
      totalGzipB += b.gzip;

      const gzipDelta = b.gzip - a.gzip;
      const isExport = exportsA.includes(file);

      let status: "acceptable" | "warning" | "fail" = "acceptable";
      if (gzipDelta > FAIL_THRESHOLD) status = "fail";
      else if (gzipDelta > WARN_THRESHOLD) status = "warning";

      comps.push({
        file,
        kind: isExport ? "export" : "non-export",
        commitA: a,
        commitB: b,
        delta: { raw: b.raw - a.raw, gzip: gzipDelta },
        status,
      });
    }

    console.log("PUBLIC EXPORTS:");
    console.log("=".repeat(80) + "\n");

    for (const c of comps.filter((x) => x.kind === "export")) {
      const sym = c.status === "acceptable" ? "✅" : c.status === "warning" ? "⚠️" : "❌";
      const pct =
        c.commitA.gzip > 0 ? ((c.commitB.gzip / c.commitA.gzip - 1) * 100).toFixed(2) : "N/A";
      console.log(`${sym} ${c.file}`);
      console.log(`   A: ${fmt(c.commitA.gzip)} gzip`);
      console.log(`   B: ${fmt(c.commitB.gzip)} gzip`);
      console.log(`   Δ: ${c.delta.gzip >= 0 ? "+" : ""}${fmt(c.delta.gzip)} (${pct}%)`);
      console.log(`   ${c.status.toUpperCase()}`);
      console.log();
    }

    const nonExports = comps.filter((x) => x.kind === "non-export");
    if (nonExports.length > 0) {
      console.log("NON-EXPORT RUNTIME FILES:");
      console.log("=".repeat(80) + "\n");

      for (const c of nonExports) {
        const sym = c.status === "acceptable" ? "✅" : c.status === "warning" ? "⚠️" : "❌";
        console.log(
          `${sym} ${c.file}: ${fmt(c.commitA.gzip)} → ${fmt(c.commitB.gzip)} (${c.delta.gzip >= 0 ? "+" : ""}${fmt(c.delta.gzip)})`,
        );
      }
      console.log();
    }

    const aggGzipDelta = totalGzipB - totalGzipA;

    console.log("=".repeat(80));
    console.log("AGGREGATE");
    console.log("=".repeat(80));
    console.log(
      `Files: ${allFiles.length}, Gzip: ${fmt(totalGzipA)} → ${fmt(totalGzipB)} (${aggGzipDelta >= 0 ? "+" : ""}${fmt(aggGzipDelta)})\n`,
    );

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
          files: comps,
          aggregate: {
            totalFiles: allFiles.length,
            commitA: { raw: totalRawA, gzip: totalGzipA },
            commitB: { raw: totalRawB, gzip: totalGzipB },
            delta: { raw: totalRawB - totalRawA, gzip: aggGzipDelta },
          },
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
    console.log(`Files: ${comps.length}, Fail: ${fail}, Warning: ${warn}\n`);

    // Non-blocking improvement: Exit 2 on warnings
    if (fail > 0) {
      console.log("❌ BUNDLE SIZE FAIL");
      process.exitCode = 1;
    } else if (warn > 0) {
      console.log("⚠️  BUNDLE SIZE WARNING (manual review required)");
      process.exitCode = 2;
    } else {
      console.log("✅ BUNDLE SIZE ACCEPTABLE");
    }
  } catch (err) {
    console.error("\n❌ Failed:", err);
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
