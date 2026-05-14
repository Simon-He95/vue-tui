import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from "../src/cli.js";
import { TLOG_VIEW_LAB_LAYOUT, createTLogViewLabRunnerApp } from "./tlog-view-lab/App.js";

const interactive = process.env.VT_INTERACTIVE === "1";
const smoke = process.env.VT_SMOKE === "1" || !interactive;
const cols = Number.isFinite(process.stdout.columns)
  ? Math.max(TLOG_VIEW_LAB_LAYOUT.cols, process.stdout.columns)
  : TLOG_VIEW_LAB_LAYOUT.cols;
const rows = Number.isFinite(process.stdout.rows)
  ? Math.max(TLOG_VIEW_LAB_LAYOUT.rows, process.stdout.rows)
  : TLOG_VIEW_LAB_LAYOUT.rows;

const app = createTerminalApp({
  cols,
  rows,
  component: createTLogViewLabRunnerApp((api) => {
    if (!smoke) return;
    api.actions.append200();
    api.actions.appendChunk();
    api.search.updateQuery("ERROR");
  }) as any,
  defaultStyle: { fg: "whiteBright" },
});
app.mount();

const out = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { write: () => {} },
        clear: false,
        hideCursor: false,
        altScreen: false,
      }
    : { output: process.stdout, hideCursor: true },
);

app.scheduler.flush();

let driver: ReturnType<typeof createStdinDriver> | null = null;
let uninstallCleanup: (() => void) | null = null;
let exiting = false;

const onResize = () => {
  const nextCols = Number.isFinite(process.stdout.columns)
    ? Math.max(TLOG_VIEW_LAB_LAYOUT.cols, process.stdout.columns)
    : cols;
  const nextRows = Number.isFinite(process.stdout.rows)
    ? Math.max(TLOG_VIEW_LAB_LAYOUT.rows, process.stdout.rows)
    : rows;
  app.terminal.resize(nextCols, nextRows);
  app.scheduler.flush();
};

const cleanup = () => {
  if (exiting) return;
  exiting = true;
  if (process.stdout.isTTY) process.stdout.off("resize", onResize);
  uninstallCleanup?.();
  uninstallCleanup = null;
  driver?.dispose();
  out.dispose();
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
  exit();
} else {
  uninstallCleanup = installTerminalCleanup(cleanup, { exitOnSignal: true });
  driver = createStdinDriver({
    dispatch: (event) => {
      const prevented = app.events.dispatch(event);
      app.scheduler.flush();
      return prevented;
    },
    enableMouse: true,
    onExit: exit,
  });
}
