import type { PropType, VNodeChild } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { useTerminal } from "../composables/use-terminal.js";
import { resolveTToolCallViewModel } from "../agent/view-models.js";
import { sliceByCells, withTextWidthProvider } from "../utils/text.js";

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
      withWidthProvider(() =>
        resolveTToolCallViewModel({
          w: props.w,
          title: props.title,
          collapsed: props.collapsed,
          selected: props.selected,
          nested: props.nested,
          status: props.status,
          suffix: props.suffix,
          preview: props.preview,
          markerCollapsed: props.markerCollapsed,
          markerExpanded: props.markerExpanded,
          statusDot: props.statusDot,
          previewPrefix: props.previewPrefix,
          style: props.style,
          mutedStyle: props.mutedStyle,
          headerStyle: props.headerStyle,
          collapsedStyle: props.collapsedStyle,
          expandedStyle: props.expandedStyle,
          markerStyle: props.markerStyle,
          statusStyle: props.statusStyle,
          titleStyle: props.titleStyle,
          suffixStyle: props.suffixStyle,
          previewStyle: props.previewStyle,
        }),
      ),
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
