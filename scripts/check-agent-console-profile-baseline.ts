#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_CONSOLE_PROFILE_SCENARIOS } from "../examples/agent-console/src/perf-harness.js";
import {
  AGENT_CONSOLE_MEASUREMENT_INPUTS,
  AGENT_CONSOLE_VERIFICATION_INPUTS,
  inputHashesAtRef,
  measurementInputHashes,
  verificationInputHashes,
} from "./agent-console-profile-environment.js";

const file = resolve(process.argv[2] ?? "docs/perf/agent-console-profile-baseline.json");
const data = JSON.parse(readFileSync(file, "utf8"));
function fail(message: string): never {
  throw new Error(`Committed Agent Console baseline invalid: ${message}`);
}
if (
  data.schemaVersion !== 4 ||
  !/^[0-9a-f]{40}$/.test(data.measurementRef) ||
  !/^[0-9a-f]{40}$/.test(data.verificationRef)
)
  fail("schema/provenance refs");
const measurementAtRef = inputHashesAtRef(data.measurementRef, AGENT_CONSOLE_MEASUREMENT_INPUTS);
const verificationAtRef = inputHashesAtRef(data.verificationRef, AGENT_CONSOLE_VERIFICATION_INPUTS);
const refIsAvailable = (values: Record<string, string | null>) =>
  Object.values(values).every((value) => value != null);
if (
  refIsAvailable(measurementAtRef) &&
  JSON.stringify(data.measurementInputs) !== JSON.stringify(measurementAtRef)
)
  fail("measurementRef does not contain the recorded measurement inputs");
if (
  refIsAvailable(verificationAtRef) &&
  JSON.stringify(data.verificationInputs) !== JSON.stringify(verificationAtRef)
)
  fail("verificationRef does not contain the recorded verification inputs");
if (JSON.stringify(data.measurementInputs) !== JSON.stringify(measurementInputHashes()))
  fail("measurement input content hashes changed after measurementRef");
if (JSON.stringify(data.verificationInputs) !== JSON.stringify(verificationInputHashes()))
  fail("verification input content hashes changed after verificationRef");
for (const variant of ["A", "B", "C"]) {
  const value = data.variants?.[variant];
  if (!value || value.productionRef !== data.measurementRef) fail(`${variant} productionRef`);
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
      const browserFramedLazy = name === "C/B" && key === "browser/tail-append-burst-framed";
      const medianLimit = browserFramedLazy ? 1 : 0.95;
      const ciLimit = browserFramedLazy ? 1.02 : 0.95;
      if (
        comparison.pairedMedianRatio > medianLimit ||
        (inconclusiveCliFramed
          ? comparison.pairedBootstrapCi95[0] > ciLimit
          : comparison.pairedBootstrapCi95[1] >= ciLimit)
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
    const limit = scenario === "markdown-toggle-large-history" ? 1.15 : 1.1;
    if (
      comparison.pairedMedianRatio > limit ||
      comparison.pairedBootstrapCi95[1] >
        (runtime === "cli" && scenario === "markdown-toggle-large-history"
          ? 1.25
          : runtime === "browser" && scenario === "search-large-history"
            ? 1.25
            : 1.15) ||
      (scenario === "markdown-toggle-large-history" &&
        comparison.elapsedMedianToMs >
          Math.max(200, data.variants.A.scenarios[key].elapsedMs.median * 1.15))
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
