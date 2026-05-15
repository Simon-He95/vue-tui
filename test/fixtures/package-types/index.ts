import {
  TerminalProvider,
  TBox,
  TText,
  createRuntime,
  createTerminal,
  sanitizeDomHref,
  type Style,
  type Terminal,
  type TerminalEventRecord,
} from "@simon_he/vue-tui";

import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  createDefaultTInputHostAdapter,
  defaultTInputHostPlugin,
  installTerminalCleanup,
  type StdinDriver,
  type TerminalCleanupSignalPolicy,
} from "@simon_he/vue-tui/cli";

import { TMarkdownText, createTuiMarkdownParser } from "@simon_he/vue-tui/markdown";

import { TLogView, TVirtualList, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

const style: Style = { fg: "whiteBright", href: "https://example.com" };
const terminal: Terminal = createTerminal({ cols: 80, rows: 24 });
const runtime = createRuntime();

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
  createDefaultTInputHostAdapter,
  defaultTInputHostPlugin,
  installTerminalCleanup,
  createTuiMarkdownParser,
  createAppendOnlyLogStore,
  sanitizeDomHref,
  style,
  terminal,
  runtime,
);

const driver: StdinDriver | null = null;
const signalPolicy: TerminalCleanupSignalPolicy = "cleanup-only";
const record: TerminalEventRecord = { type: "keydown", key: "Enter" };
console.log(driver, signalPolicy, record);
