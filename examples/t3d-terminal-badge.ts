import type { T3DHitResult, TVideoFrameEvent } from "../src/experimental.js";
import { computed, defineComponent, h, ref } from "vue";
import { TBox, TText } from "../src/index.js";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "../src/cli.js";
import { T3DViewport } from "../src/experimental.js";
import { createTerminalBadge3DRenderer } from "../src/experimental/3d/bun.js";

const DEFAULT_COLS = 82;
const DEFAULT_ROWS = 26;
const smoke = process.env.VT_SMOKE === "1";
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const staticPreview = !smoke && !interactive;
const cols = ref(Number.isFinite(process.stdout.columns) ? process.stdout.columns : DEFAULT_COLS);
const rows = ref(Number.isFinite(process.stdout.rows) ? process.stdout.rows : DEFAULT_ROWS);
const frameStatus = ref("initializing Bun WebGPU…");
const errorStatus = ref("");
const hoveredContributor = ref<T3DHitResult | null>(null);
const selectedContributor = ref<T3DHitResult | null>(null);
const renderer = createTerminalBadge3DRenderer();
type FirstFrameResult = Readonly<{ error?: unknown }>;
let settleFirstFrame: ((result: FirstFrameResult) => void) | undefined;
const firstFrame = new Promise<FirstFrameResult>((resolve) => {
  settleFirstFrame = resolve;
});

const TerminalBadge3DExample = defineComponent({
  name: "TerminalBadge3DExample",
  setup() {
    const boxWidth = computed(() => Math.max(20, cols.value));
    const boxHeight = computed(() => Math.max(10, rows.value));
    const contentWidth = computed(() => Math.max(16, boxWidth.value - 4));
    const viewportHeight = computed(() => Math.max(4, boxHeight.value - 9));
    const contributorStatus = computed(() => {
      const hit = selectedContributor.value ?? hoveredContributor.value;
      if (!hit) return "CREATOR · EVAN YOU · @yyx990803";
      const prefix = selectedContributor.value ? "LOCKED" : "HOVER";
      const order = String(hit.objectId + 1).padStart(3, "0");
      const creator = hit.objectId === 0 ? " · VUE CREATOR" : "";
      return `${prefix} · #${order} · @${hit.label ?? "unknown"}${creator}`;
    });

    function onFrame(event: TVideoFrameEvent): void {
      frameStatus.value = `${event.pixelWidth}×${event.pixelHeight} · ${event.droppedFrames} coalesced`;
      settleFirstFrame?.({});
      settleFirstFrame = undefined;
    }

    function onError(error: unknown): void {
      errorStatus.value = error instanceof Error ? error.message : String(error);
      settleFirstFrame?.({ error });
      settleFirstFrame = undefined;
    }

    return () =>
      h(
        TBox,
        {
          x: 0,
          y: 0,
          w: boxWidth.value,
          h: boxHeight.value,
          border: true,
          padding: 1,
          title: " vue-tui · 3D TERMINAL BADGE ",
          style: { fg: "greenBright", bg: "black" },
          titleStyle: { fg: "cyanBright", bold: true },
        },
        () => [
          h(TText, {
            x: 0,
            y: 0,
            w: contentWidth.value,
            value: "100 VUE CORE CONTRIBUTORS · TEXTURED 3D ORBITS · RAW WGSL",
            style: { fg: "greenBright", bold: true },
          }),
          h(T3DViewport, {
            x: 0,
            y: 2,
            w: contentWidth.value,
            h: viewportHeight.value,
            renderer,
            maxFps: 24,
            pixelWidth: 480,
            pixelHeight: 288,
            initialYaw: -0.28,
            initialPitch: 0.13,
            initialZoom: 0.82,
            minZoom: 0.62,
            maxZoom: 1.8,
            zoomSensitivity: 0.14,
            autoRotateSpeed: 0.42,
            fallback: "[Bun WebGPU terminal badge]",
            style: { fg: "greenBright", bg: "black" },
            onFrame,
            onError,
            onObjecthover: (hit: T3DHitResult | null) => {
              hoveredContributor.value = hit;
            },
            onObjectselect: (hit: T3DHitResult | null) => {
              selectedContributor.value = hit;
            },
          }),
          h(TText, {
            x: 0,
            y: viewportHeight.value + 2,
            w: contentWidth.value,
            value: contributorStatus.value,
            style: { fg: selectedContributor.value ? "greenBright" : "cyanBright", bold: true },
          }),
          h(TText, {
            x: 0,
            y: viewportHeight.value + 3,
            w: contentWidth.value,
            value: errorStatus.value || `LIVE · ${frameStatus.value}`,
            style: errorStatus.value ? { fg: "redBright", bold: true } : { fg: "cyanBright" },
          }),
          h(TText, {
            x: 0,
            y: viewportHeight.value + 4,
            w: contentWidth.value,
            value: staticPreview
              ? "STATIC PREVIEW · run in an interactive TTY for scene inspection"
              : "DRAG rotates all · HOVER previews · CLICK locks · SCROLL zooms · Q quits",
            style: { fg: "white", dim: true },
          }),
        ],
      );
  },
});

