import { getMarkdown, parseMarkdownToStructure, type ParseOptions } from "stream-markdown-parser";
import { sanitizeDomHref } from "../../core/hyperlink.js";
import type { TuiMarkdownNode } from "./types.js";

export interface TuiMarkdownParseConfig {
  streaming?: boolean;
  customHtmlTags?: readonly string[];
}

export interface TuiMarkdownParser {
  parse: (content: string, final: boolean) => TuiMarkdownNode[];
}

const markdownInstanceCache = new Map<string, ReturnType<typeof getMarkdown>>();
const MAX_MARKDOWN_INSTANCE_CACHE = 32;

export function isSafeMarkdownLink(url: string): boolean {
  return sanitizeDomHref(url, { allowRelative: true }) != null;
}

function markdownInstanceCacheKey(config?: TuiMarkdownParseConfig): string {
  return JSON.stringify({
    customHtmlTags: [...(config?.customHtmlTags?.filter(Boolean) ?? [])].sort(),
  });
}

function getCachedMarkdownInstance(config?: TuiMarkdownParseConfig) {
  const cacheKey = markdownInstanceCacheKey(config);
  const cached = markdownInstanceCache.get(cacheKey);
  if (cached) {
    markdownInstanceCache.delete(cacheKey);
    markdownInstanceCache.set(cacheKey, cached);
    return cached;
  }
  const customHtmlTags = config?.customHtmlTags?.filter(Boolean);
  const created = getMarkdown(`vue-tui-markdown:${cacheKey}`, {
    customHtmlTags,
  });
  markdownInstanceCache.set(cacheKey, created);
  while (markdownInstanceCache.size > MAX_MARKDOWN_INSTANCE_CACHE) {
    const oldest = markdownInstanceCache.keys().next().value;
    if (oldest == null) break;
    markdownInstanceCache.delete(oldest);
  }
  return created;
}

export function createTuiMarkdownParser(config?: TuiMarkdownParseConfig): TuiMarkdownParser {
  const customHtmlTags = config?.customHtmlTags?.filter(Boolean);
  const md = getCachedMarkdownInstance(config);

  function parse(content: string, final: boolean): TuiMarkdownNode[] {
    return parseMarkdownToStructure(content, md, {
      final,
      customHtmlTags,
      requireClosingStrong: final || !config?.streaming,
      validateLink: isSafeMarkdownLink,
    } satisfies ParseOptions) as TuiMarkdownNode[];
  }

  return { parse };
}
