import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import type { TLogViewSearchError } from "./TLogView.js";
import { computed, defineComponent, h, inject, ref, watch } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { padEndByCells, sliceByCellsRange, spaces, textCellWidth } from "../utils/text.js";

const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });
const PREVIOUS_CHAR = "◀";
const NEXT_CHAR = "▶";

export type TLogSearchBarMode = "text" | "regex";

export type TLogSearchBarState = Readonly<{
  query: string;
  mode: TLogSearchBarMode;
  caseSensitive: boolean;
  wholeWord: boolean;
  status: "idle" | "scanning" | "done" | "error";
  matchCount: number;
  currentMatchIndex: number;
  error?: TLogViewSearchError | null;
}>;

export type TLogSearchBarUpdatePayload = Readonly<{
  query: string;
  mode: TLogSearchBarMode;
  caseSensitive: boolean;
  wholeWord: boolean;
}>;

export type TLogSearchBarNavigatePayload = Readonly<{
  direction: "previous" | "next";
}>;

type Action = "mode" | "case" | "wholeWord" | "previous" | "next";
type PaintPiece = Readonly<{
  start: number;
  text: string;
  style: Style;
}>;
type HitTarget = Readonly<{
  start: number;
  end: number;
  action: Action;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function mergeStyle(base: Style, overlay?: Style): Style {
  return overlay ? { ...base, ...overlay } : base;
}

function isPrintableKey(e: TerminalKeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.key.length === 1;
}

function stringIndexToCell(text: string, index: number): number {
  return textCellWidth(text.slice(0, clamp(index, 0, text.length)));
}

function cellToStringIndex(text: string, cell: number): number {
  const target = Math.max(0, Math.floor(cell));
  let index = 0;
  let used = 0;
  for (const char of text) {
    const cells = Math.max(1, textCellWidth(char));
    const midpoint = used + Math.floor(cells / 2);
    if (target <= midpoint) return index;
    used += cells;
    index += char.length;
    if (target < used) return index;
  }
  return text.length;
}

function errorLabel(error: TLogViewSearchError | null | undefined): string {
  if (error?.kind === "invalid-regex") return "Invalid regex";
  return "Search error";
}

export const TLogSearchBar = defineComponent({
  name: "TLogSearchBar",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    state: {
      type: Object as PropType<TLogSearchBarState>,
      required: true,
    },
    placeholder: {
      type: String,
      default: "Search…",
    },
    style: { type: Object as PropType<Style>, default: undefined },
    inputStyle: { type: Object as PropType<Style>, default: undefined },
    activeStyle: {
      type: Object as PropType<Style>,
      default: () => ({ inverse: true }),
    },
    errorStyle: {
      type: Object as PropType<Style>,
      default: () => ({ fg: "redBright", bold: true }),
    },
    disabledStyle: {
      type: Object as PropType<Style>,
      default: () => ({ dim: true }),
    },
    toggleStyle: { type: Object as PropType<Style>, default: undefined },
    focusable: { type: Boolean, default: true },
    showModeToggle: { type: Boolean, default: true },
    showCaseToggle: { type: Boolean, default: true },
    showWholeWordToggle: { type: Boolean, default: true },
    showCount: { type: Boolean, default: true },
    showNavigation: { type: Boolean, default: true },
  },
  emits: [
    "update",
    "update:query",
    "update:mode",
    "update:caseSensitive",
    "update:wholeWord",
    "previous",
    "next",
    "clear",
    "focus",
    "blur",
    "keydown",
  ],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const parent = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const focused = ref(false);
    const cursor = ref(0);
    const scrollCellOffset = ref(0);
    const pendingUpdate = ref<TLogSearchBarUpdatePayload | null>(null);

    const fullRect = computed<Rect>(() =>
      translateRect(
        {
          x: normalizeInt(props.x),
          y: normalizeInt(props.y),
          w: Math.max(0, normalizeInt(props.w)),
          h: 1,
        },
        parent.originX,
        parent.originY,
      ),
    );

    const rect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!parent.clipRect) return translated;
      return intersectRect(translated, parent.clipRect) ?? EMPTY_RECT;
    });

    function liveUpdateState(): TLogSearchBarUpdatePayload {
      return (
        pendingUpdate.value ?? {
          query: props.state.query,
          mode: props.state.mode,
          caseSensitive: props.state.caseSensitive,
          wholeWord: props.state.wholeWord,
        }
      );
    }

    function ensureCursorVisible(query: string, inputWidth: number): void {
      if (inputWidth <= 0) {
        scrollCellOffset.value = 0;
        return;
      }
      const totalCells = textCellWidth(query);
      const maxScroll = Math.max(0, totalCells - inputWidth);
      const cursorCell = stringIndexToCell(query, cursor.value);
      let nextScroll = clamp(scrollCellOffset.value, 0, maxScroll);
      if (cursorCell < nextScroll) nextScroll = cursorCell;
      if (cursorCell >= nextScroll + inputWidth) nextScroll = cursorCell - inputWidth + 1;
      scrollCellOffset.value = clamp(nextScroll, 0, maxScroll);
    }

    const statusText = computed(() => {
      if (props.state.status === "error") return errorLabel(props.state.error);
      if (props.state.status === "scanning") {
        if (!props.showCount || props.state.matchCount <= 0) return "Scanning…";
        return `Scanning… ${props.state.matchCount}`;
      }
      if (!props.showCount) return "";
      if (!props.state.query) return "";
      const current =
        props.state.matchCount > 0 && props.state.currentMatchIndex >= 0
          ? props.state.currentMatchIndex + 1
          : 0;
      return `${current}/${props.state.matchCount}`;
    });

    const rowLayout = computed(() => {
      const width = Math.max(0, normalizeInt(props.w));
      const base = props.style ?? defaultStyle.value;
      const toggleBase = mergeStyle(base, props.toggleStyle);
      const active = mergeStyle(toggleBase, props.activeStyle);
      const disabled = mergeStyle(toggleBase, props.disabledStyle);
      const error = mergeStyle(base, props.errorStyle);
      const navigationEnabled =
        props.state.matchCount > 0 &&
        props.state.status !== "error" &&
        props.state.query.length > 0;

      const prefixPieces: PaintPiece[] = [];
      const suffixSpecs: Array<{
        text: string;
        style: Style;
        action?: Action;
      }> = [];
      const hits: HitTarget[] = [];

      let prefixWidth = 0;
      const pushPrefix = (text: string, style: Style, action?: Action): void => {
        if (!text) return;
        const pieceWidth = textCellWidth(text);
        prefixPieces.push({ start: prefixWidth, text, style });
        if (action) hits.push({ start: prefixWidth, end: prefixWidth + pieceWidth, action });
        prefixWidth += pieceWidth;
      };

      if (props.showModeToggle) {
        pushPrefix(
          props.state.mode === "regex" ? "[R]" : "[T]",
          props.state.mode === "regex" ? active : toggleBase,
          "mode",
        );
        pushPrefix(" ", base);
      }

      if (props.showCaseToggle) {
        pushPrefix("[Aa]", props.state.caseSensitive ? active : toggleBase, "case");
        pushPrefix(" ", base);
      }

      if (props.showWholeWordToggle) {
        const wholeWordEnabled = props.state.mode !== "regex";
        pushPrefix(
          "[W]",
          wholeWordEnabled ? (props.state.wholeWord ? active : toggleBase) : disabled,
          "wholeWord",
        );
        pushPrefix(" ", base);
      }

      let suffixWidth = 0;
      const pushSuffix = (text: string, style: Style, action?: Action): void => {
        if (!text) return;
        const pieceWidth = textCellWidth(text);
        suffixSpecs.push({ text, style, action });
        suffixWidth += pieceWidth;
      };

      const status = statusText.value;
      if (status) {
        pushSuffix(` ${status}`, props.state.status === "error" ? error : base);
      }
      if (props.showNavigation) {
        pushSuffix(" ", base);
        pushSuffix(
          PREVIOUS_CHAR,
          navigationEnabled ? active : disabled,
          navigationEnabled ? "previous" : undefined,
        );
        pushSuffix(" ", base);
        pushSuffix(
          NEXT_CHAR,
          navigationEnabled ? active : disabled,
          navigationEnabled ? "next" : undefined,
        );
      }

      const inputWidth = width > 0 ? Math.max(1, width - prefixWidth - suffixWidth) : 0;
      const inputStart = prefixWidth;
      const suffixStart = inputStart + inputWidth;

      const pieces: PaintPiece[] = [...prefixPieces];
      let suffixOffset = 0;
      for (const piece of suffixSpecs) {
        const start = suffixStart + suffixOffset;
        const pieceWidth = textCellWidth(piece.text);
        pieces.push({ start, text: piece.text, style: piece.style });
        if (piece.action) hits.push({ start, end: start + pieceWidth, action: piece.action });
        suffixOffset += pieceWidth;
      }

      return {
        base,
        error,
        inputStart,
        inputWidth,
        pieces,
        hits: hits.filter((hit) => hit.end > hit.start),
      };
    });

    function focusSelf(): void {
      const nodeId = eventNode.id.value;
      if (nodeId) events.value?.focus(nodeId);
    }

    function applyUpdate(
      next: TLogSearchBarUpdatePayload,
      field:
        | Readonly<{ name: "query"; value: string }>
        | Readonly<{ name: "mode"; value: TLogSearchBarMode }>
        | Readonly<{ name: "caseSensitive"; value: boolean }>
        | Readonly<{ name: "wholeWord"; value: boolean }>,
    ): void {
      pendingUpdate.value = next;
      emit(`update:${field.name}`, field.value);
      emit("update", next satisfies TLogSearchBarUpdatePayload);
      scheduler.invalidate({ reason: "input" });
    }

    function emitNavigation(direction: "previous" | "next"): void {
      emit(direction, { direction } satisfies TLogSearchBarNavigatePayload);
      scheduler.invalidate({ reason: "input" });
    }

    function setCursorFromLocalX(localX: number): void {
      const layout = rowLayout.value;
      if (layout.inputWidth <= 0) return;
      const query = props.state.query;
      if (!query) {
        cursor.value = 0;
        scrollCellOffset.value = 0;
        scheduler.invalidate({ reason: "input" });
        return;
      }
      const relativeCell = clamp(localX - layout.inputStart, 0, layout.inputWidth);
      cursor.value = cellToStringIndex(query, scrollCellOffset.value + relativeCell);
      ensureCursorVisible(query, layout.inputWidth);
      scheduler.invalidate({ reason: "input" });
    }

    function toggleMode(): void {
      const current = liveUpdateState();
      const mode = current.mode === "regex" ? "text" : "regex";
      applyUpdate({ ...current, mode }, { name: "mode", value: mode });
    }

    function toggleCaseSensitive(): void {
      const current = liveUpdateState();
      const caseSensitive = !current.caseSensitive;
      applyUpdate({ ...current, caseSensitive }, { name: "caseSensitive", value: caseSensitive });
    }

    function toggleWholeWord(): void {
      const current = liveUpdateState();
      if (current.mode === "regex") return;
      const wholeWord = !current.wholeWord;
      applyUpdate({ ...current, wholeWord }, { name: "wholeWord", value: wholeWord });
    }

    function updateQuery(nextQuery: string, nextCursor = cursor.value): void {
      const current = liveUpdateState();
      cursor.value = clamp(nextCursor, 0, nextQuery.length);
      applyUpdate({ ...current, query: nextQuery }, { name: "query", value: nextQuery });
      ensureCursorVisible(nextQuery, rowLayout.value.inputWidth);
    }

    function onClick(e: TerminalPointerEvent): void {
      const full = fullRect.value;
      if (e.cellY !== full.y) return;
      focusSelf();
      const localX = e.cellX - full.x;
      if (localX < 0 || localX >= full.w) return;
      const layout = rowLayout.value;

      for (const hit of layout.hits) {
        if (localX < hit.start || localX >= hit.end) continue;
        if (hit.action === "mode") toggleMode();
        else if (hit.action === "case") toggleCaseSensitive();
        else if (hit.action === "wholeWord") toggleWholeWord();
        else emitNavigation(hit.action);
        e.preventDefault?.();
        return;
      }

      if (localX >= layout.inputStart && localX < layout.inputStart + layout.inputWidth) {
        setCursorFromLocalX(localX);
        e.preventDefault?.();
      }
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);

      if (e.key === "Enter") {
        e.preventDefault();
        emitNavigation(e.shiftKey ? "previous" : "next");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cursor.value = 0;
        scrollCellOffset.value = 0;
        emit("clear");
        scheduler.invalidate({ reason: "input" });
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        cursor.value = clamp(cursor.value - 1, 0, props.state.query.length);
        ensureCursorVisible(props.state.query, rowLayout.value.inputWidth);
        scheduler.invalidate({ reason: "input" });
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        cursor.value = clamp(cursor.value + 1, 0, props.state.query.length);
        ensureCursorVisible(props.state.query, rowLayout.value.inputWidth);
        scheduler.invalidate({ reason: "input" });
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        cursor.value = 0;
        ensureCursorVisible(props.state.query, rowLayout.value.inputWidth);
        scheduler.invalidate({ reason: "input" });
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        cursor.value = props.state.query.length;
        ensureCursorVisible(props.state.query, rowLayout.value.inputWidth);
        scheduler.invalidate({ reason: "input" });
        return;
      }
      if (e.key === "Backspace") {
        const query = liveUpdateState().query;
        if (cursor.value <= 0 || !query) return;
        e.preventDefault();
        updateQuery(query.slice(0, cursor.value - 1) + query.slice(cursor.value), cursor.value - 1);
        return;
      }
      if (e.key === "Delete") {
        const query = liveUpdateState().query;
        if (cursor.value >= query.length) return;
        e.preventDefault();
        updateQuery(query.slice(0, cursor.value) + query.slice(cursor.value + 1), cursor.value);
        return;
      }

      const lowerKey = e.key.toLowerCase();
      if (e.ctrlKey && !e.altKey && !e.metaKey && lowerKey === "r") {
        e.preventDefault();
        toggleMode();
        return;
      }
      if (
        ((e.altKey && !e.ctrlKey && !e.metaKey && lowerKey === "c") ||
          (e.ctrlKey && !e.altKey && !e.metaKey && lowerKey === "i")) &&
        !e.shiftKey
      ) {
        e.preventDefault();
        toggleCaseSensitive();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && lowerKey === "w") {
        e.preventDefault();
        toggleWholeWord();
        return;
      }

      if (isPrintableKey(e)) {
        e.preventDefault();
        const query = liveUpdateState().query;
        updateQuery(
          query.slice(0, cursor.value) + e.key + query.slice(cursor.value),
          cursor.value + e.key.length,
        );
      }
    }

    watch(
      () => [
        props.state.query,
        props.state.mode,
        props.state.caseSensitive,
        props.state.wholeWord,
        props.w,
      ],
      () => {
        pendingUpdate.value = null;
        cursor.value = clamp(cursor.value, 0, props.state.query.length);
        ensureCursorVisible(props.state.query, rowLayout.value.inputWidth);
      },
      { immediate: true },
    );

    const eventNode = useTerminalNode(() => ({
      rect: rect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: props.focusable,
      handlers: {
        click: onClick,
        focus: () => {
          focused.value = true;
          emit("focus");
          scheduler.invalidate();
        },
        blur: () => {
          focused.value = false;
          emit("blur");
          scheduler.invalidate();
        },
        keydown: onKeydown,
      },
    }));

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? rect.value : EMPTY_RECT,
      deps: [
        visible.value,
        rect.value,
        fullRect.value,
        props.state,
        props.placeholder,
        props.style,
        props.inputStyle,
        props.activeStyle,
        props.errorStyle,
        props.disabledStyle,
        props.toggleStyle,
        props.showModeToggle,
        props.showCaseToggle,
        props.showWholeWordToggle,
        props.showCount,
        props.showNavigation,
        defaultStyle.value,
        focused.value,
        cursor.value,
        scrollCellOffset.value,
        rowLayout.value,
      ],
      paint: () => {
        if (!visible.value) return;
        const r = rect.value;
        if (r.w <= 0 || r.h <= 0) return;

        const full = fullRect.value;
        const layout = rowLayout.value;
        terminal.write(spaces(r.w), { x: r.x, y: r.y, style: layout.base });

        const query = props.state.query;
        const isPlaceholder = !query;
        const inputStyle =
          props.state.status === "error"
            ? mergeStyle(layout.base, props.errorStyle)
            : mergeStyle(layout.base, props.inputStyle);
        const placeholderStyle = mergeStyle(inputStyle, props.disabledStyle);
        const cursorStyle = { inverse: true, ...inputStyle, ...props.activeStyle } satisfies Style;

        if (layout.inputWidth > 0) {
          const visibleText = isPlaceholder
            ? sliceByCellsRange(props.placeholder, 0, layout.inputWidth)
            : sliceByCellsRange(
                query,
                scrollCellOffset.value,
                scrollCellOffset.value + layout.inputWidth,
              );
          const padded = padEndByCells(visibleText, layout.inputWidth);
          const drawX = full.x + layout.inputStart;
          const drawStyle = isPlaceholder ? placeholderStyle : inputStyle;
          const clippedStart = Math.max(0, r.x - drawX);
          const clippedEnd = Math.min(layout.inputWidth, r.x + r.w - drawX);
          if (clippedEnd > clippedStart) {
            const clipped = sliceByCellsRange(padded, clippedStart, clippedEnd);
            terminal.write(clipped, { x: Math.max(drawX, r.x), y: r.y, style: drawStyle });
          }

          if (focused.value) {
            const cursorLocal = isPlaceholder
              ? 0
              : clamp(
                  stringIndexToCell(query, cursor.value) - scrollCellOffset.value,
                  0,
                  Math.max(0, layout.inputWidth - 1),
                );
            const cursorX = drawX + cursorLocal;
            if (cursorX >= r.x && cursorX < r.x + r.w) {
              const cursorChar =
                !isPlaceholder && cursor.value < query.length
                  ? sliceByCellsRange(
                      query,
                      stringIndexToCell(query, cursor.value),
                      stringIndexToCell(query, cursor.value) + 1,
                    ) || " "
                  : " ";
              terminal.write(cursorChar, { x: cursorX, y: r.y, style: cursorStyle });
            }
          }
        }

        for (const piece of layout.pieces) {
          const drawX = full.x + piece.start;
          const pieceWidth = textCellWidth(piece.text);
          const clippedStart = Math.max(0, r.x - drawX);
          const clippedEnd = Math.min(pieceWidth, r.x + r.w - drawX);
          if (clippedEnd <= clippedStart) continue;
          const clipped = sliceByCellsRange(piece.text, clippedStart, clippedEnd);
          if (!clipped) continue;
          terminal.write(clipped, { x: Math.max(drawX, r.x), y: r.y, style: piece.style });
        }
      },
    }));

    return () =>
      h(
        "div",
        {
          ...rootProps,
          "data-t-log-search-bar": true,
        },
        [],
      );
  },
});
