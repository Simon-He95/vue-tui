import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type {
  Rect,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import {
  computed,
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  ref,
  watch,
  watchEffect,
} from "vue";
import { charCellWidth } from "../../core/buffer/width.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { DialogContextKey, EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { sanitizeInlineText, sliceByCells, spaces, textCellWidth } from "../utils/text.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

type TextHighlightRange = Readonly<{ start: number; end: number }>;
type TextAccentSegment = Readonly<{
  start: number;
  end: number;
  style?: Style;
  highlightStyle?: Style;
}>;

export type SelectOptionWithStyle = Readonly<{
  kind?: "option" | "separator" | "group";
  label: string;
  value?: unknown;
  disabled?: boolean;
  detail?: string;
  style?: Style;
  highlightStyle?: Style;
  detailStyle?: Style;
  highlightDetailStyle?: Style;
  labelHighlightRanges?: readonly TextHighlightRange[];
  detailHighlightRanges?: readonly TextHighlightRange[];
  labelAccentRanges?: readonly TextHighlightRange[];
  detailAccentRanges?: readonly TextHighlightRange[];
  detailAccentSegments?: readonly TextAccentSegment[];
  accentStyle?: Style;
  highlightAccentStyle?: Style;
}>;

export type SelectOption = string | SelectOptionWithStyle;

function isOptionObject(opt: SelectOption | undefined | null): opt is SelectOptionWithStyle {
  return typeof opt === "object" && opt !== null;
}

function normalizeHighlightRanges(
  ranges: readonly TextHighlightRange[] | undefined,
): TextHighlightRange[] {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];
  const out: TextHighlightRange[] = [];
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
  segments: readonly TextAccentSegment[] | undefined,
): TextAccentSegment[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const out: TextAccentSegment[] = [];
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

function writeHighlightedText(
  opts: Readonly<{
    terminal: {
      write: (text: string, opts?: { x?: number; y?: number; style?: Style }) => void;
    };
    text: string;
    ranges: readonly TextHighlightRange[];
    x: number;
    y: number;
    maxCells: number;
    baseStyle: Style;
    highlightStyle: Style;
    accentRanges?: readonly TextHighlightRange[];
    accentStyle?: Style;
    accentSegments?: readonly Readonly<{
      start: number;
      end: number;
      style: Style;
    }>[];
  }>,
): number {
  const {
    terminal,
    text,
    ranges,
    x,
    y,
    maxCells,
    baseStyle,
    highlightStyle,
    accentRanges = [],
    accentStyle = baseStyle,
    accentSegments = [],
  } = opts;
  const safeMax = Math.max(0, Math.floor(maxCells));
  if (!text || safeMax <= 0) return 0;

  let rangeIndex = 0;
  let activeRange = ranges[rangeIndex];
  let accentRangeIndex = 0;
  let activeAccentRange = accentRanges[accentRangeIndex];
  let accentSegmentIndex = 0;
  let activeAccentSegment = accentSegments[accentSegmentIndex];
  let cellPos = 0;
  let cursorX = x;
  let buffer = "";
  let currentStyle: Style = baseStyle;

  const flush = () => {
    if (!buffer) return;
    terminal.write(buffer, { x: cursorX, y, style: currentStyle });
    cursorX += textCellWidth(buffer);
    buffer = "";
  };

  for (let i = 0; i < text.length && cellPos < safeMax; ) {
    const code = text.charCodeAt(i);
    const seg = code <= 0x7f ? text[i]! : String.fromCodePoint(text.codePointAt(i) ?? 0);
    const segLen = seg.length;
    const segWidth = charCellWidth(seg);
    if (cellPos + segWidth > safeMax) break;

    while (activeRange && activeRange.end <= i) {
      rangeIndex++;
      activeRange = ranges[rangeIndex];
    }
    while (activeAccentRange && activeAccentRange.end <= i) {
      accentRangeIndex++;
      activeAccentRange = accentRanges[accentRangeIndex];
    }
    while (activeAccentSegment && activeAccentSegment.end <= i) {
      accentSegmentIndex++;
      activeAccentSegment = accentSegments[accentSegmentIndex];
    }
    const isHighlighted = Boolean(
      activeRange && i < activeRange.end && i + segLen > activeRange.start,
    );
    const isAccented = Boolean(
      activeAccentRange && i < activeAccentRange.end && i + segLen > activeAccentRange.start,
    );
    const accentSegmentStyle =
      activeAccentSegment && i < activeAccentSegment.end && i + segLen > activeAccentSegment.start
        ? activeAccentSegment.style
        : undefined;
    const nextStyle = isHighlighted
      ? highlightStyle
      : accentSegmentStyle || (isAccented ? accentStyle : baseStyle);
    if (nextStyle !== currentStyle) {
      flush();
      currentStyle = nextStyle;
    }

    buffer += seg;
    cellPos += segWidth;
    i += segLen;
  }

  flush();
  return cellPos;
}

export type TSelectMultipleChangePayload = Readonly<{
  indices: number[];
  labels: string[];
  values: string[];
}>;
export type TSelectMultipleEmitMode = "label" | "value" | "index" | "both";
export type TSelectModelValue = unknown;
export type TSelectValueMode = "index" | "value" | "option";
export type TSelectOptionProvider = (
  query: string,
  ctx: { signal: AbortSignal },
) => Promise<readonly SelectOption[]>;

export const TSelect = defineComponent({
  name: "TSelect",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    options: {
      type: Array as PropType<readonly SelectOption[]>,
      default: () => [],
    },
    optionProvider: {
      type: Function as PropType<TSelectOptionProvider>,
      default: undefined,
    },
    query: { type: String, default: undefined },
    modelValue: {
      type: null as unknown as PropType<TSelectModelValue>,
      default: 0 as TSelectModelValue,
    },
    valueMode: {
      type: String as PropType<TSelectValueMode>,
      default: "index",
    },
    activeIndex: { type: Number, default: undefined },
    multiple: { type: Boolean, default: false },
    multipleEmit: {
      type: String as PropType<TSelectMultipleEmitMode>,
      default: "label",
    },
    style: { type: Object as PropType<Style>, default: undefined },
    highlightStyle: { type: Object as PropType<Style>, default: undefined },
    matchStyle: { type: Object as PropType<Style>, default: undefined },
    highlightMatchStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    autoFocus: { type: Boolean, default: false },
    closeOnBlur: { type: Boolean, default: false },
    searchable: { type: Boolean, default: false },
    typeahead: { type: Boolean, default: true },
    debounce: { type: Number, default: 0 },
    emptyText: { type: String, default: "No options" },
    loading: { type: Boolean, default: false },
    loadingText: { type: String, default: "Loading..." },
    errorText: { type: String, default: "Unable to load options" },
    maxVisible: { type: Number, default: undefined },
  },
  emits: [
    "update:modelValue",
    "update:activeIndex",
    "update:query",
    "change",
    "confirm",
    "close",
    "focus",
    "blur",
    "keydown",
    "loadError",
  ],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const inDialog = inject(DialogContextKey, false) as boolean;
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const focused = ref(false);
    const providerOptions = ref<readonly SelectOption[] | null>(null);
    const providerLoading = ref(false);
    const providerError = ref<string | null>(null);
    const innerQuery = ref(props.query ?? "");
    let providerAbort: AbortController | null = null;
    let providerTimer: ReturnType<typeof setTimeout> | null = null;
    let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
    const typeaheadQuery = ref("");
    const query = computed(() => props.query ?? innerQuery.value);
    const options = computed(() => providerOptions.value ?? props.options);
    const initialActive = (() => {
      const max = Math.max(0, options.value.length - 1);
      if (!props.multiple) {
        const idx = modelIndex(props.modelValue);
        return clamp(idx, 0, max);
      }
      const selected = Array.isArray(props.modelValue) ? props.modelValue : [];
      const first = selected[0] ?? 0;
      return clamp(modelIndex(first), 0, max);
    })();
    const innerActive = ref(initialActive);
    const active = computed(() =>
      clamp(props.activeIndex ?? innerActive.value, 0, Math.max(0, options.value.length - 1)),
    );

    function setActive(index: number): void {
      const next = clamp(index, 0, Math.max(0, options.value.length - 1));
      innerActive.value = next;
      emit("update:activeIndex", next);
    }

    function setQuery(value: string): void {
      innerQuery.value = value;
      emit("update:query", value);
    }

    function visibleRowCount(r: Rect): number {
      return Math.max(
        0,
        Math.min(
          Math.floor(r.h),
          props.maxVisible == null ? Number.POSITIVE_INFINITY : Math.max(1, props.maxVisible),
        ),
      );
    }

    function getScrollOffset(r: Rect): number {
      const visibleH = visibleRowCount(r);
      const total = Math.max(0, options.value.length);
      if (visibleH <= 0) return 0;
      if (total <= visibleH) return 0;
      const maxOffset = Math.max(0, total - visibleH);
      const a = clamp(active.value, 0, Math.max(0, total - 1));
      return clamp(a - (visibleH - 1), 0, maxOffset);
    }

    const absRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    const visibleRect = computed<Rect>(() => {
      const r = absRect.value;
      return { ...r, h: visibleRowCount(r) };
    });

    watchEffect(() => {
      const max = Math.max(0, options.value.length - 1);
      if (!props.multiple) {
        const idx = modelIndex(props.modelValue);
        const next = clamp(idx, 0, max);
        innerActive.value = isOptionInteractive(options.value[next])
          ? next
          : (findNextInteractiveIndex(next, 1) ?? next);
        return;
      }
      innerActive.value = clamp(active.value, 0, max);
    });

    function getOptionLabel(opt: SelectOption): string {
      return isOptionObject(opt) ? opt.label : opt;
    }

    function getOptionKind(opt: SelectOption): SelectOptionWithStyle["kind"] | undefined {
      return isOptionObject(opt) ? opt.kind : undefined;
    }

    function getOptionValue(opt: SelectOption, index: number): unknown {
      if (props.valueMode === "index") return index;
      if (props.valueMode === "option") return opt;
      return isOptionObject(opt) && "value" in opt ? opt.value : getOptionLabel(opt);
    }

    function valuesEqual(a: unknown, b: unknown): boolean {
      return a === b;
    }

    function modelIndex(value: unknown): number {
      if (props.valueMode === "index") return typeof value === "number" ? value : -1;
      return options.value.findIndex((opt, optIndex) =>
        valuesEqual(getOptionValue(opt, optIndex), value),
      );
    }

    function isOptionInteractive(opt: SelectOption | undefined): opt is SelectOption {
      if (!opt) return false;
      const kind = getOptionKind(opt);
      return kind !== "separator" && kind !== "group" && !(isOptionObject(opt) && opt.disabled);
    }

    function findNextInteractiveIndex(start: number, delta: number): number | null {
      const total = Math.max(0, options.value.length);
      if (total <= 0) return null;
      const step = delta >= 0 ? 1 : -1;
      for (let offset = 1; offset <= total; offset++) {
        const next = (start + step * offset + total) % total;
        if (isOptionInteractive(options.value[next])) return next;
      }
      return null;
    }

    function getOptionDetail(opt: SelectOption): string | undefined {
      return isOptionObject(opt) ? opt.detail : undefined;
    }

    function getOptionStyle(opt: SelectOption): Style | undefined {
      return isOptionObject(opt) ? opt.style : undefined;
    }

    function getOptionHighlightStyle(opt: SelectOption): Style | undefined {
      return isOptionObject(opt) ? opt.highlightStyle : undefined;
    }

    function getOptionDetailStyle(opt: SelectOption): Style | undefined {
      return isOptionObject(opt) ? opt.detailStyle : undefined;
    }

    function getOptionHighlightDetailStyle(opt: SelectOption): Style | undefined {
      return isOptionObject(opt) ? opt.highlightDetailStyle : undefined;
    }

    function getOptionLabelHighlightRanges(opt: SelectOption): readonly TextHighlightRange[] {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.labelHighlightRanges : undefined);
    }

    function getOptionDetailHighlightRanges(opt: SelectOption): readonly TextHighlightRange[] {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.detailHighlightRanges : undefined);
    }

    function getOptionLabelAccentRanges(opt: SelectOption): readonly TextHighlightRange[] {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.labelAccentRanges : undefined);
    }

    function getOptionDetailAccentRanges(opt: SelectOption): readonly TextHighlightRange[] {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.detailAccentRanges : undefined);
    }

    function getOptionDetailAccentSegments(opt: SelectOption): readonly TextAccentSegment[] {
      return normalizeAccentSegments(isOptionObject(opt) ? opt.detailAccentSegments : undefined);
    }

    function getOptionAccentStyle(opt: SelectOption): Style | undefined {
      return isOptionObject(opt) ? opt.accentStyle : undefined;
    }

    function getOptionHighlightAccentStyle(opt: SelectOption): Style | undefined {
      return isOptionObject(opt) ? opt.highlightAccentStyle : undefined;
    }

    function commitSingle(index: number): void {
      const next = clamp(index, 0, Math.max(0, options.value.length - 1));
      const opt = options.value[next];
      if (!isOptionInteractive(opt)) return;
      setActive(next);
      emit("update:modelValue", getOptionValue(opt!, next));
      emit("change", opt ? getOptionLabel(opt) : null);
    }

    function getSelectedIndices(): number[] {
      if (!props.multiple) return [];
      const max = Math.max(0, options.value.length - 1);
      const raw = Array.isArray(props.modelValue) ? props.modelValue : [];
      const set = new Set<number>();
      for (const v of raw) {
        const index = Math.trunc(modelIndex(v));
        if (!Number.isFinite(index) || index < 0) continue;
        set.add(clamp(index, 0, max));
      }
      return [...set].sort((a, b) => a - b);
    }

    function makeMultiplePayload(indices: number[]): TSelectMultipleChangePayload {
      const labels = indices
        .map((i) => options.value[i])
        .filter(Boolean)
        .map((opt) => getOptionLabel(opt!));
      return { indices, labels, values: labels };
    }

    function emitMultiple(name: "change" | "confirm", indices: number[]): void {
      const payload = makeMultiplePayload(indices);
      if (props.multipleEmit === "index") {
        emit(name, payload.indices);
        return;
      }
      if (props.multipleEmit === "both") {
        emit(name, payload satisfies TSelectMultipleChangePayload);
        return;
      }
      emit(name, payload.labels);
    }

    function toggleMultiple(index: number): void {
      const nextIndex = clamp(index, 0, Math.max(0, options.value.length - 1));
      if (!isOptionInteractive(options.value[nextIndex])) return;
      setActive(nextIndex);

      const set = new Set(getSelectedIndices());
      if (set.has(nextIndex)) set.delete(nextIndex);
      else set.add(nextIndex);

      const indices = [...set].sort((a, b) => a - b);

      emit(
        "update:modelValue",
        props.valueMode === "index"
          ? indices
          : indices.map((i) => getOptionValue(options.value[i]!, i)),
      );
      emitMultiple("change", indices);
    }

    function confirmMultiple(): void {
      const indices = getSelectedIndices();
      emitMultiple("confirm", indices);
    }

    function commit(index: number): void {
      if (!isOptionInteractive(options.value[index])) return;
      if (props.multiple) toggleMultiple(index);
      else commitSingle(index);
    }

    function scheduleTypeaheadReset(): void {
      if (typeaheadTimer) clearTimeout(typeaheadTimer);
      typeaheadTimer = setTimeout(() => {
        typeaheadQuery.value = "";
      }, 700);
    }

    function moveToTypeaheadMatch(rawPrefix: string, commitModel: boolean): boolean {
      const prefix = rawPrefix.toLowerCase();
      const total = options.value.length;
      if (!prefix || total <= 0) return true;

      for (let step = 1; step <= total; step++) {
        const index = (active.value + step) % total;
        const opt = options.value[index];
        if (!isOptionInteractive(opt)) continue;
        if (!getOptionLabel(opt).toLowerCase().startsWith(prefix)) continue;

        setActive(index);
        if (commitModel && !props.multiple) {
          emit("update:modelValue", getOptionValue(opt, index));
        }
        return true;
      }

      return true;
    }

    function handleSearchEditingKey(e: TerminalKeyboardEvent): boolean {
      if (!props.searchable) return false;
      if (e.key !== "Backspace") return false;
      setQuery(query.value.slice(0, -1));
      return true;
    }

    function handlePrintableKey(char: string): boolean {
      if (!props.searchable && !props.typeahead) return false;
      if (char.length !== 1 || char < " ") return false;

      if (props.searchable) {
        const nextQuery = `${query.value}${char}`;
        setQuery(nextQuery);
        if (props.typeahead) moveToTypeaheadMatch(nextQuery, false);
        return true;
      }

      typeaheadQuery.value += char.toLowerCase();
      scheduleTypeaheadReset();
      return moveToTypeaheadMatch(typeaheadQuery.value, !props.multiple);
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (e.defaultPrevented) return;
      if (e.key === "ArrowUp" || e.code === "ArrowUp") {
        e.preventDefault();
        if (options.value.length === 0) return;
        const next = findNextInteractiveIndex(active.value, -1) ?? active.value;
        const opt = options.value[next];
        if (!isOptionInteractive(opt)) return;
        setActive(next);
        if (!props.multiple) emit("update:modelValue", getOptionValue(opt, next));
        scheduler.invalidate();
        return;
      }
      if (e.key === "ArrowDown" || e.code === "ArrowDown") {
        e.preventDefault();
        if (options.value.length === 0) return;
        const next = findNextInteractiveIndex(active.value, 1) ?? active.value;
        const opt = options.value[next];
        if (!isOptionInteractive(opt)) return;
        setActive(next);
        if (!props.multiple) emit("update:modelValue", getOptionValue(opt, next));
        scheduler.invalidate();
        return;
      }
      if (props.multiple && (e.code === "Space" || e.key === " " || e.key === "Spacebar")) {
        e.preventDefault();
        toggleMultiple(active.value);
        return;
      }
      if (e.key === "Enter") {
        if (props.multiple) {
          if (inDialog && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            (e as any).__tuiDialogConfirm = true;
          }
          e.preventDefault();
          confirmMultiple();
          return;
        }
        e.preventDefault();
        commit(active.value);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        emit("close");
        return;
      }
      if (handleSearchEditingKey(e)) {
        e.preventDefault();
        return;
      }
      if (handlePrintableKey(e.key ?? "")) {
        e.preventDefault();
      }
    }

    const { id } = useTerminalNode(() => ({
      rect: visibleRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          const r = visibleRect.value;
          const offset = getScrollOffset(r);
          const idx = offset + (e.cellY - r.y);
          if (
            props.loading ||
            providerLoading.value ||
            providerError.value ||
            options.value.length === 0
          ) {
            return;
          }
          if (idx >= 0 && idx < options.value.length) commit(idx);
          else emit("close");
        },
        focus: () => {
          focused.value = true;
          emit("focus");
          scheduler.invalidate();
        },
        blur: () => {
          focused.value = false;
          emit("blur");
          if (props.closeOnBlur) emit("close");
          scheduler.invalidate();
        },
        keydown: onKeydown,
      },
    }));

    watchEffect(() => {
      if (!props.autoFocus) return;
      if (!visible.value) return;
      const manager = events.value;
      const nodeId = id.value;
      if (!manager || !nodeId) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? visibleRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.w,
        props.h,
        props.maxVisible,
        options.value,
        props.modelValue,
        props.multiple,
        props.multipleEmit,
        props.style,
        props.highlightStyle,
        props.matchStyle,
        props.highlightMatchStyle,
        props.valueMode,
        props.activeIndex,
        props.emptyText,
        props.loading,
        props.loadingText,
        props.errorText,
        providerLoading.value,
        providerError.value,
        focused.value,
        active.value,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = visibleRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const offset = getScrollOffset(r);
        const base = props.style ?? defaultStyle.value;
        const highlightBase = props.highlightStyle ?? {
          ...base,
          inverse: true,
        };
        const selectedSet = props.multiple ? new Set(getSelectedIndices()) : null;

        const paintRow = (i: number): void => {
          const optIndex = offset + i;
          const opt = options.value[optIndex];
          if (props.loading || providerLoading.value) {
            const text = i === 0 ? sliceByCells(props.loadingText, r.w) : "";
            terminal.write(`${text}${spaces(Math.max(0, r.w - textCellWidth(text)))}`, {
              x: r.x,
              y: r.y + i,
              style: base,
            });
            return;
          }
          if (providerError.value) {
            const text = i === 0 ? sliceByCells(props.errorText, r.w) : "";
            terminal.write(`${text}${spaces(Math.max(0, r.w - textCellWidth(text)))}`, {
              x: r.x,
              y: r.y + i,
              style: base,
            });
            return;
          }
          if (!opt) {
            const text = optIndex === 0 ? sliceByCells(props.emptyText, r.w) : "";
            terminal.write(`${text}${spaces(Math.max(0, r.w - textCellWidth(text)))}`, {
              x: r.x,
              y: r.y + i,
              style: base,
            });
            return;
          }

          const isActiveRow = optIndex === active.value;
          const isChecked = props.multiple ? selectedSet!.has(optIndex) : isActiveRow;
          const isHighlighted = props.multiple ? focused.value && isActiveRow : isActiveRow;
          const prefix = props.multiple ? (isChecked ? "[x] " : "[ ] ") : "";
          const label = sanitizeInlineText(getOptionLabel(opt));
          const detail = getOptionDetail(opt);
          const rawDetail = detail ? sanitizeInlineText(detail) : "";
          const labelText = `${prefix}${label}`;
          const labelHighlightRanges = getOptionLabelHighlightRanges(opt);
          const detailHighlightRanges = getOptionDetailHighlightRanges(opt);
          const labelAccentRanges = getOptionLabelAccentRanges(opt);
          const detailAccentRanges = getOptionDetailAccentRanges(opt);
          const detailAccentSegments = getOptionDetailAccentSegments(opt);

          const optStyle = getOptionStyle(opt);
          const rowBase: Style = optStyle ? { ...base, ...optStyle } : base;
          const optHighlightStyle = getOptionHighlightStyle(opt);
          const rowHighlightBase: Style = optHighlightStyle
            ? { ...highlightBase, ...optHighlightStyle }
            : highlightBase;
          const optDetailStyle = getOptionDetailStyle(opt);
          const rowDetailStyle: Style = {
            ...rowBase,
            ...(optDetailStyle ?? {}),
            dim: true,
          };
          const optHighlightDetailStyle = getOptionHighlightDetailStyle(opt);
          const rowHighlightDetailStyle: Style = {
            ...rowHighlightBase,
            ...(optHighlightDetailStyle ?? {}),
            dim: true,
          };
          const optAccentStyle = getOptionAccentStyle(opt);
          const rowAccentStyle: Style = optAccentStyle
            ? { ...rowBase, ...optAccentStyle }
            : rowBase;
          const optHighlightAccentStyle = getOptionHighlightAccentStyle(opt);
          const rowHighlightAccentStyle: Style = optHighlightAccentStyle
            ? { ...rowHighlightBase, ...optHighlightAccentStyle }
            : optAccentStyle
              ? { ...rowHighlightBase, ...optAccentStyle }
              : rowHighlightBase;
          if (getOptionKind(opt) === "separator") {
            terminal.write("─".repeat(r.w), {
              x: r.x,
              y: r.y + i,
              style: { ...rowBase, dim: true },
            });
            return;
          }
          if (getOptionKind(opt) === "group") {
            const text = sliceByCells(getOptionLabel(opt), r.w);
            terminal.write(`${text}${spaces(Math.max(0, r.w - textCellWidth(text)))}`, {
              x: r.x,
              y: r.y + i,
              style: { ...rowBase, bold: true },
            });
            return;
          }
          const rowDetailAccentSegments = detailAccentSegments.map((segment) => ({
            start: segment.start,
            end: segment.end,
            style: isHighlighted
              ? {
                  ...rowHighlightDetailStyle,
                  ...(segment.highlightStyle ?? segment.style ?? {}),
                }
              : { ...rowDetailStyle, ...(segment.style ?? {}) },
          }));
          const defaultMatchStyle: Style = { bold: true, dim: false, underline: true };
          const matchStyle = props.matchStyle ?? defaultMatchStyle;
          const highlightMatchStyle = props.highlightMatchStyle ?? matchStyle;
          const rowMatchStyle: Style = { ...rowBase, ...matchStyle };
          const rowHighlightMatchStyle: Style = {
            ...rowHighlightBase,
            ...highlightMatchStyle,
          };
          const rowDetailMatchStyle: Style = {
            ...rowDetailStyle,
            ...matchStyle,
          };
          const rowHighlightDetailMatchStyle: Style = {
            ...rowHighlightDetailStyle,
            ...highlightMatchStyle,
          };

          const labelCells = textCellWidth(labelText);
          const minGap = 1;
          const availableForDetail = Math.max(0, r.w - labelCells - minGap);

          if (rawDetail && availableForDetail >= 4) {
            // Draw label on the left
            const labelStyle = isHighlighted ? rowHighlightBase : rowBase;
            const labelHighlightStyle = isHighlighted ? rowHighlightMatchStyle : rowMatchStyle;
            const usedLabelCells = writeHighlightedText({
              terminal,
              text: labelText,
              ranges: labelHighlightRanges,
              x: r.x,
              y: r.y + i,
              maxCells: r.w,
              baseStyle: labelStyle,
              highlightStyle: labelHighlightStyle,
              accentRanges: labelAccentRanges,
              accentStyle: isHighlighted ? rowHighlightAccentStyle : rowAccentStyle,
            });

            // Draw detail on the right (truncated if needed)
            const detailText = sliceByCells(rawDetail, availableForDetail);
            const detailCells = textCellWidth(detailText);

            // Calculate gap to fill the space between label and detail
            const gapWidth = Math.max(0, r.w - usedLabelCells - detailCells);
            const gapStyle = isHighlighted ? rowHighlightBase : rowBase;
            terminal.write(spaces(gapWidth), {
              x: r.x + usedLabelCells,
              y: r.y + i,
              style: gapStyle,
            });

            const dStyle = isHighlighted ? rowHighlightDetailStyle : rowDetailStyle;
            const dHighlightStyle = isHighlighted
              ? rowHighlightDetailMatchStyle
              : rowDetailMatchStyle;
            writeHighlightedText({
              terminal,
              text: detailText,
              ranges: detailHighlightRanges,
              x: r.x + usedLabelCells + gapWidth,
              y: r.y + i,
              maxCells: detailCells,
              baseStyle: dStyle,
              highlightStyle: dHighlightStyle,
              accentRanges: detailAccentRanges,
              accentSegments: rowDetailAccentSegments,
              accentStyle: isHighlighted ? rowHighlightAccentStyle : rowAccentStyle,
            });
          } else {
            // No room for detail, just show label
            const clippedLabel = sliceByCells(labelText, r.w);
            const style = isHighlighted ? rowHighlightBase : rowBase;
            const highlightStyle = isHighlighted ? rowHighlightMatchStyle : rowMatchStyle;
            const usedCells = writeHighlightedText({
              terminal,
              text: clippedLabel,
              ranges: labelHighlightRanges,
              x: r.x,
              y: r.y + i,
              maxCells: r.w,
              baseStyle: style,
              highlightStyle,
              accentRanges: labelAccentRanges,
              accentStyle: isHighlighted ? rowHighlightAccentStyle : rowAccentStyle,
            });
            if (usedCells < r.w) {
              terminal.write(spaces(r.w - usedCells), {
                x: r.x + usedCells,
                y: r.y + i,
                style,
              });
            }
          }
        };

        if (!dirtyRows) {
          for (let i = 0; i < r.h; i++) paintRow(i);
          return;
        }

        const y0 = Math.floor(r.y);
        const y1 = y0 + Math.max(0, Math.floor(r.h));
        if (y1 <= y0) return;

        // `dirtyRows` is sorted; iterate only overlapping rows to avoid `includes()` per row.
        let lo = 0;
        let hi = dirtyRows.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if ((dirtyRows[mid] ?? 0) < y0) lo = mid + 1;
          else hi = mid;
        }
        for (let idx = lo; idx < dirtyRows.length; idx++) {
          const y = Math.floor(dirtyRows[idx] ?? -1);
          if (y < y0) continue;
          if (y >= y1) break;
          const i = y - y0;
          if (i >= 0 && i < r.h) paintRow(i);
        }
      },
    }));

    watch(
      () => [props.optionProvider, query.value, props.debounce] as const,
      ([provider, query]) => {
        if (providerTimer) {
          clearTimeout(providerTimer);
          providerTimer = null;
        }
        providerAbort?.abort();
        providerAbort = null;
        providerError.value = null;
        if (!provider) {
          providerOptions.value = null;
          providerLoading.value = false;
          return;
        }
        providerOptions.value = [];
        providerLoading.value = true;
        const run = () => {
          const controller = new AbortController();
          providerAbort = controller;
          void provider(query, { signal: controller.signal })
            .then((items) => {
              if (controller.signal.aborted) return;
              providerOptions.value = items;
              providerError.value = null;
            })
            .catch((error: unknown) => {
              if (controller.signal.aborted) return;
              providerOptions.value = [];
              providerError.value = error instanceof Error ? error.message : String(error);
              emit("loadError", { query, error });
            })
            .finally(() => {
              if (!controller.signal.aborted) providerLoading.value = false;
            });
        };
        const delay = Math.max(0, Math.floor(props.debounce));
        if (delay > 0) providerTimer = setTimeout(run, delay);
        else run();
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      if (providerTimer) clearTimeout(providerTimer);
      if (typeaheadTimer) clearTimeout(typeaheadTimer);
      providerAbort?.abort();
    });

    return () => h("span", rootProps);
  },
});
