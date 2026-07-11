#!/usr/bin/env tsx

import type { FramePerfSample } from "../src/observability/frame-perf.js";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const percentile = (values: number[], q: number) => {
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
  coalescedInvalidates: samples.reduce((sum, s) => sum + s.coalescedInvalidates, 0),
  coalescedFrameTasks: samples.reduce((sum, s) => sum + s.coalescedFrameTasks, 0),
  droppedUpdates: samples.reduce((sum, s) => sum + s.droppedUpdates, 0),
  maxQueueDepth: Math.max(0, ...samples.map((s) => s.queueDepth)),
});
export function summarizeAgentConsoleRun(run: {
  runtime: string;
  generatedAt: string;
  environment: Record<string, unknown>;
  scenarios: readonly {
    name: string;
    elapsedMs: number;
    samples: readonly FramePerfSample[];
    correctness?: Record<string, unknown>;
    diagnostics?: Record<string, unknown>;
  }[];
}) {
  return {
    ...run,
    scenarios: run.scenarios.map((scenario) => ({
      ...scenario,
      samples: undefined,
      ...summarizeFrameSamples(scenario.samples),
    })),
  };
}
function main() {
  const root = resolve(process.cwd(), process.argv[2] ?? ".tmp/perf/agent-console");
  const output = resolve(process.cwd(), process.argv[3] ?? ".tmp/perf/agent-console/summary.json");
  const files: string[] = [];
  for (const target of [resolve(root, "cli"), resolve(root, "browser")]) {
    try {
      files.push(
        ...readdirSync(target)
          .filter((name) => name.endsWith(".json") && name !== "all.json")
          .map((name) => resolve(target, name)),
      );
    } catch {
      /* target not recorded */
    }
  }
  const result: Record<string, unknown> = {};
  for (const file of files) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    result[`${basename(resolve(file, ".."))}/${basename(file, ".json")}`] = {
      elapsedMs: value.elapsedMs ?? value.timing?.elapsedMs,
      eventsAdded: value.eventsAdded,
      correctness: value.correctness,
      ...summarizeFrameSamples(value.frameSamples ?? value.snapshot?.samples ?? []),
    };
  }
  try {
    const browser = JSON.parse(readFileSync(resolve(root, "browser-raw.json"), "utf8"));
    for (const scenario of browser.results ?? []) {
      const longTasks = scenario.timing?.longTasks ?? [];
      const rafIntervals = scenario.timing?.rafIntervals ?? [];
      result[`browser/${scenario.name}`] = {
        elapsedMs: scenario.timing?.elapsedMs,
        longTasks: {
          count: longTasks.length,
          p95: percentile(longTasks, 0.95),
          max: Math.max(0, ...longTasks),
        },
        rafIntervalMs: {
          p50: percentile(rafIntervals, 0.5),
          p95: percentile(rafIntervals, 0.95),
          p99: percentile(rafIntervals, 0.99),
          max: Math.max(0, ...rafIntervals),
        },
        ...summarizeFrameSamples(scenario.snapshot?.samples ?? []),
      };
    }
  } catch {
    /* browser run not recorded */
  }
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
