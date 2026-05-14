import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tarball = process.argv[2];
if (!tarball)
  throw new Error("Usage: node scripts/smoke-packed-runtime.mjs <package.tgz> [vue-version]");
const vueVersion = process.argv[3] ?? "3.5.33";

const dir = mkdtempSync(join(tmpdir(), "vue-tui-runtime-smoke-"));

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, { cwd: dir, stdio: "inherit", ...options });
}

try {
  run("npm", ["init", "-y"]);
  run("npm", ["install", resolve(tarball), `vue@${vueVersion}`]);

  run("node", [
    "-e",
    `
const root = require("@simon_he/vue-tui");
const cli = require("@simon_he/vue-tui/cli");
const markdown = require("@simon_he/vue-tui/markdown");
const experimental = require("@simon_he/vue-tui/experimental");

if (!root.createTerminal) throw new Error("root CJS export missing");
if (!cli.createStdoutRenderer) throw new Error("cli CJS export missing");
if (!markdown.createTuiMarkdownParser) throw new Error("markdown CJS export missing");
if (!experimental.createAppendOnlyLogStore) throw new Error("experimental CJS export missing");

const parser = markdown.createTuiMarkdownParser();
const nodes = parser.parse("[safe](https://example.com)", true);
if (!Array.isArray(nodes) || nodes.length === 0) {
  throw new Error("markdown parser runtime smoke failed");
}

const store = experimental.createAppendOnlyLogStore({ maxLines: 4 });
store.appendLines(["one", "two", "three"]);
if (store.source.lineCount() < 3) {
  throw new Error("experimental append-only log store smoke failed");
}

const terminal = root.createTerminal({ cols: 20, rows: 4 });
terminal.write("hello", { x: 0, y: 0 });
terminal.commit();

if (terminal.snapshot().lines[0].slice(0, 5) !== "hello") {
  throw new Error("root createTerminal smoke failed");
}

const output = {
  isTTY: false,
  chunks: [],
  write(chunk) {
    this.chunks.push(String(chunk));
  },
};
const renderer = cli.createStdoutRenderer(terminal, {
  output,
  clear: false,
  hideCursor: false,
  altScreen: false,
});
renderer.render();
renderer.dispose();
terminal.dispose();

if (!output.chunks.join("").includes("hello")) {
  throw new Error("stdout renderer smoke failed");
}

console.log("CJS smoke ok");
`,
  ]);

  run("node", [
    "--input-type=module",
    "-e",
    `
import { createTerminal } from "@simon_he/vue-tui";
import { createStdoutRenderer } from "@simon_he/vue-tui/cli";
import { createTuiMarkdownParser } from "@simon_he/vue-tui/markdown";
import { createAppendOnlyLogStore } from "@simon_he/vue-tui/experimental";

if (!createTerminal) throw new Error("root ESM export missing");
if (!createStdoutRenderer) throw new Error("cli ESM export missing");
if (!createTuiMarkdownParser) throw new Error("markdown ESM export missing");
if (!createAppendOnlyLogStore) throw new Error("experimental ESM export missing");

const parser = createTuiMarkdownParser();
const nodes = parser.parse("[safe](https://example.com)", true);
if (!Array.isArray(nodes) || nodes.length === 0) {
  throw new Error("markdown parser ESM smoke failed");
}

const store = createAppendOnlyLogStore({ maxLines: 4 });
store.appendLines(["one", "two", "three"]);
if (store.source.lineCount() < 3) {
  throw new Error("experimental store ESM smoke failed");
}

const terminal = createTerminal({ cols: 20, rows: 4 });
terminal.write("esm", { x: 0, y: 0 });
terminal.commit();

const output = {
  isTTY: false,
  chunks: [],
  write(chunk) {
    this.chunks.push(String(chunk));
  },
};
const renderer = createStdoutRenderer(terminal, {
  output,
  clear: false,
  hideCursor: false,
  altScreen: false,
});
renderer.render();
renderer.dispose();
terminal.dispose();

if (!output.chunks.join("").includes("esm")) {
  throw new Error("ESM smoke failed");
}

console.log("ESM smoke ok");
`,
  ]);
} catch (error) {
  if (process.env.VUE_TUI_KEEP_SMOKE_DIR) {
    console.error(`Packed runtime smoke project left at ${dir}`);
  }
  throw error;
} finally {
  if (!process.env.VUE_TUI_KEEP_SMOKE_DIR) {
    rmSync(dir, { recursive: true, force: true });
  }
}
