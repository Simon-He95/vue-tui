import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, ref } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { textCellWidth } from "../utils/text.js";
import { fitCellText, mergeStyle } from "./simple-utils.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

function normalizeCellCount(value: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizePaneSize(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  if (Number.isFinite(n)) return Math.max(0, n);
  return normalizeCellCount(fallback);
}

export type TTabsItem = Readonly<{
  key: string;
  label: string;
  badge?: string | number;
  disabled?: boolean;
}>;

function findEnabledTabIndex(
  items: readonly TTabsItem[],
  start: number,
  delta: 1 | -1,
): number | null {
  const total = items.length;
  if (total <= 0) return null;

  for (let step = 1; step <= total; step++) {
    const index = (start + step * delta + total) % total;
    if (!items[index]?.disabled) return index;
  }

  return null;
}

function edgeEnabledTabIndex(items: readonly TTabsItem[], edge: "first" | "last"): number | null {
  if (edge === "first") {
    for (let index = 0; index < items.length; index++) {
      if (!items[index]?.disabled) return index;
    }
    return null;
  }

  for (let index = items.length - 1; index >= 0; index--) {
    if (!items[index]?.disabled) return index;
  }
  return null;
}

export const TTabs = defineComponent({
  name: "TTabs",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    items: {
      type: Array as PropType<readonly TTabsItem[]>,
      required: true,
    },
    activeKey: { type: String, required: true },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    "update:activeKey": (_key: string) => true,
    change: (_item: TTabsItem) => true,
  },
  setup(props, { emit }) {
    const { defaultStyle } = useTerminal();
    const focusedKey = ref<string | null>(null);
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    function activate(item: TTabsItem): void {
      if (item.disabled) return;
      if (item.key === props.activeKey) return;
      emit("update:activeKey", item.key);
      emit("change", item);
    }

    function enabledTabIndexByKey(key: string | null | undefined): number {
      if (!key) return -1;
      return props.items.findIndex((item) => item.key === key && !item.disabled);
    }

    function activateIndex(index: number, opts: Readonly<{ trackFocus?: boolean }> = {}): void {
      const item = props.items[index];
      if (!item) return;
      if (opts.trackFocus && !item.disabled) focusedKey.value = item.key;
      activate(item);
    }

    function navigationBaseIndex(fallbackIndex: number): number {
      const activeIndex = enabledTabIndexByKey(props.activeKey);
      return activeIndex >= 0 ? activeIndex : fallbackIndex;
    }

    function activationBaseIndex(fallbackIndex: number): number {
      const focusedIndex = enabledTabIndexByKey(focusedKey.value);
      return focusedIndex >= 0 ? focusedIndex : fallbackIndex;
    }

    function onTabKeydown(event: any, index: number): void {
      const key = event?.key;
      if (key === "Enter" || key === " ") {
        event.preventDefault?.();
        activateIndex(activationBaseIndex(index));
        return;
      }

      const baseIndex = navigationBaseIndex(index);
      const next =
        key === "ArrowRight"
          ? findEnabledTabIndex(props.items, baseIndex, 1)
          : key === "ArrowLeft"
            ? findEnabledTabIndex(props.items, baseIndex, -1)
            : key === "Home"
              ? edgeEnabledTabIndex(props.items, "first")
              : key === "End"
                ? edgeEnabledTabIndex(props.items, "last")
                : null;
      if (next == null) return;
      event.preventDefault?.();
      activateIndex(next, { trackFocus: true });
    }

    return () => {
      const width = normalizeCellCount(props.w);
      let x = 0;
      const children: any[] = [
        h(TText as any, {
          x: 0,
          y: 0,
          w: width,
          value: " ".repeat(width),
          style: baseStyle.value,
        }),
      ];
      for (let index = 0; index < props.items.length; index++) {
        const item = props.items[index]!;
        const label = item.badge == null ? item.label : `${item.label} ${item.badge}`;
        const text = ` ${label} `;
        const itemWidth = Math.min(width - x, textCellWidth(text));
        if (itemWidth <= 0) break;
        const active = item.key === props.activeKey;
        children.push(
          h(TText as any, {
            key: `text:${item.key}`,
            x,
            y: 0,
            w: itemWidth,
            value: fitCellText(text, itemWidth),
            style: item.disabled
              ? mergeStyle(baseStyle.value, props.disabledStyle)
              : active
                ? mergeStyle(baseStyle.value, props.activeStyle)
                : baseStyle.value,
          }),
          h(TView as any, {
            key: `hit:${item.key}`,
            x,
            y: 0,
            w: itemWidth,
            h: 1,
            focusable: !item.disabled,
            onClick: () => {
              if (!item.disabled) focusedKey.value = item.key;
              activate(item);
            },
            onFocus: () => {
              if (!item.disabled) focusedKey.value = item.key;
            },
            onKeydown: (event: any) => onTabKeydown(event, index),
          }),
        );
        x += itemWidth;
      }
      return h(
        TView as any,
        { x: props.x, y: props.y, w: width, h: 1, zIndex: props.zIndex },
        () => children,
      );
    };
  },
});

export type TSplitPaneDirection = "horizontal" | "vertical";
export type TSplitPaneRect = Readonly<{ x: number; y: number; w: number; h: number }>;

