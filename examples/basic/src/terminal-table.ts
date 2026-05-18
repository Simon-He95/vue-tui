import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "@simon_he/vue-tui/cli";
import TableDemo from "./TableDemo.vue";

const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : 60;
const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : 16;
const smoke = process.env.VT_SMOKE === "1";

const app = createTerminalApp({
  cols,
  rows,
  component: TableDemo as any,
  defaultStyle: { fg: "whiteBright" },
});

app.mount();

const renderer = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { isTTY: false, write: () => {} },
        clear: false,
        hideCursor: false,
        altScreen: false,
      }
    : {
        output: process.stdout,
        hideCursor: true,
      },
);

app.scheduler.flushNow();

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let disposed = false;

const cleanup = () => {
  if (disposed) return;
  disposed = true;
  cleanupHandle?.uninstall();
  cleanupHandle = null;
  driver?.dispose();
  renderer.dispose();
  app.dispose();
};

const exit = () => {
  cleanup();
  process.exit(0);
};

if (smoke) {
  exit();
} else {
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  driver = createStdinDriver({
    dispatch(event) {
      const prevented = app.events.dispatch(event);
      app.scheduler.flushNow();
      return prevented;
    },
    enableMouse: true,
    onExit: exit,
  });
}
