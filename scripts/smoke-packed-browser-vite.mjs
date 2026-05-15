import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoBrowserForbiddenCode } from "./browser-forbidden-code.js";

const tarball = process.argv[2];
if (!tarball) throw new Error("Usage: node scripts/smoke-packed-browser-vite.mjs <package.tgz>");

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const packageName = packageJson.name;
const vueVersion = process.argv[3] ?? packageJson.devDependencies?.vue ?? "vue";
const viteVersion = packageJson.devDependencies?.vite ?? "vite";
const dir = mkdtempSync(join(tmpdir(), "vue-tui-browser-smoke-"));

function run(command, args) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, { cwd: dir, stdio: "inherit" });
}

function assertNoForbiddenBrowserCode() {
  const assetsDir = join(dir, "dist", "assets");
  const files = readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => join(assetsDir, name));

  if (!files.length) {
    throw new Error("Packed browser smoke did not emit any JS assets");
  }

  const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assertNoBrowserForbiddenCode(bundle, "Packed browser bundle");
}

try {
  run("npm", ["init", "-y"]);
  run("npm", ["install", resolve(tarball), `vue@${vueVersion}`, `vite@${viteVersion}`]);

  mkdirSync(join(dir, "src"));
  writeFileSync(
    join(dir, "index.html"),
    `<div id="app"></div><script type="module" src="/src/main.ts"></script>\n`,
  );
  writeFileSync(
    join(dir, "src/main.ts"),
    `
import { TerminalProvider, TText, createTerminal } from "${packageName}";
import { TMarkdownText } from "${packageName}/markdown";
import { TVirtualList } from "${packageName}/experimental";

console.log(TerminalProvider, TText, TMarkdownText, TVirtualList, createTerminal);
`,
  );

  run("npx", ["vite", "build"]);
  assertNoForbiddenBrowserCode();
} catch (error) {
  console.error(`Packed browser Vite smoke project left at ${dir}`);
  throw error;
}

rmSync(dir, { recursive: true, force: true });
