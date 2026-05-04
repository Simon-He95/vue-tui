import {
  getMarkdown,
  parseMarkdownToStructure,
  type ParseOptions,
  type ParsedNode,
} from "stream-markdown-parser";

export interface TuiMarkdownParseConfig {
  streaming?: boolean;
  customHtmlTags?: readonly string[];
}

export interface TuiMarkdownParser {
  parse: (content: string, final: boolean) => ParsedNode[];
}

function isSafeMarkdownLink(url: string): boolean {
  const value = url.trim().toLowerCase();
  return !value.startsWith("javascript:") && !value.startsWith("data:");
}

export function createTuiMarkdownParser(config?: TuiMarkdownParseConfig): TuiMarkdownParser {
  const customHtmlTags = config?.customHtmlTags?.filter(Boolean);
  const md = getMarkdown("vue-tui-markdown", {
    customHtmlTags,
  });

  function parse(content: string, final: boolean): ParsedNode[] {
    return parseMarkdownToStructure(content, md, {
      final,
      customHtmlTags,
      requireClosingStrong: !config?.streaming,
      validateLink: isSafeMarkdownLink,
    } satisfies ParseOptions);
  }

  return { parse };
}
