import type { Style } from "../../core/types.js";
import type { TLogMinimapDensityBucket } from "../components/TLogMinimap.js";
import type { TLogViewVisibleLink } from "../components/TLogView.js";
import type { TLogLinkAction } from "./use-tlog-link-controller.js";
import { sanitizeTerminalHref } from "../../core/hyperlink.js";
import { textCellWidth } from "../utils/text.js";

export type TLogPluginSeverity = "error" | "warning" | "info";
export type TLogPluginLinkSource = "osc8" | "url" | "plugin";

export type TLogPluginVisualSegment = Readonly<{
  text: string;
  cells: number;
  style?: Style;
  href?: string;
}>;

export type TLogViewExternalLink = Readonly<{
  id: string;
  href: string;
  text: string;
  absoluteLineIndex: number;
  lineIndex: number;
  startCell: number;
  endCell: number;
  source: TLogPluginLinkSource;
  pluginName?: string;
  data?: unknown;
}>;

export type TLogViewExternalMarker = Readonly<{
  id: string;
  absoluteLineIndex: number;
  lineIndex: number;
  visualRow: number;
  estimated?: boolean;
  current?: boolean;
  label?: string;
  severity?: TLogPluginSeverity;
  source: string;
  data?: unknown;
}>;

export type TLogViewPluginLineMarker = Readonly<{
  id?: string | number;
  label?: string;
  severity?: TLogPluginSeverity;
  estimated?: boolean;
  data?: unknown;
}>;

export type TLogViewPluginLineLink = Readonly<{
  id?: string | number;
  href: string;
  text: string;
  startCell: number;
  endCell: number;
  source?: TLogPluginLinkSource;
  data?: unknown;
}>;

export type TLogViewPluginLineMetadata = Readonly<{
  level?: TLogPluginSeverity;
  markers?: readonly TLogViewPluginLineMarker[];
  externalLinks?: readonly TLogViewPluginLineLink[];
  data?: unknown;
}>;

export type TLogParsedOsc8Link = Readonly<{
  href: string;
  text: string;
  startCell: number;
  endCell: number;
}>;

export type TLogViewPluginParseLineContext = Readonly<{
  lineIndex: number;
  absoluteLineIndex: number;
  lineKey: string | number;
  text: string;
  plainText: string;
  osc8Links: readonly TLogParsedOsc8Link[];
}>;

export type TLogViewPluginDecorateSegmentsContext = Readonly<{
  lineIndex: number;
  absoluteLineIndex: number;
  text: string;
  plainText: string;
  metadata: TLogViewPluginLineMetadata | null;
  segments: readonly TLogPluginVisualSegment[];
}>;

export type TLogViewPluginIndexedLine = Readonly<{
  lineIndex: number;
  absoluteLineIndex: number;
  lineKey: string | number;
  text: string;
  plainText: string;
  osc8Links: readonly TLogParsedOsc8Link[];
  externalLinks: readonly TLogViewExternalLink[];
  results: readonly Readonly<{
    pluginName: string;
    metadata: TLogViewPluginLineMetadata;
  }>[];
}>;

export type TLogViewPluginMarkerContext = Readonly<{
  lines: readonly TLogViewPluginIndexedLine[];
  currentMatchLineIndex: number | null;
  totalVisualRows: number;
  estimateVisualRow: (lineIndex: number) => number;
  getMetadata: (
    line: TLogViewPluginIndexedLine,
    pluginName: string,
  ) => TLogViewPluginLineMetadata | null;
}>;

export type TLogViewPluginDensityContext = TLogViewPluginMarkerContext;

export type TLogViewPlugin = Readonly<{
  name: string;
  parseLine?: (ctx: TLogViewPluginParseLineContext) => TLogViewPluginLineMetadata | void;
  decorateSegments?: (
    ctx: TLogViewPluginDecorateSegmentsContext,
  ) => readonly TLogPluginVisualSegment[] | void;
  getMarkers?: (ctx: TLogViewPluginMarkerContext) => readonly TLogViewExternalMarker[] | void;
  getDensityBuckets?: (
    ctx: TLogViewPluginDensityContext,
  ) => readonly TLogMinimapDensityBucket[] | void;
  onLinkAction?: (action: TLogLinkAction) => void;
}>;

