import type { Component } from "vue";
import type { Cell, Style, Terminal } from "@simon_he/vue-tui/core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { nextTick } from "vue";
import type { TerminalGraphicsCapabilities } from "@simon_he/vue-tui/agent";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  detectTerminalGraphicsCapabilities,
  installTerminalCleanup,
  type CliOutput,
  type TerminalCleanupHandle,
} from "@simon_he/vue-tui/cli";
import {
  ansiBgCodes,
  ansiFgCodes,
  ansiReset,
  cardBg,
  cardCols,
  cardRows,
  cellH,
  cellW,
  fgColors,
  fontSize,
} from "./constants.js";
import type { AvatarMode, CardSnapshot, RenderedTerminalGraphic } from "./types.js";
import { delay } from "./utils.js";

export async function renderComponent(
  component: Component,
  options: {
    openExternal?: (href: string) => boolean | Promise<boolean>;
    graphicsCapabilities?: TerminalGraphicsCapabilities;
  } = {},
): Promise<{
  terminal: Terminal;
  events: ReturnType<typeof createTerminalApp>["events"];
  scheduler: ReturnType<typeof createTerminalApp>["scheduler"];
  graphics: readonly RenderedTerminalGraphic[];
  dispose: () => void;
}> {
  const app = createTerminalApp({
    cols: cardCols,
    rows: cardRows,
    component,
    defaultStyle: { fg: "whiteBright", bg: cardBg },
    linkOpener: options.openExternal ? { openExternal: options.openExternal } : undefined,
  });
  const graphicsCapabilities = options.graphicsCapabilities;
  const graphicsWrites: string[] = [];
  const graphicsRenderer = graphicsCapabilities?.supported
    ? createStdoutRenderer(app.terminal, {
        output: {
          isTTY: true,
          columns: cardCols,
          rows: cardRows,
          write(chunk) {
            graphicsWrites.push(String(chunk));
          },
        },
        clear: false,
        altScreen: false,
        hideCursor: false,
        trackResize: false,
        defaultBg: cardBg,
        terminalGraphics: graphicsCapabilities,
        allowFileUrls: true,
      })
    : null;
  app.mount();
  const settleUntil = Date.now() + (graphicsCapabilities?.supported ? 250 : 0);
  do {
    await Promise.resolve();
    await delay(0);
    await nextTick();
    app.scheduler.flushNow();
    (
      graphicsRenderer?.render as
        | undefined
        | ((dirtyRows?: readonly number[] | null, sync?: boolean) => void)
    )?.(null, true);
  } while (
    graphicsCapabilities?.supported &&
    !graphicsWrites.some((write) => write.includes("\u001B_G")) &&
    Date.now() < settleUntil
  );
  const graphics = captureTerminalGraphics(graphicsWrites.join(""));
  graphicsRenderer?.dispose();
  return {
    terminal: app.terminal,
    events: app.events,
    scheduler: app.scheduler,
    graphics,
    dispose: () => {
      app.dispose();
    },
  };
}

export function stdoutAvatarMode(snapshot: CardSnapshot): AvatarMode {
  if (!snapshot.avatarPngBase64 || !process.stdout.isTTY) return "cells";
  const capabilities = detectStdoutGraphicsCapabilities();
  return capabilities.supported ? "graphic" : "cells";
}

export function detectStdoutGraphicsCapabilities(): TerminalGraphicsCapabilities {
  return detectTerminalGraphicsCapabilities({
    env: process.env as Record<string, unknown>,
    isTTY: true,
  });
}

function normalizeOpenHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

function detachedExternalOpener(child: ReturnType<typeof spawn>): boolean {
  child.on("error", () => {});
  child.unref();
  return true;
}

export function openExternalHref(href: string): boolean {
  const normalized = normalizeOpenHref(href);
  if (!normalized) return false;

  if (process.platform === "darwin") {
    return detachedExternalOpener(
      spawn("/usr/bin/open", [normalized], { detached: true, stdio: "ignore", shell: false }),
    );
  }
  if (process.platform === "win32") {
    return detachedExternalOpener(
      spawn("C:\\Windows\\System32\\rundll32.exe", ["url.dll,FileProtocolHandler", normalized], {
        detached: true,
        stdio: "ignore",
        shell: false,
      }),
    );
  }
  if (!existsSync("/usr/bin/xdg-open")) return false;
  return detachedExternalOpener(
    spawn("/usr/bin/xdg-open", [normalized], { detached: true, stdio: "ignore", shell: false }),
  );
}

