import type { AnsiColorName, Style } from "../types.js";

const ESC = "\u001B";

function ansi16ToColorName(code: number): AnsiColorName | undefined {
  switch (code) {
    case 30:
      return "black";
    case 31:
      return "red";
    case 32:
      return "green";
    case 33:
      return "yellow";
    case 34:
      return "blue";
    case 35:
      return "magenta";
    case 36:
      return "cyan";
    case 37:
      return "white";
    case 90:
      return "blackBright";
    case 91:
      return "redBright";
    case 92:
      return "greenBright";
    case 93:
      return "yellowBright";
    case 94:
      return "blueBright";
    case 95:
      return "magentaBright";
    case 96:
      return "cyanBright";
    case 97:
      return "whiteBright";
    default:
      return undefined;
  }
}

function ansi16BgToColorName(code: number): AnsiColorName | undefined {
  // Map bg SGR codes to the same color names.
  const fgCode =
    code >= 40 && code <= 47 ? code - 10 : code >= 100 && code <= 107 ? code - 10 : null;
  if (fgCode == null) return undefined;
  return ansi16ToColorName(fgCode);
}

const ANSI16_RGB: Record<AnsiColorName, { r: number; g: number; b: number }> = {
  black: { r: 0x00, g: 0x00, b: 0x00 },
  red: { r: 0xc9, g: 0x1b, b: 0x00 },
  green: { r: 0x00, g: 0xc2, b: 0x00 },
  yellow: { r: 0xc7, g: 0xc4, b: 0x00 },
  blue: { r: 0x02, g: 0x25, b: 0xc7 },
  magenta: { r: 0xc9, g: 0x30, b: 0xc7 },
  cyan: { r: 0x00, g: 0xc5, b: 0xc7 },
  white: { r: 0xc7, g: 0xc7, b: 0xc7 },
  blackBright: { r: 0x68, g: 0x68, b: 0x68 },
  redBright: { r: 0xff, g: 0x6e, b: 0x67 },
  greenBright: { r: 0x5f, g: 0xfa, b: 0x68 },
  yellowBright: { r: 0xff, g: 0xfc, b: 0x67 },
  blueBright: { r: 0x68, g: 0x71, b: 0xff },
  magentaBright: { r: 0xff, g: 0x76, b: 0xff },
  cyanBright: { r: 0x5f, g: 0xfd, b: 0xff },
  whiteBright: { r: 0xff, g: 0xff, b: 0xff },
};

function nearestAnsi16(r: number, g: number, b: number): AnsiColorName {
  let best: AnsiColorName = "white";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, rgb] of Object.entries(ANSI16_RGB) as Array<
    [AnsiColorName, { r: number; g: number; b: number }]
  >) {
    const dr = r - rgb.r;
    const dg = g - rgb.g;
    const db = b - rgb.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

function ansi256ToRgb(index: number): { r: number; g: number; b: number } {
  const n = Math.max(0, Math.min(255, Math.trunc(index)));
  if (n < 16) {
    const map: AnsiColorName[] = [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "blackBright",
      "redBright",
      "greenBright",
      "yellowBright",
      "blueBright",
      "magentaBright",
      "cyanBright",
      "whiteBright",
    ];
    const name = map[n] ?? "white";
    return ANSI16_RGB[name];
  }
  if (n >= 232) {
    const c = 8 + (n - 232) * 10;
    return { r: c, g: c, b: c };
  }
  const i = n - 16;
  const rr = Math.floor(i / 36);
  const gg = Math.floor((i % 36) / 6);
  const bb = i % 6;
  const toComponent = (v: number) => (v === 0 ? 0 : 55 + v * 40);
  return { r: toComponent(rr), g: toComponent(gg), b: toComponent(bb) };
}

function applySgr(current: Style, codes: number[]): Style {
  let next: Style = { ...current };
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    if (code === 0) {
      next = {};
      continue;
    }
    if (code === 1) {
      next = { ...next, bold: true };
    } else if (code === 2) {
      next = { ...next, dim: true };
    } else if (code === 3) {
      next = { ...next, italic: true };
    } else if (code === 4) {
      next = { ...next, underline: true };
    } else if (code === 7) {
      next = { ...next, inverse: true };
    } else if (code === 22) {
      next = { ...next, bold: false, dim: false };
    } else if (code === 23) {
      next = { ...next, italic: false };
    } else if (code === 24) {
      next = { ...next, underline: false };
    } else if (code === 27) {
      next = { ...next, inverse: false };
    } else if (code === 39) {
      next = { ...next, fg: undefined };
    } else if (code === 49) {
      next = { ...next, bg: undefined };
    } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      const fg = ansi16ToColorName(code);
      next = { ...next, fg: fg ?? next.fg };
    } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      const bg = ansi16BgToColorName(code);
      next = { ...next, bg: bg ?? next.bg };
    } else if (code === 38 || code === 48) {
      // Clamp extended colors into ANSI16 palette for consistent CLI/browser output.
      const mode = codes[i + 1];
      if (mode === 5) {
        const idx = codes[i + 2];
        if (idx != null) {
          const { r, g, b } = ansi256ToRgb(idx);
          const name = nearestAnsi16(r, g, b);
          next = code === 38 ? { ...next, fg: name } : { ...next, bg: name };
        }
        i += 2;
      } else if (mode === 2) {
        const r = codes[i + 2];
        const g = codes[i + 3];
        const b = codes[i + 4];
        if (r != null && g != null && b != null) {
          const name = nearestAnsi16(r, g, b);
          next = code === 38 ? { ...next, fg: name } : { ...next, bg: name };
        }
        i += 4;
      }
    }
  }
  return next;
}

export interface AnsiSegment {
  text: string;
  style: Style;
}

export function parseAnsiSgr(input: string, baseStyle: Style = {}): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let style: Style = { ...baseStyle };
  let lastIndex = 0;

  for (let i = 0; i < input.length; i++) {
    if (input[i] !== ESC || input[i + 1] !== "[") continue;

    let j = i + 2;
    while (j < input.length) {
      const c = input.charCodeAt(j);
      if ((c >= 48 && c <= 57) || c === 59) {
        // 0-9 or ';'
        j++;
        continue;
      }
      break;
    }
    if (j >= input.length || input[j] !== "m") continue;

    if (i > lastIndex) segments.push({ text: input.slice(lastIndex, i), style });

    const body = input.slice(i + 2, j);
    const codes = body
      .split(";")
      .filter(Boolean)
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isFinite(n));

    style = applySgr(style, codes.length ? codes : [0]);
    lastIndex = j + 1;
    i = j;
  }

  if (lastIndex < input.length) segments.push({ text: input.slice(lastIndex), style });

  return segments;
}
