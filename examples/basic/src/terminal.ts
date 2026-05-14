import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from "@simon_he/vue-tui/cli";
import Demo from "./Demo.vue";

const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : 70;
const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : 22;

const app = createTerminalApp({
  cols,
  rows,
  component: Demo as any,
  defaultStyle: { fg: "whiteBright" },
});
app.mount();

const smoke = process.env.VT_SMOKE === "1";
const out = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { write: () => {} },
        clear: false,
        hideCursor: false,
        altScreen: false,
      }
    : { output: process.stdout, hideCursor: true, allowFileUrls: true },
);

// Keep cursor position updated (even while hidden) so terminals that need it for composition
// can anchor IME near the active input.
const offCommitCursor = app.terminal.on("commit", () => {
  if (smoke) return;
  const anchor = app.getImeAnchor();
  if (anchor) {
    out.setCursor(anchor.cellX, anchor.cellY);
    out.showCursor(false);
  }
});

app.scheduler.flush();

let driver: ReturnType<typeof createStdinDriver> | null = null;
let uninstallCleanup: (() => void) | null = null;
let exiting = false;

const onResize = () => {
  const nextCols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : cols;
  const nextRows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : rows;
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
  offCommitCursor();
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
    dispatch: (e) => {
      const prevented = app.events.dispatch(e);
      app.scheduler.flush();
      return prevented;
    },
    enableMouse: true,
    onExit: exit,
  });
}
