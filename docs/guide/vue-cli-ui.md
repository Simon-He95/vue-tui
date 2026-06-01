---
title: Vue CLI UI Components
description: Build real CLI interfaces with Vue component composition, terminal events, stdout rendering, dialogs, lists, inputs, and overlays.
---

# Vue CLI UI Components

Vue TUI lets a CLI app use Vue components instead of imperative stdout drawing. You can keep state in Vue refs, compose screens with terminal components, dispatch keyboard and mouse events through the terminal event manager, and render the result to stdout with ANSI output.

This is useful for command palettes, setup flows, agent consoles, log viewers, deployment dashboards, and any CLI surface that needs more structure than line-by-line prompts.

## CLI App Shape

A Vue TUI CLI app usually has four pieces:

| Piece                      | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `createTerminalApp()`      | Mounts a headless Vue app with a terminal buffer and scheduler |
| `createStdoutRenderer()`   | Converts terminal commits into ANSI output on stdout           |
| `createStdinDriver()`      | Parses keyboard, pointer, paste, and resize input              |
| `installTerminalCleanup()` | Restores terminal state on exit and signals                    |

Browser and CLI surfaces can share most component code. Keep host-specific behavior, such as process execution or file opening, behind injected callbacks and providers.

## Minimal CLI Runtime

```ts
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from "@simon_he/vue-tui/cli";
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

let driver: ReturnType<typeof createStdinDriver> | null = null;
const cleanup = () => {
  driver?.dispose();
  renderer.dispose();
  app.dispose();
};

const cleanupHandle = installTerminalCleanup(cleanup);

driver = createStdinDriver({
  dispatch(event) {
    const prevented = app.events.dispatch(event);
    app.scheduler.flush();
    return prevented;
  },
  enableMouse: true,
  onExit() {
    cleanupHandle.cleanup();
    process.exit(0);
  },
});

app.scheduler.flush();
```

In a production CLI, also decide whether you want alt-screen output, cursor anchoring for IME, resize tracking, link opening policy, and host-owned signal behavior.

## Components For CLI Screens

Start with stable root imports:

- `TerminalProvider`, `TBox`, `TView`, and `TText` for layout and text
- `TInput`, `TList`, and `TSelect` for interactive flows
- `TDialog` for modal confirmation and details
- `TLink` and `TLinkifyText` when the host has an explicit link policy

For larger apps, use advanced or experimental entrypoints deliberately:

- `@simon_he/vue-tui/vue` for render planes, router helpers, extended inputs, and overlays
- `@simon_he/vue-tui/markdown` for markdown transcript rendering
- `@simon_he/vue-tui/experimental` for virtual lists and log surfaces
- `@simon_he/vue-tui/agent` for agent transcript primitives

## Testing CLI UI

Use `createTerminalApp()` in tests to mount the same components without a real terminal. Dispatch events, flush the scheduler, and assert terminal snapshots or individual cells. This keeps keyboard, focus, scroll, and overlay behavior deterministic.

## Related Pages

- [CLI Stdout Renderer](/guide/cli-stdout-renderer)
- [Terminal UI Best Practices](/terminal-ui-best-practices)
- [Terminal Compatibility](/terminal-compatibility)
- [Agent Console](/agent-console)
