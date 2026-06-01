---
title: Vue Terminal UI Components
description: Build terminal-style Vue 3 interfaces with shared components for browser DOM, CLI stdout, and headless tests.
---

# Vue Terminal UI Components

Vue TUI is a Vue 3 terminal UI toolkit for building terminal-style interfaces with normal Vue component composition. The same component model can render to browser DOM, real CLI stdout, and headless test harnesses, so teams can keep layout, input, transcript, and log behavior in one place instead of maintaining separate browser and terminal implementations.

Use Vue TUI when you need terminal-style screens with cell-based layout, keyboard and pointer events, ANSI-style rendering, overlays, lists, markdown transcripts, logs, or agent console surfaces.

## When Vue TUI Fits

- Browser-hosted terminal dashboards, demos, and playgrounds
- Vue-powered CLI apps that render to real stdout
- Component tests that need deterministic terminal snapshots
- Log viewers, virtual lists, markdown transcripts, and AI agent consoles
- Shared UI logic across DOM and CLI hosts

Vue TUI is not a shell emulator. It gives Vue applications a terminal UI renderer and component set. Your app still owns command execution, process permissions, data fetching, and host-specific policies.

## Install

```bash
pnpm add @simon_he/vue-tui vue
```

Vue is a peer dependency. The root package entrypoint is browser-safe and exports stable terminal core, DOM renderer, and Vue components. Node-only APIs live under `@simon_he/vue-tui/cli`.

## Browser Terminal UI Example

```vue
<script setup lang="ts">
import { ref } from "vue";
import { TerminalProvider, TBox, TInput, TList, TText } from "@simon_he/vue-tui";

const command = ref("");
const items = ["status", "logs", "deploy"];
</script>

<template>
  <TerminalProvider :cols="80" :rows="24" :default-style="{ fg: 'whiteBright' }">
    <TBox :x="0" :y="0" :w="80" :h="24" title="Project Console" border :padding="1">
      <TText :x="0" :y="0" :w="78" value="Select a task or type a command." />
      <TList :x="0" :y="2" :w="30" :h="6" :items="items" />
      <TInput :x="0" :y="20" :w="78" v-model="command" placeholder="Run..." />
    </TBox>
  </TerminalProvider>
</template>
```

`TerminalProvider` wires the terminal buffer, renderer, scheduler, event manager, runtime, layout context, and input plugins. Components render in terminal cells: `x`, `y`, `w`, and `h` are columns and rows, not pixels.

## Renderer Model

Vue TUI separates the terminal model from host output:

| Layer     | Role                                                 |
| --------- | ---------------------------------------------------- |
| Core      | Cell buffer, ANSI style, planes, scrollback, commits |
| Renderer  | Browser DOM renderer or CLI stdout renderer          |
| Vue layer | Components, layout context, focus, events, overlays  |
| Runtime   | Host input, selection, clipboard, links, cleanup     |

For high-frequency screens, split the display into `TRenderPlane` regions such as transcript, chrome, input, and overlay. This lets a small input update avoid repainting a large transcript.

## What To Read Next

- [Live Showcase](/showcase): real components running inside the docs site
- [Components](/components): component reference and import entrypoints
- [Vue CLI UI](/guide/vue-cli-ui): terminal apps with Vue component composition
- [CLI Stdout Renderer](/guide/cli-stdout-renderer): stdout renderer and stdin driver
- [Agent Console](/agent-console): streaming markdown, logs, overlays, links, and tool calls
