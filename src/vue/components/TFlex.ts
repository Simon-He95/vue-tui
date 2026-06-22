import type { PropType, VNode } from "vue";
import type { Rect } from "../../events/manager/types.js";
import { Comment, Fragment, defineComponent, h } from "vue";
import { TView } from "./TView.js";

export type TFlexDirection = "row" | "column";
export type TFlexAlign = "start" | "center" | "end" | "stretch";
export type TFlexJustify = "start" | "center" | "end" | "space-between";
export type TFlexAlignContent = "start" | "center" | "end" | "space-between" | "stretch";
export type TFlexSize = number | string;
export type TFlexMeasureConstraints = Readonly<{
  maxWidth: number;
  maxHeight: number;
  direction: TFlexDirection;
}>;
export type TFlexMeasureResult = Readonly<{
  width?: number;
  height?: number;
  w?: number;
  h?: number;
}>;
export type TFlexMeasure = (constraints: TFlexMeasureConstraints) => TFlexMeasureResult;
export type TFlexItemSlotProps = Readonly<{ rect: Rect }>;

type FlexItem = Readonly<{
  vnode: VNode;
  isFlexItem: boolean;
  grow: number;
  shrink: number;
  basis: TFlexSize | undefined;
  width: TFlexSize | undefined;
  height: TFlexSize | undefined;
  minWidth: TFlexSize | undefined;
  minHeight: TFlexSize | undefined;
  maxWidth: TFlexSize | undefined;
  maxHeight: TFlexSize | undefined;
  measure: TFlexMeasure | undefined;
  measureCache: Map<string, { main: number | undefined; cross: number | undefined }> | undefined;
  order: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  alignSelf: TFlexAlign | undefined;
}>;

type FlexLayoutItem = Readonly<{
  item: FlexItem;
  rect: Rect;
}>;

type BoxEdges = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

function normalizeCellCount(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function normalizeInteger(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOptionalCellCount(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, n);
}

function normalizeRatio(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function edgeProp(props: VNode["props"], key: string): number | undefined {
  return normalizeOptionalCellCount(props?.[key]);
}

function resolveEdges(
  props: VNode["props"],
  options: Readonly<{
    all: string;
    x: string;
    y: string;
    top: string;
    right: string;
    bottom: string;
    left: string;
  }>,
): BoxEdges {
  const all = edgeProp(props, options.all) ?? 0;
  const x = edgeProp(props, options.x) ?? all;
  const y = edgeProp(props, options.y) ?? all;
  return {
    top: edgeProp(props, options.top) ?? y,
    right: edgeProp(props, options.right) ?? x,
    bottom: edgeProp(props, options.bottom) ?? y,
    left: edgeProp(props, options.left) ?? x,
  };
}

function sizeProp(props: VNode["props"], key: string): TFlexSize | undefined {
  const value = props?.[key];
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : undefined;
  if (typeof value !== "string") return undefined;

  const text = value.trim();
  if (text.endsWith("%")) {
    const n = Number(text.slice(0, -1));
    if (!Number.isFinite(n)) return undefined;
    return `${Math.max(0, n)}%` as TFlexSize;
  }
  return normalizeOptionalCellCount(text);
}

function resolveSize(value: TFlexSize | undefined, reference: number): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return normalizeOptionalCellCount(value);
  const n = Number(value.slice(0, -1));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor((reference * n) / 100));
}

function collectChildren(nodes: readonly VNode[]): VNode[] {
  const out: VNode[] = [];
  for (const node of nodes) {
    if (node.type === Comment) continue;
    if (node.type === Fragment && Array.isArray(node.children)) {
      out.push(...collectChildren(node.children as VNode[]));
      continue;
    }
    out.push(node);
  }
  return out;
}

function isFlexItemVNode(vnode: VNode): boolean {
  return vnode.type === TFlexItem;
}

