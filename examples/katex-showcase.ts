/**
 * Terminal Markdown KaTeX Showcase
 *
 * Run: pnpm run run:katex-showcase:terminal
 */
import { computed, defineComponent, h, ref } from "vue";
import {
  createOsc52ClipboardProvider,
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from "../src/cli.js";
import { TMarkdownText, type TuiMarkdownMathActionPayload } from "../src/markdown.js";
import { TText, useLayout, useTerminal } from "../src/vue.js";

const CONTENT = [
  "KaTeX terminal text rendering",
  "",
  "Supported inline:",
  "Euler: $e^{i\\pi}+1=0$",
  "Fraction: $\\frac{a}{b}+\\sqrt{x}$",
  "Operators: $\\int_0^1 x^2 dx + \\sum_{n=1}^{10} n$",
  "",
  "Kept as raw text:",
  "Matrix: $\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$",
  "Cases: $\\begin{cases}x&x>0\\\\-x&x<0\\end{cases}$",
  "Unsupported command: $\\operatorname{softmax}(x)$",
  "Invalid: $\\notACommand{x}$",
  "",
  "Click any formula to copy its original KaTeX text.",
  "Press q / Escape / Ctrl+C to exit.",
].join("\n");

const clipboard = createOsc52ClipboardProvider();

const App = defineComponent({
  setup() {
    const { scheduler } = useTerminal();
    const layout = useLayout();
    const cols = computed(() => Math.max(1, layout.clipRect?.w ?? 80));
    const rows = computed(() => Math.max(1, layout.clipRect?.h ?? 24));
    const status = ref("");

    async function copyMath(payload: TuiMarkdownMathActionPayload): Promise<void> {
      try {
        await clipboard.writeText(payload.math.raw);
        status.value = `Copied ${payload.math.raw}`;
      } catch {
        status.value = "Clipboard unavailable";
      }
      scheduler.flushNow();
    }

    return () => [
      h(TMarkdownText, {
        x: 1,
        y: 1,
        w: Math.max(40, cols.value - 2),
        content: CONTENT,
        final: true,
        mathActions: true,
        onMathAction: (payload) => {
          void copyMath(payload);
        },
      }),
      status.value
        ? h(TText, {
            x: 1,
            y: Math.max(1, rows.value - 2),
            w: Math.max(1, cols.value - 2),
            value: status.value,
            style: { fg: "cyan" },
          })
        : null,
    ];
  },
});

const initialCols = Math.max(64, Number(process.stdout.columns) || 64);
const initialRows = Math.max(24, Number(process.stdout.rows) || 24);

const app = createTerminalApp({
  cols: initialCols,
  rows: initialRows,
  component: App,
  defaultStyle: { fg: "white" },
  clipboard,
});
app.mount();

const stdout = createStdoutRenderer(app.terminal, {
  output: process.stdout,
  clear: true,
  hideCursor: true,
  altScreen: true,
  trackResize: false,
});

let driver: ReturnType<typeof createStdinDriver> | null = null;
let disposed = false;

const onResize = () => {
  const nextCols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : initialCols;
  const nextRows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : initialRows;
  app.terminal.resize(nextCols, nextRows);
};

function cleanup(): void {
  if (disposed) return;
  disposed = true;
  if (process.stdout.isTTY) process.stdout.off("resize", onResize);
  driver?.dispose();
  stdout.dispose();
  app.dispose();
}

const cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });

app.scheduler.flushNow();

if (process.stdout.isTTY) process.stdout.on("resize", onResize);

driver = createStdinDriver({
  dispatch: (event) => {
    if (
      event.type === "keydown" &&
      (event.key === "q" ||
        event.key === "Escape" ||
        (event.key === "c" && event.ctrl))
    ) {
      cleanupHandle.uninstall();
      cleanup();
      process.exit(0);
      return true;
    }
    return app.events.dispatch(event);
  },
  onExit: () => {
    cleanupHandle.uninstall();
    cleanup();
    process.exit(0);
  },
});
