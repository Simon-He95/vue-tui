import type { Terminal } from "@simon_he/vue-tui/core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import process from "node:process";
import { nextTick } from "vue";
import {
  createStdoutRenderer,
  createTerminalApp,
  detectTerminalGraphicsCapabilities,
  type CliOutput,
} from "@simon_he/vue-tui/cli";
import {
  createLoadingStatus,
  fetchLiveSnapshot,
  makeCardComponent,
  openExternalHref,
  readCachedSnapshot,
  renderComponent,
  resolveUsernameArg,
  terminalAnsi,
} from "../src/cli.ts";
import { parseProfile } from "../src/github-data.ts";
import { fetchText } from "../src/network.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const testOutputRoot = join(repoRoot, "test-results", "simon-terminal-card-e2e");

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function terminalRows(terminal: Terminal): string[] {
  const size = terminal.size();
  const rows: string[] = [];
  for (let y = 0; y < size.rows; y++) {
    rows.push(
      terminal
        .getRow(y)
        .map((cell) => (cell.continuation ? "" : cell.ch))
        .join("")
        .trimEnd(),
    );
  }
  return rows;
}

function terminalText(terminal: Terminal): string {
  return terminalRows(terminal).join("\n");
}

function stripAnsi(value: string): string {
  const esc = "\\u001B";
  return value
    .replace(new RegExp(`${esc}\\][\\s\\S]*?(?:\\u0007|${esc}\\\\)`, "gu"), "")
    .replace(new RegExp(`${esc}\\[[0-?]*[ -/]*[@-~]`, "gu"), "");
}

function sameUrl(raw: string, expectedHref: string): boolean {
  try {
    const actual = new URL(raw);
    const expected = new URL(expectedHref);
    return (
      actual.protocol === expected.protocol &&
      actual.hostname === expected.hostname &&
      actual.pathname === expected.pathname &&
      actual.search === expected.search &&
      actual.hash === expected.hash
    );
  } catch {
    return false;
  }
}

function hasVisibleUrl(value: string, expectedHref: string): boolean {
  for (const candidate of value.split(/\s+/u)) {
    if (sameUrl(candidate, expectedHref)) return true;
  }
  return false;
}

function hasOsc8Href(value: string, expectedHref: string): boolean {
  const prefix = "\u001B]8;;";
  let index = 0;
  while (index < value.length) {
    const start = value.indexOf(prefix, index);
    if (start < 0) return false;
    const hrefStart = start + prefix.length;
    const belEnd = value.indexOf("\u0007", hrefStart);
    const stEnd = value.indexOf("\u001B\\", hrefStart);
    const end = belEnd < 0 ? stEnd : stEnd < 0 ? belEnd : Math.min(belEnd, stEnd);
    if (end >= hrefStart && sameUrl(value.slice(hrefStart, end), expectedHref)) return true;
    index = hrefStart;
  }
  return false;
}

function assertNoScreenControl(value: string, label: string): void {
  const esc = "\\u001B";
  assert(!value.includes("\u001B[2J"), `${label} should not clear the screen`);
  assert(!value.includes("\u001B[H"), `${label} should not move cursor home`);
  assert(!value.includes("\u001B[?7l"), `${label} should not disable line wrapping`);
  assert(!new RegExp(`${esc}\\[[0-9;]+H`, "u").test(value), `${label} should not address cursor`);
}

function findCellText(terminal: Terminal, needle: string): { x: number; y: number } {
  const rows = terminalRows(terminal);
  for (let y = 0; y < rows.length; y++) {
    const x = rows[y]!.indexOf(needle);
    if (x >= 0) return { x, y };
  }
  throw new Error(`Could not find "${needle}" in terminal output`);
}

function pngAlphaAt(pngBase64: string, x: number, y: number): number {
  const png = Buffer.from(pngBase64, "base64");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert(data[8] === 8 && data[9] === 6, "cached avatar should be an 8-bit RGBA PNG");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  assert(x >= 0 && x < width && y >= 0 && y < height, "PNG alpha coordinate is in bounds");
  const stride = width * 4;
  const inflated = inflateSync(Buffer.concat(idat));
  assert(inflated[y * (stride + 1)] === 0, "cached avatar PNG should use unfiltered rows");
  return inflated[y * (stride + 1) + 1 + x * 4 + 3]!;
}

