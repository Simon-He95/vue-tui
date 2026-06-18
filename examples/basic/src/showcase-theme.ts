import type { Style, TuiThemeOverrides } from "@simon_he/vue-tui";

export type ShowcaseThemeMode = "dark" | "light" | "matrix" | "plum";

export type ShowcaseAnsiPalette = Partial<Record<string, string>>;

export const showcaseThemeModes = ["dark", "light", "matrix", "plum"] as const;

export type ShowcaseChromeTheme = Readonly<{
  base: Style;
  muted: Style;
  accent: Style;
  active: Style;
  inactive: Style;
}>;

type ShowcaseThemePreset = Readonly<{
  label: string;
  terminalStyle: Style;
  palette: ShowcaseAnsiPalette | null;
  tuiTheme: TuiThemeOverrides;
  chrome: ShowcaseChromeTheme;
}>;

export const showcaseThemePresets: Record<ShowcaseThemeMode, ShowcaseThemePreset> = {
  dark: {
    label: "Dark",
    terminalStyle: { fg: "whiteBright", bg: "black" },
    palette: null,
    tuiTheme: {
      colors: {
        link: "cyanBright",
        success: "greenBright",
        warning: "yellowBright",
        danger: "redBright",
        info: "blueBright",
        muted: "white",
        accent: "magentaBright",
      },
      components: {
        TTable: {
          headerStyle: { fg: "cyanBright", bold: true },
          borderStyle: { fg: "blueBright", dim: true },
          activeStyle: { fg: "#111827", bg: "#5eead4", bold: true },
        },
      },
    },
    chrome: {
      base: { fg: "whiteBright", bg: "black" },
      muted: { fg: "white", bg: "black", dim: true },
      accent: { fg: "cyanBright", bg: "black", bold: true },
      active: { fg: "#111827", bg: "#5eead4", bold: true },
      inactive: { fg: "whiteBright", bg: "black" },
    },
  },
  light: {
    label: "Light",
    terminalStyle: { fg: "whiteBright", bg: "black" },
    palette: {
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
    },
    tuiTheme: {
      colors: {
        link: "blueBright",
        success: "green",
        warning: "yellow",
        danger: "redBright",
        info: "cyan",
        muted: "white",
        accent: "magenta",
      },
      components: {
        TTable: {
          headerStyle: { fg: "blueBright", bold: true },
          borderStyle: { fg: "cyan", dim: true },
          activeStyle: { fg: "#ffffff", bg: "#4f46e5", bold: true },
        },
      },
    },
    chrome: {
      base: { fg: "whiteBright", bg: "black" },
      muted: { fg: "white", bg: "black", dim: true },
      accent: { fg: "blueBright", bg: "black", bold: true },
      active: { fg: "#ffffff", bg: "#4f46e5", bold: true },
      inactive: { fg: "whiteBright", bg: "black" },
    },
  },
  matrix: {
    label: "Matrix",
    terminalStyle: { fg: "greenBright", bg: "black" },
    palette: {
      black: "#06130c",
      blackBright: "#102218",
      red: "#d04f4f",
      redBright: "#ff6b6b",
      green: "#32c46a",
      greenBright: "#7cff9a",
      yellow: "#a7d956",
      yellowBright: "#d9ff78",
      blue: "#3aa37a",
      blueBright: "#59d9aa",
      magenta: "#70bf72",
      magentaBright: "#9bf28d",
      cyan: "#4edb91",
      cyanBright: "#8dffc0",
      white: "#8cb69a",
      whiteBright: "#e8fff0",
    },
    tuiTheme: {
      colors: {
        link: "cyanBright",
        success: "greenBright",
        warning: "yellowBright",
        danger: "redBright",
        info: "cyan",
        muted: "white",
        accent: "greenBright",
      },
      components: {
        TTable: {
          headerStyle: { fg: "greenBright", bold: true },
          borderStyle: { fg: "green", dim: true },
          activeStyle: { fg: "black", bg: "greenBright", bold: true },
        },
      },
    },
    chrome: {
      base: { fg: "greenBright", bg: "black" },
      muted: { fg: "white", bg: "black", dim: true },
      accent: { fg: "greenBright", bg: "black", bold: true },
      active: { fg: "black", bg: "greenBright", bold: true },
      inactive: { fg: "green", bg: "black" },
    },
  },
  plum: {
    label: "Plum",
    terminalStyle: { fg: "whiteBright", bg: "black" },
    palette: {
      black: "#1a1023",
      blackBright: "#261832",
      red: "#e16b7a",
      redBright: "#ff8da0",
      green: "#7bd7a8",
      greenBright: "#a4f3c7",
      yellow: "#dcb66b",
      yellowBright: "#ffd68a",
      blue: "#8aa0ff",
      blueBright: "#b5c2ff",
      magenta: "#c77dff",
      magentaBright: "#dda8ff",
      cyan: "#72d7e8",
      cyanBright: "#a4f2ff",
      white: "#b7a9c4",
      whiteBright: "#fff7ff",
    },
    tuiTheme: {
      colors: {
        link: "cyanBright",
        success: "greenBright",
        warning: "yellowBright",
        danger: "redBright",
        info: "blueBright",
        muted: "white",
        accent: "magentaBright",
      },
      components: {
        TTable: {
          headerStyle: { fg: "magentaBright", bold: true },
          borderStyle: { fg: "blueBright", dim: true },
          activeStyle: { fg: "black", bg: "magentaBright", bold: true },
        },
      },
    },
    chrome: {
      base: { fg: "whiteBright", bg: "black" },
      muted: { fg: "white", bg: "black", dim: true },
      accent: { fg: "magentaBright", bg: "black", bold: true },
      active: { fg: "black", bg: "magentaBright", bold: true },
      inactive: { fg: "whiteBright", bg: "black" },
    },
  },
};

export function nextShowcaseThemeMode(mode: ShowcaseThemeMode): ShowcaseThemeMode {
  const index = showcaseThemeModes.indexOf(mode);
  return showcaseThemeModes[(index + 1) % showcaseThemeModes.length] ?? "dark";
}

export function showcaseAnsiPalette(mode: ShowcaseThemeMode): ShowcaseAnsiPalette | null {
  return showcaseThemePresets[mode].palette;
}

export function showcaseTerminalStyle(mode: ShowcaseThemeMode): Style {
  return showcaseThemePresets[mode].terminalStyle;
}

export function showcaseTuiTheme(mode: ShowcaseThemeMode): TuiThemeOverrides {
  return showcaseThemePresets[mode].tuiTheme;
}

export function showcaseChromeTheme(mode: ShowcaseThemeMode): ShowcaseChromeTheme {
  return showcaseThemePresets[mode].chrome;
}
