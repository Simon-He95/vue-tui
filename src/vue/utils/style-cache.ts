import type { Style } from "../../core/types.js";

const inverseStyleCache = new WeakMap<Style, Style>();
const dimStyleCache = new WeakMap<Style, Style>();

function cacheable(base: Style): boolean {
  return Object.isFrozen(base);
}

export function defaultActiveStyle(base: Style): Style {
  if (base.inverse) return base;
  if (!cacheable(base)) return { ...base, inverse: true };

  let cached = inverseStyleCache.get(base);
  if (!cached) {
    cached = Object.freeze({ ...base, inverse: true });
    inverseStyleCache.set(base, cached);
  }
  return cached;
}

export function defaultDimStyle(base: Style): Style {
  if (base.dim) return base;
  if (!cacheable(base)) return { ...base, dim: true };

  let cached = dimStyleCache.get(base);
  if (!cached) {
    cached = Object.freeze({ ...base, dim: true });
    dimStyleCache.set(base, cached);
  }
  return cached;
}
