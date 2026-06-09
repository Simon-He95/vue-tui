import { sanitizeDomHref } from "../../core/hyperlink.js";

const DATA_IMAGE_RE = /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
const SAFE_IMAGE_MIME_RE = /^image\/(?:png|jpeg|jpg|gif|webp)$/i;

export type TuiMarkdownImageSource = Readonly<{
  src: string;
  mime?: string;
  base64?: string;
}>;

export function sanitizeMarkdownImageSource(src: unknown): TuiMarkdownImageSource | null {
  if (typeof src !== "string") return null;
  const raw = src.trim();
  if (!raw || raw !== src) return null;

  const data = raw.match(DATA_IMAGE_RE);
  if (data) {
    const mime = data[1]!.toLowerCase();
    const base64 = data[2]!.replace(/\s+/g, "");
    if (!SAFE_IMAGE_MIME_RE.test(mime)) return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
    return { src: raw, mime, base64 };
  }

  const safe = sanitizeDomHref(raw, { allowRelative: true });
  return safe ? { src: safe } : null;
}