async function settle(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await new Promise((resolveSettle) => setTimeout(resolveSettle, 0));
    await nextTick();
    app.scheduler.flushNow();
  }
}

function runCommand(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new Error(`${command} timed out`));
    }, options.timeoutMs ?? 60_000);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) resolveRun({ stdout: out, stderr: err });
      else rejectRun(new Error(`${command} exited ${code}\n${out}\n${err}`));
    });
  });
}

function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    previous.set(key, process.env[key]);
    const value = env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function verifyCachedCardRender(): Promise<void> {
  const snapshot = readCachedSnapshot();
  assert(snapshot, "cached Simon-He95 snapshot should be bundled");
  assert(snapshot.profile.login === "Simon-He95", "cached profile login should be Simon-He95");
  assert(
    snapshot.profile.html_url === "https://github.com/Simon-He95",
    "cached profile should include Simon's GitHub URL",
  );
  const avatarPngBase64 = snapshot.avatarPngBase64;
  assert(avatarPngBase64 && avatarPngBase64.length > 1_000, "PNG avatar cached");
  assert(pngAlphaAt(avatarPngBase64, 0, 0) === 0, "PNG avatar should have transparent corners");
  assert(pngAlphaAt(avatarPngBase64, 80, 80) > 240, "PNG avatar center should remain opaque");
  assert(snapshot.contributions.days.length >= 300, "cached contribution calendar has enough days");
  assert(
    /contribution/u.test(snapshot.contributions.totalText),
    "cached contribution summary is present",
  );
  assert(
    snapshot.avatar.some((cell) => cell.ch === "S" && cell.style.bold) &&
      snapshot.avatar.some((cell) => cell.ch === "H" && cell.style.bold) &&
      snapshot.avatar.some((cell) => cell.style.bg === "#38bdf8") &&
      snapshot.avatar.some((cell) => cell.style.bg === "#22c55e"),
    "fallback avatar should be a clean circular initials badge",
  );

  const opened: string[] = [];
  const rendered = await renderComponent(
    makeCardComponent({
      ...snapshot,
      source: "cached",
      avatarMode: "cells",
    }),
    {
      openExternal(href) {
        opened.push(href);
        return true;
      },
    },
  );
  try {
    const text = terminalText(rendered.terminal);
    assert(text.includes("Simon He"), "card should render Simon's name");
    assert(text.includes("@Simon-He95"), "card should render GitHub handle");
    assert(text.includes("love ❤️"), "card should preserve the original heart emoji text");
    assert(text.includes("GitHub contributions"), "card should label the graph section");
    assert(
      text.includes("cached fallback from"),
      "card should identify cached fallback data when rendered from cache",
    );
    assert(
      [...text].filter((char) => char === "■").length > 120,
      "card should render the TContributionGraph block cells",
    );

    const githubUrl = "https://github.com/Simon-He95";
    const projectRepoUrl = "https://github.com/Simon-He95/vue-tui";
    const projectLink = findCellText(rendered.terminal, "@simon_he/vue-tui");
    const link = findCellText(rendered.terminal, githubUrl);
    const graphTitle = findCellText(rendered.terminal, "GitHub contributions");
    const rows = terminalRows(rendered.terminal);
    assert(
      rows[graphTitle.y - 1]!.slice(1, -1).trim() === "",
      "graph title should have an empty row above",
    );
    assert(
      rows[graphTitle.y + 1]!.slice(1, -1).trim() === "",
      "graph title should have an empty row below",
    );
    assert(
      rendered.terminal.getCell(link.x, link.y).style.href === githubUrl,
      "GitHub URL should be rendered as a terminal link",
    );
    assert(
      rendered.terminal.getCell(projectLink.x, projectLink.y).style.href === projectRepoUrl,
      "vue-tui label should link to the GitHub repository",
    );
    const afterProjectLink = rendered.terminal.getCell(
      projectLink.x + "@simon_he/vue-tui".length,
      projectLink.y,
    );
    assert(
      afterProjectLink.style.href !== projectRepoUrl && !afterProjectLink.style.underline,
      "vue-tui repository underline should stop after the label text",
    );
    const afterLink = rendered.terminal.getCell(link.x + githubUrl.length, link.y);
    assert(
      afterLink.style.href !== githubUrl && !afterLink.style.underline,
      "GitHub URL underline should stop after the URL text",
    );
    rendered.events.dispatch({ type: "pointerdown", cellX: link.x, cellY: link.y, button: 0 });
    rendered.events.dispatch({ type: "click", cellX: link.x, cellY: link.y, button: 0 });
    await Promise.resolve();
    assert(opened[0] === "https://github.com/Simon-He95", "click should open GitHub URL");
  } finally {
    rendered.dispose();
  }
}

