import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, ref, watch } from "vue";
import { TDialog } from "./TDialog.js";
import { TInput } from "./TInput.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { mergeStyle } from "./simple-utils.js";
import { forEachTextCellSegment, sanitizeInlineText, sliceByCells, spaces } from "../utils/text.js";

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

type TCommandPaletteAccentSegment = Readonly<{
  start: number;
  end: number;
  style?: Style;
  highlightStyle?: Style;
}>;

type TCommandPaletteVisualSegment = Readonly<{
  text: string;
  cells: number;
  style: Style | undefined;
}>;

const DEFAULT_MATCH_STYLE: Style = { bold: true, dim: false, underline: true };

function normalizeRanges(
  ranges: readonly TCommandPaletteMatchRange[] | undefined,
): TCommandPaletteMatchRange[] {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];
  const out: TCommandPaletteMatchRange[] = [];
  for (const range of ranges) {
    const start = Math.max(0, Math.trunc(Number(range?.start ?? -1)));
    const end = Math.max(0, Math.trunc(Number(range?.end ?? -1)));
    if (end <= start) continue;
    out.push({ start, end });
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}

function normalizeAccentSegments(
  segments: readonly TCommandPaletteAccentSegment[] | undefined,
): TCommandPaletteAccentSegment[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const out: TCommandPaletteAccentSegment[] = [];
  for (const segment of segments) {
    const start = Math.max(0, Math.trunc(Number(segment?.start ?? -1)));
    const end = Math.max(0, Math.trunc(Number(segment?.end ?? -1)));
    if (end <= start) continue;
    out.push({
      start,
      end,
      style: segment?.style,
      highlightStyle: segment?.highlightStyle,
    });
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}

function shiftRanges(
  ranges: readonly TCommandPaletteMatchRange[],
  offset: number,
): TCommandPaletteMatchRange[] {
  return ranges.map((range) => ({ start: range.start + offset, end: range.end + offset }));
}

function intersects(
  ranges: readonly TCommandPaletteMatchRange[],
  start: number,
  end: number,
): boolean {
  return ranges.some((range) => range.end > start && range.start < end);
}

function findAccentSegment(
  segments: readonly (TCommandPaletteAccentSegment & { resolvedStyle: Style })[],
  start: number,
  end: number,
): Style | undefined {
  return segments.find((segment) => segment.end > start && segment.start < end)?.resolvedStyle;
}

function pushVisualSegment(
  out: TCommandPaletteVisualSegment[],
  text: string,
  cells: number,
  style: Style | undefined,
): void {
  if (!text || cells <= 0) return;
  const previous = out[out.length - 1];
  if (previous && previous.style === style) {
    out[out.length - 1] = {
      text: previous.text + text,
      cells: previous.cells + cells,
      style,
    };
    return;
  }
  out.push({ text, cells, style });
}

function commandPaletteSegments(
  opts: Readonly<{
    text: string;
    detailOffset: number;
    maxCells: number;
    baseStyle: Style | undefined;
    detailStyle: Style | undefined;
    matchRanges: readonly TCommandPaletteMatchRange[];
    labelMatchStyle: Style;
    detailMatchStyle: Style;
    detailAccentRanges: readonly TCommandPaletteMatchRange[];
    detailAccentStyle: Style;
    detailAccentSegments: readonly (TCommandPaletteAccentSegment & { resolvedStyle: Style })[];
  }>,
): TCommandPaletteVisualSegment[] {
  const maxCells = Math.max(0, Math.floor(opts.maxCells));
  if (!opts.text || maxCells <= 0) return [];
  const out: TCommandPaletteVisualSegment[] = [];
  let usedCells = 0;

  forEachTextCellSegment(opts.text, (part) => {
    if (part.cells <= 0) return;
    if (usedCells + part.cells > maxCells) return false;

    const inDetail = part.start >= opts.detailOffset;
    const accentSegmentStyle = inDetail
      ? findAccentSegment(opts.detailAccentSegments, part.start, part.end)
      : undefined;
    const style = intersects(opts.matchRanges, part.start, part.end)
      ? inDetail
        ? opts.detailMatchStyle
        : opts.labelMatchStyle
      : (accentSegmentStyle ??
        (inDetail && intersects(opts.detailAccentRanges, part.start, part.end)
          ? opts.detailAccentStyle
          : inDetail
            ? opts.detailStyle
            : opts.baseStyle));

    pushVisualSegment(out, part.text, part.cells, style);
    usedCells += part.cells;
  });

  return out;
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

    function selectItem(index: number): void {
      const item = filteredItems.value[index] ?? null;
      if (!item || item.disabled) return;
      emit("update:selectedIndex", index);
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
          const baseStyle = selected
            ? (props.highlightStyle ?? props.listStyle)
            : item.disabled
              ? mergeStyle(props.listStyle, { dim: true })
              : props.listStyle;
          const label = sanitizeInlineText(item.label);
          const detail = props.showRowDetails && item.detail ? sanitizeInlineText(item.detail) : "";
          const prefix = selected ? "› " : "  ";
          const detailPrefix = detail ? "  " : "";
          const text = `${prefix}${label}${detailPrefix}${detail}`;
          const labelOffset = prefix.length;
          const detailOffset = labelOffset + label.length + detailPrefix.length;
          const matchStyle = props.matchStyle ?? DEFAULT_MATCH_STYLE;
          const highlightMatchStyle = props.highlightMatchStyle ?? matchStyle;
          const labelMatchStyle = mergeStyle(
            baseStyle,
            selected ? highlightMatchStyle : matchStyle,
          );
          const detailBaseStyle = detail ? mergeStyle(baseStyle, props.detailStyle) : baseStyle;
          const detailMatchStyle = mergeStyle(
            detailBaseStyle,
            selected ? highlightMatchStyle : matchStyle,
          );
          const detailAccentStyle = mergeStyle(
            detailBaseStyle,
            selected ? (item.highlightAccentStyle ?? item.accentStyle) : item.accentStyle,
          );
          const matchRanges = [
            ...shiftRanges(computeCommandPaletteMatchRanges(label, query.value), labelOffset),
            ...shiftRanges(
              detail ? computeCommandPaletteMatchRanges(detail, query.value) : [],
              detailOffset,
            ),
          ];
          const detailAccentRanges = shiftRanges(
            normalizeRanges(detail ? item.detailAccentRanges : undefined),
            detailOffset,
          );
          const detailAccentSegments = normalizeAccentSegments(
            detail ? item.detailAccentSegments : undefined,
          ).map((segment) => ({
            ...segment,
            start: segment.start + detailOffset,
            end: segment.end + detailOffset,
            resolvedStyle: mergeStyle(
              detailBaseStyle,
              selected ? (segment.highlightStyle ?? segment.style) : segment.style,
            ),
          }));
          const rowSegments = commandPaletteSegments({
            text,
            detailOffset: detail ? detailOffset : text.length + 1,
            maxCells: innerW,
            baseStyle,
            detailStyle: detailBaseStyle,
            matchRanges,
            labelMatchStyle,
            detailMatchStyle,
            detailAccentRanges,
            detailAccentStyle,
            detailAccentSegments,
          });
          const rowChildren: any[] = [
            h(TText as any, {
              key: "bg",
              x: 0,
              y: 0,
              w: innerW,
              value: spaces(innerW),
              style: baseStyle,
            }),
          ];
          let x = 0;
          for (let segmentIndex = 0; segmentIndex < rowSegments.length; segmentIndex++) {
            const segment = rowSegments[segmentIndex]!;
            rowChildren.push(
              h(TText as any, {
                key: `segment:${segmentIndex}`,
                x,
                y: 0,
                w: segment.cells,
                value: segment.text,
                style: segment.style,
              }),
            );
            x += segment.cells;
          }
          children.push(
            h(
              TView as any,
              {
                key: `item:${itemIndex}:${item.label}`,
                x: 0,
                y: listY + i,
                w: innerW,
                h: 1,
                focusable: !item.disabled,
                onClick: () => selectItem(itemIndex),
                onKeydown,
              },
              () => rowChildren,
            ),
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
