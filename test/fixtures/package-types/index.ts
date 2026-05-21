import {
  TerminalProvider,
  TBox,
  TCheckbox,
  TCommandPalette,
  TDataTable,
  TFormField,
  TLinkifyText,
  TTable,
  TText,
  TTree,
  createTInputHostPlugin,
  createTerminal,
  createTheme,
  linkifyTextSegments,
  type Style,
  type TTableColumn,
  type Terminal,
  type TInputHostAdapter,
  type TLinkifyOptions,
} from "@simon_he/vue-tui";

import { sanitizeDomHref } from "@simon_he/vue-tui/core";
import {
  createDomRenderer,
  type DomRendererLinkConfig,
  type DomRendererOptions,
} from "@simon_he/vue-tui/renderer/dom";
import { createRuntime, type TerminalEventRecord } from "@simon_he/vue-tui/runtime";
import {
  TAnchor,
  TDebugOverlay,
  TFlow,
  TInputBox,
  TJsonEditor,
  TMultilineModal,
  TPathPicker,
  TRenderLayer,
  TRenderPlane,
  TTransition,
  useTerminal,
  type TInputPlugin,
} from "@simon_he/vue-tui/vue";

import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  createDefaultTInputHostAdapter,
  defaultTInputHostPlugin,
  installTerminalCleanup,
  type StdinDriver,
  type TerminalCleanupHandle,
  type TerminalCleanupSignalPolicy,
} from "@simon_he/vue-tui/cli";

import {
  TMarkdownText,
  buildMarkdownVisualRows,
  createTuiMarkdownParser,
  layoutMarkdownBlocks,
} from "@simon_he/vue-tui/markdown";

import { TLogView, TVirtualList, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";
import {
  TAgentTranscript,
  TThinkingView,
  TToolCallView,
  TToolLogView,
  TUserMessageView,
  type TToolCallViewSlotProps,
} from "@simon_he/vue-tui/agent";

const style: Style = { fg: "whiteBright", href: "https://example.com" };
const domOptions: DomRendererOptions = { links: true };
const linkConfig: DomRendererLinkConfig = {
  activation: "event",
  allowRelative: true,
  onActivate(href) {
    return href.length > 0;
  },
};
const terminal: Terminal = createTerminal({ cols: 80, rows: 24 });
const runtime = createRuntime();
const plugin: TInputPlugin = { name: "test", install: () => {} };
const hostAdapter: TInputHostAdapter = {
  isTerminalLike: false,
};
const hostPlugin = createTInputHostPlugin(hostAdapter);
const linkifyOptions: TLinkifyOptions = { protocols: ["https"], allowRelative: true };
const linkified = linkifyTextSegments("see https://example.com", linkifyOptions);
const theme = createTheme({ colors: { link: "cyanBright" } });
const tableColumns: TTableColumn[] = [{ key: "id", label: "ID", width: 4 }];

console.log(
  TerminalProvider,
  TBox,
  TCheckbox,
  TCommandPalette,
  TDataTable,
  TFormField,
  TLinkifyText,
  TTable,
  TText,
  TTree,
  TMarkdownText,
  TLogView,
  TVirtualList,
  TAgentTranscript,
  TThinkingView,
  TToolCallView,
  TToolLogView,
  TUserMessageView,
  createTerminalApp,
  createStdoutRenderer,
  createStdinDriver,
  createDomRenderer,
  TAnchor,
  TDebugOverlay,
  TFlow,
  TInputBox,
  TJsonEditor,
  TMultilineModal,
  TPathPicker,
  TRenderLayer,
  TRenderPlane,
  TTransition,
  useTerminal,
  createDefaultTInputHostAdapter,
  defaultTInputHostPlugin,
  installTerminalCleanup,
  createTuiMarkdownParser,
  createAppendOnlyLogStore,
  sanitizeDomHref,
  style,
  domOptions,
  linkConfig,
  terminal,
  runtime,
  plugin,
  hostPlugin,
  linkified,
  theme,
  tableColumns,
);

const driver: StdinDriver | null = null;
const cleanupHandle: TerminalCleanupHandle | null = null;
const signalPolicy: TerminalCleanupSignalPolicy = "cleanup-only";
const record: TerminalEventRecord = { type: "keydown", key: "Enter" };
const toolCallSlot: TToolCallViewSlotProps | null = null;
const markdownParser = createTuiMarkdownParser();
const markdownRows = buildMarkdownVisualRows("| Ω |\n|---|", 20, markdownParser, {
  widthProvider: "cjk",
});
const markdownLayoutRows = layoutMarkdownBlocks([], 20, { widthProvider: "cjk" });
console.log(
  driver,
  cleanupHandle,
  signalPolicy,
  record,
  toolCallSlot,
  markdownRows,
  markdownLayoutRows,
);
