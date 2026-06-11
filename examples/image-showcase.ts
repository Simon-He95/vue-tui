/**
 * Terminal Markdown Image Showcase
 *
 * Run: bun run run:image-showcase:terminal
 *
 * Demos:
 *   1. Real cat photo from cataas.com (fetched at startup, cached as base64)
 *   2. base64 data:image/png inline — red pixel PNG (graphics protocol)
 *   3. HTTP URL resolved via imageRenderer cache
 *   4. Broken URL — fallback to alt text
 *   5. Sizing constraints with imageMinWidth / imageMaxWidth
 *
 * On kitty / iTerm2 / WezTerm / Ghostty (with graphics protocol support):
 *   images render as terminal graphics.
 *
 * On other terminals or when graphics are unavailable:
 *   alt text fallback is displayed instead of blank space.
 */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineComponent, h } from "vue";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from "../src/cli.js";
import { TMarkdownText } from "../src/markdown.js";
import { detectTerminalGraphicsCapabilities } from "../src/renderer/terminal-graphics.js";

// ---- Pre-fetch cache for imageRenderer ----
const imageBase64Cache = new Map<string, string | null>();

// ---- 1×1 red pixel PNG for the tiny image demos ----
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const TINY_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

// ---- Local HTTP server for remote-image demo ----
const PORT = 19876;
const CAT_HTTP_URL = `http://localhost:${PORT}/cat.png`;
const TINY_HTTP_URL = `http://localhost:${PORT}/tiny.png`;
const BROKEN_URL = `http://localhost:${PORT}/does-not-exist.png`;

/** Fetch a remote image and return its base64 (without the data: prefix). */
async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}

async function startup(): Promise<{ server: Server; stop: () => void; catBase64: string | null }> {
  // 1. Try to fetch a real cat photo
  const catBase64 = await fetchImageBase64(
    "https://cataas.com/cat?width=200&height=100",
  );

  // 2. Populate the cache
  if (catBase64) {
    imageBase64Cache.set(CAT_HTTP_URL, catBase64);
    console.error(`[showcase] Fetched cat photo (${catBase64.length} chars base64)`);
  } else {
    console.error("[showcase] Could not fetch cat photo, will show alt text");
  }
  imageBase64Cache.set(TINY_HTTP_URL, TINY_PNG_BASE64);
  imageBase64Cache.set(BROKEN_URL, null);

  // 3. Start local HTTP server
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pngPath = resolve(__dirname, "../test/fixtures/tiny.png");
  let pngBuffer: Buffer;
  try {
    pngBuffer = readFileSync(pngPath);
  } catch {
    pngBuffer = Buffer.from(TINY_PNG_BASE64, "base64");
  }

  const server = createServer((req, res) => {
    if (req.url === "/cat.png" && catBase64) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(Buffer.from(catBase64, "base64"));
      return;
    }
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(pngBuffer);
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  return { server, stop: () => server.close(), catBase64 };
}

const { server, stop: stopServer, catBase64 } = await startup();

// ---- Build showcase content ----
const diagnostics = detectTerminalGraphicsCapabilities({
  env: process.env as Record<string, unknown>,
  isTTY: Boolean(process.stdout.isTTY),
});

const diagLines = [
  `Terminal: ${diagnostics.supported ? "✅ graphics supported" : "❌ no graphics support"}`,
  `Protocol: ${diagnostics.preferredProtocol ?? "none"} (reason: ${diagnostics.reason})`,
  `TTY: ${diagnostics.stdoutIsTTY}`,
];

const catImageLine = catBase64
  ? `Cat photo: ![🐱 A cute cat](${CAT_HTTP_URL})`
  : `Cat photo: ![🐱 Cat unavailable — check network](${CAT_HTTP_URL})`;

const CONTENT = [
  ...diagLines,
  ``,
  catImageLine,
  ``,
  `---`,
  ``,
  // base64 image — data URL with embedded base64 works without imageRenderer
  `data URL: ![red pixel data url](${TINY_DATA_URL})`,
  ``,
  // remote image — resolved via imageRenderer cache
  `http URL: ![red pixel http](${TINY_HTTP_URL})`,
  ``,
  // broken URL — imageRenderer returns null → fallback to alt text
  `broken URL: ![this is fallback alt text](${BROKEN_URL})`,
  ``,
  // sizing demo
  `sized (minW=20 maxW=40): ![sized red pixel](${TINY_DATA_URL})`,
  ``,
  `Press q / Escape / Ctrl+C to exit.`,
].join("\n");

// ---- Vue App ----
const App = defineComponent({
  setup() {
    return () =>
      h(TMarkdownText, {
        x: 1,
        y: 1,
        w: 60,
        content: CONTENT,
        final: true,
        imageRenderer(image) {
          return imageBase64Cache.get(image.src) ?? null;
        },
        // Image sizing: applies to ALL images in this block.
        // Without minHeight, displayHeight defaults to 1 (a thin line).
        // Set minHeight ≥ 3 to make images visible.
        imageMinWidth: 10,
        imageMaxWidth: 40,
        imageMinHeight: 4,
        imageMaxHeight: 12,
        imagePreserveAspectRatio: true,
      });
  },
});

const cols = Math.max(64, Number(process.stdout.columns) || 64);
const rows = Math.max(24, Number(process.stdout.rows) || 24);

const app = createTerminalApp({
  cols,
  rows,
  component: App,
  defaultStyle: { fg: "white" },
});
app.mount();

const stdout = createStdoutRenderer(app.terminal, {
  output: process.stdout,
  clear: true,
  hideCursor: true,
  altScreen: true,
  trackResize: true,
});

let driver: ReturnType<typeof createStdinDriver> | null = null;

function cleanup(): void {
  driver?.dispose();
  stdout.dispose();
  app.dispose();
  stopServer();
}

const cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });

app.scheduler.flushNow();

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
