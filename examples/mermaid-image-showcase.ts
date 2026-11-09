/**
 * Terminal Mermaid Image Showcase
 *
 * Renders a mermaid diagram as a PNG through the Kitty/iTerm2 graphics
 * protocol (beautiful-mermaid SVG -> @resvg/resvg-js -> PNG). Terminals
 * without graphics support fall back to showing the raw mermaid source.
 * Clicking the diagram opens a terminal-wide preview lightbox; the header
 * copy button still copies the full raw source. Escape or a click closes the
 * preview.
 *
 * Run: pnpm run run:mermaid-image-showcase:terminal
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
  TMermaidImage,
  loadMermaidImageRenderer,
  type TMermaidImageCopyPayload,
  type TMermaidImagePreviewPayload,
} from "../src/mermaid.js";
import { detectTerminalGraphicsCapabilities } from "../src/renderer/terminal-graphics.js";
import { TText, useLayout, useTerminal } from "../src/vue.js";

const DIAGRAM = `graph TD
  Prompt --> Plan
  Plan --> ToolCall
  ToolCall --> Answer
  Answer -->|success| Done
  Answer -->|retry| Prompt`;

const clipboard = createOsc52ClipboardProvider();
const MERMAID_W = 72;

const App = defineComponent({
  setup() {
    const { scheduler } = useTerminal();
    const layout = useLayout();
    const cols = computed(() => Math.max(1, layout.clipRect?.w ?? 80));
    const rows = computed(() => Math.max(1, layout.clipRect?.h ?? 24));
    const status = ref("");
    const diag = ref("");

    void (async () => {
      const caps = detectTerminalGraphicsCapabilities();
      const raster = await loadMermaidImageRenderer();
      diag.value =
        `graphics=${caps.protocol} supported=${caps.supported ? "yes" : "NO"} ` +
        `(reason: ${caps.reason ?? "auto-detected"}) ` +
        `raster=${raster ? "ready" : "missing (install beautiful-mermaid + @resvg/resvg-js)"} ` +
        `(click image = preview, q = quit)`;
      scheduler.flushNow();
    })();

    async function onCopy(payload: TMermaidImageCopyPayload): Promise<void> {
      status.value = payload.ok
        ? `Copied ${payload.text.length} chars of raw mermaid`
        : `Copy failed: ${String(payload.error ?? "unknown")}`;
      scheduler.flushNow();
    }

    function onPreview(payload: TMermaidImagePreviewPayload): void {
      status.value = payload.open
        ? "Preview opened - click the image or press Esc to close"
        : "Preview closed";
      scheduler.flushNow();
    }

    return () => [
      h(TMermaidImage, {
        x: 1,
        y: 1,
        w: MERMAID_W,
        content: DIAGRAM,
        final: true,
        previewOnClick: true,
        onCopy,
        onPreview,
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
    if (event.type === "keydown" && (event.key === "q" || (event.key === "c" && event.ctrl))) {
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