async function verifyAppleTerminalAnsiFallback(): Promise<void> {
  const snapshot = readCachedSnapshot();
  assert(snapshot, "cached Simon-He95 snapshot should be bundled");
  const rendered = await renderComponent(
    makeCardComponent({
      ...snapshot,
      source: "cached",
      avatarMode: "cells",
    }),
  );
  try {
    const ansi = terminalAnsi(rendered.terminal, [], {
      env: {
        TERM_PROGRAM: "Apple_Terminal",
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
      isTTY: true,
      manageCursor: true,
      platform: "darwin",
    });
    assert(
      ansi.startsWith("\u001B[?25l"),
      "Apple Terminal output should hide the cursor while painting",
    );
    assert(
      ansi.endsWith("\u001B[?25h"),
      "Apple Terminal output should restore the cursor after painting",
    );
    assert(
      ansi.includes("\u001B[48;5;16m"),
      "Apple Terminal output should render the card background with ANSI256 black",
    );
    assert(
      ansi.includes("\u001B[38;5;"),
      "Apple Terminal output should render hex foreground colors with ANSI256",
    );
    assert(
      !ansi.includes("\u001B[48;2;"),
      "Apple Terminal output should not emit truecolor backgrounds",
    );
    assert(
      !ansi.includes("\u001B[38;2;"),
      "Apple Terminal output should not emit truecolor foregrounds",
    );
    const heartLine = ansi.split("\n").find((line) => line.includes("❤️"));
    assert(heartLine, "Apple Terminal output should include the heart emoji row");
    assert(
      heartLine.includes("\u001B[80X"),
      "Apple Terminal emoji rows should paint the full row background before overlays",
    );
    assert(
      heartLine.includes("\u001B[80G"),
      "Apple Terminal emoji rows should place the right border by absolute column",
    );
    assert(
      !heartLine.includes("❤️\u001B[0m\u001B[37m\u001B[48;5;16m "),
      "Apple Terminal emoji rows should not append a width-dependent continuation space",
    );
  } finally {
    rendered.dispose();
  }
}

async function verifyLiveProfileHtmlParsing(): Promise<void> {
  const html = await fetchText("https://github.com/Simon-He95");
  const profile = parseProfile(html, "Simon-He95");
  assert(profile.login === "Simon-He95", "live profile HTML should parse login");
  assert(
    profile.html_url === "https://github.com/Simon-He95",
    "live profile HTML should parse URL",
  );
  assert(
    profile.avatar_url.includes("avatars.githubusercontent.com"),
    "live profile HTML should parse avatar CDN URL",
  );
  assert(profile.name === "Simon He", "live profile HTML should parse display name");
  assert(profile.bio?.includes("laziness"), "live profile HTML should parse bio text");
  assert(profile.location === "Shanghai", "live profile HTML should parse location");
  assert(profile.blog === "simonhe.me", "live profile HTML should parse website text");
  assert(profile.company?.includes("@vue-vine"), "live profile HTML should parse organizations");
  assert(profile.public_repos > 0, "live profile HTML should parse repository count");
  assert(profile.followers > 0, "live profile HTML should parse followers count");
  assert(profile.following > 0, "live profile HTML should parse following count");
}

async function verifyLiveSnapshotLoadingStates(): Promise<void> {
  const messages: string[] = [];
  const snapshot = await fetchLiveSnapshot("Simon-He95", readCachedSnapshot(), {
    set(message) {
      messages.push(message);
    },
    stop() {},
  });
  assert(
    messages.includes("Fetching GitHub profile page and contribution calendar..."),
    "live snapshot should show GitHub page fetching loading state",
  );
  assert(
    messages.includes("Parsing GitHub profile and contribution data..."),
    "live snapshot should show GitHub HTML parsing loading state",
  );
  assert(
    messages.includes("Rendering terminal avatar..."),
    "live snapshot should show avatar rendering loading state",
  );
  assert(snapshot.profile.login === "Simon-He95", "live snapshot should parse profile login");
  assert(snapshot.profile.name === "Simon He", "live snapshot should parse profile display name");
  assert(snapshot.contributions.days.length >= 300, "live snapshot should parse contribution days");
}

function verifyUsernameArgs(): void {
  assert(resolveUsernameArg([]) === "Simon-He95", "empty args should use Simon-He95");
  assert(resolveUsernameArg(["antfu"]) === "antfu", "positional arg should select GitHub user");
  assert(resolveUsernameArg(["@antfu"]) === "antfu", "positional @user should be normalized");
  assert(resolveUsernameArg(["--user", "antfu"]) === "antfu", "--user should select GitHub user");
  assert(
    resolveUsernameArg(["--user=antfu"]) === "antfu",
    "--user=value should select GitHub user",
  );
  assert(
    resolveUsernameArg(["--out", "/tmp/card", "antfu"]) === "antfu",
    "positional user should ignore --out value",
  );
  assert(
    resolveUsernameArg(["antfu", "--user", "Simon-He95"]) === "Simon-He95",
    "--user should override positional user",
  );
}

async function verifyGraphicAvatarRender(): Promise<void> {
  const snapshot = readCachedSnapshot();
  assert(snapshot?.avatarPngBase64, "cached PNG avatar is required for graphic render test");
  const captured = await renderComponent(
    makeCardComponent({
      ...snapshot,
      source: "cached",
      avatarMode: "graphic",
    }),
    {
      graphicsCapabilities: detectTerminalGraphicsCapabilities({
        stdoutIsTTY: true,
        env: { GHOSTTY_RESOURCES_DIR: "/Applications/Ghostty.app/Contents/Resources" },
      }),
    },
  );
  try {
    assert(
      captured.graphics.some((graphic) => graphic.sequence.includes("\u001B_G")),
      "Ghostty-capable render should capture a real Kitty PNG avatar payload",
    );
  } finally {
    captured.dispose();
  }

  const writes: string[] = [];
  const output: CliOutput = {
    isTTY: true,
    columns: 96,
    rows: 27,
    write(chunk) {
      writes.push(String(chunk));
    },
  };
  const app = createTerminalApp({
    cols: 96,
    rows: 27,
    component: makeCardComponent({
      ...snapshot,
      source: "cached",
      avatarMode: "graphic",
    }),
    defaultStyle: { fg: "whiteBright", bg: "#0d1117" },
  });
  const renderer = withEnv(
    {
      KITTY_WINDOW_ID: "1",
      TERM_PROGRAM: "kitty",
      CI: undefined,
      TMUX: undefined,
    },
    () =>
      createStdoutRenderer(app.terminal, {
        output,
        clear: false,
        altScreen: false,
        hideCursor: false,
        trackResize: false,
      }),
  );
  try {
    app.mount();
    await settle(app);
    (renderer.render as (dirtyRows?: readonly number[] | null, sync?: boolean) => void)(null, true);
    assert(
      writes.join("").includes("\u001B_G"),
      "Kitty-capable terminals should receive a real image",
    );
  } finally {
    renderer.dispose();
    app.dispose();
  }
}

async function verifyLoadingStatus(): Promise<void> {
  const previousIsTTY = process.stderr.isTTY;
  const previousWrite = process.stderr.write;
  const writes: string[] = [];
  Object.defineProperty(process.stderr, "isTTY", {
    configurable: true,
    value: true,
  });
  process.stderr.write = ((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const loading = createLoadingStatus();
    loading.set("Fetching GitHub resources...");
    await new Promise((resolveLoading) => setTimeout(resolveLoading, 140));
    loading.stop("Rendered.");
  } finally {
    process.stderr.write = previousWrite;
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: previousIsTTY,
    });
  }
  const output = writes.join("");
  assert(output.includes("Fetching GitHub resources..."), "loading status should show fetch work");
  assert(output.includes("Rendered."), "loading status should clear with final message");
}

