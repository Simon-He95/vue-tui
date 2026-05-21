import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { TBox } from "./TBox.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { clamp, fitCellText, mergeStyle } from "./simple-utils.js";

export type TContextMenuItem = Readonly<{
  id: string;
  label: string;
  disabled?: boolean;
  shortcut?: string;
  data?: unknown;
}>;

export type TContextMenuSelectPayload = Readonly<{
  item: TContextMenuItem;
  index: number;
}>;

export const TContextMenu = defineComponent({
  name: "TContextMenu",
  props: {
    modelValue: { type: Boolean, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, default: 24 },
    zIndex: { type: Number, default: 20 },
    items: {
      type: Array as PropType<readonly TContextMenuItem[]>,
      required: true,
    },
    selectedIndex: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    "update:modelValue": (_value: boolean) => true,
    "update:selectedIndex": (_index: number) => true,
    select: (_payload: TContextMenuSelectPayload) => true,
    close: () => true,
  },
  setup(props, { emit }) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    function close(): void {
      emit("update:modelValue", false);
      emit("close");
    }

    function select(index: number): void {
      const item = props.items[index];
      if (!item || item.disabled) return;
      emit("select", { item, index });
      close();
    }

    function firstEnabledIndex(): number {
      return props.items.findIndex((item) => !item.disabled);
    }

    function selectedIndex(): number {
      if (!props.items.length) return 0;
      const clamped = clamp(props.selectedIndex, 0, props.items.length - 1);
      if (!props.items[clamped]?.disabled) return clamped;
      const first = firstEnabledIndex();
      return first >= 0 ? first : clamped;
    }

    function nextEnabledIndex(index: number, direction: 1 | -1): number {
      let next = index + direction;
      while (next >= 0 && next < props.items.length) {
        if (!props.items[next]?.disabled) return next;
        next += direction;
      }
      return index;
    }

    return () => {
      if (!props.modelValue) return null;
      const hgt = Math.max(2, props.items.length + 2);
      const activeIndex = selectedIndex();
      return h(
        TBox as any,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: hgt,
          zIndex: props.zIndex,
          style: baseStyle.value,
        },
        () =>
          props.items.map((item, index) => {
            const active = index === activeIndex;
            const text = item.shortcut ? `${item.label} ${item.shortcut}` : item.label;
            return h(
              TView as any,
              {
                key: item.id,
                x: 0,
                y: index,
                w: Math.max(1, props.w - 2),
                h: 1,
                focusable: !item.disabled,
                autoFocus: active && !item.disabled,
                onClick: () => select(index),
                onKeydown: (event: any) => {
                  if (event.key === "Escape") {
                    event.preventDefault?.();
                    close();
                  } else if (event.key === "Enter") {
                    event.preventDefault?.();
                    select(selectedIndex());
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault?.();
                    emit("update:selectedIndex", nextEnabledIndex(selectedIndex(), 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault?.();
                    emit("update:selectedIndex", nextEnabledIndex(selectedIndex(), -1));
                  }
                },
              },
              () =>
                h(TText as any, {
                  x: 0,
                  y: 0,
                  w: Math.max(1, props.w - 2),
                  value: fitCellText(text, Math.max(1, props.w - 2)),
                  style: item.disabled
                    ? mergeStyle(baseStyle.value, props.disabledStyle)
                    : active
                      ? mergeStyle(baseStyle.value, props.activeStyle)
                      : baseStyle.value,
                }),
            );
          }),
      );
    };
  },
});

export const TPopover = defineComponent({
  name: "TPopover",
  props: {
    modelValue: { type: Boolean, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 15 },
    title: { type: String, default: "" },
    content: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: undefined },
    contentStyle: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props, { slots }) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const contentStyle = computed(() => mergeStyle(defaultStyle.value, props.contentStyle));

    return () =>
      props.modelValue
        ? h(
            TBox as any,
            {
              x: props.x,
              y: props.y,
              w: props.w,
              h: props.h,
              zIndex: props.zIndex,
              title: props.title,
              style: baseStyle.value,
            },
            () =>
              slots.default?.() ??
              h(TText as any, {
                x: 0,
                y: 0,
                w: Math.max(1, props.w - 2),
                h: Math.max(1, props.h - 2),
                value: props.content,
                wrap: true,
                style: contentStyle.value,
              }),
          )
        : null;
  },
});

export const TTooltip = defineComponent({
  name: "TTooltip",
  props: {
    modelValue: { type: Boolean, default: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, default: undefined },
    zIndex: { type: Number, default: 30 },
    content: { type: String, required: true },
    style: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    return () =>
      props.modelValue
        ? h(TText as any, {
            x: props.x,
            y: props.y,
            zIndex: props.zIndex,
            w: props.w,
            value: props.content,
            style: baseStyle.value,
          })
        : null;
  },
});
