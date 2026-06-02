declare module "beautiful-mermaid" {
  export type BeautifulMermaidAsciiColorMode =
    | "none"
    | "ansi16"
    | "ansi256"
    | "truecolor"
    | "html"
    | "auto";

  export type BeautifulMermaidAsciiTheme = Partial<{
    fg: string;
    border: string;
    line: string;
    arrow: string;
    accent: string;
    bg: string;
    corner: string;
    junction: string;
  }>;

  export type BeautifulMermaidAsciiOptions = {
    useAscii?: boolean;
    paddingX?: number;
    paddingY?: number;
    boxBorderPadding?: number;
    colorMode?: BeautifulMermaidAsciiColorMode;
    theme?: BeautifulMermaidAsciiTheme;
  };

  export function renderMermaidASCII(text: string, options?: BeautifulMermaidAsciiOptions): string;

  export const renderMermaidAscii: typeof renderMermaidASCII;
}
