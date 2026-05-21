import type { PropType, VNodeChild } from "vue";
import type { Style } from "../../core/types.js";
import type { TUserMessageSegment } from "../agent/view-models.js";
import { computed, defineComponent, h } from "vue";
import { resolveTUserMessageViewModel } from "../agent/view-models.js";
import { useTerminal } from "../composables/use-terminal.js";
import { spaces, textCellWidth, withTextWidthProvider } from "../utils/text.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

const DEFAULT_BLOCK_STYLE: Style = { fg: "whiteBright", bg: "blackBright" };
const DEFAULT_HEADER_STYLE: Style = { fg: "white", bg: "blackBright", dim: true };
const DEFAULT_LABEL_STYLE: Style = { fg: "greenBright", bg: "blackBright", bold: true };
const DEFAULT_SEGMENT_STYLE: Style = {
  fg: "cyanBright",
  bg: "blackBright",
  underline: true,
};

function styledText(key: string, x: number, y: number, w: number, value: string, style: Style) {
  if (w <= 0) return null;
  return h(TText, {
    key,
    x,
    y,
    w,
    value,
    style,
    clear: false,
  });
}

export const TUserMessageView = defineComponent({
  name: "TUserMessageView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    label: { type: String, default: "user" },
    prefix: { type: String, default: "> " },
    meta: { type: String, default: "" },
    content: { type: String, required: true },
    indent: { type: Number, default: 2 },
    topBlank: { type: Boolean, default: true },
    bottomBlank: { type: Boolean, default: true },
    segments: { type: Array as PropType<readonly TUserMessageSegment[]>, default: () => [] },
    style: { type: Object as PropType<Style>, default: () => DEFAULT_BLOCK_STYLE },
    headerStyle: { type: Object as PropType<Style>, default: () => DEFAULT_HEADER_STYLE },
    prefixStyle: { type: Object as PropType<Style>, default: () => DEFAULT_LABEL_STYLE },
    labelStyle: { type: Object as PropType<Style>, default: () => DEFAULT_LABEL_STYLE },
    contentStyle: { type: Object as PropType<Style>, default: undefined },
    segmentStyle: { type: Object as PropType<Style>, default: () => DEFAULT_SEGMENT_STYLE },
    focusable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: undefined },
  },
  setup(props) {
    const { widthProvider } = useTerminal();
    const withWidthProvider = <T>(fn: () => T): T => withTextWidthProvider(widthProvider, fn);

    const model = computed(() =>
      withWidthProvider(() =>
        resolveTUserMessageViewModel({
          w: props.w,
          label: props.label,
          prefix: props.prefix,
          meta: props.meta,
          content: props.content,
          indent: props.indent,
          topBlank: props.topBlank,
          bottomBlank: props.bottomBlank,
          segments: props.segments,
          style: props.style,
          headerStyle: props.headerStyle,
          prefixStyle: props.prefixStyle,
          labelStyle: props.labelStyle,
          contentStyle: props.contentStyle,
          segmentStyle: props.segmentStyle,
        }),
      ),
    );

    return () => {
      const state = model.value;
      const topRows = props.topBlank ? 1 : 0;
      const naturalHeight = topRows + 1 + state.rows.length + (props.bottomBlank ? 1 : 0);
      const height = Math.max(1, Math.floor(props.h ?? naturalHeight));
      const children: VNodeChild[] = [];

      for (let y = 0; y < height; y++) {
        children.push(
          h(TText, {
            key: `bg:${y}`,
            x: 0,
            y,
            w: props.w,
            value: "",
            style: state.content,
          }),
        );
      }

      withWidthProvider(() => {
        const indent = Math.min(state.indent, props.w);
        const headerY = topRows;
        if (headerY < height) {
          const headerText = `${spaces(indent)}${state.headerText}`;
          children.push(
            h(TText, {
              key: "header",
              x: 0,
              y: headerY,
              w: props.w,
              value: headerText,
              style: state.header,
              clear: false,
            }),
          );

          for (let index = 0; index < state.headerSegments.length; index++) {
            const segment = state.headerSegments[index]!;
            const x = indent + textCellWidth(state.headerText.slice(0, segment.start));
            const width = Math.min(textCellWidth(segment.text), Math.max(0, props.w - x));
            children.push(
              styledText(`header:${index}`, x, headerY, width, segment.text, segment.style),
            );
          }
        }

        const contentStartY = headerY + 1;
        for (let rowIndex = 0; rowIndex < state.rows.length; rowIndex++) {
          const y = contentStartY + rowIndex;
          if (y >= height) break;

          const row = state.rows[rowIndex]!;
          children.push(
            h(TText, {
              key: `row:${rowIndex}`,
              x: 0,
              y,
              w: props.w,
              value: `${spaces(indent)}${row.text}`,
              style: state.content,
              clear: false,
            }),
          );

          for (let segmentIndex = 0; segmentIndex < row.segments.length; segmentIndex++) {
            const segment = row.segments[segmentIndex]!;
            const localStart = Math.max(0, segment.start - row.start);
            const localEnd = Math.max(localStart, segment.end - row.start);
            const text = row.text.slice(localStart, localEnd);
            if (!text) continue;

            const x = indent + textCellWidth(row.text.slice(0, localStart));
            const width = Math.min(textCellWidth(text), Math.max(0, props.w - x));
            children.push(
              styledText(`row:${rowIndex}:segment:${segmentIndex}`, x, y, width, text, {
                ...state.segment,
                ...segment.style,
                href: segment.href ?? segment.style?.href,
              }),
            );
          }
        }
      });

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
        },
        () => children,
      );
    };
  },
});
