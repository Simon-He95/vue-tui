/**
 * Terminal Markdown Image Showcase
 *
 * Run: bun run run:image-showcase:terminal
 *
 * Demos:
 *   1. Local promo PNG (cached as base64)
 *   2. base64 data:image/png inline (graphics protocol)
 *   3. HTTP URL resolved via imageRenderer cache
 *   4. blob URL resolved via imageRenderer cache
 *   5. file URL resolved via imageRenderer cache
 *   6. Broken URL — fallback to alt text
 *   7. Sizing constraints with imageMinWidth / imageMaxWidth
 *
 * On kitty / iTerm2 / WezTerm / Ghostty (with graphics protocol support):
 *   images render as terminal graphics.
 *
 * On other terminals or when graphics are unavailable:
 *   alt text fallback is displayed instead of blank space.
 */
import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  type TuiMarkdownGraphicSegment,
  type TuiMarkdownImageActionPayload,
  type TuiMarkdownImageResolverResult,
  type TuiMarkdownLinkActionPayload,
} from "../src/markdown.js";
import { detectTerminalGraphicsCapabilities } from "../src/renderer/terminal-graphics.js";
import { TBox, TText, TView, useLayout, useTerminal } from "../src/vue.js";

// ---- Image cache for imageRenderer ----
const imageBase64Cache = new Map<string, string | null>();
const originalImageBase64Cache = new Map<string, string>();

// ---- Small red PNG fallback when the local promo image cannot be loaded ----
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAYAAAB4MH11AAAAG0lEQVR4nGP4r6Dwn5aYYdSCUQtGLRi1gDAGAG0Qhd9FkVPQAAAAAElFTkSuQmCC";

// ---- Local HTTP server for remote-image demo ----
const PORT = 19876;
const SHOWCASE_HTTP_URL = `http://localhost:${PORT}/showcase.png`;
const BLOB_URL = "blob:https://vue-tui.local/showcase.png";
const BROKEN_URL = `http://localhost:${PORT}/does-not-exist.png`;

function isPngBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
}

function readPngBase64(path: string): string | null {
  try {
    const buf = readFileSync(path);
    if (!isPngBuffer(buf)) return null;
    return buf.toString("base64");
  } catch {
    return null;
  }
}

