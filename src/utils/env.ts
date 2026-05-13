export function firstNonEmptyEnv(
  env: Readonly<Record<string, unknown>> | undefined,
  primary: string,
  legacy?: string,
): unknown {
  const primaryValue = env?.[primary];
  if (String(primaryValue ?? "").trim() !== "") return primaryValue;

  if (!legacy) return undefined;

  const legacyValue = env?.[legacy];
  if (String(legacyValue ?? "").trim() !== "") return legacyValue;

  return undefined;
}

export function envFlag(
  env: Readonly<Record<string, unknown>> | undefined,
  primary: string,
  legacy?: string,
): boolean {
  return String(firstNonEmptyEnv(env, primary, legacy) ?? "").trim() === "1";
}

export function envString(
  env: Readonly<Record<string, unknown>> | undefined,
  primary: string,
  legacy: string | undefined,
  fallback = "",
): string {
  return String(firstNonEmptyEnv(env, primary, legacy) ?? fallback).trim() || fallback;
}
