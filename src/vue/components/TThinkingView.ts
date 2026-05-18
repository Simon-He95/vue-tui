import type { PropType, VNodeChild } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { textCellWidth, wrapByCells } from "../utils/text.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

export type TThinkingViewSegmentRole = "marker" | "title" | "body-prefix" | "body";

export type TThinkingViewSegment = Readonly<{
  role: TThinkingViewSegmentRole;
  x: number;
  cells: number;
  text: string;
  style: Style;
}>;

export type TThinkingViewStyles = Readonly<{
  header: Style;
  marker: Style;
  title: Style;
  body: Style;
}>;

export type TThinkingViewModelOptions = Readonly<{
  w: number;
  title: string;
  content?: string;
  collapsed?: boolean;
  pulseFrame?: number | null;
  markerCollapsed?: string;
  markerExpanded?: string;
  bodyPrefix?: string;
  style?: Style;
  headerStyle?: Style;
  markerStyle?: Style;
  titleStyle?: Style;
  bodyStyle?: Style;
}>;

export type TThinkingViewModel = Readonly<{
  styles: TThinkingViewStyles;
  headerText: string;
  headerSegments: readonly TThinkingViewSegment[];
  bodyRows: readonly string[];
  bodySegments: readonly (readonly TThinkingViewSegment[])[];
  height: number;
}>;

const DEFAULT_HEADER_STYLE: Style = Object.freeze({ fg: "magentaBright", bg: "black", bold: true });
const DEFAULT_BODY_STYLE: Style = Object.freeze({ fg: "white", bg: "black", dim: true });

function highlightedTitle(title: string, frame: number): string | null {
  const chars = Array.from(title ?? "");
  const caseable: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? "";
    if (ch.toLowerCase() !== ch.toUpperCase()) caseable.push(i);
  }
  if (caseable.length === 0) return null;

  const safeFrame = Number.isFinite(frame) ? Math.floor(frame) : 0;
  const target = caseable[safeFrame % caseable.length] ?? caseable[0]!;
  return chars
    .map((ch, index) => {
      if (ch.toLowerCase() === ch.toUpperCase()) return ch;
      return index === target ? ch.toUpperCase() : ch.toLowerCase();
    })
    .join("");
}

function pushSegment(
  out: TThinkingViewSegment[],
  role: TThinkingViewSegmentRole,
  x: number,
  text: string,
  style: Style,
): number {
  if (!text) return x;
  const cells = textCellWidth(text);
  out.push({ role, x, cells, text, style });
  return x + cells;
}

export function resolveTThinkingViewModel(options: TThinkingViewModelOptions): TThinkingViewModel {
  const width = Math.max(1, Math.floor(options.w));
  const collapsed = Boolean(options.collapsed);
  const header = { ...DEFAULT_HEADER_STYLE, ...options.style, ...options.headerStyle };
  const markerStyle = { ...header, ...options.markerStyle };
  const titleStyle = { ...header, ...options.titleStyle };
  const bodyStyle = { ...DEFAULT_BODY_STYLE, bg: header.bg, ...options.bodyStyle };
  const styles: TThinkingViewStyles = {
    header,
    marker: markerStyle,
    title: titleStyle,
    body: bodyStyle,
  };

  const marker = collapsed ? (options.markerCollapsed ?? "▸") : (options.markerExpanded ?? "▾");
  const title =
    collapsed && options.pulseFrame != null
      ? (highlightedTitle(options.title, options.pulseFrame) ?? options.title)
      : options.title;
  const headerSegments: TThinkingViewSegment[] = [];
  let x = 0;
  x = pushSegment(headerSegments, "marker", x, `${marker} `, markerStyle);
  pushSegment(headerSegments, "title", x, title, titleStyle);
  const headerText = headerSegments.map((segment) => segment.text).join("");

  const bodyRows: string[] = [];
  const bodySegments: TThinkingViewSegment[][] = [];
  if (!collapsed) {
    const text = String(options.content ?? "").replace(/\r/g, "");
    if (text) {
      const prefix = options.bodyPrefix ?? "  ";
      const bodyWidth = Math.max(1, width - textCellWidth(prefix));
      for (const line of text.split("\n")) {
        const wrapped = wrapByCells(line, bodyWidth);
        for (const row of wrapped) {
          bodyRows.push(`${prefix}${row}`);
          const segments: TThinkingViewSegment[] = [];
          let bodyX = 0;
          bodyX = pushSegment(segments, "body-prefix", bodyX, prefix, bodyStyle);
          pushSegment(segments, "body", bodyX, row, bodyStyle);
          bodySegments.push(segments);
        }
      }
    }
  }

  return {
    styles,
    headerText,
    headerSegments,
    bodyRows,
    bodySegments,
    height: 1 + bodyRows.length,
  };
}

function renderSegments(segments: readonly TThinkingViewSegment[], y: number, width: number) {
  return segments.map((segment, index) =>
    h(TText, {
      key: `${y}:${index}:${segment.role}`,
      x: segment.x,
      y,
      w: Math.min(segment.cells, Math.max(0, width - segment.x)),
      value: segment.text,
      style: segment.style,
      clear: false,
    }),
  );
}

export const TThinkingView = defineComponent({
  name: "TThinkingView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    title: { type: String, default: "Thinking" },
    content: { type: String, default: "" },
    collapsed: { type: Boolean, default: false },
    pulseFrame: { type: Number as PropType<number | null>, default: null },
    markerCollapsed: { type: String, default: "▸" },
    markerExpanded: { type: String, default: "▾" },
    bodyPrefix: { type: String, default: "  " },
    style: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: undefined },
    markerStyle: { type: Object as PropType<Style>, default: undefined },
    titleStyle: { type: Object as PropType<Style>, default: undefined },
    bodyStyle: { type: Object as PropType<Style>, default: undefined },
  },
  emits: ["click", "toggle"],
  setup(props, { emit, slots }) {
    const model = computed(() => resolveTThinkingViewModel(props));

    return () => {
      const state = model.value;
      const children: VNodeChild[] = [];
      if (slots.header) {
        children.push(
          ...(slots.header({
            y: 0,
            w: props.w,
            text: state.headerText,
            segments: state.headerSegments,
            styles: state.styles,
          }) ?? []),
        );
      } else {
        children.push(...renderSegments(state.headerSegments, 0, props.w));
      }

      for (let index = 0; index < state.bodySegments.length; index++) {
        children.push(...renderSegments(state.bodySegments[index]!, index + 1, props.w));
      }

      return h(
        TView,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: state.height,
          zIndex: props.zIndex,
          focusable: true,
          onClick: (event: unknown) => {
            emit("click", event);
            emit("toggle", event);
          },
        },
        () => children,
      );
    };
  },
});
