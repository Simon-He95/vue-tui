export type AgentEvent =
  | { type: "user"; text: string }
  | { type: "assistant-delta"; text: string }
  | { type: "tool-start"; name: string }
  | { type: "tool-log"; text: string }
  | { type: "tool-end"; status: "ok" | "error" };

export type MockAgentStream = Readonly<{
  next: () => AgentEvent;
  reset: () => void;
}>;

const assistantTokens = [
  "Reading the current terminal state ",
  "before touching the renderer. ",
  "The transcript is updating as small deltas, ",
  "while the input plane keeps focus and `dirtyRows` stays bounded. ",
  "\n\n",
  "```ts\n",
  "type ConsoleChunk = { index: number; text: string };\n",
  'const highlight = { fg: "greenBright", bg: "blue" };\n',
  "const append = (chunk: ConsoleChunk) => transcript.push(chunk.text);\n",
  "```\n\n",
  "Useful links stay keyboard reachable: ",
  "[trace docs](https://example.com/agent-console/trace) ",
  "and [runbook](https://example.com/agent-console/runbook). ",
  "\n\n",
];

function osc8(href: string, text: string): string {
  return `\x1b]8;;${href}\x07${text}\x1b]8;;\x07`;
}

function bestAgentRichLog(index: number): string {
  const href = `https://example.com/agent-console/rich/${index}`;
  return [
    "\x1b[35;1mThinking ▸\x1b[0m",
    "\x1b[35;1mThinking ▾\x1b[0m",
    "  │ Now I have a good understanding of the transcript dirty cases.",
    "  │ Background rows, markdown spans, and overlay planes are changing together.",
    "",
    "\x1b[33;1m▾ ● Run 3 commands\x1b[0m",
    "  in:",
    "    \x1b[37;44m$ bash -lc rg --files examples/agent-console | head\x1b[0m",
    "  out:",
    "    examples/agent-console/src/App.vue",
    "    examples/agent-console/src/mock-agent-stream.ts",
    "    examples/agent-console/src/transcript-store.ts",
    "  usage 12.4k tok [████████░░] 78%",
    "  ╭────────────────────────────────────────────╮",
    "  │ Changed 3 files                 +148  -23 │",
    "  │ src/mock-agent-stream.ts          +36   -2 │",
    "  ╰────────────────────────────────────────────╯",
    `  ${osc8(href, `rich-${index}`)}`,
    "\x1b[30;46m user bubble \x1b[0m \x1b[37;44m code-bg dirtyRows=24 \x1b[0m",
    "",
  ].join("\n");
}

export function createSyntheticAgentEvent(index: number): AgentEvent {
  if (index % 43 === 0) return { type: "tool-start", name: `inspect-${index % 7}` };
  if (index % 43 === 10) return { type: "tool-end", status: index % 2 === 0 ? "ok" : "error" };
  if (index % 37 === 7) {
    return { type: "tool-log", text: bestAgentRichLog(index) };
  }
  if (index % 5 === 0) {
    const level = index % 20 === 0 ? "\x1b[31mERROR\x1b[0m" : "\x1b[32mINFO\x1b[0m";
    const href = `https://example.com/agent-console/log/${index}`;
    return {
      type: "tool-log",
      text: `${level} ${osc8(href, `chunk-${index}`)} dirtyRows=${index % 24} cache=hit\n`,
    };
  }
  return {
    type: "assistant-delta",
    text: assistantTokens[index % assistantTokens.length] ?? "stream ",
  };
}

export function createMockAgentEvents(count = 240): AgentEvent[] {
  const events: AgentEvent[] = [
    {
      type: "user",
      text: "Run the agent console smoke scenario and keep the input responsive.",
    },
  ];
  for (let i = 0; i < count; i++) events.push(createSyntheticAgentEvent(i));
  const tailRichIndex = count + ((7 - (count % 37) + 37) % 37);
  events.push(createSyntheticAgentEvent(tailRichIndex));
  events.push({ type: "assistant-delta", text: "\nDone. The console stayed interactive.\n" });
  return events;
}

export function createMockAgentStream(count = 240): MockAgentStream {
  let index = 0;
  let events = createMockAgentEvents(count);
  return {
    next() {
      const event = events[index] ?? createSyntheticAgentEvent(index);
      index++;
      return event;
    },
    reset() {
      index = 0;
      events = createMockAgentEvents(count);
    },
  };
}