export function mountInteractiveComponent(component: Component): void {
  const cols = Math.max(cardCols, Number(process.stdout.columns) || cardCols);
  const rows = Math.max(cardRows, Number(process.stdout.rows) || cardRows);
  const app = createTerminalApp({
    cols,
    rows,
    component,
    defaultStyle: { fg: "whiteBright", bg: cardBg },
    linkOpener: { openExternal: openExternalHref },
  });
  app.mount();
  const renderer = createStdoutRenderer(app.terminal, {
    output: process.stdout,
    hideCursor: true,
    allowFileUrls: true,
  });
  app.scheduler.flushNow();

  let driver: ReturnType<typeof createStdinDriver> | null = null;
  let cleanupHandle: TerminalCleanupHandle | null = null;
  let disposed = false;

  const onResize = () => {
    app.terminal.resize(
      Math.max(cardCols, Number(process.stdout.columns) || cardCols),
      Math.max(cardRows, Number(process.stdout.rows) || cardRows),
    );
    app.scheduler.flushNow();
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    process.stdout.off("resize", onResize);
    cleanupHandle?.uninstall();
    driver?.dispose();
    renderer.dispose();
    app.dispose();
  };

  const exit = () => {
    cleanup();
    process.exit(0);
  };

  process.stdout.on("resize", onResize);
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  driver = createStdinDriver({
    dispatch(event) {
      if (event.type === "keydown" && event.key === "q" && !event.ctrlKey && !event.metaKey) {
        exit();
        return true;
      }
      const prevented = app.events.dispatch(event);
      app.scheduler.flushNow();
      return prevented;
    },
    enableMouse: true,
    enableMouseMotion: true,
    onExit: exit,
  });
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

function cellColors(style: Style): { fg: string; bg: string } {
  const fg = cssColor(style.fg, "#d1d5db");
  const bg = cssColor(style.bg, cardBg);
  return style.inverse ? { fg: bg, bg: fg } : { fg, bg };
}

export function writeTerminalSvg(name: string, terminal: Terminal, outDir: string): void {
  const size = terminal.size();
  const width = size.cols * cellW;
  const height = size.rows * cellH;
  const rects: string[] = [];
  const text: string[] = [];
  const lines: string[] = [];

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
      text.push(
        `<text x="${x * cellW}" y="${y * cellH + 14}" fill="${fg}" opacity="${opacity}" font-weight="${weight}"${decoration}>${escapeHtml(cell.ch)}</text>`,
      );
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${cardBg}" />`,
    ...rects,
    `<g font-family="Menlo, Monaco, Consolas, monospace" font-size="${fontSize}" dominant-baseline="alphabetic">`,
    ...text,
    "</g>",
    "</svg>",
    "",
  ].join("\n");

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.svg`), svg);
  writeFileSync(join(outDir, `${name}.txt`), `${lines.join("\n")}\n`);
}

function ansiColor(value: string | undefined, foreground: boolean): string {
  if (!value) return "";
  if (value === "transparent") return `\u001B[${foreground ? 39 : 49}m`;
  if (value.startsWith("#") && /^#[0-9a-f]{6}$/iu.test(value)) {
    const r = Number.parseInt(value.slice(1, 3), 16);
    const g = Number.parseInt(value.slice(3, 5), 16);
    const b = Number.parseInt(value.slice(5, 7), 16);
    return `\u001B[${foreground ? 38 : 48};2;${r};${g};${b}m`;
  }
  const code = foreground ? ansiFgCodes[value] : ansiBgCodes[value];
  return code ? `\u001B[${code}m` : "";
}

function ansiStyle(style: Style): string {
  const chunks = [ansiReset];
  if (style.bold) chunks.push("\u001B[1m");
  if (style.dim) chunks.push("\u001B[2m");
  if (style.italic) chunks.push("\u001B[3m");
  if (style.underline) chunks.push("\u001B[4m");
  chunks.push(ansiColor(style.fg, true), ansiColor(style.bg ?? cardBg, false));
  if (style.inverse) chunks.push("\u001B[7m");
  return chunks.join("");
}

function osc8Open(href: string): string {
  return `\u001B]8;;${href}\u0007`;
}

function osc8Close(): string {
  return "\u001B]8;;\u0007";
}

function cursorUp(rows: number): string {
  return rows > 0 ? `\u001B[${rows}A` : "";
}

function cursorRight(cols: number): string {
  return cols > 0 ? `\u001B[${cols}C` : "";
}

function cursorColumn(col: number): string {
  return col > 1 ? `\u001B[${col}G` : "";
}

function isTerminalColumnSensitiveText(value: string): boolean {
  if (!value) return false;
  if (value.includes("\uFE0F") || value.includes("\u200D") || value.includes("\u20E3")) return true;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    if ((code >= 0x1f000 && code <= 0x1faff) || (code >= 0x1f1e6 && code <= 0x1f1ff)) return true;
  }
  return false;
}

function rowNeedsColumnGuard(row: readonly Cell[]): boolean {
  return row.some((cell) => !cell.continuation && isTerminalColumnSensitiveText(cell.ch));
}

function lastCursorPositionBefore(value: string, index: number): { x: number; y: number } | null {
  const cursorPattern = new RegExp(`${"\\u001B"}\\[(\\d+);(\\d+)H`, "gu");
  let match: RegExpExecArray | null;
  let last: { x: number; y: number } | null = null;
  while ((match = cursorPattern.exec(value)) && match.index < index) {
    last = {
      y: Math.max(0, Number(match[1]) - 1),
      x: Math.max(0, Number(match[2]) - 1),
    };
  }
  return last;
}

function captureTerminalGraphics(value: string): readonly RenderedTerminalGraphic[] {
  const graphics = new Map<string, RenderedTerminalGraphic>();
  const esc = "\\u001B";
  const bel = "\\u0007";
  const sequencePattern = new RegExp(
    `(?:(?:${esc}_G[\\s\\S]*?${esc}\\\\)+|${esc}\\]1337;File=[\\s\\S]*?(?:${bel}|${esc}\\\\))`,
    "gu",
  );
  let match: RegExpExecArray | null;
  while ((match = sequencePattern.exec(value))) {
    const position = lastCursorPositionBefore(value, match.index);
    if (!position) continue;
    graphics.set(`${position.x}:${position.y}`, { ...position, sequence: match[0] });
  }
  return Array.from(graphics.values());
}

function capturedGraphicsAnsi(
  graphics: readonly RenderedTerminalGraphic[],
  terminalRows: number,
): string {
  return graphics
    .filter((graphic) => graphic.sequence)
    .map((graphic) => {
      const y = Math.max(0, Math.min(terminalRows - 1, Math.floor(graphic.y)));
      const x = Math.max(0, Math.floor(graphic.x));
      return `\u001B7${cursorUp(terminalRows - y)}${cursorRight(x)}${graphic.sequence}${ansiReset}\u001B8`;
    })
    .join("");
}

export function terminalAnsi(
  terminal: Terminal,
  graphics: readonly RenderedTerminalGraphic[] = [],
): string {
  const size = terminal.size();
  const out: string[] = [];
  let openHref: string | undefined;
  for (let y = 0; y < size.rows; y++) {
    const row = terminal.getRow(y);
    const guardColumns = rowNeedsColumnGuard(row);
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]!;
      if (cell.continuation) continue;
      if (guardColumns && cell.ch !== " ") {
        if (openHref) {
          out.push(osc8Close());
          openHref = undefined;
        }
        out.push(cursorColumn(x + 1));
      }
      if (cell.style.href !== openHref) {
        if (openHref) out.push(osc8Close());
        openHref = cell.style.href;
        if (openHref) out.push(osc8Open(openHref));
      }
      out.push(ansiStyle(cell.style), cell.ch);
    }
    if (openHref) {
      out.push(osc8Close());
      openHref = undefined;
    }
    out.push(ansiReset, "\n");
  }
  out.push(capturedGraphicsAnsi(graphics, size.rows));
  return out.join("");
}

export async function printAnsiComponent(
  component: Component,
  graphicsCapabilities?: TerminalGraphicsCapabilities,
): Promise<void> {
  const rendered = await renderComponent(component, {
    openExternal: openExternalHref,
    graphicsCapabilities,
  });
  try {
    process.stdout.write(terminalAnsi(rendered.terminal, rendered.graphics));
  } finally {
    rendered.dispose();
  }
}

export type { CliOutput };
