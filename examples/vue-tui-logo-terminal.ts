import { defineComponent, h, ref } from "vue";
import { TText, TView } from "../src/index.js";
import { spaces } from "../src/vue.js";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "../src/cli.js";
import {
  createVueTuiLogoCells,
  createVueTuiLogoFrame,
  createVueTuiLogoPlainText,
  VUE_TUI_LOGO_COLS,
  VUE_TUI_LOGO_ROWS,
  vueTuiLogoPalette,
} from "./shared/vue-tui-logo-layout.js";

const logoFrame = ref(0);

const VueTuiLogoTerminal = defineComponent({
  name: "VueTuiLogoTerminal",
  setup() {
    return () =>
      h(
        TView,
        {
          x: 0,
          y: 0,
          w: VUE_TUI_LOGO_COLS,
          h: VUE_TUI_LOGO_ROWS,
          focusable: true,
          autoFocus: true,
        },
        () =>
          createVueTuiLogoFrame(logoFrame.value).map((op, index) =>
            h(TText, {
              key: `${index}:${op.kind}:${op.x}:${op.y}:${op.w}:${op.text ?? ""}`,
              x: op.x,
              y: op.y,
              w: op.w,
              value: op.kind === "fill" ? spaces(op.w) : op.text,
              style: op.style,
            }),
          ),
      );
  },
});

const app = createTerminalApp({
  cols: VUE_TUI_LOGO_COLS,
  rows: VUE_TUI_LOGO_ROWS,
  component: VueTuiLogoTerminal,
  defaultStyle: { fg: vueTuiLogoPalette.white, bg: vueTuiLogoPalette.bg },
});
app.mount();

const smoke = process.env.VT_SMOKE === "1";
const renderer = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { isTTY: false, write: () => {} } as any,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "truecolor",
      }
    : { output: process.stdout, hideCursor: true, allowFileUrls: true, colorMode: "truecolor" },
);

app.scheduler.flushNow();

if (smoke) {
  const actual = app.terminal.snapshot().lines;
  const expected = createVueTuiLogoPlainText();
  const mismatch = expected.findIndex((line, index) => actual[index] !== line);
  if (mismatch !== -1) {
    throw new Error(`Logo snapshot mismatch on row ${mismatch + 1}`);
  }

  const expectedCells = createVueTuiLogoCells();
  for (let y = 0; y < expectedCells.length; y++) {
    const row = expectedCells[y]!;
    for (let x = 0; x < row.length; x++) {
      const expectedCell = row[x]!;
      const actualCell = app.terminal.getCell(x, y);
      if (actualCell.ch !== expectedCell.ch || actualCell.style.bg !== expectedCell.bg) {
        throw new Error(`Logo cell mismatch at ${x},${y}`);
      }
    }
  }
}

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let animationTimer: ReturnType<typeof setInterval> | null = null;
let disposed = false;

const cleanup = () => {
  if (disposed) return;
  disposed = true;
  if (animationTimer) clearInterval(animationTimer);
  animationTimer = null;
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

if (smoke || !process.stdin.isTTY || !process.stdout.isTTY) {
  cleanup();
} else {
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  animationTimer = setInterval(() => {
    logoFrame.value += 1;
    app.scheduler.flushNow();
  }, 320);
  driver = createStdinDriver({
    dispatch(event) {
      if (event.type === "keydown" && event.key === "q" && !event.ctrlKey && !event.metaKey) {
        exit();
        return true;
      }
      const prevented = app.events.dispatch(event);
      app.scheduler.flushNow();
      return prevented;
    },
    enableMouse: true,
    onExit: exit,
  });
}
