import type { ComputedRef, PropType } from "vue";
import type { Rect, TerminalEventHandlerMap } from "../../events/manager/types.js";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, inject, ref } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  forEachTextCellSegment,
  sanitizeInlineText,
  sliceByCells,
  spaces,
  textCellWidth,
} from "../utils/text.js";
import { mergeStyle } from "./simple-utils.js";

export type TCandlestickDatum = Readonly<{
  open: number;
  high: number;
  low: number;
  close: number;
}>;

const DEFAULT_HEATMAP_LEVEL_STYLES: readonly Style[] = Object.freeze([
  Object.freeze({ fg: "#9be9a8" }),
  Object.freeze({ fg: "#40c463" }),
  Object.freeze({ fg: "#30a14e" }),
  Object.freeze({ fg: "#216e39" }),
]);

const DEFAULT_PIE_SEGMENT_STYLES: readonly Style[] = Object.freeze([
  Object.freeze({ fg: "cyanBright" }),
  Object.freeze({ fg: "magentaBright" }),
  Object.freeze({ fg: "yellowBright" }),
  Object.freeze({ fg: "greenBright" }),
  Object.freeze({ fg: "blueBright" }),
  Object.freeze({ fg: "redBright" }),
]);

const TERMINAL_CELL_HEIGHT_TO_WIDTH = 1.8;
const PIE_QUADRANT_BLOCKS: readonly string[] = Object.freeze([
  " ",
  "▘",
  "▝",
  "▀",
  "▖",
  "▌",
  "▞",
  "▛",
  "▗",
  "▚",
  "▐",
  "▜",
  "▄",
  "▙",
  "▟",
  "█",
]);
const PIE_CELL_SAMPLES = Object.freeze([
  Object.freeze({ dx: 0.25, dy: 0.25, bit: 1 }),
  Object.freeze({ dx: 0.75, dy: 0.25, bit: 2 }),
  Object.freeze({ dx: 0.25, dy: 0.75, bit: 4 }),
  Object.freeze({ dx: 0.75, dy: 0.75, bit: 8 }),
]);

type ChartCell = Readonly<{
  x: number;
  y: number;
  ch: string;
  style: Style;
}>;

type ChartSurface = Readonly<{
  width: number;
  height: number;
  clearStyle: Style;
  rows: readonly (readonly ChartCell[])[];
}>;

type PointerCell = Readonly<{
  x: number;
  y: number;
}>;

type AxisLayout = Readonly<{
  enabled: boolean;
  plotX: number;
  plotY: number;
  plotW: number;
  plotH: number;
  axisX: number;
  axisY: number;
  minLabel: string;
  maxLabel: string;
}>;

type ChartRenderContext = Readonly<{
  fullRect: ComputedRef<Rect>;
  absRect: ComputedRef<Rect>;
}>;

type ChartRenderOptions = Readonly<{
  handlers?: (context: ChartRenderContext) => TerminalEventHandlerMap;
  selectable?: boolean;
}>;

type ChartSize = Readonly<{
  width: number;
  height: number;
}>;

type ContributionLayout = Readonly<{
  rowCount: number;
  gap: number;
  columnWidth: number;
  columns: number;
  width: number;
  height: number;
  startIndex: number;
  maxValue: number;
}>;

type ContributionHover = Readonly<{
  x: number;
  y: number;
  index: number;
  value: number;
  label: string;
}>;

type CandlestickHover = Readonly<{
  x: number;
  y: number;
  index: number;
  label: string;
  value: number;
  open: number;
  high: number;
  low: number;
  close: number;
}>;

type LineHover = Readonly<{
  x: number;
  y: number;
  index: number;
  label: string;
  value: number;
}>;

type LinePoint = Readonly<{
  value: number;
  originalIndex: number;
}>;

type LineRun = Readonly<{
  points: readonly LinePoint[];
}>;

type LineBucket = Readonly<{
  x: number;
  minValue: number;
  maxValue: number;
  firstIndex: number;
  firstValue: number;
  lastIndex: number;
  lastValue: number;
}>;

type LineSegmentPoint = Readonly<{
  x: number;
  value: number;
}>;

type LineLayout = Readonly<{
  width: number;
  height: number;
  layout: AxisLayout;
  runs: readonly LineRun[];
  sourceLength: number;
  min: number;
  max: number;
}>;

type CandlestickLayout = Readonly<{
  width: number;
  height: number;
  layout: AxisLayout;
  visibleCandles: readonly TCandlestickDatum[];
  startIndex: number;
  candleOffsetX: number;
  min: number;
  max: number;
}>;

type CandlestickValues = Readonly<{
  open: number;
  high: number;
  low: number;
  close: number;
}>;

function cellCount(value: number | undefined, fallback: number): number {
  const n = Math.floor(Number(value ?? fallback));
  return Number.isFinite(n) ? Math.max(0, n) : Math.max(0, Math.floor(fallback));
}

function finiteRange(values: readonly number[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const raw of values) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Number.POSITIVE_INFINITY ? null : { min, max };
}

function maxPositive(values: readonly number[]): number {
  let max = 0;
  for (const raw of values) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

function domainFromValues(
  values: readonly number[],
  minValue: number | undefined,
  maxValue: number | undefined,
): { min: number; max: number } {
  const range = finiteRange(values);
  const fallbackMin = range?.min ?? 0;
  const fallbackMax = range?.max ?? 0;
  const hasMin = Number.isFinite(Number(minValue));
  const hasMax = Number.isFinite(Number(maxValue));
  const min = hasMin ? Number(minValue) : fallbackMin;
  const max = hasMax ? Number(maxValue) : fallbackMax;
  if (max < min) {
    if (hasMin && !hasMax) return { min, max: min };
    if (!hasMin && hasMax) return { min: max, max };
  }
  return max >= min ? { min, max } : { min: max, max: min };
}

function normalizeCandlestick(candle: TCandlestickDatum): CandlestickValues | null {
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }
  return { open, high, low, close };
}

function candlestickDomainValues(candles: readonly TCandlestickDatum[]): number[] {
  return candles.flatMap((candle) => {
    const values = normalizeCandlestick(candle);
    return values ? [values.open, values.low, values.high, values.close] : [];
  });
}

function finiteLineRuns(values: readonly number[]): LineRun[] {
  const runs: LineRun[] = [];
  let points: LinePoint[] = [];
  for (let originalIndex = 0; originalIndex < values.length; originalIndex++) {
    const raw = values[originalIndex];
    const value = Number(raw);
    if (Number.isFinite(value)) {
      points.push({ value, originalIndex });
      continue;
    }
    if (points.length > 0) {
      runs.push({ points });
      points = [];
    }
  }
  if (points.length > 0) runs.push({ points });
  return runs;
}

function valueToY(value: number, min: number, max: number, height: number): number {
  if (height <= 1) return 0;
  if (max === min) {
    if (value < min) return height - 1;
    if (value > max) return 0;
    return Math.floor((height - 1) / 2);
  }
  const scale = Math.max(Math.abs(min), Math.abs(max), Math.abs(value), 1);
  const scaledMin = min / scale;
  const scaledMax = max / scale;
  const ratio = (value / scale - scaledMin) / (scaledMax - scaledMin);
  return Math.max(0, Math.min(height - 1, Math.round((1 - ratio) * (height - 1))));
}

