import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, onBeforeUnmount, ref, watch } from "vue";
import { TDialog } from "./TDialog.js";
import { TInput } from "./TInput.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { mergeStyle } from "./simple-utils.js";
import {
  forEachTextCellSegment,
  sanitizeInlineText,
  sliceByCells,
  spaces,
  textCellWidth,
} from "../utils/text.js";

export type TCommandPaletteMatchRange = Readonly<{
  start: number;
  end: number;
}>;

export type TCommandPaletteItem = Readonly<{
  kind?: "item" | "separator" | "group";
  label: string;
  detail?: string;
  keywords?: readonly string[];
  disabled?: boolean;
  disabledReason?: string;
  value?: unknown;
  accentStyle?: Style;
  highlightAccentStyle?: Style;
  labelAccentRanges?: readonly TCommandPaletteMatchRange[];
  detailAccentRanges?: readonly TCommandPaletteMatchRange[];
  detailAccentSegments?: readonly Readonly<{
    start: number;
    end: number;
    style?: Style;
    highlightStyle?: Style;
  }>[];
  [key: string]: unknown;
}>;

export type TCommandPaletteMatcherResult = Readonly<{
  score: number;
  labelRanges?: readonly TCommandPaletteMatchRange[];
  detailRanges?: readonly TCommandPaletteMatchRange[];
}>;

export type TCommandPaletteMatcher = (
  item: TCommandPaletteItem,
  query: string,
) => TCommandPaletteMatcherResult | null;

export type TCommandPaletteItemsProvider = (
  query: string,
  ctx: { signal: AbortSignal },
) => Promise<readonly TCommandPaletteItem[]>;

export type TCommandPaletteLoadErrorPayload = Readonly<{
  query: string;
  error: unknown;
}>;

export type TCommandPaletteSelectPayload = Readonly<{
  item: TCommandPaletteItem;
  index: number;
  sourceIndex: number;
  query: string;
  source: "keyboard" | "pointer";
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

function normalizeInteger(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback = 0): number {
  return Math.max(0, normalizeInteger(value, fallback));
}

function normalizeVisibleLimit(value: unknown): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
  return Math.max(1, n);
}

function isCommandPaletteRowSelectable(item: TCommandPaletteItem | undefined): boolean {
  return Boolean(item && item.kind !== "separator" && item.kind !== "group" && !item.disabled);
}

function substringMatcher(
  item: TCommandPaletteItem,
  query: string,
): TCommandPaletteMatcherResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0 };
  const labelRanges = computeCommandPaletteMatchRanges(item.label, q);
  const keywordMatch = (item.keywords ?? []).some((keyword) =>
    String(keyword ?? "")
      .toLowerCase()
      .includes(q),
  );
  if (!labelRanges.length && !keywordMatch) return null;
  return {
    score: labelRanges.length ? 100 : 10,
    labelRanges,
  };
}

function fuzzyMatcher(
  item: TCommandPaletteItem,
  query: string,
): TCommandPaletteMatcherResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0 };
  const source = `${item.label} ${(item.keywords ?? []).join(" ")}`.toLowerCase();
  let pos = 0;
  for (const ch of q) {
    const next = source.indexOf(ch, pos);
    if (next < 0) return null;
    pos = next + 1;
  }
  return {
    score: Math.max(1, 100 - pos),
    labelRanges: computeCommandPaletteMatchRanges(item.label, query),
  };
}

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

function visualSegmentsCellWidth(segments: readonly TCommandPaletteVisualSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.cells, 0);
}

