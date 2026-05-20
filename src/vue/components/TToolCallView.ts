import type { PropType, VNodeChild } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { useTerminal } from "../composables/use-terminal.js";
import {
  sanitizeInlineText,
  sliceByCells,
  textCellWidth,
  withTextWidthProvider,
} from "../utils/text.js";

export type TToolCallStatus = "pending" | "running" | "success" | "error" | "warning" | "neutral";

export type TToolCallViewSegmentRole =
  | "marker"
  | "status"
  | "separator"
  | "title"
  | "suffix"
  | "preview-prefix"
  | "preview";

export type TToolCallViewSegment = Readonly<{
  role: TToolCallViewSegmentRole;
  x: number;
  text: string;
  cells: number;
  style: Style;
}>;

export type TToolCallViewStyles = Readonly<{
  base: Style;
  header: Style;
  marker: Style;
  status: Style;
  title: Style;
  suffix: Style;
  preview: Style;
}>;

export type TToolCallViewSlotProps = Readonly<{
  x: number;
  y: number;
  w: number;
  collapsed: boolean;
  nested: boolean;
  selected: boolean;
  status: TToolCallStatus;
  marker: string;
  statusDot: string;
  title: string;
  suffix: string;
  preview: string;
  previewPrefix: string;
  segments: readonly TToolCallViewSegment[];
  styles: TToolCallViewStyles;
}>;

const DEFAULT_BASE_STYLE: Style = Object.freeze({ fg: "yellowBright", bg: "black" });
const DEFAULT_MUTED_STYLE: Style = Object.freeze({ fg: "white", bg: "black", dim: true });

function mergeStyle(base: Style, ...overrides: readonly (Style | undefined)[]): Style {
  let out = base;
  for (const next of overrides) {
    if (next) out = { ...out, ...next };
  }
  return out;
}

function fitText(text: string, width: number): string {
  const safe = sanitizeInlineText(text);
  if (width <= 0) return "";
  if (textCellWidth(safe) <= width) return safe;
  if (width <= 1) return sliceByCells(safe, width);
  return `${sliceByCells(safe, width - 1)}…`;
}

function normalizeSuffix(text: string): string {
  const safe = sanitizeInlineText(text);
  if (!safe) return "";
  return safe.startsWith(" ") ? safe : ` ${safe}`;
}

function fitSuffix(text: string, width: number): string {
  const suffix = normalizeSuffix(text);
  if (!suffix || width <= 0) return "";
  if (textCellWidth(suffix) <= width) return suffix;
  const bodyWidth = width - 2;
  if (bodyWidth <= 0) return "";
  return ` ${sliceByCells(suffix.trimStart(), bodyWidth)}…`;
}

function statusStyle(status: TToolCallStatus, base: Style, muted: Style): Style {
  if (status === "success") return mergeStyle(base, { fg: "greenBright", bold: true });
  if (status === "error") return mergeStyle(base, { fg: "redBright", bold: true });
  if (status === "warning") return mergeStyle(base, { fg: "yellowBright", bold: true });
  return mergeStyle(base, muted);
}

function pushSegment(
  out: TToolCallViewSegment[],
  role: TToolCallViewSegmentRole,
  x: number,
  text: string,
  style: Style,
): number {
  if (!text) return x;
  const cells = textCellWidth(text);
  out.push({ role, x, text, cells, style });
  return x + cells;
}

function renderSegments(segments: readonly TToolCallViewSegment[], y: number, width: number) {
  return segments.map((segment, index) => {
    const available = Math.max(0, width - segment.x);
    const w = Math.min(segment.cells, available);
    if (w <= 0) return null;
    return h(TText, {
      key: `${segment.role}:${index}`,
      x: segment.x,
      y,
      w,
      value: sliceByCells(segment.text, w),
      style: segment.style,
      clear: false,
    });
  });
}