function createFlexItem(vnode: VNode): FlexItem {
  const props = vnode.props;
  const isFlexItem = isFlexItemVNode(vnode);
  const width = sizeProp(props, "width") ?? sizeProp(props, "w");
  const height = sizeProp(props, "height") ?? sizeProp(props, "h");
  const grow = normalizeRatio(props?.grow, 0);
  const margin = resolveEdges(props, {
    all: "margin",
    x: "marginX",
    y: "marginY",
    top: "marginTop",
    right: "marginRight",
    bottom: "marginBottom",
    left: "marginLeft",
  });
  return {
    vnode,
    isFlexItem,
    grow,
    shrink: normalizeRatio(props?.shrink, 1),
    basis: sizeProp(props, "basis"),
    width,
    height,
    minWidth: sizeProp(props, "minWidth"),
    minHeight: sizeProp(props, "minHeight"),
    maxWidth: sizeProp(props, "maxWidth"),
    maxHeight: sizeProp(props, "maxHeight"),
    measure: typeof props?.measure === "function" ? (props.measure as TFlexMeasure) : undefined,
    measureCache: typeof props?.measure === "function" ? new Map() : undefined,
    order: normalizeInteger(props?.order),
    marginTop: margin.top,
    marginRight: margin.right,
    marginBottom: margin.bottom,
    marginLeft: margin.left,
    alignSelf: props?.alignSelf as TFlexAlign | undefined,
  };
}

function clampSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveMainMin(item: FlexItem, direction: TFlexDirection, reference: number): number {
  return (
    (direction === "row"
      ? resolveSize(item.minWidth, reference)
      : resolveSize(item.minHeight, reference)) ?? 0
  );
}

function resolveMainMax(
  item: FlexItem,
  direction: TFlexDirection,
  reference: number,
  min: number,
): number {
  return Math.max(
    min,
    (direction === "row"
      ? resolveSize(item.maxWidth, reference)
      : resolveSize(item.maxHeight, reference)) ?? Number.POSITIVE_INFINITY,
  );
}

function measureItem(
  item: FlexItem,
  direction: TFlexDirection,
  mainReference: number,
  crossReference: number,
): { main: number | undefined; cross: number | undefined } {
  if (!item.measure) return { main: undefined, cross: undefined };
  const constraints =
    direction === "row"
      ? { maxWidth: mainReference, maxHeight: crossReference, direction }
      : { maxWidth: crossReference, maxHeight: mainReference, direction };
  const cacheKey = `${constraints.direction}:${constraints.maxWidth}:${constraints.maxHeight}`;
  const cached = item.measureCache?.get(cacheKey);
  if (cached) return cached;

  const measured = item.measure(constraints);
  const width = normalizeOptionalCellCount(measured?.width ?? measured?.w);
  const height = normalizeOptionalCellCount(measured?.height ?? measured?.h);
  const resolved =
    direction === "row" ? { main: width, cross: height } : { main: height, cross: width };
  item.measureCache?.set(cacheKey, resolved);
  return resolved;
}

function resolveMeasuredMain(
  item: FlexItem,
  direction: TFlexDirection,
  mainReference: number,
  crossReference: number,
): number | undefined {
  return measureItem(item, direction, mainReference, crossReference).main;
}

function resolveMeasuredCross(
  item: FlexItem,
  direction: TFlexDirection,
  mainReference: number,
  crossReference: number,
): number | undefined {
  return measureItem(item, direction, mainReference, crossReference).cross;
}

function resolveMainBase(
  item: FlexItem,
  direction: TFlexDirection,
  reference: number,
  crossReference: number,
  min: number,
  max: number,
): number {
  const fixed =
    direction === "row" ? resolveSize(item.width, reference) : resolveSize(item.height, reference);
  const measured = resolveMeasuredMain(item, direction, reference, crossReference);
  const basis = resolveSize(item.basis, reference) ?? fixed ?? measured ?? 0;
  return clampSize(basis, min, max);
}

function resolveCrossBase(
  item: FlexItem,
  direction: TFlexDirection,
  reference: number,
  mainReference: number,
): number {
  const fixed =
    direction === "row" ? resolveSize(item.height, reference) : resolveSize(item.width, reference);
  const measured = resolveMeasuredCross(item, direction, mainReference, reference);
  const min =
    (direction === "row"
      ? resolveSize(item.minHeight, reference)
      : resolveSize(item.minWidth, reference)) ?? 0;
  const max = Math.max(
    min,
    (direction === "row"
      ? resolveSize(item.maxHeight, reference)
      : resolveSize(item.maxWidth, reference)) ?? Number.POSITIVE_INFINITY,
  );
  return fixed == null ? clampSize(measured ?? min, min, max) : clampSize(fixed, min, max);
}

function mainBefore(item: FlexItem, direction: TFlexDirection): number {
  return direction === "row" ? item.marginLeft : item.marginTop;
}

function mainAfter(item: FlexItem, direction: TFlexDirection): number {
  return direction === "row" ? item.marginRight : item.marginBottom;
}

function crossBefore(item: FlexItem, direction: TFlexDirection): number {
  return direction === "row" ? item.marginTop : item.marginLeft;
}

