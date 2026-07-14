import { bootstrapMedianCi95, median } from "./agent-console-profile-stats.js";

const payload = (run: any) => run.profileResult ?? run;
const byScenario = (runs: any[], scenario: string) =>
  runs
    .filter((run) => (run.scenario ?? run.name) === scenario)
    .sort((left, right) => left.round - right.round);
const percentile95 = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
};
const paired = (before: number[], after: number[]) => {
  const ratios = before.map((value, index) => after[index]! / Math.max(value, 0.001));
  const deltas = before.map((value, index) => after[index]! - value);
  return {
    before,
    after,
    ratios,
    deltas,
    pairedMedianRatio: median(ratios),
    pairedMedianDelta: median(deltas),
    pairedBootstrapCi95: bootstrapMedianCi95(ratios),
  };
};
const longEvidence = (before: number[][], after: number[][]) => {
  const beforeCounts = before.map((items) => items.length);
  const afterCounts = after.map((items) => items.length);
  const beforeTotals = before.map((items) => items.reduce((sum, value) => sum + value, 0));
  const afterTotals = after.map((items) => items.reduce((sum, value) => sum + value, 0));
  return {
    beforeMedianCount: median(beforeCounts),
    afterMedianCount: median(afterCounts),
    countDeltas: beforeCounts.map((value, index) => afterCounts[index]! - value),
    totalDurationDeltas: beforeTotals.map((value, index) => afterTotals[index]! - value),
  };
};

export function agentConsoleScenarioEvidence(
  beforeRuns: any[],
  afterRuns: any[],
  runtime: "cli" | "browser",
  scenario: string,
) {
  const before = byScenario(beforeRuns, scenario);
  const after = byScenario(afterRuns, scenario);
  const frameValues = (runs: any[]) =>
    runs.map((run) =>
      percentile95((payload(run).frameSamples ?? []).map((item: any) => item.durationMs)),
    );
  const longFrames = (runs: any[]) =>
    runs.map((run) =>
      (payload(run).frameSamples ?? [])
        .filter((item: any) => item.durationMs > 16.7)
        .map((item: any) => item.durationMs),
    );
  const latency = (runs: any[], field: string) =>
    runs.map((run) => percentile95(payload(run).diagnostics?.[field] ?? []));
  const eventDivisor = (run: any) => Math.max(1, payload(run).eventsAdded ?? 0);
  const amplificationValues = (runs: any[], field: string) =>
    runs.map((run) => {
      if (runtime === "cli") {
        if (field === "writesPerEvent") return (run.stdout?.writes ?? 0) / eventDivisor(run);
        if (field === "bytesPerEvent") return (run.stdout?.bytes ?? 0) / eventDivisor(run);
        if (field === "cursorMovesPerEvent")
          return (run.stdout?.cursorMoves ?? 0) / eventDivisor(run);
        return run.stdout?.bytesPerFrame ?? 0;
      }
      const renderer = run.snapshot?.rendererDelta;
      if (field === "flushesPerEvent") return (renderer?.flushCount ?? 0) / eventDivisor(run);
      if (field === "renderedRowsPerEvent")
        return (renderer?.rowRender?.rows ?? 0) / eventDivisor(run);
      return (
        (run.snapshot?.domFlushSamples ?? []).reduce(
          (sum: number, item: any) => sum + (item.durationMs ?? 0),
          0,
        ) / eventDivisor(run)
      );
    });
  const amplificationFields =
    runtime === "cli"
      ? ["writesPerEvent", "bytesPerEvent", "cursorMovesPerEvent", "bytesPerFrame"]
      : ["flushesPerEvent", "renderedRowsPerEvent", "domFlushDurationPerEvent"];
  const result: Record<string, any> = {
    frameP95: paired(frameValues(before), frameValues(after)),
    longFrames: longEvidence(longFrames(before), longFrames(after)),
    amplification: Object.fromEntries(
      amplificationFields.map((field) => [
        field,
        paired(amplificationValues(before, field), amplificationValues(after, field)),
      ]),
    ),
  };
  if (runtime === "browser") {
    const longTasks = (runs: any[]) =>
      runs.map((run) => (run.timing?.longTasks ?? []).filter((value: number) => value >= 60));
    result.longTasks = longEvidence(longTasks(before), longTasks(after));
  }
  if (
    scenario === "stream-scroll-interaction" ||
    scenario === "product-stream-scroll-interaction-12ms"
  ) {
    result.inputLatency = Object.fromEntries(
      ["inputToCommitMs", "inputToDomFlushMs", "inputToPaintOpportunityMs"].flatMap((field) =>
        runtime === "cli" && field !== "inputToCommitMs"
          ? []
          : [[field, paired(latency(before, field), latency(after, field))]],
      ),
    );
  }
  return result;
}
