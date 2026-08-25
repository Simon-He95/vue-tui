import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "@playwright/test";
import { computed, defineComponent, h, ref, shallowRef } from "vue";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from "../src/cli.js";
import {
  TBrowser,
  type TBrowserInputEvent,
  type TBrowserSession,
  type TBrowserSessionFactory,
} from "../src/experimental/browser.js";
import { TBox, TInput, TText, TView } from "../src/index.js";
import { useLayout } from "../src/vue.js";

const DEMO_URL = "demo://interactions";
let exitDemo = () => {};
let closeDemoPage = async (): Promise<boolean> => false;
let closeDemoBrowser = async (): Promise<void> => {};
const INTERACTION_DEMO_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Terminal Browser Interaction Lab</title>
  <style>
    * { box-sizing: border-box; }
    html { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; background: #08111f; color: #e6edf7; }
    body { margin: 0; }
    header { position: sticky; top: 0; z-index: 2; padding: 18px 28px; background: #08111fe8; border-bottom: 1px solid #29405f; backdrop-filter: blur(12px); }
    main { width: min(760px, calc(100% - 40px)); margin: 0 auto; padding: 34px 0 80px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #9fb0c8; }
    .panel { padding: 22px; border: 1px solid #29405f; border-radius: 14px; background: #101d30; box-shadow: 0 18px 50px #0005; }
    label { display: block; margin-bottom: 7px; color: #b7c7da; }
    input { width: 100%; padding: 12px 14px; border: 1px solid #476589; border-radius: 9px; background: #07101d; color: white; font: inherit; outline: none; }
    input:focus { border-color: #55d6be; box-shadow: 0 0 0 3px #55d6be30; }
    button, a.action { display: inline-block; margin: 14px 8px 0 0; padding: 10px 15px; border: 0; border-radius: 9px; background: #55d6be; color: #04110f; font: 700 14px system-ui; cursor: pointer; text-decoration: none; }
    button.secondary { background: #243a58; color: #e6edf7; }
    output { display: block; min-height: 24px; margin-top: 14px; color: #7de7d4; }
    .section { min-height: 62vh; margin-top: 34px; padding: 28px; border-radius: 18px; background: linear-gradient(145deg, #142844, #0b1728); border: 1px solid #29405f; }
    .section strong { color: #55d6be; font-size: 38px; }
  </style>
</head>
<body>
  <header><strong>Interactive page</strong> · click, type, open a page, and scroll</header>
  <main>
    <h1>Terminal Browser Interaction Lab</h1>
    <p>This page is bundled with the demo, so every interaction is deterministic.</p>
    <div class="panel">
      <label for="message">Click this input, then type</label>
      <input id="message" placeholder="Type in the web page…" autocomplete="off">
      <button id="count">Click count: 0</button>
      <button class="secondary" id="clear">Clear input</button>
      <a class="action" target="_blank" href="data:text/html,<title>New terminal page</title><body style='font:24px system-ui;background:%2308111f;color:white;padding:40px'><h1>New page works</h1><p>Press Ctrl+W to return.</p></body>">Open new page</a>
      <output id="result">Waiting for input…</output>
    </div>
    <div class="section"><strong>01</strong><h2>Scroll with the wheel</h2><p>The Chromium viewport should update continuously.</p></div>
    <div class="section"><strong>02</strong><h2>Keep scrolling</h2><p>Frames now come from Chromium's screencast stream instead of periodic full-page polling.</p></div>
    <div class="section"><strong>03</strong><h2>End of interaction lab</h2><p>Use Ctrl+L to navigate to another site.</p></div>
  </main>
  <script>
    const input = document.querySelector('#message');
    const result = document.querySelector('#result');
    let count = 0;
    input.addEventListener('input', () => {
      result.value = 'Web input value: ' + input.value;
      console.info('[tbrowser-demo]Web input: ' + input.value);
    });
    document.querySelector('#count').addEventListener('click', event => event.currentTarget.textContent = 'Click count: ' + (++count));
    document.querySelector('#clear').addEventListener('click', () => { input.value = ''; result.value = 'Input cleared'; input.focus(); });
  </script>
</body>
</html>`;
const INTERACTION_DEMO_URL = `data:text/html;base64,${Buffer.from(INTERACTION_DEMO_HTML).toString("base64")}`;

function displayUrl(url: string): string {
  return url === INTERACTION_DEMO_URL ? DEMO_URL : url;
}

function normalizedUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error("Enter a URL");
  if (input === DEMO_URL) return input;
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(input) ? input : `https://${input}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported");
  }
  return url.href;
}

function mouseButton(button: number | undefined): "left" | "middle" | "right" {
  return button === 1 ? "middle" : button === 2 ? "right" : "left";
}

function playwrightKey(event: Extract<TBrowserInputEvent, { type: "keydown" }>): string {
  const key = event.key === " " ? "Space" : event.key;
  const chord: string[] = [];
  if (event.modifiers.ctrl) chord.push("Control");
  if (event.modifiers.alt) chord.push("Alt");
  if (event.modifiers.meta) chord.push("Meta");
  if (event.modifiers.shift && key.length > 1) chord.push("Shift");
  chord.push(key);
  return chord.join("+");
}

function cdpModifiers(event: TBrowserInputEvent): number {
  if (!("modifiers" in event)) return 0;
  return (
    (event.modifiers.alt ? 1 : 0) |
    (event.modifiers.ctrl ? 2 : 0) |
    (event.modifiers.meta ? 4 : 0) |
    (event.modifiers.shift ? 8 : 0)
  );
}

async function dispatchPageInput(
  page: Page,
  session: CDPSession | null,
  event: TBrowserInputEvent,
): Promise<void> {
  if (event.type === "pointermove") {
    await page.mouse.move(event.x, event.y);
    return;
  }
  if (event.type === "pointerdown") {
    await page.mouse.move(event.x, event.y);
    await page.mouse.down({ button: mouseButton(event.button) });
    return;
  }
  if (event.type === "pointerup") {
    await page.mouse.move(event.x, event.y);
    await page.mouse.up({ button: mouseButton(event.button) });
    return;
  }
  if (event.type === "wheel") {
    const delta = Math.sign(event.deltaY) * Math.max(48, Math.abs(event.deltaY) * 48);
    if (session) {
      await session.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: event.x,
        y: event.y,
        deltaX: 0,
        deltaY: delta,
        modifiers: cdpModifiers(event),
      });
    } else {
      await page.mouse.move(event.x, event.y);
      await page.mouse.wheel(0, delta);
    }
    return;
  }
  if (event.type === "keydown") {
    if (
      session &&
      event.code === "" &&
      !event.modifiers.ctrl &&
      !event.modifiers.alt &&
      !event.modifiers.meta &&
      [...event.key].length === 1 &&
      (event.key.codePointAt(0) ?? 0) >= 0x20
    ) {
      const modifiers = cdpModifiers(event);
      await session.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: event.key,
        text: event.key,
        unmodifiedText: event.key,
        modifiers,
      });
      await session.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: event.key,
        modifiers,
      });
      return;
    }
    await page.keyboard.press(playwrightKey(event));
    return;
  }
  if (event.type === "text" || event.type === "paste") {
    await page.keyboard.insertText(event.text);
  }
}

const createPlaywrightSession: TBrowserSessionFactory = async (context) => {
  if (context.preferredFormat !== "png") {
    throw new Error("This demo needs a Kitty or iTerm2 graphics terminal");
  }

  let browser: Browser | null = await chromium.launch({ channel: "chrome", headless: true });
  let closed = false;
  let closePromise: Promise<void> | null = null;
  let screencast: CDPSession | null = null;
  let screencastPage: Page | null = null;
  let pendingFrame: Uint8Array | null = null;
  let wakeFrame: (() => void) | null = null;
  let lastFrameAt = 0;
  const wiredPages = new WeakSet<Page>();
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      if (closed) return;
      closed = true;
      wakeFrame?.();
      wakeFrame = null;
      const current = browser;
      browser = null;
      await current?.close();
    })();
    return closePromise;
  };
  closeDemoBrowser = close;
  context.signal.addEventListener("abort", () => void close(), { once: true });
  if (context.signal.aborted) {
    await close();
    throw new Error("Browser session aborted");
  }

  let browserContext: BrowserContext;
  let activePage: Page;
  try {
    browserContext = await browser.newContext({
      viewport: { width: context.pixelWidth, height: context.pixelHeight },
      deviceScaleFactor: 1,
    });
    activePage = await browserContext.newPage();
  } catch (error) {
    await close();
    throw error;
  }

  function queueFrame(png: Uint8Array): void {
    pendingFrame = png;
    wakeFrame?.();
    wakeFrame = null;
  }

  async function capturePage(page: Page): Promise<void> {
    const png = await page.screenshot({ type: "png" });
    if (page !== activePage || page.isClosed()) return;
    lastFrameAt = Date.now();
    queueFrame(new Uint8Array(png));
  }

  async function startScreencast(page: Page): Promise<void> {
    if (screencast) {
      screencastPage = null;
      await screencast.send("Page.stopScreencast").catch(() => {});
      await screencast.detach().catch(() => {});
    }
    const session = await browserContext.newCDPSession(page);
    screencast = session;
    screencastPage = page;
    session.on("Page.screencastFrame", (event) => {
      void session.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
      const now = Date.now();
      const frameInterval = 1000 / context.maxFps;
      const elapsed = now - lastFrameAt;
      if (elapsed < frameInterval) return;
      lastFrameAt = now - (elapsed % frameInterval);
      queueFrame(new Uint8Array(Buffer.from(event.data, "base64")));
    });
    await session.send("Page.startScreencast", {
      format: "png",
      maxWidth: context.pixelWidth,
      maxHeight: context.pixelHeight,
      everyNthFrame: 1,
    });
    await capturePage(page);
  }

  async function navigate(page: Page, url: string): Promise<void> {
    await page.goto(url === DEMO_URL ? INTERACTION_DEMO_URL : url, {
      waitUntil: "domcontentloaded",
    });
    context.onNavigate(displayUrl(page.url()));
    context.onTitleChange(await page.title());
    await capturePage(page);
  }

  function activate(page: Page): void {
    if (closed) return;
    activePage = page;
    context.onNavigate(displayUrl(page.url()));
    void startScreencast(page);
    void page
      .title()
      .then(context.onTitleChange)
      .catch(() => {});
  }

  function wire(page: Page): void {
    if (wiredPages.has(page)) return;
    wiredPages.add(page);
    page.on("framenavigated", (frame) => {
      if (page === activePage && frame === page.mainFrame())
        context.onNavigate(displayUrl(frame.url()));
    });
    page.on("domcontentloaded", () => {
      if (page === activePage)
        void page
          .title()
          .then(context.onTitleChange)
          .catch(() => {});
    });
    page.on("console", (message) => {
      const text = message.text();
      if (page === activePage && text.startsWith("[tbrowser-demo]")) {
        context.onTitleChange(text.slice("[tbrowser-demo]".length));
      }
    });
    page.on("close", () => {
      if (page !== activePage) return;
      const remaining = browserContext.pages().filter((candidate) => !candidate.isClosed());
      if (remaining.length) activate(remaining[remaining.length - 1]!);
    });
  }

  wire(activePage);
  browserContext.on("page", (page) => {
    wire(page);
    if (page !== activePage) activate(page);
  });
  try {
    await navigate(activePage, context.url);
    await startScreencast(activePage);
  } catch (error) {
    await close();
    throw error;
  }

  return {
    frames: {
      async *[Symbol.asyncIterator]() {
        while (!context.signal.aborted && !closed) {
          if (!pendingFrame) await new Promise<void>((resolve) => (wakeFrame = resolve));
          const png = pendingFrame;
          pendingFrame = null;
          if (png) yield { png, timestampMs: Date.now() };
        }
      },
    },
    dispatch: (event) =>
      dispatchPageInput(activePage, screencastPage === activePage ? screencast : null, event),
    navigate: async (url) => {
      await navigate(activePage, url);
    },
    back: async () => {
      await activePage.goBack({ waitUntil: "domcontentloaded" });
      await capturePage(activePage);
    },
    forward: async () => {
      await activePage.goForward({ waitUntil: "domcontentloaded" });
      await capturePage(activePage);
    },
    reload: async () => {
      await activePage.reload({ waitUntil: "domcontentloaded" });
      await capturePage(activePage);
    },
    newPage: async () => {
      const page = await browserContext.newPage();
      wire(page);
      if (page !== activePage) activate(page);
    },
    closePage: async () => {
      if (browserContext.pages().length <= 1) return false;
      await activePage.close();
      return true;
    },
    close,
  };
};

const App = defineComponent({
  setup() {
    const layout = useLayout();
    const draft = ref(DEMO_URL);
    const url = ref("");
    const addressMode = ref(true);
    const title = ref("Browser component demo");
    const status = ref("Enter a URL and press Enter");
    const currentUrl = ref("");
    const browserSession = shallowRef<TBrowserSession | null>(null);
    const cols = computed(() => Math.max(1, Math.floor(layout.clipRect?.w ?? 80)));
    const rows = computed(() => Math.max(1, Math.floor(layout.clipRect?.h ?? 24)));
    const innerW = computed(() => Math.max(1, cols.value - 4));
    const browserH = computed(() => Math.max(1, rows.value - 7));

    function open(): void {
      try {
        url.value = normalizedUrl(draft.value);
        addressMode.value = false;
        status.value = "Starting Chromium…";
      } catch (error) {
        status.value = error instanceof Error ? error.message : String(error);
      }
    }

    function back(): void {
      const action = browserSession.value?.back;
      if (!action) return;
      void Promise.resolve(action()).catch((error: unknown) => {
        status.value = error instanceof Error ? error.message : String(error);
      });
    }

    function reload(): void {
      const action = browserSession.value?.reload;
      if (!action) return;
      void Promise.resolve(action()).catch((error: unknown) => {
        status.value = error instanceof Error ? error.message : String(error);
      });
    }

    return () =>
      h(
        TBox,
        {
          x: 0,
          y: 0,
          w: cols.value,
          h: rows.value,
          border: true,
          padding: 1,
          title: title.value,
          style: { fg: "cyanBright" },
        },
        () => [
          h(
            TView,
            {
              x: 0,
              y: 0,
              w: 6,
              h: 1,
              selectable: false,
              onClick: back,
            },
            () =>
              h(TText, {
                x: 0,
                y: 0,
                w: 6,
                value: "[Back]",
                style: browserSession.value?.back ? { bold: true } : { dim: true },
              }),
          ),
          h(
            TView,
            {
              x: 7,
              y: 0,
              w: 9,
              h: 1,
              selectable: false,
              onClick: reload,
            },
            () =>
              h(TText, {
                x: 0,
                y: 0,
                w: 9,
                value: "[Refresh]",
                style: browserSession.value?.reload ? { bold: true } : { dim: true },
              }),
          ),
          h(TInput, {
            x: 17,
            y: 0,
            w: Math.max(1, innerW.value - 17),
            h: 1,
            modelValue: draft.value,
            "onUpdate:modelValue": (value: string) => (draft.value = value),
            autoFocus: addressMode.value,
            placeholder: "https://example.com",
            onKeydown: (event: { key: string; preventDefault(): void }) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              open();
            },
          }),
          url.value
            ? h(TBrowser, {
                x: 0,
                y: 2,
                w: innerW.value,
                h: browserH.value,
                url: url.value,
                sessionFactory: createPlaywrightSession,
                autoFocus: !addressMode.value,
                maxFps: 60,
                onReady: (session) => {
                  browserSession.value = session;
                  closeDemoPage = async () => (await session.closePage?.()) === true;
                  status.value = "Browser focused";
                },
                onNavigate: (next: string) => {
                  currentUrl.value = next;
                  if (!addressMode.value) draft.value = next;
                  status.value = next;
                },
                onTitleChange: (next: string) => {
                  title.value = next || "Browser component demo";
                },
                onRequestAddress: () => {
                  addressMode.value = true;
                  draft.value = currentUrl.value.startsWith("http") ? currentUrl.value : "";
                  status.value = "Enter a URL and press Enter";
                },
                onClose: () => {
                  exitDemo();
                },
                onError: (error: unknown) => {
                  status.value = error instanceof Error ? error.message : String(error);
                },
              })
            : null,
          h(TText, {
            x: 0,
            y: Math.max(2, rows.value - 5),
            w: innerW.value,
            value: `${status.value} · Alt+← back · Ctrl+R refresh · Ctrl+L address · Ctrl+T new · Ctrl+W close tab/exit · Ctrl+C exit`,
            style: { dim: true },
          }),
        ],
      );
  },
});

const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : 100;
const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : 30;
const app = createTerminalApp({ cols, rows, component: App });
app.mount();
const renderer = createStdoutRenderer(app.terminal, {
  output: process.stdout,
  hideCursor: true,
  trackResize: false,
});
app.scheduler.flush();

const onResize = () => {
  app.terminal.resize(process.stdout.columns || cols, process.stdout.rows || rows);
};
process.stdout.on("resize", onResize);

let exiting = false;
let driver: ReturnType<typeof createStdinDriver> | null = null;
const cleanup = () => {
  if (exiting) return;
  exiting = true;
  process.stdout.off("resize", onResize);
  driver?.dispose();
  renderer.dispose();
  app.dispose();
};
const cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
exitDemo = () => {
  cleanupHandle.uninstall();
  cleanup();
  void closeDemoBrowser().finally(() => process.exit(0));
};
driver = createStdinDriver({
  dispatch: (event) => {
    if (event.type === "keydown" && event.ctrlKey && event.key.toLowerCase() === "c") {
      exitDemo();
      return true;
    }
    if (event.type === "keydown" && event.ctrlKey && event.key.toLowerCase() === "w") {
      void closeDemoPage().then((closed) => {
        if (!closed) exitDemo();
      }, exitDemo);
      return true;
    }
    const prevented = app.events.dispatch(event);
    app.scheduler.flush();
    return prevented;
  },
  enableMouse: true,
  enableMouseMotion: true,
  onExit: exitDemo,
});
