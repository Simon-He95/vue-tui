import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, inject, ref } from "vue";
import { TuiThemeContextKey, tuiDefaultTheme } from "../theme.js";
import { TInput } from "./TInput.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { clamp, fitCellText, mergeStyle } from "./simple-utils.js";

export type TRadioOption = Readonly<{
  label: string;
  value: string;
  disabled?: boolean;
}>;

export type TAutocompleteSelectPayload = Readonly<{
  value: string;
  index: number;
}>;

export const TCheckbox = defineComponent({
  name: "TCheckbox",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: Boolean, default: false },
    label: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    checkedStyle: { type: Object as PropType<Style>, default: undefined },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    "update:modelValue": (_value: boolean) => true,
    change: (_value: boolean) => true,
  },
  setup(props, { emit }) {
    function toggle(): void {
      if (props.disabled) return;
      const next = !props.modelValue;
      emit("update:modelValue", next);
      emit("change", next);
    }

    return () =>
      h(
        TView as any,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: 1,
          zIndex: props.zIndex,
          focusable: !props.disabled,
          onClick: toggle,
          onKeydown: (event: any) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault?.();
            toggle();
          },
        },
        () =>
          h(TText as any, {
            x: 0,
            y: 0,
            w: props.w,
            value: fitCellText(`[${props.modelValue ? "x" : " "}] ${props.label}`, props.w),
            style: props.disabled
              ? mergeStyle(props.style, props.disabledStyle)
              : props.modelValue
                ? mergeStyle(props.style, props.checkedStyle)
                : props.style,
          }),
      );
  },
});

export const TSwitch = defineComponent({
  name: "TSwitch",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: Boolean, default: false },
    label: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: () => ({ fg: "greenBright" }) },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    "update:modelValue": (_value: boolean) => true,
    change: (_value: boolean) => true,
  },
  setup(props, { emit }) {
    function toggle(): void {
      if (props.disabled) return;
      const next = !props.modelValue;
      emit("update:modelValue", next);
      emit("change", next);
    }

    return () =>
      h(
        TView as any,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: 1,
          zIndex: props.zIndex,
          focusable: !props.disabled,
          onClick: toggle,
          onKeydown: (event: any) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault?.();
            toggle();
          },
        },
        () =>
          h(TText as any, {
            x: 0,
            y: 0,
            w: props.w,
            value: fitCellText(`[${props.modelValue ? "on " : "off"}] ${props.label}`, props.w),
            style: props.disabled
              ? mergeStyle(props.style, props.disabledStyle)
              : props.modelValue
                ? mergeStyle(props.style, props.activeStyle)
                : props.style,
          }),
      );
  },
});

export const TRadioGroup = defineComponent({
  name: "TRadioGroup",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: String, default: "" },
    options: {
      type: Array as PropType<readonly TRadioOption[]>,
      required: true,
    },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    "update:modelValue": (_value: string) => true,
    change: (_value: string) => true,
  },
  setup(props, { emit }) {
    function choose(option: TRadioOption): void {
      if (option.disabled) return;
      emit("update:modelValue", option.value);
      emit("change", option.value);
    }

    return () =>
      h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: props.h, zIndex: props.zIndex },
        () =>
          props.options.slice(0, props.h).map((option, index) => {
            const active = option.value === props.modelValue;
            return h(
              TView as any,
              {
                key: option.value,
                x: 0,
                y: index,
                w: props.w,
                h: 1,
                focusable: !option.disabled,
                onClick: () => choose(option),
                onKeydown: (event: any) => {
                  if (event.key !== " " && event.key !== "Enter") return;
                  event.preventDefault?.();
                  choose(option);
                },
              },
              () =>
                h(TText as any, {
                  x: 0,
                  y: 0,
                  w: props.w,
                  value: fitCellText(`(${active ? "x" : " "}) ${option.label}`, props.w),
                  style: option.disabled
                    ? mergeStyle(props.style, props.disabledStyle)
                    : active
                      ? mergeStyle(props.style, props.activeStyle)
                      : props.style,
                }),
            );
          }),
      );
  },
});

export const TSlider = defineComponent({
  name: "TSlider",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: Number, default: 0 },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    step: { type: Number, default: 1 },
    disabled: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: () => ({ fg: "cyanBright" }) },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
  },
  emits: {
    "update:modelValue": (_value: number) => true,
    change: (_value: number) => true,
  },
  setup(props, { emit }) {
    const value = computed(() => clamp(props.modelValue, props.min, props.max));
    const ratio = computed(() => {
      const span = props.max - props.min;
      return span <= 0 ? 0 : (value.value - props.min) / span;
    });

    function setValue(next: number): void {
      if (props.disabled) return;
      const step = Math.max(0.000001, Math.abs(props.step));
      const rounded = Math.round((next - props.min) / step) * step + props.min;
      const clamped = clamp(rounded, props.min, props.max);
      emit("update:modelValue", clamped);
      emit("change", clamped);
    }

    return () => {
      const barW = Math.max(1, props.w - 8);
      const filled = clamp(Math.round(barW * ratio.value), 0, barW);
      const label = `${"=".repeat(filled)}${"-".repeat(barW - filled)}`;
      return h(
        TView as any,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: 1,
          zIndex: props.zIndex,
          focusable: !props.disabled,
          onKeydown: (event: any) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault?.();
            setValue(value.value + (event.key === "ArrowRight" ? props.step : -props.step));
          },
        },
        () =>
          h(TText as any, {
            x: 0,
            y: 0,
            w: props.w,
            value: fitCellText(`[${label}] ${value.value}`, props.w),
            style: props.disabled
              ? mergeStyle(props.style, props.disabledStyle)
              : mergeStyle(props.style, props.activeStyle),
          }),
      );
    };
  },
});

