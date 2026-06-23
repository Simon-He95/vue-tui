import type { Rect } from "../../events/manager/types.js";
import type {
  BoxEdges,
  FlexLayoutInputItem,
  TFlexAlign,
  TFlexAlignContent,
  TFlexDirection,
  TFlexItemSlotProps,
  TFlexJustify,
  TFlexMeasure,
  TFlexSize,
} from "../layout/flex.js";
import type { PropType, VNode } from "vue";
import { Comment, Fragment, defineComponent, h } from "vue";
import {
  layoutFlexItems,
  normalizeCellCount,
  normalizeOptionalCellCount,
  normalizeRatio,
} from "../layout/flex.js";
import { TView } from "./TView.js";

export type {
  TFlexAlign,
  TFlexAlignContent,
  TFlexDirection,
  TFlexItemSlotProps,
  TFlexJustify,
  TFlexMeasure,
  TFlexMeasureConstraints,
  TFlexMeasureResult,
  TFlexSize,
} from "../layout/flex.js";

type FlexItem = FlexLayoutInputItem &
  Readonly<{
    vnode: VNode;
    isFlexItem: boolean;
    order: number;
  }>;

function normalizeInteger(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
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
    isFlexItem: isFlexItemVNode(vnode),
    grow: normalizeRatio(props?.grow, 0),
    shrink: normalizeRatio(props?.shrink, 1),
    basis: sizeProp(props, "basis"),
    width: sizeProp(props, "width") ?? sizeProp(props, "w"),
    height: sizeProp(props, "height") ?? sizeProp(props, "h"),
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
        mainGap: props.direction === "row" ? columnGap : rowGap,
        crossGap: props.direction === "row" ? rowGap : columnGap,
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
