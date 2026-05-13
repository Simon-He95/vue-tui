export type SanitizeTerminalHrefOptions = Readonly<{
  allowFileUrls?: boolean;
}>;

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

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

export function sanitizeDomHref(value: unknown): string | null {
  const raw = normalizeRawHref(value);
  if (!raw) return null;

  const scheme = hrefScheme(raw);
  if (!scheme) return raw;

  const protocol = parsedProtocol(raw);
  return protocol && SAFE_LINK_PROTOCOLS.has(protocol) ? raw : null;
}
