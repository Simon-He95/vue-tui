import type { Style } from "../../core/types.js";

export type TuiMarkdownTheme = Readonly<{
  heading: readonly [Style, Style, Style, Style, Style, Style];
  strong: Style;
  emphasis: Style;
  strikethrough: Style;
  inlineCode: Style;
  link: Style;
  blockquote: Style;
  listMarker: Style;
  codeBlock: Style;
  thematicBreak: Style;
  html: Style;
}>;

export type TuiMarkdownThemeOverrides = Readonly<
  Partial<{
    heading: readonly Partial<Style>[];
    strong: Partial<Style>;
    emphasis: Partial<Style>;
    strikethrough: Partial<Style>;
    inlineCode: Partial<Style>;
    link: Partial<Style>;
    blockquote: Partial<Style>;
    listMarker: Partial<Style>;
    codeBlock: Partial<Style>;
    thematicBreak: Partial<Style>;
    html: Partial<Style>;
  }>
>;

function freezeStyle(style: Style): Style {
  return Object.freeze(style);
}

function mergeFrozenStyle(base: Style, overlay?: Partial<Style>): Style {
  if (!overlay) return base;
  return freezeStyle({ ...base, ...overlay });
}

const DEFAULT_HEADING = Object.freeze([
  freezeStyle({ bold: true, fg: "cyanBright" }),
  freezeStyle({ bold: true, fg: "cyanBright" }),
  freezeStyle({ bold: true, fg: "blueBright" }),
  freezeStyle({ bold: true, fg: "blueBright" }),
  freezeStyle({ bold: true }),
  freezeStyle({ bold: true }),
] as const satisfies readonly [Style, Style, Style, Style, Style, Style]);

export const DEFAULT_TUI_MARKDOWN_THEME = Object.freeze({
  heading: DEFAULT_HEADING,
  strong: freezeStyle({ bold: true }),
  emphasis: freezeStyle({ italic: true }),
  strikethrough: freezeStyle({ dim: true }),
  inlineCode: freezeStyle({ fg: "yellowBright" }),
  link: freezeStyle({ fg: "blueBright", underline: true }),
  blockquote: freezeStyle({ dim: true }),
  listMarker: freezeStyle({ fg: "cyanBright", bold: true }),
  codeBlock: freezeStyle({ fg: "yellowBright" }),
  thematicBreak: freezeStyle({ dim: true }),
  html: freezeStyle({ dim: true }),
} satisfies TuiMarkdownTheme);

export function resolveTuiMarkdownTheme(overrides?: TuiMarkdownThemeOverrides): TuiMarkdownTheme {
  if (!overrides) return DEFAULT_TUI_MARKDOWN_THEME;
  const heading = DEFAULT_TUI_MARKDOWN_THEME.heading.map((style, index) =>
    mergeFrozenStyle(style, overrides.heading?.[index]),
  ) as [Style, Style, Style, Style, Style, Style];
  return Object.freeze({
    heading: Object.freeze(heading),
    strong: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.strong, overrides.strong),
    emphasis: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.emphasis, overrides.emphasis),
    strikethrough: mergeFrozenStyle(
      DEFAULT_TUI_MARKDOWN_THEME.strikethrough,
      overrides.strikethrough,
    ),
    inlineCode: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.inlineCode, overrides.inlineCode),
    link: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.link, overrides.link),
    blockquote: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.blockquote, overrides.blockquote),
    listMarker: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.listMarker, overrides.listMarker),
    codeBlock: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.codeBlock, overrides.codeBlock),
    thematicBreak: mergeFrozenStyle(
      DEFAULT_TUI_MARKDOWN_THEME.thematicBreak,
      overrides.thematicBreak,
    ),
    html: mergeFrozenStyle(DEFAULT_TUI_MARKDOWN_THEME.html, overrides.html),
  });
}
