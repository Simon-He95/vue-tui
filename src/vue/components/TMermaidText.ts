import type { ExtractPublicPropTypes, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect } from "../../events/manager/types.js";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  markRaw,
  onBeforeUnmount,
  shallowRef,
  watch,
} from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  padEndByCells,
  sanitizeTextBlock,
  sliceByCells,
  sliceByCellsRange,
  spaces,
  withTextWidthProvider,
} from "../utils/text.js";

export type TMermaidAsciiTheme = Readonly<
  Partial<{
    fg: string;
    border: string;
    line: string;
    arrow: string;
    accent: string;
    bg: string;
    corner: string;
    junction: string;
  }>
>;

export type TMermaidAsciiOptions = Readonly<{
  paddingX?: number;
  paddingY?: number;
  boxBorderPadding?: number;
  theme?: TMermaidAsciiTheme;
}>;

export type TMermaidResolvedAsciiOptions = TMermaidAsciiOptions &
  Readonly<{
    useAscii: boolean;
    colorMode: "none";
  }>;

export type TMermaidRenderer = (
  code: string,
  options: TMermaidResolvedAsciiOptions,
) => string | Promise<string>;

type TMermaidStatus = "idle" | "loading" | "ready" | "error";

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}(?:\\[[0-?]*[ -/]*[@-~]|[@-Z\\\\-_])`, "g");

function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function splitRenderedOutput(value: string): readonly string[] {
  const normalized = sanitizeTextBlock(stripAnsi(String(value ?? "")).replace(/\r\n?/g, "\n"));
  const lines = normalized.split("\n");
  return lines.length ? lines : [""];
}

export const tMermaidTextProps = {
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  w: { type: Number, required: true },
  h: { type: Number, default: undefined },
  zIndex: { type: Number, default: 0 },
  content: { type: String, default: "" },
  code: { type: String, default: undefined },
  style: { type: Object as PropType<Style>, default: undefined },
  loadingStyle: { type: Object as PropType<Style>, default: undefined },
  errorStyle: { type: Object as PropType<Style>, default: undefined },
  clear: { type: Boolean, default: true },
  streaming: { type: Boolean, default: false },
  ascii: { type: Boolean, default: false },
  paddingX: { type: Number, default: undefined },
  paddingY: { type: Number, default: undefined },
  boxBorderPadding: { type: Number, default: undefined },
  options: {
    type: Object as PropType<TMermaidAsciiOptions>,
    default: undefined,
  },
  renderer: {
    type: Function as PropType<TMermaidRenderer>,
    default: undefined,
  },
  loadingText: {
    type: String,
    default: "Rendering Mermaid diagram...",
  },
  missingDependencyText: {
    type: String,
    default:
      "Install beautiful-mermaid and use @simon_he/vue-tui/mermaid, or pass a renderer prop.",
  },
  errorText: {
    type: String,
    default: "Mermaid render failed",
  },
  showErrorDetails: {
    type: Boolean,
    default: true,
  },
} as const;

export type TMermaidTextProps = ExtractPublicPropTypes<typeof tMermaidTextProps>;

export const TMermaidText = defineComponent({
  name: "TMermaidText",
  props: tMermaidTextProps,
  setup(props) {
    const instance = getCurrentInstance();
    const { terminal, defaultStyle, scheduler, widthProvider } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();

    const status = shallowRef<TMermaidStatus>("idle");
    const error = shallowRef("");
    const lines = shallowRef<readonly string[]>(markRaw([""]));
    const documentVersion = shallowRef(0);

    let builtOnce = false;
    let renderVersion = 0;
    let alive = true;

    const source = computed(() => props.code ?? props.content ?? "");

    function bump(): void {
      documentVersion.value++;
    }

    function resolveAsciiOptions(): TMermaidResolvedAsciiOptions {
      const base = props.options ?? {};
      return {
        ...base,
        useAscii: props.ascii,
        paddingX: props.paddingX ?? base.paddingX,
        paddingY: props.paddingY ?? base.paddingY,
        boxBorderPadding: props.boxBorderPadding ?? base.boxBorderPadding,
        colorMode: "none",
      };
    }

    async function renderNow(version: number): Promise<void> {
      const code = source.value;
      if (!code.trim()) {
        if (!alive || version !== renderVersion) return;
        lines.value = markRaw([""]);
        status.value = "ready";
        error.value = "";
        bump();
        return;
      }

      status.value = "loading";
      error.value = "";
      bump();

      try {
        const renderer = props.renderer;
        if (!renderer) {
          if (!alive || version !== renderVersion) return;
          lines.value = markRaw([""]);
          error.value = props.missingDependencyText;
          status.value = "error";
          bump();
          return;
        }

        const rendered = await renderer(code, resolveAsciiOptions());
        if (!alive || version !== renderVersion) return;

        lines.value = markRaw(splitRenderedOutput(rendered));
        status.value = "ready";
        error.value = "";
        bump();
      } catch (err) {
        if (!alive || version !== renderVersion) return;
        error.value = errorMessage(err);
        status.value = "error";
        bump();
      }
    }

    function scheduleRender(): void {
      const version = ++renderVersion;

      if (!builtOnce || !props.streaming) {
        builtOnce = true;
        void renderNow(version);
        return;
      }

      scheduler.queueFrameTask({
        id: `TMermaidText:${instance?.uid ?? "unknown"}:mermaid`,
        reason: "stream",
        priority: "low",
        sync: false,
        run: () => {
          if (!alive) return;
          if (version !== renderVersion) return;
          void renderNow(version);
        },
      });
    }

    watch(
      [
        source,
        () => props.renderer,
        () => props.ascii,
        () => props.paddingX,
        () => props.paddingY,
        () => props.boxBorderPadding,
        () => props.options,
      ],
      () => {
        scheduleRender();
      },
      { immediate: true, deep: true },
    );

    onBeforeUnmount(() => {
      alive = false;
      renderVersion++;
    });

    const displayLines = computed<readonly string[]>(() => {
      if (status.value === "error") {
        const detail = props.showErrorDetails && error.value ? `: ${error.value}` : "";
        return splitRenderedOutput(`${props.errorText}${detail}`);
      }
      if (status.value === "loading" && lines.value.length <= 1 && !lines.value[0]) {
        return splitRenderedOutput(props.loadingText);
      }
      return lines.value.length ? lines.value : [""];
    });

    const currentStyle = computed<Style>(() => {
      if (status.value === "error") {
        return props.errorStyle ?? props.style ?? defaultStyle.value;
      }
      if (status.value === "loading" && displayLines.value.length === 1) {
        return props.loadingStyle ?? props.style ?? defaultStyle.value;
      }
      return props.style ?? defaultStyle.value;
    });

    const fullRect = computed<Rect>(() => {
      const height = props.h ?? Math.max(1, displayLines.value.length);
      return translateRect(
        { x: props.x, y: props.y, w: props.w, h: height },
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
        props.style,
        props.loadingStyle,
        props.errorStyle,
        props.clear,
        status.value,
        error.value,
        documentVersion.value,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        withTextWidthProvider(widthProvider, () => {
          if (!visible.value) return;

          const r = absRect.value;
          const full = fullRect.value;
          if (r.w <= 0 || r.h <= 0) return;

          const style = currentStyle.value;
          const out = displayLines.value;
          const dx = Math.max(0, Math.floor(r.x - full.x));
          const fullY = Math.floor(full.y);
          const blank = props.clear ? spaces(r.w) : "";

          const paintRow = (y: number) => {
            if (y < r.y || y >= r.y + r.h) return;

            const rowIndex = y - fullY;
            if (rowIndex < 0 || rowIndex >= out.length) {
              if (props.clear) terminal.write(blank, { x: r.x, y, style });
              return;
            }

            const src = out[rowIndex] ?? "";
            const clipped = dx > 0 ? sliceByCellsRange(src, dx, dx + r.w) : sliceByCells(src, r.w);
            const value = props.clear ? padEndByCells(clipped, r.w) : clipped;
            if (value || props.clear) {
              terminal.write(value, { x: r.x, y, style });
            }
          };

          if (dirtyRows?.length) {
            for (const y of dirtyRows) paintRow(y);
            return;
          }

          for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
        });
      },
    }));

    return () => h("span", rootProps);
  },
});

export const TMermaid = TMermaidText;
