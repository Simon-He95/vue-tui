# Vue TUI

Vue TUI is a Vue 3 terminal UI toolkit. It lets you render the same component model to a browser DOM surface or to a real terminal through stdout.

The package is useful for:

- browser-hosted terminal interfaces and playgrounds
- CLI apps that want Vue component composition
- high-throughput views such as virtual lists, streaming logs, and markdown transcripts
- renderer and terminal experiments that need deterministic tests

## Installation

```bash
pnpm add @simon_he/vue-tui vue
```

Vue is a peer dependency. The published package supports Vue `>=3.3.0 <4`.

## Entry Points

| Import                           | Stability         | Main exports                                                                                                                                                                    |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@simon_he/vue-tui`              | Stable            | `TerminalProvider`, `TText`, `TBox`, `TInput`, `createTerminal`, `createDomRenderer`, `createStdoutRenderer`, `createTerminalApp`, event managers, runtime/router/input helpers |
| `@simon_he/vue-tui/markdown`     | Focused sub-entry | `TMarkdownText`, `TVirtualMarkdown`, markdown parser and layout helpers                                                                                                         |
| `@simon_he/vue-tui/experimental` | Experimental      | `TVirtualList`, `TLogView`, log search/link/minimap components, append-only log store, TLog plugins                                                                             |

High-throughput log and virtualized APIs are intentionally kept out of the root entrypoint until their API surface settles.

## Browser Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { TerminalProvider, TBox, TInput, TText } from "@simon_he/vue-tui";

const input = ref("");
</script>

<template>
  <TerminalProvider :cols="80" :rows="24" :default-style="{ fg: 'whiteBright' }">
    <TBox :x="0" :y="0" :w="80" :h="24" border title="Demo" :padding="1">
      <TText :x="0" :y="0" :w="78" value="Vue TUI is running" />
      <TInput :x="0" :y="20" :w="78" v-model="input" placeholder="Type..." />
    </TBox>
  </TerminalProvider>
</template>
```

## Terminal Usage

For a real terminal, mount a headless Vue app and attach stdout/stdin:

```ts
import { createStdinDriver, createStdoutRenderer, createTerminalApp } from "@simon_he/vue-tui";
import App from "./App.vue";

const app = createTerminalApp({
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  component: App as any,
  defaultStyle: { fg: "whiteBright" },
});

app.mount();

const renderer = createStdoutRenderer(app.terminal, {
  output: process.stdout,
  hideCursor: true,
  colorMode: "auto",
});

app.scheduler.flush();

const driver = createStdinDriver({
  dispatch(event) {
    const prevented = app.events.dispatch(event);
    app.scheduler.flush();
    return prevented;
  },
  enableMouse: true,
  onExit() {
    driver.dispose();
    renderer.dispose();
    app.dispose();
    process.exit(0);
  },
});
```

## Core Concepts

- `createTerminal({ cols, rows })` creates the cell buffer, cursor, planes, scrollback, and commit events.
- `createDomRenderer(terminal, container)` renders terminal cells to DOM with row caching and optional DOM scroll operations.
- `createStdoutRenderer(terminal, options)` emits ANSI output for real terminal UIs.
- `TerminalProvider` wires terminal, renderer, events, scheduler, runtime, layout, and input plugins for browser Vue usage.
- `createTerminalApp()` provides the same runtime wiring without a DOM renderer, for CLI apps and tests.
- `TRenderPlane` separates transcript, chrome, and overlay surfaces so small UI updates do not repaint large content panes.

## API Surface

### Root Components

| Component                                                                 | Purpose                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------ |
| `TerminalProvider`                                                        | Browser terminal runtime provider                |
| `TText`                                                                   | Fixed-position text drawing                      |
| `TBox`                                                                    | Border, title, padding, and clipped content area |
| `TView`, `TAnchor`, `TFlow`                                               | Layout containers                                |
| `TInput`, `TInputBox`, `TSelect`, `TDialog`, `TPathPicker`, `TJsonEditor` | Interactive terminal widgets                     |
| `TRenderPlane`, `TRenderLayer`                                            | Plane/layer routing                              |
| `TTransition`                                                             | Time-based mount/unmount transitions             |

### Core And Renderer APIs

