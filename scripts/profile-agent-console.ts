#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const outputDir = resolve(root, ".tmp/perf/agent-console");
rmSync(outputDir, { recursive: true, force: true });
execFileSync("pnpm", ["run", "build:checked"], { cwd: root, stdio: "inherit" });
const env = { ...process.env, AGENT_CONSOLE_PROFILE_SKIP_BUILD: "1" };
execFileSync("pnpm", ["run", "profile:agent-console:cli"], { cwd: root, stdio: "inherit", env });
execFileSync("pnpm", ["run", "profile:agent-console:browser"], {
  cwd: root,
  stdio: "inherit",
  env,
});
execFileSync("pnpm", ["run", "profile:agent-console:summarize"], {
  cwd: root,
  stdio: "inherit",
  env,
});
