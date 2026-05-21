import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { resolveTThinkingViewModel } from "../agent/view-models.js";
import { useTerminal } from "../composables/use-terminal.js";
import { withTextWidthProvider } from "../utils/text.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

const DEFAULT_HEADER_STYLE: Style = { fg: "magentaBright", bg: "black", bold: true };
const DEFAULT_BODY_STYLE: Style = { fg: "white", bg: "black", dim: true };

export const TThinkingView = defineComponent({
  name: "TThinkingView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    title: { type: String, default: "Thinking" },
    content: { type: String, default: "" },
    collapsed: { type: Boolean, default: false },
    pulseFrame: { type: Number as PropType<number | null>, default: null },
    style: { type: Object as PropType<Style>, default: undefined },
    headerStyle: { type: Object as PropType<Style>, default: () => DEFAULT_HEADER_STYLE },
    markerStyle: { type: Object as PropType<Style>, default: undefined },
    titleStyle: { type: Object as PropType<Style>, default: undefined },
    bodyStyle: { type: Object as PropType<Style>, default: () => DEFAULT_BODY_STYLE },
    focusable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: undefined },
  },
  emits: ["click", "toggle"],
  setup(props, { emit }) {
    const { widthProvider } = useTerminal();
    const withWidthProvider = <T>(fn: () => T): T => withTextWidthProvider(widthProvider, fn);

    const model = computed(() =>
      withWidthProvider(() =>
        resolveTThinkingViewModel({
          w: props.w,
          title: props.title,
          content: props.content,
          collapsed: props.collapsed,
          pulseFrame: props.pulseFrame,
          style: props.style,
          headerStyle: props.headerStyle,
          markerStyle: props.markerStyle,
          titleStyle: props.titleStyle,
          bodyStyle: props.bodyStyle,
        }),
      ),
    );

    return () => {
      const state = model.value;
      const height = Math.max(1, Math.floor(props.h ?? 1 + state.bodyRows.length));
      const children = [
        h(TText, {
          key: "header",
          x: 0,
          y: 0,
          w: props.w,
          value: state.headerText,
          style: state.styles.header,
        }),
      ];

      for (let index = 0; index < state.bodyRows.length; index++) {
        const y = index + 1;
        if (y >= height) break;
        children.push(
          h(TText, {
            key: `body:${index}`,
            x: 0,
            y,
            w: props.w,
            value: state.bodyRows[index]!,
            style: state.styles.body,
          }),
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
