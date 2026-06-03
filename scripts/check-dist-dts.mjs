import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { assertNoBrowserForbiddenCode } from "./browser-forbidden-code.js";

const dist = resolve("dist");
const browserFacingJsEntries = [
  "index.js",
  "core.js",
  "runtime.js",
  "renderer-dom.js",
  "observability.js",
  "vue.js",
  "markdown.js",
  "experimental.js",
  "agent.js",
  "mermaid.js",
  "index.cjs",
  "core.cjs",
  "runtime.cjs",
  "renderer-dom.cjs",
  "observability.cjs",
  "vue.cjs",
  "markdown.cjs",
  "experimental.cjs",
  "agent.cjs",
];
const browserFacingDtsFiles = [
  "index.d.ts",
  "core.d.ts",
  "runtime.d.ts",
  "renderer-dom.d.ts",
  "observability.d.ts",
  "vue.d.ts",
  "markdown.d.ts",
  "experimental.d.ts",
  "agent.d.ts",
  "mermaid.d.ts",
  "index.d.cts",
  "core.d.cts",
  "runtime.d.cts",
  "renderer-dom.d.cts",
  "observability.d.cts",
  "vue.d.cts",
  "markdown.d.cts",
  "experimental.d.cts",
  "agent.d.cts",
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.cts")) out.push(path);
  }
  return out;
}

const missing = [];

function collectReachableJs(file, seen = new Set()) {
  const abs = resolve(dist, file);
  if (seen.has(abs)) return seen;
  if (!existsSync(abs)) {
    missing.push(abs);
    return seen;
  }

  seen.add(abs);
  const text = readFileSync(abs, "utf8");
  const dir = dirname(abs);
  const importRe =
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.\/[^"']+\.(?:js|cjs))["']|\bimport\s*\(\s*["'](\.\/[^"']+\.(?:js|cjs))["']\s*\)|\brequire\s*\(\s*["'](\.\/[^"']+\.(?:js|cjs))["']\s*\)/g;

  for (const match of text.matchAll(importRe)) {
    const rel = match[1] ?? match[2] ?? match[3];
    if (!rel) continue;

    const next = resolve(dir, rel);
    if (!next.startsWith(`${dist}${sep}`)) continue;
    collectReachableJs(next.slice(dist.length + 1), seen);
  }

  return seen;
}

function collectReachableDts(file, seen = new Set()) {
  const abs = resolve(dist, file);
  if (seen.has(abs)) return seen;
  if (!existsSync(abs)) {
    missing.push(abs);
    return seen;
  }

  seen.add(abs);
  const text = readFileSync(abs, "utf8");
  const dir = dirname(abs);
  const importRe =
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.\/[^"']+)\.js["']|\bimport\s*\(\s*["'](\.\/[^"']+)\.js["']\s*\)/g;

  for (const match of text.matchAll(importRe)) {
    const rel = match[1] ?? match[2];
    if (!rel) continue;

    const next = resolve(dir, `${rel}.d.ts`);
    if (!next.startsWith(`${dist}${sep}`)) continue;
    collectReachableDts(next.slice(dist.length + 1), seen);
  }

  return seen;
}

for (const file of walk(dist)) {
  const text = readFileSync(file, "utf8");
  const re = /from\s+["'](\.[^"']+)\.js["']/g;
  for (const match of text.matchAll(re)) {
    const target = resolve(dirname(file), `${match[1]}.d.ts`);
    if (!existsSync(target)) {
      missing.push(`${file} -> ${target}`);
    }
  }
}

const browserJsFiles = new Set();
for (const entry of browserFacingJsEntries) {
  for (const file of collectReachableJs(entry)) {
    browserJsFiles.add(file);
  }
}

const browserForbidden = [];
for (const file of browserJsFiles) {
  try {
    assertNoBrowserForbiddenCode(readFileSync(file, "utf8"), file);
  } catch (error) {
    browserForbidden.push(error instanceof Error ? error.message : String(error));
  }
}

const browserDtsFiles = new Set();
for (const entry of browserFacingDtsFiles) {
  for (const file of collectReachableDts(entry)) {
    browserDtsFiles.add(file);
  }
}

for (const file of browserDtsFiles) {
  try {
    assertNoBrowserForbiddenCode(readFileSync(file, "utf8"), file);
  } catch (error) {
    browserForbidden.push(error instanceof Error ? error.message : String(error));
  }
}

if (missing.length) {
  console.error("Missing declaration dependencies or browser-facing dist entries:");
  for (const item of missing) console.error(`  ${item}`);
  process.exit(1);
}

if (browserForbidden.length) {
  console.error("Browser-facing dist files contain forbidden code:");
  for (const item of browserForbidden) console.error(`  ${item}`);
  process.exit(1);
}
