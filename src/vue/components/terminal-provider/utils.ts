import type { DomRendererOptions } from "../../../renderer/dom/dom-renderer.js";

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function shallowEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

export function shallowEqualRecord(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (!shallowEqualValue(a[k], b[k])) return false;
  }
  return true;
}

export function warnDev(message: string): void {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
  if (nodeEnv === "production") return;
  console.warn(message);
}

export function pickInitOnlyDomOptions(
  options: DomRendererOptions | undefined,
): Record<string, unknown> {
  const accessibility = options?.accessibility;
  return {
    accessibility: isPlainObject(accessibility) ? { ...accessibility } : accessibility,
    syncFlushMaxRows: options?.syncFlushMaxRows,
    syncFlushCellBudget: options?.syncFlushCellBudget,
    enableScrollOperations: options?.enableScrollOperations,
    enableRowKeyPrepass: options?.enableRowKeyPrepass,
  };
}
