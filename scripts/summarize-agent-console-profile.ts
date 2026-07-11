#!/usr/bin/env tsx
import type { FramePerfSample } from "../src/observability/frame-perf.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const percentile = (values: readonly number[], q: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]!;
};
export const summarizeFrameSamples = (samples: readonly FramePerfSample[]) => ({
  frames: samples.length,
  durationMs: {
    p50: percentile(
      samples.map((s) => s.durationMs),
      0.5,
    ),
    p95: percentile(
      samples.map((s) => s.durationMs),
      0.95,
    ),
    p99: percentile(
      samples.map((s) => s.durationMs),
      0.99,
    ),
    max: Math.max(0, ...samples.map((s) => s.durationMs)),
  },
  renderManagerMsP95: percentile(
    samples.map((s) => s.renderManagerMs),
    0.95,
  ),
  commitMsP95: percentile(
    samples.map((s) => s.commitMs),
    0.95,
  ),
  domFlushMsP95: percentile(
    samples.flatMap((s) => (s.domFlushMs == null ? [] : [s.domFlushMs])),
    0.95,
  ),
  stdoutFlushMsP95: percentile(
    samples.flatMap((s) => (s.stdoutFlushMs == null ? [] : [s.stdoutFlushMs])),
    0.95,
  ),
  dirtyRows: {
    p95: percentile(
      samples.flatMap((s) => (s.dirtyRows == null ? [] : [s.dirtyRows])),
      0.95,
    ),
    max: Math.max(0, ...samples.flatMap((s) => (s.dirtyRows == null ? [] : [s.dirtyRows]))),
  },
  scannedNodesP95: percentile(
    samples.map((s) => s.scannedNodes),
    0.95,
  ),
  paintedNodesP95: percentile(
    samples.map((s) => s.paintedNodes),
    0.95,
  ),
  coalescedInvalidates: samples.reduce((n, s) => n + s.coalescedInvalidates, 0),
  coalescedFrameTasks: samples.reduce((n, s) => n + s.coalescedFrameTasks, 0),
  droppedUpdates: samples.reduce((n, s) => n + s.droppedUpdates, 0),
  maxQueueDepth: Math.max(0, ...samples.map((s) => s.queueDepth)),
});
export function summarizeRunStability(values: readonly number[]) {
  if (!values.length) return { runs: 0, median: 0, min: 0, max: 0, cv: 0, range: [0, 0] as const };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length;
  return {
    runs: values.length,
    median: percentile(values, 0.5),
    min: Math.min(...values),
    max: Math.max(...values),
    cv: mean === 0 ? 0 : Math.sqrt(variance) / mean,
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
function main() {
  const root = resolve(process.cwd(), process.argv[2] ?? ".tmp/perf/agent-console"),
    output = resolve(process.cwd(), process.argv[3] ?? ".tmp/perf/agent-console/summary.json");
  const cli = JSON.parse(readFileSync(resolve(root, "cli/all.json"), "utf8"));
  let browser: { results?: any[] } = {};
  try {
    browser = JSON.parse(readFileSync(resolve(root, "browser-raw.json"), "utf8"));
  } catch {}
  const grouped: Record<string, any[]> = {};
  for (const [runtime, runs] of [
    ["cli", cli],
    ["browser", browser.results ?? []],
  ] as const)
    for (const run of runs) {
      const key = `${runtime}/${run.scenario ?? run.name}`;
      (grouped[key] ??= []).push(run);
    }
  const result: Record<string, unknown> = {};
  for (const [key, runs] of Object.entries(grouped)) {
    const summaries = runs.map((r) =>
      summarizeFrameSamples(r.frameSamples ?? r.snapshot?.samples ?? []),
    );
    const inputToPaint = runs.flatMap(
      (r) => r.diagnostics?.inputToPaintMs ?? r.profileResult?.diagnostics?.inputToPaintMs ?? [],
    );
    result[key] = {
      runCount: runs.length,
      elapsedMs: summarizeRunStability(
        runs.map((run) => run.elapsedMs ?? run.timing?.elapsedMs ?? 0),
      ),
      frameP95: summarizeRunStability(summaries.map((s) => s.durationMs.p95)),
      frameMax: summarizeRunStability(summaries.map((s) => s.durationMs.max)),
      runs: summaries,
      correctness: runs.map((r) => r.correctness ?? r.profileResult?.correctness).filter(Boolean),
      corpus: runs.map((r) => r.corpus ?? r.profileResult?.corpus).filter(Boolean),
      inputToPaintMs: {
        p50: percentile(inputToPaint, 0.5),
        p95: percentile(inputToPaint, 0.95),
        p99: percentile(inputToPaint, 0.99),
        max: Math.max(0, ...inputToPaint),
        over16_7ms: inputToPaint.filter((value) => value > 16.7).length,
        over33_3ms: inputToPaint.filter((value) => value > 33.3).length,
        over50ms: inputToPaint.filter((value) => value > 50).length,
      },
      stdout: runs.map((r) => r.stdout).filter(Boolean),
      memory: runs.map((r) => r.memory).filter(Boolean),
      cpuHotspots: runs.flatMap((r) => r.cpuHotspots ?? []),
      renderer: runs.map((r) => r.snapshot?.rendererDebugStats).filter(Boolean),
      domFlushSamples: runs.flatMap((r) => r.snapshot?.domFlushSamples ?? []),
    };
  }
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1]?.endsWith("summarize-agent-console-profile.ts")) main();
