#!/usr/bin/env tsx
import type { AgentConsoleApi } from "../examples/agent-console/src/AgentConsoleSurface.js";
import type { AgentConsoleProfileAdapter } from "../examples/agent-console/src/perf-harness.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector";
import { resolve } from "node:path";
import { summarizeCpuProfile, type CpuProfile } from "./agent-console-cpu-profile.js";
import { createStdoutRenderer, createTerminalApp } from "@simon_he/vue-tui/cli";
import {
  AGENT_CONSOLE_LAYOUT,
  AgentConsoleSurface,
} from "../examples/agent-console/src/AgentConsoleSurface.js";
import {
  AGENT_CONSOLE_CPU_PROFILE_SCENARIOS,
  AGENT_CONSOLE_PROFILE_SCENARIOS,
  prepareAgentConsoleProfile,
  runPreparedAgentConsoleProfileScenario,
} from "../examples/agent-console/src/perf-harness.js";
import { nextTick } from "vue";
const outputDir = resolve(
  process.cwd(),
  process.env.VUE_TUI_PROFILE_OUTPUT_DIR ?? ".tmp/perf/agent-console",
  "cli",
);
mkdirSync(outputDir, { recursive: true });
const runtimeResolutions = Object.fromEntries(
  [
    "@simon_he/vue-tui/cli",
    "@simon_he/vue-tui/vue",
    "@simon_he/vue-tui/markdown",
    "@simon_he/vue-tui/experimental",
  ].map((specifier) => [specifier, import.meta.resolve(specifier)]),
);
for (const [specifier, url] of Object.entries(runtimeResolutions)) {
  if (!url.includes("/dist/")) throw new Error(`${specifier} did not resolve to dist: ${url}`);
}
writeFileSync(
  resolve(outputDir, "runtime-resolutions.json"),
  JSON.stringify(runtimeResolutions, null, 2),
);
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const options = smoke
  ? { seedCount: 120, appendCount: 30, steadyCount: 20, cadenceMs: 0 }
  : undefined;
const cpuProfileScenarios = new Set(AGENT_CONSOLE_CPU_PROFILE_SCENARIOS);
function post<T>(session: Session, method: string, params?: Record<string, unknown>): Promise<T> {
  return new Promise((resolvePost, reject) => {
    session.post(method, params ?? {}, (error, result) => {
      if (error) reject(error);
      else resolvePost(result as T);
    });
  });
}
async function collectGarbage(): Promise<void> {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc === "function") gc();
  await new Promise<void>((done) => setTimeout(done, 0));
}
const selectedScenario = process.env.AGENT_CONSOLE_PROFILE_SCENARIO;
const runNumber = process.env.AGENT_CONSOLE_PROFILE_RUN ?? "1";
const scenarios = selectedScenario
  ? AGENT_CONSOLE_PROFILE_SCENARIOS.filter((scenario) => scenario === selectedScenario)
  : AGENT_CONSOLE_PROFILE_SCENARIOS;
