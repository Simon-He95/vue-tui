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
import {
  TMarkdownText,
  loadMarkdownMathImageRenderer,
  type TuiMarkdownMathActionPayload,
} from "../src/markdown.js";
import { detectTerminalGraphicsCapabilities } from "../src/renderer/terminal-graphics.js";
import { TText, useLayout, useTerminal } from "../src/vue.js";

const CONTENT = [
  "Markdown math: block images, inline images, boxed/raw fallbacks",
  "",
  "Block math renders as an image when the terminal supports",
  "graphics and the raster stack (mathjax-full + @resvg/resvg-js) is loaded,",
  "otherwise it stays inside a box:",
  "",
  "$$",
  "\\int_0^1 x^2\\,dx + \\frac{1}{2}\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{12}",
  "$$",
  "",
  "Inline math is rendered into the text row: Euler $e^{i\\pi}+1=0$ and a",
  "fraction $\\frac{a}{b}$ plus $x^{2}+\\sqrt{y}$.",
  "",
  "Tall inline (matrices) stays raw: $\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$",
  "",
  "Click any formula (image or raw text) to copy its original TeX.",
  "Press q / Escape / Ctrl+C to exit.",
].join("\n");

const clipboard = createOsc52ClipboardProvider();
const MARKDOWN_W = 96;

const App = defineComponent({
  setup() {
    const { scheduler } = useTerminal();
    const layout = useLayout();
    const cols = computed(() => Math.max(1, layout.clipRect?.w ?? 80));
    const rows = computed(() => Math.max(1, layout.clipRect?.h ?? 24));
    const status = ref("");
    const diag = ref("");

    // Self-diagnostic: show which gate decided the rendering path.
    void (async () => {
      const caps = detectTerminalGraphicsCapabilities();
      const raster = await loadMarkdownMathImageRenderer();
      diag.value =
        `graphics=${caps.protocol} supported=${caps.supported ? "yes" : "NO"} ` +
        `(reason: ${caps.reason ?? "auto-detected"}) ` +
        `raster=${raster ? "ready" : "missing (install mathjax-full + @resvg/resvg-js)"}`;
      scheduler.flushNow();
    })();

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
        w: MARKDOWN_W,
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
      diag.value
        ? h(TText, {
            x: 1,
            y: Math.max(1, rows.value - 1),
            w: Math.max(1, cols.value - 2),
            value: diag.value,
            style: { fg: "yellow" },
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
      (event.key === "q" || event.key === "Escape" || (event.key === "c" && event.ctrl))
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
