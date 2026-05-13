import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type MetricBudget = Readonly<{
  equals?: number | string | boolean | null;
  min?: number;
  max?: number;
}>;

type Baselines = Readonly<{
  domRenderer: readonly Readonly<
    {
      path: string;
    } & MetricBudget
  >[];
  scrollMailbox: readonly Readonly<{
    component: string;
    scenario: string;
    metrics: Record<string, MetricBudget>;
  }>[];
  phase2: readonly Readonly<{
    scenario: string;
    metrics: Record<string, MetricBudget>;
  }>[];
}>;

const baselines = JSON.parse(
  readFileSync(new URL("./bench-baselines.json", import.meta.url), "utf8"),
) as Baselines;

function runBench(script: string): unknown {
  const output = execFileSync("pnpm", ["exec", "tsx", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 120_000,
  });
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) throw new Error(`${script} did not emit JSON`);
  return JSON.parse(output.slice(jsonStart));
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function checkMetric(label: string, value: unknown, budget: MetricBudget): void {
  if ("equals" in budget && value !== budget.equals) {
    throw new Error(`${label}: expected ${String(budget.equals)}, got ${String(value)}`);
  }
  if (budget.min != null) {
    if (typeof value !== "number" || value < budget.min) {
      throw new Error(`${label}: expected >= ${budget.min}, got ${String(value)}`);
    }
  }
  if (budget.max != null) {
    if (typeof value !== "number" || value > budget.max) {
      throw new Error(`${label}: expected <= ${budget.max}, got ${String(value)}`);
    }
  }
}

function checkDomRenderer(results: unknown): void {
  for (const rule of baselines.domRenderer) {
    checkMetric(`bench:dom-renderer ${rule.path}`, readPath(results, rule.path), rule);
  }
}

function checkScrollMailbox(results: any): void {
  for (const rule of baselines.scrollMailbox) {
    const scenario = results.scenarios.find(
      (entry: any) => entry.component === rule.component && entry.scenario === rule.scenario,
    );
    if (!scenario)
      throw new Error(`bench:scroll-mailbox missing ${rule.component} ${rule.scenario}`);
    for (const [metric, budget] of Object.entries(rule.metrics)) {
      checkMetric(
        `bench:scroll-mailbox ${rule.component} ${rule.scenario} ${metric}`,
        scenario[metric],
        budget,
      );
    }
  }
}

function checkPhase2(results: any): void {
  for (const rule of baselines.phase2) {
    const scenario = results.scenarios.find((entry: any) => entry.scenario === rule.scenario);
    if (!scenario) throw new Error(`bench:phase2 missing ${rule.scenario}`);
    for (const [metric, budget] of Object.entries(rule.metrics)) {
      checkMetric(`bench:phase2 ${rule.scenario} ${metric}`, scenario[metric], budget);
    }
  }
}

checkDomRenderer(runBench("scripts/bench-dom-renderer.ts"));
checkScrollMailbox(runBench("scripts/bench-scroll-mailbox.ts"));
checkPhase2(runBench("scripts/bench-phase2.ts"));

console.log("[bench:baseline] passed");
