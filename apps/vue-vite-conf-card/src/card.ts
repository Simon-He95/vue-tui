import type { Component } from "vue";
import type { Style } from "@simon_he/vue-tui/core";
import { defineComponent, h } from "vue";
import { TBox, TText } from "@simon_he/vue-tui";
import { sliceByCells, textCellWidth } from "@simon_he/vue-tui/vue";
import { siteUrl } from "./logo-images.js";

export type LogoMode = "blocks" | "graphics";
export type QrMode = "link" | "image" | "terminal";
export type CardLayout = "normal" | "comfortable";

export const cardCols = 96;
export const cardRows = 28;
export const comfortableCardRows = 38;
export const cardBg = "#020617";
export const outputName = "vue-vite-conf-card";
export const contentW = cardCols - 4;

const vueGreen = "#42b883";
const vueDark = "#35495e";
const vitePurple = "#bd34fe";
const viteCyan = "#41d1ff";
const viteYellow = "#ffd62e";
const confAccent = "#facc15";
const line = "#94a3b8";

const vueLogoRows = [
  "gGGG           GGGg",
  " GGGG         GGGG ",
  "  GGGG       GGGG  ",
  "   GGGGD   DGGGG   ",
  "    GGGDD DDGGG    ",
  "     GGDDDDDDG     ",
  "      DDDDDDD      ",
  "       dDDDd       ",
] as const;

const viteLogoRows = [
  "    pPPPPPPPPPBBBBBBb  ",
  " pPPPPPPPPPPBBBBBBBb   ",
  "PPPPPPPPPPPBBBBBBBBBBBB",
  "      PPBBBBBBBBBBBBBb ",
  "    pPPPPBBBBBBBBBb    ",
  "       pPPBBBBBBb      ",
  "         bBCCCCCb      ",
  "          cCCCCC       ",
] as const;

const shanghaiLandmarkRows = [
  "         │          ",
  "        ╭┴╮         ",
  "        │ │         ",
  "       ╭╯ ╰╮        ",
  "       ╰╮ ╭╯        ",
  "        │ │         ",
  "    ╭───╯ ╰───╮     ",
  "  ╭─╯ · · · · ╰─╮   ",
  "  │ · · · · · · │   ",
  "  ╰─╮ · · · · ╭─╯   ",
  "    ╰────┬────╯     ",
  "      ╱  │  ╲       ",
  "─────╯   │   ╰──────",
] as const;

const pudongSkylineRows = [
  "     ╭╮        ╭────╮ ",
  " ╭╮  ││   ╭╮   │    │ ",
  " ││ ╭╯╰╮  ││   │╭──╮│ ",
  " ││ │  │ ╭╯╰╮  ││  ││ ",
  "─┴┴─┴──┴─┴──┴──┴┴──┴┴─",
] as const;

const terminalShanghaiSkylineRows = [
  "                                   │          ",
  "                                  ╭┴╮         ",
  "                                  │ │         ",
  "                                 ╭╯ ╰╮        ",
  "                                 ╰╮ ╭╯        ",
  "                                  │ │         ",
  "                              ╭───╯ ╰───╮     ",
  "                            ╭─╯ · · · · ╰─╮   ",
  "                            │ · · · · · · │   ",
  "                            ╰─╮ · · · · ╭─╯   ",
  "                              ╰────┬────╯     ",
  "                                ╱  │  ╲       ",
  "       ╭╮        ╭────╮        ╱   │   ╲      ",
  "   ╭╮  ││   ╭╮   │    │   ────╯    │    ╰──── ",
  "   ││ ╭╯╰╮  ││   │╭──╮│            │          ",
  "   ││ │  │ ╭╯╰╮  ││  ││            │          ",
  "───┴┴─┴──┴─┴──┴──┴┴──┴┴────────────┴─────────",
] as const;

const qrLightStyle: Style = { fg: "whiteBright", bg: "whiteBright" };
const qrDarkStyle: Style = { fg: "black", bg: "black" };
const qrHalfStyle: Style = { fg: "black", bg: "whiteBright" };

