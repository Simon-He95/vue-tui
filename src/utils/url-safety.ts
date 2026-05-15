export const ENCODED_ASCII_CONTROL_RE = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;

function hasControlCodePoint(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export function hasEncodedControl(value: string): boolean {
  let current = String(value ?? "");

  for (let depth = 0; depth < 3; depth++) {
    if (ENCODED_ASCII_CONTROL_RE.test(current)) return true;

    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return true;
    }

    if (hasControlCodePoint(decoded)) return true;
    if (decoded === current) return false;

    current = decoded;
  }

  return ENCODED_ASCII_CONTROL_RE.test(current) || hasControlCodePoint(current);
}
