import type { Component, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { TerminalRuntimeHandle } from "../context.js";
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useTerminal } from "../composables/use-terminal.js";
import { DialogContextKey } from "../context.js";
import { resolveOverlayPlacement, type TOverlayPlacement as Placement } from "../overlay.js";
import { textCellWidth } from "../utils/text.js";
import { TBox } from "./TBox.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computePosition(opts: {
  cols: number;
  rows: number;
  w: number;
  h: number;
  placement: Placement;
  offsetX: number;
  offsetY: number;
}): { x: number; y: number } {
  return resolveOverlayPlacement({
    viewport: { w: opts.cols, h: opts.rows },
    size: { w: opts.w, h: opts.h },
    placement: opts.placement,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
  });
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0;
}

export type DialogButton = Readonly<{
  label: string;
  value?: unknown;
  id?: string;
  kind?: "default" | "primary" | "danger" | "muted" | "accent";
  default?: boolean;
  style?: Style;
  selectedStyle?: Style;
}>;

function stylesEqual(a?: Style, b?: Style): boolean {
  if (a === b) return true;
  return (
    a?.fg === b?.fg &&
    a?.bg === b?.bg &&
    a?.bold === b?.bold &&
    a?.dim === b?.dim &&
    a?.italic === b?.italic &&
    a?.underline === b?.underline &&
    a?.inverse === b?.inverse &&
    a?.href === b?.href
  );
}

function buttonsEqual(a: readonly DialogButton[], b: readonly DialogButton[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (
      left.label !== right.label ||
      left.value !== right.value ||
      left.id !== right.id ||
      left.kind !== right.kind ||
      left.default !== right.default ||
      !stylesEqual(left.style, right.style) ||
      !stylesEqual(left.selectedStyle, right.selectedStyle)
    ) {
      return false;
    }
  }
  return true;
}

function contentRect(opts: Readonly<{ w: number; h: number; padding: number; border: boolean }>): {
  w: number;
  h: number;
} {
  const borderInset = opts.border ? 1 : 0;
  const requestedPad = Math.max(0, Math.floor(opts.padding));
  const maxPadX = Math.max(0, Math.floor((opts.w - borderInset * 2 - 1) / 2));
  const maxPadY = Math.max(0, Math.floor((opts.h - borderInset * 2 - 1) / 2));
  const pad = Math.min(requestedPad, maxPadX, maxPadY);
  return {
    w: Math.max(0, Math.floor(opts.w) - borderInset * 2 - pad * 2),
    h: Math.max(0, Math.floor(opts.h) - borderInset * 2 - pad * 2),
  };
}

function contentLayout(
  opts: Readonly<{ w: number; h: number; padding: number; border: boolean }>,
): { x: number; y: number; w: number; h: number } {
  const borderInset = opts.border ? 1 : 0;
  const requestedPad = Math.max(0, Math.floor(opts.padding));
  const maxPadX = Math.max(0, Math.floor((opts.w - borderInset * 2 - 1) / 2));
  const maxPadY = Math.max(0, Math.floor((opts.h - borderInset * 2 - 1) / 2));
  const pad = Math.min(requestedPad, maxPadX, maxPadY);
  const w = Math.max(0, Math.floor(opts.w) - borderInset * 2 - pad * 2);
  const h = Math.max(0, Math.floor(opts.h) - borderInset * 2 - pad * 2);
  return { x: borderInset + pad, y: borderInset + pad, w, h };
}

function buttonLayout(
  buttons: readonly DialogButton[],
  content: Readonly<{ w: number; h: number }>,
): { x: number; y: number; w: number }[] {
  if (!buttons.length) return [];
  const gap = 2;
  const texts = buttons.map((b) => `[ ${b.label} ]`);
  const widths = texts.map((t) => textCellWidth(t));
  const totalW = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
  const startX = Math.max(0, content.w - totalW);
  const y = Math.max(0, content.h - 1);
  let x = startX;
  return buttons.map((b, i) => {
    const text = texts[i] ?? `[ ${b.label} ]`;
    const w = widths[i] ?? textCellWidth(text);
    const layout = { x, y, w };
    x += w + gap;
    return layout;
  });
}

