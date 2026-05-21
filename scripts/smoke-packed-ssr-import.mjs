import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tarball = process.argv[2];
if (!tarball) throw new Error("Usage: node scripts/smoke-packed-ssr-import.mjs <package.tgz>");

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const packageName = packageJson.name;
const vueVersion = packageJson.devDependencies?.vue ?? packageJson.peerDependencies?.vue ?? "vue";
const viteVersion = packageJson.devDependencies?.vite ?? "vite";
const dir = mkdtempSync(join(tmpdir(), "vue-tui-ssr-import-smoke-"));

function run(command, args) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, { cwd: dir, stdio: "inherit" });
}

try {
  const tarballPath = resolve(tarball);
  if (!existsSync(tarballPath)) throw new Error(`Tarball does not exist: ${tarballPath}`);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );

  mkdirSync(join(dir, "src"));
  writeFileSync(
    join(dir, "vite.config.ts"),
    `import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    noExternal: ["${packageName}"],
  },
});
`,
  );
  writeFileSync(
    join(dir, "src/entry-server.ts"),
    `import * as root from "${packageName}";
import * as core from "${packageName}/core";
import * as runtime from "${packageName}/runtime";
import * as rendererDom from "${packageName}/renderer/dom";
import * as observability from "${packageName}/observability";
import * as vueEntry from "${packageName}/vue";
import * as markdown from "${packageName}/markdown";
import * as experimental from "${packageName}/experimental";
import * as agent from "${packageName}/agent";

const ok = Boolean(
  root.createTerminal &&
    core.charCellWidth &&
    runtime.createRuntime &&
    rendererDom.createDomRenderer &&
    observability.createTraceStore &&
    vueEntry.TerminalProvider &&
    markdown.TMarkdownText &&
    experimental.TVirtualList &&
    agent.TAgentTranscript,
);

if (!ok) throw new Error("SSR import smoke did not load every public import target");
if (typeof document !== "undefined") throw new Error("SSR import smoke unexpectedly found document");
if (typeof window !== "undefined") throw new Error("SSR import smoke unexpectedly found window");

console.log("vue-tui-ssr-import-smoke", ok);
`,
  );

  run("npm", [
    "install",
    "--no-audit",
    "--no-fund",
    tarballPath,
    `vue@${vueVersion}`,
    `vite@${viteVersion}`,
  ]);
  run("npx", ["vite", "build", "--ssr", "src/entry-server.ts"]);
  run("node", ["dist/entry-server.js"]);
} catch (error) {
  console.error(`Packed SSR import smoke project left at ${dir}`);
  throw error;
}

rmSync(dir, { recursive: true, force: true });
console.log(`Packed SSR import smoke passed: ${tarball}`);
