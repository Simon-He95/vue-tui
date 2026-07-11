import { describe, expect, it } from "vitest";
import { AGENT_CONSOLE_PROFILE_SCENARIOS } from "../examples/agent-console/src/perf-harness.js";
import {
  summarizeAgentConsoleRun,
  summarizeRunStability,
} from "../scripts/summarize-agent-console-profile.js";

const sample = {
  frameId: 1,
  reason: "stream" as const,
  startedAt: 1,
  durationMs: 4,
  renderManagerMs: 2,
  commitMs: 1,
  stdoutFlushMs: 0.5,
  dirtyRows: 3,
  activePlanes: ["default"],
  scannedNodes: 7,
  paintedNodes: 5,
  coalescedInvalidates: 2,
  frameTaskCount: 1,
  coalescedFrameTasks: 1,
  frameTaskQueueDepthBeforeRun: 1,
  frameTaskQueueDepthAfterRun: 0,
  remainingFrameTasks: 0,
  droppedUpdates: 0,
  queueDepth: 1,
};

describe("Agent Console profile harness", () => {
  it("distinguishes framed and single-task burst semantics", () => {
    expect(AGENT_CONSOLE_PROFILE_SCENARIOS).toEqual([
      "tail-stream-steady",
      "tail-append-burst-framed",
      "tail-append-burst-single-task",
      "detached-append",
      "search-large-history",
      "stream-scroll-interaction",
    ]);
  });

  it("summarizes run-level stability without pooling frames", () => {
    expect(summarizeRunStability([2, 4, 6, 8, 10])).toMatchObject({
      runs: 5,
      median: 6,
      min: 2,
      max: 10,
      range: [2, 10],
    });
  });

  it("summarizes frame distributions and coalescing", () => {
    const summary = summarizeAgentConsoleRun({
      runtime: "cli",
      generatedAt: "2026-01-01T00:00:00.000Z",
      environment: {},
      scenarios: [{ name: "tail-stream-steady", elapsedMs: 10, samples: [sample] }],
    });
    expect(summary.scenarios[0]).toMatchObject({
      frames: 1,
      durationMs: { p50: 4, p95: 4, p99: 4, max: 4 },
      coalescedInvalidates: 2,
      coalescedFrameTasks: 1,
      maxQueueDepth: 1,
    });
  });
});
