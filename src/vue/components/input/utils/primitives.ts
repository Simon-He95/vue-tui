export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

export function isWordChar(ch: string): boolean {
  return /^[\p{L}\p{N}_]$/u.test(ch);
}
