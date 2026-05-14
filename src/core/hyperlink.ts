export type SanitizeTerminalHrefOptions = Readonly<{
  allowFileUrls?: boolean;
}>;

export type SanitizeDomHrefOptions = Readonly<{
  allowRelative?: boolean;
}>;

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const BLOCKED_SCHEME_RE = /^(?:javascript|data|vbscript):/i;
const ENCODED_CRLF_RE = /%(?:0d|0a)/i;

function normalizeRawHref(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return null;
  }

  if (/\s/u.test(raw)) return null;
  if (raw.startsWith("//")) return null;
  if (BLOCKED_SCHEME_RE.test(raw)) return null;

  return raw;
}

function hrefScheme(raw: string): string | null {
  return raw.match(SCHEME_RE)?.[0].toLowerCase() ?? null;
}

function parsedProtocol(raw: string): string | null {
  try {
    return new URL(raw).protocol;
  } catch {
    return null;
  }
}

export function isSafeRelativeHref(raw: string): boolean {
  if (!raw) return false;
  if (raw.includes("\\")) return false;
  if (raw.startsWith("//")) return false;
  if (SCHEME_RE.test(raw)) return false;

  return (
    raw.startsWith("#") ||
    raw.startsWith("/") ||
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    /^[A-Za-z0-9._~!$&'()*+,;=@-]+(?:[/?#][^\s\\]*)?$/u.test(raw)
  );
}

export function sanitizeTerminalHref(
  value: unknown,
  options: SanitizeTerminalHrefOptions = {},
): string | null {
  const raw = normalizeRawHref(value);
  if (!raw) return null;

  const scheme = hrefScheme(raw);
  if (!scheme) return null;

  const protocol = parsedProtocol(raw);
  if (!protocol) return null;
  if (SAFE_LINK_PROTOCOLS.has(protocol)) return raw;
  if (options.allowFileUrls && protocol === "file:") return new URL(raw).toString();

  return null;
}

export function sanitizeDomHref(
  value: unknown,
  options: SanitizeDomHrefOptions = {},
): string | null {
  const raw = normalizeRawHref(value);
  if (!raw) return null;

  const scheme = hrefScheme(raw);
  if (!scheme) return options.allowRelative && isSafeRelativeHref(raw) ? raw : null;

  const protocol = parsedProtocol(raw);
  if (!protocol || !SAFE_LINK_PROTOCOLS.has(protocol)) return null;
  if (protocol === "mailto:" && ENCODED_CRLF_RE.test(raw)) return null;

  return raw;
}
