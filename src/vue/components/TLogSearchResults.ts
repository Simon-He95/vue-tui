import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import { computed, defineComponent, h, inject, ref, watch } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { sliceByCellsRange, spaces, textCellWidth } from "../utils/text.js";

const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });

export type TLogSearchResultItem = Readonly<{
  matchIndex: number;
  absoluteLineIndex: number;
  lineIndex: number;
  text: string;
  matchStartCell: number;
  matchEndCell: number;
  current?: boolean;
}>;

export type TLogSearchResultsSelectPayload = Readonly<{
  matchIndex: number;
  result: TLogSearchResultItem;
}>;

export type TLogSearchResultsActiveChangePayload = Readonly<{
  activeIndex: number;
  result: TLogSearchResultItem | null;
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

function normalizeActiveIndex(value: number, count: number): number {
  if (count <= 0) return -1;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return -1;
  if (n < 0) return -1;
  return clamp(n, 0, count - 1);
}

export const TLogSearchResults = defineComponent({
  name: "TLogSearchResults",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    results: {
      type: Array as PropType<readonly TLogSearchResultItem[]>,
      default: () => [],
    },
    activeIndex: { type: Number, default: -1 },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: {
      type: Object as PropType<Style>,
      default: () => ({ inverse: true }),
    },
    matchStyle: {
      type: Object as PropType<Style>,
      default: () => ({ underline: true }),
    },
    currentStyle: {
      type: Object as PropType<Style>,
      default: () => ({ bold: true }),
    },
    showLineNumbers: { type: Boolean, default: true },
    focusable: { type: Boolean, default: true },
  },
  emits: ["select", "activeChange", "keydown", "focus", "blur"],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const parent = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const focused = ref(false);
    const internalActiveIndex = ref(-1);

    const fullRect = computed<Rect>(() =>
      translateRect(
        {
          x: normalizeInt(props.x),
          y: normalizeInt(props.y),
          w: Math.max(0, normalizeInt(props.w)),
          h: Math.max(0, normalizeInt(props.h)),
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

    const lineNumberDigits = computed(() =>
      props.showLineNumbers
        ? props.results.reduce(
            (max, result) => Math.max(max, String(result.absoluteLineIndex).length),
            1,
          )
        : 0,
    );

    watch(
      [() => props.activeIndex, () => props.results.length],
      () => {
        internalActiveIndex.value = normalizeActiveIndex(props.activeIndex, props.results.length);
      },
      { immediate: true },
    );

    function activeResult(index = internalActiveIndex.value): TLogSearchResultItem | null {
      return index >= 0 ? (props.results[index] ?? null) : null;
    }

    function emitActiveChange(): void {
      emit("activeChange", {
        activeIndex: internalActiveIndex.value,
        result: activeResult(),
      } satisfies TLogSearchResultsActiveChangePayload);
    }

    function setActiveIndex(index: number): void {
      const next = normalizeActiveIndex(index, props.results.length);
      if (next === internalActiveIndex.value) return;
      internalActiveIndex.value = next;
      emitActiveChange();
      scheduler.invalidate({ reason: "input" });
    }

    function emitSelect(index: number): void {
      const result = props.results[index];
      if (!result) return;
      emit("select", {
        matchIndex: result.matchIndex,
        result,
      } satisfies TLogSearchResultsSelectPayload);
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (!props.results.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((internalActiveIndex.value < 0 ? -1 : internalActiveIndex.value) + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(internalActiveIndex.value < 0 ? 0 : internalActiveIndex.value - 1);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(props.results.length - 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (internalActiveIndex.value >= 0) emitSelect(internalActiveIndex.value);
      }
    }

    function onClick(e: TerminalPointerEvent): void {
      const full = fullRect.value;
      const localY = e.cellY - full.y;
      if (localY < 0 || localY >= full.h) return;
      const result = props.results[localY];
      if (!result) return;
      const nodeId = eventNode.id.value;
      if (props.focusable && nodeId) events.value?.focus(nodeId);
      setActiveIndex(localY);
      emitSelect(localY);
      e.preventDefault?.();
    }

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
        props.results,
        props.activeIndex,
        props.style,
        props.activeStyle,
        props.matchStyle,
        props.currentStyle,
        props.showLineNumbers,
        props.focusable,
        internalActiveIndex.value,
        focused.value,
        lineNumberDigits.value,
        defaultStyle.value,
      ],
      paint: () => {
        if (!visible.value) return;
        const r = rect.value;
        if (r.w <= 0 || r.h <= 0) return;

        const full = fullRect.value;
        const base = props.style ?? defaultStyle.value;

        const writeSegments = (
          y: number,
          rowStyle: Style,
          segments: readonly Readonly<{
            text: string;
            style: Style;
          }>[],
        ): void => {
          const clipStart = Math.max(0, r.x - full.x);
          const clipEnd = clipStart + r.w;
          let logicalX = 0;
          let x = r.x;
          let used = 0;
          for (const segment of segments) {
            if (used >= r.w || !segment.text) continue;
            const segmentCells = textCellWidth(segment.text);
            const clippedStart = Math.max(0, clipStart - logicalX);
            const clippedEnd = Math.min(segmentCells, clipEnd - logicalX);
            logicalX += segmentCells;
            if (clippedEnd <= clippedStart) continue;
            const text = sliceByCellsRange(segment.text, clippedStart, clippedEnd);
            const cells = textCellWidth(text);
            if (!text || cells <= 0) continue;
            terminal.write(text, { x, y, style: segment.style });
            x += cells;
            used += cells;
          }
          if (used < r.w) terminal.write(spaces(r.w - used), { x, y, style: rowStyle });
        };

        for (let y = r.y; y < r.y + r.h; y++) {
          const localY = y - full.y;
          const result = props.results[localY];
          if (!result) {
            terminal.write(spaces(r.w), { x: r.x, y, style: base });
            continue;
          }

          let rowStyle = base;
          if (localY === internalActiveIndex.value)
            rowStyle = mergeStyle(rowStyle, props.activeStyle);
          if (result.current) rowStyle = mergeStyle(rowStyle, props.currentStyle);
          const rowMatchStyle = mergeStyle(rowStyle, props.matchStyle);
          const lineNumberText = props.showLineNumbers
            ? `${String(result.absoluteLineIndex).padStart(lineNumberDigits.value)} `
            : "";
          const previewCells = textCellWidth(result.text);
          const matchStartCell = clamp(result.matchStartCell, 0, previewCells);
          const matchEndCell = clamp(result.matchEndCell, matchStartCell, previewCells);

          const segments: Array<{
            text: string;
            style: Style;
          }> = [];
          if (lineNumberText) segments.push({ text: lineNumberText, style: rowStyle });
          if (matchStartCell > 0) {
            segments.push({
              text: sliceByCellsRange(result.text, 0, matchStartCell),
              style: rowStyle,
            });
          }
          if (matchEndCell > matchStartCell) {
            segments.push({
              text: sliceByCellsRange(result.text, matchStartCell, matchEndCell),
              style: rowMatchStyle,
            });
          }
          if (matchEndCell < previewCells) {
            segments.push({
              text: sliceByCellsRange(result.text, matchEndCell, previewCells),
              style: rowStyle,
            });
          }
          if (!result.text) segments.push({ text: "", style: rowStyle });

          writeSegments(y, rowStyle, segments);
        }
      },
    }));

    return () => h("span", rootProps);
  },
});
