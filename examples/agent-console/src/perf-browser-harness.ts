import type { FramePerfSample } from "@simon_he/vue-tui/observability";
import type { AgentConsoleApi } from "./AgentConsoleSurface";
import type {
  AgentConsoleProfileOptions,
  AgentConsoleProfileResult,
  AgentConsoleProfileScenario,
  PreparedAgentConsoleProfile,
} from "./perf-harness";
import { prepareAgentConsoleProfile, runPreparedAgentConsoleProfileScenario } from "./perf-harness";
import { nextTick } from "vue";

export type AgentConsoleBrowserPerfApi = Readonly<{
  api: AgentConsoleApi;
  reset: () => void;
  seed: (count: number) => Promise<void>;
  appendBatched: (count: number, batchSize?: number) => Promise<void>;
  appendSteady: (count: number, cadenceMs?: number) => Promise<void>;
  scrollBy: (delta: number) => Promise<void>;
  search: (query: string) => Promise<void>;
  prepareScenario: (options?: AgentConsoleProfileOptions) => Promise<PreparedAgentConsoleProfile>;
  runPreparedScenario: (
    scenario: AgentConsoleProfileScenario,
    prepared: PreparedAgentConsoleProfile,
    options?: AgentConsoleProfileOptions,
  ) => Promise<AgentConsoleProfileResult>;
  snapshot: () => Readonly<{
    samples: readonly FramePerfSample[];
    metrics: AgentConsoleApi["metrics"]["value"];
    search: AgentConsoleApi["searchState"]["value"];
    replayTotal: number;
    inputVisible: boolean;
    rendererDebugStats: ReturnType<AgentConsoleApi["getRendererDebugStats"]>;
    rendererDelta: Readonly<{
      flushCount: number;
      rowRender: Record<string, number>;
    }>;
    domFlushSamples: readonly { startedAt: number; durationMs: number; planeRows: number }[];
  }>;
}>;

declare global {
  interface Window {
    __AGENT_CONSOLE_PERF__?: AgentConsoleBrowserPerfApi;
  }
}

