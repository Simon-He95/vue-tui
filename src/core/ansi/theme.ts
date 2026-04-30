function toHexByte(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

const ANSI_16_FG: Record<number, string> = {
  30: "#000000",
  31: "#c91b00",
  32: "#00c200",
  33: "#c7c400",
  34: "#0225c7",
  35: "#c930c7",
  36: "#00c5c7",
  37: "#c7c7c7",
  90: "#686868",
  91: "#ff6e67",
  92: "#5ffa68",
  93: "#fffc67",
  94: "#6871ff",
  95: "#ff76ff",
  96: "#5ffdff",
  97: "#ffffff",
};

const ANSI_16_BG: Record<number, string> = {
  40: "#000000",
  41: "#c91b00",
  42: "#00c200",
  43: "#c7c400",
  44: "#0225c7",
  45: "#c930c7",
  46: "#00c5c7",
  47: "#c7c7c7",
  100: "#686868",
  101: "#ff6e67",
  102: "#5ffa68",
  103: "#fffc67",
  104: "#6871ff",
  105: "#ff76ff",
  106: "#5ffdff",
  107: "#ffffff",
};

export function ansi16ToCss(code: number): { fg?: string; bg?: string } {
  return {
    fg: ANSI_16_FG[code],
    bg: ANSI_16_BG[code],
  };
}

export function ansi256ToCss(index: number): string {
  const n = Math.max(0, Math.min(255, Math.trunc(index)));
  if (n < 16) {
    const baseFg = ansi16ToCss((n < 8 ? 30 : 90) + (n % 8)).fg;
    return baseFg ?? "#000000";
  }
  if (n >= 232) {
    const c = 8 + (n - 232) * 10;
    return rgbToHex(c, c, c);
  }
  const i = n - 16;
  const r = Math.floor(i / 36);
  const g = Math.floor((i % 36) / 6);
  const b = i % 6;
  const toComponent = (v: number) => (v === 0 ? 0 : 55 + v * 40);
  return rgbToHex(toComponent(r), toComponent(g), toComponent(b));
}
