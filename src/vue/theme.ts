import type { Ref } from "vue";
import type { Style } from "../core/types.js";
import { injectionKey } from "./injection-key.js";

export type TuiThemeColorTokens = Readonly<{
  link?: string;
  linkVisited?: string;
  danger?: string;
  success?: string;
  warning?: string;
  info?: string;
  muted?: string;
  accent?: string;
}>;

export type TuiThemeComponentTokens = Readonly<{
  TLink?: Readonly<{
    style?: Style;
    hoverStyle?: Style;
    focusStyle?: Style;
    visitedStyle?: Style;
    underline?: boolean;
    hoverUnderline?: boolean;
  }>;
  TTable?: Readonly<{
    headerStyle?: Style;
    borderStyle?: Style;
    rowStyle?: Style;
    selectedStyle?: Style;
  }>;
  TFormField?: Readonly<{
    labelStyle?: Style;
    helpStyle?: Style;
    errorStyle?: Style;
  }>;
}>;

export type TuiTheme = Readonly<{
  colors: TuiThemeColorTokens;
  components: TuiThemeComponentTokens;
}>;

export type TuiThemeOverrides = Readonly<{
  colors?: TuiThemeColorTokens;
  components?: TuiThemeComponentTokens;
}>;

export const tuiDefaultTheme: TuiTheme = Object.freeze({
  colors: Object.freeze({
    link: "cyanBright",
    linkVisited: "magentaBright",
    danger: "redBright",
    success: "greenBright",
    warning: "yellowBright",
    info: "cyanBright",
    muted: "white",
    accent: "blueBright",
  }),
  components: Object.freeze({
    TLink: Object.freeze({
      style: Object.freeze({ fg: "cyanBright", underline: true }),
      hoverStyle: Object.freeze({ underline: true }),
      focusStyle: Object.freeze({ inverse: true }),
      visitedStyle: Object.freeze({ fg: "magentaBright", underline: true }),
      underline: true,
      hoverUnderline: true,
    }),
    TTable: Object.freeze({
      headerStyle: Object.freeze({ bold: true, underline: true }),
      borderStyle: Object.freeze({ dim: true }),
      rowStyle: Object.freeze({}),
      selectedStyle: Object.freeze({ inverse: true }),
    }),
    TFormField: Object.freeze({
      labelStyle: Object.freeze({ bold: true }),
      helpStyle: Object.freeze({ dim: true }),
      errorStyle: Object.freeze({ fg: "redBright" }),
    }),
  }),
});

export function createTheme(overrides: TuiThemeOverrides = {}): TuiTheme {
  return {
    colors: {
      ...tuiDefaultTheme.colors,
      ...(overrides.colors ?? {}),
    },
    components: {
      ...tuiDefaultTheme.components,
      ...(overrides.components ?? {}),
    },
  };
}

export const TuiThemeContextKey = injectionKey<Readonly<Ref<TuiTheme>>>("TuiTheme");
