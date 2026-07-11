#!/usr/bin/env tsx

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test";
import { summarizeCpuProfile } from "./agent-console-cpu-profile.js";
import { agentConsoleProfileEnvironment } from "./agent-console-profile-environment.js";

const root = process.cwd();
const outputDir = resolve(
  root,
  process.env.VUE_TUI_PROFILE_OUTPUT_DIR ?? ".tmp/perf/agent-console",
);
const port = Number(process.env.VUE_TUI_AGENT_CONSOLE_PORT ?? 4178);
const baseUrl = `http://127.0.0.1:${port}/?profile=1`;
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const seedCount = Number(process.env.VUE_TUI_AGENT_CONSOLE_SEED ?? (smoke ? 120 : 6_000));
const appendCount = Number(process.env.VUE_TUI_AGENT_CONSOLE_APPEND ?? (smoke ? 30 : 1_000));
const steadyCount = Number(process.env.VUE_TUI_AGENT_CONSOLE_STEADY ?? (smoke ? 20 : 500));
const cadenceMs = smoke ? 0 : 12;
const runCount = smoke ? 1 : 5;

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
  cpuHotspots?: ReturnType<typeof summarizeCpuProfile>;
}>;

const cpuProfileScenarios = new Set([
  "tail-append-burst-framed",
  "tail-append-burst-single-task",
  "stream-scroll-interaction",
]);

function startServer(): ChildProcess {
  return spawn(
    "pnpm",
    [
      "-C",
      "examples/agent-console",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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
  await page.evaluate(async (count) => {
    const harness = (window as any).__AGENT_CONSOLE_PERF__;
    await harness.seed(count);
    harness.reset();
  }, seedCount);
}
async function measure(
  page: Page,
  session: CDPSession,
  name: string,
  run: number,
  action: () => Promise<unknown>,
): Promise<ScenarioResult> {
  await session.send("HeapProfiler.collectGarbage");
  const memoryBefore = await session.send("Runtime.getHeapUsage");
  const profileCpu = !smoke && cpuProfileScenarios.has(name);
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
      (window as any).__agentPerfObserver?.disconnect();
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
  let cpuHotspots: ReturnType<typeof summarizeCpuProfile> | undefined;
  if (profileCpu) {
    const { profile } = await session.send("Profiler.stop");
    cpuProfilePath = join(outputDir, `${name}-run-${run + 1}.browser.cpuprofile`);
    writeFileSync(cpuProfilePath, JSON.stringify(profile));
    cpuHotspots = summarizeCpuProfile(profile);
    await session.send("Profiler.disable");
  }
  await session.send("HeapProfiler.collectGarbage");
  const memoryAfter = await session.send("Runtime.getHeapUsage");
  return {
    ...measured,
    profileResult,
    memory: {
      beforeUsedSize: memoryBefore.usedSize,
      afterUsedSize: memoryAfter.usedSize,
      deltaUsedSize: memoryAfter.usedSize - memoryBefore.usedSize,
      bytesPerEvent: (profileResult as { eventsAdded?: number })?.eventsAdded
        ? (memoryAfter.usedSize - memoryBefore.usedSize) /
          (profileResult as { eventsAdded: number }).eventsAdded
        : 0,
    },
    cpuProfilePath,
    cpuHotspots,
  };
}
async function main(): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  execFileSync("pnpm", ["run", "build:checked"], { cwd: root, stdio: "inherit" });
  execFileSync("pnpm", ["-C", "examples/agent-console", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VUE_TUI_PROFILE_DIST: "1" },
  });
  const server = startServer();
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

      const scenarios = [
        "tail-stream-steady",
        "tail-append-burst-framed",
        "tail-append-burst-single-task",
        "detached-append",
        "search-large-history",
        "stream-scroll-interaction",
      ];
      for (const scenario of scenarios) {
        await prepare(page);
        results.push(
          await measure(page, session, scenario, run, () =>
            page.evaluate(
              ({ name, options }) => globalThis.__AGENT_CONSOLE_PERF__.runScenario(name, options),
              {
                name: scenario,
                options: { seedCount, appendCount, steadyCount, cadenceMs },
              },
            ),
          ),
        );
      }

      await context.close();
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
        ...agentConsoleProfileEnvironment([
          "dist/vue.js",
          "dist/cli.js",
          "examples/agent-console/dist/index.html",
        ]),
        browser: await browser.version(),
        seedCount,
        appendCount,
        steadyCount,
        runCount,
      },
      results,
    };
    const path = join(outputDir, "browser-raw.json");
    writeFileSync(path, JSON.stringify(output, null, 2));
    console.log(path);
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