function yToValue(y: number, min: number, max: number, height: number): number {
  if (height <= 1 || max === min) return max;
  const ratio = 1 - Math.max(0, Math.min(height - 1, y)) / (height - 1);
  const scale = Math.max(Math.abs(min), Math.abs(max), 1);
  const scaledMin = min / scale;
  const scaledMax = max / scale;
  return (scaledMin + ratio * (scaledMax - scaledMin)) * scale;
}

function emptyChartRows(height: number): ChartCell[][] {
  return Array.from({ length: height }, () => []);
}

function samplePositionAtX(x: number, width: number, sourceLength: number): number {
  if (width <= 1 || sourceLength <= 1) return 0;
  return (x / (width - 1)) * (sourceLength - 1);
}

function lineXForOriginalIndex(
  originalIndex: number,
  plotX: number,
  plotW: number,
  sourceLength: number,
): number {
  if (plotW <= 1 || sourceLength <= 1) return plotX;
  return plotX + Math.round((originalIndex / (sourceLength - 1)) * (plotW - 1));
}

function lineBucketIndexRange(
  plotX: number,
  plotW: number,
  sourceLength: number,
): { startIndex: number; endIndex: number } {
  if (sourceLength <= 0) return { startIndex: 0, endIndex: -1 };
  if (plotW <= 1 || sourceLength <= 1) return { startIndex: 0, endIndex: sourceLength - 1 };

  const scale = (sourceLength - 1) / (plotW - 1);
  const start = plotX <= 0 ? 0 : Math.ceil((plotX - 0.5) * scale);
  const end = plotX >= plotW - 1 ? sourceLength - 1 : Math.ceil((plotX + 0.5) * scale) - 1;
  const startIndex = Math.max(0, Math.min(sourceLength - 1, start));
  const endIndex = Math.max(-1, Math.min(sourceLength - 1, end));
  return endIndex < startIndex ? { startIndex: 0, endIndex: -1 } : { startIndex, endIndex };
}

function lowerBoundLinePoint(points: readonly LinePoint[], position: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid]!.originalIndex < position) low = mid + 1;
    else high = mid;
  }
  return low;
}

function lineValueAtPosition(points: readonly LinePoint[], position: number): number | null {
  if (!points.length) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (position < first.originalIndex || position > last.originalIndex) return null;
  if (points.length === 1) return first.value;

  const index = Math.min(Math.max(1, lowerBoundLinePoint(points, position)), points.length - 1);
  const previous = points[index - 1]!;
  const current = points[index]!;
  const span = current.originalIndex - previous.originalIndex;
  if (span <= 0) return current.value;
  const ratio = (position - previous.originalIndex) / span;
  return previous.value * (1 - ratio) + current.value * ratio;
}

function lowerBoundLineRun(runs: readonly LineRun[], position: number): number {
  let low = 0;
  let high = runs.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const points = runs[mid]!.points;
    if (points[points.length - 1]!.originalIndex < position) low = mid + 1;
    else high = mid;
  }
  return low;
}

function lineRunAtPosition(runs: readonly LineRun[], position: number): LineRun | null {
  const run = runs[lowerBoundLineRun(runs, position)];
  if (!run) return null;
  const first = run.points[0]!;
  const last = run.points[run.points.length - 1]!;
  return position >= first.originalIndex && position <= last.originalIndex ? run : null;
}

function nearestLinePoint(points: readonly LinePoint[], position: number): LinePoint | null {
  if (!points.length) return null;
  const index = lowerBoundLinePoint(points, position);
  if (index <= 0) return points[0]!;
  if (index >= points.length) return points[points.length - 1]!;
  const previous = points[index - 1]!;
  const current = points[index]!;
  return position - previous.originalIndex <= current.originalIndex - position ? previous : current;
}

