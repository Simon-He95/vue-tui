import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertNoBrowserForbiddenCode } from "./browser-forbidden-code.js";

const dist = resolve("dist");
const browserFacingDistFiles = [
  "index.js",
  "index.cjs",
  "index.d.ts",
  "markdown.js",
  "markdown.cjs",
  "markdown.d.ts",
  "experimental.js",
  "experimental.cjs",
  "experimental.d.ts",
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

const missing = [];

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

const browserForbidden = [];
for (const entry of browserFacingDistFiles) {
  const file = join(dist, entry);
  if (!existsSync(file)) {
    missing.push(file);
    continue;
  }

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
