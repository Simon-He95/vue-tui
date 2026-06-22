import type { App, Component } from "vue";
import type { Cell, Style, Terminal } from "../src/core/types.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { computed, defineComponent, h, nextTick, onUnmounted, ref } from "vue";
import {
  TAutocompleteInput,
  TBox,
  TCheckbox,
  TCommandPalette,
  TDataTable,
  TDialog,
  TFormField,
  TInput,
  TLink,
  TLinkifyText,
  TList,
  TPasswordInput,
  TRadioGroup,
  TSelect,
  TSlider,
  TSwitch,
  TTable,
  TText,
  TTree,
  TView,
} from "../src/index.js";
import {
  TAnchor,
  TBreadcrumb,
  TContextMenu,
  TDebugOverlay,
  TFlow,
  TInputBox,
  TJsonEditor,
  TKeyHint,
  TMermaidText,
  TMultilineModal,
  TPathPicker,
  TPopover,
  TRenderLayer,
  TRenderPlane,
  TRouterView,
  TStatusBar,
  TTooltip,
  TTransition,
  createTerminalRouter,
  useLayout,
} from "../src/vue.js";
import { TMarkdownText, TVirtualMarkdown } from "../src/markdown.js";
import { beautifulMermaidRenderer } from "../src/mermaid.js";
import {
  TCandlestickChart,
  TContributionGraph,
  TLineChart,
  TLogLinksPanel,
  TLogMinimap,
  TLogScrollbar,
  TLogSearchBar,
  TLogSearchPager,
  TLogSearchResults,
  TLogView,
  TLogVirtualLinksPanel,
  TLogVirtualSearchResults,
  TPieChart,
  TTranscriptView,
  TVirtualList,
} from "../src/experimental.js";
import {
  TAgentTranscript,
  TThinkingView,
  TToolCallView,
  TToolLogView,
  TUserMessageView,
} from "../src/agent.js";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "../src/cli.js";
import { sliceByCells, textCellWidth } from "../src/vue/utils/text.js";

type Demo = Readonly<{
  name: string;
  group: "root" | "vue" | "markdown" | "experimental" | "agent";
  component: Component;
  cols?: number;
  rows?: number;
  install?: (app: App) => void;
}>;

const groupOrder: readonly Demo["group"][] = ["root", "vue", "markdown", "experimental", "agent"];
const foregroundOptions = [
  "whiteBright",
  "cyanBright",
  "greenBright",
  "yellowBright",
  "magentaBright",
  "redBright",
] as const;
const backgroundOptions = ["black", "blue", "green", "magenta", "red"] as const;
const titleStyle = { fg: "cyanBright", bold: true } as const;
const mutedStyle = { dim: true } as const;
export const componentTerminalMouseTracking = {
  enableMouse: true,
  enableMouseMotion: true,
} as const;
let activeGalleryNavHandler: ((key: string) => boolean) | null = null;
const rows = [
  { id: "2", name: "build", status: "fail", rank: 2 },
  { id: "1", name: "test", status: "ok", rank: 1 },
  { id: "3", name: "ship", status: "ok", rank: 3 },
];
const columns = [
  { key: "id", label: "ID", width: 4 },
  { key: "name", label: "Name", width: 12 },
  { key: "status", label: "Status", width: 8 },
  { key: "rank", label: "Rank", width: 6, align: "right" as const },
];
const logLines = [
  "INFO booting component terminal harness",
  "WARN retrying fetch from https://example.com/api",
  "ERROR failed request id=42",
  "INFO open /docs/components for component docs",
  "INFO render completed in 12ms",
  "DEBUG selected item changed",
  "INFO tail line with link https://example.com/release",
];
const logSource = {
  lineCount: () => logLines.length,
  getLine: (index: number) => logLines[index] ?? "",
  getLineKey: (index: number) => index,
};
const logMetrics = {
  scrollTop: 12,
  maxScrollTop: 122,
  atBottom: false,
  atTop: false,
  lineCount: 120,
  firstLineIndex: 0,
  estimatedVisualRowCount: 140,
  visualRowCount: 140,
  measuredVisualRowCount: 140,
  measuredLineCount: 120,
  visualIndexStatus: "exact",
  viewportRows: 18,
} as const;
const logMarkers = [
  { id: "warn", visualRow: 22, estimated: true },
  { id: "error", visualRow: 54, current: true },
  { id: "link", visualRow: 88 },
];
const searchResults = [
  {
    matchIndex: 0,
    absoluteLineIndex: 2,
    lineIndex: 2,
    text: "ERROR failed request id=42",
    matchStartCell: 0,
    matchEndCell: 5,
    current: true,
  },
  {
    matchIndex: 1,
    absoluteLineIndex: 6,
    lineIndex: 6,
    text: "INFO tail line with link https://example.com/release",
    matchStartCell: 25,
    matchEndCell: 30,
  },
];
const linkItems = [
  {
    visibleIndex: 0,
    href: "https://example.com/api",
    text: "https://example.com/api",
    absoluteLineIndex: 1,
    index: 1,
    startCell: 25,
    endCell: 48,
    current: true,
  },
  {
    visibleIndex: 1,
    href: "/docs/components",
    text: "/docs/components",
    absoluteLineIndex: 3,
    index: 3,
    startCell: 10,
    endCell: 26,
  },
];
const tokenActivityStats = [
  { value: "36.2B", label: "Lifetime tokens" },
  { value: "1.2B", label: "Peak tokens" },
  { value: "11h 28m", label: "Longest task" },
  { value: "11 days", label: "Current streak" },
  { value: "24 days", label: "Longest streak" },
] as const;
const tokenActivityRows = 7;
const tokenActivityColumns = 52;
const tokenActivityGraphWidth = tokenActivityColumns * 2 - 1;
const tokenActivityPanelWidth = tokenActivityGraphWidth + 2;
const tokenActivityMonths = [
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
] as const;
const tokenActivityMonthStarts = [0, 4, 9, 13, 17, 22, 26, 31, 35, 39, 44, 48] as const;
const tokenActivityDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function tokenActivityMonthForWeek(week: number): string {
  let index = 0;
  for (let i = 0; i < tokenActivityMonthStarts.length; i++) {
    if (week >= tokenActivityMonthStarts[i]!) index = i;
  }
  return tokenActivityMonths[index]!;
}

function tokenActivityValue(week: number, day: number): number {
  if (week < 31) {
    return (week === 28 && day === 5) || (week === 30 && day === 6) ? 1_400 : 0;
  }
  if (week < 35) {
    return (week + day) % 5 === 0 ? 2_800 + day * 360 : 0;
  }

  const pattern = (week * 5 + day * 7) % 13;
  if (week < 39 && pattern < 3) return 0;
  const monthMultiplier = week >= 48 ? 1.7 : week >= 44 ? 1.5 : week >= 39 ? 1.25 : 1;
  const dayBoost = day === 1 || day === 3 ? 4 : day === 5 ? 2 : 0;
  return Math.round((6 + pattern + dayBoost) * monthMultiplier * 1_800);
}

