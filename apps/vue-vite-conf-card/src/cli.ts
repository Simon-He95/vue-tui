#!/usr/bin/env node
import type { Component } from "vue";
import type { Cell, Style, Terminal } from "@simon_he/vue-tui/core";
import { realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { nextTick } from "vue";
import type { TerminalGraphicsCapabilities } from "@simon_he/vue-tui/cli";
import {
  createKittyGraphicsSequence,
  createTerminalApp,
  detectTerminalGraphicsCapabilities,
} from "@simon_he/vue-tui/cli";
import {
  cardBg,
  cardCols,
  cardRows,
  cardRowsForLayout,
  type CardLayout,
  makeVueViteConfCardComponent,
  outputName,
} from "./card.js";
import { cardImageOverlays, type LogoImage } from "./logo-images.js";

const cellW = 10;
const cellH = 18;
const fontSize = 14;
const ansiReset = "\u001B[0m";
const osc8Close = "\u001B]8;;\u0007";
const contentOffsetX = 2;
const contentOffsetY = 2;
type AnsiColorMode = "truecolor" | "indexed";

const fgColors: Record<string, string> = {
  black: "#111827",
  blackBright: "#6b7280",
  blue: "#2563eb",
  blueBright: "#60a5fa",
  cyan: "#06b6d4",
  cyanBright: "#67e8f9",
  green: "#22c55e",
  greenBright: "#4ade80",
  magenta: "#d946ef",
  magentaBright: "#f0abfc",
  red: "#ef4444",
  redBright: "#f87171",
  white: "#d1d5db",
  whiteBright: "#f9fafb",
  yellow: "#eab308",
  yellowBright: "#fef08a",
};

const ansiFgCodes: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  blackBright: 90,
  redBright: 91,
  greenBright: 92,
  yellowBright: 93,
  blueBright: 94,
  magentaBright: 95,
  cyanBright: 96,
  whiteBright: 97,
};

const ansiBgCodes: Record<string, number> = {
  black: 40,
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46,
  white: 47,
  blackBright: 100,
  redBright: 101,
  greenBright: 102,
  yellowBright: 103,
  blueBright: 104,
  magentaBright: 105,
  cyanBright: 106,
  whiteBright: 107,
};

function readOption(name: string): string | null {
  const argv = process.argv.slice(2);
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === name) {
      const value = argv[index + 1];
      return value && !value.startsWith("--") ? value : null;
    }
    if (arg?.startsWith(prefix)) return arg.slice(prefix.length) || null;
  }
  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function supportsKittyImages(capabilities: TerminalGraphicsCapabilities): boolean {
  return Boolean(process.stdout.isTTY) && capabilities.preferredProtocol === "kitty";
}

function isAppleTerminal(env: Record<string, unknown>): boolean {
  return String(env.TERM_PROGRAM ?? "") === "Apple_Terminal";
}

function supportsTruecolorAnsi(env: Record<string, unknown>): boolean {
  const colorterm = String(env.COLORTERM ?? "").toLowerCase();
  if (colorterm.includes("truecolor") || colorterm.includes("24bit")) return true;

  if (isAppleTerminal(env)) return false;

  const termProgram = String(env.TERM_PROGRAM ?? "");
  if (termProgram === "iTerm.app" || termProgram === "WezTerm" || termProgram === "vscode") {
    return true;
  }

  const term = String(env.TERM ?? "").toLowerCase();
  return term.includes("truecolor") || term.includes("24bit") || term.includes("kitty");
}

function ansiColorMode(env: Record<string, unknown>): AnsiColorMode {
  return supportsTruecolorAnsi(env) ? "truecolor" : "indexed";
}

export async function renderComponent(component: Component): Promise<{
  terminal: Terminal;
  dispose: () => void;
}>;
export async function renderComponent(
  component: Component,
  options: { rows?: number },
): Promise<{
  terminal: Terminal;
  dispose: () => void;
}>;
export async function renderComponent(
  component: Component,
  options: { rows?: number } = {},
): Promise<{
  terminal: Terminal;
  dispose: () => void;
}> {
  const app = createTerminalApp({
    cols: cardCols,
    rows: options.rows ?? cardRows,
    component,
    defaultStyle: { fg: "whiteBright", bg: cardBg },
  });
  app.mount();
  await Promise.resolve();
  await nextTick();
  app.scheduler.flushNow();
  return {
    terminal: app.terminal,
    dispose: () => app.dispose(),
  };
}

function cssColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value) return fallback;
  if (value.startsWith("#")) return value;
  return fgColors[value] ?? fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function hrefValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function osc8Open(href: string): string {
  return `\u001B]8;;${href}\u0007`;
}

function cellColors(style: Style): { fg: string; bg: string } {
  const fg = cssColor(style.fg, "#d1d5db");
  const bg = cssColor(style.bg, cardBg);
  return style.inverse ? { fg: bg, bg: fg } : { fg, bg };
}

export function writeTerminalSvg(
  name: string,
  terminal: Terminal,
  outDir: string,
  imageOverlays: readonly LogoImage[] = [],
): void {
  const size = terminal.size();
  const width = size.cols * cellW;
  const height = size.rows * cellH;
  const rects: string[] = [];
  const text: string[] = [];
  const links: string[] = [];
  const lines: string[] = [];
  const images = imageOverlays.map(
    (image) =>
      `<image href="data:image/png;base64,${image.base64}" x="${(image.x + contentOffsetX) * cellW}" y="${(image.y + contentOffsetY) * cellH}" width="${image.w * cellW}" height="${image.h * cellH}" />`,
  );

  for (let y = 0; y < size.rows; y++) {
    const row = terminal.getRow(y);
    lines.push(row.map((cell) => (cell.continuation ? "" : cell.ch)).join(""));
    for (let x = 0; x < size.cols; x++) {
      const cell = row[x] as Cell | undefined;
      if (!cell || cell.continuation) continue;
      const { fg, bg } = cellColors(cell.style);
      if (cell.style.bg || cell.style.inverse) {
        rects.push(
          `<rect x="${x * cellW}" y="${y * cellH}" width="${cellW * cell.width}" height="${cellH}" fill="${bg}" />`,
        );
      }
      if (!cell.ch.trim()) continue;
      const opacity = cell.style.dim ? "0.72" : "1";
      const weight = cell.style.bold ? "700" : "400";
      const decoration = cell.style.underline ? ' text-decoration="underline"' : "";
      const textElement = `<text x="${x * cellW}" y="${y * cellH + 14}" fill="${fg}" opacity="${opacity}" font-weight="${weight}"${decoration}>${escapeHtml(cell.ch)}</text>`;
      const href = hrefValue(cell.style.href);
      text.push(textElement);
      if (href) {
        links.push(
          `<a href="${escapeHtml(href)}"><rect x="${x * cellW}" y="${y * cellH}" width="${cellW * cell.width}" height="${cellH}" fill="#ffffff" opacity="0" /></a>`,
        );
      }
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${cardBg}" />`,
    ...rects,
    `<g font-family="Menlo, Monaco, Consolas, monospace" font-size="${fontSize}" dominant-baseline="alphabetic">`,
    ...text,
    "</g>",
    ...links,
    ...images,
    "</svg>",
    "",
  ].join("\n");

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.svg`), svg);
  writeFileSync(join(outDir, `${name}.txt`), `${lines.join("\n")}\n`);
}

function ansi256Index(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  if (r < 8 && g < 8 && b < 8) return 16;

  const levels = [0, 95, 135, 175, 215, 255];
  const nearest = (channel: number): number =>
    levels.reduce((best, level, index) =>
      Math.abs(level - channel) < Math.abs(levels[best]! - channel) ? index : best,
    0);

  return 16 + 36 * nearest(r) + 6 * nearest(g) + nearest(b);
}

function ansiColor(value: string | undefined, foreground: boolean, colorMode: AnsiColorMode): string {
  if (!value) return "";
  if (value === "transparent") return `\u001B[${foreground ? 39 : 49}m`;
  if (value.startsWith("#") && /^#[0-9a-f]{6}$/iu.test(value)) {
    const r = Number.parseInt(value.slice(1, 3), 16);
    const g = Number.parseInt(value.slice(3, 5), 16);
    const b = Number.parseInt(value.slice(5, 7), 16);
    if (colorMode === "indexed") {
      return `\u001B[${foreground ? 38 : 48};5;${ansi256Index(value)}m`;
    }
    return `\u001B[${foreground ? 38 : 48};2;${r};${g};${b}m`;
  }
  const code = foreground ? ansiFgCodes[value] : ansiBgCodes[value];
  return code ? `\u001B[${code}m` : "";
}

function ansiStyle(style: Style, colorMode: AnsiColorMode): string {
  const chunks = [ansiReset];
  if (style.bold) chunks.push("\u001B[1m");
  if (style.dim) chunks.push("\u001B[2m");
  if (style.underline) chunks.push("\u001B[4m");
  chunks.push(
    ansiColor(style.fg, true, colorMode),
    ansiColor(style.bg ?? cardBg, false, colorMode),
  );
  if (style.inverse) chunks.push("\u001B[7m");
  return chunks.join("");
}

export function terminalAnsi(
  terminal: Terminal,
  options: { colorMode?: AnsiColorMode } = {},
): string {
  const size = terminal.size();
  const out: string[] = [];
  const colorMode = options.colorMode ?? "truecolor";
  let activeHref: string | null = null;
  for (let y = 0; y < size.rows; y++) {
    for (const cell of terminal.getRow(y)) {
      if (cell.continuation) continue;
      const href = hrefValue(cell.style.href);
      if (href !== activeHref) {
        if (activeHref) out.push(osc8Close);
        if (href) out.push(osc8Open(href));
        activeHref = href;
      }
      out.push(ansiStyle(cell.style, colorMode), cell.ch);
    }
    if (activeHref) {
      out.push(osc8Close);
      activeHref = null;
    }
    out.push(ansiReset, "\n");
  }
  return out.join("");
}

function cursorUp(rows: number): string {
  return rows > 0 ? `\u001B[${rows}A` : "";
}

function cursorRight(cols: number): string {
  return cols > 0 ? `\u001B[${cols}C` : "";
}

function kittyImagesAnsi(images: readonly LogoImage[], rows: number = cardRows): string {
  const runId = (Date.now() % 1_000_000) * 100 + (process.pid % 100);
  return images
    .map((image, index) => {
      const sequence = createKittyGraphicsSequence(image.base64, {
        imageId: runId + index + 1,
        placementId: index + 1,
        columns: image.w,
        rows: image.h,
        zIndex: 10,
      });
      if (!sequence) return "";

      const x = image.x + contentOffsetX;
      const y = image.y + contentOffsetY;
      return `\u001B7${cursorUp(rows - y)}${cursorRight(x)}${sequence}${ansiReset}\u001B8`;
    })
    .join("");
}

export async function main(): Promise<void> {
  const outOption = readOption("--out");
  const outDir = outOption ? resolve(outOption) : null;
  const shouldWriteAnsi = !hasFlag("--no-ansi") && !outDir;
  const env = process.env as Record<string, unknown>;
  const graphicsCapabilities = detectTerminalGraphicsCapabilities({
    env,
    isTTY: Boolean(process.stdout.isTTY),
  });
  const colorMode = ansiColorMode(env);
  const useImageOverlays = Boolean(outDir) || (shouldWriteAnsi && supportsKittyImages(graphicsCapabilities));
  const layout: CardLayout = useImageOverlays ? "normal" : "comfortable";
  const rows = cardRowsForLayout(layout);
  const rendered = await renderComponent(
    makeVueViteConfCardComponent({
      layout,
      logoMode: useImageOverlays ? "graphics" : "blocks",
      qrMode: useImageOverlays ? "image" : "terminal",
    }),
    { rows },
  );
  try {
    if (outDir) {
      writeTerminalSvg(outputName, rendered.terminal, outDir, cardImageOverlays);
      process.stderr.write(`Wrote ${join(outDir, `${outputName}.svg`)}\n`);
    }
    if (shouldWriteAnsi) {
      process.stdout.write(terminalAnsi(rendered.terminal, { colorMode }));
      if (useImageOverlays) process.stdout.write(kittyImagesAnsi(cardImageOverlays, rows));
    }
  } finally {
    rendered.dispose();
  }
}

function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(process.argv[1]) === realpathSync(modulePath);
  } catch {
    return resolve(process.argv[1]) === modulePath;
  }
}

if (isDirectRun()) await main();

export { makeVueViteConfCardComponent };