const DialogSurface = defineComponent({
  name: "TDialogSurface",
  props: {
    modelValue: { type: Boolean, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    title: { type: String, default: "" },
    padding: { type: Number, default: 1 },
    zIndex: { type: Number, default: 1000 },
    style: { type: Object as PropType<Style>, default: undefined },
    titleStyle: { type: Object as PropType<Style>, default: undefined },
    contentStyle: { type: Object as PropType<Style>, default: undefined },
    backdropStyle: { type: Object as PropType<Style>, default: undefined },
    placement: { type: String as PropType<Placement>, default: "center" },
    offsetX: { type: Number, default: 0 },
    offsetY: { type: Number, default: 0 },
    backdrop: { type: Boolean, default: true },
    closeOnBackdrop: { type: Boolean, default: true },
    closeOnEsc: { type: Boolean, default: true },
    closeOnBlur: { type: Boolean, default: false },
    tabMode: {
      type: String as PropType<"cycle" | "wrapFromButtons">,
      default: "cycle",
    },
    content: {
      type: [Object, Function] as PropType<Component>,
      required: true,
    },
    contentVersion: { type: Number, default: 0 },
    buttons: { type: Array as PropType<DialogButton[]>, default: () => [] },
    onRequestClose: { type: Function as PropType<() => void>, required: true },
    onDialogFocus: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
    onDialogBlur: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
    onDialogKeydown: {
      type: Function as PropType<(e: any) => void>,
      default: undefined,
    },
    dialogNodeId: { type: String, default: undefined },
    onDialogNodeId: {
      type: Function as PropType<(id: string) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const { events, scheduler, defaultStyle } = useTerminal();
    const layout = useLayout();
    const cols = computed(() => layout.clipRect?.w ?? 0);
    const rows = computed(() => layout.clipRect?.h ?? 0);
    const dialogLayerZ = computed(() => props.zIndex + (props.backdrop ? 1 : 0));
    const dialogEventZ = computed(() =>
      props.backdrop ? props.zIndex + dialogLayerZ.value : dialogLayerZ.value,
    );

    let pendingBlur = false;
    let focusedWithin = false;
    let isProcessingTab = false;

    const pos = computed(() =>
      computePosition({
        cols: cols.value,
        rows: rows.value,
        w: props.w,
        h: props.h,
        placement: props.placement,
        offsetX: props.offsetX,
        offsetY: props.offsetY,
      }),
    );

    function isTabKey(e: any): boolean {
      const key = e?.key;
      return key === "Tab" || key === "\t" || key === "BackTab" || key === "ISO_Left_Tab";
    }

    function handleTabKey(e: any): boolean {
      if (!props.modelValue) return false;
      if (!isTabKey(e)) return false;
      if (e?.defaultPrevented) return false;
      if (isProcessingTab) return false;

      const manager = events.value;
      if (!manager) return false;

      isProcessingTab = true;
      try {
        const { x, y } = pos.value;
        const boxW = Math.max(0, Math.floor(props.w));
        const boxH = Math.max(0, Math.floor(props.h));
        const dialogZIndex = dialogEventZ.value;
        const dialogBounds = { x, y, w: boxW, h: boxH };

        const debugNodes = manager.debugNodes();
        const nodesInDialog = debugNodes.filter((n) => {
          if (!n.visible || !n.focusable) return false;
          // Keep tab order within the dialog layer, even if some nodes are clipped.
          if (n.zIndex < dialogZIndex) return false;
          return rectsIntersect(n.rect, dialogBounds);
        });

        const dialogNode = nodesInDialog.find(
          (n) => n.zIndex === dialogZIndex && n.rect.w === boxW && n.rect.h === boxH,
        );
        let focusables: typeof nodesInDialog;
        try {
          focusables = nodesInDialog
            .filter((n) => n.id !== dialogNode?.id)
            .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x || b.zIndex - a.zIndex);
        } catch {
          // If sorting fails, just use the filtered list
          focusables = nodesInDialog.filter((n) => n.id !== dialogNode?.id);
        }

        if (focusables.length > 0) {
          e.preventDefault?.();
          e.stopPropagation?.();
          const isReverse = Boolean(e.shiftKey || e.key === "BackTab" || e.key === "ISO_Left_Tab");
          const dir = isReverse ? -1 : 1;
          const curId = manager.getFocused();
          const buttonIds = (() => {
            if (!props.buttons.length) return new Set<string>();
            if (props.tabMode !== "wrapFromButtons") return new Set<string>();
            const content = contentLayout({
              w: props.w,
              h: props.h,
              padding: props.padding,
              border: true,
            });
            const layouts = buttonLayout(props.buttons, content);
            const rects = layouts.map((l) => ({
              x: x + content.x + l.x,
              y: y + content.y + l.y,
              w: l.w,
              h: 1,
            }));
            const set = new Set<string>();
            for (const n of focusables) {
              const r = n.rect;
              if (!r) continue;
              if (
                rects.some((br) => r.x === br.x && r.y === br.y && r.w === br.w && r.h === br.h)
              ) {
                set.add(n.id);
              }
            }
            // If the dialog is clipped (small terminals / narrow dialogs), focusable button
            // nodes may have their rect truncated by clipRect intersection, so exact rect
            // matching fails. Fall back to tagging focusables that sit on the footer row.
            if (set.size < rects.length) {
              const rowY = y + content.y + Math.max(0, content.h - 1);
              const left = x + content.x;
              const right = left + content.w;
              for (const n of focusables) {
                const r = n.rect;
                if (!r) continue;
                if (r.h !== 1) continue;
                if (r.y !== rowY) continue;
                if (r.x >= right) continue;
                if (r.x + r.w <= left) continue;
                set.add(n.id);
              }
            }
            return set;
          })();

          const nonButtonFocusables =
            props.tabMode === "wrapFromButtons" && buttonIds.size
              ? focusables.filter((n) => !buttonIds.has(n.id))
              : focusables;

          if (
            props.tabMode === "wrapFromButtons" &&
            curId &&
            buttonIds.has(curId) &&
            nonButtonFocusables.length > 0
          ) {
            const nextId = isReverse
              ? nonButtonFocusables[nonButtonFocusables.length - 1]!.id
              : nonButtonFocusables[0]!.id;

            const targetNode = debugNodes.find((n) => n.id === nextId && n.visible && n.focusable);
            if (targetNode) {
              try {
                manager.focus(nextId);
                scheduler.invalidate();
                return true;
              } catch (err) {
                void err;
              }
            }
          }

          const curIdx = curId ? focusables.findIndex((n) => n.id === curId) : -1;
          const nextIdx =
            curIdx < 0
              ? dir > 0
                ? 0
                : focusables.length - 1
              : (curIdx + dir + focusables.length) % focusables.length;

          let nextId = focusables[nextIdx]?.id;
          if (
            props.tabMode === "wrapFromButtons" &&
            nextId &&
            buttonIds.has(nextId) &&
            props.buttons.length > 0
          ) {
            const defaultIdx = props.buttons.findIndex((b) => b.default);
            if (defaultIdx >= 0) {
              const content = contentLayout({
                w: props.w,
                h: props.h,
                padding: props.padding,
                border: true,
              });
              const layouts = buttonLayout(props.buttons, content);
              const target = layouts[defaultIdx];
              if (target) {
                const targetRect = {
                  x: x + content.x + target.x,
                  y: y + content.y + target.y,
                  w: target.w,
                  h: 1,
                };
                const targetNode = focusables.find(
                  (n) =>
                    n.rect.x === targetRect.x &&
                    n.rect.y === targetRect.y &&
                    n.rect.w === targetRect.w &&
                    n.rect.h === targetRect.h,
                );
                if (targetNode) nextId = targetNode.id;
              }
            }
          }

          // Validate nextId exists and points to a valid, visible focusable node
          if (nextId) {
            const targetNode = debugNodes.find((n) => n.id === nextId && n.visible && n.focusable);
            if (targetNode) {
              try {
                manager.focus(nextId);
                scheduler.invalidate();
                return true;
              } catch (err) {
                void err;
              }
            }
          }
          // If we can't focus anything, let default tab behavior proceed
        }
      } catch (err) {
        void err;
      } finally {
        // Reset on the next microtask so sequential async Tabs can proceed.
        queueMicrotask(() => {
          isProcessingTab = false;
        });
      }

      return false;
    }

    function onFocusAny(): void {
      pendingBlur = false;
      if (focusedWithin) return;
      focusedWithin = true;
      props.onDialogFocus?.();
    }

    function onBlurAny(): void {
      pendingBlur = true;
      queueMicrotask(() => {
        if (!pendingBlur) return;
        if (!props.modelValue) return;
        if (!focusedWithin) return;
        pendingBlur = false;
        focusedWithin = false;
        props.onDialogBlur?.();
        if (props.closeOnBlur) props.onRequestClose();
      });
    }

    function onBackdropClick(): void {
      if (!props.closeOnBackdrop) return;
      props.onRequestClose();
    }

    function onKeydownCapture(e: any): void {
      handleTabKey(e);
    }

    function onKeydown(e: any): void {
      props.onDialogKeydown?.(e);
      if (!props.closeOnEsc) return;
      if (e?.defaultPrevented) return;
      if (e?.key !== "Escape") return;
      e.preventDefault?.();
      props.onRequestClose();
    }

    const dialogNodeId = ref<string | null>(null);

    // When dialog opens, ensure something within it is focused.
    // If no inner element has autoFocus, focus the dialog container itself.
    watch(
      () => props.modelValue,
      (isOpen) => {
        if (!isOpen) {
          dialogNodeId.value = null;
          return;
        }

        // Skip if we're in the middle of processing Tab
        if (isProcessingTab) return;

        // Wait for inner content to render and potentially autoFocus
        queueMicrotask(() => {
          queueMicrotask(() => {
            // Skip if we're in the middle of processing Tab
            if (isProcessingTab) return;

            const manager = events.value;
            if (!manager) return;

            const { x, y } = pos.value;
            const boxW = Math.max(0, Math.floor(props.w));
            const boxH = Math.max(0, Math.floor(props.h));
            const dialogZIndex = dialogEventZ.value;

            // Find all focusable nodes within the dialog bounds
            const dialogBounds = { x, y, w: boxW, h: boxH };
            const nodesInDialog = manager.debugNodes().filter((n) => {
              if (!n.visible || !n.focusable) return false;
              if (n.zIndex < dialogZIndex) return false;
              return rectsIntersect(n.rect, dialogBounds);
            });

            // Find the dialog container node (largest with matching zIndex)
            const dialogNode = nodesInDialog.find(
              (n) => n.zIndex === dialogZIndex && n.rect.w === boxW && n.rect.h === boxH,
            );
            if (dialogNode) {
              dialogNodeId.value = dialogNode.id;
            }

            const focused = manager.getFocused();

            // If something is already focused within the dialog, we're done
            if (focused) {
              const focusedInDialog = nodesInDialog.find((n) => n.id === focused);
              if (focusedInDialog) return;
            }

            // Otherwise, focus the first inner focusable element (excluding dialog container)
            let innerFocusable: typeof nodesInDialog;
            try {
              innerFocusable = nodesInDialog
                .filter((n) => n.id !== dialogNodeId.value)
                .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
            } catch {
              // If sorting fails, just use the filtered list
              innerFocusable = nodesInDialog.filter((n) => n.id !== dialogNodeId.value);
            }

            if (innerFocusable.length > 0) {
              const defaultIdx = props.buttons.findIndex((b) => b.default);
              if (defaultIdx >= 0 && props.buttons.length > 0) {
                const content = contentLayout({
                  w: props.w,
                  h: props.h,
                  padding: props.padding,
                  border: true,
                });
                const layouts = buttonLayout(props.buttons, content);
                const target = layouts[defaultIdx];
                if (target) {
                  const targetRect = {
                    x: x + content.x + target.x,
                    y: y + content.y + target.y,
                    w: target.w,
                    h: 1,
                  };
                  const targetNode = innerFocusable.find(
                    (n) =>
                      n.rect.x === targetRect.x &&
                      n.rect.y === targetRect.y &&
                      n.rect.w === targetRect.w &&
                      n.rect.h === targetRect.h,
                  );
                  if (targetNode) {
                    innerFocusable = [
                      targetNode,
                      ...innerFocusable.filter((n) => n.id !== targetNode.id),
                    ];
                  }
                }
              }
              manager.focus(innerFocusable[0]!.id);
              scheduler.invalidate();
              return;
            }

            // Fallback: focus the dialog container itself
            if (dialogNodeId.value) {
              manager.focus(dialogNodeId.value);
              scheduler.invalidate();
            }
          });
        });
      },
      { immediate: true },
    );

    return () => {
      if (!props.modelValue) return null;

      const boxW = Math.max(0, Math.floor(props.w));
      const boxH = Math.max(0, Math.floor(props.h));
      const { x, y } = pos.value;
      const content = contentRect({
        w: boxW,
        h: boxH,
        padding: props.padding,
        border: true,
      });
      const dialogStyle =
        props.style && props.style.bg == null && defaultStyle.value.bg != null
          ? { ...props.style, bg: defaultStyle.value.bg }
          : props.style;
      const rawContentStyle = props.contentStyle ?? dialogStyle;
      const contentStyle =
        rawContentStyle && rawContentStyle.bg == null && defaultStyle.value.bg != null
          ? { ...rawContentStyle, bg: defaultStyle.value.bg }
          : rawContentStyle;

      const dialogBox = h(
        TView as any,
        {
          x,
          y,
          w: boxW,
          h: boxH,
          zIndex: dialogLayerZ.value,
          focusable: true,
          // Delay autoFocus to let inner elements (e.g. TInput with autoFocus) claim it first
          autoFocus: false,
          onKeydownCapture,
          onKeydown,
          onClick: (e: any) => {
            e?.stopPropagation?.();
          },
          onFocusCapture: onFocusAny,
          onBlurCapture: onBlurAny,
        },
        () =>
          h(
            TBox as any,
            {
              x: 0,
              y: 0,
              w: boxW,
              h: boxH,
              border: true,
              clear: true,
              title: props.title,
              padding: props.padding,
              style: dialogStyle,
              titleStyle: props.titleStyle,
            },
            () => [
              h(TText as any, {
                x: 0,
                y: 0,
                w: content.w,
                h: content.h,
                value: "",
                style: contentStyle,
              }),
              h(props.content as any, { contentVersion: props.contentVersion }),
            ],
          ),
      );

      if (!props.backdrop) return dialogBox;

      return h(
        TView as any,
        {
          x: 0,
          y: 0,
          w: cols.value,
          h: rows.value,
          zIndex: props.zIndex,
          onClick: onBackdropClick,
        },
        () => [
          // Clear the backdrop region so the dialog doesn't visually "leak" underlying content.
          h(TBox as any, {
            x: 0,
            y: 0,
            w: cols.value,
            h: rows.value,
            border: false,
            padding: 0,
            clear: true,
            style: props.backdropStyle,
          }),
          dialogBox,
        ],
      );
    };
  },
});

export const TDialog = defineComponent({
  name: "TDialog",
  props: {
    modelValue: { type: Boolean, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    title: { type: String, default: "" },
    padding: { type: Number, default: 1 },
    zIndex: { type: Number, default: 1000 },
    style: { type: Object as PropType<Style>, default: undefined },
    titleStyle: { type: Object as PropType<Style>, default: undefined },
    contentStyle: { type: Object as PropType<Style>, default: undefined },
    backdropStyle: { type: Object as PropType<Style>, default: undefined },
    placement: { type: String as PropType<Placement>, default: "center" },
    offsetX: { type: Number, default: 0 },
    offsetY: { type: Number, default: 0 },
    backdrop: { type: Boolean, default: true },
    closeOnBackdrop: { type: Boolean, default: true },
    closeOnEsc: { type: Boolean, default: true },
    closeOnBlur: { type: Boolean, default: false },
    teleport: { type: Boolean, default: false },
    tabMode: {
      type: String as PropType<"cycle" | "wrapFromButtons">,
      default: "cycle",
    },
    buttons: { type: Array as PropType<DialogButton[]>, default: () => [] },
    closeOnConfirm: { type: Boolean, default: true },
  },
  emits: ["update:modelValue", "close", "focus", "blur", "keydown", "confirm"],
  setup(props, { emit, slots }) {
    const { runtime, events, scheduler, defaultStyle } = useTerminal();
    const layout = useLayout();
    const cols = computed(() => layout.clipRect?.w ?? 0);
    const rows = computed(() => layout.clipRect?.h ?? 0);
    const skipNextCloseEmit = ref(false);
    const selectedButtonIndex = ref(0);
    const restoreFocusId = ref<string | null>(null);
    const restoreFocusPoint = ref<{ x: number; y: number } | null>(null);

    function contains(
      rect: { x: number; y: number; w: number; h: number },
      x: number,
      y: number,
    ): boolean {
      return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
    }

    function rectArea(rect: { w: number; h: number }): number {
      return Math.max(0, rect.w) * Math.max(0, rect.h);
    }

    function defaultButtonIndex(): number {
      const idx = props.buttons.findIndex((b) => b.default);
      return idx >= 0 ? idx : 0;
    }

    function getDialogBounds(): { x: number; y: number; w: number; h: number } {
      const { x, y } = computePosition({
        cols: cols.value,
        rows: rows.value,
        w: props.w,
        h: props.h,
        placement: props.placement,
        offsetX: props.offsetX,
        offsetY: props.offsetY,
      });

      return {
        x,
        y,
        w: Math.max(0, Math.floor(props.w)),
        h: Math.max(0, Math.floor(props.h)),
      };
    }

    function getDialogEventZIndex(): number {
      const surfaceZ = props.zIndex + (props.backdrop ? 1 : 0);
      return props.backdrop ? props.zIndex + surfaceZ : surfaceZ;
    }

    function getButtonNodes(manager: NonNullable<typeof events.value>) {
      if (!props.buttons.length) return [] as Array<{ id: string } | null>;

      const debugNodes = manager.debugNodes();
      const dialogBounds = getDialogBounds();
      const dialogZIndex = getDialogEventZIndex();
      const content = contentLayout({
        w: props.w,
        h: props.h,
        padding: props.padding,
        border: true,
      });
      const layouts = buttonLayout(props.buttons, content);
      const nodesInDialog = debugNodes.filter((n) => {
        if (!n.visible || !n.focusable) return false;
        if (n.zIndex < dialogZIndex) return false;
        return rectsIntersect(n.rect, dialogBounds);
      });
      const usedNodeIds = new Set<string>();

      return layouts.map((layout) => {
        const targetRect = {
          x: dialogBounds.x + content.x + layout.x,
          y: dialogBounds.y + content.y + layout.y,
          w: layout.w,
          h: 1,
        };

        const exactMatch = nodesInDialog.find(
          (n) =>
            !usedNodeIds.has(n.id) &&
            n.rect.x === targetRect.x &&
            n.rect.y === targetRect.y &&
            n.rect.w === targetRect.w &&
            n.rect.h === targetRect.h,
        );
        if (exactMatch) {
          usedNodeIds.add(exactMatch.id);
          return exactMatch;
        }

        const clippedMatch = nodesInDialog
          .filter(
            (n) =>
              !usedNodeIds.has(n.id) &&
              n.rect.h === 1 &&
              n.rect.y === targetRect.y &&
              n.rect.x < targetRect.x + targetRect.w &&
              n.rect.x + n.rect.w > targetRect.x,
          )
          .sort((a, b) => a.rect.x - b.rect.x)[0];
        if (clippedMatch) usedNodeIds.add(clippedMatch.id);
        return clippedMatch ?? null;
      });
    }

    function confirmButton(index: number): void {
      const btn = props.buttons[index];
      if (!btn) return;
      emit("confirm", { ...btn, index });
      if (props.closeOnConfirm) requestClose();
    }

    function captureRestoreFocus(): void {
      const manager = events.value;
      const id = manager?.getFocused() ?? null;

      // Store both the focused node ID and its position for fallback restoration
      restoreFocusId.value = id;
      restoreFocusPoint.value = null;

      if (!manager || !id) return;

      const node = manager.debugNodes().find((n) => n.id === id) ?? null;
      if (!node) return;

      // Save the center point of the focused node for position-based fallback
      const r = node.rect;
      const x = Math.floor(r.x + Math.max(0, r.w) / 2);
      const y = Math.floor(r.y + Math.max(0, r.h) / 2);
      restoreFocusPoint.value = { x, y };
    }

    function restoreFocus(): void {
      const id = restoreFocusId.value;
      const point = restoreFocusPoint.value;
      restoreFocusId.value = null;
      restoreFocusPoint.value = null;

      // Use multiple microtask deferrals to ensure the dialog node is fully
      // unregistered before attempting to restore focus. Vue's reactivity
      // and the scheduler may need several cycles to complete cleanup.
      const attemptRestore = () => {
        const manager = events.value;
        if (!manager) return;

        // If something else already has valid focus, don't steal it.
        // This avoids focus fights when closing a dialog triggers another overlay
        // (e.g. command palette) that autoFocus-es its own input.
        const cur = manager.getFocused();
        if (cur) {
          const curNode = manager.debugNodes().find((n) => n.id === cur) ?? null;
          if (curNode?.visible && curNode.focusable) {
            scheduler.invalidate();
            return;
          }
        }

        // If we have a saved ID, try to focus it directly
        if (id) {
          const nodes = manager.debugNodes();
          const targetNode = nodes.find((n) => n.id === id && n.visible && n.focusable);
          if (targetNode) {
            manager.focus(id);
            scheduler.invalidate();
            return;
          }
        }

        // Fallback: find a focusable node at the saved point
        if (point) {
          const candidates = manager
            .debugNodes()
            .filter((n) => n.visible && n.focusable && contains(n.rect, point.x, point.y))
            .sort((a, b) => b.zIndex - a.zIndex || rectArea(a.rect) - rectArea(b.rect));
          const next = candidates[0]?.id ?? null;
          if (next) {
            manager.focus(next);
            scheduler.invalidate();
            return;
          }
        }

        // Last resort: find any focusable node (prefer those with lower zIndex = main content)
        const focusableNodes = manager
          .debugNodes()
          .filter((n) => n.visible && n.focusable)
          .sort((a, b) => a.zIndex - b.zIndex || rectArea(b.rect) - rectArea(a.rect));
        const fallback = focusableNodes[0]?.id ?? null;
        if (fallback) {
          manager.focus(fallback);
          scheduler.invalidate();
        }
      };

      // Chain microtasks to ensure dialog cleanup is complete
      queueMicrotask(() => {
        queueMicrotask(() => {
          queueMicrotask(() => {
            attemptRestore();
          });
        });
      });
    }

    const Content = defineComponent({
      name: "TDialogContent",
      props: {
        contentVersion: { type: Number, default: 0 },
      },
      setup(contentProps) {
        provide(DialogContextKey, true);
        let pointerDownButton: { index: number; cellX: number; cellY: number } | null = null;
        let suppressClickButtonIndex: number | null = null;
        return () => {
          void contentProps.contentVersion;
          const children = slots.default?.() ?? null;
          if (!props.buttons.length) return children;

          const c = contentRect({
            w: props.w,
            h: props.h,
            padding: props.padding,
            border: true,
          });
          const layouts = buttonLayout(props.buttons, c);
          const footer = props.buttons.flatMap((b, i) => {
            const text = `[ ${b.label} ]`;
            const layout = layouts[i] ?? { x: 0, y: 0, w: textCellWidth(text) };
            const isSelected = i === selectedButtonIndex.value;
            const isPrimary = b.kind === "primary";
            const isDanger = b.kind === "danger";
            const isAccent = b.kind === "accent";
            const isMuted = b.kind === "muted";
            const baseBg =
              b.style?.bg ?? props.contentStyle?.bg ?? props.style?.bg ?? defaultStyle.value.bg;
            const variantStyle: Style =
              b.style ??
              (isPrimary
                ? { bold: true }
                : isDanger
                  ? { bold: true }
                  : isAccent
                    ? { underline: true }
                    : isMuted
                      ? { dim: true }
                      : {});
            const style: Style = {
              ...variantStyle,
              ...(baseBg && variantStyle.bg == null ? { bg: baseBg } : {}),
              ...(isSelected
                ? b.selectedStyle
                  ? b.selectedStyle
                  : baseBg
                    ? { underline: true, bold: true }
                    : { inverse: true }
                : {}),
            };

            const node = [
              h(TText as any, {
                key: `btn-t-${i}`,
                x: layout.x,
                y: layout.y,
                w: layout.w,
                value: text,
                style,
              }),
              h(TView as any, {
                key: `btn-v-${i}`,
                x: layout.x,
                y: layout.y,
                w: layout.w,
                h: 1,
                zIndex: 0,
                focusable: true,
                onFocus: () => {
                  selectedButtonIndex.value = i;
                },
                onKeydown: (e: any) => {
                  if (e?.defaultPrevented) return;
                  const key = e?.key;
                  const isEnter = key === "Enter";
                  const isSpace = key === " " || key === "Spacebar" || e?.code === "Space";
                  if (!isEnter && !isSpace) return;
                  e.preventDefault?.();
                  e.stopPropagation?.();
                  confirmButton(selectedButtonIndex.value);
                },
                onPointerdown: (e: any) => {
                  e?.stopPropagation?.();
                  selectedButtonIndex.value = i;
                  pointerDownButton = { index: i, cellX: e.cellX, cellY: e.cellY };
                },
                onPointerup: (e: any) => {
                  e?.stopPropagation?.();
                  const down = pointerDownButton;
                  pointerDownButton = null;
                  if (!down || down.index !== i || down.cellX !== e.cellX || down.cellY !== e.cellY)
                    return;
                  selectedButtonIndex.value = i;
                  suppressClickButtonIndex = i;
                  confirmButton(i);
                },
                onClick: (e: any) => {
                  e?.stopPropagation?.();
                  if (suppressClickButtonIndex === i) {
                    suppressClickButtonIndex = null;
                    return;
                  }
                  selectedButtonIndex.value = i;
                  confirmButton(i);
                },
              }),
            ];
            return node;
          });

          return h("div", null, [children, ...footer]);
        };
      },
    });

    const handle = shallowRef<TerminalRuntimeHandle | null>(null);
    const stableButtons = shallowRef(props.buttons);
    // Dialog content renders through a wrapper component, so each surface update
    // needs an explicit reactive dependency to re-run the default slot.
    let contentVersion = 0;

    function requestClose(): void {
      skipNextCloseEmit.value = true;
      emit("update:modelValue", false);
      emit("close");
      queueMicrotask(() => {
        if (props.modelValue) skipNextCloseEmit.value = false;
      });
    }

    function onDialogFocus(): void {
      emit("focus");
    }

    function onDialogBlur(): void {
      emit("blur");
    }

    function onDialogKeydown(e: any): void {
      emit("keydown", e);
      if (!props.modelValue) return;
      if (!props.buttons.length) return;

      const allowDefaultPreventedEnter =
        e?.key === "Enter" && (e as any)?.__tuiDialogConfirm === true;

      if (e?.defaultPrevented && !allowDefaultPreventedEnter) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault?.();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const len = props.buttons.length;
        if (len > 0) {
          selectedButtonIndex.value = (selectedButtonIndex.value + dir + len) % len;

          const manager = events.value;
          const currentFocusedId = manager?.getFocused() ?? null;
          if (manager && currentFocusedId) {
            const buttonNodes = getButtonNodes(manager);
            if (buttonNodes.some((node) => node?.id === currentFocusedId)) {
              const targetNode = buttonNodes[selectedButtonIndex.value];
              if (targetNode && targetNode.id !== currentFocusedId) manager.focus(targetNode.id);
            }
          }
        }
        scheduler.invalidate();
        return;
      }

      if (e.key === "Enter") {
        if (e.shiftKey) return;
        e.preventDefault?.();
        confirmButton(selectedButtonIndex.value);
      }
    }

    watch(
      () => props.modelValue,
      (next, prev) => {
        if (next && !prev) captureRestoreFocus();
        if (next && !prev) {
          selectedButtonIndex.value = clamp(
            defaultButtonIndex(),
            0,
            Math.max(0, props.buttons.length - 1),
          );
        }
        if (!prev || next) return;
        const closeAlreadyEmitted = skipNextCloseEmit.value;
        skipNextCloseEmit.value = false;

        if (!closeAlreadyEmitted) emit("close");
        restoreFocus();
      },
      { immediate: true },
    );

    onMounted(() => {
      if (!props.teleport) return;
      handle.value = runtime.mount(
        DialogSurface,
        {
          modelValue: props.modelValue,
          w: props.w,
          h: props.h,
          title: props.title,
          padding: props.padding,
          zIndex: props.zIndex,
          style: props.style,
          titleStyle: props.titleStyle,
          contentStyle: props.contentStyle,
          backdropStyle: props.backdropStyle,
          placement: props.placement,
          offsetX: props.offsetX,
          offsetY: props.offsetY,
          backdrop: props.backdrop,
          closeOnBackdrop: props.closeOnBackdrop,
          closeOnEsc: props.closeOnEsc,
          closeOnBlur: props.closeOnBlur,
          tabMode: props.tabMode,
          buttons: stableButtons.value,
          content: Content,
          contentVersion: contentVersion++,
          onRequestClose: requestClose,
          onDialogFocus,
          onDialogBlur,
          onDialogKeydown,
        },
        { plane: "overlay" },
      );
    });

    watch(
      () => props.buttons,
      (next) => {
        if (!buttonsEqual(next, stableButtons.value)) stableButtons.value = next;
      },
      { immediate: true },
    );

    watchEffect(() => {
      if (!props.teleport) return;
      const h = handle.value;
      if (!h) return;
      h.update({
        modelValue: props.modelValue,
        w: props.w,
        h: props.h,
        title: props.title,
        padding: props.padding,
        zIndex: props.zIndex,
        style: props.style,
        titleStyle: props.titleStyle,
        contentStyle: props.contentStyle,
        backdropStyle: props.backdropStyle,
        placement: props.placement,
        offsetX: props.offsetX,
        offsetY: props.offsetY,
        backdrop: props.backdrop,
        closeOnBackdrop: props.closeOnBackdrop,
        closeOnEsc: props.closeOnEsc,
        closeOnBlur: props.closeOnBlur,
        tabMode: props.tabMode,
        buttons: stableButtons.value,
        content: Content,
        contentVersion: contentVersion++,
        onRequestClose: requestClose,
        onDialogFocus,
        onDialogBlur,
        onDialogKeydown,
      });
    });

    onBeforeUnmount(() => {
      handle.value?.unmount();
      handle.value = null;
      // When the component unmounts while dialog was open (e.g., v-if toggle),
      // we need to restore focus. Check if we have a saved restore target.
      if (restoreFocusId.value || restoreFocusPoint.value) restoreFocus();
    });

    return () => {
      if (props.teleport) return null;
      return h(DialogSurface as any, {
        modelValue: props.modelValue,
        w: props.w,
        h: props.h,
        title: props.title,
        padding: props.padding,
        zIndex: props.zIndex,
        style: props.style,
        titleStyle: props.titleStyle,
        contentStyle: props.contentStyle,
        backdropStyle: props.backdropStyle,
        placement: props.placement,
        offsetX: props.offsetX,
        offsetY: props.offsetY,
        backdrop: props.backdrop,
        closeOnBackdrop: props.closeOnBackdrop,
        closeOnEsc: props.closeOnEsc,
        closeOnBlur: props.closeOnBlur,
        tabMode: props.tabMode,
        buttons: props.buttons,
        content: Content,
        contentVersion: contentVersion++,
        onRequestClose: requestClose,
        onDialogFocus,
        onDialogBlur,
        onDialogKeydown,
      });
    };
  },
});
