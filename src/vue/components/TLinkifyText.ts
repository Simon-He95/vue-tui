import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect } from "../../events/manager/types.js";
import type { TLinkifyOptions, TLinkifyProtocol } from "../linkify.js";
import { computed, defineComponent, h, inject, ref } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { linkifyTextSegments } from "../linkify.js";
import { TuiThemeContextKey, tuiDefaultTheme } from "../theme.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  forEachTextCellSegment,
  sanitizeTextBlock,
  sliceByCellsRange,
  spaces,
  textCellWidth,
} from "../utils/text.js";

type TLinkifyVisualSegment = Readonly<{
  text: string;
  cells: number;
  href?: string;
}>;

function splitLines(text: string): string[] {
  return sanitizeTextBlock(text).split("\n");
}

function mergeStyle(...styles: Array<Style | undefined>): Style {
  const out: Record<string, unknown> = {};
  for (const style of styles) {
    if (!style) continue;
    Object.assign(out, style);
  }
  return out as Style;
}

function linkifyOptions(props: {
  protocols?: readonly TLinkifyProtocol[];
  allowRelative?: boolean;
  maxUrlLength?: number;
}): TLinkifyOptions {
  return {
    protocols: props.protocols,
    allowRelative: props.allowRelative,
    maxUrlLength: props.maxUrlLength,
  };
}

function visualSegmentsForLine(
  text: string,
  options: TLinkifyOptions,
): readonly TLinkifyVisualSegment[] {
  const segments = linkifyTextSegments(text, options);
  return segments
    .map((segment) => ({
      text: segment.text,
      cells: textCellWidth(segment.text),
      href: segment.href,
    }))
    .filter((segment) => segment.text && segment.cells > 0);
}

function computeDefaultWidth(text: string, options: TLinkifyOptions): number {
  let max = 0;
  for (const line of splitLines(text)) {
    let width = 0;
    for (const segment of visualSegmentsForLine(line, options)) width += segment.cells;
    max = Math.max(max, width);
  }
  return max;
}

function pushSegment(
  row: TLinkifyVisualSegment[],
  text: string,
  cells: number,
  href: string | undefined,
): void {
  const previous = row[row.length - 1];
  if (previous && previous.href === href) {
    row[row.length - 1] = {
      text: previous.text + text,
      cells: previous.cells + cells,
      href,
    };
    return;
  }
  row.push({ text, cells, href });
}

function wrapVisualSegmentsByCells(
  segments: readonly TLinkifyVisualSegment[],
  width: number,
): readonly (readonly TLinkifyVisualSegment[])[] {
  width = Math.max(1, Math.floor(width));
  const rows: TLinkifyVisualSegment[][] = [[]];
  let row = rows[0]!;
  let rowCells = 0;

  for (const segment of segments) {
    forEachTextCellSegment(segment.text, (piece) => {
      if (!piece.text || piece.cells <= 0) return;
      if (rowCells > 0 && rowCells + piece.cells > width) {
        row = [];
        rows.push(row);
        rowCells = 0;
      }
      if (piece.cells > width) {
        pushSegment(row, spaces(width), width, undefined);
        row = [];
        rows.push(row);
        rowCells = 0;
        return;
      }
      pushSegment(row, piece.text, piece.cells, segment.href);
      rowCells += piece.cells;
      if (rowCells >= width) {
        row = [];
        rows.push(row);
        rowCells = 0;
      }
    });
  }

  if (rows.length > 1 && rows[rows.length - 1]!.length === 0) rows.pop();
  return rows.length ? rows : [[]];
}

function clipVisualSegmentsByCells(
  segments: readonly TLinkifyVisualSegment[],
  startCell: number,
  endCell: number,
): readonly TLinkifyVisualSegment[] {
  const out: TLinkifyVisualSegment[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const next = cursor + segment.cells;
    if (next <= startCell) {
      cursor = next;
      continue;
    }
    if (cursor >= endCell) break;
    const from = Math.max(0, startCell - cursor);
    const to = Math.min(segment.cells, endCell - cursor);
    const text = sliceByCellsRange(segment.text, from, to);
    const cells = textCellWidth(text);
    if (cells > 0) pushSegment(out, text, cells, segment.href);
    cursor = next;
  }
  return out;
}

export const TLinkifyText = defineComponent({
  name: "TLinkifyText",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    value: { type: String, required: true },
    w: { type: Number, default: undefined },
    h: { type: Number, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    linkStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    clear: { type: Boolean, default: true },
    wrap: { type: Boolean, default: false },
    protocols: {
      type: Array as PropType<readonly TLinkifyProtocol[]>,
      default: undefined,
    },
    allowRelative: { type: Boolean, default: false },
    maxUrlLength: { type: Number, default: undefined },
  },
  setup(props) {
    const { terminal, defaultStyle } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const theme = inject(TuiThemeContextKey, ref(tuiDefaultTheme));

    const options = computed(() => linkifyOptions(props));
    const effectiveLinkStyle = computed(() =>
      mergeStyle(
        theme.value.components.TLink?.style,
        theme.value.components.TLink?.underline === false ? { underline: false } : undefined,
        props.linkStyle,
      ),
    );
    const defaultWidth = computed(() => computeDefaultWidth(props.value, options.value));
    const rows = computed(() => {
      const width = Math.max(0, Math.floor(props.w ?? defaultWidth.value));
      if (width <= 0) return [[]] as readonly (readonly TLinkifyVisualSegment[])[];

      const out: Array<readonly TLinkifyVisualSegment[]> = [];
      for (const line of splitLines(props.value)) {
        const segments = visualSegmentsForLine(line, options.value);
        if (props.wrap) out.push(...wrapVisualSegmentsByCells(segments, width));
        else out.push(clipVisualSegmentsByCells(segments, 0, width));
      }
      return out.length ? out : [[]];
    });

    const fullRect = computed<Rect>(() => {
      const width = props.w ?? defaultWidth.value;
      const height = props.h ?? (rows.value.length || 1);
      return translateRect(
        { x: props.x, y: props.y, w: width, h: height },
        layout.originX,
        layout.originY,
      );
    });

    const absRect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        props.value,
        props.w,
        props.h,
        props.wrap,
        props.style,
        effectiveLinkStyle.value,
        props.protocols,
        props.allowRelative,
        props.maxUrlLength,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const full = fullRect.value;
        const baseStyle = props.style ?? defaultStyle.value;
        const dx = Math.max(0, Math.floor(r.x - full.x));
        const fullY = Math.floor(full.y);

        const paintRow = (y: number) => {
          const relY = y - r.y;
          if (relY < 0 || relY >= r.h) return;

          const i = y - fullY;
          if (i < 0 || i >= rows.value.length) {
            if (props.clear) terminal.write(spaces(r.w), { x: r.x, y, style: baseStyle });
            return;
          }

          const row = clipVisualSegmentsByCells(rows.value[i] ?? [], dx, dx + r.w);
          let cx = r.x;
          let used = 0;
          for (const segment of row) {
            const style = segment.href
              ? mergeStyle(baseStyle, effectiveLinkStyle.value, { href: segment.href })
              : baseStyle;
            terminal.write(segment.text, { x: cx, y, style });
            cx += segment.cells;
            used += segment.cells;
          }
          if (props.clear && used < r.w) {
            terminal.write(spaces(r.w - used), { x: cx, y, style: baseStyle });
          }
        };

        if (dirtyRows) {
          for (const y of dirtyRows) paintRow(y);
          return;
        }
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
      },
    }));

    return () => h("span", rootProps);
  },
});