async function verifyOfflineFallback(): Promise<void> {
  const outDir = join(testOutputRoot, "offline");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const preload = join(outDir, "offline-preload.mjs");
  writeFileSync(
    preload,
    [
      'import childProcess from "node:child_process";',
      'import { syncBuiltinESMExports } from "node:module";',
      'globalThis.fetch = async () => { throw new Error("offline e2e"); };',
      'childProcess.execFileSync = () => { throw new Error("offline e2e curl"); };',
      "syncBuiltinESMExports();",
      "",
    ].join("\n"),
  );
  const result = await runCommand(process.execPath, ["dist/cli.js", "--no-ansi", "--out", outDir], {
    cwd: packageRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: `--import=${preload}`,
    },
    timeoutMs: 90_000,
  });
  const txtPath = join(outDir, "simon-terminal-card.txt");
  assert(existsSync(txtPath), "offline fallback should still write a text snapshot");
  const txt = readFileSync(txtPath, "utf8");
  assert(txt.includes("cached fallback from"), "offline fallback should render cached data");
  assert(
    result.stderr.includes("GitHub fetch failed; using cached snapshot."),
    "offline fallback should report that cached data was used",
  );
}

async function verifyDirectStdoutRender(): Promise<void> {
  const result = await runCommand(process.execPath, ["dist/cli.js"], {
    cwd: packageRoot,
    timeoutMs: 90_000,
  });
  const text = stripAnsi(result.stdout);
  assert(text.includes("GitHub activity card"), "direct command should print the card to stdout");
  assert(text.includes("live GitHub data"), "direct command should render live GitHub data");
  assert(text.includes("Simon He"), "direct command stdout should include Simon's profile");
  assert(text.includes("love ❤️"), "direct command stdout should preserve the heart emoji");
  assert(text.includes("GitHub contributions"), "direct command stdout should include the graph");
  const githubUrl = "https://github.com/Simon-He95";
  const projectRepoUrl = "https://github.com/Simon-He95/vue-tui";
  assert(hasVisibleUrl(text, githubUrl), "direct command stdout should include the GitHub link");
  assert(
    hasOsc8Href(result.stdout, projectRepoUrl),
    "direct command stdout should link the vue-tui repository label",
  );
  assert(
    result.stdout.includes("\u001B[80G"),
    "direct command stdout should pin the right border column on emoji-sensitive rows",
  );
  assert(result.stdout.endsWith("\n"), "direct command should leave the prompt below the card");
  assertNoScreenControl(result.stdout, "direct command");
  assert(!result.stderr.includes("Wrote "), "direct command should not require file output");
}

