---
name: vue-tui
description: Terminal Vue UI development and review for @simon_he/vue-tui. Use when implementing, debugging, testing, documenting, or reviewing vue-tui terminal components, dialogs, inputs, transcripts, keyboard and pointer interactions, render planes, scheduler invalidation, cell-width layout, theming, createTerminalApp tests, or CLI consumer integration patterns.
---

# Vue TUI

## Overview

Use this skill to build and review `@simon_he/vue-tui` terminal components with the patterns proven by the package itself and by CLI consumers such as `best-agent`'s `dimsdk` UI.

## Workflow

1. Start with data. Search the package and consumer examples before changing behavior: `rg "TDialog|TInput|TTranscriptView|createTerminalApp|invalidatePlane|events.dispatch" src test examples /Users/Simon/Github/best-agent/apps/cli/src /Users/Simon/Github/best-agent/apps/cli/test`.
2. Identify the layer you are touching: `src/core`, `src/events`, `src/runtime`, `src/cli`, `src/vue`, `src/renderer`, `test`, `docs`, or `examples`. Keep changes in that layer unless the behavior truly crosses boundaries.
3. Design terminal UI in cells. Compute `x`, `y`, `w`, and `h` as integer cells; use vue-tui text utilities for width, slicing, wrapping, and sanitization.
4. Preserve render-plane behavior. Use `TRenderPlane`, `TRenderLayer`, `render.invalidatePlane(...)`, scheduler plane invalidation, and dirty-row APIs consistently with nearby code.
5. Treat focus, keyboard capture, pointer capture, and selection as public behavior. Modal and input components should own the keys they handle and prevent leakage to background widgets.
6. Verify through the narrowest relevant test first. Use `createTerminalApp`, snapshots, `getCell`, dispatched events, resize, and package demos as needed.

## Package Anchors

- Terminal app/test harness: `src/create-terminal-app.ts`, `src/cli.ts`, `test/ui-regressions-support.ts`
- Rendering: `src/vue/render/render-manager.ts`, `src/vue/components/TRenderPlane.ts`, `src/vue/components/TRenderLayer.ts`
- Scheduler: `src/vue/components/terminal-provider/scheduler.ts`, `src/vue/scheduler/frame-scheduler.ts`
- Components: `src/vue/components/TText.ts`, `TView.ts`, `TInput.ts`, `TDialog.ts`, `TCommandPalette.ts`, `TTranscriptView.ts`, `TVirtualRows.ts`
- Text and geometry: `src/vue/utils/text.ts`, `src/vue/utils/rect.ts`, `src/core/buffer/width.ts`
- Events and selection: `src/events/manager/event-manager.ts`, `src/events/manager/types.ts`, `src/selection/terminal-selection.ts`
- Tests: `test/p1-p2-components.test.ts`, `test/tlog-view.test.ts`, `test/tlog-scrollbar.test.ts`, `test/tinput-restrict-text.test.ts`, `test/text-newlines.test.ts`
- Examples: `examples/tlog-view-lab.ts`, `examples/agent-console/src/AgentConsoleSurface.ts`, `scripts/run-component-terminal.ts`

## Consumer Anchors

Use these when validating best practices against a real CLI app:

- `/Users/Simon/Github/best-agent/apps/cli/src/dimsdk/pages/ChatPage/index.ts`
- `/Users/Simon/Github/best-agent/apps/cli/src/dimsdk/pages/ChatPage/components/ChatMessages.ts`
- `/Users/Simon/Github/best-agent/apps/cli/src/dimsdk/pages/ChatPage/components/ChatBottomPanel.ts`
- `/Users/Simon/Github/best-agent/apps/cli/src/dimsdk/ui/components/CommandPalette.ts`
- `/Users/Simon/Github/best-agent/apps/cli/src/dimsdk/ui/components/ProviderConnectDialog.ts`
- `/Users/Simon/Github/best-agent/apps/cli/test/dimsdk-command-palette.test.ts`
- `/Users/Simon/Github/best-agent/apps/cli/test/provider-connect-dialog-input-clear-tip.test.ts`

## Best Practices

Read `references/terminal-components.md` for the detailed source-derived practices. Load it for any non-trivial component, renderer, input, transcript, or test task.

## Implementation Notes

- Prefer package primitives over app-local inventions: `TView`, `TText`, `TInput`, `TDialog`, `TBox`, `TSelect`, `TCommandPalette`, `TTranscriptView`, `TVirtualRows`, `TLogView`, `TLogScrollbar`, and `TPathPicker`.
- Keep source/API changes close to existing file ownership. Do not add helpers unless multiple package components need the behavior.
- Preserve renderer-agnostic semantics. Component behavior should work for CLI/headless and DOM renderers unless the file is explicitly renderer-specific.
- Public prop/event changes may require docs generation or API manifest checks. Follow `AGENTS.md` validation guidance.
- Keep tests deterministic. Avoid assertions that depend on cursor blinking, real wall-clock timing, or animation frames unless the nearby tests already control those inputs.

## Verification

Run the nearest Vitest target first, for example `pnpm vitest run test/p1-p2-components.test.ts -t "TDialog"` or `pnpm vitest run test/tinput-restrict-text.test.ts`. For broader package changes, consider `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, and relevant demo commands from `package.json`.
