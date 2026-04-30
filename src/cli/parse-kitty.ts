import type { ParseResult } from "./parse-utils.js";
import { keyEvent, modsFromKittyModifier } from "./parse-utils.js";

const KITTY_FUNCTIONAL_KEYS: Record<number, { key: string; code: string }> = {
  57344: { key: "Escape", code: "Escape" },
  57345: { key: "Enter", code: "Enter" },
  57346: { key: "Tab", code: "Tab" },
  57347: { key: "Backspace", code: "Backspace" },
  57348: { key: "Insert", code: "Insert" },
  57349: { key: "Delete", code: "Delete" },
  57350: { key: "ArrowLeft", code: "ArrowLeft" },
  57351: { key: "ArrowRight", code: "ArrowRight" },
  57352: { key: "ArrowUp", code: "ArrowUp" },
  57353: { key: "ArrowDown", code: "ArrowDown" },
  57354: { key: "PageUp", code: "PageUp" },
  57355: { key: "PageDown", code: "PageDown" },
  57356: { key: "Home", code: "Home" },
  57357: { key: "End", code: "End" },
  57358: { key: "CapsLock", code: "CapsLock" },
  57359: { key: "ScrollLock", code: "ScrollLock" },
  57360: { key: "NumLock", code: "NumLock" },
  57361: { key: "PrintScreen", code: "PrintScreen" },
  57362: { key: "Pause", code: "Pause" },
  57363: { key: "ContextMenu", code: "ContextMenu" },
  57364: { key: "F1", code: "F1" },
  57365: { key: "F2", code: "F2" },
  57366: { key: "F3", code: "F3" },
  57367: { key: "F4", code: "F4" },
  57368: { key: "F5", code: "F5" },
  57369: { key: "F6", code: "F6" },
  57370: { key: "F7", code: "F7" },
  57371: { key: "F8", code: "F8" },
  57372: { key: "F9", code: "F9" },
  57373: { key: "F10", code: "F10" },
  57374: { key: "F11", code: "F11" },
  57375: { key: "F12", code: "F12" },
  57376: { key: "F13", code: "F13" },
  57377: { key: "F14", code: "F14" },
  57378: { key: "F15", code: "F15" },
  57379: { key: "F16", code: "F16" },
  57380: { key: "F17", code: "F17" },
  57381: { key: "F18", code: "F18" },
  57382: { key: "F19", code: "F19" },
  57383: { key: "F20", code: "F20" },
  57384: { key: "F21", code: "F21" },
  57385: { key: "F22", code: "F22" },
  57386: { key: "F23", code: "F23" },
  57387: { key: "F24", code: "F24" },
  57388: { key: "F25", code: "F25" },
  57389: { key: "F26", code: "F26" },
  57390: { key: "F27", code: "F27" },
  57391: { key: "F28", code: "F28" },
  57392: { key: "F29", code: "F29" },
  57393: { key: "F30", code: "F30" },
  57394: { key: "F31", code: "F31" },
  57395: { key: "F32", code: "F32" },
  57396: { key: "F33", code: "F33" },
  57397: { key: "F34", code: "F34" },
  57398: { key: "F35", code: "F35" },
  57399: { key: "0", code: "Numpad0" },
  57400: { key: "1", code: "Numpad1" },
  57401: { key: "2", code: "Numpad2" },
  57402: { key: "3", code: "Numpad3" },
  57403: { key: "4", code: "Numpad4" },
  57404: { key: "5", code: "Numpad5" },
  57405: { key: "6", code: "Numpad6" },
  57406: { key: "7", code: "Numpad7" },
  57407: { key: "8", code: "Numpad8" },
  57408: { key: "9", code: "Numpad9" },
  57409: { key: ".", code: "NumpadDecimal" },
  57410: { key: "/", code: "NumpadDivide" },
  57411: { key: "*", code: "NumpadMultiply" },
  57412: { key: "-", code: "NumpadSubtract" },
  57413: { key: "+", code: "NumpadAdd" },
  57414: { key: "Enter", code: "NumpadEnter" },
  57415: { key: "=", code: "NumpadEqual" },
  57416: { key: ",", code: "NumpadComma" },
  57417: { key: "ArrowLeft", code: "NumpadArrowLeft" },
  57418: { key: "ArrowRight", code: "NumpadArrowRight" },
  57419: { key: "ArrowUp", code: "NumpadArrowUp" },
  57420: { key: "ArrowDown", code: "NumpadArrowDown" },
  57421: { key: "PageUp", code: "NumpadPageUp" },
  57422: { key: "PageDown", code: "NumpadPageDown" },
  57423: { key: "Home", code: "NumpadHome" },
};

