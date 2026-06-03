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
  computeCommandPaletteMatchRanges as computeRootCommandPaletteMatchRanges,
  linkifyTextSegments,
  type Style,
  type TTableColumn,
  type Terminal,
  type TInputHostAdapter,
  type TLinkifyOptions,
  type TCommandPaletteItem as RootTCommandPaletteItem,
  type TCommandPaletteMatchRange as RootTCommandPaletteMatchRange,
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
  TMermaid,
  TMermaidText,
  TMultilineModal,
  TPathPicker,
  TRenderLayer,
  TRenderPlane,
  TTransition,
  computeCommandPaletteMatchRanges as computeVueCommandPaletteMatchRanges,
  useTerminal,
  type TCommandPaletteItem as VueTCommandPaletteItem,
  type TCommandPaletteMatchRange as VueTCommandPaletteMatchRange,
  type DialogButton as VueDialogButton,
  type SelectOptionWithStyle as VueSelectOptionWithStyle,
  type TFormHandle,
  type TInputPlugin,
  type TMermaidAsciiOptions,
  type TMermaidRenderer,
} from "@simon_he/vue-tui/vue";

import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  createDefaultTInputHostAdapter,
  defaultTInputHostPlugin,
  installTerminalCleanup,
  type CliOutput,
  type DirtyRowPatchMode,
  type StdinDriver,
  type StdoutRendererOptions,
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
  TMermaid as AgentMermaid,
  TMermaidText as AgentMermaidText,
  computeCommandPaletteMatchRanges,
  type TCommandPaletteItem as AgentTCommandPaletteItem,
  type TCommandPaletteMatchRange,
  TThinkingView,
  TToolCallView,
  TToolLogView,
  TUserMessageView,
  type TToolCallViewSlotProps,
} from "@simon_he/vue-tui/agent";
import {
  TMermaid as BeautifulMermaid,
  TMermaidText as BeautifulMermaidText,
  TBeautifulMermaidText,
  beautifulMermaidRenderer,
  createBeautifulMermaidRenderer,
  type TMermaidTextProps,
} from "@simon_he/vue-tui/mermaid";

const style: Style = { fg: "whiteBright", href: "https://example.com" };
const domOptions: DomRendererOptions = { links: true };
const linkConfig: DomRendererLinkConfig = {
  activation: "event",
  allowRelative: true,
  onActivate(href) {
    return href.length > 0;
  },
};
const formHandle: TFormHandle = {
  validate: () => true,
  submit: () => {},
  clearValidation: () => {},
  setFieldError: () => {},
};
void formHandle;
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
const commandPaletteItem: RootTCommandPaletteItem = {
  label: "Open",
  detail: "workspace",
  keywords: ["project"],
  disabled: false,
  value: { id: "open" },
};
const vueCommandPaletteItem: VueTCommandPaletteItem = {
  label: "Open",
  detail: "workspace",
  labelAccentRanges: [{ start: 0, end: 4 }],
};
const rootCommandPaletteRange: RootTCommandPaletteMatchRange = { start: 0, end: 4 };
const vueCommandPaletteRange: VueTCommandPaletteMatchRange = { start: 0, end: 4 };
const rootCommandPaletteRanges = computeRootCommandPaletteMatchRanges("Open workspace", "open");
const vueCommandPaletteRanges = computeVueCommandPaletteMatchRanges("Open workspace", "open");
const vueDialogButton: VueDialogButton = { label: "OK" };
const vueSelectOption: VueSelectOptionWithStyle = { label: "Remote", value: "remote" };
const mermaidOptions: TMermaidAsciiOptions = { paddingX: 1 };
const mermaidRenderer: TMermaidRenderer = (code, options) =>
  `${code}:${options.colorMode}:${options.useAscii ? "ascii" : "unicode"}`;
const mermaidTextProps: TMermaidTextProps = { x: 0, y: 0, w: 12 };
const createdMermaidRenderer = createBeautifulMermaidRenderer();
const agentCommandPaletteRange: TCommandPaletteMatchRange = { start: 0, end: 4 };
const agentCommandPaletteItem: AgentTCommandPaletteItem = {
  label: "Open",
  detailAccentRanges: [agentCommandPaletteRange],
  keywords: ["workspace"],
};
const agentCommandPaletteRanges = computeCommandPaletteMatchRanges("Open workspace", "open");

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
  TMermaid,
  TMermaidText,
  TMultilineModal,
  TPathPicker,
  TRenderLayer,
  TRenderPlane,
  TTransition,
  AgentMermaid,
  AgentMermaidText,
  BeautifulMermaid,
  BeautifulMermaidText,
  TBeautifulMermaidText,
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
  commandPaletteItem,
  vueCommandPaletteItem,
  rootCommandPaletteRange,
  vueCommandPaletteRange,
  rootCommandPaletteRanges,
  vueCommandPaletteRanges,
  vueDialogButton,
  vueSelectOption,
  mermaidOptions,
  mermaidRenderer,
  mermaidTextProps,
  beautifulMermaidRenderer,
  createdMermaidRenderer,
  agentCommandPaletteItem,
  agentCommandPaletteRanges,
);

const driver: StdinDriver | null = null;
const stdoutOutput: CliOutput = {
  fd: 1,
  columns: 80,
  rows: 24,
  write: () => {},
  on: () => {},
  off: () => {},
};
const stdoutPatchMode: DirtyRowPatchMode = "span";
const stdoutOptions: StdoutRendererOptions = {
  dirtyRowPatchMode: stdoutPatchMode,
  dirtySpanConservativeMaxCells: 16,
  colorMode: "ansi16",
  clear: false,
};
const stdoutInternalOptions: StdoutRendererOptions = {
  // @ts-expect-error __columnDiffMode is an internal benchmark override.
  __columnDiffMode: "multi-span",
};
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
  stdoutOutput,
  stdoutOptions,
  stdoutInternalOptions,
  cleanupHandle,
  signalPolicy,
  record,
  toolCallSlot,
  markdownRows,
  markdownLayoutRows,
);
