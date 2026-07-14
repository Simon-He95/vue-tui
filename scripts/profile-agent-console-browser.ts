#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test";
import { preview, type PreviewServer } from "vite";
import { summarizeCpuProfile } from "./agent-console-cpu-profile.js";
import { agentConsoleProfileEnvironment } from "./agent-console-profile-environment.js";
import {
  AGENT_CONSOLE_CPU_PROFILE_SCENARIOS,
  AGENT_CONSOLE_PROFILE_DEFAULTS,
  AGENT_CONSOLE_PROFILE_SCENARIOS,
  resolveAgentConsoleProfileOptions,
} from "../examples/agent-console/src/perf-harness.js";

const root = process.cwd();
const outputDir = resolve(
  root,
  process.env.VUE_TUI_PROFILE_OUTPUT_DIR ?? ".tmp/perf/agent-console",
);
const port = Number(process.env.VUE_TUI_AGENT_CONSOLE_PORT ?? 4178);
const profileVariant = process.env.AGENT_CONSOLE_PROFILE_VARIANT ?? "C";
const baseUrl = `http://127.0.0.1:${port}/?profile=1&variant=${profileVariant}`;
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const canonicalOptions = resolveAgentConsoleProfileOptions(
  smoke
    ? { seedCount: 120, appendCount: 30, steadyCount: 20, cadenceMs: 0 }
    : {
        seedCount:
          process.env.VUE_TUI_AGENT_CONSOLE_SEED == null
            ? AGENT_CONSOLE_PROFILE_DEFAULTS.seedCount
            : Number(process.env.VUE_TUI_AGENT_CONSOLE_SEED),
        appendCount:
          process.env.VUE_TUI_AGENT_CONSOLE_APPEND == null
            ? AGENT_CONSOLE_PROFILE_DEFAULTS.appendCount
            : Number(process.env.VUE_TUI_AGENT_CONSOLE_APPEND),
        steadyCount:
          process.env.VUE_TUI_AGENT_CONSOLE_STEADY == null
            ? AGENT_CONSOLE_PROFILE_DEFAULTS.steadyCount
            : Number(process.env.VUE_TUI_AGENT_CONSOLE_STEADY),
        cadenceMs:
          process.env.VUE_TUI_AGENT_CONSOLE_CADENCE_MS == null
            ? AGENT_CONSOLE_PROFILE_DEFAULTS.cadenceMs
            : Number(process.env.VUE_TUI_AGENT_CONSOLE_CADENCE_MS),
        batchSize:
          process.env.VUE_TUI_AGENT_CONSOLE_BATCH_SIZE == null
            ? AGENT_CONSOLE_PROFILE_DEFAULTS.batchSize
            : Number(process.env.VUE_TUI_AGENT_CONSOLE_BATCH_SIZE),
      },
);
const { seedCount, appendCount, steadyCount, cadenceMs, batchSize } = canonicalOptions;
const runCount = smoke ? 1 : Number(process.env.AGENT_CONSOLE_PROFILE_RUNS ?? 5);

type BrowserTiming = Readonly<{
  elapsedMs: number;
  longTasks: readonly number[];
  rafIntervals: readonly number[];
}>;
type ScenarioResult = Readonly<{
  name: string;
  run: number;
  timing: BrowserTiming;
  snapshot: unknown;
  profileResult: unknown;
  memory: Readonly<{ beforeUsedSize: number; afterUsedSize: number; deltaUsedSize: number }>;
  cpuProfilePath?: string;
  cpuProfileSummary?: ReturnType<typeof summarizeCpuProfile>;
  cpuHotspots?: ReturnType<typeof summarizeCpuProfile>["hotspots"];
}>;

const cpuProfileScenarios = new Set(AGENT_CONSOLE_CPU_PROFILE_SCENARIOS);

