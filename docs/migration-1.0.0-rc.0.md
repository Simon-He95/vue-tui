# Migration to 1.0.0-rc.0

This release establishes the first generated API manifest baseline. `api:diff` will skip when the latest tag does not contain `docs/generated/api-manifest.json`; it becomes an effective tagged-release diff gate after the next tagged release includes that manifest.

## Component Event Payloads

`TCommandPalette` now emits a structured `select` payload:

```ts
type TCommandPaletteSelectPayload = {
  item: TCommandPaletteItem;
  index: number;
  sourceIndex: number;
  query: string;
  source: "keyboard" | "pointer";
};
```

`index` is the filtered/rendered command row index; `sourceIndex` is the original `items` or provider result index.

Before:

```vue
<TCommandPalette @select="runCommand" />
```

```ts
function runCommand(item: TCommandPaletteItem) {
  // ...
}
```

After:

```vue
<TCommandPalette @select="({ item }) => runCommand(item)" />
```

```ts
function runCommand(item: TCommandPaletteItem) {
  // ...
}
```

`TAutocompleteInput` `select` payload now also includes `option`, `query`, and `source` so static and async suggestions can share one handler shape.

`TAutocompleteInput` now closes suggestions after selection by default. Set `closeOnSelect=false` to preserve the previous always-visible suggestions behavior.

`TSelect multipleEmit="value"` now emits option values, matching `valueMode`, instead of acting as a label alias. The default emitted payload remains selected option labels via `multipleEmit="label"`. `multipleEmit="both"` emits `{ indices, labels, values }`.

## Root Entrypoint Narrowed

`@simon_he/vue-tui` now keeps only stable browser-safe API at the root. Move imports that depend on Vue internals, runtime wiring, observability, core sanitizers, or Node-aware CLI helpers to the explicit subpath entrypoints below.

Before:

```ts
import { TAnchor, createRuntime, createStdoutRenderer } from "@simon_he/vue-tui";
```

After:

```ts
import { createStdoutRenderer } from "@simon_he/vue-tui/cli";
import { createRuntime } from "@simon_he/vue-tui/runtime";
import { TAnchor } from "@simon_he/vue-tui/vue";
```

Node-only APIs such as `createDefaultTInputHostAdapter`, `defaultTInputHostPlugin`, `createNodePathPickerProvider`, and stdout renderer helpers now live under `/cli`.

| Old import from `@simon_he/vue-tui` | New import                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `TAnchor`                           | `@simon_he/vue-tui/vue`                                                                      |
| `TFlow`                             | `@simon_he/vue-tui/vue`                                                                      |
| `TRenderPlane`                      | `@simon_he/vue-tui/vue`                                                                      |
| `TRenderLayer`                      | `@simon_he/vue-tui/vue`                                                                      |
| `TTransition`                       | `@simon_he/vue-tui/vue`                                                                      |
| `TInputBox`                         | `@simon_he/vue-tui/vue`                                                                      |
| `TPathPicker`                       | `@simon_he/vue-tui/vue`                                                                      |
| `TJsonEditor`                       | `@simon_he/vue-tui/vue`                                                                      |
| `TMultilineModal`                   | `@simon_he/vue-tui/vue`                                                                      |
| `TDebugOverlay`                     | `@simon_he/vue-tui/vue`                                                                      |
| `TRouterView`                       | `@simon_he/vue-tui/vue`                                                                      |
| `useTerminal`                       | `@simon_he/vue-tui/vue`                                                                      |
| `useRenderNode`                     | `@simon_he/vue-tui/vue`                                                                      |
| `useLayout`                         | `@simon_he/vue-tui/vue`                                                                      |
| `useTerminalRuntime`                | `@simon_he/vue-tui/vue`                                                                      |
| `useTerminalNode`                   | `@simon_he/vue-tui/vue`                                                                      |
| `useVisibility`                     | `@simon_he/vue-tui/vue`                                                                      |
| `useRoute`                          | `@simon_he/vue-tui/vue`                                                                      |
| `useRouter`                         | `@simon_he/vue-tui/vue`                                                                      |
| `createTerminalRouter`              | `@simon_he/vue-tui/vue`                                                                      |
| `createRuntime`                     | `@simon_he/vue-tui/runtime`                                                                  |
| `createFramePerfStore`              | `@simon_he/vue-tui/observability`                                                            |
| `framePerfNow`                      | `@simon_he/vue-tui/observability`                                                            |
| `sanitizeDomHref`                   | `@simon_he/vue-tui/core`                                                                     |
| `sanitizeTerminalHref`              | `@simon_he/vue-tui/core` for browser-safe/core code, or `@simon_he/vue-tui/cli` for CLI code |
| `createDefaultTInputHostAdapter`    | `@simon_he/vue-tui/cli`                                                                      |
| `defaultTInputHostPlugin`           | `@simon_he/vue-tui/cli`                                                                      |
| `createTerminalApp`                 | `@simon_he/vue-tui/cli`                                                                      |
| `createStdoutRenderer`              | `@simon_he/vue-tui/cli`                                                                      |
| `createStdinDriver`                 | `@simon_he/vue-tui/cli`                                                                      |
| `installTerminalCleanup`            | `@simon_he/vue-tui/cli`                                                                      |