if (!scenarios.length) throw new Error(`Unknown profile scenario: ${selectedScenario}`);
const results = [];
for (const scenario of scenarios) {
  let api: AgentConsoleApi | null = null;
  const app = createTerminalApp({
    cols: AGENT_CONSOLE_LAYOUT.cols,
    rows: AGENT_CONSOLE_LAYOUT.rows,
    component: AgentConsoleSurface,
    props: {
      autoStart: false,
      onReady(next: AgentConsoleApi) {
        api = next;
      },
    },
    defaultStyle: { fg: "whiteBright", bg: "black" },
  });
  const output = { writes: 0, bytes: 0, maxBytes: 0, cursorMoves: 0 };
  const renderer = createStdoutRenderer(app.terminal, {
    output: {
      isTTY: false,
      write(chunk) {
        const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        const bytes = Buffer.byteLength(text);
        output.writes++;
        output.bytes += bytes;
        output.maxBytes = Math.max(output.maxBytes, bytes);
        output.cursorMoves += (text.match(/\x1B\[[0-9;]*[HfABCD]/g) ?? []).length;
        return true;
      },
    },
    clear: false,
    hideCursor: false,
    altScreen: false,
    trackResize: false,
  });
  try {
    app.mount();
    await nextTick();
    app.scheduler.flushNow();
    if (!api) throw new Error("Agent Console API did not mount");
    const mountedApi: AgentConsoleApi = api;
    const adapter: AgentConsoleProfileAdapter = {
      api: mountedApi,
      now: () => performance.now(),
      append: (index) => mountedApi.appendSyntheticChunk(index),
      async yieldTask() {
        await new Promise<void>((done) => setTimeout(done, 0));
      },
      async yieldFrame() {
        await nextTick();
        app.scheduler.flushNow();
      },
      async sleepUntil(deadline) {
        await new Promise<void>((done) =>
          setTimeout(done, Math.max(0, deadline - performance.now())),
        );
      },
      async dispatchWheel(delta) {
        const started = performance.now();
        const beforeTop = mountedApi.metrics.value?.scrollTop ?? -1;
        const beforeFrame = mountedApi.getFramePerfSamples().at(-1)?.frameId ?? -1;
        const prevented = app.events.dispatch({
          type: "wheel",
          cellX: AGENT_CONSOLE_LAYOUT.transcript.x + 2,
          cellY: AGENT_CONSOLE_LAYOUT.transcript.y + 2,
          deltaY: delta,
          time: started,
        });
        const dispatchAccepted = prevented !== false;
        app.scheduler.flush();
        let matched: ReturnType<AgentConsoleApi["getFramePerfSamples"]>[number] | undefined;
        for (let turn = 0; turn < 120; turn++) {
          await new Promise<void>((done) => setTimeout(done, 17));
          await nextTick();
          app.scheduler.flushNow();
          matched = mountedApi
            .getFramePerfSamples()
            .find((sample) => sample.frameId > beforeFrame && sample.reason === "scroll");
          if (matched && (mountedApi.metrics.value?.scrollTop ?? -1) !== beforeTop) break;
        }
        const afterTop = mountedApi.metrics.value?.scrollTop ?? -1;
        return {
          inputToCommitMs: matched ? matched.startedAt + matched.durationMs - started : Number.NaN,
          inputToDomFlushMs: null,
          inputToPaintOpportunityMs: null,
          scrollChanged: afterTop !== beforeTop,
          scrollFrameObserved: Boolean(matched),
          dispatchAccepted,
          matchedFrameId: matched?.frameId ?? null,
          matchedFrameReason: matched?.reason ?? null,
          domFlushObserved: false,
          direction: delta < 0 ? -1 : 1,
        } as const;
      },
      resetMeasurements() {
        mountedApi.clearFramePerf();
        output.writes = 0;
        output.bytes = 0;
        output.maxBytes = 0;
        output.cursorMoves = 0;
      },
      async waitUntilSettled() {
        const deadline = performance.now() + 15_000;
        let quiet = 0;
        let previousFrame = mountedApi.getFramePerfSamples().at(-1)?.frameId ?? -1;
        while (performance.now() < deadline) {
          await nextTick();
          const exact = mountedApi.metrics.value?.visualIndexStatus === "exact";
          const searchIdle = mountedApi.searchState.value.status !== "scanning";
          if (!exact || !searchIdle) app.scheduler.flushNow();
          await new Promise<void>((done) => setTimeout(done, 5));
          const frame = mountedApi.getFramePerfSamples().at(-1)?.frameId ?? -1;
          quiet = exact && searchIdle && frame === previousFrame ? quiet + 1 : 0;
          previousFrame = frame;
          if (exact && searchIdle && quiet >= 2) return;
        }
        throw new Error(
          `Agent Console CLI workload did not settle: ${JSON.stringify({
            metrics: mountedApi.metrics.value,
            search: mountedApi.searchState.value,
            quiet,
            frames: mountedApi
              .getFramePerfSamples()
              .slice(-5)
              .map((sample) => ({
                id: sample.frameId,
                reason: sample.reason,
                durationMs: sample.durationMs,
              })),
          })}`,
        );
      },
    };
    const prepared = await prepareAgentConsoleProfile(adapter, options);
    mountedApi.clearFramePerf();
    output.writes = 0;
    output.bytes = 0;
    output.maxBytes = 0;
    output.cursorMoves = 0;
    await collectGarbage();
    const memoryBefore = process.memoryUsage();
    const profileCpu =
      process.env.AGENT_CONSOLE_PROFILE_CPU === "1" && cpuProfileScenarios.has(scenario);
    const inspector = profileCpu ? new Session() : null;
    if (inspector) {
      inspector.connect();
      await post(inspector, "Profiler.enable");
      await post(inspector, "Profiler.setSamplingInterval", { interval: 100 });
      await post(inspector, "Profiler.start");
    }
    const result = await runPreparedAgentConsoleProfileScenario(
      adapter,
      scenario,
      prepared,
      options,
    );
    let cpuProfilePath: string | undefined;
    let cpuProfileSummary: ReturnType<typeof summarizeCpuProfile> | undefined;
    if (inspector) {
      const { profile } = await post<{ profile: CpuProfile }>(inspector, "Profiler.stop");
      cpuProfilePath = resolve(outputDir, `${scenario}-run-${runNumber}.node.cpuprofile`);
      writeFileSync(cpuProfilePath, JSON.stringify(profile));
      cpuProfileSummary = summarizeCpuProfile(profile);
      inspector.disconnect();
    }
    await collectGarbage();
    const memoryAfter = process.memoryUsage();
    const enriched = {
      ...result,
      memory: {
        includesProfilerBuffers: true,
        before: memoryBefore,
        after: memoryAfter,
        heapUsedDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
        rssDelta: memoryAfter.rss - memoryBefore.rss,
        heapBytesPerEvent: result.eventsAdded
          ? (memoryAfter.heapUsed - memoryBefore.heapUsed) / result.eventsAdded
          : 0,
        rssBytesPerEvent: result.eventsAdded
          ? (memoryAfter.rss - memoryBefore.rss) / result.eventsAdded
          : 0,
      },
      cpuProfilePath,
      cpuProfileSummary,
      cpuHotspots: cpuProfileSummary?.hotspots,
      stdout: {
        ...output,
        bytesPerFrame: result.frameSamples.length ? output.bytes / result.frameSamples.length : 0,
      },
    };
    results.push(enriched);
    writeFileSync(resolve(outputDir, `${scenario}.json`), JSON.stringify(enriched, null, 2));
    console.log(
      `${scenario}: ${result.frameSamples.length} frames, ${result.elapsedMs.toFixed(1)} ms`,
    );
  } finally {
    renderer.dispose();
    app.dispose();
  }
}
writeFileSync(resolve(outputDir, "all.json"), JSON.stringify(results, null, 2));
