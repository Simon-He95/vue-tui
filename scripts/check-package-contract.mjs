import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { Package, checkPackage } from "@arethetypeswrong/core";
import { groupProblemsByKind } from "@arethetypeswrong/core/utils";

const tarballs = process.argv.slice(2);
if (tarballs.length === 0) {
  throw new Error("Usage: node scripts/check-package-contract.mjs <package.tgz...>");
}

function run(command, args) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function createAttwPackage(tarball) {
  const tempDir = mkdtempSync(join(tmpdir(), "vue-tui-attw-"));
  try {
    execFileSync("tar", ["-xzf", tarball, "-C", tempDir], {
      env: { ...process.env, LANG: "C", LC_ALL: "C" },
      stdio: "ignore",
    });

    const packageDir = join(tempDir, "package");
    const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    const files = {};
    for (const file of walk(packageDir)) {
      const rel = relative(packageDir, file).split(sep).join("/");
      files[`/node_modules/${packageJson.name}/${rel}`] = readFileSync(file);
    }

    return new Package(files, packageJson.name, packageJson.version);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function checkAttw(tarball) {
  const pkg = createAttwPackage(tarball);
  const analysis = await checkPackage(pkg);
  if (!analysis.types) {
    throw new Error(`ATTW found no package types in ${tarball}`);
  }
  if (analysis.problems.length === 0) {
    console.log(`ATTW passed: ${tarball}`);
    return;
  }

  console.error(`ATTW found ${analysis.problems.length} package type problem(s) in ${tarball}:`);
  const grouped = groupProblemsByKind(analysis.problems);
  for (const [kind, problems] of Object.entries(grouped)) {
    console.error(`- ${kind}: ${problems.length}`);
  }
  process.exitCode = 1;
}

for (const tarball of tarballs) {
  const resolved = resolve(tarball);
  run("pnpm", ["exec", "publint", "run", resolved, "--strict"]);
  await checkAttw(resolved);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
