import type { AppendOnlyLogStore } from "@simon_he/vue-tui/experimental";
import type { TuiMarkdownBlock } from "@simon_he/vue-tui/markdown";
import type { AgentEvent, AgentFixtureExpansion } from "./mock-agent-stream";
import type { Ref } from "vue";
import { ref, shallowRef, triggerRef } from "vue";
import { createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";
import { createMarkdownBlockSource } from "@simon_he/vue-tui/markdown";
import {
  createMockAgentEvents,
  createSyntheticAgentEvent,
  renderBestAgentRichLog,
} from "./mock-agent-stream";
import { markdownTheme } from "./theme";

export type TranscriptMode = "log" | "markdown";

export type TranscriptLink = Readonly<{
  label: string;
  href: string;
  source: "markdown" | "log" | "tool";
}>;

export type TranscriptStats = Readonly<{
  chunks: number;
  userMessages: number;
  toolRuns: number;
  toolErrors: number;
  approxTokens: number;
}>;

export type AgentReplayLog = Readonly<{
  version: 1;
  events: readonly AgentEvent[];
}>;

export type AgentTranscriptStore = Readonly<{
  logStore: AppendOnlyLogStore;
  markdown: Ref<string>;
  markdownBlocks: Ref<readonly TuiMarkdownBlock[]>;
  syncMarkdownBlocks: () => readonly TuiMarkdownBlock[];
  links: Ref<readonly TranscriptLink[]>;
  stats: Ref<TranscriptStats>;
  eventLog: Ref<readonly AgentEvent[]>;
  apply: (event: AgentEvent) => void;
  appendSyntheticChunk: (index: number) => void;
  setFixtureExpansion: (expansion: AgentFixtureExpansion) => void;
  captureReplayLog: () => AgentReplayLog;
  loadReplayLog: (log: AgentReplayLog, eventIndex?: number) => void;
  seed: (count?: number) => void;
  clear: () => void;
}>;

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\]8;;[^\x07]*\x07([^\x1b]*)\x1b\]8;;\x07/g, "$1")
    .replace(/\x1b\[[0-9;]*m/g, "");
}

function addLink(links: Ref<readonly TranscriptLink[]>, link: TranscriptLink): void {
  if (links.value.some((item) => item.href === link.href && item.label === link.label)) return;
  links.value = [...links.value, link].slice(-24);
}