function nearestLinePointAtPlotX(
  runs: readonly LineRun[],
  plotX: number,
  plotW: number,
  sourceLength: number,
  position: number,
): LinePoint | null {
  const { startIndex, endIndex } = lineBucketIndexRange(plotX, plotW, sourceLength);
  if (endIndex < startIndex) return null;

  let best: LinePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let runIndex = lowerBoundLineRun(runs, startIndex); runIndex < runs.length; runIndex++) {
    const points = runs[runIndex]!.points;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (first.originalIndex > endIndex) break;
    if (last.originalIndex < startIndex) continue;

    for (
      let pointIndex = lowerBoundLinePoint(points, startIndex);
      pointIndex < points.length;
      pointIndex++
    ) {
      const point = points[pointIndex]!;
      if (point.originalIndex > endIndex) break;
      if (lineXForOriginalIndex(point.originalIndex, 0, plotW, sourceLength) !== plotX) continue;
      const distance = Math.abs(point.originalIndex - position);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function nearestLinePointInRuns(
  runs: readonly LineRun[],
  position: number,
  plotX: number,
  plotW: number,
  sourceLength: number,
): LinePoint | null {
  const run = lineRunAtPosition(runs, position);
  if (run && run.points.length > 1) return nearestLinePoint(run.points, position);

  return nearestLinePointAtPlotX(runs, plotX, plotW, sourceLength, position);
}

function lineBucketsForRun(
  points: readonly LinePoint[],
  plotW: number,
  sourceLength: number,
): LineBucket[] {
  const buckets: LineBucket[] = [];
  let current: {
    x: number;
    minValue: number;
    maxValue: number;
    firstIndex: number;
    firstValue: number;
    lastIndex: number;
    lastValue: number;
  } | null = null;
  for (const point of points) {
    const x = lineXForOriginalIndex(point.originalIndex, 0, plotW, sourceLength);
    if (x < 0 || x >= plotW) continue;
    if (!current || current.x !== x) {
      if (current) buckets.push(current);
      current = {
        x,
        minValue: point.value,
        maxValue: point.value,
        firstIndex: point.originalIndex,
        firstValue: point.value,
        lastIndex: point.originalIndex,
        lastValue: point.value,
      };
      continue;
    }
    if (point.value < current.minValue) current.minValue = point.value;
    if (point.value > current.maxValue) current.maxValue = point.value;
    current.lastIndex = point.originalIndex;
    current.lastValue = point.value;
  }
  if (current) buckets.push(current);
  return buckets;
}

function lineBucketRepresentativeValue(
  points: readonly LinePoint[],
  bucket: LineBucket,
  plotW: number,
  sourceLength: number,
): number {
  const position = samplePositionAtX(bucket.x, plotW, sourceLength);
  if (position <= bucket.firstIndex) return bucket.firstValue;
  if (position >= bucket.lastIndex) return bucket.lastValue;
  return lineValueAtPosition(points, position) ?? bucket.lastValue;
}

function lineSegmentPointsForRun(
  points: readonly LinePoint[],
  buckets: readonly LineBucket[],
  plotW: number,
  sourceLength: number,
): LineSegmentPoint[] {
  const valuesByX = new Map<number, number>();
  const first = points[0];
  const last = points[points.length - 1];

  if (first && last) {
    if (plotW <= 1 || sourceLength <= 1) {
      const value = lineValueAtPosition(points, 0);
      if (value != null) valuesByX.set(0, value);
    } else {
      const scale = (sourceLength - 1) / (plotW - 1);
      const startX = Math.max(0, Math.ceil(first.originalIndex / scale));
      const endX = Math.min(plotW - 1, Math.floor(last.originalIndex / scale));
      for (let x = startX; x <= endX; x++) {
        const value = lineValueAtPosition(points, samplePositionAtX(x, plotW, sourceLength));
        if (value != null) valuesByX.set(x, value);
      }
    }
  }

  for (const bucket of buckets) {
    if (!valuesByX.has(bucket.x)) {
      valuesByX.set(bucket.x, lineBucketRepresentativeValue(points, bucket, plotW, sourceLength));
    }
  }

  return Array.from(valuesByX, ([x, value]) => ({ x, value })).sort((a, b) => a.x - b.x);
}

function putLineGlyph(
  cells: ChartCell[],
  x: number,
  y: number,
  ch: string,
  style: Style,
  width: number,
  height: number,
  occupied?: Set<number>,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  cells.push({ x, y, ch, style });
  occupied?.add(y * width + x);
}

function pushLineBucketExtrema(
  cells: ChartCell[],
  bucket: LineBucket,
  layout: AxisLayout,
  min: number,
  max: number,
  style: Style,
  width: number,
  height: number,
  occupied: Set<number>,
): void {
  const x = layout.plotX + bucket.x;
  const minY = valueToY(bucket.minValue, min, max, layout.plotH);
  const maxY = valueToY(bucket.maxValue, min, max, layout.plotH);
  const top = Math.min(minY, maxY);
  const bottom = Math.max(minY, maxY);
  if (top === bottom) {
    const y = layout.plotY + top;
    if (!occupied.has(y * width + x))
      putLineGlyph(cells, x, y, "●", style, width, height, occupied);
    return;
  }

  for (let y = top; y <= bottom; y++) {
    const cellY = layout.plotY + y;
    if (!occupied.has(cellY * width + x)) {
      putLineGlyph(cells, x, cellY, "│", style, width, height, occupied);
    }
  }
}

function drawSteppedLineSegment(
  cells: ChartCell[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  style: Style,
  width: number,
  height: number,
  occupied?: Set<number>,
): void {
  if (toY === fromY) {
    for (let x = fromX + 1; x <= toX; x++) {
      putLineGlyph(cells, x, toY, "─", style, width, height, occupied);
    }
    return;
  }

  const rising = toY < fromY;
  for (let x = fromX + 1; x < toX; x++) {
    putLineGlyph(cells, x, fromY, "─", style, width, height, occupied);
  }
  putLineGlyph(cells, toX, fromY, rising ? "╯" : "╮", style, width, height, occupied);
  const top = Math.min(fromY, toY);
  const bottom = Math.max(fromY, toY);
  for (let y = top + 1; y < bottom; y++) {
    putLineGlyph(cells, toX, y, "│", style, width, height, occupied);
  }
  putLineGlyph(cells, toX, toY, rising ? "╭" : "╰", style, width, height, occupied);
}

function chartGlyph(value: string, fallback: string): string {
  const text = sliceByCells(sanitizeInlineText(value || fallback), 1);
  return text && textCellWidth(text) === 1 ? text : fallback;
}

function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Number.isInteger(value)) return String(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs > 0 && abs < 0.01) return Number(value.toPrecision(2)).toString();
  return Number(value.toFixed(2)).toString();
}

function fitLabel(value: string, width: number): string {
  return sliceByCells(sanitizeInlineText(value), Math.max(0, width));
}

function pushTextCells(
  cells: ChartCell[],
  x: number,
  y: number,
  text: string,
  style: Style,
  maxWidth = Number.POSITIVE_INFINITY,
): void {
  const clipped = fitLabel(text, maxWidth);
  let cursor = x;
  forEachTextCellSegment(clipped, (segment) => {
    if (segment.cells <= 0) return;
    cells.push({ x: cursor, y, ch: segment.text, style });
    cursor += segment.cells;
  });
}

function chooseTooltipPlacement(
  cells: readonly ChartCell[],
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
  textWidth: number,
  preferredY?: number,
  bounds?: Rect,
): { x: number; y: number } {
  const boundsX = Math.max(0, Math.min(width, Math.floor(bounds?.x ?? 0)));
  const boundsY = Math.max(0, Math.min(height, Math.floor(bounds?.y ?? 0)));
  const boundsRight = Math.max(
    boundsX,
    Math.min(width, Math.floor((bounds?.x ?? 0) + (bounds?.w ?? width))),
  );
  const boundsBottom = Math.max(
    boundsY,
    Math.min(height, Math.floor((bounds?.y ?? 0) + (bounds?.h ?? height))),
  );
  const availableW = boundsRight - boundsX;
  if (availableW <= 0 || boundsBottom <= boundsY) return { x: 0, y: 0 };

  const tooltipWidth = Math.min(availableW, Math.max(1, textWidth));
  const clampX = (x: number) =>
    Math.max(boundsX, Math.min(x, Math.max(boundsX, boundsRight - tooltipWidth)));
  const xCandidates = [anchorX + 2, anchorX - tooltipWidth - 2, boundsX, boundsRight - tooltipWidth]
    .map(clampX)
    .filter((x, index, values) => values.indexOf(x) === index);
  const yCandidates = [
    preferredY,
    anchorY > 0 ? anchorY - 1 : anchorY + 1,
    anchorY + 1,
    anchorY - 2,
    anchorY + 2,
    boundsY,
    boundsBottom - 1,
  ].filter((y): y is number => y != null && y >= boundsY && y < boundsBottom);

  let best = { x: xCandidates[0] ?? 0, y: yCandidates[0] ?? 0, score: Number.POSITIVE_INFINITY };
  for (const y of yCandidates) {
    for (const x of xCandidates) {
      let overlap = 0;
      for (const cell of cells) {
        if (cell.y !== y) continue;
        const cellW = Math.max(1, textCellWidth(cell.ch));
        if (cell.x < x + tooltipWidth && cell.x + cellW > x) overlap++;
      }
      const score =
        overlap * 1000 + Math.abs(y - anchorY) + Math.abs(x - anchorX) / Math.max(1, availableW);
      if (score < best.score) best = { x, y, score };
    }
  }
  return { x: best.x, y: best.y };
}

function useChartVisibleRect(
  props: { x: number; y: number },
  size: ComputedRef<ChartSize>,
): ComputedRef<Rect> {
  const layout = useLayout();
  return computed(() => {
    const full = translateRect(
      {
        x: Math.floor(props.x),
        y: Math.floor(props.y),
        w: size.value.width,
        h: size.value.height,
      },
      layout.originX,
      layout.originY,
    );
    const abs = layout.clipRect ? intersectRect(full, layout.clipRect) : full;
    if (!abs) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: abs.x - full.x, y: abs.y - full.y, w: abs.w, h: abs.h };
  });
}

