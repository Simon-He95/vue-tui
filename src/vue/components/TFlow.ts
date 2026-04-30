import type { PropType } from "vue";
import { defineComponent, h } from "vue";
import { TView } from "./TView.js";

type Direction = "vertical" | "horizontal";

export const TFlow = defineComponent({
  name: "TFlow",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    items: { type: Array as PropType<unknown[]>, required: true },
    direction: { type: String as PropType<Direction>, default: "vertical" },
    gap: { type: Number, default: 0 },
    itemSize: { type: Number, default: 1 },
    zIndex: { type: Number, default: 0 },
  },
  setup(props, { slots }) {
    return () =>
      h(
        TView,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: props.h,
          zIndex: props.zIndex,
        },
        () =>
          props.items.map((item, index) => {
            const step =
              Math.max(0, Math.floor(props.itemSize)) + Math.max(0, Math.floor(props.gap));
            const offset = index * step;
            const childProps =
              props.direction === "vertical"
                ? {
                    x: 0,
                    y: offset,
                    w: props.w,
                    h: Math.max(0, Math.floor(props.itemSize)),
                  }
                : {
                    x: offset,
                    y: 0,
                    w: Math.max(0, Math.floor(props.itemSize)),
                    h: props.h,
                  };

            return h(
              TView,
              { key: index, ...childProps },
              () => slots.item?.({ item, index }) ?? null,
            );
          }),
      );
  },
});
