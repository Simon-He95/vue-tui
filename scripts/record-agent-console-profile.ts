#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AGENT_CONSOLE_PROFILE_DEFAULTS } from "../examples/agent-console/src/perf-harness.js";

const root = process.cwd();
const source = resolve(process.argv[2] ?? ".tmp/perf/agent-console-abc/audit.json");
const target = resolve(process.argv[3] ?? "docs/perf/agent-console-profile-baseline.json");
const audit = JSON.parse(readFileSync(source, "utf8"));
const rawRoot = dirname(source);
const raw: Record<string, any> = {};
for (const variant of ["A", "B", "C"])
  raw[variant] = {
    cli: JSON.parse(readFileSync(resolve(rawRoot, variant, "cli/all.json"), "utf8")),
    browser: JSON.parse(readFileSync(resolve(rawRoot, variant, "browser-raw.json"), "utf8"))
      .results,
  };
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
function bootstrapCi(values: number[]) {
  let seed = 0x12345678;
  const estimates: number[] = [];
  for (let turn = 0; turn < 2000; turn++) {
    const sample: number[] = [];
    for (let i = 0; i < values.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      sample.push(values[seed % values.length]!);
    }
    estimates.push(median(sample));
  }
  estimates.sort((a, b) => a - b);
  return [
    estimates[Math.floor(estimates.length * 0.025)],
    estimates[Math.floor(estimates.length * 0.975)],
  ];
}
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
    const [runtime, scenario] = key.split("/");
    const byRound = (variant: string) =>
      new Map(
        raw[variant][runtime]
          .filter((run: any) => (run.scenario ?? run.name) === scenario)
          .map((run: any) => [run.round, run.elapsedMs ?? run.timing?.elapsedMs]),
      );
    const fromRounds = byRound(from),
      toRounds = byRound(to);
    const pairedRatios = [...fromRounds.keys()]
      .sort()
      .map((round) => toRounds.get(round) / fromRounds.get(round));
    comparisons[name][key] = {
      elapsedMedianFromMs: before,
      elapsedMedianToMs: after,
      ratio: after / before,
      improvementPercent: (1 - after / before) * 100,
      pairedRatios,
      pairedMedianRatio: median(pairedRatios),
      pairedBootstrapCi95: bootstrapCi(pairedRatios),
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