function resolveAxisLayout(
  width: number,
  height: number,
  min: number,
  max: number,
  showAxes: boolean,
): AxisLayout {
  if (!showAxes || width < 12 || height < 5) {
    return {
      enabled: false,
      plotX: 0,
      plotY: 0,
      plotW: width,
      plotH: height,
      axisX: -1,
      axisY: height,
      minLabel: formatChartValue(min),
      maxLabel: formatChartValue(max),
    };
  }

  const minLabel = fitLabel(formatChartValue(min), 7);
  const maxLabel = fitLabel(formatChartValue(max), 7);
  const labelW = Math.max(2, textCellWidth(minLabel), textCellWidth(maxLabel));
  const plotX = labelW + 1;
  const plotY = 0;
  const plotW = Math.max(0, width - plotX);
  const plotH = Math.max(0, height - 2);
  if (plotW < 2 || plotH < 2) {
    return {
      enabled: false,
      plotX: 0,
      plotY: 0,
      plotW: width,
      plotH: height,
      axisX: -1,
      axisY: height,
      minLabel,
      maxLabel,
    };
  }

  return {
    enabled: true,
    plotX,
    plotY,
    plotW,
    plotH,
    axisX: plotX - 1,
    axisY: plotY + plotH,
    minLabel,
    maxLabel,
  };
}

function pushAxes(
  cells: ChartCell[],
  layout: AxisLayout,
  style: Style,
  labelStyle: Style,
  xLabel: string,
  yLabel: string,
  startLabel: string,
  endLabel: string,
): void {
  if (!layout.enabled) return;
  pushTextCells(cells, 0, layout.plotY, layout.maxLabel, labelStyle, layout.axisX);
  pushTextCells(
    cells,
    0,
    Math.max(layout.plotY, layout.axisY - 1),
    layout.minLabel,
    labelStyle,
    layout.axisX,
  );
  for (let y = layout.plotY; y < layout.axisY; y++) {
    cells.push({ x: layout.axisX, y, ch: "│", style });
  }
  cells.push({ x: layout.axisX, y: layout.axisY, ch: "└", style });
  for (let x = layout.plotX; x < layout.plotX + layout.plotW; x++) {
    cells.push({ x, y: layout.axisY, ch: "─", style });
  }
  if (yLabel) pushTextCells(cells, layout.plotX, layout.plotY, yLabel, labelStyle, layout.plotW);
  if (xLabel) {
    const xLabelW = textCellWidth(sanitizeInlineText(xLabel));
    const x = layout.plotX + Math.max(0, Math.floor((layout.plotW - xLabelW) / 2));
    pushTextCells(cells, x, layout.axisY + 1, xLabel, labelStyle, layout.plotW);
  } else {
    pushTextCells(cells, layout.plotX, layout.axisY + 1, startLabel, labelStyle, layout.plotW);
    const endW = textCellWidth(sanitizeInlineText(endLabel));
    const endX = layout.plotX + Math.max(0, layout.plotW - endW);
    pushTextCells(cells, endX, layout.axisY + 1, endLabel, labelStyle, layout.plotW);
  }
}

function createSurface(
  width: number,
  height: number,
  clearStyle: Style,
  cells: readonly ChartCell[],
): ChartSurface {
  const rows = emptyChartRows(height);
  for (const cell of cells) {
    if (!Number.isFinite(cell.x) || !Number.isFinite(cell.y)) continue;
    if (cell.y < 0 || cell.y >= height || cell.x < 0 || cell.x >= width) continue;
    rows[cell.y]!.push(cell);
  }
  return { width, height, clearStyle, rows };
}

function useChartRender(
  props: {
    x: number;
    y: number;
    zIndex: number;
  },
  surface: ComputedRef<ChartSurface>,
  options?: ChartRenderOptions,
): () => ReturnType<typeof h> {
  const { terminal } = useTerminal();
  const layout = useLayout();
  const { visible, rootProps } = useVisibility();
  const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
  const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

  const fullRect = computed<Rect>(() =>
    translateRect(
      {
        x: Math.floor(props.x),
        y: Math.floor(props.y),
        w: surface.value.width,
        h: surface.value.height,
      },
      layout.originX,
      layout.originY,
    ),
  );

  const absRect = computed<Rect>(() => {
    const translated = fullRect.value;
    if (!layout.clipRect) return translated;
    return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
  });

  const dirtyRowsHint = computed<readonly number[]>(() => {
    if (!visible.value) return [];
    const r = absRect.value;
    if (r.w <= 0 || r.h <= 0) return [];
    return Array.from({ length: r.h }, (_, index) => r.y + index);
  });

  if (options?.handlers) {
    const handlers = options.handlers({ fullRect, absRect });
    useTerminalNode(() => ({
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      zIndex: eventZ.value,
      visible: visible.value,
      selectable: options.selectable ?? false,
      handlers,
    }));
  }

  useRenderNode(() => ({
    zIndex: props.zIndex,
    rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
    dirtyRowsHint: dirtyRowsHint.value,
    deps: [visible.value, absRect.value, fullRect.value, surface.value],
    paint: (dirtyRows) => {
      if (!visible.value) return;
      const r = absRect.value;
      if (r.w <= 0 || r.h <= 0) return;

      const full = fullRect.value;
      const current = surface.value;
      const blank = spaces(r.w);
      const paintRow = (y: number) => {
        if (y < r.y || y >= r.y + r.h) return;
        const localY = y - full.y;
        if (localY < 0 || localY >= current.height) return;

        terminal.write(blank, { x: r.x, y, style: current.clearStyle });
        for (const cell of current.rows[localY] ?? []) {
          const x = full.x + cell.x;
          const cellWidth = Math.max(1, textCellWidth(cell.ch));
          if (x < r.x || x + cellWidth > r.x + r.w) continue;
          terminal.put(x, y, cell.ch, cell.style);
        }
      };

      if (!dirtyRows) {
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
        return;
      }

      for (const y of dirtyRows) paintRow(y);
    },
  }));

  return () => h("span", rootProps);
}

function positiveHeatmapStyle(value: number, max: number, styles: readonly Style[]): Style {
  if (!styles.length) return {};
  if (max <= 0) return styles[0] ?? {};
  const ratio = Math.max(0, Math.min(1, value / max));
  const index = Math.max(0, Math.min(styles.length - 1, Math.ceil(ratio * styles.length) - 1));
  return styles[index] ?? {};
}

