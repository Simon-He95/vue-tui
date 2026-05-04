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

const RELATIVE_LINK_PREFIXES = ["#", "/", "./", "../"] as const;
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
let nextMarkdownParserId = 0;

function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export function isSafeMarkdownLink(url: string): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  if (hasControlChars(raw)) return false;
  if (raw.startsWith("//")) return false;

  const value = raw.toLowerCase();
  if (value.startsWith("javascript:")) return false;
  if (value.startsWith("data:")) return false;
  if (RELATIVE_LINK_PREFIXES.some((prefix) => raw.startsWith(prefix))) return true;

  try {
    const parsed = new URL(raw);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function createTuiMarkdownParser(config?: TuiMarkdownParseConfig): TuiMarkdownParser {
  const customHtmlTags = config?.customHtmlTags?.filter(Boolean);
  const parserId = `vue-tui-markdown-${nextMarkdownParserId++}`;
  const md = getMarkdown(parserId, {
    customHtmlTags,
  });

  function parse(content: string, final: boolean): ParsedNode[] {
    return parseMarkdownToStructure(content, md, {
      final,
      customHtmlTags,
      requireClosingStrong: final || !config?.streaming,
      validateLink: isSafeMarkdownLink,
    } satisfies ParseOptions);
  }

  return { parse };
}
