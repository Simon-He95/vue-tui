import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { fitCellText, mergeStyle } from "./simple-utils.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

export type TTabsItem = Readonly<{
  key: string;
  label: string;
  badge?: string | number;
  disabled?: boolean;
}>;

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
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    function activate(item: TTabsItem): void {
      if (item.disabled) return;
      emit("update:activeKey", item.key);
      emit("change", item);
    }

    return () => {
      let x = 0;
      const children: any[] = [
        h(TText as any, {
          x: 0,
          y: 0,
          w: props.w,
          value: " ".repeat(Math.max(0, props.w)),
          style: baseStyle.value,
        }),
      ];
      for (const item of props.items) {
        const label = item.badge == null ? item.label : `${item.label} ${item.badge}`;
        const text = ` ${label} `;
        const width = Math.min(props.w - x, text.length);
        if (width <= 0) break;
        const active = item.key === props.activeKey;
        children.push(
          h(TText as any, {
            key: `text:${item.key}`,
            x,
            y: 0,
            w: width,
            value: fitCellText(text, width),
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
            w: width,
            h: 1,
            focusable: !item.disabled,
            onClick: () => activate(item),
            onKeydown: (event: any) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault?.();
              activate(item);
            },
          }),
        );
        x += width;
      }
      return h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: 1, zIndex: props.zIndex },
        () => children,
      );
    };
  },
});

export type TSplitPaneDirection = "horizontal" | "vertical";
export type TSplitPaneRect = Readonly<{ x: number; y: number; w: number; h: number }>;

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
      const count = Math.max(1, props.sizes.length);
      const total = props.direction === "horizontal" ? props.w : props.h;
      const separatorTotal = Math.max(0, count - 1);
      const available = Math.max(0, total - separatorTotal);
      const rawTotal = props.sizes.reduce((sum, size) => sum + Math.max(0, size), 0) || count;
      let cursor = 0;
      return props.sizes.map((size, index) => {
        const min = Math.max(0, props.minSizes[index] ?? 1);
        const paneSize =
          index === count - 1
            ? Math.max(min, available - cursor)
            : Math.max(min, Math.floor((available * Math.max(0, size)) / rawTotal));
        const rect =
          props.direction === "horizontal"
            ? { x: cursor, y: 0, w: paneSize, h: props.h }
            : { x: 0, y: cursor, w: props.w, h: paneSize };
        cursor += paneSize + 1;
        return rect;
      });
    });

    function resizeAt(index: number, delta: number): void {
      const next = props.sizes.map((size) => Math.max(0, size));
      if (index < 0 || index >= next.length - 1) return;
      const leftMin = props.minSizes[index] ?? 1;
      const rightMin = props.minSizes[index + 1] ?? 1;
      const left = Math.max(leftMin, next[index]! + delta);
      const right = Math.max(rightMin, next[index + 1]! - delta);
      next[index] = left;
      next[index + 1] = right;
      emit("update:sizes", next);
      emit("resize", next);
    }

    return () => {
      const children = [
        slots.default?.({ panes: panes.value }) ?? null,
        ...panes.value.slice(0, -1).map((pane, index) => {
          const separator =
            props.direction === "horizontal"
              ? { x: pane.x + pane.w, y: 0, w: 1, h: props.h, text: "|" }
              : { x: 0, y: pane.y + pane.h, w: props.w, h: 1, text: "-".repeat(props.w) };
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
              h(TText as any, {
                x: 0,
                y: 0,
                w: separator.w,
                h: separator.h,
                value: separator.text,
                style: mergeStyle(defaultStyle.value, props.separatorStyle),
              }),
          );
        }),
      ];
      return h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: props.h, zIndex: props.zIndex },
        () => children,
      );
    };
  },
});