const ticketQrTerminalRows = [
  "                                 ",
  "  █▀▀▀▀▀█ ▄▄█  ▄▀█ ▀█▀█ █▀▀▀▀▀█  ",
  "  █ ███ █ ▀▄    █▄▀▀▄ ▀ █ ███ █  ",
  "  █ ▀▀▀ █ █▀█ ██ ██▀█▄  █ ▀▀▀ █  ",
  "  ▀▀▀▀▀▀▀ █ █ ▀ ▀ ▀▄█▄█ ▀▀▀▀▀▀▀  ",
  "  ██ ▀▄▄▀█ ▄ ▀ ▀▀▀ ▄ ▀▄▄█▀▀▄▀▀▄  ",
  "  █▀▄█▄█▀▄ ▄▄▄ █▀▄▄ █▀▄█▄▄▄▀██   ",
  "  ▄ ██▄ ▀▄  ▀  ▀▄  ▀ ▄██▀▄ ▀ ▀▀  ",
  "  ▀ ▄▄█▀▀██▀ █▄█▀▄▄█  ▄▀▀  █▀█▀  ",
  "  ▀▀█  █▀█▀ ▄█  ▄ ▄█  █▀▄█ ▄ ▀▄  ",
  "  ▀ ▀▄▀▄▀█▀█▄▄█ █ ▄▄ ▄█ █▀   ██  ",
  "  ▀  ▀  ▀▀▄▀▀▀███▀█ ▀██▀▀▀█ █▄▄  ",
  "  █▀▀▀▀▀█ ▀▀   █▄ ▀▀▄ █ ▀ █▄▄▀   ",
  "  █ ███ █ ▄▄▀▀██▄ ▀█▄▄▀▀█▀█▄▄ ▀  ",
  "  █ ▀▀▀ █ ▄▄▀▀▄▄▄▄ █ ▄▄▀  █▀▀▄▀  ",
  "  ▀▀▀▀▀▀▀ ▀▀▀▀ ▀ ▀ ▀  ▀▀ ▀▀  ▀   ",
  "                                 ",
] as const;

function textNode(x: number, y: number, w: number, value: string, style: Style): unknown {
  return h(TText, {
    x,
    y,
    w,
    value: sliceByCells(value, w),
    style,
  });
}

function textLine(x: number, y: number, value: string, style: Style): unknown {
  return textNode(x, y, textCellWidth(value), value, style);
}

function lineNodes(
  x: number,
  y: number,
  rows: readonly string[],
  style: Style,
): unknown[] {
  const nodes: unknown[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    let start = -1;
    let value = "";
    const flush = (): void => {
      if (start === -1) return;
      nodes.push(textNode(x + start, y + rowIndex, textCellWidth(value), value, style));
      start = -1;
      value = "";
    };

    for (let column = 0; column < row.length; column++) {
      const char = row[column]!;
      if (char === " ") {
        flush();
        continue;
      }
      if (start === -1) start = column;
      value += char;
    }
    flush();
  }
  return nodes;
}

function clearRectNodes(x: number, y: number, w: number, h: number): unknown[] {
  return Array.from({ length: h }, (_, index) =>
    textNode(x, y + index, w, " ".repeat(w), { fg: "whiteBright", bg: cardBg }),
  );
}

function logoBlockNodes(
  x: number,
  y: number,
  rows: readonly string[],
  palette: Record<string, Style>,
): unknown[] {
  const nodes: unknown[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    for (let column = 0; column < row.length; column++) {
      const value = row[column]!;
      if (value === " ") continue;
      const style = palette[value.toUpperCase()];
      if (!style) continue;
      nodes.push(
        h(TText, {
          x: x + column,
          y: y + rowIndex,
          w: 1,
          value: value === value.toLowerCase() ? "▀" : "█",
          style,
        }),
      );
    }
  }
  return nodes;
}

function infoChipNode(x: number, y: number, value: string): unknown {
  return textNode(x, y, textCellWidth(value), value, {
    fg: line,
    bg: cardBg,
    bold: true,
  });
}

function terminalQrNodes(x: number, y: number): unknown[] {
  const nodes: unknown[] = [];
  for (let row = 0; row < ticketQrTerminalRows.length; row++) {
    const line = ticketQrTerminalRows[row]!;
    for (let column = 0; column < line.length; column++) {
      const value = line[column]!;
      const style = value === "█" ? qrDarkStyle : value === " " ? qrLightStyle : qrHalfStyle;
      nodes.push(
        h(TText, {
          x: x + column,
          y: y + row,
          w: 1,
          value: value === "█" ? " " : value,
          style,
        }),
      );
    }
  }
  return nodes;
}

export function cardRowsForLayout(layout: CardLayout): number {
  return layout === "comfortable" ? comfortableCardRows : cardRows;
}

