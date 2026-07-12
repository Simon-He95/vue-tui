#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENT_CONSOLE_CPU_PROFILE_SCENARIOS,
  AGENT_CONSOLE_PROFILE_DEFAULTS,
  AGENT_CONSOLE_PROFILE_SCENARIOS,
} from "../examples/agent-console/src/perf-harness.js";
const root = resolve(process.argv[2] ?? ".tmp/perf/agent-console-abc");
const variants = ["A", "B", "C"] as const,
  runtimes = ["cli", "browser"] as const;
const orders = ["ABC", "ACB", "BAC", "BCA", "CAB", "CBA"];
const summaries: Record<string, any> = {},
  raws: Record<string, any> = {};
function fail(message: string): never {
  throw new Error(`Agent Console A/B/C audit invalid: ${message}`);
}
const ratio = (to: number, from: number) => to / from;
const pickConfig = (e: any) => ({
  seedCount: e.seedCount,
  appendCount: e.appendCount,
  steadyCount: e.steadyCount,
  cadenceMs: e.cadenceMs,
  batchSize: e.batchSize,
  runCount: e.runCount,
  orders: e.orders,
});
const expectedConfig = { ...AGENT_CONSOLE_PROFILE_DEFAULTS, runCount: 6, orders };
const envFor = (variant: string, runtime: string) =>
  runtime === "cli"
    ? JSON.parse(readFileSync(resolve(root, variant, "cli/environment.json"), "utf8"))
    : JSON.parse(readFileSync(resolve(root, variant, "browser-raw.json"), "utf8")).environment;
for (const variant of variants) {
  const summary = JSON.parse(readFileSync(resolve(root, variant, "summary.json"), "utf8"));
  summaries[variant] = summary;
  const browser = JSON.parse(readFileSync(resolve(root, variant, "browser-raw.json"), "utf8"));
  raws[variant] = {
    cli: JSON.parse(readFileSync(resolve(root, variant, "cli/all.json"), "utf8")),
    browser: browser.results,
  };
  for (const runtime of runtimes) {
    const environment = envFor(variant, runtime);
    if (environment.dirty !== false) fail(`${variant}/${runtime} dirty worktree`);
    try {
      assert.deepEqual(pickConfig(environment), expectedConfig);
    } catch {
      fail(`${variant}/${runtime} canonical config mismatch`);
    }
    if (
      !environment.commit ||
      Object.values(environment.artifactHashes ?? {}).some((hash) => !hash)
    )
      fail(`${variant}/${runtime} missing provenance`);
    for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
      const key = `${runtime}/${scenario}`,
        result = summary.scenarios[key];
      if (!result || result.runCount !== 6 || result.correctnessPasses !== 6)
        fail(`${variant}/${key} does not have six passing runs`);
      const raw = raws[variant][runtime].filter(
        (run: any) => (run.scenario ?? run.name) === scenario,
      );
      if (
        raw.length !== 6 ||
        new Set(raw.map((run: any) => run.round)).size !== 6 ||
        orders.some((order) => !raw.some((run: any) => run.order === order))
      )
        fail(`${variant}/${key} balanced round/order mismatch`);
      for (const run of raw) {
        const payload = run.profileResult ?? run;
        if (
          payload.preparedState?.visualIndexStatus !== "exact" ||
          payload.finalState?.visualIndexStatus !== "exact"
        )
          fail(`${variant}/${key} raw visual index is not exact`);
        if (scenario === "stream-scroll-interaction") {
          const c = payload.correctness ?? {};
          if (
            !c.scrollChanged ||
            !c.scrollFramesObserved ||
            !c.dispatchAccepted ||
            (runtime === "browser" && !c.domFlushesObserved)
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
  const baseline = envFor("A", runtime);
  for (const variant of ["B", "C"]) {
    const current = envFor(variant, runtime);
    if (
      current.node !== baseline.node ||
      current.v8 !== baseline.v8 ||
      current.browser !== baseline.browser
    )
      fail(`${runtime} runtime versions differ`);
    try {
      assert.deepEqual(current.artifactHashes, baseline.artifactHashes);
    } catch {
      fail(`${runtime} artifact hashes differ`);
    }
  }
  for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
    const corpusA = raws.A[runtime]
      .filter((r: any) => (r.scenario ?? r.name) === scenario)
      .map((r: any) => (r.profileResult ?? r).corpus);
    for (const variant of ["B", "C"])
      try {
        assert.deepEqual(
          raws[variant][runtime]
            .filter((r: any) => (r.scenario ?? r.name) === scenario)
            .map((r: any) => (r.profileResult ?? r).corpus),
          corpusA,
        );
      } catch {
        fail(`${runtime}/${scenario} corpus differs`);
      }
  }
  for (const scenario of ["tail-append-burst-framed", "tail-append-burst-single-task"]) {
    const key = `${runtime}/${scenario}`;
    if (
      ratio(
        summaries.B.scenarios[key].elapsedMs.median,
        summaries.A.scenarios[key].elapsedMs.median,
      ) > 0.95
    )
      fail(`${key} B/A gate`);
    if (
      ratio(
        summaries.C.scenarios[key].elapsedMs.median,
        summaries.B.scenarios[key].elapsedMs.median,
      ) > 0.95
    )
      fail(`${key} C/B gate`);
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
      a = summaries.A.scenarios[key],
      c = summaries.C.scenarios[key];
    const policy =
      key === "browser/search-large-history"
        ? { ratio: 1.15, absolute: 120 }
        : key === "cli/markdown-toggle-large-history"
          ? { ratio: 1.15, absolute: 200 }
          : { ratio: 1.1, absolute: Infinity };
    if (ratio(c.frameP95Ms.median, a.frameP95Ms.median) > 1.1) fail(`${key} C/A frame p95 gate`);
    if (
      !["tail-stream-steady", "stream-scroll-interaction", "markdown-stream-steady"].includes(
        scenario,
      ) &&
      (ratio(c.elapsedMs.median, a.elapsedMs.median) > policy.ratio ||
        c.elapsedMs.median > policy.absolute)
    )
      fail(`${key} C/A elapsed policy`);
    const count = (x: any) =>
      (x.longFrames ?? []).reduce((n: number, value: any) => n + value.over16_7, 0);
    if (count(c) > count(a)) fail(`${key} long-frame regression`);
  }
}
console.log("Agent Console A/B/C performance and correctness validation passed");