function markdownEscape(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function quoteMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function countApproxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function createAgentReplayLog(events: readonly AgentEvent[]): AgentReplayLog {
  return {
    version: 1,
    events: events.slice(),
  };
}

export function stringifyAgentReplayLog(log: AgentReplayLog): string {
  return JSON.stringify(log);
}

export function parseAgentReplayLog(raw: string): AgentReplayLog {
  const value = JSON.parse(raw) as AgentReplayLog;
  if (value.version !== 1 || !Array.isArray(value.events)) {
    throw new Error("Invalid agent replay log");
  }
  return createAgentReplayLog(value.events);
}

type AgentConsoleProfileVariant = "A" | "B" | "C";
function profileVariant(): AgentConsoleProfileVariant {
  const profileMode =
    (globalThis as any).__AGENT_CONSOLE_PROFILE_MODE__ === true ||
    (globalThis as any).process?.env?.AGENT_CONSOLE_PROFILE_MODE === "1";
  if (!profileMode) return "C";
  const value =
    (globalThis as any).__AGENT_CONSOLE_PROFILE_VARIANT__ ??
    (globalThis as any).process?.env?.AGENT_CONSOLE_PROFILE_VARIANT;
  return value === "A" || value === "B" ? value : "C";
}

export function createAgentTranscriptStore(): AgentTranscriptStore {
  const variant = profileVariant();
  const eagerMarkdown = variant !== "C";
  const copiedEventLog = variant === "A";
  const logStore = createAppendOnlyLogStore({ maxLines: 8_000 });
  const markdownSource = createMarkdownBlockSource({ theme: markdownTheme });
  const markdown = ref("");
  const markdownBlocks = ref<readonly TuiMarkdownBlock[]>(
    eagerMarkdown ? markdownSource.blocks : [],
  );
  let markdownBlocksDirty = variant === "C";
  const links = ref<readonly TranscriptLink[]>([]);
  const stats = ref<TranscriptStats>({
    chunks: 0,
    userMessages: 0,
    toolRuns: 0,
    toolErrors: 0,
    approxTokens: 0,
  });
  let eventLogBacking: AgentEvent[] = [];
  const eventLog = copiedEventLog
    ? ref<readonly AgentEvent[]>(eventLogBacking)
    : shallowRef<readonly AgentEvent[]>(eventLogBacking);
  let assistantOpen = false;
  let toolFenceOpen = false;
  let fixtureExpansion: AgentFixtureExpansion = {
    thinkingExpanded: true,
    toolCallExpanded: true,
  };

  function updateStats(next: Partial<TranscriptStats>): void {
    stats.value = { ...stats.value, ...next };
  }

  function appendMarkdown(text: string): void {
    markdown.value += text;
    markdownSource.appendDelta(text);
    markdownBlocksDirty = true;
    if (eagerMarkdown) syncMarkdownBlocks();
  }

  function finalizeMarkdownBlock(): void {
    markdownSource.finalizeBlock();
    markdownBlocksDirty = true;
    if (eagerMarkdown) syncMarkdownBlocks();
  }

  function syncMarkdownBlocks(): readonly TuiMarkdownBlock[] {
    if (markdownBlocksDirty) {
      markdownBlocks.value = markdownSource.blocks;
      markdownBlocksDirty = false;
    }
    return markdownBlocks.value;
  }

  function closeAssistantLine(): void {
    if (!assistantOpen) return;
    logStore.appendChunk("\n");
    assistantOpen = false;
  }

  function closeToolFence(): void {
    if (!toolFenceOpen) return;
    appendMarkdown("\n```\n\n");
    toolFenceOpen = false;
    finalizeMarkdownBlock();
  }

  function ensureToolFence(name = "tool"): void {
    if (toolFenceOpen) return;
    appendMarkdown(`\n\n\`\`\`txt\n$ ${name}\n`);
    toolFenceOpen = true;
  }

  function resetDerived(): void {
    logStore.clear();
    markdown.value = "";
    markdownSource.clear();
    markdownBlocksDirty = true;
    markdownBlocks.value = eagerMarkdown ? markdownSource.blocks : [];
    links.value = [];
    assistantOpen = false;
    toolFenceOpen = false;
    stats.value = {
      chunks: 0,
      userMessages: 0,
      toolRuns: 0,
      toolErrors: 0,
      approxTokens: 0,
    };
  }

  function toolLogText(event: Extract<AgentEvent, { type: "tool-log" }>): string {
    if (event.richLogIndex == null) return event.text;
    return renderBestAgentRichLog(event.richLogIndex, fixtureExpansion);
  }

  function applyEvent(event: AgentEvent, record: boolean): void {
    if (record) {
      if (copiedEventLog) {
        eventLogBacking = [...eventLogBacking, event];
        eventLog.value = eventLogBacking;
      } else {
        eventLogBacking.push(event);
        triggerRef(eventLog);
      }
    }

    if (event.type === "user") {
      closeAssistantLine();
      closeToolFence();
      logStore.appendLine(`\x1b[30;46m user \x1b[0m ${event.text}`);
      finalizeMarkdownBlock();
      appendMarkdown(
        `\n\n${quoteMarkdown(`User ${markdownEscape(event.text)}`)}\n\n### Assistant\n\n`,
      );
      finalizeMarkdownBlock();
      updateStats({
        userMessages: stats.value.userMessages + 1,
        approxTokens: stats.value.approxTokens + countApproxTokens(event.text),
      });
      return;
    }

    if (event.type === "status") {
      closeAssistantLine();
      closeToolFence();
      logStore.appendLine(`\x1b[30;46m status \x1b[0m ${event.state}`);
      appendMarkdown(`\n\n_Status: ${event.state}_\n\n`);
      finalizeMarkdownBlock();
      return;
    }

    if (event.type === "assistant-delta") {
      closeToolFence();
      if (!assistantOpen) {
        logStore.appendChunk("\x1b[34massistant\x1b[0m ");
        assistantOpen = true;
      }
      logStore.appendChunk(event.text);
      appendMarkdown(event.text);
      updateStats({
        chunks: stats.value.chunks + 1,
        approxTokens: stats.value.approxTokens + countApproxTokens(event.text),
      });
      addLink(links, {
        label: "trace docs",
        href: "https://example.com/agent-console/trace",
        source: "markdown",
      });
      return;
    }

    if (event.type === "tool-start") {
      closeAssistantLine();
      finalizeMarkdownBlock();
      ensureToolFence(event.name);
      logStore.appendLine(`\x1b[30;45m tool_call \x1b[0m ${event.name}`);
      updateStats({ toolRuns: stats.value.toolRuns + 1 });
      return;
    }

    if (event.type === "tool-log") {
      closeAssistantLine();
      ensureToolFence("tool-log");
      const text = toolLogText(event);
      logStore.appendChunk(text);
      appendMarkdown(stripAnsi(text));
      const linkMatch = text.match(/https:\/\/[^\s\x07]+/);
      if (linkMatch) {
        addLink(links, {
          label: linkMatch[0].split("/").pop() ?? linkMatch[0],
          href: linkMatch[0],
          source: "tool",
        });
      }
      updateStats({ chunks: stats.value.chunks + 1 });
      return;
    }

    closeAssistantLine();
    closeToolFence();
    logStore.appendLine(
      event.status === "ok" ? "\x1b[32mtool:end ok\x1b[0m" : "\x1b[31mtool:end error\x1b[0m",
    );
    if (event.status === "error") updateStats({ toolErrors: stats.value.toolErrors + 1 });
  }

  function apply(event: AgentEvent): void {
    applyEvent(event, true);
  }

  function clear(): void {
    resetDerived();
    eventLogBacking = [];
    eventLog.value = eventLogBacking;
  }

  function seed(count = 28): void {
    clear();
    for (const event of createMockAgentEvents(count)) apply(event);
  }

  function loadReplayLog(log: AgentReplayLog, eventIndex = log.events.length): void {
    clear();
    const end = Math.max(0, Math.min(eventIndex, log.events.length));
    for (const event of log.events.slice(0, end)) apply(event);
  }

  function setFixtureExpansion(expansion: AgentFixtureExpansion): void {
    fixtureExpansion = expansion;
    const events = eventLog.value;
    resetDerived();
    for (const event of events) applyEvent(event, false);
    eventLog.value = events;
  }

  return {
    logStore,
    markdown,
    markdownBlocks,
    syncMarkdownBlocks,
    links,
    stats,
    eventLog,
    apply,
    appendSyntheticChunk(index) {
      apply(createSyntheticAgentEvent(index));
    },
    setFixtureExpansion,
    captureReplayLog() {
      return createAgentReplayLog(eventLog.value);
    },
    loadReplayLog,
    seed,
    clear,
  };
}