export function makeVueViteConfCardComponent(
  options: { layout?: CardLayout; logoMode?: LogoMode; qrMode?: QrMode } = {},
): Component {
  const layout = options.layout ?? "normal";
  const comfortable = layout === "comfortable";
  const logoMode = options.logoMode ?? "blocks";
  const qrMode = options.qrMode ?? "link";
  const rows = cardRowsForLayout(layout);
  const logoY = comfortable ? 5 : 4;
  const logoLabelY = comfortable ? 14 : 12;
  const welcomeY = comfortable ? 8 : 6;
  const landmarkY = comfortable ? 14 : 10;
  const skylineX = 48;
  const skylineY = comfortable ? 28 : 18;
  const terminalSkylineX = 46;
  const terminalSkylineY = 14;
  const textStartY = comfortable ? 17 : logoMode === "blocks" ? 14 : 12;
  const qrTitleY = comfortable ? 27 : 19;
  const qrLinkY = comfortable ? 29 : 21;
  const terminalQrY = comfortable ? 16 : 10;
  const terminalQrTitleY = comfortable ? 26 : 18;
  const terminalQrLinkY = comfortable ? 28 : 20;
  const bottomY = comfortable ? 33 : 23;
  const bottomClearX = 34;
  const dateX = 36;
  const cityX = 57;
  const watermarkX = 72;

  return defineComponent({
    name: "VueViteConfCard",
    setup: () => () =>
      h(
        TBox,
        {
          x: 0,
          y: 0,
          w: cardCols,
          h: rows,
          border: true,
          padding: 1,
          title: " Vue x Vite Conf ",
          style: { fg: "whiteBright", bg: cardBg },
        },
        {
          default: () => [
            textLine(0, 0, "Vue x Vite 2026 开发者大会", {
              fg: "whiteBright",
              bold: true,
            }),
            textLine(79, 0, "中国 · 上海", { fg: confAccent, bold: true }),
            textNode(0, 2, contentW, "─".repeat(contentW), { fg: line }),
            ...(qrMode === "terminal"
              ? clearRectNodes(1, 15, 39, 18)
              : clearRectNodes(1, 16, 36, 8)),
            ...(qrMode === "image"
              ? [
                  textLine(15, 20, "扫码购票", { fg: "whiteBright", bold: true }),
                  textLine(15, 21, "vueconf.cn", {
                    fg: line,
                    bold: true,
                    underline: true,
                    href: siteUrl,
                  }),
                ]
              : qrMode === "terminal"
                ? [
                    ...terminalQrNodes(2, terminalQrY),
                    textLine(37, terminalQrTitleY, "扫码购票", {
                      fg: "whiteBright",
                      bold: true,
                    }),
                    textLine(37, terminalQrLinkY, "vueconf.cn", {
                      fg: line,
                      bold: true,
                      underline: true,
                      href: siteUrl,
                    }),
                  ]
                : [
                    textLine(2, qrTitleY, "购票链接", { fg: "whiteBright", bold: true }),
                    textLine(2, qrLinkY, "vueconf.cn", {
                      fg: line,
                      bold: true,
                      underline: true,
                      href: siteUrl,
                    }),
                  ]),
            ...clearRectNodes(1, 4, 48, 9),
            ...(qrMode === "terminal"
              ? lineNodes(terminalSkylineX, terminalSkylineY, terminalShanghaiSkylineRows, {
                  fg: "#475569",
                })
              : [
                  ...lineNodes(skylineX, skylineY, pudongSkylineRows, { fg: "#334155" }),
                  ...lineNodes(72, landmarkY, shanghaiLandmarkRows, { fg: "#475569" }),
                ]),
            ...(logoMode === "blocks"
              ? [textLine(76, welcomeY, "欢 迎 您 👋", { fg: "whiteBright", bold: true })]
              : []),
            ...(logoMode === "blocks"
              ? [
                  ...logoBlockNodes(3, logoY, vueLogoRows, {
                    G: { fg: vueGreen, bold: true },
                    D: { fg: vueDark, bold: true },
                  }),
                  ...logoBlockNodes(24, logoY, viteLogoRows, {
                    P: { fg: vitePurple, bold: true },
                    B: { fg: "#8b5cf6", bold: true },
                    C: { fg: viteCyan, bold: true },
                  }),
                ]
              : []),
            textLine(10, logoLabelY, "Vue", { fg: vueGreen, bold: true }),
            textLine(30, logoLabelY, "Vite", {
              fg: viteYellow,
              bold: true,
            }),
            textLine(42, textStartY, "Conference", { fg: "whiteBright", bold: true }),
            textLine(42, textStartY + 1, "2026", { fg: "blackBright", bold: true }),
            textNode(42, textStartY + 3, 20, "为全球 Vue x Vite", {
              fg: "whiteBright",
              bold: true,
            }),
            textNode(42, textStartY + 4, 22, "开发者带来技术盛宴。", {
              fg: "whiteBright",
              bold: true,
            }),
            ...clearRectNodes(bottomClearX, bottomY, 55, 1),
            infoChipNode(dateX, bottomY, "╭ 日期 2026/07/18 ╮"),
            infoChipNode(cityX, bottomY, "╭ 城市 上海 ╮"),
            textLine(watermarkX, bottomY, "by @simon_he/vue-tui", { fg: "#64748b" }),
          ],
        },
      ),
  });
}
