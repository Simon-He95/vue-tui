import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate browser smoke port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function waitForUrl(url) {
  const deadline = Date.now() + 15000;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {}

      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(poll, 100);
    };
    poll();
  });
}

async function assertBrowserRuntimeSmoke() {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += String(chunk);
  });
  server.stderr.on("data", (chunk) => {
    logs += String(chunk);
  });

  try {
    await waitForUrl(url);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const consoleFailures = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleFailures.push(message.text());
      });
      page.on("pageerror", (error) => {
        consoleFailures.push(error.message);
      });

      await page.goto(url, { waitUntil: "networkidle" });
      const ok = await page.evaluate(() => globalThis.__VUE_TUI_BROWSER_SMOKE__ === true);

      if (!ok) throw new Error("Packed browser smoke imports did not initialize");
      if (consoleFailures.length) {
        throw new Error(
          `Packed browser smoke emitted console errors:\n${consoleFailures.join("\n")}`,
        );
      }
    } finally {
      await browser.close();
    }
  } catch (error) {
    if (logs.trim()) console.error(logs.trim());
    throw error;
  } finally {
    server.kill();
  }
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

const terminal = createTerminal({ cols: 4, rows: 1 });
terminal.write("OK", { x: 0, y: 0 });

globalThis.__VUE_TUI_BROWSER_SMOKE__ = Boolean(
  TerminalProvider &&
    TText &&
    TMarkdownText &&
    TVirtualList &&
    terminal.snapshot().lines[0]?.startsWith("OK"),
);

console.log("vue-tui-browser-smoke", globalThis.__VUE_TUI_BROWSER_SMOKE__);
`,
  );

  run("npx", ["vite", "build"]);
  assertNoForbiddenBrowserCode();
  await assertBrowserRuntimeSmoke();
} catch (error) {
  console.error(`Packed browser Vite smoke project left at ${dir}`);
  throw error;
}

rmSync(dir, { recursive: true, force: true });
