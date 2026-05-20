import type { AgentConsoleApi } from "./AgentConsoleSurface";
import type { CliEventManager, TerminalApp } from "@simon_he/vue-tui/cli";
import assert from "node:assert/strict";
import { nextTick } from "vue";
import { createTerminalApp } from "@simon_he/vue-tui/cli";
import { AgentConsoleSurface, AGENT_CONSOLE_LAYOUT } from "./AgentConsoleSurface";
import { parseAgentReplayLog, stringifyAgentReplayLog } from "./transcript-store";

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

function cellStyle(app: TerminalApp, x: number, y: number): Record<string, unknown> {
  return app.terminal.getRow(y)[x]?.style ?? {};
}

function rowsText(app: TerminalApp): string {
  return Array.from({ length: app.terminal.size().rows }, (_, y) => rowText(app, y)).join("\n");
}

function isAgentConsoleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://example.com" &&
      (url.pathname === "/agent-console" || url.pathname.startsWith("/agent-console/"))
    );
  } catch {
    return false;
  }
}

function rowHasAgentConsoleUrl(row: string): boolean {
  return row.split(/\s+/).some(isAgentConsoleUrl);
}

function inputRowsText(app: TerminalApp): string {
  return Array.from({ length: AGENT_CONSOLE_LAYOUT.input.h }, (_, index) =>
    rowText(app, AGENT_CONSOLE_LAYOUT.input.y + index),
  ).join("\n");
}

function inputBorderVisible(app: TerminalApp): boolean {
  return rowText(app, AGENT_CONSOLE_LAYOUT.input.y).startsWith("┌");
}

