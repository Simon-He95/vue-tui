import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent } from "../../events/manager/types.js";
import { computed, defineComponent, h, inject, watchEffect } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { translateRect } from "../utils/rect.js";
import {
  padEndByCells,
  sanitizeInlineText,
  sanitizeTextBlock,
  sliceByCells,
  spaces,
} from "../utils/text.js";

const BORDER = {
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  h: "─",
  v: "│",
};

export const TMultilineModal = defineComponent({
  name: "TMultilineModal",
  props: {
    visible: { type: Boolean, required: true },
    content: { type: String, required: true },
    title: { type: String, default: "Multiline Text" },
    style: { type: Object as PropType<Style>, default: undefined },
    zIndex: { type: Number, default: 1000 },
  },
  emits: ["close"],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const layout = useLayout();
    const { visible: parentVisible, rootProps } = useVisibility();

    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const isVisible = computed(() => parentVisible.value && props.visible);

    // Calculate modal dimensions (80% width, 70% height, centered)
    const modalRect = computed<Rect>(() => {
      const size = terminal.size();
      const termW = size.cols;
      const termH = size.rows;

      const w = Math.floor(termW * 0.8);
      const h = Math.floor(termH * 0.7);
      const x = Math.floor((termW - w) / 2);
      const y = Math.floor((termH - h) / 2);

      return translateRect({ x, y, w, h }, layout.originX, layout.originY);
    });

    // Parse content into lines for scrolling
    const contentLines = computed(() => {
      const text = sanitizeTextBlock(String(props.content || ""));
      return text.split("\n");
    });

    const scrollY = computed(() => 0); // Simple version: no scrolling for now

    function onKeydown(e: TerminalKeyboardEvent): void {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        emit("close");
        scheduler.invalidate();
      }
    }

    // Backdrop (overlay) layer - catches clicks outside modal
    const backdropNode = useTerminalNode(() => ({
      rect: isVisible.value
        ? { x: 0, y: 0, w: terminal.size().cols, h: terminal.size().rows }
        : { x: 0, y: 0, w: 0, h: 0 },
      zIndex: eventZ.value,
      visible: isVisible.value,
      focusable: true,
      handlers: {
        click: (e) => {
          e.preventDefault();
          e.stopPropagation();
          emit("close");
          scheduler.invalidate();
        },
        keydown: onKeydown,
      },
    }));

    // Modal content layer - prevents backdrop click from closing
    const contentNode = useTerminalNode(() => ({
      rect: isVisible.value ? modalRect.value : { x: 0, y: 0, w: 0, h: 0 },
      zIndex: eventZ.value + 1,
      visible: isVisible.value,
      focusable: true,
      handlers: {
        click: (e) => {
          // Stop propagation to backdrop
          e.preventDefault();
          e.stopPropagation();
          const manager = events.value;
          const nodeId = contentNode.id.value;
          if (manager && nodeId) manager.focus(nodeId);
        },
        keydown: onKeydown,
      },
    }));

    // Auto-focus when visible
    watchEffect(() => {
      if (!isVisible.value) return;
      const manager = events.value;
      const nodeId = contentNode.id.value || backdropNode.id.value;
      if (!manager || !nodeId) return;
      manager.focus(nodeId);
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: isVisible.value
        ? { x: 0, y: 0, w: terminal.size().cols, h: terminal.size().rows }
        : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        isVisible.value,
        modalRect.value,
        props.content,
        props.title,
        props.style,
        defaultStyle.value,
      ],
      paint: () => {
        if (!isVisible.value) return;

        const snapshot = terminal.size();
        const style = props.style ?? defaultStyle.value;

        // Draw backdrop (semi-transparent effect with dim style)
        const backdropStyle: Style = { ...style, bg: defaultStyle.value.bg ?? style.bg, dim: true };
        const backdropRow = spaces(snapshot.cols);
        for (let y = 0; y < snapshot.rows; y++) {
          terminal.write(backdropRow, { x: 0, y, style: backdropStyle });
        }

        // Draw modal
        const r = modalRect.value;
        const fallbackFg = style.fg ?? defaultStyle.value.fg;
        const fallbackBg = style.bg ?? defaultStyle.value.bg;
        const borderStyle: Style = { ...style, fg: defaultStyle.value.fg ?? style.fg };
        const contentStyle: Style = { ...style, fg: fallbackFg, bg: fallbackBg };
        const footerStyle: Style = { ...style, dim: true };

        // Draw border
        terminal.put(r.x, r.y, BORDER.tl, borderStyle);
        terminal.put(r.x + r.w - 1, r.y, BORDER.tr, borderStyle);
        terminal.put(r.x, r.y + r.h - 1, BORDER.bl, borderStyle);
        terminal.put(r.x + r.w - 1, r.y + r.h - 1, BORDER.br, borderStyle);

        // Top border with title
        const innerW = Math.max(0, r.w - 2);
        const titleText = ` ${sanitizeInlineText(props.title)} `;
        const titleW = Math.min(titleText.length, innerW);
        const titleX = r.x + 1;
        terminal.write(titleText.slice(0, titleW), {
          x: titleX,
          y: r.y,
          style: borderStyle,
        });
        const remainingTop = innerW - titleW;
        if (remainingTop > 0) {
          terminal.write(BORDER.h.repeat(remainingTop), {
            x: titleX + titleW,
            y: r.y,
            style: borderStyle,
          });
        }

        // Bottom border with footer
        const footer = " Press ESC to close ";
        const footerW = Math.min(footer.length, innerW);
        const footerX = r.x + Math.floor((r.w - footerW) / 2);
        const leftBorder = footerX - r.x - 1;
        const rightBorder = innerW - leftBorder - footerW;
        if (leftBorder > 0) {
          terminal.write(BORDER.h.repeat(leftBorder), {
            x: r.x + 1,
            y: r.y + r.h - 1,
            style: borderStyle,
          });
        }
        terminal.write(footer, {
          x: footerX,
          y: r.y + r.h - 1,
          style: footerStyle,
        });
        if (rightBorder > 0) {
          terminal.write(BORDER.h.repeat(rightBorder), {
            x: footerX + footerW,
            y: r.y + r.h - 1,
            style: borderStyle,
          });
        }

        // Side borders
        for (let y = 1; y < r.h - 1; y++) {
          terminal.put(r.x, r.y + y, BORDER.v, borderStyle);
          terminal.put(r.x + r.w - 1, r.y + y, BORDER.v, borderStyle);
        }

        // Draw content
        const contentH = Math.max(0, r.h - 2);
        const lines = contentLines.value;
        const startLine = scrollY.value;

        for (let row = 0; row < contentH; row++) {
          const lineIndex = startLine + row;
          const line = lines[lineIndex] ?? "";
          const visible = sliceByCells(line, innerW);
          const padded = padEndByCells(visible, innerW);
          terminal.write(padded, {
            x: r.x + 1,
            y: r.y + 1 + row,
            style: contentStyle,
          });
        }
      },
    }));

    return () => h("span", rootProps);
  },
});
