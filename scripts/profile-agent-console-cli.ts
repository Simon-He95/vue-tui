#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENT_CONSOLE_CPU_PROFILE_SCENARIOS,
  AGENT_CONSOLE_PROFILE_DEFAULTS,
  AGENT_CONSOLE_PROFILE_SCENARIOS,
} from "../examples/agent-console/src/perf-harness.js";
import { agentConsoleProfileEnvironment } from "./agent-console-profile-environment.js";

const root = process.cwd();
const outputDir = resolve(
  root,
  process.env.VUE_TUI_PROFILE_OUTPUT_DIR ?? ".tmp/perf/agent-console",
  "cli",
);
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const runCount = smoke ? 1 : Number(process.env.AGENT_CONSOLE_PROFILE_RUNS ?? 5);
const profileConfig = smoke
  ? {
      ...AGENT_CONSOLE_PROFILE_DEFAULTS,
      seedCount: 120,
      appendCount: 30,
      steadyCount: 20,
      cadenceMs: 0,
    }
  : AGENT_CONSOLE_PROFILE_DEFAULTS;
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
          AGENT_CONSOLE_PROFILE_MODE: "1",
          TSX_TSCONFIG_PATH: resolve(root, "scripts/tsconfig.agent-console-profile-dist.json"),
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
if (!smoke && process.env.AGENT_CONSOLE_PROFILE_SKIP_CPU !== "1") {
  for (const scenario of AGENT_CONSOLE_CPU_PROFILE_SCENARIOS) {
    execFileSync(
      process.execPath,
      ["--expose-gc", "--import", "tsx", "scripts/profile-agent-console-cli-worker.ts"],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          VUE_TUI_PROFILE: "",
          AGENT_CONSOLE_PROFILE_MODE: "1",
          TSX_TSCONFIG_PATH: resolve(root, "scripts/tsconfig.agent-console-profile-dist.json"),
          AGENT_CONSOLE_PROFILE_SMOKE: "0",
          AGENT_CONSOLE_PROFILE_SCENARIO: scenario,
          AGENT_CONSOLE_PROFILE_RUN: "cpu",
          AGENT_CONSOLE_PROFILE_CPU: "1",
        },
      },
    );
    const diagnosticPath = resolve(outputDir, `${scenario}.json`);
    const diagnostic = JSON.parse(readFileSync(diagnosticPath, "utf8"));
    if (!diagnostic.cpuProfilePath || statSync(diagnostic.cpuProfilePath).size <= 0)
      throw new Error(`${scenario}: missing or empty Node CPU profile`);
    if (!diagnostic.cpuProfileSummary?.hotspots?.length)
      throw new Error(`${scenario}: empty Node CPU hotspot summary`);
    writeFileSync(
      resolve(outputDir, `${scenario}-cpu-diagnostic.json`),
      JSON.stringify(diagnostic, null, 2),
    );
  }
}
writeFileSync(resolve(outputDir, "all.json"), JSON.stringify(all, null, 2));
writeFileSync(
  resolve(outputDir, "environment.json"),
  JSON.stringify(
    {
      ...agentConsoleProfileEnvironment(["dist/cli.js", "dist/vue.js"], ["dist"]),
      runtimeResolutions: JSON.parse(
        readFileSync(resolve(outputDir, "runtime-resolutions.json"), "utf8"),
      ),
      runCount,
      smoke,
      ...profileConfig,
    },
    null,
    2,
  ),
);
