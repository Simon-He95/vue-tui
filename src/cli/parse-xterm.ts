import type { ParseResult } from "./parse-utils.js";
import { keyEvent, modsFromXtermModifier } from "./parse-utils.js";

function parseCsiU(parts: string[], params: string): ParseResult {
  if (params.includes(":")) return { handled: false, event: null };

  const cp = parts[0] ? Number.parseInt(parts[0], 10) : Number.NaN;
  if (!Number.isFinite(cp)) return { handled: true, event: null };

  if (cp >= 57344) return { handled: false, event: null };

  const mod = parts[1] ? Number.parseInt(parts[1], 10) : null;
  const mods = modsFromXtermModifier(mod) ?? undefined;

  if (cp === 13) return { handled: true, event: keyEvent("Enter", "Enter", mods) };
  if (cp === 9) return { handled: true, event: keyEvent("Tab", "Tab", mods) };
  if (cp === 27) return { handled: true, event: keyEvent("Escape", "Escape", mods) };
  if (cp === 127) return { handled: true, event: keyEvent("Backspace", "Backspace", mods) };

  if (cp >= 0x20) {
    try {
      return {
        handled: true,
        event: keyEvent(String.fromCodePoint(cp), "", mods),
      };
    } catch {
      return { handled: true, event: null };
    }
  }

  return { handled: true, event: null };
}

function parseCsi(sequence: string): ParseResult {
  if (!sequence.startsWith("\x1B[")) return { handled: false, event: null };

  if (sequence.length < 3) return { handled: true, event: null };

  const final = sequence[sequence.length - 1]!;
  const params = sequence.slice(2, -1);
  const parts = params ? params.split(";") : [""];

  if (final === "u") return parseCsiU(parts, params);

  if (final === "Z") return { handled: true, event: keyEvent("Tab", "Tab", { shiftKey: true }) };

  const mod = parts.length >= 2 ? Number.parseInt(parts[parts.length - 1]!, 10) : null;
  const mods = modsFromXtermModifier(mod) ?? undefined;

  if (final === "A") return { handled: true, event: keyEvent("ArrowUp", "ArrowUp", mods) };
  if (final === "B") return { handled: true, event: keyEvent("ArrowDown", "ArrowDown", mods) };
  if (final === "C") return { handled: true, event: keyEvent("ArrowRight", "ArrowRight", mods) };
  if (final === "D") return { handled: true, event: keyEvent("ArrowLeft", "ArrowLeft", mods) };
  if (final === "H") return { handled: true, event: keyEvent("Home", "Home", mods) };
  if (final === "F") return { handled: true, event: keyEvent("End", "End", mods) };

  if (final === "~") {
    if (parts[0] === "27" && parts.length >= 3) {
      const mod2 = Number.parseInt(parts[1]!, 10);
      const cp = Number.parseInt(parts[2]!, 10);
      const mods2 = modsFromXtermModifier(mod2) ?? undefined;
      if (cp === 13) return { handled: true, event: keyEvent("Enter", "Enter", mods2) };
      if (cp === 9) return { handled: true, event: keyEvent("Tab", "Tab", mods2) };
      if (cp === 27) return { handled: true, event: keyEvent("Escape", "Escape", mods2) };
      if (cp >= 0x20) {
        try {
          return {
            handled: true,
            event: keyEvent(String.fromCodePoint(cp), "", mods2),
          };
        } catch {
          return { handled: true, event: null };
        }
      }
      return { handled: true, event: null };
    }

    const keyCode = parts[0] ? Number.parseInt(parts[0], 10) : Number.NaN;
    if (keyCode === 1 || keyCode === 7)
      return { handled: true, event: keyEvent("Home", "Home", mods) };
    if (keyCode === 4 || keyCode === 8)
      return { handled: true, event: keyEvent("End", "End", mods) };
    if (keyCode === 2) return { handled: true, event: keyEvent("Insert", "Insert", mods) };
    if (keyCode === 3) return { handled: true, event: keyEvent("Delete", "Delete", mods) };
    if (keyCode === 5) return { handled: true, event: keyEvent("PageUp", "PageUp", mods) };
    if (keyCode === 6) return { handled: true, event: keyEvent("PageDown", "PageDown", mods) };
    if (keyCode === 11) return { handled: true, event: keyEvent("F1", "F1", mods) };
    if (keyCode === 12) return { handled: true, event: keyEvent("F2", "F2", mods) };
    if (keyCode === 13) return { handled: true, event: keyEvent("F3", "F3", mods) };
    if (keyCode === 14) return { handled: true, event: keyEvent("F4", "F4", mods) };
    if (keyCode === 15) return { handled: true, event: keyEvent("F5", "F5", mods) };
    if (keyCode === 17) return { handled: true, event: keyEvent("F6", "F6", mods) };
    if (keyCode === 18) return { handled: true, event: keyEvent("F7", "F7", mods) };
    if (keyCode === 19) return { handled: true, event: keyEvent("F8", "F8", mods) };
    if (keyCode === 20) return { handled: true, event: keyEvent("F9", "F9", mods) };
    if (keyCode === 21) return { handled: true, event: keyEvent("F10", "F10", mods) };
    if (keyCode === 23) return { handled: true, event: keyEvent("F11", "F11", mods) };
    if (keyCode === 24) return { handled: true, event: keyEvent("F12", "F12", mods) };
    return { handled: true, event: null };
  }

  return { handled: true, event: null };
}

function parseSs3(sequence: string): ParseResult {
  if (!sequence.startsWith("\x1BO")) return { handled: false, event: null };

  if (sequence.length < 3) return { handled: true, event: null };

  const final = sequence[2]!;
  switch (final) {
    case "A":
      return { handled: true, event: keyEvent("ArrowUp", "ArrowUp") };
    case "B":
      return { handled: true, event: keyEvent("ArrowDown", "ArrowDown") };
    case "C":
      return { handled: true, event: keyEvent("ArrowRight", "ArrowRight") };
    case "D":
      return { handled: true, event: keyEvent("ArrowLeft", "ArrowLeft") };
    case "H":
      return { handled: true, event: keyEvent("Home", "Home") };
    case "F":
      return { handled: true, event: keyEvent("End", "End") };
    case "P":
      return { handled: true, event: keyEvent("F1", "F1") };
    case "Q":
      return { handled: true, event: keyEvent("F2", "F2") };
    case "R":
      return { handled: true, event: keyEvent("F3", "F3") };
    case "S":
      return { handled: true, event: keyEvent("F4", "F4") };
    default:
      return { handled: true, event: null };
  }
}

export function parseXtermSequence(sequence: string): ParseResult {
  if (!sequence.startsWith("\x1B")) return { handled: false, event: null };

  const csi = parseCsi(sequence);
  if (csi.handled) return csi;

  const ss3 = parseSs3(sequence);
  if (ss3.handled) return ss3;

  return { handled: false, event: null };
}
