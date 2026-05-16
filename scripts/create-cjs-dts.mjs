import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const entries = [
  "index",
  "core",
  "runtime",
  "renderer-dom",
  "observability",
  "vue",
  "cli",
  "markdown",
  "experimental",
];

for (const entry of entries) {
  const source = resolve("dist", `${entry}.d.ts`);
  const target = resolve("dist", `${entry}.d.cts`);
  if (!existsSync(source)) {
    throw new Error(`Missing declaration entry: ${source}`);
  }
  copyFileSync(source, target);
}