async function settle(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function browserAdapter(api: AgentConsoleApi, getSamples: () => readonly FramePerfSample[]) {
  return {
    api,
    now: () => performance.now(),
    append: (index: number) => api.appendSyntheticChunk(index),
    async yieldTask() {
      await new Promise<void>((done) => setTimeout(done, 0));
    },
    async yieldFrame() {
      await nextTick();
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
    },
    async sleepUntil(deadline: number) {
      await new Promise<void>((done) =>
        setTimeout(done, Math.max(0, deadline - performance.now())),
      );
    },
    async dispatchWheel(delta: number) {
      const started = performance.now();
      const beforeTop = api.metrics.value?.scrollTop ?? -1;
      const beforeFrame = getSamples().at(-1)?.frameId ?? -1;
      const beforeFlush = api.getRendererDebugStats()?.flush.count ?? 0;
      api.dispatchProfileWheel(delta, started);
      for (let turn = 0; turn < 60; turn++) {
        await nextTick();
        await new Promise<void>((done) => requestAnimationFrame(() => done()));
        if (getSamples().some((sample) => sample.frameId > beforeFrame)) break;
      }
      const commitAt = performance.now();
      for (let turn = 0; turn < 60; turn++) {
        if ((api.getRendererDebugStats()?.flush.count ?? 0) > beforeFlush) break;
        await new Promise<void>((done) => requestAnimationFrame(() => done()));
      }
      const flushAt = performance.now();
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      const afterTop = api.metrics.value?.scrollTop ?? -1;
      return {
        inputToCommitMs: commitAt - started,
        inputToDomFlushMs: flushAt - started,
        inputToPaintOpportunityMs: performance.now() - started,
        scrollChanged: afterTop !== beforeTop,
        scrollFrameObserved: getSamples().some((sample) => sample.frameId > beforeFrame),
        direction: (delta < 0 ? -1 : 1) as -1 | 1,
      };
    },
    async waitUntilSettled() {
      await settle(8);
    },
  };
}

export function installAgentConsoleBrowserPerf(api: AgentConsoleApi): () => void {
  let samples: FramePerfSample[] = [];
  let domFlushSamples: { startedAt: number; durationMs: number; planeRows: number }[] = [];
  let lastFlushStartedAt = Number.NEGATIVE_INFINITY;
  let rendererFlushBaseline = 0;
  let rendererRowBaseline: Record<string, number> = {};
  const rendererTotals = () => {
    const stats = api.getRendererDebugStats();
    return {
      flushCount: stats?.flush.count ?? 0,
      rowRender: Object.fromEntries(
        Object.entries(stats?.rowRender.total ?? {}).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      ),
    };
  };
  let polling = true;
  const pollRenderer = () => {
    if (!polling) return;
    const flush = api.getRendererDebugStats()?.flush.last;
    if (flush && flush.startedAt > lastFlushStartedAt) {
      lastFlushStartedAt = flush.startedAt;
      domFlushSamples.push({
        startedAt: flush.startedAt,
        durationMs: flush.durationMs,
        planeRows: flush.planeRows,
      });
    }
    requestAnimationFrame(pollRenderer);
  };
  requestAnimationFrame(pollRenderer);
  const unsubscribeFramePerf = api.subscribeFramePerf((sample) => samples.push(sample));
  const harness: AgentConsoleBrowserPerfApi = {
    api,
    reset() {
      samples = [];
      domFlushSamples = [];
      lastFlushStartedAt =
        api.getRendererDebugStats()?.flush.last?.startedAt ?? Number.NEGATIVE_INFINITY;
      const rendererBaseline = rendererTotals();
      rendererFlushBaseline = rendererBaseline.flushCount;
      rendererRowBaseline = rendererBaseline.rowRender;
      api.clearFramePerf();
      performance.clearMarks();
      performance.clearMeasures();
    },
    async seed(count) {
      api.seed(count);
      await settle(8);
    },
    async appendBatched(count, batchSize = 10) {
      for (let start = 0; start < count; start += batchSize) {
        for (let index = start; index < Math.min(count, start + batchSize); index++) {
          api.appendSyntheticChunk(index);
        }
        await Promise.resolve();
      }
      await settle(8);
    },
    async appendSteady(count, cadenceMs = 12) {
      for (let index = 0; index < count; index++) {
        api.appendSyntheticChunk(index);
        await new Promise((resolve) => setTimeout(resolve, cadenceMs));
      }
      await settle(8);
    },
    async scrollBy(delta) {
      api.scrollBy(delta);
      await settle(3);
    },
    async search(query) {
      api.openSearch(query);
      for (let turn = 0; turn < 120; turn++) {
        await settle(1);
        if (api.searchState.value.status !== "scanning") break;
      }
    },
    prepareScenario(options) {
      return prepareAgentConsoleProfile(
        browserAdapter(api, () => samples),
        options,
      );
    },
    runPreparedScenario(scenario, prepared, options) {
      return runPreparedAgentConsoleProfileScenario(
        browserAdapter(api, () => samples),
        scenario,
        prepared,
        options,
      );
    },
    snapshot() {
      const rendererCurrent = rendererTotals();
      return {
        samples: samples.slice(),
        metrics: api.metrics.value,
        search: api.searchState.value,
        replayTotal: api.replayTotal.value,
        rendererDebugStats: api.getRendererDebugStats(),
        rendererDelta: {
          flushCount: rendererCurrent.flushCount - rendererFlushBaseline,
          rowRender: Object.fromEntries(
            Object.entries(rendererCurrent.rowRender).map(([key, value]) => [
              key,
              value - (rendererRowBaseline[key] ?? 0),
            ]),
          ),
        },
        domFlushSamples: domFlushSamples.slice(),
        inputVisible: api
          .getTerminalSnapshot()
          .slice(-8)
          .some((row) => row.includes("┌")),
      };
    },
  };
  window.__AGENT_CONSOLE_PERF__ = harness;
  return () => {
    polling = false;
    unsubscribeFramePerf();
    if (window.__AGENT_CONSOLE_PERF__ === harness) delete window.__AGENT_CONSOLE_PERF__;
  };
}
