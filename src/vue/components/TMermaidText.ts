import type { ExtractPublicPropTypes, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalPointerEvent } from "../../events/manager/types.js";
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
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useVisibility } from "../composables/use-visibility.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  padEndByCells,
  repeatChar,
  sanitizeInlineText,
  sanitizeTextBlock,
  sliceByCells,
  sliceByCellsRange,
  spaces,
  textCellWidth,
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

type TMermaidRenderSnapshot = Readonly<{
  source: string;
  lines: readonly string[];
}>;

export type TMermaidCopyPayload = Readonly<{
  text: string;
  ok: boolean;
  error?: unknown;
}>;

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

function hasVisibleRenderedOutput(value: readonly string[]): boolean {
  return value.some((line) => line.trim().length > 0);
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
  box: { type: Boolean, default: true },
  title: { type: String, default: "mermaid" },
  copyButton: { type: Boolean, default: true },
  copyText: { type: String, default: "copy" },
  copiedText: { type: String, default: "copied" },
} as const;

export type TMermaidTextProps = ExtractPublicPropTypes<typeof tMermaidTextProps>;

export const TMermaidText = defineComponent({
  name: "TMermaidText",
  props: tMermaidTextProps,
  emits: {
    copy: (_payload: TMermaidCopyPayload) => true,
  },
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    const { terminal, defaultStyle, scheduler, widthProvider } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();

    const status = shallowRef<TMermaidStatus>("idle");
    const error = shallowRef("");
    const missingRenderer = shallowRef(false);
    const renderedSnapshot = shallowRef<TMermaidRenderSnapshot | null>(null);
    const documentVersion = shallowRef(0);
    const copied = shallowRef(false);

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
        renderedSnapshot.value = null;
        status.value = "idle";
        error.value = "";
        missingRenderer.value = false;
        bump();
        return;
      }

      if (props.streaming && !props.final) {
        if (!alive || version !== renderVersion) return;
        renderedSnapshot.value = null;
        status.value = "idle";
        error.value = "";
        missingRenderer.value = false;
        bump();
        return;
      }

      renderedSnapshot.value = null;
      status.value = "loading";
      error.value = "";
      missingRenderer.value = false;
      bump();

      try {
        const renderer = props.renderer;
        if (!renderer) {
          if (!alive || version !== renderVersion) return;
          renderedSnapshot.value = null;
          missingRenderer.value = true;
          status.value = "error";
          bump();
          return;
        }

        const rendered = await renderer(code, resolveAsciiOptions());
        if (!alive || version !== renderVersion) return;

        const renderedLines = splitRenderedOutput(rendered);
        if (hasVisibleRenderedOutput(renderedLines)) {
          renderedSnapshot.value = markRaw({
            source: code,
            lines: markRaw(renderedLines),
          });
          status.value = "ready";
          error.value = "";
          missingRenderer.value = false;
          bump();
          return;
        }

        renderedSnapshot.value = null;
        status.value = "error";
        error.value = "";
        missingRenderer.value = false;
        bump();
      } catch (err) {
        if (!alive || version !== renderVersion) return;
        renderedSnapshot.value = null;
        missingRenderer.value = false;
        error.value = errorMessage(err);

        if (shouldTreatRenderErrorAsTransient(err, code)) {
          status.value = "incomplete";
          bump();
          return;
        }

        status.value = "error";
        bump();
      }
    }

    function scheduleRender(): void {
      const version = ++renderVersion;
      copied.value = false;

      if (props.streaming && !props.final) {
        builtOnce = true;
        scheduler.cancelFrameTask?.(frameTaskId);
        renderedSnapshot.value = null;
        status.value = "idle";
        error.value = "";
        missingRenderer.value = false;
        bump();
        return;
      }

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

    const hasBox = computed(() => props.box !== false);

    const sourceLines = computed<readonly string[]>(() => splitRenderedOutput(source.value));

    const displayLines = computed<readonly string[]>(() => {
      const snapshot = renderedSnapshot.value;
      if (
        snapshot &&
        snapshot.source === source.value &&
        hasVisibleRenderedOutput(snapshot.lines)
      ) {
        return snapshot.lines;
      }
      return sourceLines.value;
    });

    const currentStyle = computed<Style>(() => {
      return props.style ?? defaultStyle.value;
    });

    const contentHeight = computed(() => {
      return Math.max(1, props.h ?? displayLines.value.length);
    });

    const fullRect = computed<Rect>(() => {
      const height = hasBox.value ? contentHeight.value + 2 : contentHeight.value;
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

    const copyLabel = computed(() => (copied.value ? props.copiedText : props.copyText));

    const copyHitRect = computed<Rect>(() => {
      if (!visible.value || !hasBox.value || !props.copyButton) return { x: 0, y: 0, w: 0, h: 0 };
      const full = fullRect.value;
      const fullW = Math.max(0, Math.floor(full.w));
      if (fullW < 4) return { x: 0, y: 0, w: 0, h: 0 };
      const labelWidth = textCellWidth(sanitizeInlineText(copyLabel.value));
      const hitWidth = Math.min(Math.max(0, fullW - 2), labelWidth + 2);
      if (hitWidth <= 0) return { x: 0, y: 0, w: 0, h: 0 };
      return {
        x: Math.floor(full.x) + Math.max(1, fullW - hitWidth - 1),
        y: Math.floor(full.y),
        w: hitWidth,
        h: 1,
      };
    });

    async function copySource(): Promise<void> {
      const text = source.value;
      let ok = false;
      let copyError: unknown;

      try {
        const clipboard = (globalThis as any).navigator?.clipboard;
        if (!clipboard || typeof clipboard.writeText !== "function") {
          throw new Error("Clipboard not available");
        }
        await clipboard.writeText(text);
        ok = true;
      } catch (err) {
        copyError = err;
      }

      copied.value = ok;
      bump();
      emit("copy", ok ? { text, ok } : { text, ok, error: copyError });
    }

    function onCopyClick(event: TerminalPointerEvent): void {
      event.preventDefault();
      event.stopPropagation();
      void copySource();
    }

    useTerminalNode(() => ({
      rect: copyHitRect.value,
      zIndex: props.zIndex + 1,
      visible: visible.value && hasBox.value && props.copyButton && copyHitRect.value.w > 0,
      focusable: false,
      handlers: {
        click: onCopyClick,
      },
    }));

    function overlayCells(row: string, text: string, start: number, width: number): string {
      if (width <= 0 || start >= width) return row;
      const clipped = sliceByCells(text, Math.max(0, width - start));
      if (!clipped) return row;
      return `${sliceByCells(row, start)}${clipped}${sliceByCellsRange(row, start + textCellWidth(clipped), width)}`;
    }

    function contentLine(rowIndex: number, width: number): string {
      const src = displayLines.value[rowIndex] ?? "";
      return padEndByCells(sliceByCells(src, width), width);
    }

    function boxRow(rowIndex: number, width: number, height: number): string {
      if (!hasBox.value || width < 2 || height < 2) {
        return contentLine(rowIndex, width);
      }

      const innerW = Math.max(0, width - 2);
      if (rowIndex === 0) {
        let row = `┌${repeatChar("─", innerW)}┐`;
        const title = sanitizeInlineText(props.title);
        if (title) row = overlayCells(row, ` ${title} `, 1, width);
        if (props.copyButton) {
          const label = sanitizeInlineText(copyLabel.value);
          if (label) {
            const copy = ` ${label} `;
            const start = Math.max(1, width - textCellWidth(copy) - 1);
            row = overlayCells(row, copy, start, width);
          }
        }
        return row;
      }

      if (rowIndex === height - 1) return `└${repeatChar("─", innerW)}┘`;

      return `│${contentLine(rowIndex - 1, innerW)}│`;
    }

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
        missingRenderer.value,
        renderedSnapshot.value,
        hasBox.value,
        props.title,
        props.copyButton,
        copyLabel.value,
        documentVersion.value,
      ],
      paint: (dirtyRows) => {
        withTextWidthProvider(widthProvider, () => {
          if (!visible.value) return;

          const r = absRect.value;
          const full = fullRect.value;
          if (r.w <= 0 || r.h <= 0) return;

          const style = currentStyle.value;
          const dx = Math.max(0, Math.floor(r.x - full.x));
          const fullY = Math.floor(full.y);
          const fullW = Math.max(0, Math.floor(full.w));
          const fullH = Math.max(0, Math.floor(full.h));
          const blank = props.clear ? spaces(r.w) : "";

          const paintRow = (y: number) => {
            if (y < r.y || y >= r.y + r.h) return;

            const rowIndex = y - fullY;
            if (rowIndex < 0 || rowIndex >= fullH) {
              if (props.clear) terminal.write(blank, { x: r.x, y, style });
              return;
            }

            const src = boxRow(rowIndex, fullW, fullH);
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
