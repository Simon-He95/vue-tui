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
  AGENT_CONSOLE_PROFILE_SCENARIOS,
  runAgentConsoleProfileScenario,
} from "../examples/agent-console/src/perf-harness.js";
import { nextTick } from "vue";
process.env.VUE_TUI_PROFILE = "1";
const outputDir = resolve(process.cwd(), ".tmp/perf/agent-console/cli");
mkdirSync(outputDir, { recursive: true });
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const options = smoke
  ? { seedCount: 120, appendCount: 30, steadyCount: 20, cadenceMs: 0 }
  : undefined;
const cpuProfileScenarios = new Set([
  "tail-append-burst-framed",
  "tail-append-burst",
  "stream-scroll-interaction",
]);
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
      async dispatchWheel(delta) {
        const started = performance.now();
        app.events.dispatch({
          type: "wheel",
          cellX: AGENT_CONSOLE_LAYOUT.transcript.x + 2,
          cellY: AGENT_CONSOLE_LAYOUT.transcript.y + 2,
          deltaY: delta,
          time: started,
        });
        await nextTick();
        app.scheduler.flushNow();
        return performance.now() - started;
      },
      async waitUntilSettled() {
        for (let i = 0; i < 5; i++) {
          await nextTick();
          app.scheduler.flushNow();
          await Promise.resolve();
        }
      },
    };
    await collectGarbage();
    const memoryBefore = process.memoryUsage();
    const profileCpu = !smoke && cpuProfileScenarios.has(scenario);
    const inspector = profileCpu ? new Session() : null;
    if (inspector) {
      inspector.connect();
      await post(inspector, "Profiler.enable");
      await post(inspector, "Profiler.setSamplingInterval", { interval: 100 });
      await post(inspector, "Profiler.start");
    }
    const result = await runAgentConsoleProfileScenario(adapter, scenario, options);
    let cpuProfilePath: string | undefined;
    let cpuHotspots: ReturnType<typeof summarizeCpuProfile> | undefined;
    if (inspector) {
      const { profile } = await post<{ profile: CpuProfile }>(inspector, "Profiler.stop");
      cpuProfilePath = resolve(outputDir, `${scenario}.node.cpuprofile`);
      writeFileSync(cpuProfilePath, JSON.stringify(profile));
      cpuHotspots = summarizeCpuProfile(profile);
      inspector.disconnect();
    }
    await collectGarbage();
    const memoryAfter = process.memoryUsage();
    const enriched = {
      ...result,
      memory: {
        before: memoryBefore,
        after: memoryAfter,
        heapUsedDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
        rssDelta: memoryAfter.rss - memoryBefore.rss,
      },
      cpuProfilePath,
      cpuHotspots,
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
