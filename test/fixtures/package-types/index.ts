import {
  TerminalProvider,
  TBox,
  TText,
  createTerminal,
  type Style,
  type Terminal,
} from "@simon_he/vue-tui";

import { sanitizeDomHref } from "@simon_he/vue-tui/core";
import { createDomRenderer, type DomRendererOptions } from "@simon_he/vue-tui/renderer/dom";
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

import { TMarkdownText, createTuiMarkdownParser } from "@simon_he/vue-tui/markdown";

import { TLogView, TVirtualList, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

const style: Style = { fg: "whiteBright", href: "https://example.com" };
const domOptions: DomRendererOptions = { links: true };
const terminal: Terminal = createTerminal({ cols: 80, rows: 24 });
const runtime = createRuntime();
const plugin: TInputPlugin = { name: "test", install: () => {} };

console.log(
  TerminalProvider,
  TBox,
  TText,
  TMarkdownText,
  TLogView,
  TVirtualList,
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
  terminal,
  runtime,
  plugin,
);

const driver: StdinDriver | null = null;
const cleanupHandle: TerminalCleanupHandle | null = null;
const signalPolicy: TerminalCleanupSignalPolicy = "cleanup-only";
const record: TerminalEventRecord = { type: "keydown", key: "Enter" };
console.log(driver, cleanupHandle, signalPolicy, record);
