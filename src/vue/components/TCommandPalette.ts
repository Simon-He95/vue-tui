import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, ref, watch } from "vue";
import { TDialog } from "./TDialog.js";
import { TInput } from "./TInput.js";
import { TText } from "./TText.js";
import { sanitizeInlineText, sliceByCells } from "../utils/text.js";

export type TCommandPaletteMatchRange = Readonly<{
  start: number;
  end: number;
}>;

export type TCommandPaletteItem = Readonly<{
  label: string;
  detail?: string;
  keywords?: readonly string[];
  disabled?: boolean;
  value?: unknown;
  accentStyle?: Style;
  highlightAccentStyle?: Style;
  detailAccentRanges?: readonly TCommandPaletteMatchRange[];
  detailAccentSegments?: readonly Readonly<{
    start: number;
    end: number;
    style?: Style;
    highlightStyle?: Style;
  }>[];
  [key: string]: unknown;
}>;

export function computeCommandPaletteMatchRanges(
  text: string,
  query: string,
): TCommandPaletteMatchRange[] {
  const source = String(text ?? "");
  const needle = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!source || !needle) return [];
  const haystack = source.toLowerCase();
  const ranges: TCommandPaletteMatchRange[] = [];
  let from = 0;
  while (from < haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    ranges.push({ start: index, end: index + needle.length });
    from = index + Math.max(1, needle.length);
  }
  return ranges;
}

