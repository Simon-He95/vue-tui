import type { TerminalEventRecord } from "../events/recording.js";

export type KeyMods = Partial<{
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}>;

export interface ParseResult {
  event: TerminalEventRecord | null;
  handled: boolean;
}

export function keyEvent(
  key: string,
  code = "",
  mods?: KeyMods,
  repeat?: boolean,
): TerminalEventRecord {
  const base: TerminalEventRecord = { type: "keydown", key, code, ...mods };
  return repeat ? { ...base, repeat: true } : base;
}

export function modsFromXtermModifier(mod: number | null | undefined): KeyMods | null {
  if (!mod || !Number.isFinite(mod)) return null;
  const m = Math.floor(mod);
  const out: KeyMods = {};
  if (m === 2 || m === 4 || m === 6 || m === 8 || m === 10 || m === 12 || m === 14 || m === 16) {
    out.shiftKey = true;
  }
  if (m === 3 || m === 4 || m === 7 || m === 8 || m === 11 || m === 12 || m === 15 || m === 16) {
    out.altKey = true;
  }
  if (m === 5 || m === 6 || m === 7 || m === 8 || m === 13 || m === 14 || m === 15 || m === 16) {
    out.ctrlKey = true;
  }
  if (m >= 9) {
    out.metaKey =
      m === 9 || m === 10 || m === 11 || m === 12 || m === 13 || m === 14 || m === 15 || m === 16;
  }
  return Object.keys(out).length ? out : null;
}

function modsFromKittyMask(mask: number): KeyMods | null {
  if (!Number.isFinite(mask) || mask <= 0) return null;
  const m = Math.floor(mask);
  const out: KeyMods = {};
  if (m & 1) out.shiftKey = true;
  if (m & 2) out.altKey = true;
  if (m & 4) out.ctrlKey = true;
  if (m & 8) out.metaKey = true;
  if (m & 32) out.metaKey = true;
  return Object.keys(out).length ? out : null;
}

export function modsFromKittyModifier(mod: number | null | undefined): KeyMods | null {
  if (!mod || !Number.isFinite(mod)) return null;
  const mask = Math.floor(mod) - 1;
  return modsFromKittyMask(mask);
}
