import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/check-build-warnings.mjs <build-log>");

const text = readFileSync(file, "utf8");

const forbidden = [
  /\[UNRESOLVED_IMPORT\]/i,
  /Module has been externalized for browser compatibility/i,
  /Could not resolve/i,
  /\bwarning\b/i,
  /▲\s*\[WARNING\]/i,
  /\[WARNING\]/i,
];

const allowed = [
  // Put intentionally tolerated warnings here.
];

for (const pattern of forbidden) {
  if (!pattern.test(text)) continue;
  if (allowed.some((allow) => allow.test(text))) continue;

  console.error(`Build emitted forbidden warning: ${pattern}`);
  process.exit(1);
}