export const TFormField = defineComponent({
  name: "TFormField",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    label: { type: String, default: "" },
    help: { type: String, default: "" },
    error: { type: String, default: "" },
    required: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    labelStyle: { type: Object as PropType<Style>, default: undefined },
    helpStyle: { type: Object as PropType<Style>, default: undefined },
    errorStyle: { type: Object as PropType<Style>, default: undefined },
  },
  setup(props, { slots }) {
    const theme = inject(TuiThemeContextKey, ref(tuiDefaultTheme));
    const labelStyle = computed(() =>
      mergeStyle(theme.value.components.TFormField?.labelStyle, props.labelStyle),
    );
    const helpStyle = computed(() =>
      mergeStyle(theme.value.components.TFormField?.helpStyle, props.helpStyle),
    );
    const errorStyle = computed(() =>
      mergeStyle(theme.value.components.TFormField?.errorStyle, props.errorStyle),
    );

    return () => {
      const message = props.error || props.help;
      const messageStyle = props.error ? errorStyle.value : helpStyle.value;
      const label = props.required && props.label ? `${props.label} *` : props.label;
      return h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: props.h, zIndex: props.zIndex },
        () => [
          props.label
            ? h(TText as any, {
                x: 0,
                y: 0,
                w: props.w,
                value: label,
                style: props.disabled
                  ? mergeStyle(labelStyle.value, { dim: true })
                  : labelStyle.value,
              })
            : null,
          h(
            TView as any,
            { x: 0, y: props.label ? 1 : 0, w: props.w, h: Math.max(1, props.h - 2) },
            slots.default,
          ),
          message && props.h > 1
            ? h(TText as any, {
                x: 0,
                y: props.h - 1,
                w: props.w,
                value: message,
                style: messageStyle,
              })
            : null,
        ],
      );
    };
  },
});

export const TPasswordInput = defineComponent({
  name: "TPasswordInput",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: 1 },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: String, required: true },
    placeholder: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
  },
  emits: {
    "update:modelValue": (_value: string) => true,
    input: (_value: string) => true,
    change: (_value: string) => true,
  },
  setup(props, { emit }) {
    return () =>
      h(TInput as any, {
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        modelValue: props.modelValue,
        placeholder: props.placeholder,
        style: props.style,
        autoFocus: props.autoFocus,
        secret: true,
        "onUpdate:modelValue": (value: string) => emit("update:modelValue", value),
        onInput: (value: string) => emit("input", value),
        onChange: (value: string) => emit("change", value),
      });
  },
});

export const TAutocompleteInput = defineComponent({
  name: "TAutocompleteInput",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: 5 },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: String, required: true },
    suggestions: {
      type: Array as PropType<readonly string[]>,
      default: () => [],
    },
    highlightedIndex: { type: Number, default: 0 },
    placeholder: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: undefined },
    suggestionStyle: { type: Object as PropType<Style>, default: undefined },
    activeSuggestionStyle: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
  },
  emits: {
    "update:modelValue": (_value: string) => true,
    "update:highlightedIndex": (_index: number) => true,
    select: (_payload: TAutocompleteSelectPayload) => true,
  },
  setup(props, { emit }) {
    const visibleSuggestions = computed(() => props.suggestions.slice(0, Math.max(0, props.h - 1)));
    function select(index: number): void {
      const value = visibleSuggestions.value[index];
      if (value == null) return;
      emit("update:modelValue", value);
      emit("select", { value, index });
    }

    return () =>
      h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: props.h, zIndex: props.zIndex },
        () => [
          h(TInput as any, {
            x: 0,
            y: 0,
            w: props.w,
            modelValue: props.modelValue,
            placeholder: props.placeholder,
            style: props.style,
            "onUpdate:modelValue": (value: string) => emit("update:modelValue", value),
            onKeydown: (event: any) => {
              if (event.key === "ArrowDown") {
                event.preventDefault?.();
                emit(
                  "update:highlightedIndex",
                  clamp(props.highlightedIndex + 1, 0, visibleSuggestions.value.length - 1),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault?.();
                emit(
                  "update:highlightedIndex",
                  clamp(props.highlightedIndex - 1, 0, visibleSuggestions.value.length - 1),
                );
              } else if (event.key === "Enter") {
                select(props.highlightedIndex);
              }
            },
          }),
          ...visibleSuggestions.value.map((suggestion, index) =>
            h(
              TView as any,
              {
                key: `${index}:${suggestion}`,
                x: 0,
                y: index + 1,
                w: props.w,
                h: 1,
                focusable: true,
                onClick: () => select(index),
              },
              () =>
                h(TText as any, {
                  x: 0,
                  y: 0,
                  w: props.w,
                  value: suggestion,
                  style:
                    index === props.highlightedIndex
                      ? mergeStyle(props.suggestionStyle, props.activeSuggestionStyle)
                      : props.suggestionStyle,
                }),
            ),
          ),
        ],
      );
  },
});
