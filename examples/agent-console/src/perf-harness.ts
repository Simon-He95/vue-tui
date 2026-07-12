import type { FramePerfSample } from "@simon_he/vue-tui/observability";
import type { AgentConsoleApi } from "./AgentConsoleSurface";

export const AGENT_CONSOLE_PROFILE_SCENARIOS = [
  "tail-stream-steady",
  "tail-append-burst-framed",
  "tail-append-burst-single-task",
  "detached-append",
  "search-large-history",
  "stream-scroll-interaction",
  "markdown-toggle-large-history",
  "markdown-stream-steady",
] as const;
export type AgentConsoleProfileScenario = (typeof AGENT_CONSOLE_PROFILE_SCENARIOS)[number];
export const AGENT_CONSOLE_CPU_PROFILE_SCENARIOS = [
  "tail-append-burst-framed",
  "tail-append-burst-single-task",
  "stream-scroll-interaction",
  "markdown-stream-steady",
] as const satisfies readonly AgentConsoleProfileScenario[];
export const AGENT_CONSOLE_PROFILE_DEFAULTS = Object.freeze({
  seedCount: 6_000,
  appendCount: 1_000,
  steadyCount: 400,
  cadenceMs: 64,
  batchSize: 10,
});
export interface AgentConsoleProfileOptions {
  seedCount?: number;
  appendCount?: number;
  steadyCount?: number;
  cadenceMs?: number;
  batchSize?: number;
}
export type AgentConsoleProfileInputLatency = Readonly<{
  inputToCommitMs: number;
  inputToDomFlushMs: number | null;
  inputToPaintOpportunityMs: number | null;
  scrollChanged: boolean;
  scrollFrameObserved: boolean;
  dispatchAccepted: boolean;
  matchedFrameId: number | null;
  matchedFrameReason: string | null;
  domFlushObserved: boolean;
  direction: -1 | 1;
}>;
export interface AgentConsoleProfileAdapter {
  api: AgentConsoleApi;
  now(): number;
  append(index: number): void;
  yieldTask(): Promise<void>;
  yieldFrame(): Promise<void>;
  sleepUntil(deadline: number): Promise<void>;
  dispatchWheel(delta: number): Promise<AgentConsoleProfileInputLatency>;
  waitUntilSettled(): Promise<void>;
  resetMeasurements(): void;
  requiresDomFlush?: boolean;
}
export type PreparedAgentConsoleProfile = Readonly<{
  seedCount: number;
  appendStartIndex: number;
  initialReplayTotal: number;
}>;
export interface AgentConsoleProfileResult {
  scenario: AgentConsoleProfileScenario;
  elapsedMs: number;
  timing: Readonly<{
    actionElapsedMs: number;
    settleElapsedMs: number;
    totalElapsedMs: number;
    producerElapsedMs?: number;
    targetCadenceMs?: number;
    deadlineMisses?: number;
    maxDeadlineLatenessMs?: number;
    appendIntervalP50Ms?: number;
    appendIntervalP95Ms?: number;
  }>;
  eventsAdded: number;
  frameSamples: readonly FramePerfSample[];
  correctness: Readonly<Record<string, boolean | number | string>>;
  diagnostics: Readonly<Record<string, number | string | readonly number[] | readonly string[]>>;
  preparedState: Readonly<{
    visualIndexStatus: string;
    measuredLineCount: number;
    lineCount: number;
  }>;
  finalState: Readonly<{ visualIndexStatus: string; measuredLineCount: number; lineCount: number }>;
  corpus: Readonly<{
    version: 1;
    seed: 0;
    seedCount: number;
    appendStartIndex: number;
    eventsAdded: number;
    finalReplayTotal: number;
    finalLineCount: number;
    firstLineIndex: number;
  }>;
}
interface ViewportAnchor {
  scrollTop: number;
  firstLineIndex: number;
  visibleRows: readonly string[];
}
export function resolveAgentConsoleProfileOptions(options: AgentConsoleProfileOptions = {}) {
  const result = { ...AGENT_CONSOLE_PROFILE_DEFAULTS, ...options };
  for (const key of ["seedCount", "appendCount", "steadyCount"] as const) {
    if (!Number.isFinite(result[key]) || !Number.isInteger(result[key]) || result[key] < 0)
      throw new Error(`${key} must be a finite non-negative integer`);
  }
  if (
    !Number.isFinite(result.batchSize) ||
    !Number.isInteger(result.batchSize) ||
    result.batchSize <= 0
  )
    throw new Error("batchSize must be a finite positive integer");
  if (!Number.isFinite(result.cadenceMs) || result.cadenceMs < 0)
    throw new Error("cadenceMs must be finite and non-negative");
  return result;
}
function viewportAnchor(api: AgentConsoleApi): ViewportAnchor {
  const metrics = api.metrics.value;
  return {
    scrollTop: metrics?.scrollTop ?? -1,
    firstLineIndex: metrics?.firstLineIndex ?? -1,
    visibleRows: api.getTranscriptRows(),
  };
}
async function appendFramed(
  adapter: AgentConsoleProfileAdapter,
  startIndex: number,
  count: number,
  batchSize: number,
) {
  for (let start = 0; start < count; start += batchSize) {
    for (let offset = start; offset < Math.min(count, start + batchSize); offset++)
      adapter.append(startIndex + offset);
    await adapter.yieldTask();
    await adapter.yieldFrame();
  }
}
async function appendSteady(
  adapter: AgentConsoleProfileAdapter,
  startIndex: number,
  count: number,
  cadenceMs: number,
) {
  const started = adapter.now();
  let deadline = started;
  let deadlineMisses = 0;
  let maxDeadlineLatenessMs = 0;
  const appendIntervals: number[] = [];
  let previousAppendAt: number | undefined;
  for (let offset = 0; offset < count; offset++) {
    const appendAt = adapter.now();
    if (previousAppendAt != null) appendIntervals.push(appendAt - previousAppendAt);
    previousAppendAt = appendAt;
    adapter.append(startIndex + offset);
    deadline += cadenceMs;
    if (cadenceMs > 0) {
      await adapter.sleepUntil(deadline);
      const lateness = Math.max(0, adapter.now() - deadline);
      if (lateness > Math.max(1, cadenceMs * 0.1)) deadlineMisses++;
      maxDeadlineLatenessMs = Math.max(maxDeadlineLatenessMs, lateness);
    } else await adapter.yieldTask();
  }
  const sorted = [...appendIntervals].sort((a, b) => a - b);
  const percentile = (q: number) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]! : 0;
  return {
    producerElapsedMs: adapter.now() - started,
    targetCadenceMs: cadenceMs,
    deadlineMisses,
    maxDeadlineLatenessMs,
    appendIntervalP50Ms: percentile(0.5),
    appendIntervalP95Ms: percentile(0.95),
  };
}
interface ScenarioPreparedState {
  viewportAnchor?: ViewportAnchor;
  markdownLength?: number;
  markdownPublicationCount?: number;
}
async function prepareMeasuredScenario(
  adapter: AgentConsoleProfileAdapter,
  scenario: AgentConsoleProfileScenario,
): Promise<ScenarioPreparedState> {
  if (scenario === "markdown-stream-steady") {
    adapter.api.mode.value = "markdown";
    await adapter.waitUntilSettled();
    return {
      markdownLength: adapter.api.getMarkdownLength(),
      markdownPublicationCount: adapter.api.getMarkdownPublicationCount(),
    };
  }
  if (scenario === "detached-append") {
    await adapter.dispatchWheel(-200);
    await adapter.waitUntilSettled();
    return { viewportAnchor: viewportAnchor(adapter.api) };
  }
  return {};
}
async function settleSearch(adapter: AgentConsoleProfileAdapter) {
  for (let turn = 0; turn < 240; turn++) {
    await adapter.yieldFrame();
    const status = adapter.api.searchState.value.status;
    if (status === "done" || status === "error") return;
    await adapter.yieldTask();
  }
  throw new Error("search-large-history did not settle");
}
export async function prepareAgentConsoleProfile(
  adapter: AgentConsoleProfileAdapter,
  options: AgentConsoleProfileOptions = {},
): Promise<PreparedAgentConsoleProfile> {
  const { seedCount } = resolveAgentConsoleProfileOptions(options);
  const appendStartIndex = adapter.api.seed(seedCount);
  await adapter.waitUntilSettled();
  adapter.api.jumpToBottom();
  await adapter.waitUntilSettled();
  return { seedCount, appendStartIndex, initialReplayTotal: adapter.api.replayTotal.value };
}
export async function runPreparedAgentConsoleProfileScenario(
  adapter: AgentConsoleProfileAdapter,
  scenario: AgentConsoleProfileScenario,
  prepared: PreparedAgentConsoleProfile,
  options: AgentConsoleProfileOptions = {},
): Promise<AgentConsoleProfileResult> {
  const { appendCount, steadyCount, cadenceMs, batchSize } =
    resolveAgentConsoleProfileOptions(options);
  const { appendStartIndex, seedCount, initialReplayTotal } = prepared;
  const scenarioPrepared = await prepareMeasuredScenario(adapter, scenario);
  adapter.resetMeasurements();
  const frameSamples: FramePerfSample[] = [];
  const unsubscribe = adapter.api.subscribeFramePerf((sample) => frameSamples.push(sample));
  const started = adapter.now();
  const preparedMetrics = adapter.api.metrics.value;
  const preparedState = {
    visualIndexStatus: preparedMetrics?.visualIndexStatus ?? "unknown",
    measuredLineCount: preparedMetrics?.measuredLineCount ?? 0,
    lineCount: preparedMetrics?.lineCount ?? 0,
  };
  const correctness: Record<string, boolean | number | string> = {
    preparedVisualIndexExact: preparedState.visualIndexStatus === "exact",
  };
  const diagnostics: Record<string, number | string | readonly number[] | readonly string[]> = {};
  try {
    if (scenario === "tail-stream-steady") {
      Object.assign(
        diagnostics,
        await appendSteady(adapter, appendStartIndex, steadyCount, cadenceMs),
      );
      correctness.atBottom = adapter.api.metrics.value?.atBottom === true;
    } else if (scenario === "tail-append-burst-framed") {
      await appendFramed(adapter, appendStartIndex, appendCount, batchSize);
      correctness.atBottom = adapter.api.metrics.value?.atBottom === true;
    } else if (scenario === "tail-append-burst-single-task") {
      for (let offset = 0; offset < appendCount; offset++)
        adapter.append(appendStartIndex + offset);
      correctness.atBottom = adapter.api.metrics.value?.atBottom === true;
    } else if (scenario === "detached-append") {
      const before = scenarioPrepared.viewportAnchor!;
      correctness.detachedBeforeAppend = adapter.api.metrics.value?.atBottom === false;
      await appendFramed(adapter, appendStartIndex, appendCount, batchSize);
      const after = viewportAnchor(adapter.api);
      correctness.detachedAfterAppend = adapter.api.metrics.value?.atBottom === false;
      correctness.viewportAnchorPreserved =
        after.visibleRows.length === before.visibleRows.length &&
        after.visibleRows.every((row, index) => row === before.visibleRows[index]);
      diagnostics.retentionShifted = after.firstLineIndex !== before.firstLineIndex ? 1 : 0;
      diagnostics.scrollTopDelta = after.scrollTop - before.scrollTop;
      diagnostics.firstLineIndexDelta = after.firstLineIndex - before.firstLineIndex;
      diagnostics.scrollTopBefore = before.scrollTop;
      diagnostics.scrollTopAfter = after.scrollTop;
      diagnostics.firstLineIndexBefore = before.firstLineIndex;
      diagnostics.firstLineIndexAfter = after.firstLineIndex;
      diagnostics.visibleRowsBefore = before.visibleRows;
      diagnostics.visibleRowsAfter = after.visibleRows;
    } else if (scenario === "search-large-history") {
      adapter.api.openSearch("ERROR");
      await settleSearch(adapter);
      correctness.searchStatus = adapter.api.searchState.value.status;
      correctness.matches = adapter.api.searchState.value.matchCount;
      correctness.hasMatches = adapter.api.searchState.value.matchCount > 0;
    } else if (scenario === "markdown-toggle-large-history") {
      const markdownLength = adapter.api.getMarkdownLength();
      adapter.api.mode.value = "markdown";
      await adapter.waitUntilSettled();
      const blockCount = adapter.api.getMarkdownBlockCount();
      correctness.markdownMode = adapter.api.mode.value === "markdown";
      correctness.markdownContentComplete = markdownLength > 0 && blockCount > 0;
      correctness.contentVisible = adapter.api.getTranscriptRows().some((row) => row.length > 0);
      diagnostics.markdownLength = markdownLength;
      diagnostics.markdownBlockCount = blockCount;
    } else if (scenario === "markdown-stream-steady") {
      const beforeLength = scenarioPrepared.markdownLength!;
      Object.assign(
        diagnostics,
        await appendSteady(adapter, appendStartIndex, steadyCount, cadenceMs),
      );
      const afterLength = adapter.api.getMarkdownLength();
      correctness.markdownMode = adapter.api.mode.value === "markdown";
      correctness.markdownGrew = afterLength > beforeLength;
      correctness.markdownBlocksPublished = adapter.api.getMarkdownBlockCount() > 0;
      correctness.contentVisible = adapter.api.getTranscriptRows().some((row) => row.length > 0);
      diagnostics.markdownLengthBefore = beforeLength;
      diagnostics.markdownLengthAfter = afterLength;
      diagnostics.markdownBlockCount = adapter.api.getMarkdownBlockCount();
      diagnostics.markdownPublications =
        adapter.api.getMarkdownPublicationCount() -
        (scenarioPrepared.markdownPublicationCount ?? 0);
      correctness.markdownPublicationCoalesced =
        Number(diagnostics.markdownPublications) < steadyCount;
    } else {
      const inputLatencies: AgentConsoleProfileInputLatency[] = [];
      let deadline = adapter.now();
      for (let offset = 0; offset < steadyCount; offset++) {
        adapter.append(appendStartIndex + offset);
        if (offset % 8 === 0) {
          await adapter.yieldFrame();
          inputLatencies.push(await adapter.dispatchWheel(-60));
        }
        deadline += cadenceMs;
        if (cadenceMs > 0) await adapter.sleepUntil(deadline);
        else await adapter.yieldTask();
      }
      diagnostics.inputToCommitMs = inputLatencies.map((sample) => sample.inputToCommitMs);
      diagnostics.inputToDomFlushMs = inputLatencies.flatMap((sample) =>
        sample.inputToDomFlushMs == null ? [] : [sample.inputToDomFlushMs],
      );
      diagnostics.inputToPaintOpportunityMs = inputLatencies.flatMap((sample) =>
        sample.inputToPaintOpportunityMs == null ? [] : [sample.inputToPaintOpportunityMs],
      );
      correctness.inputSamples = inputLatencies.length;
      correctness.inputSamplesCorrect = inputLatencies.length === Math.ceil(steadyCount / 8);
      correctness.scrollChanged = inputLatencies.every((sample) => sample.scrollChanged);
      correctness.scrollFramesObserved = inputLatencies.every(
        (sample) => sample.scrollFrameObserved && sample.matchedFrameReason === "scroll",
      );
      correctness.dispatchAccepted = inputLatencies.every((sample) => sample.dispatchAccepted);
      correctness.domFlushesObserved =
        !adapter.requiresDomFlush || inputLatencies.every((sample) => sample.domFlushObserved);
      correctness.contentVisible = adapter.api.getTranscriptRows().some((row) => row.length > 0);
    }
    const actionFinished = adapter.now();
    await adapter.waitUntilSettled();
    const settled = adapter.now();
    diagnostics.actionElapsedMs = actionFinished - started;
    diagnostics.settleElapsedMs = settled - actionFinished;
  } finally {
    unsubscribe();
  }
  const elapsedMs = adapter.now() - started;
  const finalReplayTotal = adapter.api.replayTotal.value;
  const expectedAdded =
    scenario === "search-large-history" || scenario === "markdown-toggle-large-history"
      ? 0
      : scenario === "tail-stream-steady" ||
          scenario === "stream-scroll-interaction" ||
          scenario === "markdown-stream-steady"
        ? steadyCount
        : appendCount;
  const eventsAdded = finalReplayTotal - initialReplayTotal;
  correctness.eventCount = eventsAdded;
  correctness.eventCountCorrect = eventsAdded === expectedAdded;
  const failed = Object.entries(correctness).filter(
    ([, value]) => value === false || value === "error",
  );
  if (failed.length)
    throw new Error(`${scenario} correctness failed: ${failed.map(([key]) => key).join(", ")}`);
  await adapter.waitUntilSettled();
  const metrics = adapter.api.metrics.value;
  const finalState = {
    visualIndexStatus: metrics?.visualIndexStatus ?? "unknown",
    measuredLineCount: metrics?.measuredLineCount ?? 0,
    lineCount: metrics?.lineCount ?? 0,
  };
  correctness.finalVisualIndexExact = finalState.visualIndexStatus === "exact";
  if (!correctness.finalVisualIndexExact)
    throw new Error(`${scenario} correctness failed: finalVisualIndexExact`);
  return {
    scenario,
    elapsedMs,
    timing: {
      actionElapsedMs: Number(diagnostics.actionElapsedMs),
      settleElapsedMs: Number(diagnostics.settleElapsedMs),
      totalElapsedMs: elapsedMs,
      producerElapsedMs: diagnostics.producerElapsedMs as number | undefined,
      targetCadenceMs: diagnostics.targetCadenceMs as number | undefined,
      deadlineMisses: diagnostics.deadlineMisses as number | undefined,
      maxDeadlineLatenessMs: diagnostics.maxDeadlineLatenessMs as number | undefined,
      appendIntervalP50Ms: diagnostics.appendIntervalP50Ms as number | undefined,
      appendIntervalP95Ms: diagnostics.appendIntervalP95Ms as number | undefined,
    },
    eventsAdded,
    frameSamples,
    correctness,
    diagnostics,
    preparedState,
    finalState,
    corpus: {
      version: 1,
      seed: 0,
      seedCount,
      appendStartIndex,
      eventsAdded,
      finalReplayTotal,
      finalLineCount: metrics?.lineCount ?? 0,
      firstLineIndex: metrics?.firstLineIndex ?? 0,
    },
  };
}
export async function runAgentConsoleProfileScenario(
  adapter: AgentConsoleProfileAdapter,
  scenario: AgentConsoleProfileScenario,
  options: AgentConsoleProfileOptions = {},
) {
  const prepared = await prepareAgentConsoleProfile(adapter, options);
  adapter.api.clearFramePerf();
  return runPreparedAgentConsoleProfileScenario(adapter, scenario, prepared, options);
}
