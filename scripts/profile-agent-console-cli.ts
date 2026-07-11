#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_CONSOLE_PROFILE_SCENARIOS } from "../examples/agent-console/src/perf-harness.js";
import { agentConsoleProfileEnvironment } from "./agent-console-profile-environment.js";

const root = process.cwd();
const outputDir = resolve(root, ".tmp/perf/agent-console/cli");
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const runCount = smoke ? 1 : 5;
mkdirSync(outputDir, { recursive: true });
if (process.env.AGENT_CONSOLE_PROFILE_SKIP_BUILD !== "1") {
  execFileSync("pnpm", ["run", "build:checked"], { cwd: root, stdio: "inherit" });
}
const all = [];
for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
  for (let run = 0; run < runCount; run++) {
    execFileSync(
      process.execPath,
      ["--expose-gc", "--import", "tsx", "scripts/profile-agent-console-cli-worker.ts"],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          VUE_TUI_PROFILE: "",
          AGENT_CONSOLE_PROFILE_SMOKE: smoke ? "1" : "0",
          AGENT_CONSOLE_PROFILE_SCENARIO: scenario,
          AGENT_CONSOLE_PROFILE_RUN: String(run + 1),
        },
      },
    );
    const result = JSON.parse(readFileSync(resolve(outputDir, `${scenario}.json`), "utf8"));
    const withRun = { ...result, run };
    all.push(withRun);
    writeFileSync(
      resolve(outputDir, `${scenario}-run-${run + 1}.json`),
      JSON.stringify(withRun, null, 2),
    );
  }
}
writeFileSync(resolve(outputDir, "all.json"), JSON.stringify(all, null, 2));
if (!smoke) {
  for (const scenario of [
    "tail-append-burst-framed",
    "tail-append-burst-single-task",
    "stream-scroll-interaction",
  ]) {
    execFileSync(
      process.execPath,
      ["--expose-gc", "--import", "tsx", "scripts/profile-agent-console-cli-worker.ts"],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          VUE_TUI_PROFILE: "",
          AGENT_CONSOLE_PROFILE_SMOKE: "0",
          AGENT_CONSOLE_PROFILE_SCENARIO: scenario,
          AGENT_CONSOLE_PROFILE_RUN: "cpu",
          AGENT_CONSOLE_PROFILE_CPU: "1",
        },
      },
    );
    const diagnostic = readFileSync(resolve(outputDir, `${scenario}.json`), "utf8");
    writeFileSync(resolve(outputDir, `${scenario}-cpu-diagnostic.json`), diagnostic);
  }
}
writeFileSync(
  resolve(outputDir, "environment.json"),
  JSON.stringify(
    {
      ...agentConsoleProfileEnvironment(["dist/cli.js", "dist/vue.js"]),
      runCount,
      smoke,
    },
    null,
    2,
  ),
);
