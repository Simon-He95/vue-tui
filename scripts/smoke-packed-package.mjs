import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = join(rootDir, ".tmp", "pack-smoke");
const existingTarball = process.argv[2];
if (!existingTarball) throw new Error("Usage: node scripts/smoke-packed-package.mjs <package.tgz>");

const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const packageName = packageJson.name;
const beautifulMermaidRange =
  packageJson.peerDependencies?.["beautiful-mermaid"] ??
  packageJson.devDependencies?.["beautiful-mermaid"];
const beautifulMermaidSpec = beautifulMermaidRange
  ? `beautiful-mermaid@${beautifulMermaidRange}`
  : "beautiful-mermaid";

function run(command, args, cwd = rootDir) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectExportTargets(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }

  if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectExportTargets(child, out);
  }

  return out;
}

function packageTargetPaths(pkg) {
  return Array.from(
    new Set(
      [pkg.main, pkg.module, pkg.types, ...collectExportTargets(pkg.exports)].filter(
        (target) => typeof target === "string" && target.startsWith("./"),
      ),
    ),
  );
}

function listTarEntries(tarballPath) {
  return execFileSync("tar", ["-tf", tarballPath], {
    encoding: "utf8",
    env: { ...process.env, LANG: "C", LC_ALL: "C" },
  })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function assertTarballContents(tarballPath) {
  const entries = listTarEntries(tarballPath);
  const requiredEntries = ["package/package.json", "package/README.md", "package/license"];
  const unexpectedEntries = entries.filter(
    (entry) =>
      entry !== "package/package.json" &&
      entry !== "package/README.md" &&
      entry !== "package/license" &&
      entry !== "package/dist/" &&
      !entry.startsWith("package/dist/"),
  );

  assert(
    unexpectedEntries.length === 0,
    `Unexpected tarball entries:\n${unexpectedEntries.join("\n")}`,
  );
  for (const entry of requiredEntries) {
    assert(entries.includes(entry), `Tarball is missing ${entry}`);
  }
  for (const target of packageTargetPaths(packageJson)) {
    const entry = `package/${target.slice(2)}`;
    assert(entries.includes(entry), `Tarball is missing export target ${entry}`);
  }

  const blockedRoots = ["src", "test", "examples", "docs", ".github"];
  for (const root of blockedRoots) {
    assert(
      !entries.some(
        (entry) => entry === `package/${root}/` || entry.startsWith(`package/${root}/`),
      ),
      `Tarball includes package/${root}/`,
    );
  }
}

function collectFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      collectFiles(path, out);
    } else {
      out.push({ path, size: stats.size });
    }
  }
  return out;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function printTarballSizeReport(tarballPath) {
  const extractDir = mkdtempSync(join(tmpdir(), "vue-tui-pack-size-"));
  try {
    execFileSync("tar", ["-xzf", tarballPath, "-C", extractDir], { stdio: "ignore" });
    const packageDir = join(extractDir, "package");
    const files = collectFiles(packageDir);
    const unpackedSize = files.reduce((sum, file) => sum + file.size, 0);
    const largestJs = files
      .filter((file) => file.path.endsWith(".js") || file.path.endsWith(".cjs"))
      .sort((a, b) => b.size - a.size)[0];
    const largestDts = files
      .filter((file) => file.path.endsWith(".d.ts") || file.path.endsWith(".d.cts"))
      .sort((a, b) => b.size - a.size)[0];

    console.log("Package size report:");
    console.log(`  tarball: ${formatBytes(statSync(tarballPath).size)}`);
    console.log(`  unpacked: ${formatBytes(unpackedSize)}`);
    if (largestJs) {
      console.log(
        `  largest JS: ${relative(packageDir, largestJs.path)} (${formatBytes(largestJs.size)})`,
      );
    }
    if (largestDts) {
      console.log(
        `  largest d.ts: ${relative(packageDir, largestDts.path)} (${formatBytes(largestDts.size)})`,
      );
    }
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

function assertInstalledExportTargets(smokeDir) {
  const packageInstallDir = join(smokeDir, "node_modules", ...packageName.split("/"));
  const installedPackageJson = readJson(join(packageInstallDir, "package.json"));
  for (const target of packageTargetPaths(installedPackageJson)) {
    const targetPath = join(packageInstallDir, target.slice(2));
    assert(existsSync(targetPath), `Installed package is missing ${target}`);
  }
}

function writeSmokeFiles(smokeDir) {
  writeFileSync(
    join(smokeDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );
  writeFileSync(
    join(smokeDir, "smoke-esm.mjs"),
    `import { h, nextTick } from "vue";
import { createDomRenderer, createTerminal, TBox, TText } from "${packageName}";
import { createTerminalApp, STDOUT_RENDERER_CAPABILITIES } from "${packageName}/cli";
import packageMetadata from "${packageName}/package.json" with { type: "json" };
import * as root from "${packageName}";
import * as markdown from "${packageName}/markdown";
import * as experimental from "${packageName}/experimental";
import * as experimentalVideoNode from "${packageName}/experimental/video/node";
import * as agent from "${packageName}/agent";
import * as mermaid from "${packageName}/mermaid";
import * as agentMermaid from "${packageName}/agent/mermaid";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(typeof createTerminal === "function", "root ESM createTerminal export is missing");
assert(!("createTerminalApp" in root), "root ESM export leaked createTerminalApp");
assert(typeof createTerminalApp === "function", "cli ESM createTerminalApp export is missing");
assert(typeof createDomRenderer === "function", "root ESM createDomRenderer export is missing");
assert(packageMetadata.name === "${packageName}", "package metadata ESM export is missing");
assert(!("TVirtualList" in root), "root ESM export leaked TVirtualList");
assert(typeof markdown.TMarkdownText !== "undefined", "markdown ESM TMarkdownText export is missing");
assert(typeof markdown.TVirtualMarkdown !== "undefined", "markdown ESM TVirtualMarkdown export is missing");
assert(typeof markdown.createTuiMarkdownParser === "function", "markdown ESM parser export is missing");
assert(typeof experimental.TVirtualList !== "undefined", "experimental ESM TVirtualList export is missing");
assert(typeof experimental.TLogView !== "undefined", "experimental ESM TLogView export is missing");
assert(typeof experimentalVideoNode.createFfmpegVideoFrameSource === "function", "experimental video/node ESM FFmpeg export is missing");
assert(typeof experimentalVideoNode.createYtDlpVideoFrameSource === "function", "experimental video/node ESM yt-dlp export is missing");
assert(typeof agent.TAgentTranscript !== "undefined", "agent ESM transcript alias is missing");
assert(typeof agent.TToolLogView !== "undefined", "agent ESM log alias is missing");
assert(typeof agent.TMermaidText !== "undefined", "agent ESM Mermaid primitive is missing");
assert(typeof mermaid.TMermaidText !== "undefined", "mermaid ESM TMermaidText export is missing");
assert(
  typeof mermaid.beautifulMermaidRenderer === "function",
  "mermaid ESM renderer export is missing",
);
assert(
  agentMermaid.TMermaidText === mermaid.TMermaidText,
  "agent/mermaid ESM wrapper should mirror mermaid entry",
);
assert(STDOUT_RENDERER_CAPABILITIES.domRows === false, "stdout capabilities are missing");

const terminal = createTerminal({ cols: 4, rows: 2 });
assert(terminal, "createTerminal did not return a terminal");
terminal.dispose();

const renderedMermaid = await mermaid.beautifulMermaidRenderer("flowchart LR\\n  A --> B", {
  colorMode: "none",
  useAscii: true,
});
assert(
  renderedMermaid.includes("A") && renderedMermaid.includes("B"),
  "mermaid ESM renderer did not render output",
);

function terminalText(app) {
  const size = app.terminal.size();
  return Array.from({ length: size.rows }, (_, y) =>
    app.terminal.getRow(y).map((cell) => cell.ch).join(""),
  ).join("\\n");
}

const log = experimental.createAppendOnlyLogStore({ maxLines: 8 });
log.appendLines([
  "INFO consumer boot",
  "WARN https://safe.dev",
  "ERROR retained index ready",
]);

const ConsumerApp = {
  name: "PackedConsumerSmoke",
  setup() {
    return () =>
      h(TBox, { x: 0, y: 0, w: 42, h: 8, title: "Consumer" }, {
        default: () => [
          h(TText, { x: 0, y: 0, w: 38, value: "root component mounted" }),
          h(experimental.TLogView, {
            x: 0,
            y: 2,
            w: 38,
            h: 3,
            source: log.source,
            version: log.version.value,
            links: true,
          }),
        ],
      });
  },
};

const app = createTerminalApp({
  cols: 42,
  rows: 8,
  component: ConsumerApp,
});
app.mount();
await nextTick();
app.scheduler.flushNow();
const screen = terminalText(app);
assert(screen.includes("Consumer"), "packed consumer did not render root TBox");
assert(screen.includes("root component mounted"), "packed consumer did not render root TText");
assert(screen.includes("INFO consumer boot"), "packed consumer did not render experimental TLogView line");
assert(screen.includes("https://safe.dev"), "packed consumer did not render TLogView link text");
app.dispose();
`,
  );
  writeFileSync(
    join(smokeDir, "smoke-cjs.cjs"),
    `const { h, nextTick } = require("vue");
const root = require("${packageName}");
const cli = require("${packageName}/cli");
const packageMetadata = require("${packageName}/package.json");
const markdown = require("${packageName}/markdown");
const experimental = require("${packageName}/experimental");
const experimentalVideoNode = require("${packageName}/experimental/video/node");
const agent = require("${packageName}/agent");
const mermaid = require("${packageName}/mermaid");
const agentMermaid = require("${packageName}/agent/mermaid");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(typeof root.createTerminal === "function", "root CJS createTerminal export is missing");
assert(!("createTerminalApp" in root), "root CJS export leaked createTerminalApp");
assert(typeof cli.createTerminalApp === "function", "cli CJS createTerminalApp export is missing");
assert(typeof root.createDomRenderer === "function", "root CJS createDomRenderer export is missing");
assert(packageMetadata.name === "${packageName}", "package metadata CJS export is missing");
assert(!("TVirtualList" in root), "root CJS export leaked TVirtualList");
assert(typeof markdown.TMarkdownText !== "undefined", "markdown CJS TMarkdownText export is missing");
assert(typeof markdown.TVirtualMarkdown !== "undefined", "markdown CJS TVirtualMarkdown export is missing");
assert(typeof markdown.createTuiMarkdownParser === "function", "markdown CJS parser export is missing");
assert(typeof experimental.TVirtualList !== "undefined", "experimental CJS TVirtualList export is missing");
assert(typeof experimental.TLogView !== "undefined", "experimental CJS TLogView export is missing");
assert(typeof experimentalVideoNode.createFfmpegVideoFrameSource === "function", "experimental video/node CJS FFmpeg export is missing");
assert(typeof experimentalVideoNode.createYtDlpVideoFrameSource === "function", "experimental video/node CJS yt-dlp export is missing");
assert(typeof agent.TAgentTranscript !== "undefined", "agent CJS transcript alias is missing");
assert(typeof agent.TToolLogView !== "undefined", "agent CJS log alias is missing");
assert(typeof agent.TMermaidText !== "undefined", "agent CJS Mermaid primitive is missing");
assert(typeof mermaid.TMermaidText !== "undefined", "mermaid CJS TMermaidText export is missing");
assert(
  typeof mermaid.beautifulMermaidRenderer === "function",
  "mermaid CJS renderer export is missing",
);
assert(
  agentMermaid.TMermaidText === mermaid.TMermaidText,
  "agent/mermaid CJS wrapper should mirror mermaid entry",
);
assert(cli.STDOUT_RENDERER_CAPABILITIES.domRows === false, "stdout capabilities are missing");

const terminal = root.createTerminal({ cols: 4, rows: 2 });
assert(terminal, "createTerminal did not return a terminal");
terminal.dispose();

function terminalText(app) {
  const size = app.terminal.size();
  return Array.from({ length: size.rows }, (_, y) =>
    app.terminal.getRow(y).map((cell) => cell.ch).join(""),
  ).join("\\n");
}

async function main() {
  const renderedMermaid = await mermaid.beautifulMermaidRenderer("flowchart LR\\n  A --> B", {
    colorMode: "none",
    useAscii: true,
  });
  assert(
    renderedMermaid.includes("A") && renderedMermaid.includes("B"),
    "mermaid CJS renderer did not render output",
  );

  const log = experimental.createAppendOnlyLogStore({ maxLines: 8 });
  log.appendLines([
    "INFO consumer boot",
    "WARN https://safe.dev",
    "ERROR retained index ready",
  ]);

  const ConsumerApp = {
    name: "PackedConsumerSmoke",
    setup() {
      return () =>
        h(root.TBox, { x: 0, y: 0, w: 42, h: 8, title: "Consumer" }, {
          default: () => [
            h(root.TText, { x: 0, y: 0, w: 38, value: "root component mounted" }),
            h(experimental.TLogView, {
              x: 0,
              y: 2,
              w: 38,
              h: 3,
              source: log.source,
              version: log.version.value,
              links: true,
            }),
          ],
        });
    },
  };

  const app = cli.createTerminalApp({
    cols: 42,
    rows: 8,
    component: ConsumerApp,
  });
  app.mount();
  await nextTick();
  app.scheduler.flushNow();
  const screen = terminalText(app);
  assert(screen.includes("Consumer"), "packed consumer did not render root TBox");
  assert(screen.includes("root component mounted"), "packed consumer did not render root TText");
  assert(screen.includes("INFO consumer boot"), "packed consumer did not render experimental TLogView line");
  assert(screen.includes("https://safe.dev"), "packed consumer did not render TLogView link text");
  app.dispose();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
  );
}

rmSync(smokeRoot, { recursive: true, force: true });

const tarballPath = resolve(existingTarball);
assert(existsSync(tarballPath), `Tarball does not exist: ${tarballPath}`);

assertTarballContents(tarballPath);
printTarballSizeReport(tarballPath);

for (const packageManager of ["pnpm", "npm"]) {
  const smokeDir = join(smokeRoot, packageManager);
  mkdirSync(smokeDir, { recursive: true });
  writeSmokeFiles(smokeDir);

  const tarballInstallPath = relative(smokeDir, tarballPath);
  const vueVersion = packageJson.devDependencies?.vue ?? packageJson.peerDependencies?.vue ?? "vue";

  try {
    if (packageManager === "pnpm") {
      run(
        "pnpm",
        [
          "add",
          "--ignore-workspace",
          tarballInstallPath,
          `vue@${vueVersion}`,
          beautifulMermaidSpec,
        ],
        smokeDir,
      );
    } else {
      run(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          tarballInstallPath,
          `vue@${vueVersion}`,
          beautifulMermaidSpec,
        ],
        smokeDir,
      );
    }
    assertInstalledExportTargets(smokeDir);
    run("node", ["smoke-esm.mjs"], smokeDir);

    if (packageTargetPaths(packageJson).some((target) => target.endsWith(".cjs"))) {
      run("node", ["smoke-cjs.cjs"], smokeDir);
    }
  } catch (error) {
    console.error(`Packed package ${packageManager} smoke project left at ${smokeDir}`);
    throw error;
  }
}

rmSync(smokeRoot, { recursive: true, force: true });
console.log(`Packed package smoke passed with pnpm and npm: ${relative(rootDir, tarballPath)}`);
