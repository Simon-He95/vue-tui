export type SanitizeTerminalHrefOptions = Readonly<{
  allowFileUrls?: boolean;
}>;

const SAFE_DOM_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const RELATIVE_LINK_PREFIXES = ["#", "/", "./", "../"] as const;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export function sanitizeTerminalHref(
  value: unknown,
  options: SanitizeTerminalHrefOptions = {},
): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;
  if (hasControlChars(raw)) return null;
  if (/\s/u.test(raw)) return null;
  if (raw.startsWith("//")) return null;

  const lower = raw.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) {
    return raw;
  }
  if (options.allowFileUrls && lower.startsWith("file://")) return raw;

  return null;
}

export function sanitizeDomHref(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;
  if (hasControlChars(raw)) return null;
  if (/\s/u.test(raw)) return null;
  if (raw.startsWith("//")) return null;

  const lower = raw.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return null;

  if (RELATIVE_LINK_PREFIXES.some((prefix) => raw.startsWith(prefix))) return raw;
  if (!SCHEME_RE.test(raw)) return raw;

  try {
    const parsed = new URL(raw);
    return SAFE_DOM_PROTOCOLS.has(parsed.protocol) ? raw : null;
  } catch {
    return null;
  }
}