const tokenActivityValues = Array.from(
  { length: tokenActivityColumns * tokenActivityRows },
  (_, index) => {
    const week = Math.floor(index / tokenActivityRows);
    const day = index % tokenActivityRows;
    return tokenActivityValue(week, day);
  },
);
const tokenActivityLabels = tokenActivityValues.map((_, index) => {
  const week = Math.floor(index / tokenActivityRows);
  const day = index % tokenActivityRows;
  return `${tokenActivityMonthForWeek(week)} ${tokenActivityDayLabels[day]} week ${week + 1}`;
});
const tokenActivityBorderStyle = { fg: "#5f6772" } as const;
const tokenActivityMetricStyle = { fg: "#f8fafc", bold: true } as const;
const tokenActivityLabelStyle = { fg: "#a9b0ba" } as const;
const tokenActivityInactiveTabStyle = { fg: "#8c939d" } as const;
const tokenActivityDividerStyle = { fg: "#3f4650" } as const;
const tokenActivityEmptyStyle = { fg: "#383f48" } as const;
const tokenActivityLevelStyles: readonly Style[] = [
  { fg: "#5b4a43" },
  { fg: "#9b6655" },
  { fg: "#c7856e" },
  { fg: "#e4a085" },
];
const lineValues = [12, 18, 15, 26, 31, 28, 42, 39, 52, 48, 64, 58, 71, 76, 69, 82];
const lineLabels = lineValues.map((_, index) => `turn ${index + 1}`);
const candles = [
  { open: 18, high: 24, low: 14, close: 22 },
  { open: 22, high: 29, low: 20, close: 25 },
  { open: 25, high: 27, low: 18, close: 20 },
  { open: 20, high: 32, low: 19, close: 29 },
  { open: 29, high: 36, low: 25, close: 31 },
  { open: 31, high: 34, low: 22, close: 24 },
  { open: 24, high: 38, low: 23, close: 35 },
  { open: 35, high: 42, low: 31, close: 40 },
];
const candleLabels = candles.map((_, index) => `candle ${index + 1}`);
const pieValues = [52, 31, 17];
const pieLabels = ["prompt", "output", "cache"];
const transcriptRows = [
  {
    kind: "message",
    key: "user",
    role: "user",
    segments: [{ text: "Show me the table rendering." }],
  },
  {
    kind: "tool-call",
    key: "tool",
    title: "render_component",
    collapsed: false,
    summary: [{ text: "TTable preview ready" }],
    body: [{ text: "Rows: build, test, ship" }],
  },
  {
    kind: "approval",
    key: "approval",
    title: "Approve terminal snapshot?",
    description: [{ text: "The visual output is stable." }],
    actions: [
      { id: "approve", label: "Approve", kind: "primary" },
      { id: "reject", label: "Reject", kind: "secondary" },
    ],
  },
] as const;
const transcriptSource = {
  rowCount: () => transcriptRows.length,
  getRow: (index: number) => transcriptRows[index] ?? transcriptRows[0]!,
  getRowKey: (index: number) => transcriptRows[index]?.key ?? index,
};
const markdown = [
  "# Component Preview",
  "",
  "- links: [docs](https://example.com/docs)",
  "- table:",
  "",
  "| name | status |",
  "| --- | --- |",
  "| build | fail |",
  "| test | ok |",
].join("\n");
const mermaid = [
  "graph LR",
  "  Input[User prompt] --> Plan{Need diagram?}",
  "  Plan -- yes --> Mermaid[TMermaidText]",
  "  Plan -- no --> Text[TText]",
  "  Mermaid --> Terminal[Terminal cells]",
].join("\n");

function frame(name: string, children: unknown, hint = "q or Ctrl-C exits"): unknown[] {
  return [
    h(TText, { x: 0, y: 0, w: 80, value: name, style: titleStyle }),
    h(TText, { x: 0, y: 1, w: 80, value: hint, style: mutedStyle }),
    ...(Array.isArray(children) ? children : [children]),
  ];
}

function stateful(name: string, setup: () => () => unknown): Component {
  return defineComponent({ name: `${name}Demo`, setup });
}

function simple(name: string, render: () => unknown): Component {
  return defineComponent({ name: `${name}Demo`, setup: () => render });
}

function centerCells(value: string, width: number): string {
  const clipped = sliceByCells(value, width);
  const used = textCellWidth(clipped);
  return `${" ".repeat(Math.max(0, Math.floor((width - used) / 2)))}${clipped}`;
}

function tokenActivityStatNodes(): unknown[] {
  const nodes: unknown[] = [];
  const innerWidth = tokenActivityPanelWidth - 2;
  const separatorCount = tokenActivityStats.length - 1;
  const contentWidth = innerWidth - separatorCount;
  const baseWidth = Math.floor(contentWidth / tokenActivityStats.length);
  const remainder = contentWidth % tokenActivityStats.length;
  let x = 0;

  for (let i = 0; i < tokenActivityStats.length; i++) {
    const stat = tokenActivityStats[i]!;
    const w = baseWidth + (i < remainder ? 1 : 0);
    nodes.push(
      h(TText, {
        x,
        y: 0,
        w,
        value: centerCells(stat.value, w),
        style: tokenActivityMetricStyle,
      }),
      h(TText, {
        x,
        y: 2,
        w,
        value: centerCells(stat.label, w),
        style: tokenActivityLabelStyle,
      }),
    );
    x += w;

    if (i < tokenActivityStats.length - 1) {
      for (let row = 0; row < 3; row++) {
        nodes.push(
          h(TText, {
            x,
            y: row,
            value: "│",
            style: tokenActivityDividerStyle,
            clear: false,
          }),
        );
      }
      x += 1;
    }
  }

  return nodes;
}

function tokenActivityMonthNodes(y: number): unknown[] {
  return tokenActivityMonths.map((month, index) => {
    const x = Math.min(
      Math.max(0, tokenActivityMonthStarts[index]! * 2),
      tokenActivityGraphWidth - textCellWidth(month),
    );
    return h(TText, {
      x,
      y,
      w: textCellWidth(month),
      value: month,
      style: tokenActivityInactiveTabStyle,
    });
  });
}

function tokenActivityDemo(): unknown[] {
  const tabsY = 10;
  const weeklyX = tokenActivityGraphWidth - 19;
  const cumulativeX = tokenActivityGraphWidth - 10;
  return frame("TContributionGraph", [
    h(
      TBox,
      {
        x: 0,
        y: 3,
        w: tokenActivityPanelWidth,
        h: 5,
        border: true,
        style: tokenActivityBorderStyle,
      },
      { default: () => tokenActivityStatNodes() },
    ),
    h(TText, {
      x: 0,
      y: tabsY,
      w: 28,
      value: "Token activity",
      style: tokenActivityMetricStyle,
    }),
    h(TText, {
      x: tokenActivityGraphWidth - 27,
      y: tabsY,
      w: 5,
      value: "Daily",
      style: tokenActivityMetricStyle,
    }),
    h(TText, {
      x: weeklyX,
      y: tabsY,
      w: 6,
      value: "Weekly",
      style: tokenActivityInactiveTabStyle,
    }),
    h(TText, {
      x: cumulativeX,
      y: tabsY,
      w: 10,
      value: "Cumulative",
      style: tokenActivityInactiveTabStyle,
    }),
    h(TContributionGraph, {
      x: 0,
      y: 13,
      w: tokenActivityGraphWidth,
      values: tokenActivityValues,
      labels: tokenActivityLabels,
      unit: "tokens",
      rows: tokenActivityRows,
      columns: tokenActivityColumns,
      emptyStyle: tokenActivityEmptyStyle,
      levelStyles: tokenActivityLevelStyles,
      tooltipStyle: tokenActivityMetricStyle,
    }),
    ...tokenActivityMonthNodes(22),
  ]);
}

export function normalizeOpenHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
    return url.href;
  }

  if (url.protocol === "vscode:" && url.href === new URL(vscodeHref()).href) {
    return url.href;
  }

  return null;
}

function detachedExternalOpener(child: ReturnType<typeof spawn>): boolean {
  child.on("error", () => {});
  child.unref();
  return true;
}

type FixedExternalCommand =
  | "/usr/bin/open"
  | "C:\\Windows\\System32\\rundll32.exe"
  | "/usr/bin/xdg-open";

function openWithFixedCommand(command: FixedExternalCommand, args: readonly string[]): boolean {
  return detachedExternalOpener(
    spawn(command, [...args], {
      detached: true,
      stdio: "ignore",
      shell: false,
    }),
  );
}

export function openExternalHref(href: string): boolean {
  if (process.env.VT_OPEN_LINKS !== "1") return false;

  const normalized = normalizeOpenHref(href);
  if (!normalized) return false;

  if (process.platform === "darwin") {
    return openWithFixedCommand("/usr/bin/open", [normalized]);
  }
  if (process.platform === "win32") {
    return openWithFixedCommand("C:\\Windows\\System32\\rundll32.exe", [
      "url.dll,FileProtocolHandler",
      normalized,
    ]);
  }
  if (!existsSync("/usr/bin/xdg-open")) return false;
  return openWithFixedCommand("/usr/bin/xdg-open", [normalized]);
}

const captureOutDir =
  process.env.VUE_TUI_COMPONENT_CHART_E2E_DIR || "test-results/component-terminal-charts";
const captureCellW = 10;
const captureCellH = 18;
const captureFontSize = 14;
const captureFgColors: Record<string, string> = {
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

function captureCssColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value) return fallback;
  if (value.startsWith("#")) return value;
  return captureFgColors[value] ?? fallback;
}

function captureEscapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function captureCellColors(style: Style): { fg: string; bg: string } {
  const fg = captureCssColor(style.fg, "#d1d5db");
  const bg = captureCssColor(style.bg, "#262b33");
  return style.inverse ? { fg: bg, bg: fg } : { fg, bg };
}

function captureSnapshotText(terminal: Terminal): string {
  return terminal.snapshot().lines.join("\n");
}

function captureHasInverseCell(terminal: Terminal): boolean {
  const size = terminal.size();
  for (let y = 0; y < size.rows; y++) {
    for (const cell of terminal.getRow(y)) {
      if (cell.style.inverse) return true;
    }
  }
  return false;
}

