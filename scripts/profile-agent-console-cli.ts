#!/usr/bin/env tsx

import type { AgentConsoleApi } from "../examples/agent-console/src/AgentConsoleSurface";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStdoutRenderer, createTerminalApp } from "../src/cli";
import {
  AGENT_CONSOLE_LAYOUT,
  AgentConsoleSurface,
} from "../examples/agent-console/src/AgentConsoleSurface";
import {
  AGENT_CONSOLE_PROFILE_SCENARIOS,
  runAgentConsoleProfileScenario,
} from "../examples/agent-console/src/perf-harness";
import { nextTick } from "vue";

process.env.VUE_TUI_PROFILE = "1";

const outputDir = resolve(process.cwd(), ".tmp/perf/agent-console/cli");
mkdirSync(outputDir, { recursive: true });
const smoke = process.env.AGENT_CONSOLE_PROFILE_SMOKE === "1";
const options = smoke
  ? { seedCount: 120, appendCount: 30, steadyCount: 20, cadenceMs: 0 }
  : undefined;

const results = [];
for (const scenario of AGENT_CONSOLE_PROFILE_SCENARIOS) {
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
  const renderer = createStdoutRenderer(app.terminal, {
    output: { write: () => {}, isTTY: false },
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
    const result = await runAgentConsoleProfileScenario({ app, api }, scenario, options);
    results.push(result);
    writeFileSync(resolve(outputDir, `${scenario}.json`), JSON.stringify(result, null, 2));
    console.log(
      `${scenario}: ${result.frameSamples.length} frames, ${result.elapsedMs.toFixed(1)} ms`,
    );
  } finally {
    renderer.dispose();
    app.dispose();
  }
}
writeFileSync(resolve(outputDir, "all.json"), JSON.stringify(results, null, 2));
