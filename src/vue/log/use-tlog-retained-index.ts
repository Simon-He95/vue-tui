import type { Ref } from "vue";
import type { TLogMinimapDensityBucket } from "../components/TLogMinimap.js";
import type { TLogViewHandle } from "../components/TLogView.js";
import type { TLogDataSource } from "./types.js";
import type {
  TLogViewExternalLink,
  TLogViewExternalMarker,
  TLogViewPlugin,
  TLogViewPluginLineMetadata,
} from "./tlog-plugins.js";
import { computed, ref, watch } from "vue";
import {
  createTLogLevelPlugin,
  createTLogOsc8LinkPlugin,
  createTLogUrlPlugin,
  getTLogPluginMetadata,
  parseTLogAnnotatedText,
} from "./tlog-plugins.js";

export type TLogIndexStatus = "idle" | "indexing" | "done" | "error";

export type TLogDiagnosticMarker = TLogViewExternalMarker;
export type TLogIndexedLink = TLogViewExternalLink;

export type TLogRetainedIndexOptions = Readonly<{
  links?: boolean;
  levels?: boolean;
  urls?: boolean;
  budgetMs?: number;
  maxItems?: number;
  bucketCount?: number;
  plugins?: readonly TLogViewPlugin[];
}>;

const DEFAULT_BUDGET_MS = 4;
const DEFAULT_MAX_ITEMS = 10_000;

type ScheduledFrameHandle =
  | { kind: "raf"; id: number }
  | { kind: "timer"; id: ReturnType<typeof setTimeout> };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeBudgetMs(value: number | undefined): number {
  const n = Math.floor(Number(value ?? DEFAULT_BUDGET_MS));
  return Number.isFinite(n) ? Math.max(1, n) : DEFAULT_BUDGET_MS;
}

function normalizeMaxItems(value: number | undefined): number {
  const n = Math.floor(Number(value ?? DEFAULT_MAX_ITEMS));
  return Number.isFinite(n) ? Math.max(1, n) : DEFAULT_MAX_ITEMS;
}