async function startup(): Promise<{
  server: Server;
  stop: () => void;
  dataUrl: string;
  fileUrl: string;
}> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const thumbnailPath = resolve(__dirname, "shared/terminal-fashion-showcase.png");
  const originalPath = resolve(__dirname, "shared/terminal-fashion-showcase-original.png");
  const thumbnailBase64 = readPngBase64(thumbnailPath);
  const originalBase64 = readPngBase64(originalPath);
  const showcaseBase64 = thumbnailBase64 ?? TINY_PNG_BASE64;
  const showcaseOriginalBase64 = originalBase64 ?? showcaseBase64;
  const dataUrl = `data:image/png;base64,${showcaseBase64}`;
  const tempFilePath = resolve(tmpdir(), `vue-tui-image-showcase-${process.pid}.png`);
  writeFileSync(tempFilePath, Buffer.from(showcaseBase64, "base64"));
  const fileUrl = pathToFileURL(tempFilePath).href;

  // 2. Populate the cache
  if (thumbnailBase64) {
    console.error(
      `[showcase] Loaded thumbnail PNG (${thumbnailBase64.length} chars base64)`,
    );
  } else {
    console.error("[showcase] Could not load thumbnail PNG, using fallback");
  }
  if (originalBase64) {
    console.error(`[showcase] Loaded original PNG (${originalBase64.length} chars base64)`);
  }
  imageBase64Cache.set(SHOWCASE_HTTP_URL, showcaseBase64);
  imageBase64Cache.set(BLOB_URL, showcaseBase64);
  imageBase64Cache.set(fileUrl, showcaseBase64);
  imageBase64Cache.set(dataUrl, showcaseBase64);
  originalImageBase64Cache.set(SHOWCASE_HTTP_URL, showcaseOriginalBase64);
  originalImageBase64Cache.set(BLOB_URL, showcaseOriginalBase64);
  originalImageBase64Cache.set(fileUrl, showcaseOriginalBase64);
  originalImageBase64Cache.set(dataUrl, showcaseOriginalBase64);
  imageBase64Cache.set(BROKEN_URL, null);

  // 3. Start local HTTP server
  const pngPath = resolve(__dirname, "../test/fixtures/tiny.png");
  let pngBuffer: Buffer;
  try {
    pngBuffer = readFileSync(pngPath);
  } catch {
    pngBuffer = Buffer.from(TINY_PNG_BASE64, "base64");
  }

  const server = createServer((req, res) => {
    if (req.url === "/showcase.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(Buffer.from(showcaseBase64, "base64"));
      return;
    }
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(pngBuffer);
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  return {
    server,
    stop: () => {
      server.close();
      try {
        rmSync(tempFilePath);
      } catch {
        // ignore
      }
    },
    dataUrl,
    fileUrl,
  };
}

const { stop: stopServer, dataUrl, fileUrl } = await startup();

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

const heroImageLine = `Hero image: ![terminal graphics fashion showcase](${SHOWCASE_HTTP_URL})`;

const CONTENT = [
  ...diagLines,
  ``,
  heroImageLine,
  ``,
  `---`,
  ``,
  // base64 image — data URL with embedded base64 works without imageRenderer
  `data URL: ![showcase data url](${dataUrl})`,
  ``,
  // remote image — resolved via imageRenderer cache
  `http URL: ![showcase http](${SHOWCASE_HTTP_URL})`,
  ``,
  // blob image — resolved via imageRenderer cache
  `blob URL: ![showcase blob](${BLOB_URL})`,
  ``,
  // file image — resolved via imageRenderer cache
  `file URL: ![showcase file](${fileUrl})`,
  ``,
  // broken URL — imageRenderer returns null → fallback to alt text
  `broken URL: ![this is fallback alt text](${BROKEN_URL})`,
  ``,
  // sizing demo
  `sized (minW=24 maxW=72 maxH=36): ![sized showcase](${dataUrl})`,
  ``,
  `Press q / Escape / Ctrl+C to exit.`,
].join("\n");

const MENU_W = 34;
const MENU_H = 5;
const MARKDOWN_W = 96;
const clipboard = createOsc52ClipboardProvider();

function renderCachedImage(image: TuiMarkdownGraphicSegment): TuiMarkdownImageResolverResult {
  const base64 = imageBase64Cache.get(image.src) ?? null;
  if (!base64) return null;
  const originalBase64 = originalImageBase64Cache.get(image.src);
  if (!originalBase64 || originalBase64 === base64) return base64;
  return {
    base64,
    originalBase64,
    mime: "image/png",
    originalMime: "image/png",
  };
}

function imageExtension(image: TuiMarkdownImageActionPayload["image"]): string {
  const mime = (image.originalMime ?? image.mime)?.toLowerCase();
  if (mime?.includes("jpeg")) return ".jpg";
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("gif")) return ".gif";
  if (mime?.includes("webp")) return ".webp";
  try {
    const pathname = image.src.startsWith("file:")
      ? fileURLToPath(image.src)
      : new URL(image.src).pathname;
    const ext = extname(pathname);
    return ext || ".png";
  } catch {
    return ".png";
  }
}

function downloadImage(image: TuiMarkdownImageActionPayload["image"]): string | null {
  const base64 =
    image.originalBase64 ??
    originalImageBase64Cache.get(image.src) ??
    image.base64 ??
    imageBase64Cache.get(image.src) ??
    null;
  if (!base64) return null;
  const dir = resolve(homedir(), "Downloads");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(dir, `vue-tui-image-${stamp}${imageExtension(image)}`);
  writeFileSync(path, Buffer.from(base64, "base64"));
  return path;
}

