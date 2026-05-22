import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { fitCellText, mergeStyle } from "./simple-utils.js";
import { TBox } from "./TBox.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

export type TFeedbackTone = "default" | "info" | "success" | "warning" | "error";

export type TToastItem = Readonly<{
  id: string;
  level?: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  duration?: number;
  closable?: boolean;
}>;

function toneStyle(tone: TFeedbackTone): Style {
  if (tone === "info") return { fg: "cyanBright" };
  if (tone === "success") return { fg: "greenBright" };
  if (tone === "warning") return { fg: "yellowBright" };
  if (tone === "error") return { fg: "redBright" };
  return {};
}

export const TToastViewport = defineComponent({
  name: "TToastViewport",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 40 },
    max: { type: Number, default: 3 },
    placement: {
      type: String as PropType<"top-right" | "top-left" | "bottom-right" | "bottom-left">,
      default: "top-right",
    },
    items: {
      type: Array as PropType<readonly TToastItem[]>,
      required: true,
    },
    style: { type: Object as PropType<Style>, default: undefined },
  },
  emits: {
    dismiss: (_id: string) => true,
  },
  setup(props, { emit }) {
    const { defaultStyle, terminal } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    return () => {
      const max = Math.max(0, Math.floor(props.max));
      const items = props.items.slice(0, max);
      const bottom = props.placement.startsWith("bottom");
      const left = props.placement.endsWith("left");
      const x = left ? props.x : Math.max(0, terminal.size().cols - props.x - props.w);
      let cursorY = props.y;
      return items.map((item, index) => {
        const hgt = item.title ? 3 : 2;
        const y = bottom ? cursorY - hgt : cursorY;
        cursorY += bottom ? -hgt : hgt;
        const level = item.level ?? "info";
        return h(
          TBox as any,
          {
            key: item.id,
            x,
            y,
            w: props.w,
            h: hgt,
            zIndex: props.zIndex + index,
            padding: 0,
            style: mergeStyle(baseStyle.value, toneStyle(level)),
          },
          () => [
            item.title
              ? h(TText as any, {
                  x: 1,
                  y: 0,
                  w: Math.max(1, props.w - 2),
                  value: fitCellText(item.title, Math.max(1, props.w - 2)),
                  style: mergeStyle(baseStyle.value, toneStyle(level), { bold: true }),
                })
              : null,
            h(TText as any, {
              x: 1,
              y: item.title ? 1 : 0,
              w: Math.max(1, props.w - 2),
              value: fitCellText(item.message, Math.max(1, props.w - 2)),
              style: baseStyle.value,
            }),
            item.closable
              ? h(TView as any, {
                  x: Math.max(0, props.w - 3),
                  y: 0,
                  w: 1,
                  h: 1,
                  focusable: true,
                  onClick: () => emit("dismiss", item.id),
                  onKeydown: (event: any) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault?.();
                    emit("dismiss", item.id);
                  },
                })
              : null,
            item.closable
              ? h(TText as any, {
                  x: Math.max(0, props.w - 3),
                  y: 0,
                  w: 1,
                  value: "x",
                  style: baseStyle.value,
                })
              : null,
          ],
        );
      });
    };
  },
});

export const TProgress = defineComponent({
  name: "TProgress",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    value: { type: Number, required: true },
    max: { type: Number, default: 100 },
    label: { type: String, default: "" },
    showPercent: { type: Boolean, default: true },
    style: { type: Object as PropType<Style>, default: undefined },
    barStyle: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    return () => {
      const max = Math.max(0.000001, props.max);
      const ratio = Math.max(0, Math.min(1, props.value / max));
      const suffix = props.showPercent ? ` ${Math.round(ratio * 100)}%` : "";
      const prefix = props.label ? `${props.label} ` : "";
      const barW = Math.max(1, props.w - prefix.length - suffix.length - 2);
      const filled = Math.round(barW * ratio);
      const text = `${prefix}[${"=".repeat(filled)}${"-".repeat(barW - filled)}]${suffix}`;
      return h(TText as any, {
        x: props.x,
        y: props.y,
        w: props.w,
        zIndex: props.zIndex,
        value: fitCellText(text, props.w),
        style: mergeStyle(baseStyle.value, props.barStyle),
      });
    };
  },
});

export const TSpinner = defineComponent({
  name: "TSpinner",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    frames: { type: Array as PropType<readonly string[]>, default: () => ["|", "/", "-", "\\"] },
    frameIndex: { type: Number, default: 0 },
    label: { type: String, default: "" },
    running: { type: Boolean, default: true },
    style: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    return () => {
      const frames = props.frames.length ? props.frames : ["|"];
      const frame = props.running
        ? frames[Math.abs(Math.floor(props.frameIndex)) % frames.length]
        : frames[0];
      const text = props.label ? `${frame} ${props.label}` : frame;
      return h(TText as any, {
        x: props.x,
        y: props.y,
        w: props.w,
        zIndex: props.zIndex,
        value: props.w == null ? text : fitCellText(text, props.w),
        style: baseStyle.value,
      });
    };
  },
});

export const TBadge = defineComponent({
  name: "TBadge",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    value: { type: [String, Number], required: true },
    tone: { type: String as PropType<TFeedbackTone>, default: "default" },
    zIndex: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    return () =>
      h(TText as any, {
        x: props.x,
        y: props.y,
        zIndex: props.zIndex,
        value: `[${props.value}]`,
        style: mergeStyle(defaultStyle.value, toneStyle(props.tone), props.style),
      });
  },
});

export const TTag = defineComponent({
  name: "TTag",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    label: { type: String, required: true },
    tone: { type: String as PropType<TFeedbackTone>, default: "default" },
    zIndex: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    return () =>
      h(TText as any, {
        x: props.x,
        y: props.y,
        zIndex: props.zIndex,
        value: `<${props.label}>`,
        style: mergeStyle(defaultStyle.value, toneStyle(props.tone), props.style),
      });
  },
});

export const TDivider = defineComponent({
  name: "TDivider",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    title: { type: String, default: "" },
    zIndex: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    return () => {
      const title = props.title ? ` ${props.title} ` : "";
      const left = Math.max(0, Math.floor((props.w - title.length) / 2));
      const right = Math.max(0, props.w - title.length - left);
      return h(TText as any, {
        x: props.x,
        y: props.y,
        w: props.w,
        zIndex: props.zIndex,
        value: fitCellText(`${"-".repeat(left)}${title}${"-".repeat(right)}`, props.w),
        style: mergeStyle(defaultStyle.value, props.style),
      });
    };
  },
});

export const TCode = defineComponent({
  name: "TCode",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, default: undefined },
    value: { type: String, required: true },
    zIndex: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: () => ({ fg: "yellowBright" }) },
  },
  setup(props) {
    const { defaultStyle } = useTerminal();
    return () =>
      h(TText as any, {
        x: props.x,
        y: props.y,
        w: props.w,
        zIndex: props.zIndex,
        value: props.w == null ? props.value : fitCellText(props.value, props.w),
        style: mergeStyle(defaultStyle.value, props.style),
      });
  },
});