| API                                           | Purpose                                     |
| --------------------------------------------- | ------------------------------------------- |
| `createTerminal`                              | In-memory terminal and planes               |
| `createDomRenderer`                           | Browser DOM renderer                        |
| `createStdoutRenderer`                        | CLI/stdout renderer                         |
| `createEventManager`, `createCliEventManager` | Pointer/keyboard dispatch to terminal nodes |
| `createTerminalApp`                           | Headless Vue app for CLI/tests              |
| `createRuntime`                               | Imperative component mounting               |
| `createTerminalRouter`                        | Terminal route state                        |

### Markdown Entry

| API                                                                      | Purpose                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| `TMarkdownText`                                                          | Markdown text block                                      |
| `TVirtualMarkdown`                                                       | Virtualized markdown viewport for long/streaming content |
| `createMarkdownBlockSource`                                              | Incremental block source for streaming markdown history  |
| `createTuiMarkdownParser`                                                | Parser wrapper around `stream-markdown-parser`           |
| `buildMarkdownBlocks`, `buildMarkdownVisualRows`, `layoutMarkdownBlocks` | Markdown pipeline helpers                                |

### Experimental Entry

| API                                                                                 | Purpose                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `TVirtualList`                                                                      | Virtual list with dirty-row and scroll optimizations |
| `TLogView`                                                                          | Append-only / retained-window log viewport           |
| `createAppendOnlyLogStore`                                                          | Streaming log source for `TLogView`                  |
| `TLogSearchBar`, `TLogSearchResults`, `TLogVirtualSearchResults`, `TLogSearchPager` | Log search UI                                        |
| `TLogLinksPanel`, `TLogVirtualLinksPanel`                                           | Link navigation UI                                   |
| `TLogScrollbar`, `TLogMinimap`                                                      | Log navigation affordances                           |

## Performance Guide

Use the renderer features that match the workload:

- Split large transcript content and frequently changing chrome into different `TRenderPlane`s.
- Use `TVirtualList` for large lists rather than rendering all rows as components.
- Use `TLogView` with `createAppendOnlyLogStore({ maxLines })` for streaming logs.
- Provide stable line keys for custom `TLogView` sources; mutable tail rows should get changing keys.
- For DOM rendering, row-key prepass defaults to `"auto"` and enables itself only when cached-row hit ratio is useful.
- For stdout rendering, set `colorMode` or `DIMCODE_COLOR_MODE` when the terminal color capability is known.
- Reuse style objects on hot paths instead of creating new object literals every frame.

Useful checks:

```bash
pnpm run bench:dom-renderer
pnpm run bench:scroll-mailbox
pnpm run bench:phase2
```

More detail: [docs/performance.md](./docs/performance.md) and [docs/high-throughput-rendering.md](./docs/high-throughput-rendering.md).

## Colors And Themes

Styles support ANSI color names, hex colors, and terminal text attributes:

```ts
type Style = {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  href?: string;
};
```

DOM and stdout renderers share the same ANSI palette resolver. `createDomRenderer` exposes palette values as CSS variables, while `createStdoutRenderer` maps them to truecolor or downgraded ANSI sequences depending on `colorMode`.

## Package And Release Notes

- The published package ships `dist` only. Export targets point to built ESM/CJS/types files.
- Root, markdown, and experimental entrypoints are available as both ESM and CJS after build.
- The package does not declare a Node engine for the root browser/core API. CLI usage requires a Node-like process/stdout/stdin environment.
- The markdown sub-entry depends on `stream-markdown-parser`; check that dependency chain if your runtime has strict engine policies.
- Experimental APIs can change before the next stable release. Keep imports from `/experimental` isolated in application code.

## Known Limitations

- `TVirtualMarkdown` reuses block-level layout during streaming. The `content` path still parses the current full markdown string; stream-driven apps that can finalize transcript blocks can use `createMarkdownBlockSource` and pass `blocks` to avoid reparsing finalized history.
- `TLogView` is optimized for append-only and retained-window sources; arbitrary random mutation workloads should provide explicit stable keys and should be tested with the target renderer.
- Terminal emoji and East Asian width behavior still depends on the user terminal and font.
- ANSI16 colors follow the terminal theme; use truecolor or ansi256 for more deterministic color output.
- No canvas renderer is currently shipped.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Examples:

```bash
pnpm -C examples/basic dev
pnpm run build:examples
pnpm run build:examples:terminal
pnpm run run:basic:terminal
pnpm run example:tlog-view-lab
pnpm run example:agent-console
pnpm run example:agent-console:smoke
pnpm run example:agent-console:terminal:smoke
```

Docs:

```bash
pnpm run docs:gen
pnpm run docs:dev
pnpm run docs:build
```

## License

[MIT](./license)
