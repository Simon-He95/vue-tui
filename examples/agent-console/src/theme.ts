import type { Style } from "@simon_he/vue-tui";
import type { ThemePalette } from "@simon_he/vue-tui/core";
import type { TuiMarkdownThemeOverrides } from "@simon_he/vue-tui/vue";
import { resolveTLogViewTheme, tlogDarkPreset } from "@simon_he/vue-tui/experimental";

export const consoleDefaultStyle: Style = Object.freeze({
  fg: "whiteBright",
  bg: "black",
});

export const domPalette: ThemePalette = Object.freeze({
  black: "#111318",
  white: "#d7dce5",
  whiteBright: "#f1f4f8",
  cyan: "#46c2d7",
  cyanBright: "#7ee4f0",
  blue: "#5c8df6",
  blueBright: "#8fb0ff",
  green: "#58c98d",
  greenBright: "#89e6b2",
  yellow: "#d8b44e",
  yellowBright: "#f3d87c",
  red: "#e06666",
  redBright: "#ff8a8a",
  magenta: "#c27adf",
  magentaBright: "#d9a0ef",
});

export const styles = Object.freeze({
  status: { fg: "black", bg: "cyanBright", bold: true } satisfies Style,
  statusMuted: { fg: "black", bg: "cyanBright" } satisfies Style,
  panel: { fg: "whiteBright", bg: "black" } satisfies Style,
  panelBorder: { fg: "blueBright", bg: "black" } satisfies Style,
  label: { fg: "cyanBright", bg: "black", bold: true } satisfies Style,
  muted: { fg: "white", bg: "black", dim: true } satisfies Style,
  ok: { fg: "greenBright", bg: "black", bold: true } satisfies Style,
  warn: { fg: "yellowBright", bg: "black", bold: true } satisfies Style,
  danger: { fg: "redBright", bg: "black", bold: true } satisfies Style,
  button: { fg: "whiteBright", bg: "blue", bold: true } satisfies Style,
  buttonMuted: { fg: "whiteBright", bg: "black", underline: true } satisfies Style,
  thinking: { fg: "whiteBright", bg: "magenta", bold: true } satisfies Style,
  toolCall: { fg: "black", bg: "yellowBright", bold: true } satisfies Style,
  input: { fg: "whiteBright", bg: "black" } satisfies Style,
  dialog: { fg: "whiteBright", bg: "black" } satisfies Style,
  dialogTitle: { fg: "yellowBright", bg: "black", bold: true } satisfies Style,
  backdrop: { bg: "black", dim: true } satisfies Style,
});

export const logViewTheme = Object.freeze({
  ...resolveTLogViewTheme(tlogDarkPreset.theme),
  style: styles.panel,
  linkStyle: { fg: "blueBright", bg: "black", underline: true } satisfies Style,
  linkFocusStyle: { fg: "black", bg: "yellowBright", bold: true } satisfies Style,
  matchStyle: { fg: "black", bg: "yellow" } satisfies Style,
  currentMatchStyle: { fg: "black", bg: "greenBright", bold: true } satisfies Style,
});

export const markdownTheme: TuiMarkdownThemeOverrides = Object.freeze({
  heading: [
    { fg: "cyanBright", bold: true },
    { fg: "greenBright", bold: true },
    { fg: "blueBright", bold: true },
  ],
  inlineCode: { fg: "yellowBright", bg: "magenta" },
  codeBlock: { fg: "greenBright", bg: "blue" },
  link: { fg: "blueBright", underline: true },
  blockquote: { fg: "whiteBright", bg: "magenta", dim: true },
});
