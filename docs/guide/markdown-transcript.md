---
title: Markdown Transcript UI for Vue
description: Render streaming markdown transcripts in terminal-style Vue UIs with TVirtualMarkdown, markdown block sources, links, code blocks, and agent output.
---

# Markdown Transcript UI for Vue

Vue TUI's markdown entrypoint renders markdown inside terminal-style Vue interfaces. It supports static markdown, streaming content, virtualized markdown rows, terminal cell layout, styled inline spans, code blocks, and link metadata.

Use it for AI agent transcripts, chat logs, tool output summaries, documentation previews, and terminal dashboards that need markdown without leaving the terminal UI surface.

## Install And Import

```bash
pnpm add @simon_he/vue-tui vue
```

```ts
import { TVirtualMarkdown, createMarkdownBlockSource } from "@simon_he/vue-tui/markdown";
```

`TVirtualMarkdown` is public API. Agent-specific transcript chrome remains available through `@simon_he/vue-tui/agent`.

## Static Markdown

````vue
<script setup lang="ts">
import { TVirtualMarkdown } from "@simon_he/vue-tui/markdown";

const content = [
  "# Build report",
  "",
  "- Tests passed",
  "- Bundle generated",
  "",
  "```ts",
  "console.log('ready')",
  "```",
].join("\n");
</script>

<template>
  <TVirtualMarkdown :x="0" :y="0" :w="100" :h="28" :content="content" />
</template>
````

The component renders in terminal cells and emits scroll/focus/keyboard events like other terminal components.

## Streaming Markdown

For simple streams, pass `content` with `streaming=true`. Rapid updates are coalesced into scheduled markdown rebuilds.

```vue
<TVirtualMarkdown
  :x="0"
  :y="0"
  :w="100"
  :h="28"
  :content="assistantText"
  :streaming="true"
  :final="isComplete"
/>
```

For long transcripts, keep complete markdown in your own state and feed finalized blocks through `createMarkdownBlockSource()`. That lets the streaming tail update without reparsing every completed message on each token.

```ts
import { ref } from "vue";
import { createMarkdownBlockSource } from "@simon_he/vue-tui/markdown";

const source = createMarkdownBlockSource();
const blocks = ref(source.blocks);

export function appendAssistantDelta(text: string): void {
  source.appendDelta(text);
  blocks.value = source.blocks;
}

export function finishAssistantBlock(): void {
  source.finalizeBlock();
  blocks.value = source.blocks;
}
```

```vue
<TVirtualMarkdown :x="0" :y="0" :w="100" :h="28" :blocks="blocks" :streaming="true" />
```

## Agent Console Pattern

Agent UIs usually combine markdown with render planes:

| Plane      | Typical content                                             |
| ---------- | ----------------------------------------------------------- |
| Transcript | `TVirtualMarkdown`, user bubbles, thinking rows, tool calls |
| Logs       | `TLogView` or tool output surface                           |
| Chrome     | Status, search, token bars, bottom input                    |
| Overlay    | Command palette, detail dialogs, link pickers               |

This keeps token streaming from repainting the input or overlay regions.

## Related Pages

- [Agent Console](/agent-console)
- [Terminal Log Viewer](/guide/terminal-log-viewer)
- [Vue Terminal UI](/guide/vue-terminal-ui)
- [Components](/components)