function captureHasLineHoverCell(terminal: Terminal): boolean {
  const size = terminal.size();
  for (let y = 0; y < size.rows; y++) {
    for (const cell of terminal.getRow(y)) {
      if (cell.ch === "●" && cell.style.fg === "whiteBright" && cell.style.bold) return true;
    }
  }
  return false;
}

function writeCaptureShot(name: string, terminal: Terminal): void {
  const size = terminal.size();
  const width = size.cols * captureCellW;
  const height = size.rows * captureCellH;
  const rects: string[] = [];
  const text: string[] = [];
  const lines: string[] = [];

  for (let y = 0; y < size.rows; y++) {
    const row = terminal.getRow(y);
    lines.push(row.map((cell) => (cell.continuation ? "" : cell.ch)).join(""));
    for (let x = 0; x < size.cols; x++) {
      const cell = row[x] as Cell | undefined;
      if (!cell || cell.continuation) continue;
      const { fg, bg } = captureCellColors(cell.style);
      if (cell.style.bg || cell.style.inverse) {
        rects.push(
          `<rect x="${x * captureCellW}" y="${y * captureCellH}" width="${captureCellW * cell.width}" height="${captureCellH}" fill="${bg}" />`,
        );
      }
      if (!cell.ch.trim()) continue;
      const opacity = cell.style.dim ? "0.72" : "1";
      const weight = cell.style.bold ? "700" : "400";
      text.push(
        `<text x="${x * captureCellW}" y="${y * captureCellH + 14}" fill="${fg}" opacity="${opacity}" font-weight="${weight}">${captureEscapeHtml(cell.ch)}</text>`,
      );
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#262b33" />`,
    ...rects,
    `<g font-family="Menlo, Monaco, Consolas, monospace" font-size="${captureFontSize}" dominant-baseline="alphabetic">`,
    ...text,
    "</g>",
    "</svg>",
    "",
  ].join("\n");

  writeFileSync(join(captureOutDir, `${name}.svg`), svg);
  writeFileSync(join(captureOutDir, `${name}.txt`), `${lines.join("\n")}\n`);
}

async function writeCapturePngShots(): Promise<void> {
  const requirePng = Boolean(process.env.CI) || process.env.VUE_TUI_REQUIRE_CHART_PNG === "1";
  let chromium: typeof import("@playwright/test").chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch (error) {
    if (requirePng) throw error;
    console.warn(
      "component terminal chart png screenshots skipped: @playwright/test is unavailable",
    );
    return;
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch();
  } catch (error) {
    if (requirePng) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      [
        "component terminal chart png screenshots skipped: Playwright Chromium is unavailable.",
        "SVG and TXT screenshots were still generated.",
        "Install Chromium with: pnpm exec playwright install chromium",
        message.split("\n")[0],
      ].join("\n"),
    );
    return;
  }

  try {
    const page = await browser.newPage();
    const svgFiles = readdirSync(captureOutDir)
      .filter((name) => name.endsWith(".svg"))
      .sort();

    for (const file of svgFiles) {
      const svg = readFileSync(join(captureOutDir, file), "utf8");
      await page.setContent(
        `<style>html,body{margin:0;background:#262b33;width:max-content;height:max-content}</style>${svg}`,
      );
      const box = await page.locator("svg").boundingBox();
      assert.ok(box, `expected ${file} to render an svg`);
      await page.setViewportSize({
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      });
      await page.screenshot({
        path: join(captureOutDir, file.replace(/\.svg$/u, ".png")),
        fullPage: true,
      });
    }
  } finally {
    await browser.close();
  }
}

function tableDemo(componentName = "TTable"): unknown {
  return frame(componentName, [
    h(TTable, {
      x: 0,
      y: 3,
      w: 36,
      h: 6,
      columns,
      rows,
      border: true,
      selectedRowKey: "2",
      rowKey: "id",
      rowFocusable: true,
      headerFocusable: true,
    }),
  ]);
}

function logViewDemo(componentName = "TLogView"): unknown {
  return frame(componentName, [
    h(TLogView, {
      x: 0,
      y: 3,
      w: 72,
      h: 10,
      source: logSource,
      version: 1,
      wrap: true,
      linkify: true,
      searchQuery: "INFO",
      keyboardLinks: true,
    }),
  ]);
}

const routerRoutes = [
  {
    name: "home",
    component: simple("RouterHome", () =>
      frame("TRouterView", h(TText, { x: 0, y: 3, w: 40, value: "Route: home" })),
    ),
  },
  {
    name: "details",
    component: simple("RouterDetails", () =>
      frame("TRouterView", h(TText, { x: 0, y: 3, w: 40, value: "Route: details" })),
    ),
  },
];

