export const VUE_TUI_LOGO_COLS = 80;
export const VUE_TUI_LOGO_ROWS = 24;

export const vueTuiLogoPalette = {
  bg: "#0B1117",
  panel: "#101B24",
  line: "#7EE7C8",
  muted: "#AAB7C4",
  slate: "#35495E",
  green: "#42B883",
  mint: "#7EE7C8",
  white: "#EAF7F0",
  amber: "#FFD166",
};

export interface VueTuiLogoStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
}

export interface VueTuiLogoPaint {
  kind: "fill" | "text";
  x: number;
  y: number;
  w: number;
  text?: string;
  style: VueTuiLogoStyle;
}

export interface VueTuiLogoCell {
  ch: string;
  fg?: string;
  bg: string;
}

const panelX = 14;
const panelY = 2;
const panelW = 52;
const panelH = 16;

const iconX = 28;
const iconY = 5;
const iconRows = [
  "GGGGGGSSSS....SSSSGGGGGG",
  ".GGGGGSSSSS..SSSSSGGGGG.",
  "..GGGGGGSSSSSSSSGGGGGG..",
  "...GGGGGSSSSSSSSGGGGG...",
  "....GGGGGSSSSSSGGGGG....",
  ".....GGGGGSSSSGGGGG.....",
  "......GGGGGGGGGGGG......",
  ".......GGGGGGGGGG.......",
  ".........GGGGGG.........",
  "...........GG...........",
];

function fill(x: number, y: number, w: number, bg: string): VueTuiLogoPaint {
  return { kind: "fill", x, y, w, style: { bg } };
}

function text(
  x: number,
  y: number,
  w: number,
  value: string,
  style: VueTuiLogoStyle,
): VueTuiLogoPaint {
  return { kind: "text", x, y, w, text: value, style };
}

function pushIconRows(ops: VueTuiLogoPaint[]) {
  iconRows.forEach((row, y) => {
    let runX = 0;
    let runTone = row[0] ?? ".";

    for (let x = 1; x <= row.length; x++) {
      const tone = x < row.length ? (row[x] ?? ".") : "";
      if (tone === runTone) continue;

      if (runTone === "G" || runTone === "S") {
        ops.push(
          fill(
            iconX + runX,
            iconY + y,
            x - runX,
            runTone === "G" ? vueTuiLogoPalette.green : vueTuiLogoPalette.slate,
          ),
        );
      }
      runX = x;
      runTone = tone;
    }
  });
}

export function createVueTuiLogoFrame(frame = 0): VueTuiLogoPaint[] {
  const ops: VueTuiLogoPaint[] = [];

  for (let y = 0; y < VUE_TUI_LOGO_ROWS; y++) {
    ops.push(fill(0, y, VUE_TUI_LOGO_COLS, vueTuiLogoPalette.bg));
  }

  for (let y = panelY + 1; y < panelY + panelH - 1; y++) {
    ops.push(fill(panelX + 1, y, panelW - 2, vueTuiLogoPalette.panel));
  }

  ops.push(
    text(panelX, panelY, panelW, `╭${"─".repeat(panelW - 2)}╮`, {
      fg: vueTuiLogoPalette.line,
      bg: vueTuiLogoPalette.panel,
    }),
    text(panelX, panelY + panelH - 1, panelW, `╰${"─".repeat(panelW - 2)}╯`, {
      fg: vueTuiLogoPalette.line,
      bg: vueTuiLogoPalette.panel,
    }),
  );

  for (let y = panelY + 1; y < panelY + panelH - 1; y++) {
    ops.push(
      text(panelX, y, 1, "│", { fg: vueTuiLogoPalette.line, bg: vueTuiLogoPalette.panel }),
      text(panelX + panelW - 1, y, 1, "│", {
        fg: vueTuiLogoPalette.line,
        bg: vueTuiLogoPalette.panel,
      }),
    );
  }

  ops.push(
    text(17, 3, 1, "●", { fg: vueTuiLogoPalette.amber, bg: vueTuiLogoPalette.panel }),
    text(20, 3, 1, "●", { fg: vueTuiLogoPalette.green, bg: vueTuiLogoPalette.panel }),
    text(23, 3, 1, "●", { fg: vueTuiLogoPalette.mint, bg: vueTuiLogoPalette.panel }),
    text(34, 3, 12, "vue-tui.term", {
      fg: vueTuiLogoPalette.muted,
      bg: vueTuiLogoPalette.panel,
    }),
  );

  pushIconRows(ops);

  const meterFrames = ["▰▱▱▱", "▱▰▱▱", "▱▱▰▱", "▱▱▱▰"];
  const meter = meterFrames[frame % meterFrames.length] ?? meterFrames[0]!;
  const cursor = frame % 2 === 0 ? "█" : " ";

  ops.push(
    text(36, 19, 3, "vue", {
      fg: vueTuiLogoPalette.green,
      bg: vueTuiLogoPalette.bg,
      bold: true,
    }),
    text(39, 19, 1, "-", { fg: vueTuiLogoPalette.muted, bg: vueTuiLogoPalette.bg }),
    text(40, 19, 3, "tui", {
      fg: vueTuiLogoPalette.mint,
      bg: vueTuiLogoPalette.bg,
      bold: true,
    }),
    text(26, 21, 27, "terminal components for Vue", {
      fg: vueTuiLogoPalette.white,
      bg: vueTuiLogoPalette.bg,
    }),
    text(28, 23, 12, "render cells", {
      fg: vueTuiLogoPalette.mint,
      bg: vueTuiLogoPalette.bg,
    }),
    text(41, 23, 4, meter, {
      fg: vueTuiLogoPalette.amber,
      bg: vueTuiLogoPalette.bg,
    }),
    text(48, 23, 7, "q exits", {
      fg: vueTuiLogoPalette.muted,
      bg: vueTuiLogoPalette.bg,
    }),
    text(56, 23, 1, cursor, {
      fg: vueTuiLogoPalette.amber,
      bg: vueTuiLogoPalette.bg,
    }),
  );

  return ops;
}

