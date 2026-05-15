import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  writeFileSync(
    join(dir, "tsconfig.json"),
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
    join(dir, "index.ts"),
    `
import { TerminalProvider, createTerminal, type Style, type TerminalEventRecord } from "@simon_he/vue-tui";
import { createStdoutRenderer, createTerminalApp, installTerminalCleanup } from "@simon_he/vue-tui/cli";
import { TMarkdownText, createTuiMarkdownParser } from "@simon_he/vue-tui/markdown";
import { TLogView, createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

const style: Style = { fg: "whiteBright", href: "https://example.com" };
const event: TerminalEventRecord = { type: "keydown", key: "Enter" };

console.log(
  createTerminal,
  TerminalProvider,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  createTuiMarkdownParser,
  TMarkdownText,
  TLogView,
  createAppendOnlyLogStore,
  style,
  event,
);
`,
  );

  run("npx", ["tsc", "--noEmit"]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
