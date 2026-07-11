import type { FramePerfSample } from "@simon_he/vue-tui/observability";
import type { AgentConsoleApi } from "./AgentConsoleSurface";
import type {
  AgentConsoleProfileOptions,
  AgentConsoleProfileResult,
  AgentConsoleProfileScenario,
} from "./perf-harness";
import { runAgentConsoleProfileScenario } from "./perf-harness";
import { nextTick } from "vue";

export type AgentConsoleBrowserPerfApi = Readonly<{
  api: AgentConsoleApi;
  reset: () => void;
  seed: (count: number) => Promise<void>;
  appendBatched: (count: number, batchSize?: number) => Promise<void>;
  appendSteady: (count: number, cadenceMs?: number) => Promise<void>;
  scrollBy: (delta: number) => Promise<void>;
  search: (query: string) => Promise<void>;
  runScenario: (
    scenario: AgentConsoleProfileScenario,
    options?: AgentConsoleProfileOptions,
  ) => Promise<AgentConsoleProfileResult>;
  snapshot: () => Readonly<{
    samples: readonly FramePerfSample[];
    metrics: AgentConsoleApi["metrics"]["value"];
    search: AgentConsoleApi["searchState"]["value"];
    replayTotal: number;
    inputVisible: boolean;
    rendererDebugStats: ReturnType<AgentConsoleApi["getRendererDebugStats"]>;
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

export function installAgentConsoleBrowserPerf(api: AgentConsoleApi): () => void {
  let samples: FramePerfSample[] = [];
  let domFlushSamples: { startedAt: number; durationMs: number; planeRows: number }[] = [];
  let lastFlushStartedAt = Number.NEGATIVE_INFINITY;
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
      lastFlushStartedAt = Number.NEGATIVE_INFINITY;
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
    runScenario(scenario, options) {
      return runAgentConsoleProfileScenario(
        {
          api,
          now: () => performance.now(),
          append: (index) => api.appendSyntheticChunk(index),
          async yieldTask() {
            await new Promise<void>((done) => setTimeout(done, 0));
          },
          async yieldFrame() {
            await nextTick();
            await new Promise<void>((done) => requestAnimationFrame(() => done()));
          },
          async dispatchWheel(delta) {
            const started = performance.now();
            api.scrollBy(delta);
            await nextTick();
            await new Promise<void>((done) => requestAnimationFrame(() => done()));
            return performance.now() - started;
          },
          async waitUntilSettled() {
            await settle(8);
          },
        },
        scenario,
        options,
      );
    },
    snapshot() {
      return {
        samples: samples.slice(),
        metrics: api.metrics.value,
        search: api.searchState.value,
        replayTotal: api.replayTotal.value,
        rendererDebugStats: api.getRendererDebugStats(),
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
