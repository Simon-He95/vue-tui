import type { PropType, Ref } from "vue";
import type { Style } from "../../core/types.js";
import { computed, defineComponent, h, inject, onBeforeUnmount, provide, ref, watch } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { injectionKey } from "../injection-key.js";
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
  option: TAutocompleteOption;
  query: string;
  source: "keyboard" | "pointer";
}>;

export type TAutocompleteOption =
  | string
  | Readonly<{
      label: string;
      value?: string;
      detail?: string;
      disabled?: boolean;
    }>;

export type TAutocompleteSuggestionProvider = (
  query: string,
  ctx: { signal: AbortSignal },
) => Promise<readonly TAutocompleteOption[]>;

export type TFormModel = Record<string, unknown>;
export type TFormRule = (value: unknown, model: TFormModel) => string | null | undefined;
export type TFormSubmitPayload = Readonly<{
  model: TFormModel;
  valid: boolean;
  errors: Record<string, string>;
}>;

export type TFormContext = Readonly<{
  model: Readonly<Ref<TFormModel>>;
  rules: Readonly<Ref<Record<string, TFormRule>>>;
  errors: Ref<Record<string, string>>;
  disabled: Ref<boolean>;
  readOnly: Ref<boolean>;
  validate: () => boolean;
}>;

export const TFormContextKey = injectionKey<TFormContext>("TFormContext");

