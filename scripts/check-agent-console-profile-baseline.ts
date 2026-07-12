#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_CONSOLE_PROFILE_SCENARIOS } from "../examples/agent-console/src/perf-harness.js";

const file = resolve(process.argv[2] ?? "docs/perf/agent-console-profile-baseline.json");
const data = JSON.parse(readFileSync(file, "utf8"));
function fail(message: string): never {
  throw new Error(`Committed Agent Console baseline invalid: ${message}`);
}
if (data.schemaVersion !== 4 || !/^[0-9a-f]{40}$/.test(data.harnessRef)) fail("schema/harnessRef");
try {
  execFileSync("git", ["merge-base", "--is-ancestor", data.harnessRef, "HEAD"]);
} catch {
  fail("harnessRef is not an ancestor of HEAD");
}
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
for (const runtime of ["cli", "browser"])
  for (const scenario of ["tail-append-burst-framed", "tail-append-burst-single-task"]) {
    const key = `${runtime}/${scenario}`;
    if (data.comparisons["B/A"][key].ratio > 0.95 || data.comparisons["C/B"][key].ratio > 0.95)
      fail(`${key} performance gate`);
  }
const docs = readFileSync(resolve("docs/perf/AGENT_CONSOLE_PROFILE.md"), "utf8");
for (const [runtime, label] of [
  ["cli", "CLI"],
  ["browser", "Browser"],
] as const) {
  const key = `${runtime}/tail-append-burst-framed`;
  const a = Math.round(data.variants.A.scenarios[key].elapsedMs.median).toLocaleString("en-US");
  const c = Math.round(data.variants.C.scenarios[key].elapsedMs.median).toLocaleString("en-US");
  if (!docs.includes(`${label} framed burst | ${a} ms`) || !docs.includes(`| ${c} ms |`))
    fail(`${label} headline is stale`);
}
console.log("Committed Agent Console baseline check passed");
