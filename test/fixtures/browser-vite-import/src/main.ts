import * as root from "@simon_he/vue-tui";
import * as core from "@simon_he/vue-tui/core";
import * as runtime from "@simon_he/vue-tui/runtime";
import * as rendererDom from "@simon_he/vue-tui/renderer/dom";
import * as observability from "@simon_he/vue-tui/observability";
import * as vueEntry from "@simon_he/vue-tui/vue";
import * as markdown from "@simon_he/vue-tui/markdown";
import * as experimental from "@simon_he/vue-tui/experimental";

const terminal = root.createTerminal({ cols: 4, rows: 1 });
terminal.write("OK", { x: 0, y: 0 });

console.log(
  root.TerminalProvider,
  core.charCellWidth,
  runtime.createRuntime,
  rendererDom.createDomRenderer,
  observability.createTraceStore,
  vueEntry.TerminalProvider,
  markdown.TMarkdownText,
  experimental.TVirtualList,
  terminal.snapshot().lines[0],
);
