/**
 * Terminal Adaptive Mermaid Showcase
 *
 * Renders a mermaid diagram with the adaptive TMermaid default:
 *   - Kitty/iTerm2 graphics terminal  -> PNG image (beautiful-mermaid SVG
 *     -> @resvg/resvg-js -> PNG)
 *   - otherwise                       -> beautiful-mermaid ASCII text diagram
 *   - ANSI unavailable / too complex  -> raw mermaid source
 *
 * The raw source stays visible until `final` is true and the preferred
 * pipeline completes (source-first).
 *
 * Run: pnpm run run:mermaid-adaptive-showcase:terminal
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
  TMermaid,
  loadMermaidImageRenderer,
  type TMermaidImageCopyPayload,
  type TMermaidImagePreviewPayload,
} from "../src/mermaid.js";
import { detectTerminalGraphicsCapabilities } from "../src/renderer/terminal-graphics.js";
import { TText, useLayout, useTerminal } from "../src/vue.js";

const DIAGRAM = `graph TD
  subgraph Frontend["Frontend"]
    UI[User Interface] --> State[State Management]
    State --> Client[API Client]
  end
  subgraph Backend["Backend Services"]
    Client --> Gateway[API Gateway]
    Gateway --> Auth[Auth Service]
    Gateway --> Orders[Orders Service]
    Gateway --> Payments[Payments Service]
  end
  Payments --> Ledger[(Ledger DB)]
  Orders --> OrdersDB[(Orders DB)]
  Ledger --> Analytics[Analytics Pipeline]
  OrdersDB --> Analytics
  Analytics --> Dashboard[Dashboard]
  Dashboard -->|refresh| UI
  Auth -->|token| Client`;

const clipboard = createOsc52ClipboardProvider();
const MERMAID_W = 88;

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
        `=> image / ansi / raw` +
        (caps.protocol === "kitty"
          ? " (click image = preview, ctrl+wheel = zoom, drag = pan, q = quit)"
          : " (click image = preview, q = quit)");
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
      h(TMermaid, {
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