const app = createTerminalApp({
  cols: cols.value,
  rows: rows.value,
  component: TerminalBadge3DExample,
  defaultStyle: { fg: "white", bg: "black" },
});
app.mount();

const output = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { isTTY: false, write: () => {} } as any,
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "truecolor",
      }
    : staticPreview
      ? {
          output: process.stdout,
          clear: false,
          hideCursor: false,
          altScreen: false,
          colorMode: "truecolor",
        }
      : {
          output: process.stdout,
          hideCursor: true,
          allowFileUrls: true,
          colorMode: "truecolor",
        },
);
app.scheduler.flushNow();

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let disposed = false;

function onResize(): void {
  cols.value = Number.isFinite(process.stdout.columns) ? process.stdout.columns : DEFAULT_COLS;
  rows.value = Number.isFinite(process.stdout.rows) ? process.stdout.rows : DEFAULT_ROWS;
  app.terminal.resize(cols.value, rows.value);
  app.scheduler.flushNow();
}

function cleanup(): void {
  if (disposed) return;
  disposed = true;
  if (process.stdout.isTTY) process.stdout.off("resize", onResize);
  cleanupHandle?.uninstall();
  cleanupHandle = null;
  driver?.dispose();
  driver = null;
  output.dispose();
  app.dispose();
}

function exit(): void {
  cleanup();
  process.exit(0);
}

if (smoke) {
  const timeout = setTimeout(() => {
    settleFirstFrame?.({ error: new Error("Timed out waiting for the Bun WebGPU frame") });
    settleFirstFrame = undefined;
  }, 10_000);
  try {
    const result = await firstFrame;
    if (result.error) throw result.error;
    app.scheduler.flushNow();
    const snapshot = app.terminal.snapshot().lines.join("\n");
    if (!snapshot.includes("3D TERMINAL BADGE") || !snapshot.includes("LIVE")) {
      throw new Error("3D terminal badge smoke snapshot is incomplete");
    }
  } finally {
    clearTimeout(timeout);
    cleanup();
  }
} else if (staticPreview) {
  try {
    const result = await firstFrame;
    if (result.error) throw result.error;
    app.scheduler.flushNow();
    process.stderr.write(
      "\nRendered one static frame because stdin/stdout is not an interactive TTY. " +
        "Run the command directly in a terminal for mouse orbit and animation.\n",
    );
  } finally {
    cleanup();
  }
} else {
  process.stdout.on("resize", onResize);
  cleanupHandle = installTerminalCleanup(cleanup, {
    signalPolicy: "exit",
    cleanupOnUnhandledRejection: true,
    rethrowUnhandledRejection: true,
  });
  void firstFrame.then((result) => {
    if (result.error) app.scheduler.flushNow();
  });
  driver = createStdinDriver({
    dispatch(event) {
      if (
        event.type === "keydown" &&
        event.key.toLowerCase() === "q" &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        exit();
        return true;
      }
      const prevented = app.events.dispatch(event);
      app.scheduler.flushNow();
      return prevented;
    },
    enableMouse: true,
    enableMouseMotion: true,
    onExit: exit,
  });
}
