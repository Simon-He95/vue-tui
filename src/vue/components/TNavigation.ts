import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { defineComponent, h } from "vue";
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
    return () => {
      const text = `${props.combo} ${props.label}`;
      return h(TText as any, {
        x: props.x,
        y: props.y,
        zIndex: props.zIndex,
        w: props.w,
        value: text,
        style: mergeStyle(props.style, props.comboStyle),
      });
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
    return () => {
      let x = 0;
      const children: any[] = [];
      for (let index = 0; index < props.items.length; index++) {
        const item = props.items[index]!;
        const suffix = index < props.items.length - 1 ? ` ${props.separator} ` : "";
        const text = `${item.label}${suffix}`;
        const w = Math.min(props.w - x, text.length);
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
            },
            () =>
              h(TText as any, {
                x: 0,
                y: 0,
                w,
                value: fitCellText(text, w),
                style: item.disabled
                  ? mergeStyle(props.style, props.disabledStyle)
                  : index === props.items.length - 1
                    ? mergeStyle(props.style, props.activeStyle)
                    : props.style,
              }),
          ),
        );
        x += w;
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
          h(TText as any, { x: 0, y: 0, w: leftW, value: props.left, style: props.style }),
          h(TText as any, { x: leftW, y: 0, w: centerW, value: props.center, style: props.style }),
          h(TText as any, {
            x: leftW + centerW,
            y: 0,
            w: rightW,
            value: props.right,
            style: props.style,
          }),
        ],
      );
    };
  },
});
