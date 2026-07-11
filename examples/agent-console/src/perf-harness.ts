import type { FramePerfSample } from "@simon_he/vue-tui/observability";
import type { AgentConsoleApi } from "./AgentConsoleSurface";

export const AGENT_CONSOLE_PROFILE_SCENARIOS = [
  "tail-stream-steady",
  "tail-append-burst-framed",
  "tail-append-burst-single-task",
  "detached-append",
  "search-large-history",
  "stream-scroll-interaction",
] as const;
export type AgentConsoleProfileScenario = (typeof AGENT_CONSOLE_PROFILE_SCENARIOS)[number];

export interface AgentConsoleProfileOptions {
  seedCount?: number;
  appendCount?: number;
  steadyCount?: number;
  cadenceMs?: number;
  batchSize?: number;
}

export interface AgentConsoleProfileAdapter {
  api: AgentConsoleApi;
  now(): number;
  append(index: number): void;
  yieldTask(): Promise<void>;
  yieldFrame(): Promise<void>;
  dispatchWheel(delta: number): Promise<number>;
  waitUntilSettled(): Promise<void>;
}

export interface AgentConsoleProfileResult {
  scenario: AgentConsoleProfileScenario;
  elapsedMs: number;
  eventsAdded: number;
  frameSamples: readonly FramePerfSample[];
  correctness: Readonly<Record<string, boolean | number | string>>;
  diagnostics: Readonly<Record<string, number | string | readonly number[]>>;
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
  firstVisibleRow: string;
}

function viewportAnchor(api: AgentConsoleApi): ViewportAnchor {
  const metrics = api.metrics.value;
  return {
    scrollTop: metrics?.scrollTop ?? -1,
    firstLineIndex: metrics?.firstLineIndex ?? -1,
    firstVisibleRow: api.getTranscriptRows().find((row) => row.length > 0) ?? "",
  };
}

async function appendFramed(
  adapter: AgentConsoleProfileAdapter,
  startIndex: number,
  count: number,
  batchSize: number,
): Promise<void> {
  for (let start = 0; start < count; start += batchSize) {
    for (let offset = start; offset < Math.min(count, start + batchSize); offset++) {
      adapter.append(startIndex + offset);
    }
    await adapter.yieldTask();
    await adapter.yieldFrame();
  }
}

async function appendSteady(
  adapter: AgentConsoleProfileAdapter,
  startIndex: number,
  count: number,
  cadenceMs: number,
): Promise<void> {
  for (let offset = 0; offset < count; offset++) {
    adapter.append(startIndex + offset);
    await adapter.yieldFrame();
    if (cadenceMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, cadenceMs));
    else await adapter.yieldTask();
  }
}

async function settleSearch(adapter: AgentConsoleProfileAdapter): Promise<void> {
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
  seedCount: number,
): Promise<number> {
  adapter.api.seed(seedCount);
  await adapter.waitUntilSettled();
  adapter.api.jumpToBottom();
  await adapter.waitUntilSettled();
  const appendStartIndex = adapter.api.replayTotal.value;
  adapter.api.clearFramePerf();
  return appendStartIndex;
}