export function createVueTuiLogoCells(frame = 0): VueTuiLogoCell[][] {
  const rows = Array.from({ length: VUE_TUI_LOGO_ROWS }, () =>
    Array.from({ length: VUE_TUI_LOGO_COLS }, () => ({
      ch: " ",
      bg: vueTuiLogoPalette.bg,
    })),
  );

  for (const op of createVueTuiLogoFrame(frame)) {
    if (op.kind === "fill") {
      for (let x = op.x; x < op.x + op.w; x++) {
        if (rows[op.y]?.[x]) rows[op.y]![x] = { ch: " ", bg: op.style.bg ?? vueTuiLogoPalette.bg };
      }
      continue;
    }

    const chars = Array.from(op.text ?? "");
    for (let i = 0; i < op.w; i++) {
      const x = op.x + i;
      if (rows[op.y]?.[x]) {
        rows[op.y]![x] = {
          ch: chars[i] ?? " ",
          fg: op.style.fg,
          bg: op.style.bg ?? vueTuiLogoPalette.bg,
        };
      }
    }
  }

  return rows;
}

export function createVueTuiLogoPlainText(frame = 0): string[] {
  return createVueTuiLogoCells(frame).map((row) => row.map((cell) => cell.ch).join(""));
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createVueTuiLogoSvg(frame = 0): string {
  const cellW = 16;
  const cellH = 34;
  const width = VUE_TUI_LOGO_COLS * cellW;
  const height = VUE_TUI_LOGO_ROWS * cellH;
  const textY = (y: number) => y * cellH + 27;
  const nodes = createVueTuiLogoFrame(frame).map((op, index) => {
    if (op.kind === "fill") {
      return `<rect key="${index}" x="${op.x * cellW}" y="${op.y * cellH}" width="${op.w * cellW}" height="${cellH}" fill="${op.style.bg ?? vueTuiLogoPalette.bg}"/>`;
    }
    return [
      `<rect key="${index}-bg" x="${op.x * cellW}" y="${op.y * cellH}" width="${op.w * cellW}" height="${cellH}" fill="${op.style.bg ?? vueTuiLogoPalette.bg}"/>`,
      `<text key="${index}-text" x="${op.x * cellW}" y="${textY(op.y)}" fill="${op.style.fg ?? vueTuiLogoPalette.white}" font-weight="${op.style.bold ? 700 : 500}" textLength="${op.w * cellW}" lengthAdjust="spacingAndGlyphs">${escapeSvgText(op.text ?? "")}</text>`,
    ].join("");
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="vue-tui terminal logo">
  <rect width="${width}" height="${height}" fill="${vueTuiLogoPalette.bg}"/>
  <g font-family="SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace" font-size="22" letter-spacing="0">
    ${nodes.join("\n    ")}
  </g>
</svg>
`;
}