export const TContributionGraph = defineComponent({
  name: "TContributionGraph",
  props: {
    /** Left position in terminal cells. */
    x: { type: Number, required: true },
    /** Top position in terminal cells. */
    y: { type: Number, required: true },
    /** Width in terminal cells. Defaults to the rendered graph width. */
    w: { type: Number, default: undefined },
    /** Height in terminal cells. Defaults to the row count plus a tooltip row when tooltips are enabled. */
    h: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    /** Numeric samples rendered column-major from top to bottom. */
    values: { type: Array as PropType<readonly number[]>, required: true },
    /** Number of rows in each heatmap column. */
    rows: { type: Number, default: 7 },
    /** Number of columns to render. Defaults to enough columns for the values. */
    columns: { type: Number, default: undefined },
    /** Maximum sample value used for level mapping. Defaults to the largest positive value. */
    max: { type: Number, default: undefined },
    /** Labels aligned with values and shown in hover tooltips. */
    labels: { type: Array as PropType<readonly string[]>, default: undefined },
    /** Unit appended to hover tooltip values. */
    unit: { type: String, default: "" },
    /** Whether pointer hover shows a value tooltip. */
    showTooltip: { type: Boolean, default: true },
    /** Empty cells and surrounding clear area style. */
    emptyStyle: {
      type: Object as PropType<Style>,
      default: () => ({ fg: "blackBright", dim: true }),
    },
    /** Positive value styles ordered from low to high intensity. */
    levelStyles: {
      type: Array as PropType<readonly Style[]>,
      default: () => DEFAULT_HEATMAP_LEVEL_STYLES,
    },
    /** Glyph used for each heatmap cell. */
    cell: { type: String, default: "■" },
    /** Horizontal gap between columns in terminal cells. */
    gap: { type: Number, default: 1 },
    /** Style merged onto the currently hovered heatmap cell. */
    hoverStyle: { type: Object as PropType<Style>, default: () => ({}) },
    /** Style used for hover tooltip text. */
    tooltipStyle: { type: Object as PropType<Style>, default: () => ({ fg: "whiteBright" }) },
    style: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const hoverPointer = ref<PointerCell | null>(null);

    const graphLayout = computed<ContributionLayout>(() => {
      const rowCount = cellCount(props.rows, 7);
      if (rowCount <= 0) {
        return {
          rowCount,
          gap: 0,
          columnWidth: 1,
          columns: 0,
          width: 0,
          height: 0,
          startIndex: 0,
          maxValue: 0,
        };
      }

      const gap = cellCount(props.gap, 1);
      const dataColumns = Math.ceil(props.values.length / rowCount);
      const requestedColumns = props.columns == null ? dataColumns : cellCount(props.columns, 0);
      const columnWidth = 1 + gap;
      const maxColumnsFromWidth =
        props.w == null
          ? requestedColumns
          : Math.floor((cellCount(props.w, 0) + gap) / columnWidth);
      const columns = Math.max(0, Math.min(requestedColumns, maxColumnsFromWidth));
      const width =
        props.w == null ? Math.max(0, columns * columnWidth - gap) : cellCount(props.w, 0);
      const height =
        props.h == null ? rowCount + (props.showTooltip ? 1 : 0) : cellCount(props.h, rowCount);
      const maxValue =
        props.max == null ? maxPositive(props.values) : Math.max(0, Number(props.max) || 0);
      const startIndex = Math.max(0, (dataColumns - columns) * rowCount);
      return { rowCount, gap, columnWidth, columns, width, height, startIndex, maxValue };
    });
    const visibleRect = useChartVisibleRect(props, graphLayout);

    function hitCell(localX: number, localY: number): ContributionHover | null {
      const current = graphLayout.value;
      if (current.width <= 0 || current.height <= 0 || current.columns <= 0) return null;
      const graphHeight = Math.min(current.rowCount, current.height);
      if (localX < 0 || localX >= current.width || localY < 0 || localY >= graphHeight) return null;

      const col = Math.floor(localX / current.columnWidth);
      const cellX = col * current.columnWidth;
      if (col < 0 || col >= current.columns) return null;
      if (localX !== cellX) return null;

      const index = current.startIndex + col * current.rowCount + localY;
      if (index < 0 || index >= props.values.length) return null;
      const value = Number(props.values[index]);
      if (!Number.isFinite(value)) return null;
      const label = props.labels?.[index] ?? `#${index + 1}`;
      return { x: cellX, y: localY, index, value, label };
    }

    const surface = computed<ChartSurface>(() => {
      const current = graphLayout.value;
      if (current.rowCount <= 0) return createSurface(0, 0, baseStyle.value, []);

      const clearStyle = mergeStyle(baseStyle.value, props.emptyStyle);
      const levelStyles = props.levelStyles.map((style) => mergeStyle(baseStyle.value, style));
      const cells: ChartCell[] = [];
      const glyph = chartGlyph(props.cell, "■");
      const pointer = hoverPointer.value;
      const hovered = props.showTooltip && pointer ? hitCell(pointer.x, pointer.y) : null;

      for (let col = 0; col < current.columns; col++) {
        const cellX = col * current.columnWidth;
        for (let row = 0; row < current.rowCount && row < current.height; row++) {
          const index = current.startIndex + col * current.rowCount + row;
          const value = Number(props.values[index] ?? 0);
          const positive = Number.isFinite(value) && value > 0;
          const baseCellStyle = positive
            ? levelStyles.length
              ? positiveHeatmapStyle(value, current.maxValue, levelStyles)
              : baseStyle.value
            : clearStyle;
          const style =
            hovered?.index === index ? mergeStyle(baseCellStyle, props.hoverStyle) : baseCellStyle;
          cells.push({ x: cellX, y: row, ch: glyph, style });
        }
      }

      const visible = visibleRect.value;
      if (
        props.showTooltip &&
        hovered &&
        current.width > 0 &&
        current.height > 0 &&
        visible.w > 0 &&
        visible.h > 0
      ) {
        const unit = sanitizeInlineText(props.unit);
        const value = unit
          ? `${formatChartValue(hovered.value)} ${unit}`
          : formatChartValue(hovered.value);
        const text = `${sanitizeInlineText(hovered.label)} ${value}`;
        const textWidth = textCellWidth(text);
        const graphHeight = Math.min(current.rowCount, current.height);
        const placement = chooseTooltipPlacement(
          cells,
          current.width,
          current.height,
          hovered.x,
          hovered.y,
          textWidth,
          current.height > graphHeight ? graphHeight : undefined,
          visible,
        );
        pushTextCells(
          cells,
          placement.x,
          placement.y,
          text,
          mergeStyle(baseStyle.value, props.tooltipStyle),
          visible.x + visible.w - placement.x,
        );
      }

      return createSurface(current.width, current.height, clearStyle, cells);
    });

    return useChartRender(props, surface, {
      handlers: ({ fullRect }) => ({
        pointermove: (event) => {
          if (!props.showTooltip) {
            if (hoverPointer.value != null) hoverPointer.value = null;
            return;
          }
          const next = {
            x: Math.floor(event.cellX - fullRect.value.x),
            y: Math.floor(event.cellY - fullRect.value.y),
          };
          const current = hoverPointer.value;
          if (!current || current.x !== next.x || current.y !== next.y) hoverPointer.value = next;
        },
        pointerleave: () => {
          if (hoverPointer.value != null) hoverPointer.value = null;
        },
      }),
    });
  },
});

