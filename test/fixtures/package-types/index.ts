import {
  TerminalProvider,
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
  installTerminalCleanup,
  type StdinDriver,
} from "@simon_he/vue-tui/cli";

import { TMarkdownText, createTuiMarkdownParser } from "@simon_he/vue-tui/markdown";

import { TLogView, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

const style: Style = { fg: "whiteBright", href: "https://example.com" };
const terminal: Terminal = createTerminal({ cols: 80, rows: 24 });
const runtime = createRuntime();

console.log(
  TerminalProvider,
  TText,
  TMarkdownText,
  TLogView,
  createTerminalApp,
  createStdoutRenderer,
  createStdinDriver,
  installTerminalCleanup,
  createTuiMarkdownParser,
  createAppendOnlyLogStore,
  sanitizeDomHref,
  style,
  terminal,
  runtime,
);

const driver: StdinDriver | null = null;
const record: TerminalEventRecord = { type: "keydown", key: "Enter" };
console.log(driver, record);
