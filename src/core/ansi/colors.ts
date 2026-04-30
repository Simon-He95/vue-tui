import type { AnsiColorName } from "../types.js";
import { ansiColorRgb } from "../ansi-palette.js";

export type TerminalColorMode = "ansi8" | "ansi16" | "ansi256" | "truecolor";
export type TerminalColorLevel = 8 | 16 | 256;

export type AnsiRgb = Readonly<{ r: number; g: number; b: number }>;

export type Ansi8ColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

export const ANSI8_COLOR_NAMES: readonly Ansi8ColorName[] = Object.freeze([
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
]);

export const ANSI16_COLOR_NAMES: readonly AnsiColorName[] = Object.freeze([
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
]);

export type AnsiColorEntry = Readonly<{
  level: TerminalColorLevel;
  /** 0..(level-1) for ansi8/16; 0..255 for ansi256 */
  index: number;
  name?: AnsiColorName;
  rgb: AnsiRgb;
  fgOpen: string;
  bgOpen: string;
}>;

const ESC = "\u001B[";
export const SGR_RESET = `${ESC}0m`;
export const SGR_BOLD = `${ESC}1m`;
export const SGR_DIM = `${ESC}2m`;
export const SGR_ITALIC = `${ESC}3m`;
export const SGR_UNDERLINE = `${ESC}4m`;
export const SGR_INVERSE = `${ESC}7m`;

export function toAnsi8ColorName(name: AnsiColorName): Ansi8ColorName {
  switch (name) {
    case "black":
    case "red":
    case "green":
    case "yellow":
    case "blue":
    case "magenta":
    case "cyan":
    case "white":
      return name;
    case "blackBright":
      return "black";
    case "redBright":
      return "red";
    case "greenBright":
      return "green";
    case "yellowBright":
      return "yellow";
    case "blueBright":
      return "blue";
    case "magentaBright":
      return "magenta";
    case "cyanBright":
      return "cyan";
    case "whiteBright":
      return "white";
  }
}

const ANSI16_FG_CODE: Readonly<Record<AnsiColorName, number>> = Object.freeze({
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  blackBright: 90,
  redBright: 91,
  greenBright: 92,
  yellowBright: 93,
  blueBright: 94,
  magentaBright: 95,
  cyanBright: 96,
  whiteBright: 97,
});

const ANSI16_BG_CODE: Readonly<Record<AnsiColorName, number>> = Object.freeze({
  black: 40,
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46,
  white: 47,
  blackBright: 100,
  redBright: 101,
  greenBright: 102,
  yellowBright: 103,
  blueBright: 104,
  magentaBright: 105,
  cyanBright: 106,
  whiteBright: 107,
});

export function ansi8FgOpen(name: AnsiColorName): string {
  const base = toAnsi8ColorName(name);
  const idx = ANSI8_COLOR_NAMES.indexOf(base);
  return `${ESC}${30 + (idx < 0 ? 7 : idx)}m`;
}

export function ansi8BgOpen(name: AnsiColorName): string {
  const base = toAnsi8ColorName(name);
  const idx = ANSI8_COLOR_NAMES.indexOf(base);
  return `${ESC}${40 + (idx < 0 ? 0 : idx)}m`;
}

export function ansi16FgOpen(name: AnsiColorName): string {
  return `${ESC}${ANSI16_FG_CODE[name]}m`;
}

export function ansi16BgOpen(name: AnsiColorName): string {
  return `${ESC}${ANSI16_BG_CODE[name]}m`;
}

export function ansi256FgOpen(index: number): string {
  const n = clampAnsiIndex(index);
  return `${ESC}38;5;${n}m`;
}

export function ansi256BgOpen(index: number): string {
  const n = clampAnsiIndex(index);
  return `${ESC}48;5;${n}m`;
}

export function truecolorFgOpen(rgb: AnsiRgb): string {
  return `${ESC}38;2;${clampByte(rgb.r)};${clampByte(rgb.g)};${clampByte(rgb.b)}m`;
}