// ---- Vue App ----
const App = defineComponent({
  setup() {
    const { scheduler } = useTerminal();
    const layout = useLayout();
    const cols = computed(() => Math.max(1, layout.clipRect?.w ?? 80));
    const rows = computed(() => Math.max(1, layout.clipRect?.h ?? 24));
    const menu = ref<{
      image: TuiMarkdownImageActionPayload["image"];
      x: number;
      y: number;
    } | null>(null);
    const status = ref("");

    function setStatus(value: string): void {
      status.value = value;
      scheduler.invalidate();
    }

    function openMenu(payload: TuiMarkdownImageActionPayload): void {
      const columns = cols.value;
      const rightX = payload.rect.x + payload.rect.w + 2;
      const leftX = payload.rect.x - MENU_W - 2;
      const x =
        rightX + MENU_W < columns
          ? rightX
          : leftX > 0
            ? leftX
            : Math.min(Math.max(1, payload.rect.x), Math.max(1, columns - MENU_W - 1));
      menu.value = {
        image: payload.image,
        x,
        y: Math.min(Math.max(1, payload.rect.y), Math.max(1, rows.value - MENU_H - 1)),
      };
      scheduler.invalidate();
    }

    function closeMenu(): void {
      if (!menu.value) return;
      menu.value = null;
      scheduler.invalidate();
    }

    async function copyUrl(): Promise<void> {
      const item = menu.value;
      if (!item) return;
      try {
        await clipboard.writeText(item.image.src);
        setStatus("Copied image URL");
      } catch {
        setStatus("Clipboard unavailable");
      }
      menu.value = null;
      scheduler.flushNow();
    }

    async function copyLink(payload: TuiMarkdownLinkActionPayload): Promise<void> {
      try {
        await clipboard.writeText(payload.href);
        setStatus("Copied image URL");
      } catch {
        setStatus("Clipboard unavailable");
      }
      menu.value = null;
      scheduler.flushNow();
    }

    function saveImage(): void {
      const item = menu.value;
      if (!item) return;
      const path = downloadImage(item.image);
      setStatus(path ? `Downloaded ${path}` : "No image bytes available");
      menu.value = null;
      scheduler.flushNow();
    }

    return () => [
      h(TMarkdownText, {
        x: 1,
        y: 1,
        w: MARKDOWN_W,
        content: CONTENT,
        final: true,
        imageActions: true,
        linkActions: true,
        imageOcclusionRects: menu.value
          ? [{ x: menu.value.x, y: menu.value.y, w: MENU_W, h: MENU_H }]
          : undefined,
        onImageAction: openMenu,
        onLinkAction: (payload) => {
          void copyLink(payload);
        },
        imageRenderer: renderCachedImage,
        // Image sizing: applies to ALL images in this block.
        // Without minHeight, displayHeight defaults to 1 (a thin line).
        // Set minHeight ≥ 3 to make images visible.
        imageMinWidth: 24,
        imageMaxWidth: 72,
        imageMinHeight: 12,
        imageMaxHeight: 36,
        imagePreserveAspectRatio: true,
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
      menu.value
        ? [
            h(TView, {
              x: 0,
              y: 0,
              w: cols.value,
              h: rows.value,
              zIndex: 20,
              focusable: true,
              selectable: false,
              autoFocus: true,
              onClick: closeMenu,
              onKeydown: (event: { key?: string; preventDefault?: () => void }) => {
                if (event.key !== "Escape") return;
                event.preventDefault?.();
                closeMenu();
              },
            }),
            h(
              TBox,
              {
                x: menu.value.x,
                y: menu.value.y,
                w: MENU_W,
                h: MENU_H,
                zIndex: 30,
                title: " Image ",
                padding: 0,
                style: { fg: "gray", bg: "black" },
                titleStyle: { fg: "cyan", bg: "black", bold: true },
              },
              () => [
                h(
                  TView,
                  {
                    x: 0,
                    y: 0,
                    w: MENU_W - 2,
                    h: 1,
                    zIndex: 1,
                    selectable: false,
                    onClick: (event: { preventDefault?: () => void }) => {
                      event.preventDefault?.();
                      void copyUrl();
                    },
                  },
                  () =>
                    h(TText, {
                      x: 0,
                      y: 0,
                      w: MENU_W - 2,
                      value: "  Copy URL",
                      style: { fg: "white", bg: "black" },
                    }),
                ),
                h(
                  TView,
                  {
                    x: 0,
                    y: 1,
                    w: MENU_W - 2,
                    h: 1,
                    zIndex: 1,
                    selectable: false,
                    onClick: (event: { preventDefault?: () => void }) => {
                      event.preventDefault?.();
                      saveImage();
                    },
                  },
                  () =>
                    h(TText, {
                      x: 0,
                      y: 0,
                      w: MENU_W - 2,
                      value: "  Download image",
                      style: { fg: "white", bg: "black" },
                    }),
                ),
                h(TText, {
                  x: 0,
                  y: 2,
                  w: MENU_W - 2,
                  value: "  Esc closes",
                  style: { fg: "gray", bg: "black", dim: true },
                }),
              ],
            ),
          ]
        : null,
    ];
  },
});

const cols = Math.max(64, Number(process.stdout.columns) || 64);
const rows = Math.max(24, Number(process.stdout.rows) || 24);

const app = createTerminalApp({
  cols,
  rows,
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
  const nextCols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : cols;
  const nextRows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : rows;
  app.terminal.resize(nextCols, nextRows);
};

function cleanup(): void {
  if (disposed) return;
  disposed = true;
  if (process.stdout.isTTY) process.stdout.off("resize", onResize);
  driver?.dispose();
  stdout.dispose();
  app.dispose();
  stopServer();
}

const cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });

app.scheduler.flushNow();

if (process.stdout.isTTY) process.stdout.on("resize", onResize);

driver = createStdinDriver({
  dispatch: (event) => {
    if (
      event.type === "keydown" &&
      (event.key === "q" || (event.key === "c" && event.ctrl))
    ) {
      cleanupHandle.uninstall();
      cleanup();
      process.exit(0);
      return true;
    }
    if (event.type === "keydown" && event.key === "Escape" && app.events.dispatch(event)) {
      return true;
    }
    if (event.type === "keydown" && event.key === "Escape") {
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
