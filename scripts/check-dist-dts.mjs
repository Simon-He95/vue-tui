import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const dist = resolve("dist");

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

if (missing.length) {
  console.error("Missing declaration dependencies:");
  for (const item of missing) console.error(`  ${item}`);
  process.exit(1);
}
