---
title: CLI Stdout Renderer for Vue
description: Use Vue TUI's stdout renderer to render Vue component trees into real terminals with ANSI output, input events, cleanup, and headless tests.
---

# CLI Stdout Renderer for Vue

The Vue TUI stdout renderer turns terminal buffer commits into ANSI output for real terminal apps. It is exposed from `@simon_he/vue-tui/cli` together with the headless Vue runtime, stdin driver, terminal cleanup helper, and Node host adapters.

Use the stdout renderer when your Vue components need to run in a terminal emulator, not just in a browser-hosted terminal view.

## What The Renderer Owns

The stdout renderer is an output layer. It does not own your app state, command execution, routing, or data model.

It does own:

- ANSI cursor movement and styled cell output
- Optional cursor hiding and restoration
- Optional alt-screen output
- Color mode selection
- Resize tracking when configured
- OSC8 hyperlink output for safe terminal links

The terminal buffer and scheduler still live in the headless app created by `createTerminalApp()`.

## Basic Setup

```ts
import { createStdinDriver, createStdoutRenderer, createTerminalApp } from "@simon_he/vue-tui/cli";
import App from "./App.vue";

const app = createTerminalApp({
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  component: App as any,
});

app.mount();

const stdout = createStdoutRenderer(app.terminal, {
  output: process.stdout,
  hideCursor: true,
  altScreen: true,
  colorMode: "auto",
  trackResize: true,
});

const stdin = createStdinDriver({
  dispatch(event) {
    const prevented = app.events.dispatch(event);
    app.scheduler.flush();
    return prevented;
  },
  enableMouse: true,
});

app.scheduler.flush();

process.once("exit", () => {
  stdin.dispose();
  stdout.dispose();
  app.dispose();
});
```

For signal-safe cleanup, prefer `installTerminalCleanup()` so cursor, mouse mode, and alt-screen state are restored before the process exits.

## Browser DOM vs CLI Stdout

| Concern       | Browser DOM renderer          | CLI stdout renderer                     |
| ------------- | ----------------------------- | --------------------------------------- |
| Output target | DOM nodes and spans           | ANSI output to stdout                   |
| Input source  | Browser events                | Parsed stdin sequences                  |
| Links         | Safe DOM anchors when enabled | OSC8 links for safe absolute URLs       |
| Resize        | Container-based auto resize   | Terminal columns and rows               |
| Tests         | DOM or headless harness       | Headless harness and stdout smoke tests |

Both renderers consume the same terminal model, so most component behavior should stay renderer-agnostic.

## Performance Notes

The renderer emits one composed output per flushed frame. For high-throughput apps, keep frequently changing areas small and use render planes so transcript, chrome, input, and overlay updates stay independent. See [Performance](/performance) and [High-throughput Rendering](/high-throughput-rendering) for dirty-row and plane guidance.

## Terminal Graphics

Terminal graphics are auto-detected from stdout TTY state and common terminal environment variables. Disable them with `terminalGraphics: false`.

For demos, tests, or hosts that already know the terminal capability, pass an explicit protocol:

```ts
const stdout = createStdoutRenderer(app.terminal, {
  terminalGraphics: {
    protocol: "kitty",
    force: true,
  },
});
```

Use `protocol: "iterm2"` or `protocol: "sixel"` for those renderers. Inside tmux, request passthrough explicitly:

```ts
const stdout = createStdoutRenderer(app.terminal, {
  terminalGraphics: {
    protocol: "kitty",
    force: true,
    passthrough: true,
  },
});
```

`stdout.dispose()` restores cursor and alt-screen state as before. Active terminal graphics are cleared on a best-effort basis during disposal; a failed image clear write does not make `dispose()` throw.

## Related Pages

- [Vue CLI UI](/guide/vue-cli-ui)
- [Runtime](/runtime)
- [CLI Events](/cli-events)
- [Platform Contracts](/platform-contracts)
