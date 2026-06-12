import { EventEmitter } from "node:events";
import { appendFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineComponent, h, nextTick } from "vue";
import {
  createStdoutRenderer,
  createTerminalApp,
  type CliOutput,
} from "../src/cli.js";
import { TMarkdownText } from "../src/markdown.js";

const traceDir = process.env.VUE_TUI_TERMINAL_RESIZE_E2E_DIR || "/tmp/vue-tui-terminal-resize-e2e";
const renderLogPath = join(traceDir, "render-debug.log");

rmSync(traceDir, { recursive: true, force: true });
mkdirSync(traceDir, { recursive: true });

process.env.VUE_TUI_DEBUG = "1";
process.env.VUE_TUI_DEBUG_LOG_PATH = renderLogPath;
process.env.VUE_TUI_GRAPHICS_FORCE = "1";
process.env.KITTY_WINDOW_ID = "vue-tui-resize-e2e";
process.env.TERM = "xterm-kitty";
process.env.TERM_PROGRAM = "kitty";
delete process.env.CI;
delete process.env.TMUX;

const WIDE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAYAAAB4MH11AAAAG0lEQVR4nGP4r6Dwn5aYYdSCUQtGLRi1gDAGAG0Qhd9FkVPQAAAAAElFTkSuQmCC";
const dataUrl = `data:image/png;base64,${WIDE_PNG_BASE64}`;
const content = [
  "Terminal: graphics supported",
  "Protocol: kitty",
  "TTY: true",
  "",
  `Hero image: ![hero](${dataUrl})`,
  "",
  "---",
  "",
  `data URL: ![data](${dataUrl})`,
  "",
  `http URL: ![http](${dataUrl})`,
  "",
  `blob URL: ![blob](${dataUrl})`,
  "",
  `file URL: ![file](${dataUrl})`,
].join("\n");

const App = defineComponent({
  setup() {
    return () =>
      h(TMarkdownText, {
        x: 1,
        y: 1,
        w: 96,
        content,
        final: true,
        imageMinWidth: 24,
        imageMaxWidth: 72,
        imageMinHeight: 12,
        imageMaxHeight: 36,
        imagePreserveAspectRatio: true,
      });
  },
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNotContains(haystack: string, needle: string, message: string): void {
  assert(!haystack.includes(needle), message);
}

function assertContains(haystack: string, needle: string, message: string): void {
  assert(haystack.includes(needle), message);
}

async function settle(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await nextTick();
    app.scheduler.flushNow();
  }
}

function markdownImageCoords(log: string): Map<string, Set<string>> {
  const coords = new Map<string, Set<string>>();
  const re =
    /terminal graphic (?:queue draw accepted|render draw|resize active): id=(md-image:\S+), x=(\d+), y=(\d+), w=(\d+), h=(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(log))) {
    const [, id, x, y, w, h] = match;
    let seen = coords.get(id);
    if (!seen) {
      seen = new Set<string>();
      coords.set(id, seen);
    }
    seen.add(`${x},${y},${w},${h}`);
  }
  return coords;
}

const chunks: string[] = [];
const output: CliOutput = {
  isTTY: true,
  columns: 146,
  rows: 57,
  write(chunk) {
    chunks.push(String(chunk));
  },
};

const app = createTerminalApp({
  cols: 146,
  rows: 57,
  component: App,
  defaultStyle: { fg: "white" },
});
app.mount();

const stdout = createStdoutRenderer(app.terminal, {
  output,
  clear: true,
  hideCursor: true,
  altScreen: true,
  trackResize: false,
  terminalGraphics: { protocol: "kitty", force: true },
});

try {
  await settle(app);
  const initialOutput = chunks.join("");
  assert(initialOutput.includes("\x1B[?1049h"), "expected alt-screen enter sequence");
  assert(initialOutput.includes("\x1B[?7l"), "expected autowrap to be disabled on enter");
  assert(initialOutput.includes("\x1B_G"), "expected initial kitty image draw");

  chunks.length = 0;
  appendFileSync(renderLogPath, "[E2E] resize-start\n");

  for (const [cols, rows] of [
    [120, 57],
    [80, 45],
    [40, 32],
    [24, 24],
    [40, 18],
    [96, 32],
    [146, 57],
  ] as const) {
    app.terminal.resize(cols, rows);
    await settle(app);
  }

  const resizeOutput = chunks.join("");
  assertNotContains(resizeOutput, "\x1B[?7h", "resize output must not re-enable autowrap");
  assertNotContains(resizeOutput, "\x1B[2J", "resize output must not clear the screen");
  assertNotContains(resizeOutput, "a=T", "resize output must not resend full kitty images");
  assertContains(resizeOutput, "a=p", "resize output must re-place kitty graphics");

  const log = readFileSync(renderLogPath, "utf8");
  const resizeLog = log.slice(log.indexOf("[E2E] resize-start"));
  assertNotContains(resizeLog, "resizeRedraw=false", "resize graphics draws must be resize redraws");

  const coords = markdownImageCoords(log);
  assert(coords.size > 0, "expected resize trace to capture markdown image coordinates");
  for (const [id, seen] of coords) {
    assert(seen.size === 1, `image ${id} changed coordinates: ${Array.from(seen).join(" -> ")}`);
  }

  const trackedChunks: string[] = [];
  const trackedOutput = Object.assign(new EventEmitter(), {
    isTTY: true,
    columns: 146,
    rows: 57,
    write(chunk: string) {
      trackedChunks.push(String(chunk));
    },
  });
  const trackedApp = createTerminalApp({
    cols: 146,
    rows: 57,
    component: App,
    defaultStyle: { fg: "white" },
  });
  trackedApp.mount();
  const trackedStdout = createStdoutRenderer(trackedApp.terminal, {
    output: trackedOutput,
    clear: true,
    hideCursor: true,
    altScreen: true,
    trackResize: true,
    terminalGraphics: { protocol: "kitty", force: true },
  });
  try {
    await settle(trackedApp);
    trackedChunks.length = 0;
    appendFileSync(renderLogPath, "[E2E] tracked-resize-start\n");

    for (const [cols, rows] of [
      [120, 57],
      [90, 45],
      [90, 34],
      [146, 57],
    ] as const) {
      trackedOutput.columns = cols;
      trackedOutput.rows = rows;
      trackedOutput.emit("resize");
      await settle(trackedApp);
    }

    const trackedResizeOutput = trackedChunks.join("");
    assertNotContains(
      trackedResizeOutput,
      "\x1B[?7h",
      "tracked stdout resize must not re-enable autowrap",
    );
    assertNotContains(
      trackedResizeOutput,
      "\x1B[2J",
      "tracked stdout resize must not clear the screen",
    );
    assertNotContains(
      trackedResizeOutput,
      "a=T",
      "tracked stdout resize must not resend full kitty images",
    );
    assertContains(
      trackedResizeOutput,
      "a=p",
      "tracked stdout resize must re-place kitty graphics",
    );
  } finally {
    trackedStdout.dispose();
    trackedApp.dispose();
  }

  chunks.length = 0;
  stdout.dispose();
  assert(chunks.join("").includes("\x1B[?7h"), "dispose must restore autowrap");

  console.log(
    JSON.stringify(
      {
        ok: true,
        traceDir,
        imageCount: coords.size,
      },
      null,
      2,
    ),
  );
} finally {
  stdout.dispose();
  app.dispose();
}