function boxBorderClosed(
  app: TerminalApp,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const lines = app.terminal.snapshot().lines;
  const { x, y, w, h } = rect;
  if (lines[y]?.[x] !== "┌") return false;
  if (lines[y]?.[x + w - 1] !== "┐") return false;
  if (lines[y + h - 1]?.[x] !== "└") return false;
  if (lines[y + h - 1]?.[x + w - 1] !== "┘") return false;

  for (let yy = y + 1; yy < y + h - 1; yy++) {
    if (lines[yy]?.[x] !== "│") return false;
    if (lines[yy]?.[x + w - 1] !== "│") return false;
  }

  for (let xx = x + 1; xx < x + w - 1; xx++) {
    if (lines[y + h - 1]?.[xx] !== "─") return false;
  }

  return true;
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

function dispatchWheel(
  events: Pick<CliEventManager, "dispatch">,
  deltaY: number,
  time: number,
): void {
  events.dispatch({
    type: "wheel",
    cellX: AGENT_CONSOLE_LAYOUT.transcript.x + 2,
    cellY: AGENT_CONSOLE_LAYOUT.transcript.y + 2,
    deltaY,
    time,
  });
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

async function dispatchKey(app: TerminalApp, key: string, code = key): Promise<void> {
  app.events.dispatch({ type: "keydown", key, code } as any);
  await nextTick();
}

async function clickCell(app: TerminalApp, x: number, y: number): Promise<void> {
  app.events.dispatch({
    type: "pointerdown",
    cellX: x,
    cellY: y,
    button: 0,
    buttons: 1,
  });
  await nextTick();
  app.scheduler.flushNow();
  app.events.dispatch({
    type: "pointerup",
    cellX: x,
    cellY: y,
    button: 0,
    buttons: 0,
  });
  await nextTick();
  app.scheduler.flushNow();
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
  const changedFilesBoxRows = richTranscriptRows.split("\n").filter((row) => {
    return (
      row.includes("╭") ||
      row.includes("╰") ||
      row.includes("│ Changed 3 files") ||
      row.includes("│ src/mock-agent-stream.ts")
    );
  });
  const bestAgentChangedFilesBoxClosed = changedFilesBoxRows.some((_, index) => {
    const block = changedFilesBoxRows.slice(index, index + 4);
    return (
      block.length === 4 &&
      new Set(block.map((row) => row.length)).size === 1 &&
      block[0]?.endsWith("╮") === true &&
      block[1]?.endsWith("│") === true &&
      block[2]?.endsWith("│") === true &&
      block[3]?.endsWith("╯") === true
    );
  });
  const chromeButtonUnderlineFollowsText =
    cellStyle(app, 83, 26).underline === true &&
    cellStyle(app, 94, 26).underline !== true &&
    cellStyle(app, 101, 26).underline === true &&
    cellStyle(app, 107, 26).underline !== true &&
    cellStyle(app, 111, 26).underline === true &&
    cellStyle(app, 116, 26).underline !== true &&
    cellStyle(app, 98, 27).underline === true &&
    cellStyle(app, 111, 27).underline !== true;

  await clickCell(app, 69, 27);
  const clickedThinkingCollapsedRows = api.getTranscriptRows().join("\n");
  const thinkingClickCollapsedTranscript =
    clickedThinkingCollapsedRows.includes("Thinking ▸") &&
    !clickedThinkingCollapsedRows.includes("Now I have a good understanding");
  await clickCell(app, 69, 27);
  await clickCell(app, 84, 27);
  const clickedToolCollapsedRows = api.getTranscriptRows().join("\n");
  const toolCallClickCollapsedTranscript =
    clickedToolCollapsedRows.includes("▸ ● Run 3 commands") &&
    !clickedToolCollapsedRows.includes("Changed 3 files");
  await clickCell(app, 84, 27);

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
  const inputStillVisible = inputBorderVisible(app) && inputRowsText(app).includes("stable input");
  const afterBurstTop = api.metrics.value?.scrollTop ?? -1;
  const lineWheelTops: number[] = [];
  for (let i = 0; i < 8; i++) {
    const time = 2_000 + i * 80;
    dispatchWheel(app.events, 1, time);
    await flushFrame(raf);
    lineWheelTops.push(api.metrics.value?.scrollTop ?? -1);
    dispatchWheel(app.events, -1, time + 40);
    await flushFrame(raf);
    lineWheelTops.push(api.metrics.value?.scrollTop ?? -1);
  }
  const lineWheelReversalObserved = lineWheelTops.some((top, index) => {
    return index > 0 && top >= 0 && top < (lineWheelTops[index - 1] ?? -1);
  });
  const fastWheelStart = api.metrics.value?.scrollTop ?? -1;
  for (let i = 0; i < 6; i++) {
    dispatchWheel(app.events, 1, 4_000 + i * 10);
    await flushFrame(raf);
  }
  const fastWheelEnd = api.metrics.value?.scrollTop ?? -1;
  const fastWheelDistance =
    fastWheelStart >= 0 && fastWheelEnd >= 0 ? fastWheelEnd - fastWheelStart : 0;
  const transcriptRows = api.getTranscriptRows();
  const scenarioSamples = api.getFramePerfSamples();

  await dispatchKey(app, "Enter");
  app.scheduler.flushNow();
  const inputAfterSubmit = api.getInputValue();
  const submittedTranscriptIncludesInput = api
    .getTranscriptRows()
    .join("\n")
    .includes("stable input");

  api.openSearch("dirtyRows");
  await settleSearch(api, app, raf);

  api.focusNextLink();
  api.openLinks();
  await nextTick();
  app.scheduler.flushNow();
  const linkOverlayRows = Array.from({ length: app.terminal.size().rows }, (_, y) =>
    rowText(app, y),
  );
  const firstLinkY = linkOverlayRows.findIndex((row) => {
    return row.includes("1. [log]") && rowHasAgentConsoleUrl(row);
  });
  const firstLinkRow = firstLinkY >= 0 ? (linkOverlayRows[firstLinkY] ?? "") : "";
  const firstLinkStart = firstLinkRow.indexOf("1. [log]");
  const afterFirstLinkTextX = Math.min(firstLinkRow.length, app.terminal.size().cols - 1);
  const linksUnderlineFollowsText =
    firstLinkY >= 0 &&
    firstLinkStart >= 0 &&
    cellStyle(app, firstLinkStart, firstLinkY).underline === true &&
    cellStyle(app, afterFirstLinkTextX, firstLinkY).underline !== true;
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
  const overlayInputStable = api.getInputValue() === inputAfterSubmit;
  const overlayVisibleBeforeEscape = rowsText(app).includes("Command Palette");
  app.terminal.resize(AGENT_CONSOLE_LAYOUT.cols + 8, AGENT_CONSOLE_LAYOUT.rows + 2);
  await nextTick();
  app.scheduler.flushNow();
  const resizedSize = app.terminal.size();
  const resizeMetrics = api.metrics.value;
  const scrollClampedAfterResize =
    resizeMetrics != null &&
    resizeMetrics.scrollTop >= 0 &&
    resizeMetrics.scrollTop <= resizeMetrics.maxScrollTop;
  await dispatchKey(app, "Escape");
  app.scheduler.flushNow();
  const overlayClosedAfterResize =
    overlayVisibleBeforeEscape && !rowsText(app).includes("Command Palette");
  const inputStillVisibleAfterResize = inputBorderVisible(app);
  const overlayChrome = api.getChromeRows().join("\n");
  const toolCallDotStyle = cellStyle(app, 70, 29);
  const toolCallTitleStyle = cellStyle(app, 72, 29);
  const bestAgentToolCallChrome =
    overlayChrome.includes("▸ ● Run 3 commands") &&
    toolCallDotStyle.fg === "white" &&
    toolCallDotStyle.dim === true &&
    toolCallTitleStyle.fg === "yellowBright" &&
    toolCallTitleStyle.bg === "black";
  const runtimeChromeBorderClosed = boxBorderClosed(app, AGENT_CONSOLE_LAYOUT.chrome);
  const replayLog = api.captureReplayLog();
  const replayPayload = stringifyAgentReplayLog(replayLog);
  const parsedReplayLog = parseAgentReplayLog(replayPayload);
  const replaySeekIndex = Math.max(1, Math.floor(parsedReplayLog.events.length / 3));
  api.loadReplayLog(parsedReplayLog);
  await nextTick();
  app.scheduler.flushNow();
  await flushFrame(raf);
  const replayFinalSnapshot = api.getTerminalSnapshot().join("\n");
  const replayFullLoaded =
    api.replayCursor.value === parsedReplayLog.events.length &&
    api.replayTotal.value === parsedReplayLog.events.length;
  api.seekReplay(replaySeekIndex);
  await nextTick();
  app.scheduler.flushNow();
  await flushFrame(raf);
  const replaySeekSnapshot = api.getTerminalSnapshot().join("\n");
  const replaySeekLoaded =
    api.replayCursor.value === replaySeekIndex &&
    api.captureReplayLog().events.length === replaySeekIndex;
  api.seekReplay(parsedReplayLog.events.length);
  await nextTick();
  app.scheduler.flushNow();
  await flushFrame(raf);
  const replayRestoredSnapshot = api.getTerminalSnapshot().join("\n");
  const replayRestored =
    api.replayCursor.value === parsedReplayLog.events.length &&
    replayRestoredSnapshot.includes("dirtyRows");
  api.mode.value = "markdown";
  api.seed(18);
  await nextTick();
  app.scheduler.flushNow();
  api.jumpToBottom();
  await nextTick();
  app.scheduler.flushNow();
  const markdownHasStyledBackground = transcriptHasStyledBackground(app);

  api.mode.value = "log";
  api.seed(18);
  await nextTick();
  app.scheduler.flushNow();
  api.jumpToBottom();
  await nextTick();
  app.scheduler.flushNow();

  api.openPalette("copy");
  await nextTick();
  app.scheduler.flushNow();
  const paletteFilterMatchesCopy = api.getCommandRows()[0]?.startsWith("/copy") === true;
  api.closeOverlay();
  await nextTick();
  app.scheduler.flushNow();

  api.openPalette("no-such-command");
  await nextTick();
  app.scheduler.flushNow();
  const paletteNoResultBeforeEnter = api.getCommandRows().length === 0;
  await dispatchKey(app, "Enter");
  app.scheduler.flushNow();
  const paletteNoResultEnterSafe = paletteNoResultBeforeEnter && api.getCommandRows().length === 0;
  api.closeOverlay();
  await nextTick();
  app.scheduler.flushNow();

  api.runCommand("/copy");
  app.scheduler.flushNow();
  const slashCopyWorked = api.getCopiedText().length > 0;

  api.runCommand("/toggle markdown");
  app.scheduler.flushNow();
  const slashToggleMarkdown = api.mode.value === "markdown";

  api.runCommand("/toggle log");
  app.scheduler.flushNow();
  const slashToggleLog = api.mode.value === "log";

  api.runCommand("/search dirtyRows");
  await settleSearch(api, app, raf);
  const slashSearchWorked =
    api.searchQuery.value === "dirtyRows" && api.searchState.value.matchCount > 0;
  api.closeOverlay();
  await nextTick();
  app.scheduler.flushNow();

  dispatchWheelBurst(app.events, 8, -1);
  await flushFrame(raf);
  api.runCommand("/jump bottom");
  app.scheduler.flushNow();
  const slashJumpBottom = api.metrics.value?.atBottom === true;

  api.runCommand("/clear");
  app.scheduler.flushNow();
  await nextTick();
  await flushFrame(raf);
  const slashClearWorked = api.getTranscriptRows().join("").trim() === "";
  const slashClearReplayReset = api.replayCursor.value === 0 && api.replayTotal.value === 0;

  const output = {
    chunks: 1000,
    frames: scenarioSamples.length,
    maxDirtyRows: maxSampleValue(scenarioSamples, "dirtyRows"),
    maxPaintedNodes: maxSampleValue(scenarioSamples, "paintedNodes"),
    droppedUpdates: scenarioSamples.reduce((total, sample) => total + sample.droppedUpdates, 0),
    inputStable: inputBefore === "stable input" && inputAfter === inputBefore,
    inputSubmitted: inputAfterSubmit === "" && submittedTranscriptIncludesInput,
    inputStillVisible,
    scrollDetachedPreserved:
      detachedTop >= 0 && afterBurstTop >= 0 && afterBurstTop === detachedTop,
    resized:
      resizedSize.cols === AGENT_CONSOLE_LAYOUT.cols + 8 &&
      resizedSize.rows === AGENT_CONSOLE_LAYOUT.rows + 2,
    scrollClampedAfterResize,
    inputStillVisibleAfterResize,
    overlayClosedAfterResize,
    searchMatches,
    visibleLinks,
    logHasStyledBackground,
    markdownHasStyledBackground,
    paletteFilterMatchesCopy,
    paletteNoResultEnterSafe,
    slashCopyWorked,
    slashToggleMarkdown,
    slashToggleLog,
    slashSearchWorked,
    slashJumpBottom,
    slashClearWorked,
    slashClearReplayReset,
    overlayMaxDirtyRows: maxSampleValue(overlaySamples, "dirtyRows"),
    overlayMaxPaintedNodes: maxSampleValue(overlaySamples, "paintedNodes"),
    overlayInputStable,
    replayEvents: parsedReplayLog.events.length,
    replayFullLoaded,
    replaySeekLoaded,
    replaySnapshotChanged: replaySeekSnapshot !== replayFinalSnapshot,
    replayRestored,
    replayFinalSnapshotRows: replayFinalSnapshot.split("\n").length,
    terminalRows: resizedSize.rows,
    expandableRowsRendered:
      overlayChrome.includes("▸ Thinking") && overlayChrome.includes("▸ ● Run 3 commands"),
    bestAgentToolCallChrome,
    runtimeChromeBorderClosed,
    bestAgentChangedFilesBoxClosed,
    chromeButtonUnderlineFollowsText,
    thinkingClickCollapsedTranscript,
    toolCallClickCollapsedTranscript,
    lineWheelReversalObserved,
    fastWheelDistance,
    linksUnderlineFollowsText,
    bestAgentFixtureRowsRendered,
    firstTranscriptRow: rowText(app, AGENT_CONSOLE_LAYOUT.transcript.y),
    lastTranscriptRow: transcriptRows[transcriptRows.length - 1] ?? "",
  };

  assert.equal(output.inputStable, true);
  assert.equal(output.inputSubmitted, true);
  assert.equal(output.inputStillVisible, true);
  assert.equal(output.scrollDetachedPreserved, true);
  assert.equal(output.resized, true);
  assert.equal(output.scrollClampedAfterResize, true);
  assert.equal(output.inputStillVisibleAfterResize, true);
  assert.equal(output.overlayClosedAfterResize, true);
  assert.ok(output.maxDirtyRows <= AGENT_CONSOLE_LAYOUT.rows);
  assert.ok(output.droppedUpdates > 0, "expected burst streaming to coalesce updates");
  assert.ok(output.searchMatches > 0, "expected dirtyRows search matches");
  assert.equal(output.logHasStyledBackground, true);
  assert.equal(output.markdownHasStyledBackground, true);
  assert.equal(output.paletteFilterMatchesCopy, true);
  assert.equal(output.paletteNoResultEnterSafe, true);
  assert.equal(output.slashCopyWorked, true);
  assert.equal(output.slashToggleMarkdown, true);
  assert.equal(output.slashToggleLog, true);
  assert.equal(output.slashSearchWorked, true);
  assert.equal(output.slashJumpBottom, true);
  assert.equal(output.slashClearWorked, true);
  assert.equal(output.slashClearReplayReset, true);
  assert.equal(output.overlayInputStable, true);
  assert.ok(output.replayEvents > 0, "expected replay event log");
  assert.equal(output.replayFullLoaded, true);
  assert.equal(output.replaySeekLoaded, true);
  assert.equal(output.replaySnapshotChanged, true);
  assert.equal(output.replayRestored, true);
  assert.equal(output.replayFinalSnapshotRows, output.terminalRows);
  assert.equal(output.expandableRowsRendered, true);
  assert.equal(output.bestAgentToolCallChrome, true);
  assert.equal(output.runtimeChromeBorderClosed, true);
  assert.equal(output.bestAgentChangedFilesBoxClosed, true);
  assert.equal(output.chromeButtonUnderlineFollowsText, true);
  assert.equal(output.thinkingClickCollapsedTranscript, true);
  assert.equal(output.toolCallClickCollapsedTranscript, true);
  assert.equal(output.lineWheelReversalObserved, true);
  assert.ok(output.fastWheelDistance >= 6, "expected fast wheel burst to cover line ticks");
  assert.equal(output.linksUnderlineFollowsText, true);
  assert.equal(output.bestAgentFixtureRowsRendered, true);
  assert.ok(output.overlayMaxDirtyRows <= AGENT_CONSOLE_LAYOUT.rows);
  assert.ok(output.overlayMaxPaintedNodes <= AGENT_CONSOLE_LAYOUT.rows);

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  app.dispose();
  raf.restore();
}