function crossAfter(item: FlexItem, direction: TFlexDirection): number {
  return direction === "row" ? item.marginBottom : item.marginRight;
}

function mainMargin(item: FlexItem, direction: TFlexDirection): number {
  return mainBefore(item, direction) + mainAfter(item, direction);
}

function crossMargin(item: FlexItem, direction: TFlexDirection): number {
  return crossBefore(item, direction) + crossAfter(item, direction);
}

function fitEdges(edges: BoxEdges, width: number, height: number): BoxEdges {
  const left = Math.min(edges.left, width);
  const right = Math.min(edges.right, Math.max(0, width - left));
  const top = Math.min(edges.top, height);
  const bottom = Math.min(edges.bottom, Math.max(0, height - top));
  return { top, right, bottom, left };
}

function proportionalSizes(weights: readonly number[], available: number): number[] {
  if (available <= 0) return weights.map(() => 0);
  const total = weights.reduce((sum, next) => sum + next, 0);
  if (total <= 0) return weights.map(() => 0);

  const out = weights.map((weight) => Math.floor((available * weight) / total));
  let remaining = available - out.reduce((sum, next) => sum + next, 0);
  const order = weights
    .map((weight, index) => ({
      index,
      fraction: (available * weight) / total - out[index]!,
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; remaining > 0 && i < order.length; i++, remaining--) {
    out[order[i]!.index]! += 1;
  }
  return out;
}

function growSizes(
  sizes: number[],
  weights: readonly number[],
  maxes: readonly number[],
  remaining: number,
): void {
  while (remaining > 0) {
    const open = weights
      .map((weight, index) => ({ index, weight }))
      .filter(({ index, weight }) => weight > 0 && sizes[index]! < maxes[index]!);
    if (open.length === 0) return;

    const weightTotal = open.reduce((sum, next) => sum + next.weight, 0);
    let assigned = 0;
    const order = open
      .map(({ index, weight }) => {
        const raw = (remaining * weight) / weightTotal;
        const grant = Math.min(maxes[index]! - sizes[index]!, Math.floor(raw));
        sizes[index]! += grant;
        assigned += grant;
        return { index, fraction: raw - grant };
      })
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

    remaining -= assigned;
    for (const { index } of order) {
      if (remaining <= 0) break;
      if (sizes[index]! >= maxes[index]!) continue;
      sizes[index]! += 1;
      remaining -= 1;
    }
    if (assigned === 0 && order.every(({ index }) => sizes[index]! >= maxes[index]!)) return;
  }
}

function shrinkSizes(
  sizes: number[],
  weights: readonly number[],
  mins: readonly number[],
  overflow: number,
): void {
  while (overflow > 0) {
    const open = weights
      .map((weight, index) => ({ index, weight }))
      .filter(({ index, weight }) => weight > 0 && sizes[index]! > mins[index]!);
    if (open.length === 0) return;

    const weightTotal = open.reduce((sum, next) => sum + next.weight, 0);
    let assigned = 0;
    const order = open
      .map(({ index, weight }) => {
        const raw = (overflow * weight) / weightTotal;
        const shrink = Math.min(sizes[index]! - mins[index]!, Math.floor(raw));
        sizes[index]! -= shrink;
        assigned += shrink;
        return { index, fraction: raw - shrink };
      })
      .sort((a, b) => b.fraction - a.fraction || b.index - a.index);

    overflow -= assigned;
    for (const { index } of order) {
      if (overflow <= 0) break;
      if (sizes[index]! <= mins[index]!) continue;
      sizes[index]! -= 1;
      overflow -= 1;
    }
    if (assigned === 0 && order.every(({ index }) => sizes[index]! <= mins[index]!)) return;
  }
}

function resolveMainSizes(
  items: readonly FlexItem[],
  direction: TFlexDirection,
  available: number,
  crossReference: number,
) {
  const mins = items.map((item) => resolveMainMin(item, direction, available));
  const maxes = items.map((item, index) =>
    resolveMainMax(item, direction, available, mins[index]!),
  );
  const minTotal = mins.reduce((sum, next) => sum + next, 0);

  if (minTotal >= available) return proportionalSizes(mins, available);

  const sizes = items.map((item, index) =>
    resolveMainBase(item, direction, available, crossReference, mins[index]!, maxes[index]!),
  );
  const total = sizes.reduce((sum, next) => sum + next, 0);

  if (total < available) {
    growSizes(
      sizes,
      items.map((item) => item.grow),
      maxes,
      available - total,
    );
  } else if (total > available) {
    shrinkSizes(
      sizes,
      items.map((item, index) => item.shrink * Math.max(1, sizes[index]!)),
      mins,
      total - available,
    );
  }

  return sizes;
}

function resolveCrossSize(
  item: FlexItem,
  direction: TFlexDirection,
  align: TFlexAlign,
  available: number,
  reference = available,
  mainReference = available,
): number {
  const fixed =
    direction === "row" ? resolveSize(item.height, reference) : resolveSize(item.width, reference);
  const measured = resolveMeasuredCross(item, direction, mainReference, reference);
  const min =
    (direction === "row"
      ? resolveSize(item.minHeight, reference)
      : resolveSize(item.minWidth, reference)) ?? 0;
  const max = Math.max(
    min,
    (direction === "row"
      ? resolveSize(item.maxHeight, reference)
      : resolveSize(item.maxWidth, reference)) ?? Number.POSITIVE_INFINITY,
  );
  const size = fixed ?? (align === "stretch" ? available : (measured ?? available));
  return clampSize(size, min, max);
}

function justifyOffset(justify: TFlexJustify, slack: number): number {
  if (justify === "end") return slack;
  if (justify === "center") return Math.floor(slack / 2);
  return 0;
}

function alignContentOffset(alignContent: TFlexAlignContent, slack: number): number {
  if (alignContent === "end") return slack;
  if (alignContent === "center") return Math.floor(slack / 2);
  return 0;
}

function layoutFlexLine(
  items: readonly FlexItem[],
  options: Readonly<{
    direction: TFlexDirection;
    gap: number;
    alignItems: TFlexAlign;
    justifyContent: TFlexJustify;
    mainStart: number;
    crossStart: number;
    mainSize: number;
    crossSize: number;
    crossReference: number;
  }>,
): FlexLayoutItem[] {
  const totalGap = Math.max(0, items.length - 1) * options.gap;
  const availableMain = Math.max(0, options.mainSize - totalGap);
  const totalMainMargin = items.reduce((sum, item) => sum + mainMargin(item, options.direction), 0);
  const availableContentMain = Math.max(0, availableMain - totalMainMargin);
  const mainSizes = resolveMainSizes(
    items,
    options.direction,
    availableContentMain,
    options.crossReference,
  );
  const usedMain = mainSizes.reduce((sum, next) => sum + next, 0) + totalMainMargin;
  const slack = Math.max(0, availableMain - usedMain);
  const gapExtras = items.map(() => 0);

  if (options.justifyContent === "space-between" && items.length > 1 && slack > 0) {
    const slots = items.length - 1;
    const extra = Math.floor(slack / slots);
    let remaining = slack - extra * slots;
    for (let i = 0; i < slots; i++) {
      gapExtras[i] = extra + (remaining > 0 ? 1 : 0);
      if (remaining > 0) remaining -= 1;
    }
  }

  let cursor =
    options.mainStart +
    (options.justifyContent === "space-between" ? 0 : justifyOffset(options.justifyContent, slack));

  return items.map((item, index) => {
    const main = mainSizes[index] ?? 0;
    const align = item.alignSelf ?? options.alignItems;
    const itemCrossMargin = crossMargin(item, options.direction);
    const cross = resolveCrossSize(
      item,
      options.direction,
      align,
      Math.max(0, options.crossSize - itemCrossMargin),
      options.crossReference,
      options.mainSize,
    );
    const outerCross = cross + itemCrossMargin;
    const crossOffset =
      align === "end"
        ? options.crossSize - outerCross
        : align === "center"
          ? Math.floor((options.crossSize - outerCross) / 2)
          : 0;
    const itemMainStart = cursor + mainBefore(item, options.direction);
    const itemCrossStart = options.crossStart + crossOffset + crossBefore(item, options.direction);
    const rect =
      options.direction === "row"
        ? { x: itemMainStart, y: itemCrossStart, w: main, h: cross }
        : { x: itemCrossStart, y: itemMainStart, w: cross, h: main };

    cursor += mainMargin(item, options.direction) + main + options.gap + (gapExtras[index] ?? 0);
    return { item, rect };
  });
}

function lineBaseUsedMain(
  items: readonly FlexItem[],
  direction: TFlexDirection,
  mainSize: number,
  crossReference: number,
  gap: number,
): number {
  const totalGap = Math.max(0, items.length - 1) * gap;
  const totalMainMargin = items.reduce((sum, item) => sum + mainMargin(item, direction), 0);
  const reference = Math.max(0, mainSize - totalGap - totalMainMargin);
  return (
    totalGap +
    totalMainMargin +
    items.reduce((sum, item) => {
      const min = resolveMainMin(item, direction, reference);
      const max = resolveMainMax(item, direction, reference, min);
      return sum + resolveMainBase(item, direction, reference, crossReference, min, max);
    }, 0)
  );
}

function createWrappedLines(
  items: readonly FlexItem[],
  direction: TFlexDirection,
  availableMain: number,
  crossReference: number,
  gap: number,
): FlexItem[][] {
  const lines: FlexItem[][] = [];
  let line: FlexItem[] = [];

  for (const item of items) {
    const nextLine = [...line, item];
    const nextUsed = lineBaseUsedMain(nextLine, direction, availableMain, crossReference, gap);

    if (line.length > 0 && nextUsed > availableMain) {
      lines.push(line);
      line = [item];
      continue;
    }

    line = nextLine;
  }

  if (line.length > 0) lines.push(line);
  return lines;
}

function resolveWrappedLineCrossSizes(
  lines: readonly (readonly FlexItem[])[],
  direction: TFlexDirection,
  availableCross: number,
  crossReference: number,
  mainReference: number,
): number[] {
  const bases = lines.map((line) =>
    Math.max(
      1,
      ...line.map(
        (item) =>
          resolveCrossBase(item, direction, crossReference, mainReference) +
          crossMargin(item, direction),
      ),
    ),
  );
  const baseTotal = bases.reduce((sum, next) => sum + next, 0);
  if (baseTotal <= availableCross) return bases;
  return bases;
}

function layoutFlexItems(
  items: readonly FlexItem[],
  options: Readonly<{
    w: number;
    h: number;
    direction: TFlexDirection;
    mainGap: number;
    crossGap: number;
    padding: BoxEdges;
    alignItems: TFlexAlign;
    justifyContent: TFlexJustify;
    alignContent: TFlexAlignContent;
    wrap: boolean;
  }>,
): FlexLayoutItem[] {
  const padding = fitEdges(options.padding, options.w, options.h);
  const contentX = padding.left;
  const contentY = padding.top;
  const contentW = Math.max(0, options.w - padding.left - padding.right);
  const contentH = Math.max(0, options.h - padding.top - padding.bottom);
  const mainSize = options.direction === "row" ? contentW : contentH;
  const crossSize = options.direction === "row" ? contentH : contentW;

  if (!options.wrap) {
    return layoutFlexLine(items, {
      direction: options.direction,
      gap: options.mainGap,
      alignItems: options.alignItems,
      justifyContent: options.justifyContent,
      mainStart: options.direction === "row" ? contentX : contentY,
      crossStart: options.direction === "row" ? contentY : contentX,
      mainSize,
      crossSize,
      crossReference: crossSize,
    });
  }

  const lines = createWrappedLines(items, options.direction, mainSize, crossSize, options.mainGap);
  const availableCross = Math.max(0, crossSize - Math.max(0, lines.length - 1) * options.crossGap);
  const lineCrossSizes = resolveWrappedLineCrossSizes(
    lines,
    options.direction,
    availableCross,
    crossSize,
    mainSize,
  );
  let slack = Math.max(0, availableCross - lineCrossSizes.reduce((sum, next) => sum + next, 0));
  const crossGapExtras = lines.map(() => 0);

  if (options.alignContent === "stretch" && lineCrossSizes.length > 0 && slack > 0) {
    const extraSizes = proportionalSizes(
      lineCrossSizes.map(() => 1),
      slack,
    );
    for (let i = 0; i < lineCrossSizes.length; i++) {
      lineCrossSizes[i]! += extraSizes[i] ?? 0;
    }
    slack = 0;
  } else if (options.alignContent === "space-between" && lines.length > 1 && slack > 0) {
    const extraGaps = proportionalSizes(
      Array.from({ length: lines.length - 1 }, () => 1),
      slack,
    );
    for (let i = 0; i < extraGaps.length; i++) {
      crossGapExtras[i] = extraGaps[i] ?? 0;
    }
    slack = 0;
  }

  let crossCursor =
    (options.direction === "row" ? contentY : contentX) +
    alignContentOffset(options.alignContent, slack);
  const out: FlexLayoutItem[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const lineCross = lineCrossSizes[index] ?? 0;
    out.push(
      ...layoutFlexLine(line, {
        direction: options.direction,
        gap: options.mainGap,
        alignItems: options.alignItems,
        justifyContent: options.justifyContent,
        mainStart: options.direction === "row" ? contentX : contentY,
        crossStart: crossCursor,
        mainSize,
        crossSize: lineCross,
        crossReference: crossSize,
      }),
    );
    crossCursor += lineCross + options.crossGap + (crossGapExtras[index] ?? 0);
  }

  return out;
}

function renderFlexItemChildren(item: FlexItem, rect: Rect) {
  if (!item.isFlexItem) return item.vnode;
  const children = item.vnode.children as unknown;
  if (typeof children === "function") {
    return (children as (props: TFlexItemSlotProps) => unknown)({ rect });
  }
  if (children && typeof children === "object" && !Array.isArray(children)) {
    const defaultSlot = (children as { default?: (props: TFlexItemSlotProps) => unknown }).default;
    if (defaultSlot) return defaultSlot({ rect });
  }
  return Array.isArray(children) ? children : (children ?? null);
}

export const TFlexItem = defineComponent({
  name: "TFlexItem",
  props: {
    grow: { type: Number, default: 0 },
    shrink: { type: Number, default: 1 },
    basis: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    w: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    width: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    h: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    height: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    minWidth: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    minHeight: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    maxWidth: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    maxHeight: { type: [Number, String] as PropType<TFlexSize>, default: undefined },
    measure: { type: Function as PropType<TFlexMeasure>, default: undefined },
    order: { type: Number, default: 0 },
    margin: { type: Number, default: 0 },
    marginX: { type: Number, default: undefined },
    marginY: { type: Number, default: undefined },
    marginTop: { type: Number, default: undefined },
    marginRight: { type: Number, default: undefined },
    marginBottom: { type: Number, default: undefined },
    marginLeft: { type: Number, default: undefined },
    alignSelf: { type: String as PropType<TFlexAlign>, default: undefined },
  },
  setup(_props, { slots }) {
    return () => slots.default?.() ?? null;
  },
});

export const TFlex = defineComponent({
  name: "TFlex",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    direction: { type: String as PropType<TFlexDirection>, default: "row" },
    gap: { type: Number, default: 0 },
    rowGap: { type: Number, default: undefined },
    columnGap: { type: Number, default: undefined },
    padding: { type: Number, default: 0 },
    paddingX: { type: Number, default: undefined },
    paddingY: { type: Number, default: undefined },
    paddingTop: { type: Number, default: undefined },
    paddingRight: { type: Number, default: undefined },
    paddingBottom: { type: Number, default: undefined },
    paddingLeft: { type: Number, default: undefined },
    wrap: { type: Boolean, default: false },
    alignItems: { type: String as PropType<TFlexAlign>, default: "stretch" },
    justifyContent: { type: String as PropType<TFlexJustify>, default: "start" },
    alignContent: { type: String as PropType<TFlexAlignContent>, default: "start" },
    zIndex: { type: Number, default: 0 },
  },
  setup(props, { slots }) {
    return () => {
      const items = collectChildren(slots.default?.() ?? [])
        .map((vnode, index) => ({ item: createFlexItem(vnode), index }))
        .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
        .map(({ item }) => item);
      const gap = normalizeCellCount(props.gap);
      const rowGap = props.rowGap == null ? gap : normalizeCellCount(props.rowGap);
      const columnGap = props.columnGap == null ? gap : normalizeCellCount(props.columnGap);
      const mainGap = props.direction === "row" ? columnGap : rowGap;
      const crossGap = props.direction === "row" ? rowGap : columnGap;
      const padding = resolveEdges(props as any, {
        all: "padding",
        x: "paddingX",
        y: "paddingY",
        top: "paddingTop",
        right: "paddingRight",
        bottom: "paddingBottom",
        left: "paddingLeft",
      });
      const layout = layoutFlexItems(items, {
        w: normalizeCellCount(props.w),
        h: normalizeCellCount(props.h),
        direction: props.direction,
        mainGap,
        crossGap,
        padding,
        wrap: props.wrap,
        alignItems: props.alignItems,
        justifyContent: props.justifyContent,
        alignContent: props.alignContent,
      });

      return h(
        TView,
        {
          x: props.x,
          y: props.y,
          w: normalizeCellCount(props.w),
          h: normalizeCellCount(props.h),
          zIndex: props.zIndex,
        },
        () =>
          layout.map(({ item, rect }, index) =>
            h(
              TView,
              {
                key: item.vnode.key ?? index,
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: rect.h,
              },
              () => renderFlexItemChildren(item, rect),
            ),
          ),
      );
    };
  },
});
