import {
  getMarkdown,
  parseMarkdownToStructure,
  type ParseOptions,
  type ParsedNode,
} from "stream-markdown-parser";
import { isSafeRelativeHref } from "../../core/hyperlink.js";

export interface TuiMarkdownParseConfig {
  streaming?: boolean;
  customHtmlTags?: readonly string[];
}

export interface TuiMarkdownParser {
  parse: (content: string, final: boolean) => ParsedNode[];
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const markdownInstanceCache = new Map<string, ReturnType<typeof getMarkdown>>();
const MAX_MARKDOWN_INSTANCE_CACHE = 32;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const BLOCKED_SCHEME_RE = /^(?:javascript|data|vbscript):/i;
const ENCODED_CRLF_RE = /%(?:0d|0a)/i;

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
  if (/\s/u.test(raw)) return false;
  if (raw.startsWith("//")) return false;
  if (BLOCKED_SCHEME_RE.test(raw)) return false;

  if (!SCHEME_RE.test(raw)) return isSafeRelativeHref(raw);

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "mailto:" && ENCODED_CRLF_RE.test(raw)) return false;
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
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