export function useTLogRetainedIndex(
  logView: Ref<TLogViewHandle | null>,
  source: Ref<TLogDataSource>,
  version: Ref<number>,
  options: TLogRetainedIndexOptions = {},
): {
  status: Ref<TLogIndexStatus>;
  links: Ref<readonly TLogIndexedLink[]>;
  diagnostics: Ref<readonly TLogDiagnosticMarker[]>;
  density: Ref<readonly TLogMinimapDensityBucket[]>;
  refresh: () => void;
  cancel: () => void;
} {
  const status = ref<TLogIndexStatus>("idle");
  const links = ref<readonly TLogIndexedLink[]>([]);
  const diagnostics = ref<readonly TLogDiagnosticMarker[]>([]);
  const density = ref<readonly TLogMinimapDensityBucket[]>([]);

  const plugins = computed<readonly TLogViewPlugin[]>(() => {
    const builtins: TLogViewPlugin[] = [];
    if (options.links) builtins.push(createTLogOsc8LinkPlugin());
    if (options.urls) builtins.push(createTLogUrlPlugin());
    if (options.levels) builtins.push(createTLogLevelPlugin({ bucketCount: options.bucketCount }));
    return [...builtins, ...(options.plugins ?? [])];
  });

  let generation = 0;
  let cursor = 0;
  let rafHandle: ScheduledFrameHandle | null = null;
  let indexedLines: Array<{
    lineIndex: number;
    absoluteLineIndex: number;
    lineKey: string | number;
    text: string;
    plainText: string;
    osc8Links: ReturnType<typeof parseTLogAnnotatedText>["osc8Links"];
    externalLinks: TLogIndexedLink[];
    results: Array<{
      pluginName: string;
      metadata: TLogViewPluginLineMetadata;
    }>;
  }> = [];

  function requestFrame(cb: () => void): ScheduledFrameHandle {
    const g = globalThis as any;
    if (
      typeof g.requestAnimationFrame === "function" &&
      typeof g.cancelAnimationFrame === "function"
    ) {
      return { kind: "raf", id: g.requestAnimationFrame(cb) };
    }
    return { kind: "timer", id: setTimeout(cb, 16) };
  }

  function cancelFrame(handle: ScheduledFrameHandle | null): void {
    if (!handle) return;
    if (handle.kind === "raf") {
      (globalThis as any).cancelAnimationFrame?.(handle.id);
      return;
    }
    clearTimeout(handle.id);
  }

  function cancel(): void {
    generation++;
    cursor = 0;
    cancelFrame(rafHandle);
    rafHandle = null;
    if (status.value === "indexing") status.value = "idle";
  }

  function estimateVisualRow(lineIndex: number): number {
    const metrics = logView.value?.getScrollMetrics();
    if (!metrics) return Math.max(0, lineIndex);
    const lineCount = Math.max(1, metrics.lineCount);
    const totalVisualRows = Math.max(metrics.visualRowCount, metrics.viewportRows, lineCount, 1);
    return clamp(
      Math.round((lineIndex / Math.max(1, lineCount - 1)) * Math.max(0, totalVisualRows - 1)),
      0,
      Math.max(0, totalVisualRows - 1),
    );
  }

  function currentMatchLineIndex(): number | null {
    const handle = logView.value;
    if (!handle) return null;
    const current = handle.getSearchState().currentMatchIndex;
    if (current < 0) return null;
    return handle.getSearchMatch(current)?.index ?? null;
  }

  function finalize(generationAtStart: number): void {
    if (generationAtStart !== generation) return;
    const totalVisualRows = Math.max(
      logView.value?.getScrollMetrics().visualRowCount ?? indexedLines.length,
      logView.value?.getScrollMetrics().viewportRows ?? 0,
      indexedLines.length,
      1,
    );
    const markerCtx = {
      lines: indexedLines,
      currentMatchLineIndex: currentMatchLineIndex(),
      totalVisualRows,
      estimateVisualRow,
      getMetadata: getTLogPluginMetadata,
    } as const;

    const nextDiagnostics: TLogDiagnosticMarker[] = [];
    const nextDensity: TLogMinimapDensityBucket[] = [];
    for (const plugin of plugins.value) {
      const markers = plugin.getMarkers?.(markerCtx);
      if (Array.isArray(markers) && markers.length) nextDiagnostics.push(...markers);
      const buckets = plugin.getDensityBuckets?.(markerCtx);
      if (Array.isArray(buckets) && buckets.length) nextDensity.push(...buckets);
    }

    links.value = indexedLines.flatMap((line) => line.externalLinks);
    diagnostics.value = nextDiagnostics;
    density.value = nextDensity;
    status.value = "done";
  }

  function schedule(): void {
    const generationAtStart = generation;
    const sourceValue = source.value;
    const budgetMs = normalizeBudgetMs(options.budgetMs);
    const maxItems = normalizeMaxItems(options.maxItems);
    const lineCount = Math.max(0, Math.floor(Number(sourceValue.lineCount())));
    const firstLineIndex = Math.max(0, Math.floor(Number(sourceValue.firstLineIndex?.() ?? 0)));
    const activePlugins = plugins.value;

    if (!lineCount) {
      links.value = [];
      diagnostics.value = [];
      density.value = [];
      status.value = "done";
      return;
    }

    const runFrame = () => {
      if (generationAtStart !== generation) return;
      const start = Date.now();
      while (cursor < lineCount && Date.now() - start < budgetMs) {
        const lineIndex = cursor++;
        const text = sourceValue.getLine(lineIndex);
        const lineKey = sourceValue.getLineKey?.(lineIndex) ?? `line:${version.value}:${lineIndex}`;
        const parsed = parseTLogAnnotatedText(text);
        const results: Array<{
          pluginName: string;
          metadata: TLogViewPluginLineMetadata;
        }> = [];
        const externalLinks: TLogIndexedLink[] = [];
        const seenLinks = new Set<string>();

        for (const plugin of activePlugins) {
          const metadata = plugin.parseLine?.({
            lineIndex,
            absoluteLineIndex: firstLineIndex + lineIndex,
            lineKey,
            text,
            plainText: parsed.plainText,
            osc8Links: parsed.osc8Links,
          });
          if (!metadata) continue;
          results.push({ pluginName: plugin.name, metadata });
          for (const link of metadata.externalLinks ?? []) {
            const id = String(
              link.id ??
                `${plugin.name}:${firstLineIndex + lineIndex}:${link.startCell}:${link.endCell}:${link.href}`,
            );
            if (seenLinks.has(id) || externalLinks.length >= maxItems) continue;
            seenLinks.add(id);
            externalLinks.push({
              id,
              href: link.href,
              text: link.text,
              absoluteLineIndex: firstLineIndex + lineIndex,
              lineIndex,
              startCell: link.startCell,
              endCell: link.endCell,
              source: link.source ?? "plugin",
              pluginName: plugin.name,
              data: link.data,
            });
          }
        }

        indexedLines.push({
          lineIndex,
          absoluteLineIndex: firstLineIndex + lineIndex,
          lineKey,
          text,
          plainText: parsed.plainText,
          osc8Links: parsed.osc8Links,
          externalLinks,
          results,
        });
      }

      if (cursor >= lineCount) {
        rafHandle = null;
        finalize(generationAtStart);
        return;
      }

      rafHandle = requestFrame(runFrame);
    };

    rafHandle = requestFrame(runFrame);
  }

  function refresh(): void {
    cancel();
    indexedLines = [];
    links.value = [];
    diagnostics.value = [];
    density.value = [];
    cursor = 0;
    status.value = "indexing";
    schedule();
  }

  watch([() => source.value, () => version.value, () => logView.value], refresh, {
    immediate: true,
  });

  return {
    status,
    links,
    diagnostics,
    density,
    refresh,
    cancel,
  };
}
