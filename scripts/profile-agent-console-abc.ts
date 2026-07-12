#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const base = resolve(root, ".tmp/perf/agent-console-abc");
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const orders = smoke ? ["ABC"] : ["ABC", "ACB", "BAC", "BCA", "CAB", "CBA"];
const variants = ["A", "B", "C"] as const;
const accumulated = Object.fromEntries(
  variants.map((variant) => [
    variant,
    { cli: [] as any[], browser: [] as any[], cliEnv: null as any, browserEnv: null as any },
  ]),
);
rmSync(base, { recursive: true, force: true });
mkdirSync(base, { recursive: true });
execFileSync("pnpm", ["run", "build:checked"], { cwd: root, stdio: "inherit" });

for (let round = 0; round < orders.length; round++) {
  const order = orders[round]!;
  for (const variant of order) {
    const output = resolve(base, variant);
    const env = {
      ...process.env,
      AGENT_CONSOLE_PROFILE_SKIP_BUILD: "1",
      AGENT_CONSOLE_PROFILE_SKIP_CPU: "1",
      AGENT_CONSOLE_PROFILE_RUNS: "1",
      AGENT_CONSOLE_PROFILE_VARIANT: variant,
      VUE_TUI_PROFILE_OUTPUT_DIR: output,
      VUE_TUI_AGENT_CONSOLE_PORT: String(45178 + round * 3 + variants.indexOf(variant as any)),
    };
    execFileSync("pnpm", ["run", "profile:agent-console:cli"], {
      cwd: root,
      stdio: "inherit",
      env,
    });
    execFileSync("pnpm", ["run", "profile:agent-console:browser"], {
      cwd: root,
      stdio: "inherit",
      env,
    });
    const cli = JSON.parse(readFileSync(resolve(output, "cli/all.json"), "utf8"));
    const browser = JSON.parse(readFileSync(resolve(output, "browser-raw.json"), "utf8"));
    accumulated[variant].cli.push(...cli.map((run: any) => ({ ...run, round, order })));
    accumulated[variant].browser.push(
      ...browser.results.map((run: any) => ({ ...run, round, order })),
    );
    accumulated[variant].cliEnv = JSON.parse(
      readFileSync(resolve(output, "cli/environment.json"), "utf8"),
    );
    accumulated[variant].browserEnv = browser.environment;
  }
}

for (const variant of variants) {
  const output = resolve(base, variant);
  const env = {
    ...process.env,
    AGENT_CONSOLE_PROFILE_SKIP_BUILD: "1",
    AGENT_CONSOLE_PROFILE_RUNS: "0",
    AGENT_CONSOLE_PROFILE_VARIANT: variant,
    VUE_TUI_PROFILE_OUTPUT_DIR: output,
    VUE_TUI_AGENT_CONSOLE_PORT: String(45300 + variants.indexOf(variant)),
  };
  if (!smoke) {
    execFileSync("pnpm", ["run", "profile:agent-console:cli"], {
      cwd: root,
      stdio: "inherit",
      env,
    });
    execFileSync("pnpm", ["run", "profile:agent-console:browser"], {
      cwd: root,
      stdio: "inherit",
      env,
    });
  }
  writeFileSync(resolve(output, "cli/all.json"), JSON.stringify(accumulated[variant].cli, null, 2));
  writeFileSync(
    resolve(output, "cli/environment.json"),
    JSON.stringify(
      { ...accumulated[variant].cliEnv, runCount: orders.length, variant, orders },
      null,
      2,
    ),
  );
  writeFileSync(
    resolve(output, "browser-raw.json"),
    JSON.stringify(
      {
        runtime: "browser",
        generatedAt: new Date().toISOString(),
        environment: {
          ...accumulated[variant].browserEnv,
          runCount: orders.length,
          variant,
          orders,
        },
        results: accumulated[variant].browser,
      },
      null,
      2,
    ),
  );
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
}
const summaries = Object.fromEntries(
  variants.map((variant) => [
    variant,
    JSON.parse(readFileSync(resolve(base, variant, "summary.json"), "utf8")),
  ]),
);
writeFileSync(
  resolve(base, "audit.json"),
  `${JSON.stringify({ schemaVersion: 4, harnessRef: "current-head", orders, variants: summaries }, null, 2)}\n`,
);
if (!smoke)
  execFileSync("pnpm", ["exec", "tsx", "scripts/validate-agent-console-abc.ts", base], {
    cwd: root,
    stdio: "inherit",
  });
