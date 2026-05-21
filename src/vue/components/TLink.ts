import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type {
  TerminalBaseEvent,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import type { TerminalLinkOpener } from "./link/host.js";
import { computed, defineComponent, h, inject, ref } from "vue";
import { sanitizeDomHref } from "../../core/hyperlink.js";
import { useTerminal } from "../composables/use-terminal.js";
import { sanitizeInlineText, textCellWidth } from "../utils/text.js";
import { TerminalLinkOpenerContextKey } from "./link/host.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

export type TLinkOpenMode = "native" | "host" | "event" | "none";
export type TLinkModifierClick = "none" | "ctrl" | "meta" | "ctrlOrMeta";
export type TLinkActivationSource = "click" | "key";

export type TLinkActivatePayload = Readonly<{
  href: string;
  label: string;
  source: TLinkActivationSource;
}>;

export type TLinkOpenPayload = Readonly<{
  href: string;
  label: string;
  source: "click" | "key";
}>;

export type TLinkInvalidHrefPayload = Readonly<{
  href: string;
  reason: string;
}>;

const DEFAULT_ACTIVATION_KEYS = Object.freeze(["Enter"]);

function mergeStyle(...styles: Array<Style | undefined>): Style {
  const out: Record<string, unknown> = {};
  for (const style of styles) {
    if (!style) continue;
    Object.assign(out, style);
  }
  return out as Style;
}

function isActivationKey(event: TerminalKeyboardEvent, activationKeys: readonly string[]): boolean {
  for (const key of activationKeys) {
    const normalized = key === "Space" ? " " : key;
    if (event.key === normalized || event.combo === normalized) return true;
  }
  return false;
}

function allowsModifierClick(event: TerminalPointerEvent, mode: TLinkModifierClick): boolean {
  if (mode === "none") return true;
  if (mode === "ctrl") return Boolean(event.ctrlKey);
  if (mode === "meta") return Boolean(event.metaKey);
  return Boolean(event.ctrlKey || event.metaKey);
}

export const TLink = defineComponent({
  name: "TLink",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, default: undefined },
    h: { type: Number, default: 1 },
    zIndex: { type: Number, default: 0 },
    href: { type: String, required: true },
    label: { type: String, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    hoverStyle: { type: Object as PropType<Style>, default: undefined },
    focusStyle: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    disabled: { type: Boolean, default: false },
    openMode: {
      type: String as PropType<TLinkOpenMode>,
      default: "host",
    },
    activationKeys: {
      type: Array as PropType<readonly string[]>,
      default: () => DEFAULT_ACTIVATION_KEYS,
    },
    modifierClick: {
      type: String as PropType<TLinkModifierClick>,
      default: "none",
    },
    autoFocus: { type: Boolean, default: false },
  },
  emits: {
    activate: (_payload: TLinkActivatePayload) => true,
    open: (_payload: TLinkOpenPayload) => true,
    invalidHref: (_payload: TLinkInvalidHrefPayload) => true,
    click: (_event: TerminalPointerEvent) => true,
    keydown: (_event: TerminalKeyboardEvent) => true,
    focus: (_event: TerminalBaseEvent) => true,
    blur: (_event: TerminalBaseEvent) => true,
  },
  setup(props, { emit }) {
    const { defaultStyle } = useTerminal();
    const linkOpener = inject(
      TerminalLinkOpenerContextKey,
      ref<TerminalLinkOpener | undefined>(undefined),
    );
    const focused = ref(false);
    const hovered = ref(false);
    const active = ref(false);

    const label = computed(() => sanitizeInlineText(props.label ?? props.href));
    const safeHref = computed(() => sanitizeDomHref(props.href, { allowRelative: true }));
    const shouldRenderHref = computed(
      () => !props.disabled && props.openMode !== "none" && Boolean(safeHref.value),
    );
    const viewWidth = computed(() => {
      const width = props.w ?? textCellWidth(label.value);
      return Math.max(0, Math.floor(width));
    });
    const viewHeight = computed(() => Math.max(1, Math.floor(props.h)));

    const textStyle = computed<Style>(() => {
      const base = mergeStyle(
        defaultStyle.value,
        { fg: "cyanBright", underline: true },
        props.style,
        props.disabled ? { dim: true } : undefined,
        shouldRenderHref.value ? { href: safeHref.value ?? undefined } : { href: undefined },
      );
      if (props.disabled) return base;
      return mergeStyle(
        base,
        hovered.value ? props.hoverStyle : undefined,
        focused.value ? props.focusStyle : undefined,
        active.value ? props.activeStyle : undefined,
      );
    });

    function emitInvalidHref(): void {
      emit("invalidHref", { href: props.href, reason: "unsafe href" });
    }

    function activate(
      source: "click" | "key",
      event?: TerminalPointerEvent | TerminalKeyboardEvent,
    ): void {
      if (props.disabled || props.openMode === "none") return;
      const href = safeHref.value;
      if (!href) {
        emitInvalidHref();
        return;
      }

      const payload = { href, label: label.value, source };
      emit("activate", payload);
      if (props.openMode !== "host" && !(props.openMode === "native" && source === "key")) {
        return;
      }

      const opener = linkOpener.value;
      if (!opener) return;
      let result: boolean | Promise<boolean>;
      try {
        result = opener.openExternal(href, {
          source,
          label: label.value,
          cellX: event && "cellX" in event ? event.cellX : undefined,
          cellY: event && "cellY" in event ? event.cellY : undefined,
        });
      } catch {
        return;
      }
      void Promise.resolve(result)
        .then((opened) => {
          if (opened) emit("open", payload);
        })
        .catch(() => {});
    }

    function shouldSuppressNativeClick(modifierAllowed: boolean): boolean {
      if (props.disabled) return true;
      if (props.openMode !== "native") return true;
      return !modifierAllowed;
    }

    function onClick(event: TerminalPointerEvent): void {
      emit("click", event);
      if (event.defaultPrevented) return;

      const modifierAllowed = allowsModifierClick(event, props.modifierClick);
      if (shouldSuppressNativeClick(modifierAllowed)) event.preventDefault();
      if (!modifierAllowed) return;
      activate("click", event);
    }

    function onKeydown(event: TerminalKeyboardEvent): void {
      emit("keydown", event);
      if (event.defaultPrevented) return;

      if (!isActivationKey(event, props.activationKeys)) return;
      if (props.openMode === "host" || props.openMode === "event") event.preventDefault();
      activate("key", event);
    }

    return () =>
      h(
        TView,
        {
          x: props.x,
          y: props.y,
          w: viewWidth.value,
          h: viewHeight.value,
          zIndex: props.zIndex,
          focusable: !props.disabled && props.openMode !== "none",
          autoFocus: props.autoFocus && !props.disabled && props.openMode !== "none",
          onClick,
          onKeydown,
          onPointerdown: () => {
            if (!props.disabled) active.value = true;
          },
          onPointerup: () => {
            active.value = false;
          },
          onPointerleave: () => {
            hovered.value = false;
            active.value = false;
          },
          onPointerenter: () => {
            hovered.value = true;
          },
          onFocus: (event: TerminalBaseEvent) => {
            focused.value = true;
            emit("focus", event);
          },
          onBlur: (event: TerminalBaseEvent) => {
            focused.value = false;
            active.value = false;
            emit("blur", event);
          },
        },
        () =>
          h(TText, {
            x: 0,
            y: 0,
            w: viewWidth.value,
            h: 1,
            value: label.value,
            style: textStyle.value,
          }),
      );
  },
});
