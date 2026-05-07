import type { AppendOnlyLogStore } from "@simon_he/vue-tui/experimental";
import type { TuiMarkdownBlock } from "@simon_he/vue-tui/markdown";
import type { AgentEvent } from "./mock-agent-stream";
import type { Ref } from "vue";
import { ref } from "vue";
import { createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";
import { createMarkdownBlockSource } from "@simon_he/vue-tui/markdown";
import { createMockAgentEvents, createSyntheticAgentEvent } from "./mock-agent-stream";
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
  links: Ref<readonly TranscriptLink[]>;
  stats: Ref<TranscriptStats>;
  eventLog: Ref<readonly AgentEvent[]>;
  apply: (event: AgentEvent) => void;
  appendSyntheticChunk: (index: number) => void;
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

export function createAgentTranscriptStore(): AgentTranscriptStore {
  const logStore = createAppendOnlyLogStore({ maxLines: 8_000 });
  const markdownSource = createMarkdownBlockSource({ theme: markdownTheme });
  const markdown = ref("");
  const markdownBlocks = ref<readonly TuiMarkdownBlock[]>(markdownSource.blocks);
  const links = ref<readonly TranscriptLink[]>([]);
  const stats = ref<TranscriptStats>({
    chunks: 0,
    userMessages: 0,
    toolRuns: 0,
    toolErrors: 0,
    approxTokens: 0,
  });
  const eventLog = ref<readonly AgentEvent[]>([]);
  let assistantOpen = false;
  let toolFenceOpen = false;

  function updateStats(next: Partial<TranscriptStats>): void {
    stats.value = { ...stats.value, ...next };
  }

  function appendMarkdown(text: string): void {
    markdown.value += text;
    markdownSource.appendDelta(text);
    markdownBlocks.value = markdownSource.blocks;
  }

  function finalizeMarkdownBlock(): void {
    markdownSource.finalizeBlock();
    markdownBlocks.value = markdownSource.blocks;
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

  function apply(event: AgentEvent): void {
    eventLog.value = [...eventLog.value, event];

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
      logStore.appendChunk(event.text);
      appendMarkdown(stripAnsi(event.text));
      const linkMatch = event.text.match(/https:\/\/[^\s\x07]+/);
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

  function clear(): void {
    logStore.clear();
    markdown.value = "";
    markdownSource.clear();
    markdownBlocks.value = markdownSource.blocks;
    links.value = [];
    eventLog.value = [];
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

  function seed(count = 28): void {
    clear();
    for (const event of createMockAgentEvents(count)) apply(event);
  }

  function loadReplayLog(log: AgentReplayLog, eventIndex = log.events.length): void {
    clear();
    const end = Math.max(0, Math.min(eventIndex, log.events.length));
    for (const event of log.events.slice(0, end)) apply(event);
  }

  return {
    logStore,
    markdown,
    markdownBlocks,
    links,
    stats,
    eventLog,
    apply,
    appendSyntheticChunk(index) {
      apply(createSyntheticAgentEvent(index));
    },
    captureReplayLog() {
      return createAgentReplayLog(eventLog.value);
    },
    loadReplayLog,
    seed,
    clear,
  };
}
