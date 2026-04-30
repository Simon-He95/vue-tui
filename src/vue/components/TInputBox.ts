import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { TInputPlugin } from "./input/plugins/types.js";
import { computed, defineComponent, h } from "vue";
import { TBox } from "./TBox.js";
import { TInput } from "./TInput.js";

export const TInputBox = defineComponent({
  name: "TInputBox",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    title: { type: String, default: "" },
    padding: { type: Number, default: 0 },
    modelValue: { type: String, required: true },
    placeholder: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    plugins: {
      type: Array as PropType<readonly TInputPlugin[]>,
      default: () => [],
    },
    cursorBlink: { type: Boolean, default: true },
    cursorShape: {
      type: String as PropType<"block" | "underline" | "bar">,
      default: "block",
    },
    blinkInterval: { type: Number, default: 500 },
  },
  emits: ["update:modelValue", "input", "change", "keydown", "focus", "blur"],
  setup(props, { emit }) {
    const innerW = computed(() =>
      Math.max(0, Math.floor(props.w) - 2 - Math.max(0, Math.floor(props.padding)) * 2),
    );
    const innerH = computed(() =>
      Math.max(1, Math.floor(props.h) - 2 - Math.max(0, Math.floor(props.padding)) * 2),
    );

    return () =>
      h(
        TBox,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: props.h,
          zIndex: props.zIndex,
          border: true,
          title: props.title,
          padding: props.padding,
          style: props.style,
        },
        () =>
          h(TInput, {
            x: 0,
            y: 0,
            w: innerW.value,
            h: innerH.value,
            modelValue: props.modelValue,
            "onUpdate:modelValue": (v: string) => emit("update:modelValue", v),
            placeholder: props.placeholder,
            style: props.style,
            autoFocus: props.autoFocus,
            plugins: props.plugins,
            cursorBlink: props.cursorBlink,
            cursorShape: props.cursorShape,
            blinkInterval: props.blinkInterval,
            onInput: (v: string) => emit("input", v),
            onChange: (v: string) => emit("change", v),
            onKeydown: (e: any) => emit("keydown", e),
            onFocus: () => emit("focus"),
            onBlur: () => emit("blur"),
          }),
      );
  },
});