async function verifyPackedNpxEntry(): Promise<void> {
  const releaseDir = join(packageRoot, ".release");
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });
  await runCommand("pnpm", ["pack:local"], { cwd: packageRoot, timeoutMs: 90_000 });
  const packed = (await readdir(releaseDir)).find((name) => name.endsWith(".tgz"));
  assert(packed, "pnpm pack should create a tarball");

  const result = await runCommand(
    "npm",
    ["exec", "--yes", `--package=${join(releaseDir, packed)}`, "--", "terminal-card", "Simon-He95"],
    {
      cwd: packageRoot,
      timeoutMs: 120_000,
    },
  );
  const text = stripAnsi(result.stdout);
  assert(text.includes("live GitHub data"), "packed npx entry should render live GitHub data");
  assert(text.includes("Simon He"), "packed npx entry should print Simon's profile");
  assert(text.includes("GitHub contributions"), "packed npx entry should print the graph card");
  assert(result.stdout.endsWith("\n"), "packed npx entry should leave the prompt below the card");
  assertNoScreenControl(result.stdout, "packed npx entry");
  assert(!result.stderr.includes("Wrote "), "packed npx entry should not write an output file");
}

async function main(): Promise<void> {
  rmSync(testOutputRoot, { recursive: true, force: true });
  mkdirSync(testOutputRoot, { recursive: true });

  assert(
    openExternalHref("file:///tmp/nope") === false,
    "external opener should reject unsafe URLs",
  );
  verifyUsernameArgs();
  await verifyCachedCardRender();
  await verifyAppleTerminalAnsiFallback();
  await verifyLiveProfileHtmlParsing();
  await verifyLiveSnapshotLoadingStates();
  await verifyGraphicAvatarRender();
  await verifyLoadingStatus();
  await verifyDirectStdoutRender();
  await verifyOfflineFallback();
  await verifyPackedNpxEntry();

  process.stdout.write("simon-terminal-card e2e passed\n");
}

await main();
