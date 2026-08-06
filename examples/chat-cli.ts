/**
 * vue-tui REPL-style CLI example runner.
 *
 * Only the bottom input bar is TUI-owned and refreshed (`anchor: "bottom"`).
 * Everything above the bar is NATIVE terminal output:
 * - messages and replies are written to the terminal scroll region, scroll
 *   natively (mouse wheel / scrollback), and survive into history;
 * - right-click paste / native selection keep working because the mouse is not
 *   captured and the alternate screen is never entered.
 *
 * Interactive: VT_INTERACTIVE=1 tsx examples/chat-cli.ts
 * Smoke:       VT_SMOKE=1 tsx examples/chat-cli.ts
 */
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "../src/cli.js";
import { nextTick } from "vue";
import {
  CHAT_CLI_BAR_GAP,
  CHAT_CLI_BAR_ROWS,
  createChatCliApp,
} from "./chat-cli/App.js";

const interactive = process.env.VT_INTERACTIVE === "1";
const smoke = process.env.VT_SMOKE === "1" || !interactive;
const DEFAULT_COLS = 110;

function liveCols(): number {
  const v = Number(process.stdout.columns);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_COLS;
}
function liveRows(): number {
  const v = Number(process.stdout.rows);
  return Number.isFinite(v) && v > 0 ? v : 24;
}
/** Simulated screen height used by smoke mode (30 rows, 3-row bar). */
const SMOKE_ROWS = 30;

/**
 * Writes native output above the pinned bar, inside the scroll region the
 * renderer establishes (rows 1..screenRows-barRows). Tracks its own cursor row
 * within the region so successive messages append instead of overwriting; at
 * the region bottom a newline scrolls the region natively (top lines enter the
 * terminal's scrollback history).
 */
class ScrollbackWriter {
  private row = -1;
  private col = 0;

  constructor(
    private opts: {
      write: (chunk: string) => void;
      screenRows: () => number;
      screenCols: () => number;
      barRows: number;
      barGap: number;
    },
  ) {}

  /** Rows available for native output above the bar's reserved gap. */
  private regionRows(): number {
    return Math.max(1, Math.floor(this.opts.screenRows()) - this.opts.barRows - this.opts.barGap);
  }

  private ensureReady(): void {
    if (this.row < 0) {
      this.row = this.regionRows() - 1;
      this.col = 0;
    }
    if (this.row > this.regionRows() - 1) this.row = this.regionRows() - 1;
  }

  private position(): void {
    this.opts.write(`\u001B[${this.row + 1};${this.col + 1}H`);
  }

  /** Emit a newline, scrolling the region natively when at its bottom margin. */
  newline(): void {
    this.opts.write("\n");
    this.col = 0;
    // At the region bottom margin a newline scrolls the region; the cursor
    // stays on the fresh bottom row. Otherwise advance to the next row.
    if (this.row < this.regionRows() - 1) this.row++;
  }

  write(text: string): void {
    this.ensureReady();
    this.position();
    const cols = Math.max(1, Math.floor(this.opts.screenCols()));
    for (const ch of text) {
      if (ch === "\n") {
        this.newline();
        continue;
      }
      this.opts.write(ch);
      this.col++;
      if (this.col >= cols) {
        this.newline();
        this.position();
      }
    }
  }

  line(text: string): void {
    this.write(`${text}\n`);
  }
}

const writer = new ScrollbackWriter({
  write: (chunk) => {
    if (smoke) smokeChunks.push(chunk);
    else process.stdout.write(chunk);
  },
  screenRows: () => (smoke ? SMOKE_ROWS : liveRows()),
  screenCols: () => (smoke ? DEFAULT_COLS : liveCols()),
  barRows: CHAT_CLI_BAR_ROWS,
  barGap: CHAT_CLI_BAR_GAP,
});
const smokeChunks: string[] = [];

const { handlers, component } = createChatCliApp({ onSubmit: handleSubmit });

const app = createTerminalApp({
  cols: smoke ? DEFAULT_COLS : Math.max(DEFAULT_COLS, liveCols()),
  rows: CHAT_CLI_BAR_ROWS,
  component,
  defaultStyle: { fg: "whiteBright" },
});
app.mount();

const rendererChunks: string[] = [];
const out = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: {
          isTTY: false,
          write(chunk: string) {
            rendererChunks.push(chunk);
          },
        },
        clear: false,
        hideCursor: false,
        altScreen: false,
        trackResize: false,
        anchor: "bottom",
        barGap: CHAT_CLI_BAR_GAP,
        screenRows: () => SMOKE_ROWS,
        getImeAnchor: () => app.getImeAnchor(),
      }
    : {
        output: process.stdout,
        hideCursor: true,
        altScreen: false,
        clear: false,
        trackResize: false,
        anchor: "bottom",
        barGap: CHAT_CLI_BAR_GAP,
        screenRows: () => liveRows(),
        getImeAnchor: () => app.getImeAnchor(),
      },
);

app.scheduler.flush();

function handleSubmit(text: string): void {
  writer.line(`❯ ${text}`);
  const reply = `echo: ${text}`;
  if (smoke) {
    writer.write(reply);
    writer.newline();
    return;
  }
  void streamReply(reply);
}

async function streamReply(reply: string): Promise<void> {
  for (const ch of reply) {
    await sleep(25);
    writer.write(ch);
  }
  writer.newline();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let exiting = false;

const onResize = () => {
  app.terminal.resize(Math.max(DEFAULT_COLS, liveCols()), CHAT_CLI_BAR_ROWS);
  app.scheduler.flush();
  // Re-anchor the bar and re-establish the scroll region for the new size.
  out.forceRender();
};

const cleanup = () => {
  if (exiting) return;
  exiting = true;
  if (process.stdout.isTTY) process.stdout.off("resize", onResize);
  cleanupHandle?.uninstall();
  cleanupHandle = null;
  driver?.dispose();
  out.dispose(); // restores the full-screen scroll region (ESC[r)
  app.dispose();
};

const exit = () => {
  cleanup();
  process.exit(0);
};

if (process.stdout.isTTY) {
  process.stdout.on("resize", onResize);
}

if (smoke) {
  handlers.onSubmit?.("hello vue-tui");
  await nextTick();
  app.scheduler.flushNow();

  const rendererOut = rendererChunks.join("");
  const writerOut = smokeChunks.join("");
  const output = {
    cols: DEFAULT_COLS,
    rows: SMOKE_ROWS,
    inputBorder: app.terminal
      .getRow(0)
      .map((cell) => cell.ch)
      .join("")
      .startsWith("┌"),
    // Bar buffer row 0 is addressed at 1-based row 28 of a 30-row screen.
    barAnchored: rendererOut.includes("\u001B[28;1H"),
    // Output starts at the last scroll-region row (1-based 25: 30 rows minus
    // the 3-row bar minus the 2-row reserved gap), above the gap.
    outputAboveBar: writerOut.includes("\u001B[25;1H❯ hello vue-tui"),
    hasEcho: writerOut.includes("echo: hello vue-tui"),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  exit();
} else {
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  driver = createStdinDriver({
    dispatch: (event) => {
      const prevented = app.events.dispatch(event);
      app.scheduler.flush();
      return prevented;
    },
    // No mouse capture: right-click paste and native selection stay untouched.
    enableMouse: false,
    onExit: exit,
  });
}
