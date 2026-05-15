import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertNoBrowserForbiddenCode } from "./browser-forbidden-code.js";

const outDir = resolve(process.argv[2] ?? ".tmp/browser-vite-import");

if (!existsSync(outDir)) {
  throw new Error(`Browser Vite output not found: ${outDir}`);
}

const files = [];
function collect(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      collect(file);
      continue;
    }
    if (file.endsWith(".js")) files.push(file);
  }
}

collect(outDir);

if (!files.length) throw new Error(`Browser Vite output has no JavaScript files: ${outDir}`);

const forbiddenBundlePatterns = [
  /\bbrowser-external:/u,
  /Module has been externalized for browser compatibility/u,
  /\b__commonJS\b/u,
  /\b__require\b/u,
  /\brequire\s*\(/u,
];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  assertNoBrowserForbiddenCode(source, file);
  for (const pattern of forbiddenBundlePatterns) {
    if (!pattern.test(source)) continue;
    throw new Error(`${file} contains forbidden browser bundle code: ${pattern}`);
  }
}
