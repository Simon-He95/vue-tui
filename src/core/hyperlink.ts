export type SanitizeTerminalHrefOptions = Readonly<{
  allowFileUrls?: boolean;
}>;

const SAFE_DOM_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const SAFE_TERMINAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const UNSAFE_PROTOCOLS = new Set(["javascript:", "data:", "vbscript:"]);
const RELATIVE_LINK_PREFIXES = ["#", "/", "./", "../"] as const;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function unsafeProtocol(raw: string): boolean {
  const match = raw.match(SCHEME_RE);
  if (!match) return false;
  return UNSAFE_PROTOCOLS.has(match[0].toLowerCase());
}

function protocolOfAbsoluteUrl(raw: string): string | null {
  try {
    return new URL(raw).protocol;
  } catch {
    return null;
  }
}

function commonHrefReject(raw: string): boolean {
  if (!raw) return true;
  if (hasControlChars(raw)) return true;
  if (/\s/u.test(raw)) return true;
  if (raw.startsWith("//")) return true;
  if (unsafeProtocol(raw)) return true;
  return false;
}

export function sanitizeTerminalHref(
  value: unknown,
  options: SanitizeTerminalHrefOptions = {},
): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (commonHrefReject(raw)) return null;

  const protocol = protocolOfAbsoluteUrl(raw);
  if (!protocol) return null;
  if (SAFE_TERMINAL_PROTOCOLS.has(protocol)) return raw;
  if (options.allowFileUrls && protocol === "file:") return raw;

  return null;
}

export function sanitizeDomHref(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (commonHrefReject(raw)) return null;

  if (RELATIVE_LINK_PREFIXES.some((prefix) => raw.startsWith(prefix))) return raw;
  if (!SCHEME_RE.test(raw)) return raw;

  const protocol = protocolOfAbsoluteUrl(raw);
  return protocol && SAFE_DOM_PROTOCOLS.has(protocol) ? raw : null;
}
