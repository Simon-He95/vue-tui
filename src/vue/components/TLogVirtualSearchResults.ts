import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { RowScrollMode } from "./TVirtualList.js";
import type {
  TLogSearchResultItem,
  TLogSearchResultsActiveChangePayload,
  TLogSearchResultsSelectPayload,
} from "./TLogSearchResults.js";
import { computed, defineComponent, h } from "vue";
import { textCellWidth } from "../utils/text.js";
import { TVirtualList } from "./TVirtualList.js";

function sliceByCells(text: string, start: number, end: number): string {
  let cells = 0;
  let out = "";
  for (const ch of text) {
    const width = Math.max(1, textCellWidth(ch));
    const next = cells + width;
    if (next > start && cells < end) out += ch;
    cells = next;
    if (cells >= end) break;
  }
  return out;
}

function formatItem(
  item: TLogSearchResultItem | null,
  width: number,
  showLineNumbers: boolean,
): string {
  if (!item) return "";
  const currentPrefix = item.current ? "*" : " ";
  const linePrefix = showLineNumbers ? `${String(item.absoluteLineIndex).padStart(5, " ")} ` : "";
  const before = sliceByCells(item.text, 0, item.matchStartCell);
  const match = sliceByCells(item.text, item.matchStartCell, item.matchEndCell);
  const after = sliceByCells(item.text, item.matchEndCell, Number.MAX_SAFE_INTEGER);
  const formatted = `${currentPrefix}${linePrefix}${before}[${match}]${after}`;
  return formatted.slice(0, Math.max(0, width));
}

export const TLogVirtualSearchResults = defineComponent({
  name: "TLogVirtualSearchResults",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    itemCount: { type: Number, required: true },
    itemVersion: { type: Number, required: true },
    getItem: {
      type: Function as PropType<(index: number) => TLogSearchResultItem | null>,
      required: true,
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
  emits: ["update:modelValue", "activeChange", "select", "focus", "blur", "keydown", "scroll"],
  setup(props, { emit }) {
    const model = computed({
      get: () => props.modelValue,
      set: (value: number) => {
        emit("update:modelValue", value);
        emit("activeChange", {
          activeIndex: value,
          result: value >= 0 ? props.getItem(value) : null,
        } satisfies TLogSearchResultsActiveChangePayload);
      },
    });

    return () =>
      h(TVirtualList, {
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        itemCount: props.itemCount,
        itemVersion: props.itemVersion,
        getItem: props.getItem,
        renderItem: (item: unknown) =>
          formatItem((item as TLogSearchResultItem | null) ?? null, props.w, props.showLineNumbers),
        modelValue: model.value,
        style: props.style,
        activeStyle: props.activeStyle,
        rowScrollMode: props.rowScrollMode,
        "onUpdate:modelValue": (value: number) => {
          model.value = value;
        },
        onItemClick: ({ value }: { index: number; value: TLogSearchResultItem | null }) => {
          if (!value) return;
          emit("select", {
            matchIndex: value.matchIndex,
            result: value,
          } satisfies TLogSearchResultsSelectPayload);
        },
        onChange: ({ value }: { index: number; value: TLogSearchResultItem | null }) => {
          if (!value) return;
          emit("select", {
            matchIndex: value.matchIndex,
            result: value,
          } satisfies TLogSearchResultsSelectPayload);
        },
        onFocus: () => emit("focus"),
        onBlur: () => emit("blur"),
        onKeydown: (event: unknown) => emit("keydown", event),
        onScroll: (top: number) => emit("scroll", top),
      });
  },
});
