import type { ParseResult } from "./parse-utils.js";
import { appendFileSync } from "node:fs";
import process from "node:process";

function parseMouseSgr(sequence: string): ParseResult {
  if (!sequence.startsWith("\x1B[<")) return { handled: false, event: null };

  const env = (process?.env ?? {}) as Record<string, unknown>;
  const invertWheel = String(env.DIMCODE_WHEEL_INVERT ?? env.VUE_TUI_WHEEL_INVERT ?? "") === "1";
  const mouseDebugEnabled =
    String(env.DIMCODE_MOUSE_DEBUG ?? env.VUE_TUI_MOUSE_DEBUG ?? "") === "1";
  const mouseDebugPath = String(
    env.DIMCODE_MOUSE_DEBUG_PATH ??
      env.VUE_TUI_MOUSE_DEBUG_PATH ??
      "/tmp/goatchain-mouse-debug.log",
  );
  const debug = (msg: string): void => {
    if (!mouseDebugEnabled) return;
    try {
      appendFileSync(mouseDebugPath, `${msg}\n`);
    } catch {}
  };

  let i = 3;
  const readInt = (): number | null => {
    const start = i;
    while (i < sequence.length) {
      const c = sequence.charCodeAt(i);
      if (c < 48 || c > 57) break;
      i++;
    }
    if (i === start) return null;
    return Number.parseInt(sequence.slice(start, i), 10);
  };

  const b = readInt();
  if (b == null || sequence[i] !== ";") return { handled: true, event: null };
  i++;
  const x = readInt();
  if (x == null || sequence[i] !== ";") return { handled: true, event: null };
  i++;
  const y = readInt();
  if (y == null) return { handled: true, event: null };
  const kind = sequence[i];
  if (kind !== "m" && kind !== "M") return { handled: true, event: null };
  i++;
  const up = kind === "m";

  const cellX = Math.max(0, x - 1);
  const cellY = Math.max(0, y - 1);

  const shiftKey = Boolean(b & 4);
  const altKey = Boolean(b & 8);
  const ctrlKey = Boolean(b & 16);

  if ((b & 64) === 64) {
    // SGR mouse wheel encoding (64/65) isn't consistent across all terminals.
    // Keep a sane default, but allow users to invert via env.
    let deltaY = b & 1 ? 1 : -1;
    if (invertWheel) deltaY = -deltaY;
    debug(
      `[${Date.now()}] [MOUSE] wheel b=${b} bit1=${b & 1} deltaY=${deltaY} x=${cellX} y=${cellY}`,
    );
    return {
      handled: true,
      event: { type: "wheel", cellX, cellY, deltaY, shiftKey, altKey, ctrlKey },
    };
  }

  const button = b & 3;
  // Some terminals (or multiplexers) encode button release as an SGR mouse report that
  // still ends with `M` but uses button=3 (legacy "release" button code).
  // When that happens, treating it as pointerdown leaves the UI stuck in a "mouse down"
  // state (e.g. TInput drag selection never ends).
  if (!up && (b & 32) === 0 && button === 3) {
    debug(
      `[${Date.now()}] [MOUSE] up(button=3 as M) b=${b} x=${cellX} y=${cellY} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`,
    );
    return {
      handled: true,
      event: {
        type: "pointerup",
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey,
      },
    };
  }
  if (up) {
    debug(
      `[${Date.now()}] [MOUSE] up b=${b} x=${cellX} y=${cellY} button=${button} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`,
    );
    return {
      handled: true,
      event: {
        type: "pointerup",
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey,
      },
    };
  }

  if (b & 32) {
    // Motion report (drag or "any-motion" depending on terminal mode).
    debug(
      `[${Date.now()}] [MOUSE] move b=${b} x=${cellX} y=${cellY} button=${button} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`,
    );
    return {
      handled: true,
      event: {
        type: "pointermove",
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey,
      },
    };
  }

  debug(
    `[${Date.now()}] [MOUSE] down b=${b} x=${cellX} y=${cellY} button=${button} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`,
  );
  return {
    handled: true,
    event: {
      type: "pointerdown",
      cellX,
      cellY,
      button,
      shiftKey,
      altKey,
      ctrlKey,
    },
  };
}

export function parseMouseSequence(sequence: string): ParseResult {
  return parseMouseSgr(sequence);
}
