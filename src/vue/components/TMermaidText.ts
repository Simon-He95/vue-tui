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

export type TMermaidTransientErrorContext = Readonly<{
  code: string;
  final: boolean;
  streaming: boolean;
}>;

export type TMermaidTransientErrorClassifier = (
  error: unknown,
  context: TMermaidTransientErrorContext,
) => boolean;

type TMermaidStatus = "idle" | "loading" | "ready" | "incomplete" | "error";

const TUI_MERMAID_FATAL_RENDER_ERROR = "__vueTuiMermaidFatalRenderError" as const;
const fatalMermaidRenderErrors = new WeakSet<object>();

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const TERMINAL_ESCAPE_RE = new RegExp(
  [
    `${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)`,
    `${ESC}[PX^_][\\s\\S]*?${ESC}\\\\`,
    `${ESC}\\[[0-?]*[ -/]*[@-~]`,
    `${ESC}[@-Z\\\\-_]`,
  ].join("|"),
  "g",
);

function stripTerminalEscapes(value: string): string {
  return value.replace(TERMINAL_ESCAPE_RE, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type TMermaidFatalRenderError = Error & {
  [TUI_MERMAID_FATAL_RENDER_ERROR]?: true;
};

export function markMermaidRenderErrorFatal(error: unknown): Error {
  const normalized = error instanceof Error ? error : new Error(String(error));
  fatalMermaidRenderErrors.add(normalized);

  try {
    Object.defineProperty(normalized, TUI_MERMAID_FATAL_RENDER_ERROR, {
      value: true,
      configurable: true,
    });
  } catch {
    try {
      (normalized as TMermaidFatalRenderError)[TUI_MERMAID_FATAL_RENDER_ERROR] = true;
    } catch {}
  }
  return normalized;
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : "";
}

function errorCause(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  return (error as { cause?: unknown }).cause;
}

const PERMANENT_MERMAID_RENDER_ERROR_CODES = new Set([
  "VUE_TUI_MISSING_BEAUTIFUL_MERMAID",
  "VUE_TUI_INVALID_BEAUTIFUL_MERMAID_EXPORT",
  "VUE_TUI_MERMAID_RENDERER_SETUP",
  "VUE_TUI_MISSING_MERMAID_RENDERER",
]);

function hasErrorCode(
  error: unknown,
  codes: ReadonlySet<string>,
  seen = new WeakSet<object>(),
): boolean {
  if (!error || typeof error !== "object") return false;
  if (seen.has(error)) return false;
  seen.add(error);

  if (codes.has(errorCode(error))) return true;

  const cause = errorCause(error);
  return cause !== undefined && hasErrorCode(cause, codes, seen);
}

function isMermaidRenderErrorFatal(error: unknown, seen = new WeakSet<object>()): boolean {
  if (!error || typeof error !== "object") return false;
  if (seen.has(error)) return false;
  seen.add(error);

  if (
    fatalMermaidRenderErrors.has(error) ||
    (error as TMermaidFatalRenderError)[TUI_MERMAID_FATAL_RENDER_ERROR] === true
  ) {
    return true;
  }

  const cause = errorCause(error);
  return cause !== undefined && isMermaidRenderErrorFatal(cause, seen);
}

function isPermanentMermaidRenderError(error: unknown): boolean {
  return (
    isMermaidRenderErrorFatal(error) || hasErrorCode(error, PERMANENT_MERMAID_RENDER_ERROR_CODES)
  );
}

function splitRenderedOutput(value: string): readonly string[] {
  const normalized = sanitizeTextBlock(
    stripTerminalEscapes(String(value ?? "")).replace(/\r\n?/g, "\n"),
  );
  const lines = normalized.split("\n");
  return lines.length ? lines : [""];
}

function hasRenderedOutput(value: readonly string[]): boolean {
  return value.length > 1 || Boolean(value[0]);
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
  final: { type: Boolean, default: true },
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
  isTransientError: {
    type: Function as PropType<TMermaidTransientErrorClassifier>,
    default: undefined,
  },
  loadingText: {
    type: String,
    default: "Rendering Mermaid diagram...",
  },
  incompleteText: {
    type: String,
    default: "Waiting for complete Mermaid diagram...",
  },
  missingDependencyText: {
    type: String,
    default:
      "Install the Mermaid renderer package and use TMermaidText from @simon_he/vue-tui/mermaid or @simon_he/vue-tui/agent/mermaid, or pass a renderer prop.",
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
    const missingRenderer = shallowRef(false);
    const lines = shallowRef<readonly string[]>(markRaw([""]));
    const documentVersion = shallowRef(0);

    let builtOnce = false;
    let renderVersion = 0;
    let alive = true;
    const frameTaskId = `TMermaidText:${instance?.uid ?? "unknown"}:mermaid`;

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

    function shouldTreatRenderErrorAsTransient(err: unknown, code: string): boolean {
      if (!props.streaming || props.final || isPermanentMermaidRenderError(err)) return false;

      const context: TMermaidTransientErrorContext = {
        code,
        final: props.final,
        streaming: props.streaming,
      };

      if (!props.isTransientError) return true;

      try {
        return props.isTransientError(err, context);
      } catch {
        return false;
      }
    }

    async function renderNow(version: number): Promise<void> {
      const code = source.value;
      if (!code.trim()) {
        if (!alive || version !== renderVersion) return;
        lines.value = markRaw([""]);
        status.value = "ready";
        error.value = "";
        missingRenderer.value = false;
        bump();
        return;
      }

      status.value = "loading";
      error.value = "";
      missingRenderer.value = false;
      bump();

      try {
        const renderer = props.renderer;
        if (!renderer) {
          if (!alive || version !== renderVersion) return;
          lines.value = markRaw([""]);
          missingRenderer.value = true;
          status.value = "error";
          bump();
          return;
        }

        const rendered = await renderer(code, resolveAsciiOptions());
        if (!alive || version !== renderVersion) return;

        lines.value = markRaw(splitRenderedOutput(rendered));
        status.value = "ready";
        error.value = "";
        missingRenderer.value = false;
        bump();
      } catch (err) {
        if (!alive || version !== renderVersion) return;
        missingRenderer.value = false;
        error.value = errorMessage(err);

        if (shouldTreatRenderErrorAsTransient(err, code)) {
          status.value = hasRenderedOutput(lines.value) ? "ready" : "incomplete";
          bump();
          return;
        }

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

      const accepted = scheduler.queueFrameTask({
        id: frameTaskId,
        reason: "stream",
        priority: "low",
        sync: false,
        run: () => {
          if (!alive) return;
          if (version !== renderVersion) return;
          void renderNow(version);
        },
      });
      if (accepted === false) {
        void renderNow(version);
      }
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
        () => props.streaming,
        () => props.final,
        () => props.isTransientError,
      ],
      () => {
        scheduleRender();
      },
      { immediate: true, deep: true },
    );

    onBeforeUnmount(() => {
      alive = false;
      renderVersion++;
      scheduler.cancelFrameTask?.(frameTaskId);
    });

    const showingInitialLoadingText = computed(
      () => status.value === "loading" && lines.value.length <= 1 && !lines.value[0],
    );

    const displayLines = computed<readonly string[]>(() => {
      if (status.value === "error") {
        const detailText = missingRenderer.value ? props.missingDependencyText : error.value;
        const detail = props.showErrorDetails && detailText ? `: ${detailText}` : "";
        return splitRenderedOutput(`${props.errorText}${detail}`);
      }
      if (status.value === "incomplete") {
        return splitRenderedOutput(props.incompleteText);
      }
      if (showingInitialLoadingText.value) {
        return splitRenderedOutput(props.loadingText);
      }
      return lines.value.length ? lines.value : [""];
    });

    const currentStyle = computed<Style>(() => {
      if (status.value === "error") {
        return props.errorStyle ?? props.style ?? defaultStyle.value;
      }
      if (status.value === "incomplete") {
        return props.loadingStyle ?? props.style ?? defaultStyle.value;
      }
      if (showingInitialLoadingText.value) {
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
        displayLines.value,
        currentStyle.value,
        props.clear,
        status.value,
        error.value,
        documentVersion.value,
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
