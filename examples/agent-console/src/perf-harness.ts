import type { FramePerfSample } from "@simon_he/vue-tui/observability";
import type { AgentConsoleApi } from "./AgentConsoleSurface";
import type { TerminalApp } from "@simon_he/vue-tui/cli";
import { nextTick } from "vue";
import { AGENT_CONSOLE_LAYOUT } from "./AgentConsoleSurface";

export const AGENT_CONSOLE_PROFILE_SCENARIOS = [
  "tail-stream-steady",
  "tail-append-burst",
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
}

export interface AgentConsoleProfileResult {
  scenario: AgentConsoleProfileScenario;
  elapsedMs: number;
  eventsAdded: number;
  frameSamples: readonly FramePerfSample[];
  correctness: Readonly<Record<string, boolean | number | string>>;
}

export interface AgentConsoleProfileContext {
  app: TerminalApp;
  api: AgentConsoleApi;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function settle(context: AgentConsoleProfileContext, turns = 3): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await nextTick();
    context.app.scheduler.flushNow();
    await Promise.resolve();
  }
}

async function prepare(context: AgentConsoleProfileContext, count: number): Promise<number> {
  context.api.seed(count);
  await settle(context, 5);
  context.api.jumpToBottom();
  await settle(context, 3);
  const before = context.api.replayTotal.value;
  context.api.clearFramePerf();
  return before;
}

async function appendBatches(
  context: AgentConsoleProfileContext,
  count: number,
  batchSize: number,
): Promise<void> {
  for (let start = 0; start < count; start += batchSize) {
    const end = Math.min(count, start + batchSize);
    for (let index = start; index < end; index++) context.api.appendSyntheticChunk(index);
    await nextTick();
    context.app.scheduler.flushNow();
    await Promise.resolve();
  }
}

function wheel(context: AgentConsoleProfileContext, deltaY: number, time: number): void {
  context.app.events.dispatch({
    type: "wheel",
    cellX: AGENT_CONSOLE_LAYOUT.transcript.x + 2,
    cellY: AGENT_CONSOLE_LAYOUT.transcript.y + 2,
    deltaY,
    time,
  });
  context.app.scheduler.flushNow();
}

async function settleSearch(context: AgentConsoleProfileContext): Promise<void> {
  for (let i = 0; i < 240; i++) {
    await settle(context, 1);
    const status = context.api.searchState.value.status;
    if (status === "done" || status === "error") return;
    await delay(0);
  }
  throw new Error("search-large-history did not settle");
}

export async function runAgentConsoleProfileScenario(
  context: AgentConsoleProfileContext,
  scenario: AgentConsoleProfileScenario,
  options: AgentConsoleProfileOptions = {},
): Promise<AgentConsoleProfileResult> {
  const seedCount = options.seedCount ?? 6_000;
  const appendCount = options.appendCount ?? 1_000;
  const steadyCount = options.steadyCount ?? 400;
  const cadenceMs = options.cadenceMs ?? 12;
  const before = await prepare(context, seedCount);
  const frameSamples: FramePerfSample[] = [];
  const unsubscribeFramePerf = context.api.subscribeFramePerf((sample) =>
    frameSamples.push(sample),
  );
  const started = performance.now();
  const correctness: Record<string, boolean | number | string> = {};

  if (scenario === "tail-stream-steady") {
    for (let i = 0; i < steadyCount; i++) {
      context.api.appendSyntheticChunk(i);
      await nextTick();
      context.app.scheduler.flushNow();
      await delay(cadenceMs);
    }
    correctness.atBottom = context.api.metrics.value?.atBottom === true;
  } else if (scenario === "tail-append-burst") {
    await appendBatches(context, appendCount, 10);
    correctness.atBottom = context.api.metrics.value?.atBottom === true;
  } else if (scenario === "detached-append") {
    for (let i = 0; i < 20; i++) wheel(context, -10, 1_000 + i);
    await settle(context, 4);
    const visibleBefore = context.api.getTranscriptRows().filter(Boolean);
    correctness.detachedBeforeAppend = context.api.metrics.value?.atBottom === false;
    await appendBatches(context, appendCount, 10);
    correctness.detachedAfterAppend = context.api.metrics.value?.atBottom === false;
    const visibleAfter = context.api.getTranscriptRows().filter(Boolean);
    correctness.viewportAnchorPreserved = visibleBefore.some((row) => visibleAfter.includes(row));
  } else if (scenario === "search-large-history") {
    context.api.openSearch("ERROR");
    await settleSearch(context);
    correctness.searchStatus = context.api.searchState.value.status;
    correctness.matches = context.api.searchState.value.matchCount;
    correctness.hasMatches = context.api.searchState.value.matchCount > 0;
  } else {
    for (let i = 0; i < steadyCount; i++) {
      context.api.appendSyntheticChunk(i);
      if (i % 8 === 0) wheel(context, i % 16 === 0 ? -6 : 6, 2_000 + i);
      await nextTick();
      context.app.scheduler.flushNow();
      await delay(cadenceMs);
    }
    correctness.contentVisible = context.api.getTranscriptRows().some((row) => row.length > 0);
  }

  await settle(context, 5);
  const elapsedMs = performance.now() - started;
  const after = context.api.replayTotal.value;
  const expectedAdded =
    scenario === "search-large-history"
      ? 0
      : scenario.includes("steady") || scenario === "stream-scroll-interaction"
        ? steadyCount
        : appendCount;
  correctness.eventCount = after - before;
  correctness.eventCountCorrect = after - before === expectedAdded;
  unsubscribeFramePerf();
  const failed = Object.entries(correctness).filter(
    ([, value]) => value === false || value === "error",
  );
  if (failed.length)
    throw new Error(`${scenario} correctness failed: ${failed.map(([key]) => key).join(", ")}`);

  return {
    scenario,
    elapsedMs,
    eventsAdded: after - before,
    frameSamples,
    correctness,
  };
}
