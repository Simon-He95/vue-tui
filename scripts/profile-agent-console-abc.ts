#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const base = resolve(root, ".tmp/perf/agent-console-abc");
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
rmSync(base, { recursive: true, force: true });
mkdirSync(base, { recursive: true });
execFileSync("pnpm", ["run", "build:checked"], { cwd: root, stdio: "inherit" });
const variants = ["A", "B", "C"] as const;
const results: Record<string, unknown> = {};
for (const variant of variants) {
  const output = resolve(base, variant);
  const env = {
    ...process.env,
    AGENT_CONSOLE_PROFILE_SKIP_BUILD: "1",
    AGENT_CONSOLE_PROFILE_VARIANT: variant,
    VUE_TUI_PROFILE_OUTPUT_DIR: output,
    VUE_TUI_AGENT_CONSOLE_PORT: String(4178 + variants.indexOf(variant)),
  };
  execFileSync("pnpm", ["run", "profile:agent-console:cli"], { cwd: root, stdio: "inherit", env });
  execFileSync("pnpm", ["run", "profile:agent-console:browser"], {
    cwd: root,
    stdio: "inherit",
    env,
  });
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "scripts/summarize-agent-console-profile.ts",
      output,
      resolve(output, "summary.json"),
    ],
    { cwd: root, stdio: "inherit", env },
  );
  results[variant] = JSON.parse(readFileSync(resolve(output, "summary.json"), "utf8"));
}
writeFileSync(
  resolve(base, "audit.json"),
  `${JSON.stringify({ schemaVersion: 3, harnessRef: "current-head", smoke, variants: results }, null, 2)}\n`,
);
