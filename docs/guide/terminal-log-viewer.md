---
title: Terminal Log Viewer for Vue
description: Build high-throughput terminal log viewers with Vue TUI, append-only stores, retained windows, search, links, wrapping, and virtualized rows.
---

# Terminal Log Viewer for Vue

Vue TUI includes an experimental log-viewing path for high-throughput terminal surfaces. `TLogView` renders a visible window over a log data source, while `createAppendOnlyLogStore()` keeps streaming updates out of deep Vue reactivity and exposes a retained line window.

Use this path for terminal dashboards, agent tool logs, deployment output, CI logs, and long-running append-only streams.

## Why Not Render A Huge Array

Large logs fail when every appended line becomes a reactive component update. A terminal log viewer needs to:

- Paint only visible rows
- Keep scroll position stable while detached from the bottom
- Retain a bounded window for long sessions
- Cache line rendering when line keys are stable
- Support wrapping, ANSI SGR styling, links, search, and markers without full repaint

`TLogView` focuses on append-only and tail-mutation workloads. If arbitrary historical lines change, replace the source identity so the component can rebuild from a clear boundary.

## Append-Only Store Example

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { TLogView, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

const log = createAppendOnlyLogStore({ maxLines: 10_000 });

onMounted(() => {
  log.appendLine("server ready");
  log.appendChunk("streaming ");
  log.appendChunk("output\nnext line");
});
</script>

<template>
  <TLogView :x="0" :y="0" :w="100" :h="30" :source="log.source" :version="log.version" />
</template>
```

The store exposes `source` and `version`. Completed lines get stable keys, mutable tail lines get changing keys, and `firstLineIndex()` reports the absolute start of the retained window.

## Data Source Contract

```ts
interface TLogDataSource {
  lineCount(): number;
  getLine(index: number): string;
  getLineKey?: (index: number) => string | number;
  firstLineIndex?: () => number;
}
```

Provide `getLineKey()` when possible. It lets `TLogView` reuse clipped rows, wrapped visual rows, and ANSI parsed rows across appends.

## Useful Modes

| Mode               | Use it for                                                    |
| ------------------ | ------------------------------------------------------------- |
| Default fixed rows | Fast one-line log output                                      |
| `wrap=true`        | Long plain-text lines that should wrap by terminal cell width |
| `ansi=true`        | ANSI SGR styled log output                                    |
| Search companions  | Search bar, pager, result list, markers, and minimap UI       |
| Links companions   | Visible link list and link focus/activation flows             |

For complete companion wiring, run the TLogView lab or inspect the agent console example.

## Related Pages

- [Performance](/performance)
- [Benchmarks](/benchmarks)
- [High-throughput Rendering](/high-throughput-rendering)
- [TLogView Lab](/tlog-view-lab)
- [Agent Console](/agent-console)
