import type { AgentConsoleApi } from "./AgentConsoleSurface";
import { createStdinDriver, createStdoutRenderer, createTerminalApp } from "@simon_he/vue-tui";
import { AgentConsoleSurface, AGENT_CONSOLE_LAYOUT } from "./AgentConsoleSurface";
import { consoleDefaultStyle, domPalette } from "./theme";

function terminalSize(): { cols: number; rows: number } {
  const cols = Number.isFinite(process.stdout.columns)
    ? Math.max(AGENT_CONSOLE_LAYOUT.cols, process.stdout.columns)
    : AGENT_CONSOLE_LAYOUT.cols;
  const rows = Number.isFinite(process.stdout.rows)
    ? Math.max(AGENT_CONSOLE_LAYOUT.rows, process.stdout.rows)
    : AGENT_CONSOLE_LAYOUT.rows;
  return { cols, rows };
}

function rowText(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

const smoke = process.env.VT_SMOKE === "1";
const { cols, rows } = terminalSize();
let api: AgentConsoleApi | null = null;

const app = createTerminalApp({
  cols,
  rows,
  component: AgentConsoleSurface,
  props: {
    autoStart: !smoke,
    onReady(next: AgentConsoleApi) {
      api = next;
    },
  },
  defaultStyle: consoleDefaultStyle,
});
app.mount();

const out = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { write: () => {}, isTTY: false },
        clear: false,
        hideCursor: false,
        altScreen: false,
        trackResize: false,
        palette: domPalette,
        defaultBg: "black",
      }
    : {
        output: process.stdout,
        hideCursor: true,
        altScreen: true,
        palette: domPalette,
        defaultBg: "black",
        getImeAnchor: () => app.getImeAnchor(),
        trackResize: true,
      },
);

const offCommitCursor = app.terminal.on("commit", () => {
  if (smoke) return;
  const anchor = app.getImeAnchor();
  if (!anchor) return;
  out.setCursor(anchor.cellX, anchor.cellY);
  out.showCursor(false);
});

let driver: ReturnType<typeof createStdinDriver> | null = null;
let exiting = false;

const exit = (code = 0) => {
  if (exiting) return;
  exiting = true;
  driver?.dispose();
  offCommitCursor();
  out.dispose();
  app.dispose();
  process.exit(code);
};

process.on("SIGINT", () => exit(0));
process.on("SIGTERM", () => exit(0));

app.scheduler.flushNow();

if (smoke) {
  api?.seed(24);
  app.scheduler.flushNow();
  const output = {
    cols,
    rows,
    status: rowText(app, AGENT_CONSOLE_LAYOUT.status.y),
    inputBorder: rowText(app, AGENT_CONSOLE_LAYOUT.input.y).startsWith("┌"),
    hasApi: api != null,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  exit(0);
} else {
  driver = createStdinDriver({
    dispatch: (event) => {
      const prevented = app.events.dispatch(event);
      app.scheduler.flush();
      return prevented;
    },
    enableMouse: true,
    enableMouseMotion: true,
    onExit: () => exit(0),
  });
}
