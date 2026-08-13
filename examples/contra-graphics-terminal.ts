/**
 * Terminal Contra (魂斗罗) — kitty-graphics CLI Runner
 *
 * Interactive:  tsx examples/contra-graphics-terminal.ts      (bun run run:contra:terminal)
 * Smoke:        VT_SMOKE=1 tsx examples/contra-graphics-terminal.ts
 *
 * Like terminal-flappy-bird, the scene is rasterized to pixels (432×288) and
 * streamed through the terminal graphics queue (kitty / iTerm2 / sixel).
 * Runs only in terminals that support a graphics protocol.
 */
import { nextTick } from "vue";
import { inflateSync } from "node:zlib";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  detectTerminalGraphicsCapabilities,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "../src/cli.js";
import {
  createContraVideoGame,
  FRAME_MS,
  getContraVideoLayout,
} from "./contra-graphics/ContraVideoGame.js";
import { CANVAS_H, CANVAS_W, renderScene } from "./contra-graphics/scene.js";
import { encodeRgbaPng } from "./contra-graphics/art.js";

const smoke = process.env.VT_SMOKE === "1";
const interactive = !smoke;
const MIN_COLS = 64;
const MIN_ROWS = 22;

/** Independent PNG validator: spec CRC-32 per chunk + IDAT inflate size. */
const PNG_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function pngCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = PNG_CRC_TABLE[(c ^ bytes[i]!) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function validatePngChunks(png: Uint8Array): boolean {
  if (png.length < 8 || png[0] !== 137 || png[1] !== 80) return false;
  let off = 8;
  let idat: Uint8Array | null = null;
  let dims: { w: number; h: number } | null = null;
  while (off < png.length) {
    if (off + 12 > png.length) return false;
    const len =
      ((png[off]! << 24) | (png[off + 1]! << 16) | (png[off + 2]! << 8) | png[off + 3]!) >>> 0;
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!);
    const chunkEnd = off + 12 + len;
    if (chunkEnd > png.length) return false;
    const stored =
      ((png[chunkEnd - 4]! << 24) |
        (png[chunkEnd - 3]! << 16) |
        (png[chunkEnd - 2]! << 8) |
        png[chunkEnd - 1]!) >>>
      0;
    const expected = pngCrc32(png.subarray(off + 4, chunkEnd - 4));
    if (stored !== expected) return false;
    if (type === "IDAT") {
      idat = png.subarray(off + 8, chunkEnd - 4);
    } else if (type === "IHDR") {
      const w =
        ((png[off + 8]! << 24) | (png[off + 9]! << 16) | (png[off + 10]! << 8) | png[off + 11]!) >>>
        0;
      const h =
        ((png[off + 12]! << 24) |
          (png[off + 13]! << 16) |
          (png[off + 14]! << 8) |
          png[off + 15]!) >>>
        0;
      dims = { w, h };
    }
    off = chunkEnd;
  }
  if (!idat || !dims) return false;
  try {
    const inflated = inflateSync(idat);
    return inflated.length === dims.w * dims.h * 4 + dims.h;
  } catch {
    return false;
  }
}

/** Count pixels close to the player's blue body color (smoke assertion). */
function countBluePixels(rgba: Uint8Array, w: number, h: number): number {
  let count = 0;
  for (let i = 0; i < w * h * 4; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    if (Math.abs(r - 64) < 70 && Math.abs(g - 142) < 70 && Math.abs(b - 216) < 70) count += 1;
  }
  return count;
}

function liveCols(): number {
  const v = Number(process.stdout.columns);
  return Number.isFinite(v) && v > 0 ? Math.max(MIN_COLS, v) : 80;
}
function liveRows(): number {
  const v = Number(process.stdout.rows);
  return Number.isFinite(v) && v > 0 ? Math.max(MIN_ROWS, v) : 24;
}