export const TCommandPalette = defineComponent({
  name: "TCommandPalette",
  props: {
    modelValue: { type: Boolean, required: true },
    title: { type: String, default: "" },
    initialQuery: { type: String, default: "" },
    items: {
      type: Array as PropType<readonly TCommandPaletteItem[]>,
      required: true,
    },
    selectedIndex: { type: Number, default: 0 },
    showRowDetails: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    noMatchesText: { type: String, default: "No matches" },
    hint: { type: String, default: "" },
    w: { type: Number, default: 72 },
    h: { type: Number, default: 18 },
    chromeStyle: { type: Object as PropType<Style>, default: undefined },
    inputStyle: { type: Object as PropType<Style>, default: undefined },
    listStyle: { type: Object as PropType<Style>, default: undefined },
    bodyStyle: { type: Object as PropType<Style>, default: undefined },
    highlightStyle: { type: Object as PropType<Style>, default: undefined },
    matchStyle: { type: Object as PropType<Style>, default: undefined },
    highlightMatchStyle: { type: Object as PropType<Style>, default: undefined },
    dividerStyle: { type: Object as PropType<Style>, default: undefined },
    hintStyle: { type: Object as PropType<Style>, default: undefined },
    detailStyle: { type: Object as PropType<Style>, default: undefined },
    emptyStyle: { type: Object as PropType<Style>, default: undefined },
  },
  emits: ["update:modelValue", "update:selectedIndex", "select", "close"],
  setup(props, { emit }) {
    const query = ref(props.initialQuery);
    const filteredItems = computed(() => {
      const q = query.value.trim().toLowerCase();
      if (!q) return props.items;
      return props.items.filter((item) => {
        const fields = [item.label, item.detail ?? "", ...(item.keywords ?? [])];
        return fields.some((field) =>
          String(field ?? "")
            .toLowerCase()
            .includes(q),
        );
      });
    });
    const scrollOffset = ref(0);

    function listHeight(): number {
      const dialogH = Math.max(8, Math.floor(props.h));
      const innerH = Math.max(1, dialogH - 4);
      return Math.max(1, innerH - 3);
    }

    function normalizedIndex(index: number): number {
      const len = filteredItems.value.length;
      return len > 0 ? ((index % len) + len) % len : 0;
    }

    function enabledIndexFrom(index: number, direction: 1 | -1): number {
      const len = filteredItems.value.length;
      if (len === 0) return 0;
      const start = normalizedIndex(index);
      if (!filteredItems.value[start]?.disabled) return start;
      for (let step = 1; step < len; step++) {
        const next = normalizedIndex(start + step * direction);
        if (!filteredItems.value[next]?.disabled) return next;
      }
      return start;
    }

    function selectedIndex(): number {
      return enabledIndexFrom(props.selectedIndex, 1);
    }

    function ensureSelectedVisible(index = selectedIndex()): void {
      const len = filteredItems.value.length;
      if (len === 0) {
        scrollOffset.value = 0;
        return;
      }

      const visibleLen = listHeight();
      const maxOffset = Math.max(0, len - visibleLen);
      if (index < scrollOffset.value) scrollOffset.value = index;
      else if (index >= scrollOffset.value + visibleLen) {
        scrollOffset.value = Math.min(maxOffset, index - visibleLen + 1);
      } else {
        scrollOffset.value = Math.min(scrollOffset.value, maxOffset);
      }
    }

    watch(
      () => [props.modelValue, props.initialQuery] as const,
      ([open, initial]) => {
        if (open) query.value = initial;
      },
      { immediate: true },
    );

    watch(
      () => [filteredItems.value.length, props.selectedIndex, props.h] as const,
      () => ensureSelectedVisible(),
      { immediate: true },
    );

    function setSelected(index: number, direction: 1 | -1 = 1): void {
      const next = enabledIndexFrom(index, direction);
      ensureSelectedVisible(next);
      emit("update:selectedIndex", next);
    }

    function close(): void {
      emit("update:modelValue", false);
      emit("close");
    }

    function selectCurrent(): void {
      const item = filteredItems.value[selectedIndex()] ?? null;
      if (!item || item.disabled) return;
      emit("select", item);
    }

    function onKeydown(event: any): void {
      const key = event?.key;
      if (key === "ArrowDown") {
        event.preventDefault?.();
        setSelected(selectedIndex() + 1, 1);
      } else if (key === "ArrowUp") {
        event.preventDefault?.();
        setSelected(selectedIndex() - 1, -1);
      } else if (key === "Enter") {
        event.preventDefault?.();
        selectCurrent();
      } else if (key === "Escape") {
        event.preventDefault?.();
        close();
      }
    }

    return () => {
      if (!props.modelValue) return null;
      const dialogW = Math.max(30, Math.floor(props.w));
      const dialogH = Math.max(8, Math.floor(props.h));
      const innerW = Math.max(1, dialogW - 4);
      const innerH = Math.max(1, dialogH - 4);
      const listY = 2;
      const listH = listHeight();
      const activeIndex = selectedIndex();
      const visibleItems = filteredItems.value.slice(
        scrollOffset.value,
        scrollOffset.value + listH,
      );
      const children = [
        h(TInput as any, {
          key: "input",
          x: 0,
          y: 0,
          w: innerW,
          h: 1,
          modelValue: query.value,
          placeholder: props.placeholder,
          style: props.inputStyle,
          autoFocus: true,
          "onUpdate:modelValue": (value: string) => {
            query.value = value;
            setSelected(0);
          },
          onKeydown,
        }),
      ];

      if (visibleItems.length === 0) {
        children.push(
          h(TText as any, {
            key: "empty",
            x: 0,
            y: listY,
            w: innerW,
            value: sliceByCells(props.noMatchesText, innerW),
            style: props.emptyStyle ?? props.listStyle,
          }),
        );
      } else {
        for (let i = 0; i < visibleItems.length; i++) {
          const item = visibleItems[i]!;
          const itemIndex = scrollOffset.value + i;
          const selected = itemIndex === activeIndex;
          const detail = props.showRowDetails && item.detail ? `  ${item.detail}` : "";
          const label = `${selected ? "› " : "  "}${sanitizeInlineText(item.label)}${sanitizeInlineText(detail)}`;
          children.push(
            h(TText as any, {
              key: `item:${itemIndex}:${item.label}`,
              x: 0,
              y: listY + i,
              w: innerW,
              value: sliceByCells(label, innerW),
              style: selected
                ? (props.highlightStyle ?? props.listStyle)
                : item.disabled
                  ? { ...props.listStyle, dim: true }
                  : props.listStyle,
            }),
          );
        }
      }

      if (props.hint) {
        children.push(
          h(TText as any, {
            key: "hint",
            x: 0,
            y: innerH - 1,
            w: innerW,
            value: sliceByCells(props.hint, innerW),
            style: props.hintStyle,
          }),
        );
      }

      return h(
        TDialog as any,
        {
          modelValue: props.modelValue,
          "onUpdate:modelValue": (value: boolean) => emit("update:modelValue", value),
          w: dialogW,
          h: dialogH,
          title: props.title,
          padding: 1,
          placement: "center",
          backdrop: false,
          closeOnBackdrop: false,
          style: props.chromeStyle,
          contentStyle: props.bodyStyle,
          onClose: close,
        },
        () => children,
      );
    };
  },
});
