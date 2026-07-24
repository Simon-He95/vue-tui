import { deflateSync } from "node:zlib";

// ═══════════════════════════════════════════════════════════════
//  Canvas & Game Constants
// ═══════════════════════════════════════════════════════════════

export const CANVAS_W = 432;
export const CANVAS_H = 288;
const GROUND_Y = 248;
const BIRD_X = 96;
const BIRD_START_Y = 120;
const BIRD_SCALE = 2;
const BIRD_HITBOX_W = 18;
const BIRD_HITBOX_H = 14;

const PIPE_WIDTH = 56;
const PIPE_CAP_EXTRA = 4;
const PIPE_CAP_HEIGHT = 24;

const GRAVITY = 0.22;
const FLAP_VELOCITY = -4.2;
const MAX_FALL_SPEED = 6;
const BASE_SPEED = 1.4;
const MAX_SPEED = 3.6;
const BASE_GAP = 108;
const MIN_GAP = 74;
const BASE_SPAWN_MS = 1700;
const MIN_SPAWN_MS = 1050;

export const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

// ═══════════════════════════════════════════════════════════════
//  Color Palette
// ═══════════════════════════════════════════════════════════════

type RGBA = readonly [number, number, number, number];

const C = {
  sky: [112, 197, 206, 255] as RGBA,
  cloud: [255, 255, 255, 170] as RGBA,
  ground: [222, 216, 149, 255] as RGBA,
  groundDark: [196, 188, 122, 255] as RGBA,
  grass: [115, 191, 46, 255] as RGBA,
  grassDark: [90, 128, 34, 255] as RGBA,
  bush: [94, 168, 74, 255] as RGBA,
  birdBlack: [50, 40, 30, 255] as RGBA,
  birdYellow: [250, 214, 11, 255] as RGBA,
  birdDarkYel: [232, 168, 28, 255] as RGBA,
  birdWhite: [255, 255, 255, 255] as RGBA,
  birdPupil: [40, 32, 30, 255] as RGBA,
  birdOrange: [244, 99, 47, 255] as RGBA,
  birdDarkOrg: [212, 82, 30, 255] as RGBA,
  birdRed: [213, 38, 28, 255] as RGBA,
  birdCream: [240, 224, 160, 255] as RGBA,
  pipeGreen: [115, 191, 46, 255] as RGBA,
  pipeLight: [156, 220, 108, 255] as RGBA,
  pipeDark: [85, 128, 34, 255] as RGBA,
  pipeOutline: [50, 48, 48, 255] as RGBA,
  textWhite: [255, 255, 255, 255] as RGBA,
  textShadow: [60, 50, 40, 255] as RGBA,
  textYellow: [250, 214, 11, 255] as RGBA,
} as const;

// ═══════════════════════════════════════════════════════════════
//  Bird Sprite & Wing Sprite
// ═══════════════════════════════════════════════════════════════

const BIRD_SPRITE: string[] = [
  ".....KKKK.......",
  "...KKYYYYKK.....",
  "..KYYYYYYYYK....",
  ".KYYWWBWYYYYK...",
  ".KYWWBBWYYYKOOK.",
  "KYYWWWBWYYKORROK",
  "KYYWWWBWYYKOOOK.",
  "KYYYYYYYYYKOOK.",
  ".KYYyyyyyYKKOK.",
  ".KKyyyyyyKKKKK.",
  "..KKKKKKKKK....",
  "...............",
];

const BIRD_COLORS: Record<string, RGBA> = {
  K: C.birdBlack, Y: C.birdYellow, y: C.birdDarkYel, W: C.birdWhite,
  B: C.birdPupil, O: C.birdOrange, o: C.birdDarkOrg, R: C.birdRed,
};

const WING_SPRITE: string[] = [".KKKKK.", "KcccccK", "KcccccK", "KcccccK", ".KKKK.."];
const WING_COLORS: Record<string, RGBA> = { K: C.birdBlack, c: C.birdCream };

// ═══════════════════════════════════════════════════════════════
//  5×7 Pixel Font
// ═══════════════════════════════════════════════════════════════

const FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
};
const FONT_CHAR_W = 5;
const FONT_CHAR_H = 7;