export const TLineChart = defineComponent({
  name: "TLineChart",
  props: {
    /** Left position in terminal cells. */
    x: { type: Number, required: true },
    /** Top position in terminal cells. */
    y: { type: Number, required: true },
    /** Width in terminal cells. */
    w: { type: Number, required: true },
    /** Height in terminal cells. */
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    /** Numeric samples rendered across the chart width. */
    values: { type: Array as PropType<readonly number[]>, required: true },
    /** Labels aligned with values and shown in hover tooltips. */
    labels: { type: Array as PropType<readonly string[]>, default: undefined },
    /** Unit appended to hover y values. */
    unit: { type: String, default: "" },
    /** Lower domain bound. Defaults to the smallest sample. */
    min: { type: Number, default: undefined },
    /** Upper domain bound. Defaults to the largest sample. */
    max: { type: Number, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    /** Style used for line glyphs. */
    lineStyle: { type: Object as PropType<Style>, default: () => ({ fg: "cyanBright" }) },
    /** Whether to render axes and domain labels when there is enough space. */
    showAxes: { type: Boolean, default: true },
    /** Style used for axis lines. */
    axisStyle: { type: Object as PropType<Style>, default: () => ({ fg: "white", dim: true }) },
    /** Style used for axis labels. */
    labelStyle: { type: Object as PropType<Style>, default: () => ({ fg: "whiteBright" }) },
    /** Label centered under the x axis. */
    xLabel: { type: String, default: "" },
    /** Label rendered at the top of the plot area. */
    yLabel: { type: String, default: "" },
    /** Left endpoint label for the x axis when xLabel is empty. */
    startLabel: { type: String, default: "" },
    /** Right endpoint label for the x axis when xLabel is empty. */
    endLabel: { type: String, default: "" },
    /** Whether pointer hover shows point values. */
    showTooltip: { type: Boolean, default: true },
    /** Style merged onto the currently hovered point. */
    hoverStyle: {
      type: Object as PropType<Style>,
      default: () => ({ fg: "whiteBright", bold: true }),
    },
    /** Style used for hover tooltip text. */
    tooltipStyle: { type: Object as PropType<Style>, default: () => ({ fg: "whiteBright" }) },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const clearStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const lineStyle = computed(() => mergeStyle(clearStyle.value, props.lineStyle));
    const axisStyle = computed(() => mergeStyle(clearStyle.value, props.axisStyle));
    const labelStyle = computed(() => mergeStyle(clearStyle.value, props.labelStyle));
    const hoverPointer = ref<PointerCell | null>(null);

    const lineLayout = computed<LineLayout>(() => {
      const width = cellCount(props.w, 0);
      const height = cellCount(props.h, 0);
      const runs = finiteLineRuns(props.values);
      const sourceLength = props.values.length;
      const { min, max } = domainFromValues(props.values, props.min, props.max);
      const layout = resolveAxisLayout(width, height, min, max, props.showAxes);
      return { width, height, layout, runs, sourceLength, min, max };
    });
    const visibleRect = useChartVisibleRect(props, lineLayout);

    function hitLine(localX: number, localY: number): LineHover | null {
      const current = lineLayout.value;
      const { layout, runs, sourceLength, min, max } = current;
      if (!runs.length || layout.plotW <= 0 || layout.plotH <= 0) return null;
      const plotX = localX - layout.plotX;
      const plotY = localY - layout.plotY;
      if (plotX < 0 || plotX >= layout.plotW || plotY < 0 || plotY >= layout.plotH) return null;

      const position = samplePositionAtX(plotX, layout.plotW, sourceLength);
      const point = nearestLinePointInRuns(runs, position, plotX, layout.plotW, sourceLength);
      if (!point) return null;
      const value = point.value;
      const x = lineXForOriginalIndex(
        point.originalIndex,
        layout.plotX,
        layout.plotW,
        sourceLength,
      );
      const y = layout.plotY + valueToY(value, min, max, layout.plotH);
      const label = props.labels?.[point.originalIndex] ?? `#${point.originalIndex + 1}`;
      return { x, y, index: point.originalIndex, label, value };
    }

    const baseCells = computed<readonly ChartCell[]>(() => {
      const { width, height, layout, runs, sourceLength, min, max } = lineLayout.value;
      const cells: ChartCell[] = [];

      if (layout.plotW > 0 && layout.plotH > 0 && runs.length > 0) {
        const occupiedLineCells = new Set<number>();
        for (const run of runs) {
          const buckets = lineBucketsForRun(run.points, layout.plotW, sourceLength);
          let prevX: number | null = null;
          let prevY: number | null = null;
          for (const point of lineSegmentPointsForRun(
            run.points,
            buckets,
            layout.plotW,
            sourceLength,
          )) {
            const x = layout.plotX + point.x;
            const y = layout.plotY + valueToY(point.value, min, max, layout.plotH);
            if (prevX == null || prevY == null) {
              putLineGlyph(cells, x, y, "●", lineStyle.value, width, height, occupiedLineCells);
            } else {
              drawSteppedLineSegment(
                cells,
                prevX,
                prevY,
                x,
                y,
                lineStyle.value,
                width,
                height,
                occupiedLineCells,
              );
            }
            prevX = x;
            prevY = y;
          }
          for (const bucket of buckets) {
            pushLineBucketExtrema(
              cells,
              bucket,
              layout,
              min,
              max,
              lineStyle.value,
              width,
              height,
              occupiedLineCells,
            );
          }
        }
      }

      pushAxes(
        cells,
        layout,
        axisStyle.value,
        labelStyle.value,
        props.xLabel,
        props.yLabel,
        props.startLabel || (sourceLength > 0 ? "1" : ""),
        props.endLabel || (sourceLength > 0 ? String(sourceLength) : ""),
      );

      return cells;
    });

    const surface = computed<ChartSurface>(() => {
      const { width, height, layout } = lineLayout.value;
      const cells = baseCells.value.slice();
      const pointer = hoverPointer.value;
      const hovered = props.showTooltip && pointer ? hitLine(pointer.x, pointer.y) : null;
      if (hovered) {
        cells.push({
          x: hovered.x,
          y: hovered.y,
          ch: "●",
          style: mergeStyle(lineStyle.value, props.hoverStyle),
        });
      }
      const visible = visibleRect.value;
      if (
        props.showTooltip &&
        hovered &&
        width > 0 &&
        height > 0 &&
        visible.w > 0 &&
        visible.h > 0
      ) {
        const unit = sanitizeInlineText(props.unit);
        const yValue = unit
          ? `${formatChartValue(hovered.value)} ${unit}`
          : formatChartValue(hovered.value);
        const text = `${sanitizeInlineText(hovered.label)} x=${hovered.index + 1} y=${yValue}`;
        const textWidth = textCellWidth(text);
        const placement = chooseTooltipPlacement(
          cells,
          width,
          height,
          hovered.x,
          hovered.y,
          textWidth,
          layout.enabled ? layout.axisY + 1 : undefined,
          visible,
        );
        pushTextCells(
          cells,
          placement.x,
          placement.y,
          text,
          mergeStyle(clearStyle.value, props.tooltipStyle),
          visible.x + visible.w - placement.x,
        );
      }
      return createSurface(width, height, clearStyle.value, cells);
    });

    return useChartRender(props, surface, {
      handlers: ({ fullRect }) => ({
        pointermove: (event) => {
          if (!props.showTooltip) {
            if (hoverPointer.value != null) hoverPointer.value = null;
            return;
          }
          const next = {
            x: Math.floor(event.cellX - fullRect.value.x),
            y: Math.floor(event.cellY - fullRect.value.y),
          };
          const current = hoverPointer.value;
          if (!current || current.x !== next.x || current.y !== next.y) hoverPointer.value = next;
        },
        pointerleave: () => {
          if (hoverPointer.value != null) hoverPointer.value = null;
        },
      }),
    });
  },
});

export const TCandlestickChart = defineComponent({
  name: "TCandlestickChart",
  props: {
    /** Left position in terminal cells. */
    x: { type: Number, required: true },
    /** Top position in terminal cells. */
    y: { type: Number, required: true },
    /** Width in terminal cells. */
    w: { type: Number, required: true },
    /** Height in terminal cells. */
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    /** Candles rendered from left to right; the most recent candles are kept when width is smaller. */
    candles: { type: Array as PropType<readonly TCandlestickDatum[]>, required: true },
    /** Labels aligned with candles and shown in hover tooltips. */
    labels: { type: Array as PropType<readonly string[]>, default: undefined },
    /** Lower price bound. Defaults to the smallest candle low. */
    min: { type: Number, default: undefined },
    /** Upper price bound. Defaults to the largest candle high. */
    max: { type: Number, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    /** Style used when close is greater than or equal to open. */
    upStyle: { type: Object as PropType<Style>, default: () => ({ fg: "greenBright" }) },
    /** Style used when close is less than open. */
    downStyle: { type: Object as PropType<Style>, default: () => ({ fg: "redBright" }) },
    /** Optional style override for wick cells. */
    wickStyle: { type: Object as PropType<Style>, default: undefined },
    /** Whether to render axes and price labels when there is enough space. */
    showAxes: { type: Boolean, default: true },
    /** Style used for axis lines. */
    axisStyle: { type: Object as PropType<Style>, default: () => ({ fg: "white", dim: true }) },
    /** Style used for axis labels. */
    labelStyle: { type: Object as PropType<Style>, default: () => ({ fg: "whiteBright" }) },
    /** Label centered under the x axis. */
    xLabel: { type: String, default: "" },
    /** Label rendered at the top of the plot area. */
    yLabel: { type: String, default: "" },
    /** Left endpoint label for the x axis when xLabel is empty. */
    startLabel: { type: String, default: "" },
    /** Right endpoint label for the x axis when xLabel is empty. */
    endLabel: { type: String, default: "" },
    /** Whether pointer hover shows candle values. */
    showTooltip: { type: Boolean, default: true },
    /** Style merged onto the currently hovered candle. */
    hoverStyle: { type: Object as PropType<Style>, default: () => ({}) },
    /** Style used for hover tooltip text. */
    tooltipStyle: { type: Object as PropType<Style>, default: () => ({ fg: "whiteBright" }) },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const axisStyle = computed(() => mergeStyle(baseStyle.value, props.axisStyle));
    const labelStyle = computed(() => mergeStyle(baseStyle.value, props.labelStyle));
    const hoverPointer = ref<PointerCell | null>(null);

    const candleLayout = computed<CandlestickLayout>(() => {
      const width = cellCount(props.w, 0);
      const height = cellCount(props.h, 0);
      let min = 0;
      let max = 0;
      let layout = resolveAxisLayout(width, height, min, max, props.showAxes);
      let startIndex = props.candles.length;
      let visibleCandles: readonly TCandlestickDatum[] = [];

      for (let capacity = Math.min(props.candles.length, width); capacity >= 0; capacity--) {
        startIndex = Math.max(0, props.candles.length - capacity);
        visibleCandles = props.candles.slice(startIndex);
        ({ min, max } = domainFromValues(
          candlestickDomainValues(visibleCandles),
          props.min,
          props.max,
        ));
        layout = resolveAxisLayout(width, height, min, max, props.showAxes);
        if (visibleCandles.length <= layout.plotW) break;
      }

      const candleOffsetX = Math.max(0, layout.plotW - visibleCandles.length);
      return { width, height, layout, visibleCandles, startIndex, candleOffsetX, min, max };
    });
    const visibleRect = useChartVisibleRect(props, candleLayout);

    function hitCandle(localX: number, localY: number): CandlestickHover | null {
      const current = candleLayout.value;
      const { layout } = current;
      if (current.width <= 0 || current.height <= 0 || layout.plotW <= 0 || layout.plotH <= 0)
        return null;
      const plotX = localX - layout.plotX - current.candleOffsetX;
      const plotY = localY - layout.plotY;
      if (plotX < 0 || plotX >= current.visibleCandles.length || current.visibleCandles.length <= 0)
        return null;
      if (plotY < 0 || plotY >= layout.plotH) return null;

      const candleX = plotX;
      const candle = current.visibleCandles[candleX]!;
      const values = normalizeCandlestick(candle);
      if (!values) return null;

      const { open, high, low, close } = values;
      const index = current.startIndex + candleX;
      const label = props.labels?.[index] ?? `#${index + 1}`;
      return {
        x: layout.plotX + current.candleOffsetX + candleX,
        y: localY,
        index,
        label,
        value: yToValue(plotY, current.min, current.max, layout.plotH),
        open,
        high,
        low,
        close,
      };
    }

    const surface = computed<ChartSurface>(() => {
      const current = candleLayout.value;
      const { width, height, layout, visibleCandles, candleOffsetX, min, max } = current;
      const cells: ChartCell[] = [];
      const upStyle = mergeStyle(baseStyle.value, props.upStyle);
      const downStyle = mergeStyle(baseStyle.value, props.downStyle);
      const upWickStyle = mergeStyle(baseStyle.value, props.upStyle, props.wickStyle);
      const downWickStyle = mergeStyle(baseStyle.value, props.downStyle, props.wickStyle);
      const pointer = hoverPointer.value;
      const hovered = props.showTooltip && pointer ? hitCandle(pointer.x, pointer.y) : null;

      for (let x = 0; x < visibleCandles.length; x++) {
        const candle = visibleCandles[x]!;
        const values = normalizeCandlestick(candle);
        if (!values) continue;

        const { open, high, low, close } = values;
        const up = close >= open;
        const baseBodyStyle = up ? upStyle : downStyle;
        const baseWickStyle = up ? upWickStyle : downWickStyle;
        const hoveredCandle = hovered?.index === current.startIndex + x;
        const bodyStyle = hoveredCandle
          ? mergeStyle(baseBodyStyle, props.hoverStyle)
          : baseBodyStyle;
        const wickStyle = hoveredCandle
          ? mergeStyle(baseWickStyle, props.hoverStyle)
          : baseWickStyle;
        const highY = valueToY(Math.max(high, low, open, close), min, max, layout.plotH);
        const lowY = valueToY(Math.min(high, low, open, close), min, max, layout.plotH);
        const openY = valueToY(open, min, max, layout.plotH);
        const closeY = valueToY(close, min, max, layout.plotH);
        const bodyTop = Math.min(openY, closeY);
        const bodyBottom = Math.max(openY, closeY);

        for (let y = highY; y <= lowY; y++) {
          const inBody = y >= bodyTop && y <= bodyBottom;
          cells.push({
            x: layout.plotX + candleOffsetX + x,
            y: layout.plotY + y,
            ch: inBody ? "█" : "│",
            style: inBody ? bodyStyle : wickStyle,
          });
        }
      }

      const firstVisible = props.candles.length - visibleCandles.length + 1;
      pushAxes(
        cells,
        layout,
        axisStyle.value,
        labelStyle.value,
        props.xLabel,
        props.yLabel,
        props.startLabel || (visibleCandles.length > 0 ? String(firstVisible) : ""),
        props.endLabel || (visibleCandles.length > 0 ? String(props.candles.length) : ""),
      );

      const visible = visibleRect.value;
      if (
        props.showTooltip &&
        hovered &&
        width > 0 &&
        height > 0 &&
        visible.w > 0 &&
        visible.h > 0
      ) {
        const text = `${sanitizeInlineText(hovered.label)} x=${hovered.index + 1} y=${formatChartValue(hovered.value)} O:${formatChartValue(hovered.open)} H:${formatChartValue(hovered.high)} L:${formatChartValue(hovered.low)} C:${formatChartValue(hovered.close)}`;
        const textWidth = textCellWidth(text);
        const placement = chooseTooltipPlacement(
          cells,
          width,
          height,
          hovered.x,
          hovered.y,
          textWidth,
          undefined,
          visible,
        );
        pushTextCells(
          cells,
          placement.x,
          placement.y,
          text,
          mergeStyle(baseStyle.value, props.tooltipStyle),
          visible.x + visible.w - placement.x,
        );
      }

      return createSurface(width, height, baseStyle.value, cells);
    });

    return useChartRender(props, surface, {
      handlers: ({ fullRect }) => ({
        pointermove: (event) => {
          if (!props.showTooltip) {
            if (hoverPointer.value != null) hoverPointer.value = null;
            return;
          }
          const next = {
            x: Math.floor(event.cellX - fullRect.value.x),
            y: Math.floor(event.cellY - fullRect.value.y),
          };
          const current = hoverPointer.value;
          if (!current || current.x !== next.x || current.y !== next.y) hoverPointer.value = next;
        },
        pointerleave: () => {
          if (hoverPointer.value != null) hoverPointer.value = null;
        },
      }),
    });
  },
});

export const TPieChart = defineComponent({
  name: "TPieChart",
  props: {
    /** Left position in terminal cells. */
    x: { type: Number, required: true },
    /** Top position in terminal cells. */
    y: { type: Number, required: true },
    /** Width in terminal cells. */
    w: { type: Number, required: true },
    /** Height in terminal cells. */
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    /** Segment values rendered clockwise from the top. */
    values: { type: Array as PropType<readonly number[]>, required: true },
    /** Labels aligned with segment values and shown in the legend. */
    labels: { type: Array as PropType<readonly string[]>, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    /** Segment styles cycled when there are more segments than styles. */
    segmentStyles: {
      type: Array as PropType<readonly Style[]>,
      default: () => DEFAULT_PIE_SEGMENT_STYLES,
    },
    /** Glyph used for filled pie cells. */
    cell: { type: String, default: "█" },
    /** Whether to render a label/value/percent legend when there is enough space. */
    showLegend: { type: Boolean, default: true },
    /** Style used for legend text. */
    legendStyle: { type: Object as PropType<Style>, default: () => ({ fg: "whiteBright" }) },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const legendStyle = computed(() => mergeStyle(baseStyle.value, props.legendStyle));

    const surface = computed<ChartSurface>(() => {
      const width = cellCount(props.w, 0);
      const height = cellCount(props.h, 0);
      const values = props.values.map((value) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
      });
      const scale = maxPositive(values);
      const normalizedValues = scale > 0 ? values.map((value) => value / scale) : values;
      const total = normalizedValues.reduce((sum, value) => sum + value, 0);
      const cells: ChartCell[] = [];
      const glyph = chartGlyph(props.cell, "█");
      const segmentStyles = props.segmentStyles.map((style) => mergeStyle(baseStyle.value, style));
      const visibleSegments = values
        .map((value, index) => ({ value, normalizedValue: normalizedValues[index] ?? 0, index }))
        .filter((segment) => segment.value > 0);
      const legendItems = visibleSegments.map((segment) => {
        const label = props.labels?.[segment.index] ?? `S${segment.index + 1}`;
        const percent = total > 0 ? Math.round((segment.normalizedValue / total) * 100) : 0;
        const text = `${label} ${formatChartValue(segment.value)} ${percent}%`;
        return { ...segment, text };
      });
      const showLegend =
        props.showLegend && visibleSegments.length > 0 && width >= 18 && height >= 3;
      const desiredLegendWidth =
        legendItems.reduce(
          (maxWidth, item) => Math.max(maxWidth, textCellWidth(sanitizeInlineText(item.text)) + 2),
          0,
        ) || 12;
      const rightLegendWidth = showLegend
        ? Math.min(Math.max(12, desiredLegendWidth), Math.max(0, width - 6))
        : 0;
      const rightPlotWidth = Math.max(0, width - rightLegendWidth - 1);
      const legendRows = Math.min(legendItems.length, height);
      const rightLegend = showLegend && rightPlotWidth >= 8;
      const bottomLegend = showLegend && !rightLegend && height >= legendRows + 4;
      const legendPlacement = rightLegend ? "right" : bottomLegend ? "bottom" : "none";
      const plotWidth = legendPlacement === "right" ? rightPlotWidth : width;
      const plotHeight =
        legendPlacement === "bottom" ? Math.max(0, height - legendRows - 1) : height;

      if (plotWidth > 0 && plotHeight > 0 && total > 0) {
        const segments: Array<{ end: number; index: number; style: Style }> = [];
        let cursor = 0;
        for (let i = 0; i < normalizedValues.length; i++) {
          const value = normalizedValues[i]!;
          if (value <= 0) continue;
          cursor += (value / total) * Math.PI * 2;
          segments.push({
            end: cursor,
            index: i,
            style: segmentStyles[i % Math.max(1, segmentStyles.length)] ?? baseStyle.value,
          });
        }

        const cx = plotWidth / 2;
        const cy = plotHeight / 2;
        const maxRx = plotWidth / 2;
        const maxRy = plotHeight / 2;
        const ry = Math.max(0.5, Math.min(maxRy, maxRx / TERMINAL_CELL_HEIGHT_TO_WIDTH));
        const rx = Math.max(0.5, Math.min(maxRx, ry * TERMINAL_CELL_HEIGHT_TO_WIDTH));
        const smoothEdge = glyph === "█";
        const segmentAt = (nx: number, ny: number) => {
          let angle = Math.atan2(ny, nx) + Math.PI / 2;
          if (angle < 0) angle += Math.PI * 2;
          return segments.find((candidate) => angle <= candidate.end) ?? segments.at(-1);
        };

        for (let y = 0; y < plotHeight; y++) {
          for (let x = 0; x < plotWidth; x++) {
            let mask = 0;
            const hits = new Map<number, { segment: (typeof segments)[number]; count: number }>();
            for (const sample of PIE_CELL_SAMPLES) {
              const nx = (x + sample.dx - cx) / rx;
              const ny = (y + sample.dy - cy) / ry;
              if (nx * nx + ny * ny > 1) continue;
              mask |= sample.bit;
              const segment = segmentAt(nx, ny);
              if (!segment) continue;
              const previous = hits.get(segment.index);
              hits.set(segment.index, {
                segment,
                count: (previous?.count ?? 0) + 1,
              });
            }
            if (!mask) continue;

            const selected = Array.from(hits.values()).sort((a, b) => b.count - a.count)[0];
            const ch = smoothEdge ? (PIE_QUADRANT_BLOCKS[mask] ?? glyph) : glyph;
            cells.push({ x, y, ch, style: selected?.segment.style ?? baseStyle.value });
          }
        }
      }

      if (legendPlacement !== "none") {
        const legendX = legendPlacement === "right" ? plotWidth + 1 : 0;
        const legendY = legendPlacement === "right" ? 0 : plotHeight + 1;
        const maxTextWidth =
          legendPlacement === "right" ? Math.max(0, width - legendX - 2) : Math.max(0, width - 2);
        for (let row = 0; row < legendItems.length && legendY + row < height; row++) {
          const segment = legendItems[row]!;
          const style =
            segmentStyles[segment.index % Math.max(1, segmentStyles.length)] ?? baseStyle.value;
          cells.push({ x: legendX, y: legendY + row, ch: glyph, style });
          pushTextCells(
            cells,
            legendX + 2,
            legendY + row,
            segment.text,
            legendStyle.value,
            maxTextWidth,
          );
        }
      }

      return createSurface(width, height, baseStyle.value, cells);
    });

    return useChartRender(props, surface);
  },
});
