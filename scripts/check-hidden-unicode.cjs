const fs = require("node:fs");
const path = require("node:path");

const roots = ["src", "test", "docs", "scripts"];
const bidi = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/u;
const allowed = new Set([]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
}

let failed = false;

for (const root of roots) {
  for (const file of walk(root)) {
    if (allowed.has(file)) continue;
    if (!/\.(ts|tsx|js|cjs|mjs|md|json)$/.test(file)) continue;

    const text = fs.readFileSync(file, "utf8");
    if (!bidi.test(text)) continue;

    failed = true;
    console.error(`[hidden-unicode] ${file}`);
  }
}

if (failed) process.exit(1);
