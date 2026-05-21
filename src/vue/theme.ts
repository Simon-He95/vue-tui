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

function mergeStyleToken(base?: Style, override?: Style): Style | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  } as Style;
}

export function createTheme(overrides: TuiThemeOverrides = {}): TuiTheme {
  const components = overrides.components ?? {};
  const link = components.TLink;
  const table = components.TTable;
  const formField = components.TFormField;
  const defaultLink = tuiDefaultTheme.components.TLink;
  const defaultTable = tuiDefaultTheme.components.TTable;
  const defaultFormField = tuiDefaultTheme.components.TFormField;

  return {
    colors: {
      ...tuiDefaultTheme.colors,
      ...(overrides.colors ?? {}),
    },
    components: {
      TLink: {
        ...(defaultLink ?? {}),
        ...(link ?? {}),
        style: mergeStyleToken(defaultLink?.style, link?.style),
        hoverStyle: mergeStyleToken(defaultLink?.hoverStyle, link?.hoverStyle),
        focusStyle: mergeStyleToken(defaultLink?.focusStyle, link?.focusStyle),
        visitedStyle: mergeStyleToken(defaultLink?.visitedStyle, link?.visitedStyle),
      },
      TTable: {
        ...(defaultTable ?? {}),
        ...(table ?? {}),
        headerStyle: mergeStyleToken(defaultTable?.headerStyle, table?.headerStyle),
        borderStyle: mergeStyleToken(defaultTable?.borderStyle, table?.borderStyle),
        rowStyle: mergeStyleToken(defaultTable?.rowStyle, table?.rowStyle),
        selectedStyle: mergeStyleToken(defaultTable?.selectedStyle, table?.selectedStyle),
      },
      TFormField: {
        ...(defaultFormField ?? {}),
        ...(formField ?? {}),
        labelStyle: mergeStyleToken(defaultFormField?.labelStyle, formField?.labelStyle),
        helpStyle: mergeStyleToken(defaultFormField?.helpStyle, formField?.helpStyle),
        errorStyle: mergeStyleToken(defaultFormField?.errorStyle, formField?.errorStyle),
      },
    },
  };
}

export const TuiThemeContextKey = injectionKey<Readonly<Ref<TuiTheme>>>("TuiTheme");
