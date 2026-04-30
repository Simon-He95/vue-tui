import {
  ansi8Palette,
  ansi16BgOpen,
  ansi16FgOpen,
  ansi16Palette,
  ansi256BgOpen,
  ansi256FgOpen,
  ansi256Palette,
  SGR_BOLD,
  SGR_DIM,
  SGR_INVERSE,
  SGR_ITALIC,
  SGR_RESET,
  SGR_UNDERLINE,
  truecolorBgOpen,
  truecolorFgOpen,
} from "./core/ansi/colors.js";

const ESC = "\u001B[";

type StyleChunk = Readonly<{ open: string; close: string }>;

function createStyle(open: string, close: string): StyleChunk {
  return Object.freeze({ open, close });
}

export const ansiStyles = Object.freeze({
  reset: createStyle(SGR_RESET, SGR_RESET),
  bold: createStyle(SGR_BOLD, `${ESC}22m`),
  dim: createStyle(SGR_DIM, `${ESC}22m`),
  italic: createStyle(SGR_ITALIC, `${ESC}23m`),
  underline: createStyle(SGR_UNDERLINE, `${ESC}24m`),
  inverse: createStyle(SGR_INVERSE, `${ESC}27m`),

  // 16-color named helpers (common subset of `ansi-styles`).
  black: createStyle(ansi16FgOpen("black"), `${ESC}39m`),
  red: createStyle(ansi16FgOpen("red"), `${ESC}39m`),
  green: createStyle(ansi16FgOpen("green"), `${ESC}39m`),
  yellow: createStyle(ansi16FgOpen("yellow"), `${ESC}39m`),
  blue: createStyle(ansi16FgOpen("blue"), `${ESC}39m`),
  magenta: createStyle(ansi16FgOpen("magenta"), `${ESC}39m`),
  cyan: createStyle(ansi16FgOpen("cyan"), `${ESC}39m`),
  white: createStyle(ansi16FgOpen("white"), `${ESC}39m`),
  blackBright: createStyle(ansi16FgOpen("blackBright"), `${ESC}39m`),
  redBright: createStyle(ansi16FgOpen("redBright"), `${ESC}39m`),
  greenBright: createStyle(ansi16FgOpen("greenBright"), `${ESC}39m`),
  yellowBright: createStyle(ansi16FgOpen("yellowBright"), `${ESC}39m`),
  blueBright: createStyle(ansi16FgOpen("blueBright"), `${ESC}39m`),
  magentaBright: createStyle(ansi16FgOpen("magentaBright"), `${ESC}39m`),
  cyanBright: createStyle(ansi16FgOpen("cyanBright"), `${ESC}39m`),
  whiteBright: createStyle(ansi16FgOpen("whiteBright"), `${ESC}39m`),

  bgBlack: createStyle(ansi16BgOpen("black"), `${ESC}49m`),
  bgRed: createStyle(ansi16BgOpen("red"), `${ESC}49m`),
  bgGreen: createStyle(ansi16BgOpen("green"), `${ESC}49m`),
  bgYellow: createStyle(ansi16BgOpen("yellow"), `${ESC}49m`),
  bgBlue: createStyle(ansi16BgOpen("blue"), `${ESC}49m`),
  bgMagenta: createStyle(ansi16BgOpen("magenta"), `${ESC}49m`),
  bgCyan: createStyle(ansi16BgOpen("cyan"), `${ESC}49m`),
  bgWhite: createStyle(ansi16BgOpen("white"), `${ESC}49m`),
  bgBlackBright: createStyle(ansi16BgOpen("blackBright"), `${ESC}49m`),
  bgRedBright: createStyle(ansi16BgOpen("redBright"), `${ESC}49m`),
  bgGreenBright: createStyle(ansi16BgOpen("greenBright"), `${ESC}49m`),
  bgYellowBright: createStyle(ansi16BgOpen("yellowBright"), `${ESC}49m`),
  bgBlueBright: createStyle(ansi16BgOpen("blueBright"), `${ESC}49m`),
  bgMagentaBright: createStyle(ansi16BgOpen("magentaBright"), `${ESC}49m`),
  bgCyanBright: createStyle(ansi16BgOpen("cyanBright"), `${ESC}49m`),
  bgWhiteBright: createStyle(ansi16BgOpen("whiteBright"), `${ESC}49m`),

  color: Object.freeze({
    ansi256: (idx: number) => ansi256FgOpen(idx),
    ansi16m: (r: number, g: number, b: number) => truecolorFgOpen({ r, g, b }),
  }),
  bgColor: Object.freeze({
    ansi256: (idx: number) => ansi256BgOpen(idx),
    ansi16m: (r: number, g: number, b: number) => truecolorBgOpen({ r, g, b }),
  }),
});

export {
  ANSI8_COLOR_NAMES,
  ansi8BgOpen,
  ansi8FgOpen,
  ANSI16_COLOR_NAMES,
  ansi16BgOpen,
  ansi16FgOpen,
  ansi256BgOpen,
  ansi256FgOpen,
  ansi256ToRgb,
  rgbToAnsi256,
  SGR_BOLD,
  SGR_DIM,
  SGR_INVERSE,
  SGR_ITALIC,
  SGR_RESET,
  SGR_UNDERLINE,
  toAnsi8ColorName,
  truecolorBgOpen,
  truecolorFgOpen,
} from "./core/ansi/colors.js";
export type {
  Ansi8ColorName,
  AnsiColorEntry,
  AnsiRgb,
  TerminalColorLevel,
  TerminalColorMode,
} from "./core/ansi/colors.js";

/**
 * Cached palettes for convenience.
 * Note: ANSI 0..15 are terminal-theme-dependent in many terminals; treat `rgb` as an approximation.
 */
export const ANSI8_COLORS = ansi8Palette();
export const ANSI16_COLORS = ansi16Palette();
export const ANSI256_COLORS = ansi256Palette();

export function ansiColors(level: 8 | 16 | 256) {
  if (level === 8) return ANSI8_COLORS;
  if (level === 16) return ANSI16_COLORS;
  return ANSI256_COLORS;
}