function resolvePaneSizes(
  sizes: readonly number[],
  minSizes: readonly number[],
  available: number,
): number[] {
  const count = sizes.length;
  if (count === 0) return [];
  if (available <= 0) return sizes.map(() => 0);
  const mins = sizes.map((_, index) => normalizePaneSize(minSizes[index], 1));
  const minTotal = mins.reduce((sum, min) => sum + min, 0);

  if (minTotal >= available) {
    if (minTotal === 0) return sizes.map(() => 0);
    const out = mins.map((min) => Math.floor((available * min) / minTotal));
    let remaining = available - out.reduce((sum, size) => sum + size, 0);
    const order = mins
      .map((min, index) => ({
        index,
        fraction: (available * min) / minTotal - Math.floor((available * min) / minTotal),
      }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; remaining > 0 && i < order.length; i++, remaining--) {
      out[order[i]!.index]! += 1;
    }
    return out;
  }

  const out = sizes.map((size, index) =>
    Math.max(mins[index]!, normalizePaneSize(size, mins[index]!)),
  );
  const used = out.reduce((sum, size) => sum + size, 0);

  if (used > available) {
    let overflow = used - available;
    for (let i = out.length - 1; i >= 0 && overflow > 0; i--) {
      const shrink = Math.min(out[i]! - mins[i]!, overflow);
      out[i]! -= shrink;
      overflow -= shrink;
    }
    return out;
  }

  if (used < available) {
    out[out.length - 1]! += available - used;
  }
  return out;
}

export const TSplitPane = defineComponent({
  name: "TSplitPane",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    direction: {
      type: String as PropType<TSplitPaneDirection>,
      default: "horizontal",
    },
    sizes: {
      type: Array as PropType<readonly number[]>,
      required: true,
    },
    minSizes: {
      type: Array as PropType<readonly number[]>,
      default: () => [],
    },
    separatorStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    "update:sizes": (_sizes: number[]) => true,
    resize: (_sizes: number[]) => true,
  },
  setup(props, { emit, slots }) {
    const { defaultStyle } = useTerminal();
    const panes = computed<TSplitPaneRect[]>(() => {
      const width = normalizeCellCount(props.w);
      const height = normalizeCellCount(props.h);
      const sizes = props.sizes.length ? props.sizes : [1];
      const count = Math.max(1, sizes.length);
      const total = props.direction === "horizontal" ? width : height;
      const separatorTotal = Math.max(0, count - 1);
      const available = Math.max(0, total - separatorTotal);
      const paneSizes = resolvePaneSizes(sizes, props.minSizes, available);
      let cursor = 0;
      return paneSizes.map((paneSize) => {
        const rect =
          props.direction === "horizontal"
            ? { x: cursor, y: 0, w: paneSize, h: height }
            : { x: 0, y: cursor, w: width, h: paneSize };
        cursor += paneSize + 1;
        return rect;
      });
    });

    function resizeAt(index: number, delta: number): void {
      const count = Math.max(1, props.sizes.length);
      const total =
        props.direction === "horizontal"
          ? normalizeCellCount(props.w)
          : normalizeCellCount(props.h);
      const separatorTotal = Math.max(0, count - 1);
      const available = Math.max(0, total - separatorTotal);
      const sizes = props.sizes.length ? props.sizes : [1];
      const next = resolvePaneSizes(sizes, props.minSizes, available);
      if (index < 0 || index >= next.length - 1) return;
      const left0 = next[index]!;
      const right0 = next[index + 1]!;
      const leftMin = normalizePaneSize(props.minSizes[index], 1);
      const rightMin = normalizePaneSize(props.minSizes[index + 1], 1);
      const applied = Math.max(leftMin - left0, Math.min(right0 - rightMin, delta));
      next[index] = left0 + applied;
      next[index + 1] = right0 - applied;
      emit("update:sizes", next);
      emit("resize", next);
    }

    return () => {
      const paneChildren = slots.default?.({ panes: panes.value }) ?? [];
      const separatorChildren = panes.value.slice(0, -1).map((pane, index) => {
        const separator =
          props.direction === "horizontal"
            ? { x: pane.x + pane.w, y: 0, w: 1, h: pane.h, text: "|" }
            : { x: 0, y: pane.y + pane.h, w: pane.w, h: 1, text: "-".repeat(pane.w) };
        return h(
          TView as any,
          {
            key: `separator:${index}`,
            x: separator.x,
            y: separator.y,
            w: separator.w,
            h: separator.h,
            focusable: true,
            onKeydown: (event: any) => {
              const forward =
                props.direction === "horizontal"
                  ? event.key === "ArrowRight"
                  : event.key === "ArrowDown";
              const backward =
                props.direction === "horizontal"
                  ? event.key === "ArrowLeft"
                  : event.key === "ArrowUp";
              if (!forward && !backward) return;
              event.preventDefault?.();
              resizeAt(index, forward ? 1 : -1);
            },
          },
          () =>
            props.direction === "horizontal"
              ? Array.from({ length: separator.h }, (_, row) =>
                  h(TText as any, {
                    key: `separator-line:${row}`,
                    x: 0,
                    y: row,
                    w: 1,
                    value: separator.text,
                    style: mergeStyle(defaultStyle.value, props.separatorStyle),
                  }),
                )
              : h(TText as any, {
                  x: 0,
                  y: 0,
                  w: separator.w,
                  h: separator.h,
                  value: separator.text,
                  style: mergeStyle(defaultStyle.value, props.separatorStyle),
                }),
        );
      });
      const children = [...paneChildren, ...separatorChildren];
      return h(
        TView as any,
        {
          x: props.x,
          y: props.y,
          w: normalizeCellCount(props.w),
          h: normalizeCellCount(props.h),
          zIndex: props.zIndex,
        },
        () => children,
      );
    };
  },
});
