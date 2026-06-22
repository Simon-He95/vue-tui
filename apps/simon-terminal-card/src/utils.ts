export function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export function inlineText(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function compactNumber(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
