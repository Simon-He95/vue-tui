#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AGENT_CONSOLE_PROFILE_DEFAULTS } from "../examples/agent-console/src/perf-harness.js";
import { agentConsoleScenarioEvidence } from "./agent-console-profile-evidence.js";
import { pairedComparison } from "./agent-console-profile-stats.js";
import {
  AGENT_CONSOLE_VERIFICATION_INPUTS,
  inputHashesAtRef,
  measurementInputHashes,
  verificationInputHashes,
} from "./agent-console-profile-environment.js";

const root = process.cwd();
const source = resolve(process.argv[2] ?? ".tmp/perf/agent-console-abc/audit.json");
const target = resolve(process.argv[3] ?? "docs/perf/agent-console-profile-baseline.json");
execFileSync("pnpm", ["exec", "tsx", "scripts/validate-agent-console-abc.ts", dirname(source)], {
  stdio: "inherit",
});
const audit = JSON.parse(readFileSync(source, "utf8"));
const rawRoot = dirname(source);
const raw: Record<string, any> = {};
for (const variant of ["A", "B", "C"])
  raw[variant] = {
    cli: JSON.parse(readFileSync(resolve(rawRoot, variant, "cli/all.json"), "utf8")),
    browser: JSON.parse(readFileSync(resolve(rawRoot, variant, "browser-raw.json"), "utf8"))
      .results,
  };
const verificationRef = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const verificationInputs = verificationInputHashes();
if (
  JSON.stringify(verificationInputs) !==
  JSON.stringify(inputHashesAtRef(verificationRef, AGENT_CONSOLE_VERIFICATION_INPUTS))
)
  throw new Error(`verification inputs do not match verificationRef ${verificationRef}`);
let measurementRef: string | undefined;
for (const variant of ["A", "B", "C"]) {
  const cliEnvironment = JSON.parse(
    readFileSync(resolve(rawRoot, variant, "cli/environment.json"), "utf8"),
  );
  const browserEnvironment = JSON.parse(
    readFileSync(resolve(rawRoot, variant, "browser-raw.json"), "utf8"),
  ).environment;
  for (const environment of [cliEnvironment, browserEnvironment]) {
    measurementRef ??= environment.commit;
    if (environment.commit !== measurementRef || environment.dirty !== false)
      throw new Error(`${variant}: inconsistent or dirty raw measurement provenance`);
    if (JSON.stringify(environment.measurementInputs) !== JSON.stringify(measurementInputHashes()))
      throw new Error(`${variant}: measurement input hashes do not match current checkout`);
  }
}
function normalize(value: any): any {
  if (typeof value === "string") return value.replaceAll(root, "<repo>");
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}
const variants = normalize(audit.variants);
for (const value of Object.values(variants) as any[]) {
  value.productionRef = measurementRef;
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
    const paired = pairedComparison(raw[from][runtime], raw[to][runtime], scenario);
    comparisons[name][key] = {
      elapsedMedianFromMs: before,
      elapsedMedianToMs: after,
      ratio: after / before,
      improvementPercent: (1 - after / before) * 100,
      ...paired,
      evidence: agentConsoleScenarioEvidence(
        raw[from][runtime],
        raw[to][runtime],
        runtime,
        scenario,
      ),
    };
  }
}
const output = {
  schemaVersion: 5,
  measurementRef,
  measurementInputs: measurementInputHashes(),
  verificationRef,
  verificationInputs,
  canonicalConfig: { ...AGENT_CONSOLE_PROFILE_DEFAULTS, runs: 6, orders: audit.orders },
  variants,
  comparisons,
  decision:
    "Keep shallow replay backing and lazy Markdown publication; no evidence supports core cache, renderer architecture, long-text, provider-cache, or virtual-scroll changes.",
};
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(target);
