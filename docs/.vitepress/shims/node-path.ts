function normalizeParts(parts: readonly string[]): string[] {
  return parts.flatMap((part) => String(part ?? "").split(/[\\/]+/)).filter(Boolean);
}

const pathShim = {
  resolve(...parts: string[]): string {
    const joined = normalizeParts(parts).join("/");
    return joined.startsWith("/") ? joined : `/${joined}`;
  },
} as const;

export default pathShim;
