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
function fail(message: string): never {
  throw new Error(`Agent Console A/B/C audit invalid: ${message}`);
}
for (const variant of variants) {
  const summary = JSON.parse(readFileSync(resolve(root, variant, "summary.json"), "utf8"));
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
    for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
      const key = `${runtime}/${scenario}`;
      const result = summary.scenarios[key];
      if (!result || result.runCount !== 5 || result.correctnessPasses !== 5)
        fail(`${variant}/${key} does not have five passing runs`);
      if (
        result.preparedStates?.some((state: any) => state.visualIndexStatus !== "exact") ||
        result.finalStates?.some((state: any) => state.visualIndexStatus !== "exact")
      )
        fail(`${variant}/${key} visual index is not exact`);
      for (const corpus of result.corpus ?? []) {
        if (
          corpus.seedCount !== AGENT_CONSOLE_PROFILE_DEFAULTS.seedCount ||
          corpus.appendStartIndex <= corpus.seedCount
        )
          fail(`${variant}/${key} corpus config mismatch`);
      }
      const raw = rawByRuntime[runtime].filter(
        (run: any) => (run.scenario ?? run.name) === scenario,
      );
      if (raw.length !== 5) fail(`${variant}/${key} raw run count mismatch`);
      if (scenario === "stream-scroll-interaction") {
        for (const run of raw) {
          const correctness = run.correctness ?? run.profileResult?.correctness ?? {};
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
console.log("Agent Console A/B/C audit validation passed");
