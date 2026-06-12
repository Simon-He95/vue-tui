import { getMarkdown, parseMarkdownToStructure, type ParseOptions } from "stream-markdown-parser";
import { sanitizeDomHref } from "../../core/hyperlink.js";
import { sanitizeMarkdownImageSource } from "./image.js";
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

export function sanitizeMarkdownLink(url: string): string | null {
  return sanitizeDomHref(url, { allowRelative: true });
}

export function isSafeMarkdownLink(url: string): boolean {
  return sanitizeMarkdownLink(url) != null;
}

function isSafeMarkdownDestination(url: string): boolean {
  return isSafeMarkdownLink(url) || sanitizeMarkdownImageSource(url) != null;
}

function normalizeCustomHtmlTags(config?: TuiMarkdownParseConfig): readonly string[] {
  return Array.from(new Set(config?.customHtmlTags?.filter(Boolean) ?? [])).sort();
}

function markdownInstanceCacheKey(customHtmlTags: readonly string[]): string {
  return JSON.stringify({
    customHtmlTags,
  });
}

function getCachedMarkdownInstance(customHtmlTags: readonly string[]) {
  const cacheKey = markdownInstanceCacheKey(customHtmlTags);
  const cached = markdownInstanceCache.get(cacheKey);
  if (cached) {
    markdownInstanceCache.delete(cacheKey);
    markdownInstanceCache.set(cacheKey, cached);
    return cached;
  }
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
  const customHtmlTags = normalizeCustomHtmlTags(config);
  const md = getCachedMarkdownInstance(customHtmlTags);

  function parse(content: string, final: boolean): TuiMarkdownNode[] {
    return parseMarkdownToStructure(content, md, {
      final,
      customHtmlTags,
      requireClosingStrong: final || !config?.streaming,
      validateLink: isSafeMarkdownDestination,
    } satisfies ParseOptions) as TuiMarkdownNode[];
  }

  return { parse };
}
