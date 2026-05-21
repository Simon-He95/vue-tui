import { sanitizeDomHref, sanitizeTerminalHref } from "../core/hyperlink.js";

export type TLinkifyProtocol = "http" | "https" | "mailto" | "file";

export type TLinkifyOptions = Readonly<{
  protocols?: readonly TLinkifyProtocol[];
  allowRelative?: boolean;
  maxUrlLength?: number;
}>;

export type TLinkifySegment = Readonly<{
  text: string;
  href?: string;
}>;

const DEFAULT_PROTOCOLS: readonly TLinkifyProtocol[] = Object.freeze(["http", "https", "mailto"]);
const URL_TEXT_RE =
  /(?:https?:\/\/|mailto:|file:\/\/|\.{1,2}\/|\/|#|\?)[^\s<>"'`，。；：！？、]+/giu;
const TRAILING_PUNCTUATION_RE = /[.,;:!?，。；：！？、]/u;
const TRAILING_CLOSER_RE = /[)\]}）】》」』”’]/u;
const TEXT_BOUNDARY_RE = /[\s([{<:="'`，。；：！？、（【《「『“‘]/u;
const CLOSE_TO_OPEN: Readonly<Record<string, string>> = {
  ")": "(",
  "]": "[",
  "}": "{",
  "）": "（",
  "】": "【",
  "》": "《",
  "」": "「",
  "』": "『",
  "”": "“",
  "’": "‘",
};

function protocolSet(options: TLinkifyOptions): Set<TLinkifyProtocol> {
  return new Set(options.protocols ?? DEFAULT_PROTOCOLS);
}

function scheme(raw: string): string | null {
  return (
    raw
      .match(/^[a-z][a-z0-9+.-]*:/i)?.[0]
      .slice(0, -1)
      .toLowerCase() ?? null
  );
}

function isRelativeCandidate(raw: string): boolean {
  return (
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    raw.startsWith("/") ||
    raw.startsWith("#") ||
    raw.startsWith("?")
  );
}

function hasTextBoundary(text: string, index: number): boolean {
  return index === 0 || TEXT_BOUNDARY_RE.test(text[index - 1] ?? "");
}

function lastChar(value: string): string {
  return value[value.length - 1] ?? "";
}

function splitTrailingPunctuation(raw: string): { body: string; suffix: string } {
  let body = raw;
  let suffix = "";

  while (body && TRAILING_PUNCTUATION_RE.test(lastChar(body))) {
    suffix = lastChar(body) + suffix;
    body = body.slice(0, -1);
  }

  while (body && TRAILING_CLOSER_RE.test(lastChar(body))) {
    const ch = lastChar(body);
    const open = CLOSE_TO_OPEN[ch];
    if (!open) break;
    let opens = 0;
    let closes = 0;
    for (const c of body) {
      if (c === open) opens++;
      else if (c === ch) closes++;
    }
    if (closes <= opens) break;
    suffix = ch + suffix;
    body = body.slice(0, -1);
  }

  return { body, suffix };
}

function normalizeLinkifiedHref(raw: string, options: TLinkifyOptions): string | null {
  const protocols = protocolSet(options);
  const maxUrlLength = options.maxUrlLength;
  if (maxUrlLength != null && raw.length > Math.max(0, Math.floor(maxUrlLength))) return null;

  const rawScheme = scheme(raw);
  if (rawScheme === "http" || rawScheme === "https" || rawScheme === "mailto") {
    if (!protocols.has(rawScheme)) return null;
    return sanitizeDomHref(raw, { allowRelative: false });
  }

  if (rawScheme === "file") {
    if (!protocols.has("file")) return null;
    return sanitizeTerminalHref(raw, { allowFileUrls: true });
  }

  if (options.allowRelative && isRelativeCandidate(raw)) {
    return sanitizeDomHref(raw, { allowRelative: true });
  }

  return null;
}

export function linkifyTextSegments(
  text: string,
  options: TLinkifyOptions = {},
): readonly TLinkifySegment[] {
  if (!text) return [];

  const out: TLinkifySegment[] = [];
  const regex = new RegExp(URL_TEXT_RE.source, URL_TEXT_RE.flags);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) != null) {
    const raw = match[0] ?? "";
    if (!raw) {
      regex.lastIndex = Math.max(regex.lastIndex, match.index + 1);
      continue;
    }

    const { body, suffix } = splitTrailingPunctuation(raw);
    if (!hasTextBoundary(text, match.index)) continue;

    const href = normalizeLinkifiedHref(body, options);
    if (!href) continue;

    if (match.index > cursor) out.push({ text: text.slice(cursor, match.index) });
    out.push({ text: body, href });
    if (suffix) out.push({ text: suffix });
    cursor = match.index + raw.length;
  }

  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out.length ? out : [{ text }];
}
