function charCellWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;

  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;

  return cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6))
    ? 2
    : 1;
}

function codepointSegments(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; ) {
    const cp = value.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    out.push(ch);
    i += ch.length;
  }
  return out;
}

export function textCellWidth(value: string): number {
  let width = 0;
  for (const ch of codepointSegments(String(value ?? ""))) {
    if (ch === "\r" || ch === "\n") continue;
    width += charCellWidth(ch);
  }
  return width;
}

export function sliceByCells(value: string, maxCells: number): string {
  const limit = Math.max(0, Math.floor(Number(maxCells)));
  if (limit <= 0) return "";

  let used = 0;
  let out = "";

  for (const ch of codepointSegments(String(value ?? ""))) {
    if (ch === "\r") continue;
    if (ch === "\n") break;

    const width = charCellWidth(ch);
    if (used + width > limit) break;

    out += ch;
    used += width;
  }

  return out;
}

export function padEndByCells(value: string, width: number, fill = " "): string {
  const target = Math.max(0, Math.floor(Number(width)));
  const text = String(value ?? "");
  const used = textCellWidth(text);

  if (used >= target) return sliceByCells(text, target);

  const fillText = fill || " ";
  let out = text;
  let current = used;

  while (current < target) {
    const next = sliceByCells(fillText, target - current) || " ";
    out += next;
    current += textCellWidth(next);
  }

  return out;
}

export function wrapByCells(value: string, width: number): string[] {
  const limit = Math.max(1, Math.floor(Number(width)));
  const lines: string[] = [];

  for (const rawLine of String(value ?? "").split(/\r?\n/u)) {
    if (!rawLine) {
      lines.push("");
      continue;
    }

    let current = "";
    let currentWidth = 0;

    for (const ch of codepointSegments(rawLine)) {
      const width = charCellWidth(ch);

      if (current && currentWidth + width > limit) {
        lines.push(current);
        current = ch;
        currentWidth = width;
        continue;
      }

      if (!current && width > limit) {
        lines.push(ch);
        current = "";
        currentWidth = 0;
        continue;
      }

      current += ch;
      currentWidth += width;
    }

    lines.push(current);
  }

  return lines.length ? lines : [""];
}
