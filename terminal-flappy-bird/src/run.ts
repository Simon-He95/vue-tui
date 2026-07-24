import { defineComponent, h, ref } from "vue";
import { TBox, TText } from "@simon_he/vue-tui";
import { TVideo, type TVideoFrame, type TVideoFrameEvent, type TVideoFrameSource } from "@simon_he/vue-tui/experimental";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  detectTerminalGraphicsCapabilities,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "@simon_he/vue-tui/cli";
import {
  CANVAS_W,
  CANVAS_H,
  TARGET_FPS,
  createGame,
  flap,
  updateGame,
  resetGame,
  renderScene,
  encodeRgbaPng,
  type GamePhase,
} from "./engine.js";

const FRAME_MS = 1000 / TARGET_FPS;

// ═══════════════════════════════════════════════════════════════
//  Terminal graphics pre-check
// ═══════════════════════════════════════════════════════════════

export function checkTerminalSupport(): boolean {
  if (process.env.VT_SMOKE === "1") return true;
  const caps = detectTerminalGraphicsCapabilities();
  if (caps.supported) return true;

  const lines = [
    "",
    "  ╔══════════════════════════════════════════════════════════════╗",
    "  ║                                                              ║",
    "  ║   🐦  terminal-flappy-bird                                  ║",
    "  ║                                                              ║",
    "  ║   ⚠  This terminal does not support graphics protocols.     ║",
    `  ║      Reason: ${caps.reason ?? "unknown"}`,
    "  ║                                                              ║",
    "  ║   Supported terminals:                                       ║",
    "  ║     • Kitty           (kitty)                               ║",
    "  ║     • iTerm2           (iterm2)                              ║",
    "  ║     • WezTerm          (iterm2-compatible)                   ║",
    "  ║     • Ghostty          (kitty-compatible)                     ║",
    "  ║     • Any Sixel terminal                                     ║",
    "  ║                                                              ║",
    "  ║   To force detection:                                        ║",
    "  ║     VUE_TUI_GRAPHICS_FORCE=1 terminal-flappy-bird            ║",
    "  ║                                                              ║",
    "  ║   Or select a protocol manually:                             ║",
    "  ║     VUE_TUI_TERMINAL_GRAPHICS=kitty terminal-flappy-bird     ║",
    "  ║     VUE_TUI_TERMINAL_GRAPHICS=iterm2 terminal-flappy-bird    ║",
    "  ║     VUE_TUI_TERMINAL_GRAPHICS=sixel terminal-flappy-bird     ║",
    "  ║                                                              ║",
    "  ╚══════════════════════════════════════════════════════════════╝",
    "",
  ];

  if (caps.multiplexer) {
    lines.splice(
      16,
      0,
      `  ║   Tip: You're inside ${caps.multiplexer}. Try enabling passthrough:`,
      `  ║        VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH=1 terminal-flappy-bird`,
      "  ║                                                              ║",
    );
  }

  process.stderr.write(lines.join("\n") + "\n");
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  Game Input & Reactive State
// ═══════════════════════════════════════════════════════════════

const gameInput = { flapQueued: false, restartQueued: false };
const scoreRef = ref(0);
const phaseRef = ref<GamePhase>("ready");
const bestRef = ref(0);
const fpsRef = ref(0);

// ═══════════════════════════════════════════════════════════════
//  TVideo Frame Source (game loop)
// ═══════════════════════════════════════════════════════════════

const flappyFrameSource: TVideoFrameSource = async function* (context): AsyncIterable<TVideoFrame> {
  const game = createGame(bestRef.value);
  const buf = new Uint8Array(CANVAS_W * CANVAS_H * 4);
  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTime = lastTime;

  while (!context.signal.aborted) {
    const now = performance.now();
    const dtMs = Math.min(50, now - lastTime);
    lastTime = now;

    if (gameInput.flapQueued) {
      gameInput.flapQueued = false;
      flap(game);
    }
    if (gameInput.restartQueued) {
      gameInput.restartQueued = false;
      if (game.phase === "gameover" && game.gameOverMs > 300) resetGame(game);
    }

    updateGame(game, dtMs);

    if (game.score !== scoreRef.value) scoreRef.value = game.score;
    if (game.phase !== phaseRef.value) phaseRef.value = game.phase;
    if (game.best !== bestRef.value) bestRef.value = game.best;

    renderScene(buf, game);
    const png = encodeRgbaPng(buf, CANVAS_W, CANVAS_H);

    frameCount++;
    if (now - fpsTime >= 1000) {
      fpsRef.value = Math.round((frameCount * 1000) / (now - fpsTime));
      frameCount = 0;
      fpsTime = now;
    }

    yield { png, pixelWidth: CANVAS_W, pixelHeight: CANVAS_H, timestampMs: now };

    const elapsed = performance.now() - now;
    const delay = Math.max(0, FRAME_MS - elapsed);
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
};

// ═══════════════════════════════════════════════════════════════
//  Vue Component
// ═══════════════════════════════════════════════════════════════

const DEFAULT_COLS = 78;
const DEFAULT_ROWS = 24;
const cols = ref(Number.isFinite(process.stdout.columns) ? process.stdout.columns : DEFAULT_COLS);
const rows = ref(Number.isFinite(process.stdout.rows) ? process.stdout.rows : DEFAULT_ROWS);
const statusText = ref("READY");

function onFrame(_event: TVideoFrameEvent): void {
  const phase = phaseRef.value;
  if (phase === "ready") {
    statusText.value = "GET READY — SPACE TO START";
  } else if (phase === "playing") {
    statusText.value = `SCORE ${scoreRef.value} · ${fpsRef.value} FPS`;
  } else {
    statusText.value = `GAME OVER — SCORE ${scoreRef.value} · BEST ${bestRef.value}`;
  }
}

function onError(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  statusText.value = `ERROR: ${msg}`;
}

const FlappyBirdTerminal = defineComponent({
  name: "FlappyBirdTerminal",
  setup() {
    return () => {
      const boxW = Math.max(44, cols.value);
      const boxH = Math.max(16, rows.value);
      const contentW = Math.max(40, boxW - 4);
      const gameH = Math.max(6, boxH - 9);
      return h(
        TBox,
        {
          x: 0, y: 0, w: boxW, h: boxH, border: true, padding: 1,
          title: " 🐦 FLAPPY BIRD · TUI ",
          style: { fg: "yellowBright", bg: "black" },
          titleStyle: { fg: "yellow", bold: true },
        },
        () => [
          h(TText, { x: 0, y: 0, w: contentW, value: statusText.value, style: { fg: "yellowBright", bold: true } }),
          h(TVideo, {
            x: 0, y: 2, w: contentW, h: gameH,
            src: "flappy-bird://game", frameSource: flappyFrameSource,
            pixelWidth: CANVAS_W, pixelHeight: CANVAS_H, maxFps: TARGET_FPS,
            fallback: "[Flappy Bird — graphics protocol unavailable]",
            style: { bg: "black" }, onFrame, onError,
          }),
          h(TText, {
            x: 0, y: gameH + 2, w: contentW,
            value: "SPACE flap · R restart · Q quit",
            style: { fg: "white", dim: true },
          }),
        ],
      );
    };
  },
});

// ═══════════════════════════════════════════════════════════════
//  Main runner
// ═══════════════════════════════════════════════════════════════

export function runFlappyBird(): void {
  if (!checkTerminalSupport()) {
    process.exit(1);
  }

  const smoke = process.env.VT_SMOKE === "1";
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const app = createTerminalApp({
    cols: cols.value, rows: rows.value,
    component: FlappyBirdTerminal,
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
      : interactive
        ? {
            output: process.stdout,
            hideCursor: true,
            altScreen: true,
            colorMode: "truecolor",
          }
        : {
            output: process.stdout,
            clear: false,
            hideCursor: false,
            altScreen: false,
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
    const game = createGame(0);
    const buf = new Uint8Array(CANVAS_W * CANVAS_H * 4);
    flap(game);
    let framesEncoded = 0;
    for (let i = 0; i < 120; i++) {
      if (game.birdVY > 1.5) flap(game);
      updateGame(game, 16.67);
      renderScene(buf, game);
      const png = encodeRgbaPng(buf, CANVAS_W, CANVAS_H);
      if (png.length < 100 || png[0] !== 0x89 || png[1] !== 0x50) {
        process.stderr.write("Smoke: invalid PNG output\n");
        cleanup();
        process.exit(1);
      }
      framesEncoded++;
    }
    app.scheduler.flushNow();
    const snapshot = app.terminal.snapshot().lines.join("\n");
    if (!snapshot.includes("FLAPPY BIRD")) {
      process.stderr.write("Smoke: snapshot missing FLAPPY BIRD title\n");
      cleanup();
      process.exit(1);
    }
    process.stderr.write(
      `Smoke OK — ${framesEncoded} frames encoded, phase=${game.phase}, score=${game.score}\n`,
    );
    cleanup();
  } else {
    process.stdout.on("resize", onResize);
    cleanupHandle = installTerminalCleanup(cleanup, {
      signalPolicy: "exit",
      cleanupOnUnhandledRejection: true,
      rethrowUnhandledRejection: true,
    });
    driver = createStdinDriver({
      dispatch(event) {
        if (event.type === "keydown") {
          const key = event.key.toLowerCase();
          if (key === " " || key === "arrowup" || key === "w") {
            gameInput.flapQueued = true;
            app.scheduler.flushNow();
            return true;
          }
          if (key === "r" && !event.ctrlKey && !event.metaKey) {
            gameInput.restartQueued = true;
            app.scheduler.flushNow();
            return true;
          }
          if (key === "q" || (key === "c" && event.ctrlKey)) {
            exit();
            return true;
          }
        }
        const prevented = app.events.dispatch(event);
        app.scheduler.flushNow();
        return prevented;
      },
      enableMouse: false,
      onExit: () => exit(),
    });
  }
}
