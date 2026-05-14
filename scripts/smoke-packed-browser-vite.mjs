import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tarball = process.argv[2];
if (!tarball) throw new Error("Usage: node scripts/smoke-packed-browser-vite.mjs <package.tgz>");

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const packageName = packageJson.name;
const vueVersion = packageJson.devDependencies?.vue ?? packageJson.peerDependencies?.vue ?? "vue";
const viteVersion = packageJson.devDependencies?.vite ?? "vite";
const dir = mkdtempSync(join(tmpdir(), "vue-tui-browser-smoke-"));

function run(command, args) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, { cwd: dir, stdio: "inherit" });
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
} catch (error) {
  console.error(`Packed browser Vite smoke project left at ${dir}`);
  throw error;
}

rmSync(dir, { recursive: true, force: true });