export async function runAgentConsoleProfileScenario(
  adapter: AgentConsoleProfileAdapter,
  scenario: AgentConsoleProfileScenario,
  options: AgentConsoleProfileOptions = {},
): Promise<AgentConsoleProfileResult> {
  const seedCount = options.seedCount ?? 6_000;
  const appendCount = options.appendCount ?? 1_000;
  const steadyCount = options.steadyCount ?? 400;
  const cadenceMs = options.cadenceMs ?? 12;
  const batchSize = options.batchSize ?? 10;
  const appendStartIndex = await prepareAgentConsoleProfile(adapter, seedCount);
  const frameSamples: FramePerfSample[] = [];
  const unsubscribe = adapter.api.subscribeFramePerf((sample) => frameSamples.push(sample));
  const started = adapter.now();
  const correctness: Record<string, boolean | number | string> = {};
  const diagnostics: Record<string, number | string | readonly number[]> = {};

  try {
    if (scenario === "tail-stream-steady") {
      await appendSteady(adapter, appendStartIndex, steadyCount, cadenceMs);
      correctness.atBottom = adapter.api.metrics.value?.atBottom === true;
    } else if (scenario === "tail-append-burst-framed") {
      await appendFramed(adapter, appendStartIndex, appendCount, batchSize);
      correctness.atBottom = adapter.api.metrics.value?.atBottom === true;
    } else if (scenario === "tail-append-burst-single-task") {
      for (let offset = 0; offset < appendCount; offset++)
        adapter.append(appendStartIndex + offset);
      await adapter.waitUntilSettled();
      correctness.atBottom = adapter.api.metrics.value?.atBottom === true;
    } else if (scenario === "detached-append") {
      await adapter.dispatchWheel(-200);
      await adapter.waitUntilSettled();
      const before = viewportAnchor(adapter.api);
      correctness.detachedBeforeAppend = adapter.api.metrics.value?.atBottom === false;
      await appendFramed(adapter, appendStartIndex, appendCount, batchSize);
      const after = viewportAnchor(adapter.api);
      correctness.detachedAfterAppend = adapter.api.metrics.value?.atBottom === false;
      correctness.scrollTopPreserved = after.scrollTop === before.scrollTop;
      correctness.anchorLinePreserved = after.firstLineIndex === before.firstLineIndex;
      correctness.anchorRowPreserved = after.firstVisibleRow === before.firstVisibleRow;
      diagnostics.scrollTopBefore = before.scrollTop;
      diagnostics.scrollTopAfter = after.scrollTop;
      diagnostics.firstLineIndexBefore = before.firstLineIndex;
      diagnostics.firstLineIndexAfter = after.firstLineIndex;
      diagnostics.firstVisibleRowBefore = before.firstVisibleRow;
      diagnostics.firstVisibleRowAfter = after.firstVisibleRow;
    } else if (scenario === "search-large-history") {
      adapter.api.openSearch("ERROR");
      await settleSearch(adapter);
      correctness.searchStatus = adapter.api.searchState.value.status;
      correctness.matches = adapter.api.searchState.value.matchCount;
      correctness.hasMatches = adapter.api.searchState.value.matchCount > 0;
    } else {
      const inputToPaintMs: number[] = [];
      for (let offset = 0; offset < steadyCount; offset++) {
        adapter.append(appendStartIndex + offset);
        if (offset % 8 === 0) {
          inputToPaintMs.push(await adapter.dispatchWheel(offset % 16 === 0 ? -6 : 6));
        }
        await adapter.yieldFrame();
        if (cadenceMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, cadenceMs));
      }
      diagnostics.inputToPaintMs = inputToPaintMs;
      correctness.contentVisible = adapter.api.getTranscriptRows().some((row) => row.length > 0);
    }

    await adapter.waitUntilSettled();
  } finally {
    unsubscribe();
  }

  const elapsedMs = adapter.now() - started;
  const finalReplayTotal = adapter.api.replayTotal.value;
  const expectedAdded =
    scenario === "search-large-history"
      ? 0
      : scenario === "tail-stream-steady" || scenario === "stream-scroll-interaction"
        ? steadyCount
        : appendCount;
  const eventsAdded = finalReplayTotal - appendStartIndex;
  correctness.eventCount = eventsAdded;
  correctness.eventCountCorrect = eventsAdded === expectedAdded;
  const metrics = adapter.api.metrics.value;
  const failed = Object.entries(correctness).filter(
    ([, value]) => value === false || value === "error",
  );
  if (failed.length) {
    throw new Error(`${scenario} correctness failed: ${failed.map(([key]) => key).join(", ")}`);
  }

  return {
    scenario,
    elapsedMs,
    eventsAdded,
    frameSamples,
    correctness,
    diagnostics,
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
