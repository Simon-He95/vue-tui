import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/check-build-warnings.mjs <build-log>");

const text = readFileSync(file, "utf8");
const forbidden = ["[UNRESOLVED_IMPORT]"];

for (const marker of forbidden) {
  if (text.includes(marker)) {
    console.error(`Build emitted forbidden warning: ${marker}`);
    process.exit(1);
  }
}