export type TLogLevelPluginOptions = Readonly<{
  errorPattern?: RegExp;
  warningPattern?: RegExp;
  infoPattern?: RegExp;
  includeInfo?: boolean;
  bucketCount?: number;
}>;

export type TLogUrlPluginOptions = Readonly<{
  pattern?: RegExp;
  allowFileUrls?: boolean;
}>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringIndexToCell(text: string, index: number): number {
  return textCellWidth(text.slice(0, Math.max(0, index)));
}

export function stripTLogAnsiText(text: string): string {
  return parseTLogAnnotatedText(text).plainText;
}

export function parseTLogAnnotatedText(text: string): Readonly<{
  plainText: string;
  osc8Links: readonly TLogParsedOsc8Link[];
}> {
  const out: string[] = [];
  const links: TLogParsedOsc8Link[] = [];
  let currentHref: string | undefined;
  let activeLink: { href: string; startIndex: number; endIndex: number } | null = null;
  let plainLength = 0;

  const flushLink = (): void => {
    if (!activeLink) return;
    const plainText = out.join("");
    const startCell = stringIndexToCell(plainText, activeLink.startIndex);
    const endCell = stringIndexToCell(plainText, activeLink.endIndex);
    if (endCell > startCell) {
      links.push({
        href: activeLink.href,
        text: plainText.slice(activeLink.startIndex, activeLink.endIndex),
        startCell,
        endCell,
      });
    }
    activeLink = null;
  };

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code !== 0x1b) {
      if (code <= 0x1f || code === 0x7f) continue;
      const ch = text[i]!;
      out.push(ch);
      plainLength += ch.length;
      if (currentHref) {
        if (activeLink?.href === currentHref) activeLink.endIndex += ch.length;
        else
          activeLink = {
            href: currentHref,
            startIndex: plainLength - ch.length,
            endIndex: plainLength,
          };
      } else if (activeLink) {
        flushLink();
      }
      continue;
    }

    const next = text[i + 1];
    if (next === "[") {
      let j = i + 2;
      while (j < text.length) {
        const c = text.charCodeAt(j);
        if ((c >= 48 && c <= 57) || c === 59) {
          j++;
          continue;
        }
        break;
      }
      if (j < text.length && text[j] === "m") i = j;
      continue;
    }

    if (next === "]") {
      let j = i + 2;
      while (j < text.length) {
        const c = text.charCodeAt(j);
        if (c === 0x07) break;
        if (c === 0x1b && text[j + 1] === "\\") {
          j++;
          break;
        }
        j++;
      }
      if (j >= text.length) break;
      const body = text.charCodeAt(j) === 0x07 ? text.slice(i + 2, j) : text.slice(i + 2, j - 1);
      const parts = body.split(";");
      if (parts[0] === "8" && parts.length >= 3) {
        flushLink();
        currentHref = sanitizeTerminalHref(parts.slice(2).join(";")) ?? undefined;
      }
      i = j;
      continue;
    }
  }

  flushLink();
  return {
    plainText: out.join(""),
    osc8Links: links,
  };
}

