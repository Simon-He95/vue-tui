#!/usr/bin/env tsx
import type { FramePerfSample } from "../src/observability/frame-perf.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const percentile = (values: readonly number[], q: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]!;
};
const metric = (values: readonly number[]) => ({
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: Math.max(0, ...values),
});
export const summarizeFrameSamples = (samples: readonly FramePerfSample[]) => ({
  frames: samples.length,
  durationMs: metric(samples.map((s) => s.durationMs)),
  renderManagerMs: metric(samples.map((s) => s.renderManagerMs)),
  commitMs: metric(samples.map((s) => s.commitMs)),
  domFlushMs: metric(samples.flatMap((s) => (s.domFlushMs == null ? [] : [s.domFlushMs]))),
  stdoutFlushMs: metric(samples.flatMap((s) => (s.stdoutFlushMs == null ? [] : [s.stdoutFlushMs]))),
  dirtyRows: metric(samples.flatMap((s) => (s.dirtyRows == null ? [] : [s.dirtyRows]))),
  scannedNodes: metric(samples.map((s) => s.scannedNodes)),
  paintedNodes: metric(samples.map((s) => s.paintedNodes)),
  longFrames: {
    over16_7: samples.filter((s) => s.durationMs > 16.7).length,
    over33_3: samples.filter((s) => s.durationMs > 33.3).length,
    over50: samples.filter((s) => s.durationMs > 50).length,
  },
  coalescedInvalidates: samples.reduce((n, s) => n + s.coalescedInvalidates, 0),
  coalescedFrameTasks: samples.reduce((n, s) => n + s.coalescedFrameTasks, 0),
  droppedUpdates: samples.reduce((n, s) => n + s.droppedUpdates, 0),
  maxQueueDepth: Math.max(0, ...samples.map((s) => s.queueDepth)),
});
export function summarizeRunStability(values: readonly number[]) {
  if (!values.length)
    return { runs: 0, values: [], median: 0, min: 0, max: 0, cv: 0, range: [0, 0] as const };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length;
  return {
    runs: values.length,
    values,
    median: percentile(values, 0.5),
    min: Math.min(...values),
    max: Math.max(...values),
    cv: mean ? Math.sqrt(variance) / mean : 0,
    range: [Math.min(...values), Math.max(...values)] as const,
  };
}
export function summarizeAgentConsoleRun(run: {
  runtime: string;
  generatedAt: string;
  environment: Record<string, unknown>;
  scenarios: readonly { name: string; elapsedMs: number; samples: readonly FramePerfSample[] }[];
}) {
  return {
    ...run,
    scenarios: run.scenarios.map((s) => ({
      ...s,
      samples: undefined,
      ...summarizeFrameSamples(s.samples),
    })),
  };
}
function readJson(path: string, fallback: any = null) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}
function samplesOf(run: any): FramePerfSample[] {
  return run.frameSamples ?? run.profileResult?.frameSamples ?? [];
}
function elapsedOf(run: any): number {
  return run.elapsedMs ?? run.profileResult?.elapsedMs ?? run.timing?.elapsedMs ?? 0;
}
function cpuSummary(runs: any[]) {
  return runs.flatMap((run) => {
    if (run.cpuProfileSummary) return [run.cpuProfileSummary];
    return run.cpuHotspots?.length
      ? [
          {
            totalSampledTimeMs: null,
            totalSamples: null,
            topNSampledTimeMs: null,
            hotspots: run.cpuHotspots,
          },
        ]
      : [];
  });
}
function summarizeRoot(root: string) {
  const cli = readJson(resolve(root, "cli/all.json"), []);
  const browserFile = readJson(resolve(root, "browser-raw.json"), {});
  const grouped: Record<string, any[]> = {};
  for (const [runtime, runs] of [
    ["cli", cli],
    ["browser", browserFile.results ?? []],
  ] as const)
    for (const run of runs) {
      const key = `${runtime}/${run.scenario ?? run.name}`;
      (grouped[key] ??= []).push(run);
    }
  const scenarios: Record<string, any> = {};
  for (const [key, runs] of Object.entries(grouped)) {
    const [runtime, scenarioName] = key.split("/");
    const diagnostic = readJson(
      resolve(
        root,
        runtime === "cli"
          ? `cli/${scenarioName}-cpu-diagnostic.json`
          : `${scenarioName}-cpu-diagnostic.json`,
      ),
      null,
    );
    const frames = runs.map((r) => summarizeFrameSamples(samplesOf(r)));
    const latencyValues = (name: string) =>
      runs.flatMap((r) => r.diagnostics?.[name] ?? r.profileResult?.diagnostics?.[name] ?? []);
    const latencySummary = (values: number[]) => ({
      ...metric(values),
      over16_7: values.filter((value) => value > 16.7).length,
      over33_3: values.filter((value) => value > 33.3).length,
      over50: values.filter((value) => value > 50).length,
    });
    const dom = runs.flatMap((r) => r.snapshot?.domFlushSamples ?? []);
    scenarios[key] = {
      runCount: runs.length,
      correctnessPasses: runs.filter(
        (r) =>
          !Object.values(r.correctness ?? r.profileResult?.correctness ?? {}).some(
            (v) => v === false || v === "error",
          ),
      ).length,
      elapsedMs: summarizeRunStability(runs.map(elapsedOf)),
      frameP95Ms: summarizeRunStability(frames.map((f) => f.durationMs.p95)),
      frameMaxMs: summarizeRunStability(frames.map((f) => f.durationMs.max)),
      renderManagerP95Ms: summarizeRunStability(frames.map((f) => f.renderManagerMs.p95)),
      commitP95Ms: summarizeRunStability(frames.map((f) => f.commitMs.p95)),
      dirtyRowsP95: summarizeRunStability(frames.map((f) => f.dirtyRows.p95)),
      scannedNodesP95: summarizeRunStability(frames.map((f) => f.scannedNodes.p95)),
      paintedNodesP95: summarizeRunStability(frames.map((f) => f.paintedNodes.p95)),
      longFrames: frames.map((f) => f.longFrames),
      inputLatency: {
        commitMs: latencySummary(latencyValues("inputToCommitMs")),
        domFlushMs: latencySummary(latencyValues("inputToDomFlushMs")),
        paintOpportunityMs: latencySummary(latencyValues("inputToPaintOpportunityMs")),
      },
      corpus: runs.map((r) => r.corpus ?? r.profileResult?.corpus).filter(Boolean),
      memory: runs.map((r) => r.memory).filter(Boolean),
      stdout: runs.map((r) => r.stdout).filter(Boolean),
      dom: {
        flush: metric(dom.map((x: any) => x.durationMs ?? 0)),
        samples: dom.length,
        rendererDeltas: runs
          .map((r) => r.snapshot?.rendererDelta ?? r.snapshot?.rendererDebugStats)
          .filter(Boolean),
      },
      raf: runs
        .map((r) => (r.timing?.rafIntervals ? metric(r.timing.rafIntervals) : null))
        .filter(Boolean),
      longTasks: runs
        .map((r) => (r.timing?.longTasks ? metric(r.timing.longTasks) : null))
        .filter(Boolean),
      cpuHotspots: diagnostic ? cpuSummary([diagnostic]) : [],
    };
  }
  return {
    environment: {
      cli: readJson(resolve(root, "cli/environment.json"), null),
      browser: browserFile.environment ?? null,
    },
    scenarios,
  };
}
function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function main() {
  const root = resolve(
    process.cwd(),
    arg("--root") ?? process.argv[2] ?? ".tmp/perf/agent-console",
  );
  const output = resolve(
    process.cwd(),
    arg("--output") ?? process.argv[3] ?? ".tmp/perf/agent-console/summary.json",
  );
  const after = summarizeRoot(root);
  const beforeRoot = arg("--before-root");
  const before = beforeRoot ? summarizeRoot(resolve(process.cwd(), beforeRoot)) : null;
  const target = "cli/tail-append-burst-framed";
  const comparison = (runtime: "cli" | "browser", scenario: string) => {
    const key = `${runtime}/${scenario}`;
    const beforeRunsMs = before?.scenarios[key]?.elapsedMs?.values ?? [];
    const afterRunsMs = after.scenarios[key]?.elapsedMs?.values ?? [];
    const beforeMedianMs = percentile(beforeRunsMs, 0.5);
    const afterMedianMs = percentile(afterRunsMs, 0.5);
    return {
      beforeRunsMs,
      afterRunsMs,
      beforeMedianMs,
      afterMedianMs,
      improvementPercent: beforeMedianMs ? (1 - afterMedianMs / beforeMedianMs) * 100 : null,
    };
  };
  const audit = {
    schemaVersion: 2,
    generatedFrom: {
      beforeCommit: arg("--before-ref") ?? before?.environment?.cli?.commit ?? null,
      afterCommit: arg("--after-ref") ?? after.environment.cli?.commit ?? null,
      runnerCommit: after.environment.cli?.commit ?? after.environment.browser?.commit ?? null,
      dirty: Boolean(after.environment.cli?.dirty ?? after.environment.browser?.dirty),
    },
    environment: after.environment,
    optimization: {
      scenarios: {
        "tail-append-burst-framed": {
          cli: comparison("cli", "tail-append-burst-framed"),
          browser: comparison("browser", "tail-append-burst-framed"),
        },
        "tail-append-burst-single-task": {
          cli: comparison("cli", "tail-append-burst-single-task"),
          browser: comparison("browser", "tail-append-burst-single-task"),
        },
      },
    },
    cpuDiagnostics: {
      before: before?.scenarios[target]?.cpuHotspots ?? [],
      after: after.scenarios[target]?.cpuHotspots ?? [],
    },
    scenarios: after.scenarios,
  };
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify(audit, null, 2));
}
if (process.argv[1]?.endsWith("summarize-agent-console-profile.ts")) main();
