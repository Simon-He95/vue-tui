import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { textCellWidth } from "../utils/text.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { fitCellText, mergeStyle } from "./simple-utils.js";

export type TBreadcrumbItem = Readonly<{
  id: string;
  label: string;
  disabled?: boolean;
}>;

export type TBreadcrumbSelectPayload = Readonly<{
  item: TBreadcrumbItem;
  index: number;
}>;

export const TKeyHint = defineComponent({
  name: "TKeyHint",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    combo: { type: String, required: true },
    label: { type: String, required: true },
    style: { type: Object as PropType<Style>, default: undefined },
    comboStyle: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const comboStyle = computed(() => mergeStyle(baseStyle.value, props.comboStyle));

    return () => {
      const comboW = textCellWidth(props.combo);
      const gap = props.label ? 1 : 0;
      const comboRenderW = props.w == null ? comboW : Math.min(comboW, Math.max(0, props.w));
      const gapW = props.w == null ? gap : Math.min(gap, Math.max(0, props.w - comboW));
      const labelW = props.w == null ? undefined : Math.max(0, props.w - comboW - gap);
      const children = [
        h(TText as any, {
          x: props.x,
          y: props.y,
          zIndex: props.zIndex,
          w: comboRenderW,
          value: props.combo,
          style: comboStyle.value,
        }),
      ];
      if (gapW > 0) {
        children.push(
          h(TText as any, {
            x: props.x + comboW,
            y: props.y,
            zIndex: props.zIndex,
            w: gapW,
            value: " ",
            style: baseStyle.value,
          }),
        );
      }
      children.push(
        h(TText as any, {
          x: props.x + comboW + gap,
          y: props.y,
          zIndex: props.zIndex,
          w: labelW,
          value: props.label,
          style: baseStyle.value,
        }),
      );
      return children;
    };
  },
});

export const TBreadcrumb = defineComponent({
  name: "TBreadcrumb",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    items: {
      type: Array as PropType<readonly TBreadcrumbItem[]>,
      required: true,
    },
    separator: { type: String, default: "/" },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: () => ({ bold: true }) },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    select: (_payload: TBreadcrumbSelectPayload) => true,
  },
  setup(props, { emit }) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    return () => {
      let x = 0;
      const children: any[] = [];
      for (let index = 0; index < props.items.length; index++) {
        const item = props.items[index]!;
        const suffix = index < props.items.length - 1 ? ` ${props.separator} ` : "";
        const text = `${item.label}${suffix}`;
        const remaining = props.w - x;
        const cellW = textCellWidth(text);
        const w = Math.min(remaining, cellW);
        if (w <= 0) break;
        children.push(
          h(
            TView as any,
            {
              key: item.id,
              x,
              y: 0,
              w,
              h: 1,
              focusable: !item.disabled,
              onClick: () => {
                if (!item.disabled) emit("select", { item, index });
              },
              onKeydown: (event: any) => {
                if (item.disabled || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault?.();
                emit("select", { item, index });
              },
            },
            () =>
              h(TText as any, {
                x: 0,
                y: 0,
                w,
                value: fitCellText(text, w),
                style: item.disabled
                  ? mergeStyle(baseStyle.value, props.disabledStyle)
                  : index === props.items.length - 1
                    ? mergeStyle(baseStyle.value, props.activeStyle)
                    : baseStyle.value,
              }),
          ),
        );
        x += w;
        if (w < cellW) break;
      }
      return h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: 1, zIndex: props.zIndex },
        () => children,
      );
    };
  },
});

export const TStatusBar = defineComponent({
  name: "TStatusBar",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    left: { type: String, default: "" },
    center: { type: String, default: "" },
    right: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
  },
  setup(props, { slots }) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    return () => {
      const children = slots.default?.();
      if (children?.length) {
        return h(
          TView as any,
          { x: props.x, y: props.y, w: props.w, h: 1, zIndex: props.zIndex },
          () => children,
        );
      }
      const leftW = Math.max(0, Math.floor(props.w / 3));
      const rightW = leftW;
      const centerW = Math.max(0, props.w - leftW - rightW);
      return h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: 1, zIndex: props.zIndex },
        () => [
          h(TText as any, { x: 0, y: 0, w: leftW, value: props.left, style: baseStyle.value }),
          h(TText as any, {
            x: leftW,
            y: 0,
            w: centerW,
            value: props.center,
            style: baseStyle.value,
          }),
          h(TText as any, {
            x: leftW + centerW,
            y: 0,
            w: rightW,
            value: props.right,
            style: baseStyle.value,
          }),
        ],
      );
    };
  },
});
