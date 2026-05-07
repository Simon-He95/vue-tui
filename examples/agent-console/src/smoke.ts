import type { AgentConsoleApi } from "./AgentConsoleSurface";
import type { CliEventManager, TerminalApp } from "@simon_he/vue-tui";
import assert from "node:assert/strict";
import { nextTick } from "vue";
import { createTerminalApp } from "@simon_he/vue-tui";
import { AgentConsoleSurface, AGENT_CONSOLE_LAYOUT } from "./AgentConsoleSurface";

type ManualRaf = Readonly<{
  pending: () => number;
  flush: (time?: number) => number;
  restore: () => void;
}>;

function installManualRaf(): ManualRaf {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const next = ++id;
    callbacks.set(next, cb);
    return next;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((rafId: number) => {
    callbacks.delete(rafId);
  }) as typeof cancelAnimationFrame;

  return {
    pending: () => callbacks.size,
    flush(time = 0) {
      const pending = Array.from(callbacks.entries());
      callbacks.clear();
      for (const [, cb] of pending) cb(time);
      return pending.length;
    },
    restore() {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

function rowText(app: TerminalApp, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function transcriptHasStyledBackground(app: TerminalApp): boolean {
  for (
    let y = AGENT_CONSOLE_LAYOUT.transcript.y;
    y < AGENT_CONSOLE_LAYOUT.transcript.y + AGENT_CONSOLE_LAYOUT.transcript.h;
    y++
  ) {
    for (const cell of app.terminal.getRow(y)) {
      const bg = cell.style?.bg;
      if (bg && bg !== "black") return true;
    }
  }
  return false;
}

function dispatchWheelBurst(
  events: Pick<CliEventManager, "dispatch">,
  count: number,
  deltaY: number,
): void {
  for (let i = 0; i < count; i++) {
    events.dispatch({
      type: "wheel",
      cellX: AGENT_CONSOLE_LAYOUT.transcript.x + 2,
      cellY: AGENT_CONSOLE_LAYOUT.transcript.y + 2,
      deltaY,
      time: 1_000 + i,
    });
  }
}

async function flushFrame(raf: ManualRaf): Promise<void> {
  raf.flush();
  await nextTick();
}

async function dispatchText(app: TerminalApp, text: string): Promise<void> {
  app.events.dispatch({
    type: "pointerdown",
    cellX: AGENT_CONSOLE_LAYOUT.input.x + 3,
    cellY: AGENT_CONSOLE_LAYOUT.input.y + 2,
    button: 0,
    buttons: 1,
  });
  await nextTick();

  for (const ch of text) {
    app.events.dispatch({ type: "keydown", key: ch, code: `Key${ch.toUpperCase()}` } as any);
    await nextTick();
  }
}

async function settleSearch(api: AgentConsoleApi, app: TerminalApp, raf: ManualRaf): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    app.scheduler.flushNow();
    await flushFrame(raf);
    if (api.searchState.value.matchCount > 0) return;
  }
}

function maxSampleValue(
  samples: readonly { dirtyRows?: number | null; paintedNodes?: number }[],
  key: "dirtyRows" | "paintedNodes",
): number {
  let max = 0;
  for (const sample of samples) {
    const value = sample[key];
    if (typeof value === "number" && Number.isFinite(value)) max = Math.max(max, value);
  }
  return max;
}

const raf = installManualRaf();
let api: AgentConsoleApi | null = null;
const app = createTerminalApp({
  cols: AGENT_CONSOLE_LAYOUT.cols,
  rows: AGENT_CONSOLE_LAYOUT.rows,
  component: AgentConsoleSurface,
  props: {
    onReady(next: AgentConsoleApi) {
      api = next;
    },
  },
  defaultStyle: { fg: "whiteBright", bg: "black" },
});

try {
  app.mount();
  await nextTick();
  app.scheduler.flushNow();
  assert.ok(api, "agent console API did not mount");

  api.seed(60);
  await nextTick();
  app.scheduler.flushNow();
  api.appendSyntheticChunk(44);
  await nextTick();
  app.scheduler.flushNow();
  api.jumpToBottom();
  await nextTick();
  app.scheduler.flushNow();
  const logHasStyledBackground = transcriptHasStyledBackground(app);
  const richTranscriptRows = api.getTranscriptRows().join("\n");
  const bestAgentFixtureRowsRendered =
    richTranscriptRows.includes("Thinking ▾") &&
    richTranscriptRows.includes("▾ ● Run 3 commands") &&
    richTranscriptRows.includes("Changed 3 files") &&
    richTranscriptRows.includes("████████░░");
  api.clearFramePerf();

  dispatchWheelBurst(app.events, 100, -1);
  assert.equal(raf.pending(), 1);
  await flushFrame(raf);
  const detachedTop = api.metrics.value?.scrollTop ?? -1;

  await dispatchText(app, "stable input");
  const inputBefore = api.getInputValue();
  await api.appendBurst(1_000);
  await flushFrame(raf);
  const inputAfter = api.getInputValue();
  const afterBurstTop = api.metrics.value?.scrollTop ?? -1;
  const transcriptRows = api.getTranscriptRows();
  const scenarioSamples = api.getFramePerfSamples();

  api.openSearch("dirtyRows");
  await settleSearch(api, app, raf);

  api.focusNextLink();
  api.openLinks();
  await nextTick();
  app.scheduler.flushNow();
  const searchMatches = api.searchState.value.matchCount;
  const visibleLinks = api.getVisibleLinks().length;

  api.openPalette();
  await nextTick();
  app.scheduler.flushNow();
  api.clearFramePerf();
  api.toggleThinking();
  api.toggleToolCall();
  await api.appendBurst(200);
  dispatchWheelBurst(app.events, 40, 1);
  await flushFrame(raf);
  const overlaySamples = api.getFramePerfSamples();
  const overlayInputStable = api.getInputValue() === inputAfter;

  api.closeOverlay();
  await nextTick();
  app.scheduler.flushNow();
  const overlayChrome = api.getChromeRows().join("\n");
  api.mode.value = "markdown";
  api.seed(18);
  await nextTick();
  app.scheduler.flushNow();
  api.jumpToBottom();
  await nextTick();
  app.scheduler.flushNow();
  const markdownHasStyledBackground = transcriptHasStyledBackground(app);

  const output = {
    chunks: 1000,
    frames: scenarioSamples.length,
    maxDirtyRows: maxSampleValue(scenarioSamples, "dirtyRows"),
    maxPaintedNodes: maxSampleValue(scenarioSamples, "paintedNodes"),
    droppedUpdates: scenarioSamples.reduce((total, sample) => total + sample.droppedUpdates, 0),
    inputStable: inputBefore === "stable input" && inputAfter === inputBefore,
    scrollDetachedPreserved:
      detachedTop >= 0 && afterBurstTop >= 0 && afterBurstTop === detachedTop,
    searchMatches,
    visibleLinks,
    logHasStyledBackground,
    markdownHasStyledBackground,
    overlayMaxDirtyRows: maxSampleValue(overlaySamples, "dirtyRows"),
    overlayMaxPaintedNodes: maxSampleValue(overlaySamples, "paintedNodes"),
    overlayInputStable,
    expandableRowsRendered:
      overlayChrome.includes("▸ Thinking") && overlayChrome.includes("▸ Run 3"),
    bestAgentFixtureRowsRendered,
    firstTranscriptRow: rowText(app, AGENT_CONSOLE_LAYOUT.transcript.y),
    lastTranscriptRow: transcriptRows[transcriptRows.length - 1] ?? "",
  };

  assert.equal(output.inputStable, true);
  assert.equal(output.scrollDetachedPreserved, true);
  assert.ok(output.droppedUpdates > 0, "expected burst streaming to coalesce updates");
  assert.ok(output.searchMatches > 0, "expected dirtyRows search matches");
  assert.equal(output.logHasStyledBackground, true);
  assert.equal(output.markdownHasStyledBackground, true);
  assert.equal(output.overlayInputStable, true);
  assert.equal(output.expandableRowsRendered, true);
  assert.equal(output.bestAgentFixtureRowsRendered, true);
  assert.ok(output.overlayMaxDirtyRows <= AGENT_CONSOLE_LAYOUT.rows);
  assert.ok(output.overlayMaxPaintedNodes <= AGENT_CONSOLE_LAYOUT.rows);

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  app.dispose();
  raf.restore();
}