function detailStyleForRow(
  baseStyle: Style | undefined,
  detailStyle: Style | undefined,
  selected: boolean,
): Style | undefined {
  const merged = mergeStyle(baseStyle, detailStyle);
  if (!selected || baseStyle?.bg == null) return merged;
  return mergeStyle(merged, { bg: baseStyle.bg });
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
    labelAccentRanges: readonly TCommandPaletteMatchRange[];
    labelAccentStyle: Style;
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
          : !inDetail && intersects(opts.labelAccentRanges, part.start, part.end)
            ? opts.labelAccentStyle
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
    query: { type: String, default: undefined },
    initialQuery: { type: String, default: "" },
    items: {
      type: Array as PropType<readonly TCommandPaletteItem[]>,
      default: () => [],
    },
    itemsProvider: {
      type: Function as PropType<TCommandPaletteItemsProvider>,
      default: undefined,
    },
    matcher: {
      type: Function as PropType<TCommandPaletteMatcher>,
      default: undefined,
    },
    filterStrategy: {
      type: String as PropType<"substring" | "fuzzy">,
      default: "substring",
    },
    selectedIndex: { type: Number, default: undefined },
    showRowDetails: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    noMatchesText: { type: String, default: "No matches" },
    loadingText: { type: String, default: "Loading..." },
    errorText: { type: String, default: "Unable to load commands" },
    hint: { type: String, default: "" },
    debounce: { type: Number, default: 0 },
    minQueryLength: { type: Number, default: 0 },
    maxVisibleItems: { type: Number, default: undefined },
    closeOnSelect: { type: Boolean, default: false },
    resetQueryOnClose: { type: Boolean, default: false },
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
  emits: {
    "update:modelValue": (_value: boolean) => true,
    "update:query": (_value: string) => true,
    "update:selectedIndex": (_index: number) => true,
    select: (_payload: TCommandPaletteSelectPayload) => true,
    loadError: (_payload: TCommandPaletteLoadErrorPayload) => true,
    close: () => true,
  },
  setup(props, { emit }) {
    const innerQuery = ref(props.query ?? props.initialQuery);
    const innerSelectedIndex = ref(0);
    const providerItems = ref<readonly TCommandPaletteItem[] | null>(null);
    const providerLoading = ref(false);
    const providerError = ref<string | null>(null);
    const scrollOffset = ref(0);
    let providerAbort: AbortController | null = null;
    let providerTimer: ReturnType<typeof setTimeout> | null = null;
    let suppressNextDialogClose = false;

    const query = computed(() => props.query ?? innerQuery.value);
    const filteredEntries = computed(() => {
      const q = query.value.trim();
      const sourceItems = props.itemsProvider ? (providerItems.value ?? []) : props.items;
      const matcher =
        props.matcher ?? (props.filterStrategy === "fuzzy" ? fuzzyMatcher : substringMatcher);
      const entries = sourceItems.flatMap((item, sourceIndex) => {
        if (item.kind === "separator" || item.kind === "group") {
          return q
            ? []
            : [{ item, sourceIndex, match: { score: 0 } as TCommandPaletteMatcherResult }];
        }
        const match = matcher(item, q);
        return match ? [{ item, sourceIndex, match }] : [];
      });
      entries.sort((a, b) => b.match.score - a.match.score || a.sourceIndex - b.sourceIndex);
      return entries;
    });

    function setQuery(value: string): void {
      innerQuery.value = value;
      emit("update:query", value);
    }

    function listHeight(): number {
      const dialogH = Math.max(8, normalizeInteger(props.h, 18));
      const innerH = Math.max(1, dialogH - 4);
      const maxVisible = normalizeVisibleLimit(props.maxVisibleItems);
      return Math.max(1, Math.min(innerH - 3, maxVisible));
    }

    function normalizedIndex(index: number): number {
      const len = filteredEntries.value.length;
      const value = normalizeInteger(index, 0);
      return len > 0 ? ((value % len) + len) % len : 0;
    }

    function enabledIndexFrom(index: number, direction: 1 | -1): number {
      const len = filteredEntries.value.length;
      if (len === 0) return 0;
      const start = normalizedIndex(index);
      if (isCommandPaletteRowSelectable(filteredEntries.value[start]?.item)) return start;
      for (let step = 1; step < len; step++) {
        const next = normalizedIndex(start + step * direction);
        if (isCommandPaletteRowSelectable(filteredEntries.value[next]?.item)) return next;
      }
      return start;
    }

    function selectedIndex(): number {
      return enabledIndexFrom(props.selectedIndex ?? innerSelectedIndex.value, 1);
    }

    function ensureSelectedVisible(index = selectedIndex()): void {
      const len = filteredEntries.value.length;
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
        if (open) {
          suppressNextDialogClose = false;
          if (props.query == null) innerQuery.value = initial;
          return;
        }

        if (props.resetQueryOnClose && query.value !== "") setQuery("");
      },
      { immediate: true },
    );

    watch(
      () =>
        [
          filteredEntries.value.length,
          query.value,
          props.selectedIndex,
          props.h,
          props.maxVisibleItems,
        ] as const,
      () => {
        const next = selectedIndex();
        innerSelectedIndex.value = next;
        ensureSelectedVisible(next);
      },
      { immediate: true },
    );

    function setSelected(index: number, direction: 1 | -1 = 1): void {
      const next = enabledIndexFrom(index, direction);
      innerSelectedIndex.value = next;
      ensureSelectedVisible(next);
      emit("update:selectedIndex", next);
    }

    function resetSelectedAfterQueryInput(): void {
      innerSelectedIndex.value = 0;
      scrollOffset.value = 0;
      emit("update:selectedIndex", 0);
    }

    function close(): void {
      suppressNextDialogClose = true;
      emit("update:modelValue", false);
      emit("close");
      queueMicrotask(() => {
        if (props.modelValue) suppressNextDialogClose = false;
      });
    }

    function handleDialogClose(): void {
      if (suppressNextDialogClose) {
        suppressNextDialogClose = false;
        return;
      }
      emit("close");
    }

    function selectCurrent(source: "keyboard" | "pointer" = "keyboard"): void {
      const index = selectedIndex();
      const entry = filteredEntries.value[index];
      const item = entry?.item ?? null;
      if (!entry || !isCommandPaletteRowSelectable(item)) return;
      emit("select", { item, index, sourceIndex: entry.sourceIndex, query: query.value, source });
      if (props.closeOnSelect) close();
    }

    function selectItem(index: number): void {
      const entry = filteredEntries.value[index];
      const item = entry?.item ?? null;
      if (!entry || !isCommandPaletteRowSelectable(item)) return;
      innerSelectedIndex.value = index;
      emit("update:selectedIndex", index);
      emit("select", {
        item,
        index,
        sourceIndex: entry.sourceIndex,
        query: query.value,
        source: "pointer",
      });
      if (props.closeOnSelect) close();
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
        selectCurrent("keyboard");
      } else if (key === "Escape") {
        event.preventDefault?.();
        close();
      }
    }

    watch(
      () =>
        [
          props.modelValue,
          query.value,
          props.itemsProvider,
          props.debounce,
          props.minQueryLength,
        ] as const,
      ([open, q, provider]) => {
        if (providerTimer) {
          clearTimeout(providerTimer);
          providerTimer = null;
        }
        providerAbort?.abort();
        providerAbort = null;
        providerError.value = null;
        if (!provider || !open) {
          providerItems.value = null;
          providerLoading.value = false;
          return;
        }
        const minQueryLength = normalizeNonNegativeInteger(props.minQueryLength, 0);
        if (q.trim().length < minQueryLength) {
          providerItems.value = [];
          providerLoading.value = false;
          return;
        }
        providerItems.value = [];
        providerLoading.value = true;

        const run = () => {
          const controller = new AbortController();
          providerAbort = controller;
          let request: Promise<readonly TCommandPaletteItem[]>;
          try {
            request = provider(q, { signal: controller.signal });
          } catch (error) {
            request = Promise.reject(error);
          }
          void request
            .then((items) => {
              if (controller.signal.aborted) return;
              providerItems.value = items;
              providerError.value = null;
            })
            .catch((error: unknown) => {
              if (controller.signal.aborted) return;
              providerItems.value = [];
              providerError.value = error instanceof Error ? error.message : String(error);
              emit("loadError", { query: q, error });
            })
            .finally(() => {
              if (!controller.signal.aborted) providerLoading.value = false;
            });
        };

        const delay = normalizeNonNegativeInteger(props.debounce, 0);
        if (delay > 0) providerTimer = setTimeout(run, delay);
        else run();
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      if (providerTimer) clearTimeout(providerTimer);
      providerAbort?.abort();
    });

    return () => {
      if (!props.modelValue) return null;
      const dialogW = Math.max(30, normalizeInteger(props.w, 72));
      const dialogH = Math.max(8, normalizeInteger(props.h, 18));
      const innerW = Math.max(1, dialogW - 4);
      const innerH = Math.max(1, dialogH - 4);
      const listY = 2;
      const listH = listHeight();
      const activeIndex = selectedIndex();
      const visibleItems = filteredEntries.value.slice(
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
            setQuery(value);
            resetSelectedAfterQueryInput();
          },
          onKeydown,
        }),
      ];

      if (providerLoading.value) {
        children.push(
          h(TText as any, {
            key: "loading",
            x: 0,
            y: listY,
            w: innerW,
            value: sliceByCells(props.loadingText, innerW),
            style: props.emptyStyle ?? props.listStyle,
          }),
        );
      } else if (providerError.value) {
        children.push(
          h(TText as any, {
            key: "error",
            x: 0,
            y: listY,
            w: innerW,
            value: sliceByCells(props.errorText || providerError.value, innerW),
            style: props.emptyStyle ?? props.listStyle,
          }),
        );
      } else if (visibleItems.length === 0) {
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
          const entry = visibleItems[i]!;
          const item = entry.item;
          const itemIndex = scrollOffset.value + i;
          const selected = itemIndex === activeIndex;
          const selectable = isCommandPaletteRowSelectable(item);
          const baseStyle = selected
            ? (props.highlightStyle ?? props.listStyle)
            : !selectable && item.kind !== "group" && item.kind !== "separator"
              ? mergeStyle(props.listStyle, { dim: true })
              : props.listStyle;
          if (item.kind === "separator") {
            children.push(
              h(TText as any, {
                key: `separator:${itemIndex}:${item.label}`,
                x: 0,
                y: listY + i,
                w: innerW,
                value: item.label
                  ? sliceByCells(
                      `-- ${sanitizeInlineText(item.label)} ${"-".repeat(innerW)}`,
                      innerW,
                    )
                  : "-".repeat(innerW),
                style: mergeStyle(props.dividerStyle ?? props.listStyle, { dim: true }),
              }),
            );
            continue;
          }
          if (item.kind === "group") {
            children.push(
              h(TText as any, {
                key: `group:${itemIndex}:${item.label}`,
                x: 0,
                y: listY + i,
                w: innerW,
                value: sliceByCells(sanitizeInlineText(item.label), innerW),
                style: mergeStyle(props.detailStyle ?? props.listStyle, { bold: true }),
              }),
            );
            continue;
          }
          const label = sanitizeInlineText(item.label);
          const disabledReason = item.disabled && item.disabledReason ? item.disabledReason : "";
          const detailSource = disabledReason || item.detail || "";
          const detail =
            props.showRowDetails && detailSource ? sanitizeInlineText(detailSource) : "";
          const prefix = selected ? "› " : "  ";
          const labelText = `${prefix}${label}`;
          const labelOffset = prefix.length;
          const matchStyle = props.matchStyle ?? DEFAULT_MATCH_STYLE;
          const highlightMatchStyle = props.highlightMatchStyle ?? matchStyle;
          const labelMatchStyle = mergeStyle(
            baseStyle,
            selected ? highlightMatchStyle : matchStyle,
          );
          const detailBaseStyle = detail
            ? detailStyleForRow(baseStyle, props.detailStyle, selected)
            : baseStyle;
          const detailMatchStyle = mergeStyle(
            detailBaseStyle,
            selected ? highlightMatchStyle : matchStyle,
          );
          const labelAccentStyle = mergeStyle(
            baseStyle,
            selected ? (item.highlightAccentStyle ?? item.accentStyle) : item.accentStyle,
          );
          const detailAccentStyle = mergeStyle(
            detailBaseStyle,
            selected ? (item.highlightAccentStyle ?? item.accentStyle) : item.accentStyle,
          );
          const matchRanges = [
            ...shiftRanges(
              normalizeRanges(
                entry.match.labelRanges ?? computeCommandPaletteMatchRanges(label, query.value),
              ),
              labelOffset,
            ),
          ];
          const labelAccentRanges = shiftRanges(
            normalizeRanges(item.labelAccentRanges),
            labelOffset,
          );
          const detailAccentRanges = normalizeRanges(detail ? item.detailAccentRanges : undefined);
          const detailAccentSegments = normalizeAccentSegments(
            detail ? item.detailAccentSegments : undefined,
          ).map((segment) => {
            const merged = mergeStyle(
              detailBaseStyle,
              selected ? (segment.highlightStyle ?? segment.style) : segment.style,
            );
            return {
              ...segment,
              resolvedStyle:
                selected && detailBaseStyle?.bg != null
                  ? mergeStyle(merged, { bg: detailBaseStyle.bg })
                  : merged,
            };
          });
          const labelTextCells = textCellWidth(labelText);
          const detailMaxCells = detail
            ? Math.max(0, innerW - Math.min(labelTextCells, innerW) - 1)
            : 0;
          const detailSegments = detail
            ? commandPaletteSegments({
                text: detail,
                detailOffset: 0,
                maxCells: detailMaxCells,
                baseStyle: detailBaseStyle,
                detailStyle: detailBaseStyle,
                matchRanges: normalizeRanges(entry.match.detailRanges),
                labelMatchStyle,
                detailMatchStyle,
                labelAccentRanges: [],
                labelAccentStyle: baseStyle ?? {},
                detailAccentRanges,
                detailAccentStyle,
                detailAccentSegments,
              })
            : [];
          const detailCells = visualSegmentsCellWidth(detailSegments);
          const detailX = detailCells > 0 ? innerW - detailCells : innerW;
          const labelMaxCells = detailCells > 0 ? Math.max(0, detailX - 1) : innerW;
          const labelSegments = commandPaletteSegments({
            text: labelText,
            detailOffset: labelText.length + 1,
            maxCells: labelMaxCells,
            baseStyle,
            detailStyle: baseStyle,
            matchRanges,
            labelMatchStyle,
            detailMatchStyle: labelMatchStyle,
            labelAccentRanges,
            labelAccentStyle,
            detailAccentRanges: [],
            detailAccentStyle: baseStyle ?? {},
            detailAccentSegments: [],
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
          for (let segmentIndex = 0; segmentIndex < labelSegments.length; segmentIndex++) {
            const segment = labelSegments[segmentIndex]!;
            rowChildren.push(
              h(TText as any, {
                key: `label-segment:${segmentIndex}`,
                x,
                y: 0,
                w: segment.cells,
                value: segment.text,
                style: segment.style,
              }),
            );
            x += segment.cells;
          }
          for (
            let segmentIndex = 0, detailSegmentX = detailX;
            segmentIndex < detailSegments.length;
            segmentIndex++
          ) {
            const segment = detailSegments[segmentIndex]!;
            rowChildren.push(
              h(TText as any, {
                key: `detail-segment:${segmentIndex}`,
                x: detailSegmentX,
                y: 0,
                w: segment.cells,
                value: segment.text,
                style: segment.style,
              }),
            );
            detailSegmentX += segment.cells;
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
                focusable: selectable,
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
          onClose: handleDialogClose,
        },
        () => children,
      );
    };
  },
});
