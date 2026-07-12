import { describe, expect, it } from "vitest";
import { AGENT_CONSOLE_PROFILE_SCENARIOS } from "../examples/agent-console/src/perf-harness.js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  measurementInputHashes,
  verificationInputHashes,
} from "../scripts/agent-console-profile-environment.js";
import {
  assertPairedPolicy,
  median,
  pairedComparison,
  pairedRatiosByRound,
} from "../scripts/agent-console-profile-stats.js";
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
      "markdown-toggle-large-history",
      "markdown-stream-steady",
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

  it("uses the arithmetic median for even samples", () => {
    expect(median([2, 4, 6, 8, 10, 12])).toBe(7);
  });

  it("pairs ratios by round rather than array position", () => {
    const from = [
      { round: 1, scenario: "x", elapsedMs: 200 },
      { round: 0, scenario: "x", elapsedMs: 100 },
    ];
    const to = [
      { round: 0, scenario: "x", elapsedMs: 50 },
      { round: 1, scenario: "x", elapsedMs: 100 },
    ];
    expect(pairedRatiosByRound(from, to, "x")).toEqual([0.5, 0.5]);
  });

  it("rejects paired regressions hidden by an unpaired ratio", () => {
    const fromValues = [1, 2, 3, 100, 101, 102];
    const toValues = [1.2, 2.4, 3.6, 120, 121.2, 10.2];
    expect(median(toValues) / median(fromValues)).toBeLessThan(1.1);
    const comparison = pairedComparison(
      fromValues.map((elapsedMs, round) => ({ round, scenario: "x", elapsedMs })),
      toValues.map((elapsedMs, round) => ({ round, scenario: "x", elapsedMs })),
      "x",
    );
    expect(comparison.pairedMedianRatio).toBeGreaterThan(1.1);
    expect(() =>
      assertPairedPolicy("x", comparison, {
        maxPairedMedianRatio: 1.1,
        rejectWhenBootstrapLowerExceeds: 1.1,
      }),
    ).toThrow();
  });

  it("resolves CLI package exports to dist with the profile tsconfig", () => {
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--eval", "console.log(import.meta.resolve('@simon_he/vue-tui/cli'))"],
      {
        cwd: resolve("."),
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: resolve("scripts/tsconfig.agent-console-profile-dist.json"),
        },
        encoding: "utf8",
      },
    );
    expect(output.trim()).toContain("/dist/cli.js");
  });

  it("separates measurement inputs from verification inputs", () => {
    expect(measurementInputHashes()).toHaveProperty("examples/agent-console/src/perf-harness.ts");
    expect(measurementInputHashes()).not.toHaveProperty(
      "scripts/check-agent-console-profile-baseline.ts",
    );
    expect(verificationInputHashes()).toHaveProperty(
      "scripts/check-agent-console-profile-baseline.ts",
    );
    expect(verificationInputHashes()).not.toHaveProperty(
      "examples/agent-console/src/perf-harness.ts",
    );
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
