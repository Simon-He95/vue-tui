import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { RowScrollMode } from "./TVirtualList.js";
import type {
  TLogLinkPanelItem,
  TLogLinksPanelActivatePayload,
  TLogLinksPanelActiveChangePayload,
  TLogLinksPanelSelectPayload,
} from "./TLogLinksPanel.js";
import { computed, defineComponent, h } from "vue";
import { TVirtualList } from "./TVirtualList.js";

function formatItem(
  item: TLogLinkPanelItem | null,
  width: number,
  showLineNumbers: boolean,
): string {
  if (!item) return "";
  const currentPrefix = item.current ? "*" : " ";
  const linePrefix = showLineNumbers ? `${String(item.absoluteLineIndex).padStart(5, " ")} ` : "";
  const formatted = `${currentPrefix}${linePrefix}${item.text} -> ${item.href}`;
  return formatted.slice(0, Math.max(0, width));
}

export const TLogVirtualLinksPanel = defineComponent({
  name: "TLogVirtualLinksPanel",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    links: {
      type: Array as PropType<readonly TLogLinkPanelItem[]>,
      default: () => [],
    },
    modelValue: { type: Number, default: -1 },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    showLineNumbers: { type: Boolean, default: true },
    rowScrollMode: {
      type: String as PropType<RowScrollMode>,
      default: "off",
    },
  },
  emits: [
    "update:modelValue",
    "activeChange",
    "select",
    "activate",
    "focus",
    "blur",
    "keydown",
    "scroll",
  ],
  setup(props, { emit }) {
    const model = computed({
      get: () => props.modelValue,
      set: (value: number) => {
        emit("update:modelValue", value);
        emit("activeChange", {
          activeIndex: value,
          item: value >= 0 ? (props.links[value] ?? null) : null,
        } satisfies TLogLinksPanelActiveChangePayload);
      },
    });

    return () =>
      h(TVirtualList, {
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        itemCount: props.links.length,
        itemVersion:
          props.links.length + props.links.reduce((sum, item) => sum + (item.current ? 1 : 0), 0),
        getItem: (index: number) => props.links[index] ?? null,
        renderItem: (item: unknown) =>
          formatItem((item as TLogLinkPanelItem | null) ?? null, props.w, props.showLineNumbers),
        modelValue: model.value,
        style: props.style,
        activeStyle: props.activeStyle,
        rowScrollMode: props.rowScrollMode,
        "onUpdate:modelValue": (value: number) => {
          model.value = value;
        },
        onItemClick: ({ value }: { index: number; value: TLogLinkPanelItem | null }) => {
          if (!value) return;
          emit("select", {
            visibleIndex: value.visibleIndex,
            item: value,
          } satisfies TLogLinksPanelSelectPayload);
        },
        onChange: ({ value }: { index: number; value: TLogLinkPanelItem | null }) => {
          if (!value) return;
          emit("activate", {
            visibleIndex: value.visibleIndex,
            item: value,
          } satisfies TLogLinksPanelActivatePayload);
        },
        onFocus: () => emit("focus"),
        onBlur: () => emit("blur"),
        onKeydown: (event: unknown) => emit("keydown", event),
        onScroll: (top: number) => emit("scroll", top),
      });
  },
});
