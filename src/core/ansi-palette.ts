import type { AnsiColorName } from "./types.js";

export type AnsiRgb = Readonly<{ r: number; g: number; b: number }>;
export type ThemePalette = Partial<Record<AnsiColorName, string>>;

export const ANSI_PALETTE_HEX: Readonly<Record<AnsiColorName, string>> = Object.freeze({
  black: "#000000",
  red: "#c91b00",
  green: "#00c200",
  yellow: "#c7c400",
  blue: "#0225c7",
  magenta: "#c930c7",
  cyan: "#00c5c7",
  white: "#c7c7c7",
  blackBright: "#686868",
  redBright: "#ff6e67",
  greenBright: "#5ffa68",
  yellowBright: "#fffc67",
  blueBright: "#6871ff",
  magentaBright: "#ff76ff",
  cyanBright: "#5ffdff",
  whiteBright: "#ffffff",
});

export function ansiHexToRgb(hex: string): AnsiRgb | undefined {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length !== 6) return undefined;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return undefined;
  return { r, g, b };
}

const ANSI_PALETTE_RGB: Readonly<Record<AnsiColorName, AnsiRgb>> = Object.freeze(
  Object.fromEntries(
    Object.entries(ANSI_PALETTE_HEX).map(([k, v]) => [k, ansiHexToRgb(v)!]),
  ) as any,
);

export function isAnsiColorName(name: string | undefined): name is AnsiColorName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(ANSI_PALETTE_HEX, name);
}

export function ansiColorHex(name?: string, palette?: ThemePalette | null): string | undefined {
  if (!isAnsiColorName(name)) return undefined;
  const custom = palette?.[name];
  if (custom && ansiHexToRgb(custom)) return custom;
  return ANSI_PALETTE_HEX[name];
}

export function ansiColorRgb(name?: string, palette?: ThemePalette | null): AnsiRgb | undefined {
  if (!isAnsiColorName(name)) return undefined;
  const custom = palette?.[name];
  if (custom) return ansiHexToRgb(custom) ?? ANSI_PALETTE_RGB[name];
  return ANSI_PALETTE_RGB[name];
}

export function ansiCssVar(name: AnsiColorName): string {
  return `var(--vt-color-${name})`;
}

export function installAnsiPaletteCssVars(
  container: HTMLElement,
  palette?: ThemePalette | null,
): void {
  for (const [name, hex] of Object.entries(ANSI_PALETTE_HEX))
    container.style.setProperty(`--vt-color-${name}`, ansiColorHex(name, palette) ?? hex);
}
