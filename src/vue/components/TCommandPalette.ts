import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { SelectOption } from "./TSelect.js";
import { computed, defineComponent, h, ref, watch } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useTerminal } from "../composables/use-terminal.js";
import { wrapByCells } from "../utils/text.js";
import { TBox } from "./TBox.js";
import { TInput } from "./TInput.js";
import { TSelect } from "./TSelect.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

export type TCommandPaletteTextRange = Readonly<{ start: number; end: number }>;

export type TCommandPaletteTextAccentSegment = Readonly<{
  start: number;
  end: number;
  style?: Style;
  highlightStyle?: Style;
}>;

export type TCommandPaletteItem = Readonly<{
  kind?: "separator";
  id?: string;
  label: string;
  title?: string;
  detail?: string;
  subtitle?: string;
  keywords?: readonly string[];
  style?: Style;
  highlightStyle?: Style;
  detailStyle?: Style;
  highlightDetailStyle?: Style;
  labelAccentRanges?: readonly TCommandPaletteTextRange[];
  detailAccentRanges?: readonly TCommandPaletteTextRange[];
  detailAccentSegments?: readonly TCommandPaletteTextAccentSegment[];
  accentStyle?: Style;
  highlightAccentStyle?: Style;
  meta?: unknown;
}>;

export type TCommandPaletteFilteredItem = Readonly<{
  index: number;
  item: TCommandPaletteItem;
  score: number;
  labelHighlightRanges: readonly TCommandPaletteTextRange[];
  detailHighlightRanges: readonly TCommandPaletteTextRange[];
}>;

export type TCommandPaletteFilter = (
  items: readonly TCommandPaletteItem[],
  query: string,
) => readonly TCommandPaletteFilteredItem[];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function scoreCommandPaletteMatch(candidate: string, query: string): number | null {
  const c = candidate.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (c === q) return 10_000;
  if (c.startsWith(q)) return 5_000 - c.length;
  const idx = c.indexOf(q);
  if (idx >= 0) return 2_000 - idx;

  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < c.length && qi < q.length; i++) {
    if (c[i] === q[qi]) {
      qi++;
      streak++;
      score += 10 + streak * 5;
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return null;
  return score;
}

export function computeCommandPaletteMatchRanges(
  text: string,
  query: string,
): TCommandPaletteTextRange[] {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q) return [];

  const source = String(text ?? "");
  if (!source) return [];
  const lower = source.toLowerCase();

  const exactIdx = lower.indexOf(q);
  if (exactIdx >= 0) return [{ start: exactIdx, end: exactIdx + q.length }];

  const positions: number[] = [];
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      positions.push(i);
      qi++;
    }
  }
  if (qi < q.length) return [];

  const ranges: TCommandPaletteTextRange[] = [];
  let start = positions[0]!;
  let prev = positions[0]!;
  for (let i = 1; i < positions.length; i++) {
    const pos = positions[i]!;
    if (pos === prev + 1) {
      prev = pos;
      continue;
    }
    ranges.push({ start, end: prev + 1 });
    start = pos;
    prev = pos;
  }
  ranges.push({ start, end: prev + 1 });
  return ranges;
}

export function filterCommandPaletteItems(
  items: readonly TCommandPaletteItem[],
  query: string,
): TCommandPaletteFilteredItem[] {
  const q = query.trim();
  const out: TCommandPaletteFilteredItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.kind === "separator") {
      if (q) continue;
      out.push({
        index: i,
        item,
        score: 0,
        labelHighlightRanges: [],
        detailHighlightRanges: [],
      });
      continue;
    }
    const label = item.title ?? item.label;
    const detail = item.subtitle ?? item.detail ?? "";
    const keywords = (item.keywords ?? []).filter(Boolean).join(" ");
    const hay = `${label} ${detail} ${keywords}`.trim();
    const score = scoreCommandPaletteMatch(hay, q);
    if (score == null) continue;
    out.push({
      index: i,
      item,
      score,
      labelHighlightRanges: computeCommandPaletteMatchRanges(label, q),
      detailHighlightRanges: computeCommandPaletteMatchRanges(detail, q),
    });
  }
  out.sort((a, b) => b.score - a.score || a.index - b.index);
  return out;
}

function selectedFilteredIndex(
  filtered: readonly TCommandPaletteFilteredItem[],
  selectedIndex: number,
): number {
  const idx = filtered.findIndex((x) => x.index === selectedIndex);
  return idx >= 0 ? idx : 0;
}

