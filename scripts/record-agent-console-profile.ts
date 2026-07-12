#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_CONSOLE_PROFILE_DEFAULTS } from "../examples/agent-console/src/perf-harness.js";

const root = process.cwd();
const source = resolve(process.argv[2] ?? ".tmp/perf/agent-console-abc/audit.json");
const target = resolve(process.argv[3] ?? "docs/perf/agent-console-profile-baseline.json");
const audit = JSON.parse(readFileSync(source, "utf8"));
const harnessRef = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
function normalize(value: any): any {
  if (typeof value === "string") return value.replaceAll(root, "<repo>");
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}
const variants = normalize(audit.variants);
for (const value of Object.values(variants) as any[]) {
  value.productionRef = harnessRef;
  for (const scenario of Object.values(value.scenarios) as any[]) {
    scenario.preparedState = scenario.preparedStates?.[0];
    scenario.finalState = scenario.finalStates?.[0];
    delete scenario.preparedStates;
    delete scenario.finalStates;
  }
}
const comparisons: Record<string, any> = {};
for (const [name, from, to] of [
  ["B/A", "A", "B"],
  ["C/B", "B", "C"],
  ["C/A", "A", "C"],
]) {
  comparisons[name] = {};
  for (const key of Object.keys(variants.A.scenarios)) {
    const before = variants[from].scenarios[key].elapsedMs.median;
    const after = variants[to].scenarios[key].elapsedMs.median;
    comparisons[name][key] = {
      elapsedMedianFromMs: before,
      elapsedMedianToMs: after,
      ratio: after / before,
      improvementPercent: (1 - after / before) * 100,
    };
  }
}
const output = {
  schemaVersion: 4,
  harnessRef,
  canonicalConfig: { ...AGENT_CONSOLE_PROFILE_DEFAULTS, runs: 6, orders: audit.orders },
  variants,
  comparisons,
  decision:
    "Keep shallow replay backing and lazy Markdown publication; no evidence supports core cache, renderer architecture, long-text, provider-cache, or virtual-scroll changes.",
};
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(target);