export const TToolCallView = defineComponent({
  name: "TToolCallView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    title: { type: String, required: true },
    collapsed: { type: Boolean, default: false },
    status: { type: String as PropType<TToolCallStatus>, default: "pending" },
    suffix: { type: String, default: "" },
    preview: { type: String, default: "" },
    nested: { type: Boolean, default: false },
    selected: { type: Boolean, default: false },
    markerCollapsed: { type: String, default: "▸" },
    markerExpanded: { type: String, default: "▾" },
    statusDot: { type: String, default: "●" },
    previewPrefix: { type: String, default: "  ⎿ " },
    style: { type: Object as PropType<Style>, default: undefined },
    mutedStyle: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: undefined },
    collapsedStyle: { type: Object as PropType<Style>, default: undefined },
    expandedStyle: { type: Object as PropType<Style>, default: undefined },
    markerStyle: { type: Object as PropType<Style>, default: undefined },
    statusStyle: { type: Object as PropType<Style>, default: undefined },
    titleStyle: { type: Object as PropType<Style>, default: undefined },
    suffixStyle: { type: Object as PropType<Style>, default: undefined },
    previewStyle: { type: Object as PropType<Style>, default: undefined },
    focusable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: undefined },
  },
  emits: ["click", "toggle"],
  setup(props, { emit, slots }) {
    const { widthProvider } = useTerminal();
    const withWidthProvider = <T>(fn: () => T): T => withTextWidthProvider(widthProvider, fn);

    const model = computed(() =>
      withWidthProvider(() => {
        const width = Math.max(0, Math.floor(props.w));
        const base = props.style ?? DEFAULT_BASE_STYLE;
        const muted = props.mutedStyle ?? mergeStyle(DEFAULT_MUTED_STYLE, { bg: base.bg });
        const header = props.collapsed
          ? mergeStyle(base, { dim: true }, props.collapsedStyle, props.headerStyle)
          : mergeStyle(
              base,
              props.selected ? { bold: true } : undefined,
              props.expandedStyle,
              props.headerStyle,
            );
        const marker = props.markerStyle ? mergeStyle(header, props.markerStyle) : header;
        const dot = mergeStyle(statusStyle(props.status, base, muted), props.statusStyle);
        const title = mergeStyle(
          base,
          { dim: false },
          props.selected ? { bold: true } : undefined,
          props.titleStyle,
        );
        const suffix = mergeStyle(base, muted, props.suffixStyle);
        const preview = mergeStyle(base, { dim: true }, props.previewStyle);
        const styles: TToolCallViewStyles = {
          base,
          header,
          marker,
          status: dot,
          title,
          suffix,
          preview,
        };

        const segments: TToolCallViewSegment[] = [];
        let x = 0;
        const nestedLead = props.nested ? "    " : "";
        const markerText = `${nestedLead}${props.collapsed ? props.markerCollapsed : props.markerExpanded} `;
        x = pushSegment(segments, "marker", x, markerText, marker);
        if (props.statusDot) {
          x = pushSegment(segments, "status", x, props.statusDot, dot);
          x = pushSegment(segments, "separator", x, " ", header);
        }
        x = pushSegment(segments, "title", x, fitText(props.title, Math.max(0, width - x)), title);
        if (props.collapsed) {
          const visibleSuffix = fitSuffix(props.suffix, Math.max(0, width - x));
          pushSegment(segments, "suffix", x, visibleSuffix, suffix);
        }

        const previewPrefix = `${nestedLead}${props.previewPrefix}`;
        const previewText =
          props.collapsed && props.preview
            ? fitText(props.preview, Math.max(0, width - textCellWidth(previewPrefix)))
            : "";
        const previewSegments: TToolCallViewSegment[] = [];
        if (previewText) {
          let previewX = 0;
          previewX = pushSegment(
            previewSegments,
            "preview-prefix",
            previewX,
            previewPrefix,
            preview,
          );
          pushSegment(previewSegments, "preview", previewX, previewText, preview);
        }

        return {
          styles,
          marker: props.collapsed ? props.markerCollapsed : props.markerExpanded,
          suffix: segments.find((segment) => segment.role === "suffix")?.text ?? "",
          preview: previewText,
          previewPrefix,
          headerSegments: segments,
          previewSegments,
        };
      }),
    );

    return () => {
      const state = model.value;
      const height = Math.max(1, Math.floor(props.h ?? (state.preview ? 2 : 1)));
      const headerSlotProps: TToolCallViewSlotProps = {
        x: 0,
        y: 0,
        w: props.w,
        collapsed: props.collapsed,
        nested: props.nested,
        selected: props.selected,
        status: props.status,
        marker: state.marker,
        statusDot: props.statusDot,
        title: props.title,
        suffix: state.suffix,
        preview: state.preview,
        previewPrefix: state.previewPrefix,
        segments: state.headerSegments,
        styles: state.styles,
      };
      const previewSlotProps: TToolCallViewSlotProps = {
        ...headerSlotProps,
        y: 1,
        segments: state.previewSegments,
      };
      const children: VNodeChild[] = [
        h(TText, {
          key: "header-bg",
          x: 0,
          y: 0,
          w: props.w,
          h: 1,
          value: "",
          style: state.styles.header,
        }),
        ...(slots.header
          ? slots.header(headerSlotProps)
          : withWidthProvider(() => renderSegments(state.headerSegments, 0, props.w))),
      ];
      if (state.preview && height > 1) {
        children.push(
          h(TText, {
            key: "preview-bg",
            x: 0,
            y: 1,
            w: props.w,
            h: 1,
            value: "",
            style: state.styles.preview,
          }),
          ...(slots.preview
            ? slots.preview(previewSlotProps)
            : withWidthProvider(() => renderSegments(state.previewSegments, 1, props.w))),
        );
      }

      return h(
        TView,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: height,
          zIndex: props.zIndex,
          focusable: props.focusable,
          selectable: props.selectable,
          onClick: (event: unknown) => {
            emit("click", event);
            emit("toggle", { collapsed: !props.collapsed });
          },
        },
        () => children,
      );
    };
  },
});