export const TCommandPalette = defineComponent({
  name: "TCommandPalette",
  props: {
    modelValue: { type: Boolean, required: true },
    title: { type: String, default: "Command Palette" },
    initialQuery: { type: String, default: "" },
    items: {
      type: Array as PropType<readonly TCommandPaletteItem[]>,
      required: true,
    },
    selectedIndex: { type: Number, default: 0 },
    showRowDetails: { type: Boolean, default: false },
    placeholder: { type: String, default: "Search commands" },
    noMatchesText: { type: String, default: "No matches" },
    hint: { type: String, default: "Enter select   Esc close   Up/Down move" },
    widthRatio: { type: Number, default: 0.78 },
    heightRatio: { type: Number, default: 0.78 },
    minWidth: { type: Number, default: 44 },
    minHeight: { type: Number, default: 12 },
    maxVerticalMargin: { type: Number, default: 4 },
    zIndex: { type: Number, default: 100 },
    filter: {
      type: Function as PropType<TCommandPaletteFilter>,
      default: undefined,
    },
    chromeStyle: { type: Object as PropType<Style>, default: undefined },
    bodyStyle: { type: Object as PropType<Style>, default: undefined },
    inputStyle: { type: Object as PropType<Style>, default: undefined },
    listStyle: { type: Object as PropType<Style>, default: undefined },
    highlightStyle: { type: Object as PropType<Style>, default: undefined },
    matchStyle: { type: Object as PropType<Style>, default: undefined },
    highlightMatchStyle: { type: Object as PropType<Style>, default: undefined },
    dividerStyle: { type: Object as PropType<Style>, default: undefined },
    hintStyle: { type: Object as PropType<Style>, default: undefined },
    detailStyle: { type: Object as PropType<Style>, default: undefined },
    emptyStyle: { type: Object as PropType<Style>, default: undefined },
  },
  emits: {
    "update:modelValue": (_v: boolean) => true,
    "update:selectedIndex": (_v: number) => true,
    "update:query": (_v: string) => true,
    select: (_item: TCommandPaletteItem | null, _index: number | null) => true,
    close: () => true,
  },
  setup(props, { emit }) {
    const layout = useLayout();
    const { terminal } = useTerminal();
    const query = ref("");
    const inputFocusEpoch = ref(0);
    const localSelectedIndex = ref(0);
    let focusRetrySeq = 0;

    const cols = computed(() => layout.clipRect?.w ?? terminal.size().cols);
    const rows = computed(() => layout.clipRect?.h ?? terminal.size().rows);

    watch(
      () => [props.modelValue, props.initialQuery] as const,
      ([open]) => {
        if (open) {
          const initialQuery = String(props.initialQuery ?? "");
          query.value = initialQuery;
          localSelectedIndex.value = clamp(
            Math.trunc(Number(props.selectedIndex ?? 0)),
            0,
            Math.max(0, props.items.length - 1),
          );
          inputFocusEpoch.value += 1;
          const retrySeq = ++focusRetrySeq;
          setTimeout(() => {
            if (props.modelValue && retrySeq === focusRetrySeq && query.value === initialQuery) {
              inputFocusEpoch.value += 1;
            }
          }, 0);
          return;
        }
        focusRetrySeq += 1;
        query.value = String(props.initialQuery ?? "");
      },
      { immediate: true },
    );

    watch(
      () => [props.modelValue, props.selectedIndex, props.items.length] as const,
      ([open, selectedIndex]) => {
        if (!open) return;
        localSelectedIndex.value = clamp(
          Math.trunc(Number(selectedIndex ?? 0)),
          0,
          Math.max(0, props.items.length - 1),
        );
      },
    );

    const filtered = computed(() =>
      (props.filter ?? filterCommandPaletteItems)(props.items ?? [], query.value),
    );

    const currentSelectedFilteredIndex = computed(() =>
      selectedFilteredIndex(filtered.value, localSelectedIndex.value),
    );

    function close(): void {
      query.value = String(props.initialQuery ?? "");
      emit("update:modelValue", false);
      emit("close");
    }

    function isSelectable(index: number): boolean {
      const item = filtered.value[index]?.item;
      return Boolean(item && item.kind !== "separator");
    }

    function nextSelectableIndex(start: number, delta: number): number | null {
      const list = filtered.value;
      if (!list.length) return null;
      const step = delta >= 0 ? 1 : -1;
      for (let offset = 1; offset <= list.length; offset++) {
        const next = (start + step * offset + list.length) % list.length;
        if (isSelectable(next)) return next;
      }
      return null;
    }

    function moveSelection(delta: number): void {
      const list = filtered.value;
      if (!list.length) return;
      const next = nextSelectableIndex(currentSelectedFilteredIndex.value, delta);
      if (next == null) return;
      const idx = list[next]?.index;
      if (idx == null) return;
      localSelectedIndex.value = idx;
      emit("update:selectedIndex", idx);
    }

    function selectCurrent(queryOverride?: string): void {
      const list =
        queryOverride == null
          ? filtered.value
          : (props.filter ?? filterCommandPaletteItems)(props.items ?? [], queryOverride);
      const selected =
        queryOverride == null
          ? currentSelectedFilteredIndex.value
          : selectedFilteredIndex(list, localSelectedIndex.value);
      const current = list[selected];
      if (!current || current.item.kind === "separator") return;
      emit("select", current.item, current.index);
    }

    function setQuery(value: string): void {
      query.value = value;
      emit("update:query", value);
    }

    return () => {
      if (!props.modelValue) return null;

      const maxW = Math.max(0, Math.floor(cols.value));
      const maxH = Math.max(0, Math.floor(rows.value));
      const w =
        maxW <= 0
          ? 0
          : clamp(Math.floor(maxW * props.widthRatio), Math.min(props.minWidth, maxW), maxW);
      const requestedVerticalMargin = Math.max(0, Math.floor(props.maxVerticalMargin));
      const safeVerticalMargin = maxH <= props.minHeight ? 0 : requestedVerticalMargin;
      const maxDialogH = maxH <= 0 ? 0 : Math.min(maxH, Math.max(1, maxH - safeVerticalMargin));
      const minDialogH = Math.min(props.minHeight, maxDialogH);
      const preferredH = maxH <= 0 ? 0 : Math.floor(maxH * props.heightRatio);
      const hgt = maxH <= 0 ? 0 : clamp(preferredH, minDialogH, maxDialogH);
      const x = Math.max(0, Math.floor((cols.value - w) / 2));
      const y = clamp(Math.floor((rows.value - hgt) / 2), 0, Math.max(0, rows.value - hgt));
      const innerW = Math.max(0, w - 2);
      const innerH = Math.max(0, hgt - 2);
      const contentW = Math.max(0, innerW - 2);
      const contentH = Math.max(0, innerH - 2);

      const list = filtered.value;
      const dividerY = 1;
      const listY = 2;
      const hintY = Math.max(listY, contentH - 1);
      const detailY = Math.max(listY, hintY - 2);
      const listH = clamp(list.length, 1, Math.max(1, detailY - listY));

      const windowSize = Math.max(1, listH);
      const maxOffset = Math.max(0, list.length - windowSize);
      const offset = clamp(
        currentSelectedFilteredIndex.value - Math.floor(windowSize / 2),
        0,
        maxOffset,
      );
      const visible = list.slice(offset, offset + windowSize);

      const active = list[currentSelectedFilteredIndex.value]?.item;
      const detailText = active?.subtitle ?? active?.detail ?? "";
      const detailLines = detailText
        ? wrapByCells(detailText, Math.max(1, contentW)).slice(0, 2)
        : [];
      const chromeStyle = props.chromeStyle;
      const bodyStyle = props.bodyStyle ?? chromeStyle;
      const listStyle = props.listStyle ?? bodyStyle;
      const highlightStyle = props.highlightStyle ?? { ...listStyle, inverse: true };
      const matchStyle = props.matchStyle ?? { bold: true, dim: false, underline: true };
      const highlightMatchStyle = props.highlightMatchStyle ?? matchStyle;
      const dividerStyle = props.dividerStyle ?? bodyStyle;
      const detailStyle = props.detailStyle ?? bodyStyle;
      const hintStyle = props.hintStyle ?? bodyStyle;
      const emptyStyle = props.emptyStyle ?? bodyStyle;

      return h(
        TView,
        {
          x,
          y,
          w,
          h: hgt,
          zIndex: props.zIndex,
          onKeydownCapture: (e: any) => {
            if (e?.key === "Escape") {
              e?.preventDefault?.();
              e?.stopPropagation?.();
              close();
              return;
            }
            if (e?.key === "ArrowDown" || e?.code === "ArrowDown") {
              e?.preventDefault?.();
              e?.stopPropagation?.();
              moveSelection(1);
              return;
            }
            if (e?.key === "ArrowUp" || e?.code === "ArrowUp") {
              e?.preventDefault?.();
              e?.stopPropagation?.();
              moveSelection(-1);
            }
          },
        },
        () =>
          h(
            TBox,
            {
              x: 0,
              y: 0,
              w,
              h: hgt,
              border: true,
              title: props.title,
              padding: 1,
              style: chromeStyle,
            },
            () => [
              h(TText, {
                x: 0,
                y: 0,
                w: contentW,
                h: contentH,
                value: "",
                style: bodyStyle,
              }),
              h(TInput, {
                key: `command-palette-input-${inputFocusEpoch.value}`,
                x: 0,
                y: 0,
                w: contentW,
                modelValue: query.value,
                "onUpdate:modelValue": setQuery,
                onChange: (v: string) => selectCurrent(v),
                placeholder: props.placeholder,
                placeholderWhenFocused: true,
                cursorToEndOnFirstFocus: true,
                cursorToEndOnExternalUpdate: true,
                autoFocus: true,
                style: props.inputStyle ?? bodyStyle,
                onKeydown: (e: any) => {
                  if (e?.key === "ArrowDown" || e?.code === "ArrowDown") {
                    e.preventDefault?.();
                    moveSelection(1);
                  } else if (e?.key === "ArrowUp" || e?.code === "ArrowUp") {
                    e.preventDefault?.();
                    moveSelection(-1);
                  }
                },
              }),
              contentW > 0
                ? h(TText, {
                    x: 0,
                    y: dividerY,
                    w: contentW,
                    value: "─".repeat(contentW),
                    style: dividerStyle,
                  })
                : null,
              list.length
                ? h(TSelect, {
                    x: 0,
                    y: listY,
                    w: contentW,
                    h: listH,
                    options: visible.map((x) => ({
                      kind: x.item.kind,
                      label: x.item.title ?? x.item.label,
                      ...(props.showRowDetails ? { detail: x.item.subtitle ?? x.item.detail } : {}),
                      style: x.item.style,
                      highlightStyle: x.item.highlightStyle,
                      detailStyle: x.item.detailStyle,
                      highlightDetailStyle: x.item.highlightDetailStyle,
                      labelAccentRanges: x.item.labelAccentRanges,
                      detailAccentRanges: x.item.detailAccentRanges,
                      detailAccentSegments: x.item.detailAccentSegments,
                      accentStyle: x.item.accentStyle,
                      highlightAccentStyle: x.item.highlightAccentStyle,
                      labelHighlightRanges: x.labelHighlightRanges,
                      detailHighlightRanges: x.detailHighlightRanges,
                    })) satisfies SelectOption[],
                    modelValue: clamp(
                      currentSelectedFilteredIndex.value - offset,
                      0,
                      Math.max(0, visible.length - 1),
                    ),
                    "onUpdate:modelValue": (v: number) => {
                      const picked = visible[clamp(v, 0, Math.max(0, visible.length - 1))];
                      if (!picked || picked.item.kind === "separator") return;
                      localSelectedIndex.value = picked.index;
                      emit("update:selectedIndex", picked.index);
                    },
                    style: listStyle,
                    highlightStyle,
                    matchStyle,
                    highlightMatchStyle,
                    autoFocus: false,
                    closeOnBlur: false,
                    onChange: (_v: string | null) => selectCurrent(),
                    onClose: close,
                  })
                : h(TText, {
                    x: 0,
                    y: listY,
                    w: contentW,
                    h: listH,
                    value: props.noMatchesText,
                    style: emptyStyle,
                  }),
              detailLines.length
                ? detailLines.map((line, i) =>
                    h(TText, {
                      key: `detail-${i}`,
                      x: 0,
                      y: detailY + i,
                      w: contentW,
                      value: line,
                      style: detailStyle,
                    }),
                  )
                : h(TText, {
                    x: 0,
                    y: detailY,
                    w: contentW,
                    h: 2,
                    value: "",
                    style: bodyStyle,
                  }),
              h(TText, {
                x: 0,
                y: hintY,
                w: contentW,
                value: props.hint,
                style: hintStyle,
              }),
              contentW > 0
                ? h(TText, {
                    x: Math.max(0, contentW - 1),
                    y: hintY,
                    w: 1,
                    value: " ",
                    style: bodyStyle,
                  })
                : null,
            ],
          ),
      );
    };
  },
});