const demos: Demo[] = [
  {
    name: "TerminalProvider",
    group: "root",
    component: simple("TerminalProvider", () =>
      frame(
        "TerminalProvider",
        h(TBox, { x: 0, y: 3, w: 40, h: 5, title: "provider", padding: 1 }, () =>
          h(TText, { x: 0, y: 0, w: 36, value: "createTerminalApp mounted context" }),
        ),
      ),
    ),
  },
  {
    name: "TText",
    group: "root",
    component: simple("TText", () =>
      frame(
        "TText",
        h(TText, {
          x: 0,
          y: 3,
          w: 34,
          h: 4,
          wrap: true,
          value: "Plain wrapped text rendered into terminal cells.",
        }),
      ),
    ),
  },
  {
    name: "TBox",
    group: "root",
    component: simple("TBox", () =>
      frame(
        "TBox",
        h(TBox, { x: 0, y: 3, w: 36, h: 7, title: "box", padding: 1 }, () =>
          h(TText, { x: 0, y: 0, w: 32, value: "content inside padded box" }),
        ),
      ),
    ),
  },
  {
    name: "TView",
    group: "root",
    component: simple("TView", () =>
      frame(
        "TView",
        h(TView, { x: 0, y: 3, w: 34, h: 5, focusable: true, autoFocus: true }, () => [
          h(TText, { x: 0, y: 0, w: 34, value: "view origin row" }),
          h(TText, { x: 2, y: 2, w: 28, value: "nested with local coords" }),
        ]),
      ),
    ),
  },
  {
    name: "TLink",
    group: "root",
    component: simple("TLink", () =>
      frame(
        "TLink",
        h(TLink, {
          x: 0,
          y: 3,
          href: "https://example.com",
          label: "example.com",
          autoFocus: true,
        }),
      ),
    ),
  },
  {
    name: "TLinkifyText",
    group: "root",
    component: simple("TLinkifyText", () =>
      frame(
        "TLinkifyText",
        h(TLinkifyText, {
          x: 0,
          y: 3,
          w: 54,
          h: 3,
          wrap: true,
          value: "Open https://example.com/docs or relative /docs/components.",
          allowRelative: true,
        }),
      ),
    ),
  },
  {
    name: "TCommandPalette",
    group: "root",
    component: stateful("TCommandPalette", () => {
      const selectedIndex = ref(0);
      const items = [
        { label: "Open file", detail: "src/index.ts", keywords: ["file"] },
        { label: "Run tests", detail: "vitest run", keywords: ["test"] },
        { label: "Disabled command", disabled: true },
      ];
      return () =>
        frame(
          "TCommandPalette",
          h(TCommandPalette, {
            modelValue: true,
            title: "Commands",
            w: 60,
            h: 12,
            items,
            selectedIndex: selectedIndex.value,
            showRowDetails: true,
            initialQuery: "run",
            "onUpdate:selectedIndex": (value: number) => (selectedIndex.value = value),
          }),
        );
    }),
    rows: 18,
  },
  {
    name: "TDataTable",
    group: "root",
    component: simple("TDataTable", () =>
      frame(
        "TDataTable",
        h(TDataTable, {
          x: 0,
          y: 3,
          w: 38,
          h: 7,
          columns,
          rows,
          sortable: true,
          sortBy: "rank",
          sortDirection: "desc",
          selectable: true,
          selectedRowKey: "2",
          rowKey: "id",
          border: true,
        }),
      ),
    ),
  },
  {
    name: "TContributionGraph",
    group: "root",
    component: simple("TContributionGraph", () => tokenActivityDemo()),
    cols: 112,
    rows: 25,
  },
  {
    name: "TLineChart",
    group: "root",
    component: simple("TLineChart", () =>
      frame(
        "TLineChart",
        h(TLineChart, {
          x: 0,
          y: 3,
          w: 48,
          h: 9,
          values: lineValues,
          labels: lineLabels,
          unit: "tokens",
          yLabel: "tokens",
          startLabel: "turn 1",
          endLabel: "turn 16",
        }),
      ),
    ),
    rows: 16,
  },
  {
    name: "TCandlestickChart",
    group: "root",
    component: simple("TCandlestickChart", () =>
      frame(
        "TCandlestickChart",
        h(TCandlestickChart, {
          x: 0,
          y: 3,
          w: 56,
          h: 10,
          candles,
          labels: candleLabels,
          yLabel: "price",
          startLabel: "open",
          endLabel: "latest",
        }),
      ),
    ),
    rows: 17,
  },
  {
    name: "TPieChart",
    group: "root",
    component: simple("TPieChart", () =>
      frame(
        "TPieChart",
        h(TPieChart, {
          x: 0,
          y: 3,
          w: 20,
          h: 10,
          values: pieValues,
          labels: pieLabels,
        }),
      ),
    ),
    rows: 17,
  },
  {
    name: "TDialog",
    group: "root",
    component: simple("TDialog", () =>
      frame(
        "TDialog",
        h(
          TDialog,
          {
            modelValue: true,
            w: 42,
            h: 9,
            title: "Dialog",
            backdrop: false,
            buttons: [
              { label: "Cancel", value: "cancel" },
              { label: "OK", value: "ok", kind: "primary", default: true },
            ],
          },
          () => h(TText, { x: 0, y: 0, w: 36, value: "Dialog slot content updates in place." }),
        ),
      ),
    ),
    rows: 16,
  },
  {
    name: "TInput",
    group: "root",
    component: stateful("TInput", () => {
      const value = ref("edit me");
      return () =>
        frame(
          "TInput",
          h(TInput, {
            x: 0,
            y: 3,
            w: 36,
            modelValue: value.value,
            autoFocus: true,
            placeholder: "Type here",
            "onUpdate:modelValue": (next: string) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TInputBox",
    group: "vue",
    component: stateful("TInputBox", () => {
      const value = ref("boxed input");
      return () =>
        frame(
          "TInputBox",
          h(TInputBox, {
            x: 0,
            y: 3,
            w: 42,
            h: 5,
            title: "Input",
            padding: 1,
            modelValue: value.value,
            autoFocus: true,
            "onUpdate:modelValue": (next: string) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TCheckbox",
    group: "root",
    component: stateful("TCheckbox", () => {
      const checked = ref(true);
      return () =>
        frame(
          "TCheckbox",
          h(TCheckbox, {
            x: 0,
            y: 3,
            w: 28,
            label: "Enable telemetry",
            modelValue: checked.value,
            "onUpdate:modelValue": (next: boolean) => (checked.value = next),
          }),
        );
    }),
  },
  {
    name: "TRadioGroup",
    group: "root",
    component: stateful("TRadioGroup", () => {
      const value = ref("fast");
      return () =>
        frame(
          "TRadioGroup",
          h(TRadioGroup, {
            x: 0,
            y: 3,
            w: 28,
            h: 4,
            modelValue: value.value,
            options: [
              { label: "Fast", value: "fast" },
              { label: "Balanced", value: "balanced" },
              { label: "Careful", value: "careful", disabled: true },
            ],
            "onUpdate:modelValue": (next: string) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TSwitch",
    group: "root",
    component: stateful("TSwitch", () => {
      const enabled = ref(true);
      return () =>
        frame(
          "TSwitch",
          h(TSwitch, {
            x: 0,
            y: 3,
            w: 28,
            label: "Live reload",
            modelValue: enabled.value,
            "onUpdate:modelValue": (next: boolean) => (enabled.value = next),
          }),
        );
    }),
  },
  {
    name: "TSlider",
    group: "root",
    component: stateful("TSlider", () => {
      const value = ref(42);
      return () =>
        frame(
          "TSlider",
          h(TSlider, {
            x: 0,
            y: 3,
            w: 40,
            modelValue: value.value,
            step: 5,
            "onUpdate:modelValue": (next: number) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TFormField",
    group: "root",
    component: stateful("TFormField", () => {
      const value = ref("Simon");
      return () =>
        frame(
          "TFormField",
          h(TFormField, { x: 0, y: 3, w: 42, h: 5, label: "Name", help: "Required" }, () =>
            h(TInput, {
              x: 0,
              y: 0,
              w: 28,
              modelValue: value.value,
              "onUpdate:modelValue": (next: string) => (value.value = next),
            }),
          ),
        );
    }),
  },
  {
    name: "TPasswordInput",
    group: "root",
    component: stateful("TPasswordInput", () => {
      const value = ref("secret");
      return () =>
        frame(
          "TPasswordInput",
          h(TPasswordInput, {
            x: 0,
            y: 3,
            w: 32,
            modelValue: value.value,
            autoFocus: true,
            "onUpdate:modelValue": (next: string) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TAutocompleteInput",
    group: "root",
    component: stateful("TAutocompleteInput", () => {
      const value = ref("bu");
      const highlightedIndex = ref(0);
      return () =>
        frame(
          "TAutocompleteInput",
          h(TAutocompleteInput, {
            x: 0,
            y: 3,
            w: 36,
            h: 5,
            modelValue: value.value,
            highlightedIndex: highlightedIndex.value,
            suggestions: ["build", "bundle", "benchmark", "browser"],
            "onUpdate:modelValue": (next: string) => (value.value = next),
            "onUpdate:highlightedIndex": (next: number) => (highlightedIndex.value = next),
          }),
        );
    }),
  },
  {
    name: "TList",
    group: "root",
    component: stateful("TList", () => {
      const value = ref(1);
      return () =>
        frame(
          "TList",
          h(TList, {
            x: 0,
            y: 3,
            w: 34,
            h: 7,
            items: ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"],
            modelValue: value.value,
            autoFocus: true,
            "onUpdate:modelValue": (next: number) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TVirtualList",
    group: "experimental",
    component: stateful("TVirtualList", () => {
      const value = ref(3);
      return () =>
        frame(
          "TVirtualList",
          h(TVirtualList, {
            x: 0,
            y: 3,
            w: 40,
            h: 8,
            itemCount: 200,
            itemVersion: 1,
            getItem: (index: number) => `virtual row ${index}`,
            modelValue: value.value,
            autoFocus: true,
            "onUpdate:modelValue": (next: number) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TSelect",
    group: "root",
    component: stateful("TSelect", () => {
      const value = ref(1);
      return () =>
        frame(
          "TSelect",
          h(TSelect, {
            x: 0,
            y: 3,
            w: 42,
            h: 6,
            options: [
              "Small",
              { label: "Medium", detail: "default", labelHighlightRanges: [{ start: 0, end: 3 }] },
              "Large",
              { kind: "separator", label: "---" },
              "Custom",
            ],
            modelValue: value.value,
            autoFocus: true,
            "onUpdate:modelValue": (next: number) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TPathPicker",
    group: "vue",
    component: stateful("TPathPicker", () => {
      const value = ref("./src");
      return () =>
        frame(
          "TPathPicker",
          h(TPathPicker, {
            x: 0,
            y: 3,
            w: 56,
            h: 8,
            workspace: process.cwd(),
            mode: "any",
            modelValue: value.value,
            autoFocus: true,
            "onUpdate:modelValue": (next: string) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TTable",
    group: "root",
    component: simple("TTable", () => tableDemo()),
  },
  {
    name: "TTree",
    group: "root",
    component: stateful("TTree", () => {
      const expanded = ref(["src"]);
      const selected = ref("components");
      return () =>
        frame(
          "TTree",
          h(TTree, {
            x: 0,
            y: 3,
            w: 34,
            h: 7,
            expandedIds: expanded.value,
            selectedId: selected.value,
            selectableParents: true,
            nodes: [
              {
                id: "src",
                label: "src",
                children: [
                  { id: "components", label: "components" },
                  { id: "runtime", label: "runtime" },
                ],
              },
              { id: "docs", label: "docs", disabled: true },
            ],
            "onUpdate:expandedIds": (next: string[]) => (expanded.value = next),
            "onUpdate:selectedId": (next: string) => (selected.value = next),
          }),
        );
    }),
  },
  {
    name: "TAnchor",
    group: "vue",
    component: simple("TAnchor", () =>
      frame(
        "TAnchor",
        h(TView, { x: 0, y: 3, w: 50, h: 8 }, () => [
          h(TBox, { x: 0, y: 0, w: 50, h: 8, title: "parent", padding: 0 }),
          h(TAnchor, { right: 2, bottom: 1, w: 18, h: 2 }, () =>
            h(TText, { x: 0, y: 0, w: 18, value: "anchored bottom" }),
          ),
        ]),
      ),
    ),
  },
  {
    name: "TFlow",
    group: "vue",
    component: simple("TFlow", () =>
      frame(
        "TFlow",
        h(
          TFlow,
          { x: 0, y: 3, w: 44, h: 8, items: ["one", "two", "three"], itemSize: 2, gap: 1 },
          {
            item: ({ item, index }: { item: string; index: number }) =>
              h(TText, { x: 0, y: 0, w: 24, value: `${index}: ${item}` }),
          },
        ),
      ),
    ),
  },
  {
    name: "TJsonEditor",
    group: "vue",
    component: stateful("TJsonEditor", () => {
      const value = ref('{\n  "name": "vue-tui",\n  "ok": true\n}');
      return () =>
        frame(
          "TJsonEditor",
          h(TJsonEditor, {
            x: 0,
            y: 3,
            w: 46,
            h: 7,
            modelValue: value.value,
            autoFocus: true,
            "onUpdate:modelValue": (next: string) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TContextMenu",
    group: "vue",
    component: stateful("TContextMenu", () => {
      const selected = ref(1);
      return () =>
        frame(
          "TContextMenu",
          h(TContextMenu, {
            modelValue: true,
            x: 0,
            y: 3,
            w: 28,
            items: [
              { id: "open", label: "Open", shortcut: "Enter" },
              { id: "copy", label: "Copy", shortcut: "Cmd+C" },
              { id: "delete", label: "Delete", disabled: true },
            ],
            selectedIndex: selected.value,
            "onUpdate:selectedIndex": (next: number) => (selected.value = next),
          }),
        );
    }),
  },
  {
    name: "TPopover",
    group: "vue",
    component: simple("TPopover", () =>
      frame(
        "TPopover",
        h(TPopover, {
          modelValue: true,
          x: 0,
          y: 3,
          w: 42,
          h: 6,
          title: "Popover",
          content: "Short contextual content rendered in a box.",
        }),
      ),
    ),
  },
  {
    name: "TTooltip",
    group: "vue",
    component: simple("TTooltip", () =>
      frame("TTooltip", h(TTooltip, { x: 0, y: 3, w: 38, content: "Tooltip content" })),
    ),
  },
  {
    name: "TStatusBar",
    group: "vue",
    component: simple("TStatusBar", () =>
      frame(
        "TStatusBar",
        h(TStatusBar, {
          x: 0,
          y: 3,
          w: 64,
          left: "main",
          center: "component terminal",
          right: "ready",
        }),
      ),
    ),
  },
  {
    name: "TBreadcrumb",
    group: "vue",
    component: simple("TBreadcrumb", () =>
      frame(
        "TBreadcrumb",
        h(TBreadcrumb, {
          x: 0,
          y: 3,
          w: 48,
          items: [
            { id: "root", label: "vue-tui" },
            { id: "src", label: "src" },
            { id: "components", label: "components" },
          ],
        }),
      ),
    ),
  },
  {
    name: "TKeyHint",
    group: "vue",
    component: simple("TKeyHint", () =>
      frame("TKeyHint", h(TKeyHint, { x: 0, y: 3, combo: "Ctrl+K", label: "Command palette" })),
    ),
  },
  {
    name: "TTransition",
    group: "vue",
    component: simple("TTransition", () =>
      frame(
        "TTransition",
        h(TTransition, { show: true, duration: 0 }, () =>
          h(TText, { x: 0, y: 3, w: 42, value: "Visible through transition provider" }),
        ),
      ),
    ),
  },
  {
    name: "TDebugOverlay",
    group: "vue",
    component: simple("TDebugOverlay", () =>
      frame("TDebugOverlay", [
        h(TInput, { x: 0, y: 3, w: 32, modelValue: "focused node", autoFocus: true }),
        h(TDebugOverlay, { mode: "all", panel: true, maxRects: 8 }),
      ]),
    ),
    rows: 20,
  },
  {
    name: "TMultilineModal",
    group: "vue",
    component: simple("TMultilineModal", () =>
      frame(
        "TMultilineModal",
        h(TMultilineModal, {
          visible: true,
          title: "Multiline",
          content: ["first line", "second line", "third line"].join("\n"),
        }),
      ),
    ),
    rows: 18,
  },
  {
    name: "TRouterView",
    group: "vue",
    component: simple("TRouterView", () => h(TRouterView, { routes: routerRoutes })),
    install: (app) => {
      app.use(createTerminalRouter({ routes: routerRoutes, initialRoute: "home" }));
    },
  },
  {
    name: "TRenderLayer",
    group: "vue",
    component: simple("TRenderLayer", () =>
      frame(
        "TRenderLayer",
        h(TView, { x: 0, y: 3, w: 40, h: 4 }, () => [
          h(TText, { x: 0, y: 0, w: 24, value: "base layer text" }),
          h(TRenderLayer, { zIndex: 5 }, () =>
            h(TText, { x: 5, y: 0, w: 24, value: "layer above", style: { inverse: true } }),
          ),
        ]),
      ),
    ),
  },
  {
    name: "TRenderPlane",
    group: "vue",
    component: simple("TRenderPlane", () =>
      frame("TRenderPlane", [
        h(TText, { x: 0, y: 3, w: 36, value: "default plane" }),
        h(TRenderPlane, { plane: "overlay" }, () =>
          h(TText, { x: 4, y: 4, w: 36, value: "overlay plane", style: { inverse: true } }),
        ),
      ]),
    ),
  },
  {
    name: "TMarkdownText",
    group: "markdown",
    component: simple("TMarkdownText", () =>
      frame("TMarkdownText", h(TMarkdownText, { x: 0, y: 3, w: 62, h: 12, content: markdown })),
    ),
    rows: 18,
  },
  {
    name: "TMermaidText",
    group: "markdown",
    component: simple("TMermaidText", () =>
      frame(
        "TMermaidText",
        h(TMermaidText, {
          x: 0,
          y: 3,
          w: 76,
          h: 12,
          content: mermaid,
          options: { paddingX: 1, paddingY: 0 },
          renderer: beautifulMermaidRenderer,
        }),
      ),
    ),
    rows: 18,
  },
  {
    name: "TVirtualMarkdown",
    group: "markdown",
    component: stateful("TVirtualMarkdown", () => {
      const scrollTop = ref(0);
      return () =>
        frame(
          "TVirtualMarkdown",
          h(TVirtualMarkdown, {
            x: 0,
            y: 3,
            w: 62,
            h: 10,
            content: markdown,
            scrollTop: scrollTop.value,
            autoFocus: true,
            "onUpdate:scrollTop": (next: number) => (scrollTop.value = next),
          }),
        );
    }),
    rows: 18,
  },
  {
    name: "TTranscriptView",
    group: "experimental",
    component: simple("TTranscriptView", () =>
      frame(
        "TTranscriptView",
        h(TTranscriptView, {
          x: 0,
          y: 3,
          w: 70,
          h: 10,
          source: transcriptSource,
          version: 1,
          wrap: true,
          autoFocus: true,
        }),
      ),
    ),
    rows: 18,
  },
  {
    name: "TLogView",
    group: "experimental",
    component: simple("TLogView", () => logViewDemo()),
    rows: 18,
  },
  {
    name: "TLogSearchBar",
    group: "experimental",
    component: simple("TLogSearchBar", () =>
      frame(
        "TLogSearchBar",
        h(TLogSearchBar, {
          x: 0,
          y: 3,
          w: 72,
          state: {
            query: "INFO",
            mode: "text",
            caseSensitive: false,
            wholeWord: false,
            status: "done",
            matchCount: 3,
            currentMatchIndex: 1,
          },
        }),
      ),
    ),
  },
  {
    name: "TLogSearchResults",
    group: "experimental",
    component: simple("TLogSearchResults", () =>
      frame(
        "TLogSearchResults",
        h(TLogSearchResults, {
          x: 0,
          y: 3,
          w: 72,
          h: 5,
          results: searchResults,
          activeIndex: 0,
        }),
      ),
    ),
  },
  {
    name: "TLogSearchPager",
    group: "experimental",
    component: simple("TLogSearchPager", () =>
      frame(
        "TLogSearchPager",
        h(TLogSearchPager, {
          x: 0,
          y: 3,
          w: 54,
          state: { page: 2, pageCount: 4, matchCount: 18, status: "done" },
        }),
      ),
    ),
  },
  {
    name: "TLogLinksPanel",
    group: "experimental",
    component: simple("TLogLinksPanel", () =>
      frame(
        "TLogLinksPanel",
        h(TLogLinksPanel, {
          x: 0,
          y: 3,
          w: 72,
          h: 5,
          links: linkItems,
          activeIndex: 0,
        }),
      ),
    ),
  },
  {
    name: "TLogVirtualSearchResults",
    group: "experimental",
    component: stateful("TLogVirtualSearchResults", () => {
      const value = ref(0);
      return () =>
        frame(
          "TLogVirtualSearchResults",
          h(TLogVirtualSearchResults, {
            x: 0,
            y: 3,
            w: 72,
            h: 5,
            itemCount: searchResults.length,
            itemVersion: 1,
            getItem: (index: number) => searchResults[index] ?? null,
            modelValue: value.value,
            "onUpdate:modelValue": (next: number) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TLogVirtualLinksPanel",
    group: "experimental",
    component: stateful("TLogVirtualLinksPanel", () => {
      const value = ref(0);
      return () =>
        frame(
          "TLogVirtualLinksPanel",
          h(TLogVirtualLinksPanel, {
            x: 0,
            y: 3,
            w: 72,
            h: 5,
            links: linkItems,
            modelValue: value.value,
            "onUpdate:modelValue": (next: number) => (value.value = next),
          }),
        );
    }),
  },
  {
    name: "TLogScrollbar",
    group: "experimental",
    component: simple("TLogScrollbar", () =>
      frame(
        "TLogScrollbar",
        h(TLogScrollbar, {
          x: 0,
          y: 3,
          h: 12,
          metrics: logMetrics,
          markers: logMarkers,
          showArrows: true,
        }),
      ),
    ),
    rows: 18,
  },
  {
    name: "TLogMinimap",
    group: "experimental",
    component: simple("TLogMinimap", () =>
      frame(
        "TLogMinimap",
        h(TLogMinimap, {
          x: 0,
          y: 3,
          w: 8,
          h: 12,
          metrics: logMetrics,
          markers: logMarkers,
          density: [
            { startVisualRow: 0, endVisualRow: 20, value: 0.2 },
            { startVisualRow: 21, endVisualRow: 70, value: 0.8 },
            { startVisualRow: 71, endVisualRow: 140, value: 0.5 },
          ],
        }),
      ),
    ),
    rows: 18,
  },
  {
    name: "TThinkingView",
    group: "agent",
    component: simple("TThinkingView", () =>
      frame(
        "TThinkingView",
        h(TThinkingView, {
          x: 0,
          y: 3,
          w: 64,
          content: "Planning the smallest useful component demo runner.",
          pulseFrame: 1,
        }),
      ),
    ),
  },
  {
    name: "TUserMessageView",
    group: "agent",
    component: simple("TUserMessageView", () =>
      frame(
        "TUserMessageView",
        h(TUserMessageView, {
          x: 0,
          y: 3,
          w: 68,
          content: "Please inspect this terminal component in isolation.",
          meta: "now",
          segments: [{ start: 20, end: 38, href: "https://example.com" }],
        }),
      ),
    ),
    rows: 14,
  },
  {
    name: "TToolCallView",
    group: "agent",
    component: simple("TToolCallView", () =>
      frame(
        "TToolCallView",
        h(TToolCallView, {
          x: 0,
          y: 3,
          w: 68,
          title: "pnpm run test",
          status: "success",
          suffix: "12.6s",
          preview: "126 files passed",
          selected: true,
        }),
      ),
    ),
  },
  {
    name: "TAgentTranscript",
    group: "agent",
    component: simple("TAgentTranscript", () =>
      frame(
        "TAgentTranscript",
        h(TAgentTranscript, {
          x: 0,
          y: 3,
          w: 70,
          h: 10,
          source: transcriptSource,
          version: 1,
          wrap: true,
        }),
      ),
    ),
    rows: 18,
  },
  {
    name: "TToolLogView",
    group: "agent",
    component: simple("TToolLogView", () => logViewDemo("TToolLogView")),
    rows: 18,
  },
];

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function findDemo(raw: string): Demo | undefined {
  const name = normalizeName(raw);
  return demos.find((demo) => normalizeName(demo.name) === name);
}

function listedDemos(): Demo[] {
  return groupOrder.flatMap((group) => demos.filter((demo) => demo.group === group));
}

function resolveDemo(raw: string): Demo | undefined {
  const ordered = listedDemos();
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= ordered.length) return ordered[n - 1]!;
  return findDemo(raw);
}

async function captureMountedDemo(demo: Demo, cols: number, rows: number) {
  const app = createTerminalApp({
    cols,
    rows,
    component: demo.component,
    defaultStyle: { fg: "whiteBright" },
    linkOpener: { openExternal: openExternalHref },
    selection: true,
  });
  demo.install?.(app.app);
  app.mount();
  await nextTick();
  app.scheduler.flushNow();
  return app;
}

async function settleCapturedDemo(app: Awaited<ReturnType<typeof captureMountedDemo>>) {
  await nextTick();
  app.scheduler.flushNow();
}

async function captureChartDemoScenario(scenario: {
  demoName: string;
  fileName: string;
  hover?: { cellX: number; cellY: number };
  contains: readonly string[];
  inverse?: boolean;
  lineHover?: boolean;
  noInverse?: boolean;
}): Promise<void> {
  const demo = findDemo(scenario.demoName);
  assert.ok(demo, `expected ${scenario.demoName} demo to exist`);
  const app = await captureMountedDemo(demo, demo.cols ?? 88, demo.rows ?? 22);
  try {
    if (scenario.hover) {
      app.events.dispatch({
        type: "pointermove",
        cellX: scenario.hover.cellX,
        cellY: scenario.hover.cellY,
        time: Date.now(),
      } as any);
      await settleCapturedDemo(app);
    }

    const text = captureSnapshotText(app.terminal);
    for (const value of scenario.contains) {
      assert.ok(text.includes(value), `${scenario.fileName} must contain ${value}`);
    }
    if (scenario.inverse) {
      assert.ok(captureHasInverseCell(app.terminal), `${scenario.fileName} must show hover style`);
    }
    if (scenario.lineHover) {
      assert.ok(
        captureHasLineHoverCell(app.terminal),
        `${scenario.fileName} must show hover style`,
      );
    }
    if (scenario.noInverse) {
      assert.ok(
        !captureHasInverseCell(app.terminal),
        `${scenario.fileName} must not inverse filled chart cells`,
      );
    }
    writeCaptureShot(scenario.fileName, app.terminal);
  } finally {
    app.dispose();
  }
}

async function captureChartDemos(): Promise<void> {
  rmSync(captureOutDir, { recursive: true, force: true });
  mkdirSync(captureOutDir, { recursive: true });

  const candlestickChartX = 0;
  const candlestickChartY = 3;
  const candlestickChartW = 56;
  const scenarios = [
    {
      demoName: "TContributionGraph",
      fileName: "01-run-terminal-contribution",
      contains: [
        "TContributionGraph",
        "Lifetime tokens",
        "Peak tokens",
        "Token activity",
        "Daily",
        "Weekly",
        "Cumulative",
        "Jul",
        "Jun",
      ],
    },
    {
      demoName: "TContributionGraph",
      fileName: "02-run-terminal-contribution-hover",
      hover: { cellX: 90, cellY: 17 },
      contains: ["May Fri week 46", "tokens"],
      noInverse: true,
    },
    {
      demoName: "TLineChart",
      fileName: "03-run-terminal-line",
      contains: ["TLineChart", "tokens", "turn 16", "╭", "─"],
    },
    {
      demoName: "TLineChart",
      fileName: "04-run-terminal-line-hover",
      hover: { cellX: 28, cellY: 7 },
      contains: ["turn", "x=", "y=", "tokens"],
      lineHover: true,
    },
    {
      demoName: "TCandlestickChart",
      fileName: "05-run-terminal-candlestick",
      contains: ["TCandlestickChart", "price", "latest", "█"],
    },
    {
      demoName: "TCandlestickChart",
      fileName: "06-run-terminal-candlestick-hover",
      hover: { cellX: candlestickChartX + candlestickChartW - 1, cellY: candlestickChartY + 3 },
      contains: ["candle", "x=", "y=", "O:", "H:", "L:", "C:"],
      noInverse: true,
    },
    {
      demoName: "TPieChart",
      fileName: "07-run-terminal-pie",
      contains: ["TPieChart", "prompt 52 52%", "output 31 31%", "cache 17 17%", "▗", "▘"],
    },
  ] as const;

  for (const scenario of scenarios) {
    await captureChartDemoScenario(scenario);
  }
  await writeCapturePngShots();
  console.log(`component terminal chart screenshots: ${captureOutDir}`);
}

function selectedStyle(active: boolean) {
  return active ? { fg: "black", bg: "cyanBright", bold: true } : { fg: "whiteBright" };
}

function vscodeHref(): string {
  return encodeURI(`vscode://file${process.cwd()}/scripts/run-component-terminal.ts:1`);
}

const ComponentGallery = defineComponent({
  name: "ComponentGallery",
  props: {
    initialName: { type: String, default: "" },
  },
  setup(props) {
    const layout = useLayout();
    const ordered = listedDemos();
    const initialIndex = Math.max(
      0,
      props.initialName
        ? ordered.findIndex((demo) => normalizeName(demo.name) === normalizeName(props.initialName))
        : 0,
    );
    const selectedIndex = ref(initialIndex);
    const routeHistory = ref<number[]>([]);
    const navTop = ref(Math.max(0, initialIndex - 3));
    const fgIndex = ref(1);
    const bgIndex = ref(0);
    const underline = ref(true);
    const toolCollapsed = ref(false);
    const status = ref("Click a component, tweak props, or open an external target.");

    const cols = computed(() => Math.max(80, Math.floor(layout.clipRect?.w ?? 104)));
    const rowsCount = computed(() => Math.max(18, Math.floor(layout.clipRect?.h ?? 26)));
    const bodyH = computed(() => Math.max(15, rowsCount.value - 2));
    const leftW = computed(() => Math.min(28, Math.max(20, Math.floor(cols.value * 0.24))));
    const rightW = computed(() => Math.min(30, Math.max(24, Math.floor(cols.value * 0.25))));
    const centerW = computed(() => Math.max(32, cols.value - leftW.value - rightW.value));
    const navRows = computed(() => Math.max(7, bodyH.value - 6));
    const selectedDemo = computed(() => ordered[selectedIndex.value] ?? ordered[0]!);
    const fg = computed(() => foregroundOptions[fgIndex.value] ?? foregroundOptions[0]);
    const bg = computed(() => backgroundOptions[bgIndex.value] ?? backgroundOptions[0]);
    const liveStyle = computed(() => ({ fg: fg.value, bg: bg.value, underline: underline.value }));

    function ensureVisible(index: number): void {
      const visible = navRows.value;
      if (index < navTop.value) navTop.value = index;
      else if (index >= navTop.value + visible) navTop.value = index - visible + 1;
    }

    function selectRoute(index: number): void {
      const demo = ordered[index];
      if (!demo || index === selectedIndex.value) return;
      routeHistory.value = [...routeHistory.value, selectedIndex.value].slice(-20);
      selectedIndex.value = index;
      ensureVisible(index);
      status.value = `Route: ${demo.group}/${demo.name}`;
    }

    function goBack(): void {
      const previous = routeHistory.value[routeHistory.value.length - 1];
      if (previous == null) return;
      routeHistory.value = routeHistory.value.slice(0, -1);
      selectedIndex.value = previous;
      ensureVisible(previous);
      status.value = `Back to ${ordered[previous]?.name ?? "previous route"}`;
    }

    function cycleFg(): void {
      fgIndex.value = (fgIndex.value + 1) % foregroundOptions.length;
      status.value = `fg=${fg.value}`;
    }

    function cycleBg(): void {
      bgIndex.value = (bgIndex.value + 1) % backgroundOptions.length;
      status.value = `bg=${bg.value}`;
    }

    function toggleUnderline(): void {
      underline.value = !underline.value;
      status.value = `underline=${underline.value ? "on" : "off"}`;
    }

    function toggleTool(): void {
      toolCollapsed.value = !toolCollapsed.value;
      status.value = `tool_call ${toolCollapsed.value ? "collapsed" : "expanded"}`;
    }

    function openVscode(): void {
      const href = vscodeHref();
      status.value = openExternalHref(href)
        ? "Open requested for scripts/run-component-terminal.ts in VS Code"
        : `Link: ${href} (set VT_OPEN_LINKS=1 to open)`;
    }

    function openBrowser(): void {
      const href = "https://example.com";
      status.value = openExternalHref(href)
        ? "Open requested for https://example.com"
        : `Link: ${href} (set VT_OPEN_LINKS=1 to open)`;
    }

    function move(delta: number): void {
      const next = Math.max(0, Math.min(ordered.length - 1, selectedIndex.value + delta));
      selectRoute(next);
    }

    function page(delta: number): void {
      move(delta * Math.max(1, navRows.value - 1));
    }

    function handleNavigationKey(key: string): boolean {
      if (key === "ArrowDown") {
        move(1);
        return true;
      } else if (key === "ArrowUp") {
        move(-1);
        return true;
      } else if (key === "PageDown") {
        page(1);
        return true;
      } else if (key === "PageUp") {
        page(-1);
        return true;
      }
      return false;
    }

    function onKeydownCapture(event: any): void {
      if (!handleNavigationKey(event.key)) return;
      event.preventDefault();
    }

    function onKeydown(event: any): void {
      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        goBack();
      } else if (event.key === "u" || event.key === "U") {
        event.preventDefault();
        toggleUnderline();
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        cycleFg();
      } else if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        cycleBg();
      } else if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        toggleTool();
      } else if (event.key === "o" || event.key === "O") {
        event.preventDefault();
        openBrowser();
      } else if (event.key === "v" || event.key === "V") {
        event.preventDefault();
        openVscode();
      }
    }

    function controlButton(label: string, y: number, onClick: () => void, active = false) {
      const w = Math.max(0, rightW.value - 2);
      return [
        h(TView, { x: 0, y, w, h: 1, focusable: true, onClick }),
        h(TText, {
          x: 0,
          y,
          w,
          value: label,
          style: active
            ? { fg: "black", bg: "yellowBright", bold: true }
            : { fg: "whiteBright", bg: "black" },
        }),
      ];
    }

    function renderNav() {
      const visible = navRows.value;
      const maxTop = Math.max(0, ordered.length - visible);
      const start = Math.min(navTop.value, maxTop);
      const items = ordered.slice(start, start + visible);
      const w = Math.max(0, leftW.value - 2);
      const out: unknown[] = [
        h(TText, {
          x: 0,
          y: 0,
          w,
          value: `routes ${selectedIndex.value + 1}/${ordered.length}`,
          style: { fg: "yellowBright", bold: true },
        }),
      ];
      let y = 2;
      for (let i = 0; i < items.length; i++) {
        const demo = items[i]!;
        const index = start + i;
        const active = index === selectedIndex.value;
        const label = `${String(index + 1).padStart(2, " ")} ${demo.name}`;
        out.push(
          h(TView, {
            key: `nav-hit:${demo.name}`,
            x: 0,
            y,
            w,
            h: 1,
            focusable: true,
            onClick: () => selectRoute(index),
          }),
          h(TText, {
            key: `nav:${demo.name}`,
            x: 0,
            y,
            w,
            value: label,
            style: selectedStyle(active),
          }),
        );
        y++;
      }
      out.push(
        h(TText, {
          x: 0,
          y: bodyH.value - 4,
          w,
          value: "Up/Down route  Pg scroll",
          style: mutedStyle,
        }),
        h(TText, {
          x: 0,
          y: bodyH.value - 3,
          w,
          value: "B back  q exit",
          style: mutedStyle,
        }),
      );
      return out;
    }

    function renderPreview() {
      const demo = selectedDemo.value;
      const w = Math.max(0, centerW.value - 2);
      const demoH = Math.max(5, bodyH.value - 10);
      const selectedPreview =
        demo.name === "TMultilineModal"
          ? h(
              TBox,
              {
                x: 0,
                y: 9,
                w: Math.min(w, 62),
                h: Math.min(demoH, 12),
                title: "Multiline",
                padding: 1,
                style: { fg: "whiteBright", bg: "black" },
              },
              () =>
                h(TText, {
                  x: 0,
                  y: 0,
                  w: Math.min(w, 58),
                  h: 4,
                  value: ["first line", "second line", "third line"].join("\n"),
                }),
            )
          : h(TView, { x: 0, y: 9, w, h: demoH, key: `preview:${demo.name}` }, () =>
              h(demo.component, { key: demo.name }),
            );
      return [
        h(TText, {
          x: 0,
          y: 0,
          w,
          value: `${demo.group}/${demo.name}`,
          style: { fg: "cyanBright", bold: true },
        }),
        h(TText, {
          x: 0,
          y: 1,
          w,
          value: "Live props",
          style: { fg: "yellowBright" },
        }),
        h(TText, {
          x: 0,
          y: 2,
          w,
          value: `Styled text: fg=${fg.value} bg=${bg.value} underline=${underline.value}`,
          style: liveStyle.value,
        }),
        h(TLink, {
          x: 0,
          y: 3,
          href: "https://example.com",
          label: "open browser with TLink",
          style: liveStyle.value,
          onActivate: ({ href }: { href: string }) => {
            if (process.env.VT_OPEN_LINKS !== "1") {
              status.value = `Link: ${href} (set VT_OPEN_LINKS=1 to open)`;
            }
          },
          onOpen: () => {
            status.value = "TLink open requested for https://example.com";
          },
        }),
        h(TView, { x: 27, y: 3, w: 18, h: 1, focusable: true, onClick: openVscode }, () =>
          h(TText, {
            x: 0,
            y: 0,
            w: 18,
            value: "[open VS Code]",
            style: { fg: "black", bg: "greenBright", bold: true },
          }),
        ),
        h(TToolCallView, {
          x: 0,
          y: 5,
          w: Math.min(w, 58),
          title: "tool_call: pnpm run test",
          status: toolCollapsed.value ? "running" : "success",
          suffix: toolCollapsed.value ? "collapsed" : "expanded",
          preview: "click or press T to fold/unfold",
          selected: true,
          collapsed: toolCollapsed.value,
          onToggle: toggleTool,
        }),
        h(TText, { x: 0, y: 8, w, value: "Selected component", style: { fg: "yellowBright" } }),
        selectedPreview,
      ];
    }

    function renderControls() {
      const out: unknown[] = [
        h(TText, {
          x: 0,
          y: 0,
          w: Math.max(0, rightW.value - 2),
          value: "Props",
          style: { fg: "yellowBright", bold: true },
        }),
        ...controlButton(`F fg: ${fg.value}`, 2, cycleFg),
        ...controlButton(`G bg: ${bg.value}`, 3, cycleBg),
        ...controlButton(
          `U underline: ${underline.value ? "on" : "off"}`,
          4,
          toggleUnderline,
          underline.value,
        ),
        ...controlButton(
          `T tool: ${toolCollapsed.value ? "collapsed" : "expanded"}`,
          5,
          toggleTool,
          toolCollapsed.value,
        ),
        h(TText, {
          x: 0,
          y: 7,
          w: Math.max(0, rightW.value - 2),
          value: "Open",
          style: { fg: "yellowBright", bold: true },
        }),
        ...controlButton("O browser", 9, openBrowser),
        ...controlButton("V VS Code", 10, openVscode),
        h(TText, {
          x: 0,
          y: 12,
          w: Math.max(0, rightW.value - 2),
          value: "Route",
          style: { fg: "yellowBright", bold: true },
        }),
        ...controlButton("B back", 14, goBack, routeHistory.value.length > 0),
      ];
      return out;
    }

    activeGalleryNavHandler = handleNavigationKey;
    onUnmounted(() => {
      if (activeGalleryNavHandler === handleNavigationKey) activeGalleryNavHandler = null;
    });

    return () =>
      h(
        TView,
        {
          x: 0,
          y: 0,
          w: cols.value,
          h: rowsCount.value,
          focusable: true,
          autoFocus: true,
          onKeydownCapture,
          onKeydown,
        },
        () => [
          h(TText, {
            x: 0,
            y: 0,
            w: cols.value,
            value: " vue-tui component gallery",
            style: { fg: "black", bg: "cyanBright", bold: true },
          }),
          h(
            TBox,
            {
              x: 0,
              y: 1,
              w: leftW.value,
              h: bodyH.value,
              title: "Components",
              padding: 0,
              style: { fg: "cyanBright" },
            },
            renderNav,
          ),
          h(
            TBox,
            {
              x: leftW.value,
              y: 1,
              w: centerW.value,
              h: bodyH.value,
              title: "Preview",
              padding: 0,
              style: { fg: "whiteBright" },
            },
            renderPreview,
          ),
          h(
            TBox,
            {
              x: leftW.value + centerW.value,
              y: 1,
              w: rightW.value,
              h: bodyH.value,
              title: "Controls",
              padding: 0,
              style: { fg: "greenBright" },
            },
            renderControls,
          ),
          h(TStatusBar, {
            x: 0,
            y: rowsCount.value - 1,
            w: cols.value,
            left: `route ${selectedDemo.value.name}`,
            center: status.value,
            right: "q exit",
          }),
        ],
      );
  },
});

function printList(): void {
  const ordered = listedDemos();
  for (const group of groupOrder) {
    const entries = demos
      .filter((demo) => demo.group === group)
      .map((demo) => ({ demo, index: ordered.indexOf(demo) }));
    if (!entries.length) continue;
    console.log(`\n${group}`);
    for (const { demo, index } of entries) {
      console.log(`${String(index + 1).padStart(2, " ")}. ${demo.name}`);
    }
  }
}

function usage(): void {
  console.log("Usage: pnpm run run:component:terminal -- [initial-component]");
  console.log("       pnpm run run:component:terminal -- --list");
  console.log("       pnpm run run:component:terminal -- --capture-charts");
  console.log("       VT_SMOKE=1 pnpm run run:component:terminal -- --all");
}

function mountComponentApp(options: {
  component: Component;
  cols: number;
  rows: number;
  smoke: boolean;
  props?: Record<string, unknown>;
  install?: (app: App) => void;
}): void {
  const app = createTerminalApp({
    cols: options.cols,
    rows: options.rows,
    component: options.component,
    props: options.props,
    defaultStyle: { fg: "whiteBright" },
    linkOpener: { openExternal: openExternalHref },
    selection: true,
  });

  options.install?.(app.app);
  app.mount();

  const renderer = createStdoutRenderer(
    app.terminal,
    options.smoke
      ? {
          output: { isTTY: false, write: () => {} } as any,
          clear: false,
          hideCursor: false,
          altScreen: false,
        }
      : { output: process.stdout, hideCursor: true, allowFileUrls: true },
  );

  app.scheduler.flushNow();

  let driver: ReturnType<typeof createStdinDriver> | null = null;
  let cleanupHandle: TerminalCleanupHandle | null = null;
  let disposed = false;

  const onResize = () => {
    const nextCols = Math.max(80, Number(process.stdout.columns) || options.cols);
    const nextRows = Math.max(18, Number(process.stdout.rows) || options.rows);
    app.terminal.resize(nextCols, nextRows);
    app.scheduler.flushNow();
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    if (process.stdout.isTTY) process.stdout.off("resize", onResize);
    cleanupHandle?.uninstall();
    cleanupHandle = null;
    driver?.dispose();
    renderer.dispose();
    app.dispose();
  };

  const exit = () => {
    cleanup();
    process.exit(0);
  };

  if (options.smoke || !process.stdin.isTTY || !process.stdout.isTTY) {
    cleanup();
    return;
  }

  process.stdout.on("resize", onResize);
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  driver = createStdinDriver({
    dispatch(event) {
      if (event.type === "keydown" && event.key === "q" && !event.ctrlKey && !event.metaKey) {
        exit();
        return true;
      }
      if (event.type === "keydown" && activeGalleryNavHandler?.(event.key)) {
        app.scheduler.flushNow();
        return true;
      }
      const prevented = app.events.dispatch(event);
      app.scheduler.flushNow();
      return prevented;
    },
    ...componentTerminalMouseTracking,
    onExit: exit,
  });
}

function mountDemo(demo: Demo, smoke: boolean): void {
  mountComponentApp({
    component: demo.component,
    cols: demo.cols ?? Math.max(88, Number(process.stdout.columns) || 88),
    rows: demo.rows ?? Math.max(22, Number(process.stdout.rows) || 22),
    smoke,
    install: demo.install,
  });
}

function mountGallery(initialName: string, smoke: boolean): void {
  mountComponentApp({
    component: ComponentGallery,
    cols: Math.max(104, Number(process.stdout.columns) || 104),
    rows: Math.max(24, Number(process.stdout.rows) || 24),
    smoke,
    props: { initialName },
    install: (app) => {
      for (const demo of demos) demo.install?.(app);
    },
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }
  if (args.includes("--list")) {
    printList();
    return;
  }
  if (args.includes("--capture-charts")) {
    await captureChartDemos();
    return;
  }

  const runAll = args.includes("--all");
  const smoke = process.env.VT_SMOKE === "1" || runAll;
  if (runAll) {
    for (const demo of demos) mountDemo(demo, true);
    console.log(`Mounted ${demos.length} component terminal demos.`);
    return;
  }

  const name = args.find((arg) => !arg.startsWith("-")) ?? "";
  if (name && !resolveDemo(name)) {
    console.error("Unknown component.");
    usage();
    process.exitCode = 1;
    return;
  }
  mountGallery(name, smoke);
}

function isMainModule(): boolean {
  return process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
}

if (isMainModule()) void main();
