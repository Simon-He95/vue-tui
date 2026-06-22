import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tarball = process.argv[2];
const vueVersion = process.argv[3] ?? "3.5.33";
if (!tarball) {
  throw new Error("Usage: node scripts/smoke-packed-types.mjs <package.tgz> [vue-version]");
}

const dir = mkdtempSync(join(tmpdir(), "vue-tui-types-smoke-"));

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: dir, stdio: "inherit" });
}

try {
  run("npm", ["init", "-y"]);
  run("npm", [
    "install",
    resolve(tarball),
    `vue@${vueVersion}`,
    "typescript@^5.5.0",
    "@types/node@^18.19.0",
  ]);

  const packageJsonPath = join(dir, "package.json");
  writeFileSync(
    packageJsonPath,
    JSON.stringify(
      {
        ...JSON.parse(readFileSync(packageJsonPath, "utf8")),
        type: "module",
      },
      null,
      2,
    ),
  );

  const source = `
import { TerminalProvider, TBox, TText, createTerminal, type Style } from "@simon_he/vue-tui";
import { createDomRenderer, type DomRendererOptions } from "@simon_he/vue-tui/renderer/dom";
import type { TerminalEventRecord } from "@simon_he/vue-tui/runtime";
import { TAnchor, TDebugOverlay, TFlex, TFlexItem, TFlow, TInputBox, TJsonEditor, TMultilineModal, TPathPicker, TRenderLayer, TRenderPlane, TTransition, useTerminal, type TInputPlugin } from "@simon_he/vue-tui/vue";
import { createDefaultTInputHostAdapter, createStdoutRenderer, createTerminalApp, defaultTInputHostPlugin, installTerminalCleanup, type TerminalCleanupSignalPolicy } from "@simon_he/vue-tui/cli";
import { TMarkdownText, createTuiMarkdownParser } from "@simon_he/vue-tui/markdown";
import { TLogView, TVirtualList, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";
import { TAgentTranscript, TToolLogView } from "@simon_he/vue-tui/agent";

const style: Style = { fg: "whiteBright", href: "https://example.com" };
const domOptions: DomRendererOptions = { links: true };
const event: TerminalEventRecord = { type: "keydown", key: "Enter" };
const plugin: TInputPlugin = { name: "test", install: () => {} };
const signalPolicy: TerminalCleanupSignalPolicy = "cleanup-only";

console.log(
  createTerminal,
  TerminalProvider,
  TBox,
  TText,
  createDomRenderer,
  TAnchor,
  TDebugOverlay,
  TFlex,
  TFlexItem,
  TFlow,
  TInputBox,
  TJsonEditor,
  TMultilineModal,
  TPathPicker,
  TRenderLayer,
  TRenderPlane,
  TTransition,
  useTerminal,
  createStdoutRenderer,
  createTerminalApp,
  createDefaultTInputHostAdapter,
  defaultTInputHostPlugin,
  installTerminalCleanup,
  createTuiMarkdownParser,
  TMarkdownText,
  TLogView,
  TVirtualList,
  TAgentTranscript,
  TToolLogView,
  createAppendOnlyLogStore,
  style,
  domOptions,
  event,
  plugin,
  signalPolicy,
);
`;

  writeFileSync(join(dir, "index.ts"), source);
  writeFileSync(
    join(dir, "index.cts"),
    `
const root = require("@simon_he/vue-tui");
const cli = require("@simon_he/vue-tui/cli");

root.createTerminal({ cols: 80, rows: 24 });
cli.createStdoutRenderer;
`,
  );

  writeFileSync(
    join(dir, "tsconfig.bundler.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: false,
        },
        include: ["index.ts"],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(dir, "tsconfig.node.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "CommonJS",
          moduleResolution: "node",
          strict: true,
          skipLibCheck: false,
        },
        include: ["index.ts"],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(dir, "tsconfig.node16.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "Node16",
          moduleResolution: "Node16",
          strict: true,
          skipLibCheck: false,
          types: ["node"],
        },
        include: ["index.ts"],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(dir, "tsconfig.nodenext.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: false,
          types: ["node"],
        },
        include: ["index.ts"],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(dir, "tsconfig.cjs.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "Node16",
          moduleResolution: "Node16",
          strict: true,
          skipLibCheck: false,
          types: ["node"],
        },
        include: ["index.cts"],
      },
      null,
      2,
    ),
  );

  run("npx", ["tsc", "-p", "tsconfig.bundler.json", "--noEmit"]);
  run("npx", ["tsc", "-p", "tsconfig.node.json", "--noEmit"]);
  run("npx", ["tsc", "-p", "tsconfig.node16.json", "--noEmit"]);
  run("npx", ["tsc", "-p", "tsconfig.nodenext.json", "--noEmit"]);
  run("npx", ["tsc", "-p", "tsconfig.cjs.json", "--noEmit"]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