export function detectTLogUrls(
  text: string,
  options: TLogUrlPluginOptions = {},
): readonly TLogViewPluginLineLink[] {
  const pattern =
    options.pattern ??
    (options.allowFileUrls
      ? /\b(?:https?:\/\/|mailto:|file:\/\/)[^\s<>"'`]+/giu
      : /\b(?:https?:\/\/|mailto:)[^\s<>"'`]+/giu);
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const links: TLogViewPluginLineLink[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) != null) {
    const rawHref = match[0] ?? "";
    if (!rawHref) continue;
    const href = sanitizeTLogDetectedHref(rawHref, options.allowFileUrls === true);
    if (!href) continue;
    const startIndex = match.index;
    const endIndex = startIndex + rawHref.length;
    const startCell = stringIndexToCell(text, startIndex);
    const endCell = stringIndexToCell(text, endIndex);
    if (endCell <= startCell) continue;
    links.push({
      href,
      text: href,
      startCell,
      endCell,
      source: "url",
    });
    if (!rawHref.length) regex.lastIndex += 1;
  }

  return links;
}

function sanitizeTLogDetectedHref(value: string, allowFileUrls: boolean): string | null {
  const href = sanitizeTerminalHref(value);
  if (href || !allowFileUrls) return href;

  const raw = value.trim();
  if (!raw.toLowerCase().startsWith("file://")) return null;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return null;
  }
  return raw;
}

export function detectTLogLevel(
  text: string,
  options: TLogLevelPluginOptions = {},
): TLogPluginSeverity | null {
  const errorPattern = options.errorPattern ?? /\b(?:ERROR|FATAL|ERR)\b/u;
  const warningPattern = options.warningPattern ?? /\b(?:WARN|WARNING)\b/u;
  const infoPattern = options.infoPattern ?? /\bINFO\b/u;
  if (errorPattern.test(text)) return "error";
  if (warningPattern.test(text)) return "warning";
  if (options.includeInfo !== false && infoPattern.test(text)) return "info";
  return null;
}

export function createTLogDensityBucketsFromMarkers(
  markers: readonly TLogViewExternalMarker[],
  totalVisualRows: number,
  bucketCount = 12,
): readonly TLogMinimapDensityBucket[] {
  if (!markers.length || totalVisualRows <= 0 || bucketCount <= 0) return [];
  const normalizedBucketCount = Math.min(Math.max(1, Math.floor(bucketCount)), totalVisualRows);
  const size = Math.max(1, Math.ceil(totalVisualRows / normalizedBucketCount));
  const counts = Array.from({ length: normalizedBucketCount }, () => 0);
  for (const marker of markers) {
    const bucket = Math.max(
      0,
      Math.min(normalizedBucketCount - 1, Math.floor(marker.visualRow / size)),
    );
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  const maxCount = Math.max(...counts, 1);
  return counts
    .map((count, index) => {
      if (count <= 0) return null;
      const startVisualRow = index * size;
      return {
        startVisualRow,
        endVisualRow: Math.min(totalVisualRows - 1, startVisualRow + size - 1),
        value: count / maxCount,
      } satisfies TLogMinimapDensityBucket;
    })
    .filter((bucket): bucket is TLogMinimapDensityBucket => bucket != null);
}

export function getTLogPluginMetadata(
  line: TLogViewPluginIndexedLine,
  pluginName: string,
): TLogViewPluginLineMetadata | null {
  return line.results.find((result) => result.pluginName === pluginName)?.metadata ?? null;
}

export function dispatchTLogPluginLinkAction(
  plugins: readonly TLogViewPlugin[] | undefined,
  action: TLogLinkAction,
): void {
  for (const plugin of plugins ?? []) plugin.onLinkAction?.(action);
}

export function createTLogLevelPlugin(options: TLogLevelPluginOptions = {}): TLogViewPlugin {
  return {
    name: "tlog-levels",
    parseLine(ctx) {
      const level = detectTLogLevel(ctx.plainText, options);
      return level ? { level } : undefined;
    },
    getMarkers(ctx) {
      return ctx.lines.flatMap((line) => {
        const metadata = getTLogPluginMetadata(line, "tlog-levels");
        const level = metadata?.level;
        if (!level || (level === "info" && options.includeInfo === false)) return [];
        return [
          {
            id: `level:${line.absoluteLineIndex}:${level}`,
            absoluteLineIndex: line.absoluteLineIndex,
            lineIndex: line.lineIndex,
            visualRow: ctx.estimateVisualRow(line.lineIndex),
            estimated: true,
            severity: level,
            label: level.toUpperCase(),
            source: "tlog-levels",
          } satisfies TLogViewExternalMarker,
        ];
      });
    },
    getDensityBuckets(ctx) {
      const markers = ctx.lines.flatMap((line) => {
        const metadata = getTLogPluginMetadata(line, "tlog-levels");
        const level = metadata?.level;
        if (!level || (level === "info" && options.includeInfo === false)) return [];
        return [
          {
            id: `density:${line.absoluteLineIndex}:${level}`,
            absoluteLineIndex: line.absoluteLineIndex,
            lineIndex: line.lineIndex,
            visualRow: ctx.estimateVisualRow(line.lineIndex),
            severity: level,
            source: "tlog-levels",
          } satisfies TLogViewExternalMarker,
        ];
      });
      return createTLogDensityBucketsFromMarkers(
        markers,
        ctx.totalVisualRows,
        options.bucketCount ?? 12,
      );
    },
  };
}

export function createTLogOsc8LinkPlugin(): TLogViewPlugin {
  return {
    name: "tlog-osc8-links",
    parseLine(ctx) {
      if (!ctx.osc8Links.length) return;
      const links: TLogViewPluginLineLink[] = [];
      for (let index = 0; index < ctx.osc8Links.length; index++) {
        const link = ctx.osc8Links[index]!;
        const href = sanitizeTerminalHref(link.href);
        if (!href) continue;
        links.push({
          id: `osc8:${ctx.absoluteLineIndex}:${index}:${href}`,
          href,
          text: link.text,
          startCell: link.startCell,
          endCell: link.endCell,
          source: "osc8",
        });
      }
      if (!links.length) return;
      return {
        externalLinks: links,
      };
    },
  };
}

export function createTLogUrlPlugin(options: TLogUrlPluginOptions = {}): TLogViewPlugin {
  return {
    name: "tlog-url-detect",
    parseLine(ctx) {
      const links = detectTLogUrls(ctx.plainText, options);
      return links.length ? { externalLinks: links } : undefined;
    },
  };
}

export function createTLogLinkActionPlugin(options: {
  name: string;
  onAction: (action: TLogLinkAction) => void;
}): TLogViewPlugin {
  return {
    name: options.name,
    onLinkAction: options.onAction,
  };
}

export function toTLogExternalLinkFromVisibleLink(
  link: Pick<
    TLogViewVisibleLink,
    "href" | "text" | "absoluteLineIndex" | "index" | "startCell" | "endCell"
  >,
  idPrefix = "visible",
): TLogViewExternalLink {
  return {
    id: `${idPrefix}:${link.absoluteLineIndex}:${link.startCell}:${link.endCell}:${encodeURIComponent(link.href)}`,
    href: link.href,
    text: link.text,
    absoluteLineIndex: link.absoluteLineIndex,
    lineIndex: link.index,
    startCell: link.startCell,
    endCell: link.endCell,
    source: "plugin",
  };
}

export function createTLogLineMatcherPlugin(options: {
  name: string;
  pattern: RegExp | string;
  severity?: TLogPluginSeverity;
  label?: string;
}): TLogViewPlugin {
  const pattern =
    typeof options.pattern === "string"
      ? new RegExp(escapeRegExp(options.pattern), "u")
      : options.pattern;
  return {
    name: options.name,
    parseLine(ctx) {
      if (!pattern.test(ctx.plainText)) return;
      return {
        markers: [
          {
            id: `${options.name}:${ctx.absoluteLineIndex}`,
            label: options.label,
            severity: options.severity,
          },
        ],
      };
    },
    getMarkers(ctx) {
      return ctx.lines.flatMap((line) => {
        const metadata = getTLogPluginMetadata(line, options.name);
        return (metadata?.markers ?? []).map((marker, index) => ({
          id: String(marker.id ?? `${options.name}:${line.absoluteLineIndex}:${index}`),
          absoluteLineIndex: line.absoluteLineIndex,
          lineIndex: line.lineIndex,
          visualRow: ctx.estimateVisualRow(line.lineIndex),
          estimated: marker.estimated ?? true,
          label: marker.label,
          severity: marker.severity,
          source: options.name,
          data: marker.data,
        }));
      });
    },
  };
}
