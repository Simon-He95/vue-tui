import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import { computed, defineComponent, h, inject, ref, watch } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { sliceByCellsRange, spaces, textCellWidth } from "../utils/text.js";

const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });
const EMPTY_LABEL = "No visible links";

export type TLogLinkPanelItem = Readonly<{
  visibleIndex: number;
  href: string;
  text: string;
  absoluteLineIndex: number;
  index: number;
  startCell: number;
  endCell: number;
  current?: boolean;
}>;

export type TLogLinksPanelSelectPayload = Readonly<{
  visibleIndex: number;
  item: TLogLinkPanelItem;
}>;

export type TLogLinksPanelActivatePayload = Readonly<{
  visibleIndex: number;
  item: TLogLinkPanelItem;
}>;

export type TLogLinksPanelActiveChangePayload = Readonly<{
  activeIndex: number;
  item: TLogLinkPanelItem | null;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function mergeStyle(base: Style, overlay?: Style): Style {
  return overlay ? { ...base, ...overlay } : base;
}

function normalizeActiveIndex(value: number, count: number): number {
  if (count <= 0) return -1;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return -1;
  if (n < 0) return -1;
  return clamp(n, 0, count - 1);
}

export const TLogLinksPanel = defineComponent({
  name: "TLogLinksPanel",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    links: {
      type: Array as PropType<readonly TLogLinkPanelItem[]>,
      default: () => [],
    },
    activeIndex: { type: Number, default: -1 },
    style: { type: Object as PropType<Style>, default: undefined },
    activeStyle: {
      type: Object as PropType<Style>,
      default: () => ({ inverse: true }),
    },
    currentStyle: {
      type: Object as PropType<Style>,
      default: () => ({ bold: true }),
    },
    hrefStyle: {
      type: Object as PropType<Style>,
      default: () => ({ underline: true }),
    },
    disabledStyle: {
      type: Object as PropType<Style>,
      default: () => ({ dim: true }),
    },
    showLineNumbers: { type: Boolean, default: true },
    showHref: { type: Boolean, default: true },
    focusable: { type: Boolean, default: true },
  },
  emits: ["select", "activate", "activeChange", "focus", "blur", "keydown"],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const parent = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const focused = ref(false);
    const internalActiveIndex = ref(-1);

    const fullRect = computed<Rect>(() =>
      translateRect(
        {
          x: normalizeInt(props.x),
          y: normalizeInt(props.y),
          w: Math.max(0, normalizeInt(props.w)),
          h: Math.max(0, normalizeInt(props.h)),
        },
        parent.originX,
        parent.originY,
      ),
    );

    const rect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!parent.clipRect) return translated;
      return intersectRect(translated, parent.clipRect) ?? EMPTY_RECT;
    });

    const lineNumberDigits = computed(() =>
      props.showLineNumbers
        ? props.links.reduce((max, link) => Math.max(max, String(link.absoluteLineIndex).length), 1)
        : 0,
    );

    watch(
      [() => props.activeIndex, () => props.links.length],
      () => {
        internalActiveIndex.value = normalizeActiveIndex(props.activeIndex, props.links.length);
      },
      { immediate: true },
    );

    function activeItem(index = internalActiveIndex.value): TLogLinkPanelItem | null {
      return index >= 0 ? (props.links[index] ?? null) : null;
    }

    function emitActiveChange(): void {
      emit("activeChange", {
        activeIndex: internalActiveIndex.value,
        item: activeItem(),
      } satisfies TLogLinksPanelActiveChangePayload);
    }

    function setActiveIndex(index: number): void {
      const next = normalizeActiveIndex(index, props.links.length);
      if (next === internalActiveIndex.value) return;
      internalActiveIndex.value = next;
      emitActiveChange();
      scheduler.invalidate({ reason: "input" });
    }

    function emitSelect(index: number): void {
      const item = props.links[index];
      if (!item) return;
      emit("select", {
        visibleIndex: item.visibleIndex,
        item,
      } satisfies TLogLinksPanelSelectPayload);
    }

    function emitActivate(index: number): void {
      const item = props.links[index];
      if (!item) return;
      emit("activate", {
        visibleIndex: item.visibleIndex,
        item,
      } satisfies TLogLinksPanelActivatePayload);
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (!props.links.length) {
        if (e.key === "Escape") {
          e.preventDefault();
          setActiveIndex(-1);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((internalActiveIndex.value < 0 ? -1 : internalActiveIndex.value) + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(internalActiveIndex.value < 0 ? 0 : internalActiveIndex.value - 1);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(props.links.length - 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (internalActiveIndex.value >= 0) emitActivate(internalActiveIndex.value);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setActiveIndex(-1);
      }
    }

    function onClick(e: TerminalPointerEvent): void {
      const full = fullRect.value;
      const localY = e.cellY - full.y;
      if (localY < 0 || localY >= full.h) return;
      const item = props.links[localY];
      if (!item) return;
      const nodeId = eventNode.id.value;
      if (props.focusable && nodeId) events.value?.focus(nodeId);
      setActiveIndex(localY);
      emitSelect(localY);
      e.preventDefault?.();
    }

    const eventNode = useTerminalNode(() => ({
      rect: rect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: props.focusable,
      handlers: {
        click: onClick,
        focus: () => {
          focused.value = true;
          emit("focus");
          scheduler.invalidate();
        },
        blur: () => {
          focused.value = false;
          emit("blur");
          scheduler.invalidate();
        },
        keydown: onKeydown,
      },
    }));

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? rect.value : EMPTY_RECT,
      deps: [
        visible.value,
        rect.value,
        fullRect.value,
        props.links,
        props.activeIndex,
        props.style,
        props.activeStyle,
        props.currentStyle,
        props.hrefStyle,
        props.disabledStyle,
        props.showLineNumbers,
        props.showHref,
        props.focusable,
        internalActiveIndex.value,
        focused.value,
        lineNumberDigits.value,
        defaultStyle.value,
      ],
      paint: () => {
        if (!visible.value) return;
        const r = rect.value;
        if (r.w <= 0 || r.h <= 0) return;

        const full = fullRect.value;
        const base = props.style ?? defaultStyle.value;
        const disabled = mergeStyle(base, props.disabledStyle);

        const writeSegments = (
          y: number,
          rowStyle: Style,
          segments: readonly Readonly<{
            text: string;
            style: Style;
          }>[],
        ): void => {
          let x = r.x;
          let used = 0;
          for (const segment of segments) {
            if (used >= r.w || !segment.text) continue;
            const text = sliceByCellsRange(segment.text, 0, r.w - used);
            const cells = textCellWidth(text);
            if (!text || cells <= 0) continue;
            terminal.write(text, { x, y, style: segment.style });
            x += cells;
            used += cells;
          }
          if (used < r.w) terminal.write(spaces(r.w - used), { x, y, style: rowStyle });
        };

        for (let y = r.y; y < r.y + r.h; y++) {
          const localY = y - full.y;
          const item = props.links[localY];
          if (!item) {
            if (!props.links.length && localY === 0) {
              writeSegments(y, disabled, [{ text: EMPTY_LABEL, style: disabled }]);
            } else {
              terminal.write(spaces(r.w), { x: r.x, y, style: base });
            }
            continue;
          }

          let rowStyle = base;
          if (localY === internalActiveIndex.value)
            rowStyle = mergeStyle(rowStyle, props.activeStyle);
          if (item.current) rowStyle = mergeStyle(rowStyle, props.currentStyle);
          const hrefRowStyle = mergeStyle(rowStyle, props.hrefStyle);

          const segments: Array<{ text: string; style: Style }> = [];
          if (props.showLineNumbers) {
            segments.push({
              text: `${String(item.absoluteLineIndex).padStart(lineNumberDigits.value)} `,
              style: rowStyle,
            });
          }
          if (item.text) segments.push({ text: item.text, style: rowStyle });
          if (props.showHref && item.href) {
            if (item.text) segments.push({ text: " ", style: rowStyle });
            segments.push({ text: item.href, style: hrefRowStyle });
          }
          if (!segments.length) segments.push({ text: "", style: rowStyle });

          writeSegments(y, rowStyle, segments);
        }
      },
    }));

    return () => h("span", rootProps);
  },
});