export function truecolorBgOpen(rgb: AnsiRgb): string {
  return `${ESC}48;2;${clampByte(rgb.r)};${clampByte(rgb.g)};${clampByte(rgb.b)}m`;
}

export function ansi256ToRgb(index: number): AnsiRgb {
  const n = clampAnsiIndex(index);
  if (n < 16) {
    // First 16 are "system colors" and can vary by theme; we use our stable palette.
    const name = ANSI16_COLOR_NAMES[n] ?? "white";
    return ansiColorRgb(name) ?? { r: 255, g: 255, b: 255 };
  }
  if (n >= 232) {
    const c = 8 + (n - 232) * 10;
    return { r: c, g: c, b: c };
  }
  const i = n - 16;
  const rr = Math.floor(i / 36);
  const gg = Math.floor((i % 36) / 6);
  const bb = i % 6;
  const levels = [0, 95, 135, 175, 215, 255] as const;
  return { r: levels[rr]!, g: levels[gg]!, b: levels[bb]! };
}

export function rgbToAnsi256(rgb: AnsiRgb): number {
  const r = clampByte(rgb.r);
  const g = clampByte(rgb.g);
  const b = clampByte(rgb.b);

  const levels = [0, 95, 135, 175, 215, 255] as const;
  const nearestLevelIndex = (v: number): number => {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < levels.length; i++) {
      const d = (v - levels[i]!) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const ri = nearestLevelIndex(r);
  const gi = nearestLevelIndex(g);
  const bi = nearestLevelIndex(b);
  const cubeIndex = 16 + 36 * ri + 6 * gi + bi;
  const cube = ansi256ToRgb(cubeIndex);
  const cubeDist = (r - cube.r) ** 2 + (g - cube.g) ** 2 + (b - cube.b) ** 2;

  const gray = Math.round((r + g + b) / 3);
  const grayIndex = gray < 8 ? 16 : gray > 248 ? 231 : 232 + Math.round((gray - 8) / 10);
  const grayRgb = ansi256ToRgb(grayIndex);
  const grayDist = (r - grayRgb.r) ** 2 + (g - grayRgb.g) ** 2 + (b - grayRgb.b) ** 2;

  return grayDist < cubeDist ? grayIndex : cubeIndex;
}

export function rgbToAnsi16(rgb: AnsiRgb): AnsiColorName {
  const r = clampByte(rgb.r);
  const g = clampByte(rgb.g);
  const b = clampByte(rgb.b);

  let best: AnsiColorName = "white";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const name of ANSI16_COLOR_NAMES) {
    const candidate = ansiColorRgb(name) ?? { r: 255, g: 255, b: 255 };
    const dr = r - candidate.r;
    const dg = g - candidate.g;
    const db = b - candidate.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }

  return best;
}

export function ansi8Palette(): readonly AnsiColorEntry[] {
  return ANSI8_COLOR_NAMES.map((name, index) => {
    const rgb = ansiColorRgb(name) ?? { r: 255, g: 255, b: 255 };
    return Object.freeze({
      level: 8,
      index,
      name,
      rgb,
      fgOpen: ansi8FgOpen(name),
      bgOpen: ansi8BgOpen(name),
    });
  });
}

export function ansi16Palette(): readonly AnsiColorEntry[] {
  return ANSI16_COLOR_NAMES.map((name, index) => {
    const rgb = ansiColorRgb(name) ?? { r: 255, g: 255, b: 255 };
    return Object.freeze({
      level: 16,
      index,
      name,
      rgb,
      fgOpen: ansi16FgOpen(name),
      bgOpen: ansi16BgOpen(name),
    });
  });
}

export function ansi256Palette(): readonly AnsiColorEntry[] {
  const out: AnsiColorEntry[] = [];
  for (let index = 0; index < 256; index++) {
    out.push(
      Object.freeze({
        level: 256,
        index,
        rgb: ansi256ToRgb(index),
        fgOpen: ansi256FgOpen(index),
        bgOpen: ansi256BgOpen(index),
      }),
    );
  }
  return Object.freeze(out);
}

function clampAnsiIndex(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(n)));
}

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}
