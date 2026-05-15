# Migration to 0.1.0-rc.1

## Root Entrypoint Narrowed

`@simon_he/vue-tui` now keeps only stable browser-safe API at the root. Move imports that depend on Vue internals, runtime wiring, observability, core sanitizers, or Node-aware CLI helpers to the explicit subpath entrypoints below.

| Old import from `@simon_he/vue-tui` | New import |
| --- | --- |
| `TAnchor` | `@simon_he/vue-tui/vue` |
| `TFlow` | `@simon_he/vue-tui/vue` |
| `TRenderPlane` | `@simon_he/vue-tui/vue` |
| `TRenderLayer` | `@simon_he/vue-tui/vue` |
| `TTransition` | `@simon_he/vue-tui/vue` |
| `TInputBox` | `@simon_he/vue-tui/vue` |
| `TPathPicker` | `@simon_he/vue-tui/vue` |
| `TJsonEditor` | `@simon_he/vue-tui/vue` |
| `TMultilineModal` | `@simon_he/vue-tui/vue` |
| `TDebugOverlay` | `@simon_he/vue-tui/vue` |
| `TRouterView` | `@simon_he/vue-tui/vue` |
| `useTerminal` | `@simon_he/vue-tui/vue` |
| `useRenderNode` | `@simon_he/vue-tui/vue` |
| `useLayout` | `@simon_he/vue-tui/vue` |
| `useTerminalRuntime` | `@simon_he/vue-tui/vue` |
| `useTerminalNode` | `@simon_he/vue-tui/vue` |
| `useVisibility` | `@simon_he/vue-tui/vue` |
| `useRoute` | `@simon_he/vue-tui/vue` |
| `useRouter` | `@simon_he/vue-tui/vue` |
| `createTerminalRouter` | `@simon_he/vue-tui/vue` |
| `createRuntime` | `@simon_he/vue-tui/runtime` |
| `createFramePerfStore` | `@simon_he/vue-tui/observability` |
| `framePerfNow` | `@simon_he/vue-tui/observability` |
| `sanitizeDomHref` | `@simon_he/vue-tui/core` |
| `sanitizeTerminalHref` | `@simon_he/vue-tui/core` for browser-safe/core code, or `@simon_he/vue-tui/cli` for CLI code |
| `createDefaultTInputHostAdapter` | `@simon_he/vue-tui/cli` |
| `defaultTInputHostPlugin` | `@simon_he/vue-tui/cli` |
| `createTerminalApp` | `@simon_he/vue-tui/cli` |
| `createStdoutRenderer` | `@simon_he/vue-tui/cli` |
| `createStdinDriver` | `@simon_he/vue-tui/cli` |
| `installTerminalCleanup` | `@simon_he/vue-tui/cli` |
