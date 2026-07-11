import type { FramePerfSample } from "@simon_he/vue-tui/observability";
import type { AgentConsoleApi } from "./AgentConsoleSurface";
import { nextTick } from "vue";

export type AgentConsoleBrowserPerfApi = Readonly<{
  api: AgentConsoleApi;
  reset: () => void;
  seed: (count: number) => Promise<void>;
  appendBatched: (count: number, batchSize?: number) => Promise<void>;
  appendSteady: (count: number, cadenceMs?: number) => Promise<void>;
  scrollBy: (delta: number) => Promise<void>;
  search: (query: string) => Promise<void>;
  snapshot: () => Readonly<{
    samples: readonly FramePerfSample[];
    metrics: AgentConsoleApi["metrics"]["value"];
    search: AgentConsoleApi["searchState"]["value"];
    replayTotal: number;
    inputVisible: boolean;
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
  const unsubscribeFramePerf = api.subscribeFramePerf((sample) => samples.push(sample));
  const harness: AgentConsoleBrowserPerfApi = {
    api,
    reset() {
      samples = [];
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
    snapshot() {
      return {
        samples: samples.slice(),
        metrics: api.metrics.value,
        search: api.searchState.value,
        replayTotal: api.replayTotal.value,
        inputVisible: api
          .getTerminalSnapshot()
          .slice(-8)
          .some((row) => row.includes("┌")),
      };
    },
  };
  window.__AGENT_CONSOLE_PERF__ = harness;
  return () => {
    unsubscribeFramePerf();
    if (window.__AGENT_CONSOLE_PERF__ === harness) delete window.__AGENT_CONSOLE_PERF__;
  };
}
