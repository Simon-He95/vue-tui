import { defineComponent, h } from "vue";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "../src/cli.js";
import {
  TAgentTerminalGraphic,
  TText,
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  type TAgentTerminalGraphicRenderer,
} from "../src/agent.js";

const ESC = "\x1B";
const ST = `${ESC}\\`;
const GRAPHIC_COLS = 18;
const GRAPHIC_ROWS = 6;
const PNG_1X1_RED =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const SIXEL_SAMPLE = `${ESC}Pq"1;1;4;2#0!4~${ST}`;

const protocolLabel =
  process.env.VUE_TUI_GRAPHICS_PROTOCOL ??
  process.env.VUE_TUI_TERMINAL_GRAPHICS ??
  process.env.TERMINAL_GRAPHICS ??
  "auto";

const imageRenderer: TAgentTerminalGraphicRenderer = (_content, context) => {
  if (context.protocol === "kitty") {
    return {
      type: "sequence",
      protocol: "kitty",
      sequence: createKittyGraphicsSequence(PNG_1X1_RED, {
        imageId: context.imageId,
        placementId: context.placementId,
        columns: GRAPHIC_COLS,
        rows: GRAPHIC_ROWS,
      }),
      clearSequence: createKittyDeleteGraphicsSequence({
        imageId: context.imageId,
        placementId: context.placementId,
      }),
      fallback: "terminal graphics fallback",
      cols: GRAPHIC_COLS,
      rows: GRAPHIC_ROWS,
    };
  }

  if (context.protocol === "iterm2") {
    return {
      type: "sequence",
      protocol: "iterm2",
      sequence: createIterm2InlineImageSequence(PNG_1X1_RED, {
        width: 180,
        height: 72,
      }),
      fallback: "terminal graphics fallback",
      cols: GRAPHIC_COLS,
      rows: GRAPHIC_ROWS,
    };
  }

  if (context.protocol === "sixel") {
    return {
      type: "sequence",
      protocol: "sixel",
      sequence: SIXEL_SAMPLE,
      fallback: "terminal graphics fallback",
      cols: GRAPHIC_COLS,
      rows: GRAPHIC_ROWS,
    };
  }

  return {
    type: "text",
    text: `terminal graphics fallback: ${context.capabilities.reason ?? context.protocol}`,
  };
};

const App = defineComponent({
  setup() {
    return () =>
      h("span", [
        h(TText, {
          x: 2,
          y: 1,
          w: 52,
          value: `TAgentTerminalGraphic smoke (${protocolLabel})`,
          style: { bold: true, fg: "cyanBright" },
        }),
        h(TAgentTerminalGraphic, {
          x: 2,
          y: 3,
          w: GRAPHIC_COLS,
          h: GRAPHIC_ROWS,
          content: "red pixel",
          fallback: "terminal graphics fallback",
          renderer: imageRenderer,
        }),
        h(TText, {
          x: 2,
          y: 10,
          w: 52,
          value: "Press q, Escape, or Ctrl-C to exit",
          style: { fg: "whiteBright", dim: true },
        }),
      ]);
  },
});

const smoke = process.env.VT_SMOKE === "1" || !process.stdin.isTTY || !process.stdout.isTTY;
const cols = Math.max(56, Number(process.stdout.columns) || 56);
const rows = Math.max(14, Number(process.stdout.rows) || 14);

const app = createTerminalApp({
  cols,
  rows,
  component: App,
  defaultStyle: { fg: "white" },
});
app.mount();

const stdout = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { write: () => {}, isTTY: false },
        clear: false,
        hideCursor: false,
        altScreen: false,
        trackResize: false,
      }
    : {
        output: process.stdout,
        clear: true,
        hideCursor: true,
        altScreen: true,
        trackResize: true,
      },
);

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let exiting = false;

function cleanup(): void {
  if (exiting) return;
  exiting = true;
  cleanupHandle?.uninstall();
  cleanupHandle = null;
  driver?.dispose();
  stdout.dispose();
  app.dispose();
}

function exit(code = 0): void {
  cleanup();
  process.exit(code);
}

app.scheduler.flushNow();

if (smoke) {
  exit(0);
} else {
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  driver = createStdinDriver({
    dispatch: (event) => {
      if (
        event.type === "keydown" &&
        (event.key === "q" || event.key === "Escape" || (event.key === "c" && event.ctrl))
      ) {
        exit(0);
        return true;
      }
      return app.events.dispatch(event);
    },
    onExit: () => exit(0),
  });
}