// ═══════════════════════════════════════════════════════════════
//  PNG Encoder
// ═══════════════════════════════════════════════════════════════

const PNG_SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
let crcTab: Uint32Array | undefined;

function crcTable(): Uint32Array {
  if (crcTab) return crcTab;
  const t = new Uint32Array(256);
  for (let v = 0; v < 256; v++) {
    let c = v;
    for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[v] = c >>> 0;
  }
  crcTab = t;
  return t;
}

function crc32(type: Uint8Array, data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (const bytes of [type, data]) for (const b of bytes) c = t[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function w32(buf: Uint8Array, off: number, v: number): void {
  buf[off] = (v >>> 24) & 0xff;
  buf[off + 1] = (v >>> 16) & 0xff;
  buf[off + 2] = (v >>> 8) & 0xff;
  buf[off + 3] = v & 0xff;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const tb = new TextEncoder().encode(type);
  const c = new Uint8Array(12 + data.byteLength);
  w32(c, 0, data.byteLength);
  c.set(tb, 4);
  c.set(data, 8);
  w32(c, 8 + data.byteLength, crc32(tb, data));
  return c;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.byteLength, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

export function encodeRgbaPng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const pw = Math.floor(w);
  const ph = Math.floor(h);
  if (pw <= 0 || ph <= 0) throw new Error("PNG dimensions must be positive");
  const rowBytes = pw * 4;
  if (rgba.byteLength !== rowBytes * ph) throw new Error("RGBA byte length mismatch");
  const ihdr = new Uint8Array(13);
  w32(ihdr, 0, pw);
  w32(ihdr, 4, ph);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = new Uint8Array((rowBytes + 1) * ph);
  for (let y = 0; y < ph; y++) {
    const t = y * (rowBytes + 1);
    scanlines[t] = 0;
    scanlines.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), t + 1);
  }
  return concatBytes([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(scanlines, { level: 1 }))),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

// ═══════════════════════════════════════════════════════════════
//  Pixel Rendering Primitives
// ═══════════════════════════════════════════════════════════════

function setPx(buf: Uint8Array, w: number, h: number, x: number, y: number, c: RGBA): void {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  const a = c[3];
  if (a === 255) {
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  } else if (a > 0) {
    const af = a / 255;
    const ia = 1 - af;
    buf[i] = Math.round(buf[i]! * ia + c[0] * af);
    buf[i + 1] = Math.round(buf[i + 1]! * ia + c[1] * af);
    buf[i + 2] = Math.round(buf[i + 2]! * ia + c[2] * af);
    buf[i + 3] = 255;
  }
}

function fillRect(buf: Uint8Array, w: number, h: number, x: number, y: number, rw: number, rh: number, c: RGBA): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.ceil(x + rw));
  const y1 = Math.min(h, Math.ceil(y + rh));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * w + px) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = c[3];
    }
  }
}

function fillCircle(buf: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, c: RGBA): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h, Math.ceil(cy + r + 1));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) setPx(buf, w, h, px, py, c);
    }
  }
}

function drawSpriteRotated(
  buf: Uint8Array, w: number, h: number,
  centerX: number, centerY: number,
  sprite: string[], colorMap: Record<string, RGBA>,
  scale: number, angle: number,
): void {
  const sh = sprite.length;
  const sw = sprite[0]!.length;
  const scx = sw / 2;
  const scy = sh / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners: Array<[number, number]> = [
    [-scx, -scy], [sw - scx, -scy], [sw - scx, sh - scy], [-scx, sh - scy],
  ].map(([x, y]) => [
    centerX + (x! * scale) * cos - (y! * scale) * sin,
    centerY + (x! * scale) * sin + (y! * scale) * cos,
  ] as [number, number]);
  const minX = Math.floor(Math.min(...corners.map((c) => c[0])));
  const maxX = Math.ceil(Math.max(...corners.map((c) => c[0])));
  const minY = Math.floor(Math.min(...corners.map((c) => c[1])));
  const maxY = Math.ceil(Math.max(...corners.map((c) => c[1])));
  const invCos = Math.cos(-angle);
  const invSin = Math.sin(-angle);
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = px - centerX;
      const dy = py - centerY;
      const sx = (dx * invCos - dy * invSin) / scale + scx;
      const sy = (dx * invSin + dy * invCos) / scale + scy;
      if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
        const ch = sprite[Math.floor(sy)]![Math.floor(sx)];
        if (ch && ch !== ".") {
          const col = colorMap[ch];
          if (col) setPx(buf, w, h, px, py, col);
        }
      }
    }
  }
}