async function startServer(): Promise<PreviewServer> {
  return preview({
    root: resolve(root, "examples/agent-console"),
    preview: { host: "127.0.0.1", port, strictPort: true },
    logLevel: "warn",
  });
}
async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Agent Console Vite server did not start at ${baseUrl}`);
}
async function prepare(page: Page): Promise<void> {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__AGENT_CONSOLE_PERF__));
}
async function measure(
  page: Page,
  session: CDPSession,
  name: string,
  run: number,
  action: () => Promise<unknown>,
  diagnosticCpu = false,
): Promise<ScenarioResult> {
  await session.send("HeapProfiler.collectGarbage");
  const memoryBefore = await session.send("Runtime.getHeapUsage");
  const profileCpu = diagnosticCpu;
  if (profileCpu) {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 100 });
    await session.send("Profiler.start");
  }
  await page.evaluate(() => {
    (window as any).__agentPerfLongTasks = [];
    (window as any).__agentPerfRafs = [];
    let previous = performance.now();
    const tick = (now: number) => {
      (window as any).__agentPerfRafs.push(now - previous);
      previous = now;
      (window as any).__agentPerfRaf = requestAnimationFrame(tick);
    };
    (window as any).__agentPerfRaf = requestAnimationFrame(tick);
    (window as any).__agentPerfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        (window as any).__agentPerfLongTasks.push(entry.duration);
    });
    try {
      (window as any).__agentPerfObserver.observe({ type: "longtask" });
    } catch {
      /* unavailable */
    }
    (window as any).__agentPerfStarted = performance.now();
  });
  const profileResult = await action();
  const measured = await page.evaluate(
    (scenarioName) => {
      cancelAnimationFrame((window as any).__agentPerfRaf);
      const observer = (window as any).__agentPerfObserver as PerformanceObserver | undefined;
      for (const entry of observer?.takeRecords() ?? [])
        (window as any).__agentPerfLongTasks.push(entry.duration);
      observer?.disconnect();
      return {
        name: scenarioName.name,
        run: scenarioName.run,
        timing: {
          elapsedMs: performance.now() - (window as any).__agentPerfStarted,
          longTasks: (window as any).__agentPerfLongTasks,
          rafIntervals: (window as any).__agentPerfRafs,
        },
        snapshot: (window as any).__AGENT_CONSOLE_PERF__.snapshot(),
      };
    },
    { name, run },
  );
  let cpuProfilePath: string | undefined;
  let cpuProfileSummary: ReturnType<typeof summarizeCpuProfile> | undefined;
  if (profileCpu) {
    const { profile } = await session.send("Profiler.stop");
    cpuProfilePath = join(outputDir, `${name}-run-${run + 1}.browser.cpuprofile`);
    writeFileSync(cpuProfilePath, JSON.stringify(profile));
    cpuProfileSummary = summarizeCpuProfile(profile);
    await session.send("Profiler.disable");
  }
  await session.send("HeapProfiler.collectGarbage");
  const memoryAfter = await session.send("Runtime.getHeapUsage");
  return {
    ...measured,
    profileResult,
    memory: {
      includesProfilerBuffers: true,
      beforeUsedSize: memoryBefore.usedSize,
      afterUsedSize: memoryAfter.usedSize,
      deltaUsedSize: memoryAfter.usedSize - memoryBefore.usedSize,
      bytesPerEvent: (profileResult as { eventsAdded?: number })?.eventsAdded
        ? (memoryAfter.usedSize - memoryBefore.usedSize) /
          (profileResult as { eventsAdded: number }).eventsAdded
        : 0,
    },
    cpuProfilePath,
    cpuProfileSummary,
    cpuHotspots: cpuProfileSummary?.hotspots,
  };
}
async function main(): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  if (process.env.AGENT_CONSOLE_PROFILE_SKIP_BUILD !== "1") {
    execFileSync("pnpm", ["run", "build:checked"], { cwd: root, stdio: "inherit" });
  }
  execFileSync("pnpm", ["-C", "examples/agent-console", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VUE_TUI_PROFILE_DIST: "1" },
  });
  cpSync(resolve(root, "examples/agent-console/dist"), resolve(outputDir, "browser-sourcemaps"), {
    recursive: true,
  });
  const server = await startServer();
  let browser: Browser | null = null;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const results: ScenarioResult[] = [];
    for (let run = 0; run < runCount; run++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await page.addInitScript({ content: "globalThis.__name = (target) => target;" });

      for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
        await prepare(page);
        const prepared = await page.evaluate(
          (options) => globalThis.__AGENT_CONSOLE_PERF__.prepareScenario(options),
          { seedCount, appendCount, steadyCount, cadenceMs },
        );
        await page.evaluate(() => globalThis.__AGENT_CONSOLE_PERF__.reset());
        results.push(
          await measure(page, session, scenario, run, () =>
            page.evaluate(
              ({ name, prepared, options }) =>
                globalThis.__AGENT_CONSOLE_PERF__.runPreparedScenario(name, prepared, options),
              {
                name: scenario,
                prepared,
                options: canonicalOptions,
              },
            ),
          ),
        );
      }

      await context.close();
    }

    if (!smoke && process.env.AGENT_CONSOLE_PROFILE_SKIP_CPU !== "1") {
      for (const scenario of cpuProfileScenarios) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        await page.addInitScript({ content: "globalThis.__name = (target) => target;" });
        await prepare(page);
        const options = { seedCount, appendCount, steadyCount, cadenceMs };
        const prepared = await page.evaluate(
          (value) => globalThis.__AGENT_CONSOLE_PERF__.prepareScenario(value),
          options,
        );
        await page.evaluate(() => globalThis.__AGENT_CONSOLE_PERF__.reset());
        const diagnostic = await measure(
          page,
          session,
          scenario,
          -1,
          () =>
            page.evaluate(
              ({ name, prepared, options }) =>
                globalThis.__AGENT_CONSOLE_PERF__.runPreparedScenario(name, prepared, options),
              { name: scenario, prepared, options },
            ),
          true,
        );
        if (!diagnostic.cpuProfilePath || statSync(diagnostic.cpuProfilePath).size <= 0)
          throw new Error(`${scenario}: missing or empty Chromium CPU profile`);
        if (!diagnostic.cpuProfileSummary?.hotspots?.length)
          throw new Error(`${scenario}: empty Chromium CPU hotspot summary`);
        writeFileSync(
          join(outputDir, `${scenario}-cpu-diagnostic.json`),
          JSON.stringify(diagnostic, null, 2),
        );
        await context.close();
      }
    }

    for (const result of results) {
      const snapshot = result.snapshot as {
        metrics: { atBottom?: boolean } | null;
        search: { status?: string; matchCount?: number };
        replayTotal: number;
        inputVisible: boolean;
      };
      if (result.name !== "search-large-history" && !snapshot.inputVisible) {
        throw new Error(`${result.name}: input area is not visible`);
      }
      if (
        result.name === "tail-stream-steady" ||
        result.name === "product-tail-stream-12ms" ||
        result.name === "tail-append-burst-framed" ||
        result.name === "tail-append-burst-single-task"
      ) {
        if (snapshot.metrics?.atBottom !== true)
          throw new Error(`${result.name}: tail following was lost`);
      }
      if (result.name === "detached-append" && snapshot.metrics?.atBottom !== false) {
        throw new Error("detached-append: viewport returned to the tail");
      }
      if (result.name === "search-large-history") {
        if (snapshot.search.status !== "done" || (snapshot.search.matchCount ?? 0) <= 0) {
          throw new Error("search-large-history: search did not complete with matches");
        }
      }
      if (result.name !== "search-large-history" && snapshot.replayTotal <= seedCount) {
        throw new Error(`${result.name}: no events were appended`);
      }
    }

    const output = {
      runtime: "browser",
      generatedAt: new Date().toISOString(),
      environment: {
        ...agentConsoleProfileEnvironment(
          ["dist/vue.js", "dist/cli.js", "examples/agent-console/dist/index.html"],
          ["dist", "examples/agent-console/dist"],
        ),
        browser: await browser.version(),
        seedCount,
        appendCount,
        steadyCount,
        cadenceMs,
        batchSize,
        runCount,
      },
      results,
    };
    const path = join(outputDir, "browser-raw.json");
    writeFileSync(path, JSON.stringify(output, null, 2));
    console.log(path);
  } finally {
    await browser?.close();
    await new Promise<void>((done, reject) => {
      server.httpServer.close((error) => (error ? reject(error) : done()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