/** Friendly banner when the terminal cannot display kitty/iTerm2/sixel images. */
function checkTerminalSupport(): {
  ok: boolean;
  caps: ReturnType<typeof detectTerminalGraphicsCapabilities>;
} {
  if (smoke) {
    return {
      ok: true,
      caps: { supported: false, protocol: "unicode", reason: "smoke" } as never,
    };
  }
  const caps = detectTerminalGraphicsCapabilities();
  if (caps.supported) return { ok: true, caps };
  const lines = [
    "",
    "  ╔══════════════════════════════════════════════════════════════╗",
    "  ║                                                              ║",
    "  ║   💥  CONTRA · 魂斗罗  (terminal edition)                   ║",
    "  ║                                                              ║",
    "  ║   ⚠  This terminal does not support graphics protocols.     ║",
    `  ║      Reason: ${caps.reason ?? "unknown"}`,
    "  ║                                                              ║",
    "  ║   Supported terminals:                                       ║",
    "  ║     • Kitty           (kitty)                                ║",
    "  ║     • iTerm2           (iterm2)                               ║",
    "  ║     • WezTerm          (iterm2-compatible)                    ║",
    "  ║     • Ghostty          (kitty-compatible)                     ║",
    "  ║     • Any Sixel terminal                                      ║",
    "  ║                                                              ║",
    "  ║   To force detection:                                        ║",
    "  ║     VUE_TUI_GRAPHICS_FORCE=1 tsx examples/contra-graphics-terminal.ts",
    "  ║                                                              ║",
    "  ║   Or select a protocol manually:                             ║",
    "  ║     VUE_TUI_TERMINAL_GRAPHICS=kitty  ...                     ║",
    "  ║     VUE_TUI_TERMINAL_GRAPHICS=iterm2 ...                     ║",
    "  ║     VUE_TUI_TERMINAL_GRAPHICS=sixel  ...                     ║",
    "  ║                                                              ║",
    "  ╚══════════════════════════════════════════════════════════════╝",
    "",
  ];
  if (caps.multiplexer) {
    lines.splice(
      16,
      0,
      `  ║   Tip: You're inside ${caps.multiplexer}. Try enabling passthrough:`,
      "  ║        VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH=1",
      "  ║                                                              ║",
    );
  }
  process.stderr.write(lines.join("\n") + "\n");
  return { ok: false, caps };
}

const support = checkTerminalSupport();
if (!support.ok) process.exit(1);
if (!smoke) {
  // Boot diagnostics: helps report issues when the screen stays blank.
  process.stderr.write(
    `[contra] graphics=${support.caps.protocol} tty=${Boolean(process.stdout.isTTY)} ` +
      `cols=${liveCols()} rows=${liveRows()} term=${process.env.TERM ?? ""} ` +
      `termProgram=${process.env.TERM_PROGRAM ?? ""}\n`,
  );
}

const cols = smoke ? 76 : liveCols();
const rows = smoke ? 24 : liveRows();

const { component, engine } = createContraVideoGame({
  cols: cols - 2,
  rows: rows - 2,
  seed: smoke ? 20260809 : undefined,
  speedScale: smoke ? 3 : 1,
  firstSpawnMs: smoke ? 200 : undefined,
});

const app = createTerminalApp({
  cols,
  rows,
  component,
  defaultStyle: { fg: "white", bg: "black" },
});
app.mount();
// Guarantee the first paint: Vue's render nodes register on the scheduler's
// next flush, so wait one tick before (and again after) attaching the stdout
// renderer — otherwise the alternate screen can sit blank.
const settleFirstPaint = async () => {
  await nextTick();
  app.scheduler.flushNow();
};

const rendererChunks: string[] = [];
const out = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: {
          isTTY: false,
          write(chunk: string) {
            rendererChunks.push(chunk);
          },
        },
        clear: false,
        hideCursor: false,
        altScreen: false,
        colorMode: "truecolor",
      }
    : {
        output: process.stdout,
        hideCursor: true,
        altScreen: true,
        clear: true,
        colorMode: "truecolor",
      },
);
void settleFirstPaint().then(() => {
  app.scheduler.flushNow();
  if (interactive) app.scheduler.flush();
});

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let exiting = false;

const onResize = () => {
  if (smoke) return;
  const nextCols = Math.max(MIN_COLS, liveCols());
  const nextRows = Math.max(MIN_ROWS, liveRows());
  if (nextCols === cols && nextRows === rows) return;
  app.terminal.resize(nextCols, nextRows);
  app.scheduler.flushNow();
  out.forceRender();
};

const cleanup = () => {
  if (exiting) return;
  exiting = true;
  if (process.stdout.isTTY) process.stdout.off("resize", onResize);
  cleanupHandle?.uninstall();
  cleanupHandle = null;
  driver?.dispose();
  out.dispose();
  app.dispose();
};

const exit = (status = 0) => {
  cleanup();
  process.exit(status);
};

if (process.stdout.isTTY) {
  process.stdout.on("resize", onResize);
}