function drawChar(buf: Uint8Array, w: number, h: number, x: number, y: number, ch: string, scale: number, c: RGBA): void {
  const glyph = FONT[ch] ?? FONT[" "]!;
  for (let gy = 0; gy < FONT_CHAR_H; gy++) {
    const row = glyph[gy]!;
    for (let gx = 0; gx < FONT_CHAR_W; gx++) {
      if (row[gx] === "1") {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            setPx(buf, w, h, x + gx * scale + dx, y + gy * scale + dy, c);
          }
        }
      }
    }
  }
}

function textWidth(text: string, scale: number): number {
  return text.length * (FONT_CHAR_W * scale + scale);
}

function drawTextCentered(buf: Uint8Array, w: number, h: number, text: string, cx: number, y: number, scale: number, c: RGBA, shadow: RGBA): void {
  const tw = textWidth(text, scale);
  const startX = Math.round(cx - tw / 2);
  let x = startX + scale;
  for (const ch of text) {
    drawChar(buf, w, h, x, y + scale, ch, scale, shadow);
    x += FONT_CHAR_W * scale + scale;
  }
  x = startX;
  for (const ch of text) {
    drawChar(buf, w, h, x, y, ch, scale, c);
    x += FONT_CHAR_W * scale + scale;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Scene Rendering
// ═══════════════════════════════════════════════════════════════

function drawClouds(buf: Uint8Array, offset: number): void {
  const clouds = [{ x: 60, y: 36, r: 14 }, { x: 180, y: 55, r: 11 }, { x: 310, y: 30, r: 16 }, { x: 440, y: 60, r: 12 }];
  for (const cl of clouds) {
    const x = ((cl.x - offset * 0.3) % (CANVAS_W + 100) + CANVAS_W + 100) % (CANVAS_W + 100) - 50;
    fillCircle(buf, CANVAS_W, CANVAS_H, x, cl.y, cl.r, C.cloud);
    fillCircle(buf, CANVAS_W, CANVAS_H, x + cl.r * 0.7, cl.y + 2, cl.r * 0.6, C.cloud);
    fillCircle(buf, CANVAS_W, CANVAS_H, x - cl.r * 0.7, cl.y + 2, cl.r * 0.6, C.cloud);
    fillCircle(buf, CANVAS_W, CANVAS_H, x + cl.r * 0.2, cl.y - cl.r * 0.4, cl.r * 0.7, C.cloud);
  }
}

function drawBushes(buf: Uint8Array, offset: number): void {
  const bushY = GROUND_Y - 8;
  for (let bx = -offset % 80; bx < CANVAS_W + 40; bx += 80) {
    fillCircle(buf, CANVAS_W, CANVAS_H, bx + 16, bushY, 10, C.bush);
    fillCircle(buf, CANVAS_W, CANVAS_H, bx + 30, bushY - 4, 8, C.bush);
    fillCircle(buf, CANVAS_W, CANVAS_H, bx + 42, bushY, 9, C.bush);
  }
}

function drawGround(buf: Uint8Array, offset: number): void {
  fillRect(buf, CANVAS_W, CANVAS_H, 0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y, C.ground);
  fillRect(buf, CANVAS_W, CANVAS_H, 0, GROUND_Y, CANVAS_W, 4, C.grass);
  fillRect(buf, CANVAS_W, CANVAS_H, 0, GROUND_Y + 3, CANVAS_W, 2, C.grassDark);
  const stripeW = 12;
  const total = 24;
  for (let x = -((offset % total) + total); x < CANVAS_W; x += total) {
    for (let row = 0; row < CANVAS_H - GROUND_Y - 6; row++) {
      const sx = x + row;
      fillRect(buf, CANVAS_W, CANVAS_H, sx, GROUND_Y + 6 + row, stripeW, 1, C.groundDark);
    }
  }
}

function drawPipeBody(buf: Uint8Array, x: number, y: number, w: number, h: number): void {
  if (h <= 0) return;
  fillRect(buf, CANVAS_W, CANVAS_H, x, y, w, h, C.pipeGreen);
  fillRect(buf, CANVAS_W, CANVAS_H, x + 3, y, 7, h, C.pipeLight);
  fillRect(buf, CANVAS_W, CANVAS_H, x + w - 9, y, 6, h, C.pipeDark);
  fillRect(buf, CANVAS_W, CANVAS_H, x, y, 2, h, C.pipeOutline);
  fillRect(buf, CANVAS_W, CANVAS_H, x + w - 2, y, 2, h, C.pipeOutline);
}

function drawPipeCap(buf: Uint8Array, x: number, y: number, w: number, h: number): void {
  fillRect(buf, CANVAS_W, CANVAS_H, x, y, w, h, C.pipeGreen);
  fillRect(buf, CANVAS_W, CANVAS_H, x + 3, y, 9, h, C.pipeLight);
  fillRect(buf, CANVAS_W, CANVAS_H, x + w - 11, y, 7, h, C.pipeDark);
  fillRect(buf, CANVAS_W, CANVAS_H, x, y, w, 2, C.pipeOutline);
  fillRect(buf, CANVAS_W, CANVAS_H, x, y + h - 2, w, 2, C.pipeOutline);
  fillRect(buf, CANVAS_W, CANVAS_H, x, y, 2, h, C.pipeOutline);
  fillRect(buf, CANVAS_W, CANVAS_H, x + w - 2, y, 2, h, C.pipeOutline);
}

function drawPipe(buf: Uint8Array, x: number, gapCenterY: number, gapH: number): void {
  const gapTop = Math.floor(gapCenterY - gapH / 2);
  const gapBottom = Math.floor(gapCenterY + gapH / 2);
  const bodyX = Math.round(x);
  const capX = bodyX - PIPE_CAP_EXTRA;
  const capW = PIPE_WIDTH + PIPE_CAP_EXTRA * 2;
  const topBodyH = gapTop - PIPE_CAP_HEIGHT;
  if (topBodyH > 0) drawPipeBody(buf, bodyX, 0, PIPE_WIDTH, topBodyH);
  drawPipeCap(buf, capX, gapTop - PIPE_CAP_HEIGHT, capW, PIPE_CAP_HEIGHT);
  const botBodyY = gapBottom + PIPE_CAP_HEIGHT;
  const botBodyH = GROUND_Y - botBodyY;
  if (botBodyH > 0) drawPipeBody(buf, bodyX, botBodyY, PIPE_WIDTH, botBodyH);
  drawPipeCap(buf, capX, gapBottom, capW, PIPE_CAP_HEIGHT);
}

function drawBird(buf: Uint8Array, cx: number, cy: number, angle: number, wingPhase: number): void {
  drawSpriteRotated(buf, CANVAS_W, CANVAS_H, cx, cy, BIRD_SPRITE, BIRD_COLORS, BIRD_SCALE, angle);
  const wingOffsets = [-5, 0, 5];
  const wingDy = wingOffsets[wingPhase % 3]!;
  const wingOffX = -4;
  const wingOffY = 4 + wingDy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const wcx = cx + wingOffX * cos - wingOffY * sin;
  const wcy = cy + wingOffX * sin + wingOffY * cos;
  drawSpriteRotated(buf, CANVAS_W, CANVAS_H, wcx, wcy, WING_SPRITE, WING_COLORS, BIRD_SCALE, angle);
}

function drawScore(buf: Uint8Array, score: number): void {
  const text = String(score);
  const scale = 4;
  const tw = textWidth(text, scale);
  const x = Math.round((CANVAS_W - tw) / 2);
  const y = 24;
  let sx = x + scale;
  for (const ch of text) {
    drawChar(buf, CANVAS_W, CANVAS_H, sx, y + scale, ch, scale, C.textShadow);
    sx += FONT_CHAR_W * scale + scale;
  }
  sx = x;
  for (const ch of text) {
    drawChar(buf, CANVAS_W, CANVAS_H, sx, y, ch, scale, C.textWhite);
    sx += FONT_CHAR_W * scale + scale;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Game State & Engine
// ═══════════════════════════════════════════════════════════════

export interface Pipe {
  x: number;
  gapCenterY: number;
  gapHeight: number;
  passed: boolean;
}

export type GamePhase = "ready" | "playing" | "gameover";

export interface FlappyGame {
  phase: GamePhase;
  birdY: number;
  birdVY: number;
  birdAngle: number;
  pipes: Pipe[];
  score: number;
  best: number;
  elapsedMs: number;
  speed: number;
  pipeGap: number;
  spawnIntervalMs: number;
  lastSpawnMs: number;
  groundOffset: number;
  cloudOffset: number;
  flapAnim: number;
  gameOverMs: number;
  flashAlpha: number;
}

export function createGame(best: number): FlappyGame {
  return {
    phase: "ready", birdY: BIRD_START_Y, birdVY: 0, birdAngle: 0, pipes: [], score: 0,
    best, elapsedMs: 0, speed: BASE_SPEED, pipeGap: BASE_GAP, spawnIntervalMs: BASE_SPAWN_MS,
    lastSpawnMs: 0, groundOffset: 0, cloudOffset: 0, flapAnim: 0, gameOverMs: 0, flashAlpha: 0,
  };
}

export function resetGame(game: FlappyGame): void {
  Object.assign(game, createGame(game.best));
}

export function flap(game: FlappyGame): void {
  if (game.phase === "ready") game.phase = "playing";
  if (game.phase === "playing") {
    game.birdVY = FLAP_VELOCITY;
    game.flapAnim = 0;
  }
}

function gameOver(game: FlappyGame): void {
  game.phase = "gameover";
  game.best = Math.max(game.best, game.score);
  game.gameOverMs = 0;
  game.flashAlpha = 0.5;
}

export function updateGame(game: FlappyGame, dtMs: number): void {
  const dt = Math.min(2.5, dtMs / (1000 / 60));
  if (game.phase !== "gameover") game.flapAnim += dt * (game.birdVY < 0 ? 0.8 : 0.35);

  if (game.phase === "ready") {
    game.birdY = BIRD_START_Y + Math.sin(game.elapsedMs / 300) * 7;
    game.birdAngle = Math.sin(game.elapsedMs / 300) * 0.12;
    game.elapsedMs += dtMs;
    game.groundOffset = (game.groundOffset + 0.3 * dt) % 24;
    game.cloudOffset += 0.1 * dt;
    return;
  }

  if (game.phase === "gameover") {
    game.gameOverMs += dtMs;
    game.flashAlpha = Math.max(0, game.flashAlpha - dt * 0.04);
    if (game.birdY + BIRD_HITBOX_H / 2 < GROUND_Y) {
      game.birdVY = Math.min(MAX_FALL_SPEED, game.birdVY + GRAVITY * 1.5 * dt);
      game.birdY += game.birdVY * dt;
      game.birdAngle = Math.min(1.4, game.birdAngle + 0.04 * dt);
    } else {
      game.birdY = GROUND_Y - BIRD_HITBOX_H / 2;
    }
    game.groundOffset = (game.groundOffset + game.speed * 0.15 * dt) % 24;
    return;
  }

  game.elapsedMs += dtMs;
  game.speed = Math.min(MAX_SPEED, BASE_SPEED + Math.floor(game.elapsedMs / 10000) * 0.35);
  game.pipeGap = Math.max(MIN_GAP, BASE_GAP - Math.floor(game.elapsedMs / 15000) * 5);
  game.spawnIntervalMs = Math.max(MIN_SPAWN_MS, BASE_SPAWN_MS - Math.floor(game.elapsedMs / 20000) * 120);
  game.birdVY = Math.min(MAX_FALL_SPEED, game.birdVY + GRAVITY * dt);
  game.birdY += game.birdVY * dt;
  game.birdAngle = game.birdVY < 0 ? Math.max(-0.45, game.birdVY * 0.12) : Math.min(1.2, game.birdVY * 0.09);
  for (const pipe of game.pipes) pipe.x -= game.speed * dt;
  game.pipes = game.pipes.filter((p) => p.x > -PIPE_WIDTH - 10);
  if (game.elapsedMs - game.lastSpawnMs >= game.spawnIntervalMs) {
    game.lastSpawnMs = game.elapsedMs;
    const margin = 60;
    const gapCenterY = margin + game.pipeGap / 2 + Math.random() * (GROUND_Y - margin * 2 - game.pipeGap);
    game.pipes.push({ x: CANVAS_W + PIPE_WIDTH, gapCenterY, gapHeight: game.pipeGap, passed: false });
  }
  for (const pipe of game.pipes) {
    if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.passed = true;
      game.score++;
    }
  }
  game.groundOffset = (game.groundOffset + game.speed * dt) % 24;
  game.cloudOffset += game.speed * 0.25 * dt;

  const bL = BIRD_X - BIRD_HITBOX_W / 2;
  const bR = BIRD_X + BIRD_HITBOX_W / 2;
  const bT = game.birdY - BIRD_HITBOX_H / 2;
  const bB = game.birdY + BIRD_HITBOX_H / 2;
  if (bB >= GROUND_Y) {
    game.birdY = GROUND_Y - BIRD_HITBOX_H / 2;
    gameOver(game);
    return;
  }
  if (bT < 0) {
    game.birdY = BIRD_HITBOX_H / 2;
    game.birdVY = 0;
  }
  for (const pipe of game.pipes) {
    if (bR > pipe.x && bL < pipe.x + PIPE_WIDTH) {
      const gapTop = pipe.gapCenterY - pipe.gapHeight / 2;
      const gapBottom = pipe.gapCenterY + pipe.gapHeight / 2;
      if (bT < gapTop || bB > gapBottom) {
        gameOver(game);
        return;
      }
    }
  }
}

export function renderScene(buf: Uint8Array, game: FlappyGame): void {
  fillRect(buf, CANVAS_W, CANVAS_H, 0, 0, CANVAS_W, GROUND_Y, C.sky);
  drawClouds(buf, game.cloudOffset);
  drawBushes(buf, game.groundOffset * 0.5);
  for (const pipe of game.pipes) drawPipe(buf, pipe.x, pipe.gapCenterY, pipe.gapHeight);
  drawGround(buf, game.groundOffset);
  const wingPhase = Math.floor(game.flapAnim) % 3;
  drawBird(buf, BIRD_X, Math.round(game.birdY), game.birdAngle, wingPhase);
  if (game.phase === "playing") drawScore(buf, game.score);
  if (game.phase === "ready") {
    drawTextCentered(buf, CANVAS_W, CANVAS_H, "TAP TO FLAP!", CANVAS_W / 2, 70, 3, C.textWhite, C.textShadow);
    drawTextCentered(buf, CANVAS_W, CANVAS_H, "SPACE OR UP", CANVAS_W / 2, 100, 2, C.textYellow, C.textShadow);
  } else if (game.phase === "gameover") {
    if (game.flashAlpha > 0.01) {
      fillRect(buf, CANVAS_W, CANVAS_H, 0, 0, CANVAS_W, CANVAS_H, [255, 255, 255, Math.round(game.flashAlpha * 255)]);
    }
    if (game.gameOverMs > 300) {
      drawTextCentered(buf, CANVAS_W, CANVAS_H, "GAME OVER", CANVAS_W / 2, 60, 4, C.textWhite, C.textShadow);
      drawTextCentered(buf, CANVAS_W, CANVAS_H, "SCORE " + game.score, CANVAS_W / 2, 105, 2, C.textWhite, C.textShadow);
      drawTextCentered(buf, CANVAS_W, CANVAS_H, "BEST " + game.best, CANVAS_W / 2, 130, 2, C.textYellow, C.textShadow);
      if (game.gameOverMs > 800) {
        drawTextCentered(buf, CANVAS_W, CANVAS_H, "TAP R TO RESTART", CANVAS_W / 2, 170, 2, C.textWhite, C.textShadow);
      }
    }
  }
}