// eslint-disable-next-line no-control-regex
const KITTY_SPECIAL_KEY_RE = /^\x1B\[(\d+);(\d+):(\d+)([A-Z~])$/;

const KITTY_FUNCTIONAL_KEY_TERMINATORS: Record<string, { key: string; code: string }> = {
  A: { key: "ArrowUp", code: "ArrowUp" },
  B: { key: "ArrowDown", code: "ArrowDown" },
  C: { key: "ArrowRight", code: "ArrowRight" },
  D: { key: "ArrowLeft", code: "ArrowLeft" },
  H: { key: "Home", code: "Home" },
  F: { key: "End", code: "End" },
  P: { key: "F1", code: "F1" },
  Q: { key: "F2", code: "F2" },
  R: { key: "F3", code: "F3" },
  S: { key: "F4", code: "F4" },
};

const KITTY_TILDE_KEYS: Record<string, { key: string; code: string }> = {
  1: { key: "Home", code: "Home" },
  2: { key: "Insert", code: "Insert" },
  3: { key: "Delete", code: "Delete" },
  4: { key: "End", code: "End" },
  5: { key: "PageUp", code: "PageUp" },
  6: { key: "PageDown", code: "PageDown" },
  7: { key: "Home", code: "Home" },
  8: { key: "End", code: "End" },
  11: { key: "F1", code: "F1" },
  12: { key: "F2", code: "F2" },
  13: { key: "F3", code: "F3" },
  14: { key: "F4", code: "F4" },
  15: { key: "F5", code: "F5" },
  17: { key: "F6", code: "F6" },
  18: { key: "F7", code: "F7" },
  19: { key: "F8", code: "F8" },
  20: { key: "F9", code: "F9" },
  21: { key: "F10", code: "F10" },
  23: { key: "F11", code: "F11" },
  24: { key: "F12", code: "F12" },
};

function parseEventType(eventType: string | undefined): {
  repeat: boolean;
  release: boolean;
} {
  if (eventType === "2") return { repeat: true, release: false };
  if (eventType === "3") return { repeat: false, release: true };
  return { repeat: false, release: false };
}

function parseKittySpecialKey(sequence: string): ParseResult {
  const match = KITTY_SPECIAL_KEY_RE.exec(sequence);
  if (!match) return { handled: false, event: null };

  const keyNumOrOne = match[1]!;
  const modifierStr = match[2]!;
  const eventTypeStr = match[3]!;
  const terminator = match[4]!;

  let mapping: { key: string; code: string } | undefined;
  if (terminator === "~") {
    mapping = KITTY_TILDE_KEYS[keyNumOrOne];
  } else if (keyNumOrOne === "1") {
    mapping = KITTY_FUNCTIONAL_KEY_TERMINATORS[terminator];
  }

  const eventType = parseEventType(eventTypeStr);
  if (!mapping) return { handled: true, event: null };
  if (eventType.release) return { handled: true, event: null };

  const mods = modsFromKittyModifier(Number.parseInt(modifierStr, 10)) ?? undefined;
  return {
    handled: true,
    event: keyEvent(mapping.key, mapping.code, mods, eventType.repeat),
  };
}

function looksLikeKittyCsiU(
  cp: number,
  modifier: number | null,
  hasColons: boolean,
  fieldCount: number,
): boolean {
  if (hasColons || fieldCount > 2) return true;
  if (cp >= 57344) return true;
  if (modifier != null && modifier > 16) return true;
  // When a modifier is present with a known control/functional codepoint,
  // treat it as Kitty CSI u so we use the correct modifier decoding.
  // This covers Shift+Enter (\x1B[13;2u), Ctrl+Tab, etc.
  if (modifier != null && modifier >= 2) {
    if (cp === 13 || cp === 9 || cp === 27 || cp === 127) return true;
  }
  return false;
}

function parseKittyCsiU(sequence: string): ParseResult {
  // eslint-disable-next-line no-control-regex
  const match = /^\x1B\[([^\x1B]+)u$/.exec(sequence);
  if (!match) return { handled: false, event: null };

  const params = match[1]!;
  const fields = params.split(";");
  const field1 = fields[0] ?? "";
  const field1Parts = field1.split(":");
  const codepointStr = field1Parts[0] ?? "";
  const cp = Number.parseInt(codepointStr, 10);

  const field2 = fields[1] ?? "";
  const field2Parts = field2.split(":");
  const modifier = field2Parts[0] ? Number.parseInt(field2Parts[0], 10) : null;
  const eventTypeStr = field2Parts[1];
  const hasColons = field1Parts.length > 1 || field2Parts.length > 1;

  if (!Number.isFinite(cp)) return { handled: true, event: null };

  if (!looksLikeKittyCsiU(cp, modifier, hasColons, fields.length))
    return { handled: false, event: null };

  const eventType = parseEventType(eventTypeStr);
  if (eventType.release) return { handled: true, event: null };

  const mods = modsFromKittyModifier(modifier) ?? undefined;

  const functionalKey = KITTY_FUNCTIONAL_KEYS[cp];
  if (functionalKey) {
    return {
      handled: true,
      event: keyEvent(functionalKey.key, functionalKey.code, mods, eventType.repeat),
    };
  }

  if (cp === 13) {
    return {
      handled: true,
      event: keyEvent("Enter", "Enter", mods, eventType.repeat),
    };
  }
  if (cp === 9) {
    return {
      handled: true,
      event: keyEvent("Tab", "Tab", mods, eventType.repeat),
    };
  }
  if (cp === 27) {
    return {
      handled: true,
      event: keyEvent("Escape", "Escape", mods, eventType.repeat),
    };
  }
  if (cp === 127) {
    return {
      handled: true,
      event: keyEvent("Backspace", "Backspace", mods, eventType.repeat),
    };
  }

  if (cp >= 0x20) {
    try {
      return {
        handled: true,
        event: keyEvent(String.fromCodePoint(cp), "", mods, eventType.repeat),
      };
    } catch {
      return { handled: true, event: null };
    }
  }

  return { handled: true, event: null };
}

export function parseKittySequence(sequence: string): ParseResult {
  const special = parseKittySpecialKey(sequence);
  if (special.handled) return special;
  return parseKittyCsiU(sequence);
}
