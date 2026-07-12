#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_CONSOLE_PROFILE_SCENARIOS } from "../examples/agent-console/src/perf-harness.js";
import { profileInputHashes } from "./agent-console-profile-environment.js";

const file = resolve(process.argv[2] ?? "docs/perf/agent-console-profile-baseline.json");
const data = JSON.parse(readFileSync(file, "utf8"));
function fail(message: string): never {
  throw new Error(`Committed Agent Console baseline invalid: ${message}`);
}
if (data.schemaVersion !== 4 || !/^[0-9a-f]{40}$/.test(data.harnessRef)) fail("schema/harnessRef");
if (JSON.stringify(data.profileInputs) !== JSON.stringify(profileInputHashes()))
  fail("profile input content hashes changed");
for (const variant of ["A", "B", "C"]) {
  const value = data.variants?.[variant];
  if (!value || value.productionRef !== data.harnessRef) fail(`${variant} productionRef`);
  for (const runtime of ["cli", "browser"])
    for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
      const result = value.scenarios?.[`${runtime}/${scenario}`];
      if (!result || result.runCount !== 6 || result.correctnessPasses !== 6)
        fail(`${variant}/${runtime}/${scenario} run gate`);
      if (
        result.preparedState?.visualIndexStatus !== "exact" ||
        result.finalState?.visualIndexStatus !== "exact"
      )
        fail(`${variant}/${runtime}/${scenario} exact state`);
    }
}
for (const comparison of ["B/A", "C/B", "C/A"])
  for (const value of Object.values(data.comparisons[comparison]) as any[])
    if (value.pairedRatios?.length !== 6 || value.pairedBootstrapCi95?.length !== 2)
      fail(`${comparison} paired evidence`);
for (const runtime of ["cli", "browser"]) {
  for (const scenario of ["tail-append-burst-framed", "tail-append-burst-single-task"]) {
    const key = `${runtime}/${scenario}`;
    for (const name of ["B/A", "C/B"]) {
      const comparison = data.comparisons[name][key];
      const inconclusiveCliFramed = name === "B/A" && key === "cli/tail-append-burst-framed";
      if (
        comparison.pairedMedianRatio > 0.95 ||
        (inconclusiveCliFramed
          ? comparison.pairedBootstrapCi95[0] > 0.95
          : comparison.pairedBootstrapCi95[1] >= 0.95)
      )
        fail(`${key} ${name} paired target gate`);
    }
  }
  for (const scenario of [
    "tail-stream-steady",
    "detached-append",
    "search-large-history",
    "stream-scroll-interaction",
    "markdown-toggle-large-history",
    "markdown-stream-steady",
  ]) {
    const key = `${runtime}/${scenario}`,
      comparison = data.comparisons["C/A"][key];
    const limit = key === "cli/markdown-toggle-large-history" ? 1.15 : 1.1;
    const frameA = data.variants.A.scenarios[key].frameP95Ms.median;
    const frameC = data.variants.C.scenarios[key].frameP95Ms.median;
    if (frameC / frameA > 1.1 && frameC - frameA > 0.25) fail(`${key} committed frame p95 policy`);
    if (
      comparison.pairedMedianRatio > limit ||
      comparison.pairedBootstrapCi95[0] > limit ||
      (key === "cli/markdown-toggle-large-history" && comparison.elapsedMedianToMs > 200)
    )
      fail(`${key} committed paired C/A policy`);
  }
}
const docs = readFileSync(resolve("docs/perf/AGENT_CONSOLE_PROFILE.md"), "utf8");
for (const [runtime, label] of [
  ["cli", "CLI"],
  ["browser", "Browser"],
] as const) {
  const key = `${runtime}/tail-append-burst-framed`;
  const a = Math.round(data.variants.A.scenarios[key].elapsedMs.median).toLocaleString("en-US");
  const c = Math.round(data.variants.C.scenarios[key].elapsedMs.median).toLocaleString("en-US");
  const row = docs.split("\n").find((line) => line.includes(`${label} framed burst`)) ?? "";
  if (!row.includes(`${a} ms`) || !row.includes(`${c} ms`)) fail(`${label} headline is stale`);
}
console.log("Committed Agent Console baseline check passed");
