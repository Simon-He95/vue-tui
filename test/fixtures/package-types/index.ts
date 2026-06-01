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
  computeCommandPaletteMatchRanges,
  type TCommandPaletteItem as AgentTCommandPaletteItem,
  type TCommandPaletteMatchRange,
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
const formHandle: TFormHandle = {
  validate: () => true,
  submit: () => {},
  clearValidation: () => {},
  setFieldError: () => {},
};
void formHandle;
const terminal: Terminal = createTerminal({ cols: 80, rows: 24 });
const terminalWithoutFingerprintHooks: Omit<Terminal, "setFingerprintFn" | "getRowFingerprints"> =
  terminal;
const structuralTerminal: Terminal = terminalWithoutFingerprintHooks;
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
  structuralTerminal,
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
  agentCommandPaletteItem,
  agentCommandPaletteRanges,
);

const driver: StdinDriver | null = null;
const stdoutOutput: CliOutput = { write: () => {} };
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
