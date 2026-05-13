# @simon_he/vue-tui

Vue TUI is a Vue 3 terminal UI toolkit for building terminal-style interfaces that can render in a browser or in a real CLI. It gives you Vue components, terminal cell rendering, event dispatch, markdown rendering, and high-throughput primitives for lists, logs, and streaming transcripts.

Use it when you want:

- Browser-hosted terminal interfaces, dashboards, demos, and playgrounds.
- CLI apps that use Vue component composition instead of imperative stdout drawing.
- Shared UI code that can run against a DOM renderer, a stdout renderer, or headless tests.
- Large terminal surfaces such as virtual lists, append-only logs, markdown transcripts, and agent console UIs.

## Install

```bash
pnpm add @simon_he/vue-tui vue
```

Vue is a peer dependency. The current package supports Vue `>=3.3.0 <4`.

## Entry Points

| Import                           | Stability    | Use it for                                                                                                             |
| -------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `@simon_he/vue-tui`              | Core         | Browser-safe terminal runtime, root Vue components, DOM renderer, events, layout, inputs, router, and runtime helpers  |
| `@simon_he/vue-tui/cli`          | Node/CLI     | Headless Vue app runtime, stdin driver, stdout renderer, Node path provider, recording, and terminal clipboard helpers |
| `@simon_he/vue-tui/markdown`     | Focused      | `TMarkdownText`, `TVirtualMarkdown`, markdown parser and layout helpers, streaming markdown block sources              |
| `@simon_he/vue-tui/experimental` | Experimental | `TVirtualList`, `TLogView`, TLog search/link/minimap companions, append-only log store, and TLog plugins               |

High-throughput log and virtualization APIs stay under `/experimental` until their public surface settles. Keep those imports isolated in application code.

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

`TerminalProvider` wires the terminal buffer, DOM renderer, event manager, scheduler, runtime, layout context, and input plugins for browser Vue apps.

## CLI Usage

For a real terminal, mount a headless Vue app and attach stdout/stdin:

```ts
import { createStdinDriver, createStdoutRenderer, createTerminalApp } from "@simon_he/vue-tui/cli";
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

- `createTerminal({ cols, rows })` owns the cell buffer, cursor, planes, scrollback, and commit events.
- `createDomRenderer(terminal, container)` renders terminal cells to DOM with row caching and fast paths for plain and styled rows.
- `createStdoutRenderer(terminal, options)` emits ANSI output for real terminal UIs from `/cli`.
- `TerminalProvider` is the browser-facing Vue runtime provider.
- `createTerminalApp()` is the headless runtime for CLI apps and deterministic tests.
- `TRenderPlane` separates transcript, chrome, input, and overlay surfaces so small updates do not repaint large panes.

## Components

| Area          | Components                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------- |
| Layout        | `TBox`, `TView`, `TAnchor`, `TFlow`, `TRenderPlane`, `TRenderLayer`                           |
| Text          | `TText`, `TTransition`, `TMarkdownText`, `TVirtualMarkdown`                                   |
| Input         | `TInput`, `TInputBox`, `TSelect`, `TPathPicker`, `TJsonEditor`                                |
| Overlay       | `TDialog`, `TMultilineModal`, `TDebugOverlay`                                                 |
| Experimental  | `TVirtualList`, `TLogView`, `TLogSearchBar`, `TLogLinksPanel`, `TLogScrollbar`, `TLogMinimap` |
| Runtime tools | `createTerminal`, `createDomRenderer`, event APIs                                             |
| CLI tools     | `createTerminalApp`, `createStdoutRenderer`, `createStdinDriver` from `@simon_he/vue-tui/cli` |

See [docs/components.md](./docs/components.md) and [docs/generated/components-api.md](./docs/generated/components-api.md) for props and events.

## Documentation

| Page                                                             | Purpose                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Docs home](./docs/index.md)                                     | Product overview and reading path                                    |
| [Examples index](./docs/examples.md)                             | Browser, terminal, and smoke example commands                        |
| [Core API](./docs/api.md)                                        | Terminal, renderer, events, runtime, planes, and scheduler contracts |
| [Performance](./docs/performance.md)                             | Practical performance guidance                                       |
| [High-throughput rendering](./docs/high-throughput-rendering.md) | Scheduler, dirty rows, mailbox, log, and renderer architecture       |
| [Agent Console](./docs/agent-console.md)                         | Streaming transcript example stack                                   |
| [Release candidate](./docs/release-candidate.md)                 | 0.x validation, package export checks, and migration notes           |

Run the docs locally:

```bash
pnpm run docs:dev
pnpm run docs:build
```

## Examples

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

The smoke commands are deterministic and avoid real LLM APIs, real TTY dependencies, and timing-only pass/fail gates.

## Performance Notes

- Use `TVirtualList` instead of rendering thousands of row components.
- Use `TLogView` with `createAppendOnlyLogStore({ maxLines })` for retained streaming logs.
- Provide stable line keys for custom `TLogView` sources; mutable rows should change keys or call the explicit invalidation APIs.
- Split high-volume content and frequently changing chrome into different `TRenderPlane`s.
- Reuse style objects on hot paths instead of creating new object literals every frame.

Useful checks:

```bash
pnpm run bench:dom-renderer
pnpm run bench:scroll-mailbox
pnpm run bench:phase2
```

## Issues And Feedback

- Report bugs: [new bug report](https://github.com/Simon-He95/vue-tui/issues/new?template=bug_report.yml)
- Request features: [new feature request](https://github.com/Simon-He95/vue-tui/issues/new?template=feature_request.yml)
- Report documentation issues: [new docs issue](https://github.com/Simon-He95/vue-tui/issues/new?template=docs.yml)
- Browse existing issues: [GitHub issues](https://github.com/Simon-He95/vue-tui/issues)

For renderer, scheduler, or terminal behavior bugs, include the renderer target (`DOM`, `stdout`, or headless), the relevant command, and a minimal reproduction when possible.

## Development

```bash
pnpm install
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

Release validation:

```bash
pnpm run release:dry-run
```

`release:dry-run` runs checks, tests, docs build, benchmarks, examples smoke, and packed package install smoke.

## Package Notes

- The published package ships `dist` only.
- Root, markdown, and experimental entrypoints are available as ESM, CJS, and type declarations after build.
- The root browser/core API does not require a Node runtime, but CLI usage expects a Node-like stdout/stdin environment.
- Terminal emoji and East Asian width behavior still depends on the user terminal and font.

## License

[MIT](./license)
