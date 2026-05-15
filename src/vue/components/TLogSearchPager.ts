import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type {
  Rect,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import type { TLogViewSearchError, TLogViewSearchState } from "./TLogView.js";
import { computed, defineComponent, h, inject, ref } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { sliceByCellsRange, spaces, textCellWidth } from "../utils/text.js";

const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });
const PREVIOUS_CHAR = "◀";
const NEXT_CHAR = "▶";

export type TLogSearchPagerState = Readonly<{
  page: number;
  pageCount: number;
  matchCount: number;
  status: TLogViewSearchState["status"];
  error?: TLogViewSearchError | null;
}>;

export type TLogSearchPagerPageChangePayload = Readonly<{
  page: number;
}>;

type PagerSegment = Readonly<{
  text: string;
  style: Style;
  action?: "previous" | "next";
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

function formatCount(matchCount: number): string {
  return `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
}

function errorLabel(error: TLogViewSearchError | null | undefined): string {
  if (error?.kind === "invalid-regex") return "Invalid regex";
  return "Search error";
}

export const TLogSearchPager = defineComponent({
  name: "TLogSearchPager",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    state: {
      type: Object as PropType<TLogSearchPagerState | null>,
      default: null,
    },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    disabledStyle: {
      type: Object as PropType<Style>,
      default: () => ({ dim: true }),
    },
    errorStyle: {
      type: Object as PropType<Style>,
      default: () => ({ fg: "redBright", bold: true }),
    },
    showCount: { type: Boolean, default: true },
  },
  emits: ["previousPage", "nextPage", "pageChange"],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const parent = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const focused = ref(false);

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

    const viewState = computed(() => props.state);

    const segments = computed<readonly PagerSegment[]>(() => {
      const base = props.style ?? defaultStyle.value;
      const active = mergeStyle(base, props.activeStyle);
      const disabled = mergeStyle(base, props.disabledStyle);
      const error = mergeStyle(base, props.errorStyle);
      const state = viewState.value;

      if (!state || state.status === "idle") return [{ text: "No search", style: base }];
      if (state.status === "error") return [{ text: errorLabel(state.error), style: error }];
      if (state.status === "scanning") {
        const text =
          props.showCount && state.matchCount > 0
            ? `Scanning… ${formatCount(state.matchCount)}`
            : "Scanning…";
        return [{ text, style: base }];
      }
      if (state.matchCount <= 0 || state.pageCount <= 0)
        return [{ text: "No matches", style: base }];

      const previousEnabled = state.page > 0;
      const nextEnabled = state.page < state.pageCount - 1;
      const parts: PagerSegment[] = [
        {
          text: PREVIOUS_CHAR,
          style: previousEnabled ? active : disabled,
          action: previousEnabled ? "previous" : undefined,
        },
        {
          text: ` ${state.page + 1}/${state.pageCount}`,
          style: base,
        },
      ];

      if (props.showCount) {
        parts.push({
          text: ` ${formatCount(state.matchCount)} `,
          style: base,
        });
      } else {
        parts.push({ text: " ", style: base });
      }

      parts.push({
        text: NEXT_CHAR,
        style: nextEnabled ? active : disabled,
        action: nextEnabled ? "next" : undefined,
      });

      return parts;
    });

    function emitPage(action: "previous" | "next"): void {
      const state = viewState.value;
      if (!state || state.status !== "done" || state.pageCount <= 0) return;
      const target =
        action === "previous"
          ? clamp(state.page - 1, 0, Math.max(0, state.pageCount - 1))
          : clamp(state.page + 1, 0, Math.max(0, state.pageCount - 1));
      if (target === state.page) return;
      emit(action === "previous" ? "previousPage" : "nextPage");
      emit("pageChange", { page: target } satisfies TLogSearchPagerPageChangePayload);
      scheduler.invalidate({ reason: "input" });
    }

    function focusSelf(): void {
      const nodeId = eventNode.id.value;
      if (nodeId) events.value?.focus(nodeId);
    }

    function actionAt(cellX: number): "previous" | "next" | null {
      const full = fullRect.value;
      const localX = cellX - full.x;
      if (localX < 0 || localX >= full.w) return null;

      let start = 0;
      for (const segment of segments.value) {
        const width = textCellWidth(segment.text);
        if (localX >= start && localX < start + width) return segment.action ?? null;
        start += width;
      }

      return null;
    }

    function onClick(e: TerminalPointerEvent): void {
      const full = fullRect.value;
      if (e.cellY !== full.y) return;
      focusSelf();
      const action = actionAt(e.cellX);
      if (!action) return;
      emitPage(action);
      e.preventDefault?.();
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        emitPage("previous");
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        emitPage("next");
      }
    }

    const eventNode = useTerminalNode(() => ({
      rect: rect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: onClick,
        focus: () => {
          focused.value = true;
          scheduler.invalidate();
        },
        blur: () => {
          focused.value = false;
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
        props.style,
        props.activeStyle,
        props.disabledStyle,
        props.errorStyle,
        props.showCount,
        defaultStyle.value,
        focused.value,
        segments.value,
      ],
      paint: () => {
        if (!visible.value) return;
        const r = rect.value;
        if (r.w <= 0 || r.h <= 0) return;

        const full = fullRect.value;
        const base = props.style ?? defaultStyle.value;
        terminal.write(spaces(r.w), { x: r.x, y: r.y, style: base });

        let cursorX = full.x;
        for (const segment of segments.value) {
          const clippedStart = Math.max(0, r.x - cursorX);
          const clippedEnd = Math.min(textCellWidth(segment.text), r.x + r.w - cursorX);
          if (clippedEnd > clippedStart) {
            const text = sliceByCellsRange(segment.text, clippedStart, clippedEnd);
            if (text)
              terminal.write(text, { x: Math.max(cursorX, r.x), y: r.y, style: segment.style });
          }
          cursorX += textCellWidth(segment.text);
          if (cursorX >= r.x + r.w) break;
        }
      },
    }));

    return () =>
      h(
        "div",
        {
          ...rootProps,
          "data-t-log-search-pager": true,
        },
        [],
      );
  },
});