async function runSmoke(): Promise<void> {
  await nextTick();
  app.scheduler.flushNow();

  // Deterministic scenario: walk right, jump, turn, hold fire until a grunt
  // dies, then pause/resume. Frames are rasterized + PNG-encoded by hand.
  const buf = new Uint8Array(CANVAS_W * CANVAS_H * 4);
  const pump = (count: number) => {
    let i = 0;
    for (i = 0; i < count; i++) engine.step(FRAME_MS);
    return i;
  };

  engine.pressKey("ArrowRight");
  pump(40);
  engine.pressKey(" ");
  pump(20);
  engine.pressKey("ArrowLeft");
  pump(25);
  engine.pressKey("ArrowRight");

  let fireSteps = 0;
  while (engine.snapshot().kills === 0 && fireSteps < 400) {
    engine.pressKey("j");
    engine.step(FRAME_MS);
    fireSteps += 1;
  }

  const beforePause = engine.snapshot();
  engine.pressKey("p");
  pump(1);
  const whilePaused = engine.snapshot();
  engine.pressKey("p");
  pump(1);
  const final = engine.snapshot();

  // Rasterize + encode 24 frames (all phases) and validate PNG output with an
  // independent decoder-side check: chunk CRCs must match the PNG spec and the
  // IDAT payload must inflate to exactly W*H*4 + H scanline bytes. (This catches
  // encoder bugs that magic-byte checks miss — e.g. a broken CRC table shows up
  // as a gray image in kitty/ghostty.)
  let framesEncoded = 0;
  let pngBytes = 0;
  let sceneOk = true;
  let pngStructOk = true;
  let fightersVisible = false;
  for (let i = 0; i < 24; i++) {
    const testSnap = engine.snapshot();
    try {
      renderScene(buf, testSnap, i * 3.3);
      const png = encodeRgbaPng(buf, CANVAS_W, CANVAS_H);
      framesEncoded += 1;
      pngBytes = png.length;
      if (png.length < 100 || png[0] !== 137 || png[1] !== 80) sceneOk = false;
      if (!validatePngChunks(png)) pngStructOk = false;
    } catch {
      sceneOk = false;
      pngStructOk = false;
    }
  }

  // The live frame is resampled to the placement-box aspect; make sure it
  // still contains the player sprite (kitty crops misplaced/aspect-mismatched
  // images, which previously made the player invisible).
  {
    const layout = getContraVideoLayout(cols - 2, rows - 2);
    const fw = layout.frameW;
    const fh = layout.frameH;
    const target = new Uint8Array(fw * fh * 4);
    try {
      renderScene(target, final, 3.3, fw, fh);
      const png = encodeRgbaPng(target, fw, fh);
      fightersVisible = validatePngChunks(png) && countBluePixels(target, fw, fh) > 0;
    } catch {
      fightersVisible = false;
    }
  }

  app.scheduler.flushNow();
  const rendered = app.terminal.snapshot().lines.join("\n");

  const result = {
    cols,
    rows,
    phase: final.phase,
    playerX: Math.round(final.player.x),
    groundY: final.groundY,
    kills: final.kills,
    score: final.score,
    lives: final.lives,
    stage: final.stage,
    enemies: final.enemies.length,
    pausedDuring: whilePaused.phase,
    resumed: final.phase === "playing",
    frozenWhilePaused:
      whilePaused.player.x === beforePause.player.x &&
      whilePaused.player.y === beforePause.player.y &&
      whilePaused.enemies.length === beforePause.enemies.length,
    framesEncoded,
    pngBytes,
    sceneOk,
    pngStructOk,
    fightersVisible,
    titleVisible: rendered.includes("CONTRA"),
    hudRendered: rendered.includes("SCORE"),
  };
  const ok =
    result.phase === "playing" &&
    result.resumed &&
    result.frozenWhilePaused &&
    result.kills >= 1 &&
    result.score >= 100 &&
    result.framesEncoded === 24 &&
    result.sceneOk &&
    result.pngStructOk &&
    result.fightersVisible &&
    result.titleVisible &&
    result.hudRendered;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${ok ? "contra-graphics smoke: OK" : "contra-graphics smoke: FAILED"}\n`);
  exit(ok ? 0 : 1);
}

if (smoke) {
  await runSmoke();
} else {
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  driver = createStdinDriver({
    // Kitty/ghostty keyboard-protocol key events need enhanced parsing; a
    // bare terminal game only needs arrows/WASD/space, so request the classic
    // encoding that every terminal speaks.
    keyboardProtocol: "off",
    dispatch: (event) => {
      if (event.type === "keydown") {
        const key = String(event.key ?? "").toLowerCase();
        const isCtrlC = event.ctrlKey === true && key === "c" && !event.metaKey;
        const isQuit = key === "q" && !event.ctrlKey && !event.metaKey;
        if (process.env.VUE_TUI_CONTRA_DEBUG === "1") {
          process.stderr.write(
            `[contra] key="${String(event.key)}" ctrl=${Boolean(event.ctrlKey)} type=${event.type}\n`,
          );
        }
        if (isCtrlC || isQuit) {
          exit();
          return true;
        }
        engine.pressKey(event.key ?? "");
        app.scheduler.flushNow();
        return true;
      }
      const prevented = app.events.dispatch(event);
      app.scheduler.flushNow();
      return prevented;
    },
    enableMouse: false,
    onExit: () => exit(0),
  });
}