export function useTForm(): TFormContext | null {
  return inject(TFormContextKey, null);
}

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
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

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
              ? mergeStyle(baseStyle.value, props.disabledStyle)
              : props.modelValue
                ? mergeStyle(baseStyle.value, props.checkedStyle)
                : baseStyle.value,
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
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

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
              ? mergeStyle(baseStyle.value, props.disabledStyle)
              : props.modelValue
                ? mergeStyle(baseStyle.value, props.activeStyle)
                : baseStyle.value,
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
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

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
                    ? mergeStyle(baseStyle.value, props.disabledStyle)
                    : active
                      ? mergeStyle(baseStyle.value, props.activeStyle)
                      : baseStyle.value,
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
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
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
              ? mergeStyle(baseStyle.value, props.disabledStyle)
              : mergeStyle(baseStyle.value, props.activeStyle),
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
    name: { type: String, default: "" },
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
    const { defaultStyle } = useTerminal();
    const theme = inject(TuiThemeContextKey, ref(tuiDefaultTheme));
    const form = useTForm();
    const fieldError = computed(
      () => props.error || (props.name ? form?.errors.value[props.name] : "") || "",
    );
    const fieldDisabled = computed(() => props.disabled || Boolean(form?.disabled.value));
    const labelStyle = computed(() =>
      mergeStyle(
        defaultStyle.value,
        props.style,
        theme.value.components.TFormField?.labelStyle,
        props.labelStyle,
      ),
    );
    const helpStyle = computed(() =>
      mergeStyle(
        defaultStyle.value,
        props.style,
        theme.value.components.TFormField?.helpStyle,
        props.helpStyle,
      ),
    );
    const errorStyle = computed(() =>
      mergeStyle(
        defaultStyle.value,
        props.style,
        theme.value.components.TFormField?.errorStyle,
        props.errorStyle,
      ),
    );

    return () => {
      const message = fieldError.value || props.help;
      const messageStyle = fieldError.value ? errorStyle.value : helpStyle.value;
      const label = props.required && props.label ? `${props.label} *` : props.label;
      const labelRows = props.label ? 1 : 0;
      const messageRows = message && props.h - labelRows > 1 ? 1 : 0;
      const slotY = labelRows;
      const slotH = Math.max(1, props.h - labelRows - messageRows);
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
                style: fieldDisabled.value
                  ? mergeStyle(labelStyle.value, { dim: true })
                  : labelStyle.value,
              })
            : null,
          h(TView as any, { x: 0, y: slotY, w: props.w, h: slotH }, slots.default),
          messageRows
            ? h(TText as any, {
                x: 0,
                y: slotY + slotH,
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

export const TForm = defineComponent({
  name: "TForm",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    model: {
      type: Object as PropType<TFormModel>,
      required: true,
    },
    rules: {
      type: Object as PropType<Record<string, TFormRule>>,
      default: () => ({}),
    },
    disabled: { type: Boolean, default: false },
    /** Provides a read-only hint to custom form field consumers; built-in controls do not automatically consume it. */
    readOnly: { type: Boolean, default: false },
    submitOnEnter: { type: Boolean, default: false },
  },
  emits: {
    submit: (_payload: TFormSubmitPayload) => true,
    validation: (_errors: Record<string, string>) => true,
  },
  setup(props, { emit, slots }) {
    const errors = ref<Record<string, string>>({});
    const disabled = computed(() => props.disabled);
    const readOnly = computed(() => props.readOnly);

    function validate(): boolean {
      const next: Record<string, string> = {};
      for (const [name, rule] of Object.entries(props.rules)) {
        const message = rule(props.model[name], props.model);
        if (message) next[name] = message;
      }
      errors.value = next;
      emit("validation", next);
      return Object.keys(next).length === 0;
    }

    function submit(): void {
      const valid = validate();
      emit("submit", { model: props.model, valid, errors: errors.value });
    }

    provide(TFormContextKey, {
      model: computed(() => props.model),
      rules: computed(() => props.rules),
      errors,
      disabled,
      readOnly,
      validate,
    });

    return () =>
      h(
        TView as any,
        {
          x: props.x,
          y: props.y,
          w: props.w,
          h: props.h,
          zIndex: props.zIndex,
          onKeydown: (event: any) => {
            const allowDefaultPreventedEnter =
              event?.key === "Enter" && event?.__tuiFormSubmit === true;
            if (event?.defaultPrevented && !allowDefaultPreventedEnter) return;
            if (!props.submitOnEnter) return;
            if (event.key !== "Enter") return;
            if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
            event.preventDefault?.();
            submit();
          },
        },
        slots.default,
      );
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
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));

    return () =>
      h(TInput as any, {
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        modelValue: props.modelValue,
        placeholder: props.placeholder,
        style: baseStyle.value,
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
      type: Array as PropType<readonly TAutocompleteOption[]>,
      default: () => [],
    },
    suggestionProvider: {
      type: Function as PropType<TAutocompleteSuggestionProvider>,
      default: undefined,
    },
    open: { type: Boolean, default: undefined },
    highlightedIndex: { type: Number, default: 0 },
    placeholder: { type: String, default: "" },
    debounce: { type: Number, default: 0 },
    minChars: { type: Number, default: 0 },
    filterLocal: { type: Boolean, default: false },
    closeOnSelect: { type: Boolean, default: true },
    loadingText: { type: String, default: "Loading..." },
    emptyText: { type: String, default: "" },
    errorText: { type: String, default: "Unable to load suggestions" },
    style: { type: Object as PropType<Style>, default: undefined },
    suggestionStyle: { type: Object as PropType<Style>, default: undefined },
    activeSuggestionStyle: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
  },
  emits: {
    "update:modelValue": (_value: string) => true,
    "update:open": (_value: boolean) => true,
    "update:highlightedIndex": (_index: number) => true,
    input: (_value: string) => true,
    change: (_value: string) => true,
    select: (_payload: TAutocompleteSelectPayload) => true,
  },
  setup(props, { emit }) {
    const { defaultStyle } = useTerminal();
    const providerSuggestions = ref<readonly TAutocompleteOption[] | null>(null);
    const providerLoading = ref(false);
    const providerError = ref<string | null>(null);
    const innerOpen = ref(true);
    let providerAbort: AbortController | null = null;
    let providerTimer: ReturnType<typeof setTimeout> | null = null;
    const inputStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const suggestionStyle = computed(() => mergeStyle(defaultStyle.value, props.suggestionStyle));
    const activeSuggestionStyle = computed(() =>
      mergeStyle(suggestionStyle.value, props.activeSuggestionStyle),
    );
    const isOpen = computed(() => props.open ?? innerOpen.value);

    function optionLabel(option: TAutocompleteOption): string {
      return typeof option === "string" ? option : option.label;
    }

    function optionValue(option: TAutocompleteOption): string {
      return typeof option === "string" ? option : (option.value ?? option.label);
    }

    function optionDisabled(option: TAutocompleteOption): boolean {
      return typeof option !== "string" && Boolean(option.disabled);
    }

    function setOpen(value: boolean): void {
      innerOpen.value = value;
      emit("update:open", value);
    }

    const suggestionSource = computed(() => providerSuggestions.value ?? props.suggestions);
    const filteredSuggestions = computed(() => {
      if (props.modelValue.length < Math.max(0, props.minChars)) return [];
      if (!props.filterLocal) return suggestionSource.value;
      const query = props.modelValue.toLowerCase();
      return suggestionSource.value.filter((suggestion) =>
        optionLabel(suggestion).toLowerCase().includes(query),
      );
    });
    const visibleSuggestions = computed(() =>
      isOpen.value ? filteredSuggestions.value.slice(0, Math.max(0, props.h - 1)) : [],
    );
    const activeIndex = computed(() => {
      const count = visibleSuggestions.value.length;
      return count > 0 ? clamp(props.highlightedIndex, 0, count - 1) : 0;
    });
    function select(index: number, source: "keyboard" | "pointer"): boolean {
      const option = visibleSuggestions.value[index];
      if (option == null || optionDisabled(option)) return false;
      const value = optionValue(option);
      emit("update:modelValue", value);
      emit("change", value);
      emit("select", { value, index, option, query: props.modelValue, source });
      if (props.closeOnSelect) setOpen(false);
      return true;
    }

    watch(
      () => [props.suggestionProvider, props.modelValue, props.debounce, props.minChars] as const,
      ([provider, query]) => {
        if (providerTimer) {
          clearTimeout(providerTimer);
          providerTimer = null;
        }
        providerAbort?.abort();
        providerAbort = null;
        providerError.value = null;
        if (!provider) {
          providerSuggestions.value = null;
          providerLoading.value = false;
          return;
        }
        if (query.length < Math.max(0, props.minChars)) {
          providerSuggestions.value = [];
          providerLoading.value = false;
          return;
        }
        providerSuggestions.value = [];
        providerLoading.value = true;
        const run = () => {
          const controller = new AbortController();
          providerAbort = controller;
          void provider(query, { signal: controller.signal })
            .then((suggestions) => {
              if (!controller.signal.aborted) providerSuggestions.value = suggestions;
            })
            .catch((error: unknown) => {
              if (controller.signal.aborted) return;
              providerSuggestions.value = [];
              providerError.value = error instanceof Error ? error.message : String(error);
            })
            .finally(() => {
              if (!controller.signal.aborted) providerLoading.value = false;
            });
        };
        const delay = Math.max(0, Math.floor(props.debounce));
        if (delay > 0) providerTimer = setTimeout(run, delay);
        else run();
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      if (providerTimer) clearTimeout(providerTimer);
      providerAbort?.abort();
    });

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
            style: inputStyle.value,
            "onUpdate:modelValue": (value: string) => {
              emit("update:modelValue", value);
              setOpen(true);
            },
            onInput: (value: string) => {
              emit("input", value);
              setOpen(true);
            },
            onChange: (value: string) => emit("change", value),
            onKeydown: (event: any) => {
              const suggestionCount = visibleSuggestions.value.length;
              if (event.key === "ArrowDown") {
                if (suggestionCount === 0) return;
                event.preventDefault?.();
                emit(
                  "update:highlightedIndex",
                  clamp(props.highlightedIndex + 1, 0, suggestionCount - 1),
                );
              } else if (event.key === "ArrowUp") {
                if (suggestionCount === 0) return;
                event.preventDefault?.();
                emit(
                  "update:highlightedIndex",
                  clamp(props.highlightedIndex - 1, 0, suggestionCount - 1),
                );
              } else if (
                event.key === "Enter" &&
                suggestionCount > 0 &&
                select(activeIndex.value, "keyboard")
              ) {
                event.preventDefault?.();
              } else if (event.key === "Escape") {
                if (isOpen.value) {
                  event.preventDefault?.();
                  event.stopPropagation?.();
                  setOpen(false);
                }
              }
            },
          }),
          providerLoading.value && isOpen.value
            ? h(TText as any, {
                key: "loading",
                x: 0,
                y: 1,
                w: props.w,
                value: props.loadingText,
                style: suggestionStyle.value,
              })
            : providerError.value && isOpen.value
              ? h(TText as any, {
                  key: "error",
                  x: 0,
                  y: 1,
                  w: props.w,
                  value: props.errorText,
                  style: suggestionStyle.value,
                })
              : visibleSuggestions.value.length === 0 && props.emptyText && isOpen.value
                ? h(TText as any, {
                    key: "empty",
                    x: 0,
                    y: 1,
                    w: props.w,
                    value: props.emptyText,
                    style: suggestionStyle.value,
                  })
                : null,
          ...(!providerLoading.value && !providerError.value
            ? visibleSuggestions.value.map((suggestion, index) =>
                h(
                  TView as any,
                  {
                    key: `${index}:${optionLabel(suggestion)}`,
                    x: 0,
                    y: index + 1,
                    w: props.w,
                    h: 1,
                    focusable: !optionDisabled(suggestion),
                    onClick: () => select(index, "pointer"),
                    onKeydown: (event: any) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault?.();
                      select(index, "keyboard");
                    },
                  },
                  () =>
                    h(TText as any, {
                      x: 0,
                      y: 0,
                      w: props.w,
                      value: optionLabel(suggestion),
                      style:
                        index === activeIndex.value
                          ? activeSuggestionStyle.value
                          : suggestionStyle.value,
                    }),
                ),
              )
            : []),
        ],
      );
  },
});
