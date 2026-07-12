#!/usr/bin/env tsx

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENT_CONSOLE_CPU_PROFILE_SCENARIOS,
  AGENT_CONSOLE_PROFILE_DEFAULTS,
  AGENT_CONSOLE_PROFILE_SCENARIOS,
} from "../examples/agent-console/src/perf-harness.js";

const root = resolve(process.argv[2] ?? ".tmp/perf/agent-console-abc");
const variants = ["A", "B", "C"] as const;
const runtimes = ["cli", "browser"] as const;
const expectedRuns = 6;
const summaries: Record<string, any> = {};
function fail(message: string): never {
  throw new Error(`Agent Console A/B/C audit invalid: ${message}`);
}
function ratio(to: number, from: number) {
  return to / from;
}
for (const variant of variants) {
  const summary = JSON.parse(readFileSync(resolve(root, variant, "summary.json"), "utf8"));
  summaries[variant] = summary;
  const cliRuns = JSON.parse(readFileSync(resolve(root, variant, "cli/all.json"), "utf8"));
  const browser = JSON.parse(readFileSync(resolve(root, variant, "browser-raw.json"), "utf8"));
  const rawByRuntime = { cli: cliRuns, browser: browser.results };
  for (const runtime of runtimes) {
    const environment =
      runtime === "cli"
        ? JSON.parse(readFileSync(resolve(root, variant, "cli/environment.json"), "utf8"))
        : browser.environment;
    if (environment.dirty !== false) fail(`${variant}/${runtime} dirty worktree`);
    if (
      !environment.commit ||
      Object.values(environment.artifactHashes ?? {}).some((hash) => !hash)
    )
      fail(`${variant}/${runtime} missing provenance`);
    if (
      environment.runCount !== expectedRuns ||
      environment.steadyCount !== AGENT_CONSOLE_PROFILE_DEFAULTS.steadyCount
    )
      fail(`${variant}/${runtime} canonical config mismatch`);
    for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
      const key = `${runtime}/${scenario}`;
      const result = summary.scenarios[key];
      if (!result || result.runCount !== expectedRuns || result.correctnessPasses !== expectedRuns)
        fail(`${variant}/${key} does not have six passing runs`);
      const raw = rawByRuntime[runtime].filter(
        (run: any) => (run.scenario ?? run.name) === scenario,
      );
      if (raw.length !== expectedRuns) fail(`${variant}/${key} raw run count mismatch`);
      for (const run of raw) {
        const payload = run.profileResult ?? run;
        if (
          payload.preparedState?.visualIndexStatus !== "exact" ||
          payload.finalState?.visualIndexStatus !== "exact"
        )
          fail(`${variant}/${key} raw visual index is not exact`);
        const corpus = payload.corpus;
        if (
          !corpus ||
          corpus.seedCount !== AGENT_CONSOLE_PROFILE_DEFAULTS.seedCount ||
          corpus.appendStartIndex <= corpus.seedCount
        )
          fail(`${variant}/${key} corpus mismatch`);
        if (scenario === "stream-scroll-interaction") {
          const correctness = payload.correctness ?? {};
          if (
            !correctness.scrollChanged ||
            !correctness.scrollFramesObserved ||
            !correctness.dispatchAccepted ||
            (runtime === "browser" && !correctness.domFlushesObserved)
          )
            fail(`${variant}/${key} input correlation incomplete`);
        }
      }
    }
    for (const scenario of AGENT_CONSOLE_CPU_PROFILE_SCENARIOS) {
      const diagnostic = summary.scenarios[`${runtime}/${scenario}`]?.cpuHotspots?.[0];
      if (!diagnostic?.hotspots?.length)
        fail(`${variant}/${runtime}/${scenario} missing CPU hotspots`);
      const profile =
        runtime === "cli"
          ? resolve(root, variant, "cli", `${scenario}-run-cpu.node.cpuprofile`)
          : resolve(root, variant, `${scenario}-run-0.browser.cpuprofile`);
      if (!existsSync(profile) || statSync(profile).size === 0)
        fail(`${variant}/${runtime}/${scenario} missing CPU profile`);
    }
  }
}
for (const runtime of runtimes) {
  for (const scenario of ["tail-append-burst-framed", "tail-append-burst-single-task"]) {
    const key = `${runtime}/${scenario}`;
    if (
      ratio(
        summaries.B.scenarios[key].elapsedMs.median,
        summaries.A.scenarios[key].elapsedMs.median,
      ) > 0.95
    )
      fail(`${key} replay B/A gate failed`);
    if (
      ratio(
        summaries.C.scenarios[key].elapsedMs.median,
        summaries.B.scenarios[key].elapsedMs.median,
      ) > 0.95
    )
      fail(`${key} lazy Markdown C/B gate failed`);
  }
  for (const scenario of [
    "tail-stream-steady",
    "detached-append",
    "search-large-history",
    "stream-scroll-interaction",
    "markdown-toggle-large-history",
    "markdown-stream-steady",
  ]) {
    const key = `${runtime}/${scenario}`;
    const b = summaries.B.scenarios[key];
    const c = summaries.C.scenarios[key];
    if (ratio(c.frameP95Ms.median, b.frameP95Ms.median) > 1.1)
      fail(`${key} frame p95 non-regression gate failed`);
    if (
      !["tail-stream-steady", "stream-scroll-interaction", "markdown-stream-steady"].includes(
        scenario,
      ) &&
      ratio(c.elapsedMs.median, b.elapsedMs.median) > 1.1
    )
      fail(`${key} elapsed non-regression gate failed`);
  }
}
console.log("Agent Console A/B/C performance and correctness validation passed");
