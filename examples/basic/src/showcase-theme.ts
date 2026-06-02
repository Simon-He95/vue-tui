import type { Style } from "@simon_he/vue-tui";

export type ShowcaseThemeMode = "dark" | "light";

export type ShowcaseAnsiPalette = Partial<Record<string, string>>;

const lightAnsiPalette: ShowcaseAnsiPalette = {
  black: "#f8fafc",
  blackBright: "#e5e7eb",
  red: "#b91c1c",
  redBright: "#dc2626",
  green: "#15803d",
  greenBright: "#16a34a",
  yellow: "#a16207",
  yellowBright: "#92400e",
  blue: "#2563eb",
  blueBright: "#4f46e5",
  magenta: "#9333ea",
  magentaBright: "#a21caf",
  cyan: "#0e7490",
  cyanBright: "#0f766e",
  white: "#4b5563",
  whiteBright: "#111827",
};

export function showcaseAnsiPalette(mode: ShowcaseThemeMode): ShowcaseAnsiPalette | null {
  return mode === "light" ? lightAnsiPalette : null;
}

export function showcaseTerminalStyle(_mode: ShowcaseThemeMode): Style {
  return { fg: "whiteBright", bg: "black" };
}
