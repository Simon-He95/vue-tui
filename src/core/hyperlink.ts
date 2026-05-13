export type SanitizeTerminalHrefOptions = Readonly<{
  allowFileUrls?: boolean;
}>;

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function sanitizeTerminalHref(
  value: unknown,
  options: SanitizeTerminalHrefOptions = {},
): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return null;
  }
  if (/\s/u.test(raw)) return null;
  if (raw.startsWith("//")) return null;

  const lower = raw.toLowerCase();
  const hasAllowedPrefix =
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    (options.allowFileUrls === true && lower.startsWith("file://"));

  if (!hasAllowedPrefix) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "file:") {
      return options.allowFileUrls === true ? raw : null;
    }
    return SAFE_PROTOCOLS.has(parsed.protocol) ? raw : null;
  } catch {
    return null;
  }
}
