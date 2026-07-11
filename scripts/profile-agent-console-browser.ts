#!/usr/bin/env tsx

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

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

type BrowserTiming = Readonly<{
  elapsedMs: number;
  longTasks: readonly number[];
  rafIntervals: readonly number[];
}>;
type ScenarioResult = Readonly<{ name: string; timing: BrowserTiming; snapshot: unknown }>;

function startServer(): ChildProcess {
  return spawn(
    "pnpm",
    ["-C", "examples/agent-console", "exec", "vite", "--host", "127.0.0.1", "--port", String(port)],
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
  name: string,
  action: () => Promise<void>,
): Promise<ScenarioResult> {
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
  await action();
  return page.evaluate((scenarioName) => {
    cancelAnimationFrame((window as any).__agentPerfRaf);
    (window as any).__agentPerfObserver?.disconnect();
    return {
      name: scenarioName,
      timing: {
        elapsedMs: performance.now() - (window as any).__agentPerfStarted,
        longTasks: (window as any).__agentPerfLongTasks,
        rafIntervals: (window as any).__agentPerfRafs,
      },
      snapshot: (window as any).__AGENT_CONSOLE_PERF__.snapshot(),
    };
  }, name);
}
async function main(): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  const server = startServer();
  let browser: Browser | null = null;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // tsx may preserve its function-name helper in callbacks serialized by Playwright.
    await page.addInitScript({ content: "globalThis.__name = (target) => target;" });
    const results: ScenarioResult[] = [];

    await prepare(page);
    results.push(
      await measure(page, "tail-stream-steady", () =>
        page.evaluate(
          `globalThis.__AGENT_CONSOLE_PERF__.appendSteady(${steadyCount}, ${cadenceMs})`,
        ),
      ),
    );

    await prepare(page);
    results.push(
      await measure(page, "tail-append-burst", () =>
        page.evaluate(`globalThis.__AGENT_CONSOLE_PERF__.appendBatched(${appendCount}, 10)`),
      ),
    );

    await prepare(page);
    await page.evaluate("globalThis.__AGENT_CONSOLE_PERF__.scrollBy(-200)");
    results.push(
      await measure(page, "detached-append", () =>
        page.evaluate(`globalThis.__AGENT_CONSOLE_PERF__.appendBatched(${appendCount}, 10)`),
      ),
    );

    await prepare(page);
    results.push(
      await measure(page, "search-large-history", () =>
        page.evaluate('globalThis.__AGENT_CONSOLE_PERF__.search("ERROR")'),
      ),
    );

    await prepare(page);
    results.push(
      await measure(page, "stream-scroll-interaction", async () => {
        const streaming = page.evaluate(
          `globalThis.__AGENT_CONSOLE_PERF__.appendSteady(${steadyCount}, ${cadenceMs})`,
        );
        for (let i = 0; i < 30; i++) {
          await page.mouse.wheel(0, i % 2 ? 360 : -360);
          await page.waitForTimeout(24);
        }
        await streaming;
      }),
    );

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
      if (result.name === "tail-stream-steady" || result.name === "tail-append-burst") {
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
        node: process.version,
        browser: await browser.version(),
        seedCount,
        appendCount,
        steadyCount,
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
