import type { ExtractPublicPropTypes, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type {
  Rect,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  markRaw,
  onBeforeUnmount,
  shallowRef,
  watch,
} from "vue";
import { EventZIndexContextKey } from "../context.js";
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
const DEFAULT_MERMAID_RENDER_TIMEOUT_MS = 2500;
const DEFAULT_MERMAID_MAX_RENDER_SOURCE_CHARS = 20_000;
const DEFAULT_MERMAID_MAX_RENDER_SOURCE_LINES = 400;
const DEFAULT_MERMAID_COPIED_DURATION_MS = 1200;

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

function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function countLinesUpTo(value: string, max: number): number {
  if (max <= 0) return 0;

  let lines = 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) !== 10) continue;
    lines++;
    if (lines > max) return lines;
  }
  return lines;
}

function timeoutError(ms: number): Error & { code: string } {
  const error = new Error(`Mermaid render timed out after ${ms}ms`) as Error & { code: string };
  error.code = "VUE_TUI_MERMAID_RENDER_TIMEOUT";
  return error;
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
  renderTimeoutMs: { type: Number, default: DEFAULT_MERMAID_RENDER_TIMEOUT_MS },
  maxRenderSourceChars: { type: Number, default: DEFAULT_MERMAID_MAX_RENDER_SOURCE_CHARS },
  maxRenderSourceLines: { type: Number, default: DEFAULT_MERMAID_MAX_RENDER_SOURCE_LINES },
  copiedDurationMs: { type: Number, default: DEFAULT_MERMAID_COPIED_DURATION_MS },
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
    const terminalContext = useTerminal();
    const { terminal, defaultStyle, scheduler, widthProvider } = terminalContext;
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);

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
    let copiedTimer: ReturnType<typeof setTimeout> | null = null;
    let copyRequestVersion = 0;

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

    function clearCopiedTimer(): void {
      if (copiedTimer == null) return;
      clearTimeout(copiedTimer);
      copiedTimer = null;
    }

    function setCopied(next: boolean, repaint = true): void {
      if (!next) clearCopiedTimer();
      if (copied.value === next) return;
      copied.value = next;
      if (repaint) bump();
    }

    function resetCopyFeedback(repaint = true): void {
      copyRequestVersion++;
      setCopied(false, repaint);
    }

    function showCopiedFeedback(): void {
      clearCopiedTimer();

      const duration = normalizeNonNegativeInt(
        props.copiedDurationMs,
        DEFAULT_MERMAID_COPIED_DURATION_MS,
      );
      if (duration <= 0) {
        setCopied(false);
        return;
      }

      setCopied(true);
      copiedTimer = setTimeout(() => {
        copiedTimer = null;
        if (!alive) return;
        setCopied(false);
      }, duration);
    }

    function shouldSkipRenderForSize(code: string): boolean {
      const maxChars = normalizeNonNegativeInt(
        props.maxRenderSourceChars,
        DEFAULT_MERMAID_MAX_RENDER_SOURCE_CHARS,
      );
      if (maxChars > 0 && code.length > maxChars) return true;

      const maxLines = normalizeNonNegativeInt(
        props.maxRenderSourceLines,
        DEFAULT_MERMAID_MAX_RENDER_SOURCE_LINES,
      );
      if (maxLines > 0 && countLinesUpTo(code, maxLines) > maxLines) return true;

      return false;
    }

    async function renderWithTimeout(
      renderer: TMermaidRenderer,
      code: string,
      options: TMermaidResolvedAsciiOptions,
    ): Promise<string> {
      const timeoutMs = normalizeNonNegativeInt(
        props.renderTimeoutMs,
        DEFAULT_MERMAID_RENDER_TIMEOUT_MS,
      );
      if (timeoutMs <= 0) return await renderer(code, options);

      let timer: ReturnType<typeof setTimeout> | null = null;

      try {
        return await Promise.race([
          Promise.resolve().then(() => renderer(code, options)),
          new Promise<string>((_resolve, reject) => {
            timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
          }),
        ]);
      } finally {
        if (timer != null) clearTimeout(timer);
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

      if (shouldSkipRenderForSize(code)) {
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

        const rendered = await renderWithTimeout(renderer, code, resolveAsciiOptions());
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
      resetCopyFeedback(false);

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
        () => props.renderTimeoutMs,
        () => props.maxRenderSourceChars,
        () => props.maxRenderSourceLines,
      ],
      () => {
        scheduleRender();
      },
      { immediate: true, deep: true },
    );

    onBeforeUnmount(() => {
      alive = false;
      renderVersion++;
      clearCopiedTimer();
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

    const fullHeight = computed(() => {
      const autoContentHeight = Math.max(1, displayLines.value.length);
      const autoHeight = hasBox.value ? autoContentHeight + 2 : autoContentHeight;
      return Math.max(1, Math.floor(props.h ?? autoHeight));
    });

    const fullRect = computed<Rect>(() => {
      return translateRect(
        { x: props.x, y: props.y, w: props.w, h: fullHeight.value },
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

    function cellWidth(value: string): number {
      return withTextWidthProvider(widthProvider, () => textCellWidth(value));
    }

    function sliceCells(text: string, maxCells: number): string {
      return withTextWidthProvider(widthProvider, () => sliceByCells(text, maxCells));
    }

    function sliceCellsRange(text: string, startCells: number, endCells: number): string {
      return withTextWidthProvider(widthProvider, () =>
        sliceByCellsRange(text, startCells, endCells),
      );
    }

    function padCells(text: string, width: number): string {
      return withTextWidthProvider(widthProvider, () => padEndByCells(text, width));
    }

    type HeaderSegment = Readonly<{
      text: string;
      start: number;
      cells: number;
    }>;

    function canDrawBox(width: number, height: number): boolean {
      return hasBox.value && Math.floor(width) >= 2 && Math.floor(height) >= 2;
    }

    function segmentCells(text: string): number {
      return cellWidth(text);
    }

    function headerCopySegment(width: number): HeaderSegment | null {
      if (!hasBox.value || !props.copyButton) return null;

      const rowWidth = Math.max(0, Math.floor(width));
      if (rowWidth < 4) return null;

      const label = sanitizeInlineText(copyLabel.value);
      if (!label) return null;

      const maxCells = Math.max(0, rowWidth - 2);
      const text = sliceCells(` ${label} `, maxCells);
      const cells = segmentCells(text);
      if (!text || cells <= 0) return null;

      return {
        text,
        start: Math.max(1, rowWidth - cells - 1),
        cells,
      };
    }

    function headerTitleSegment(width: number, copy: HeaderSegment | null): HeaderSegment | null {
      if (!hasBox.value) return null;

      const rowWidth = Math.max(0, Math.floor(width));
      if (rowWidth < 4) return null;

      const title = sanitizeInlineText(props.title);
      if (!title) return null;

      const titleStart = 1;
      const titleEnd = copy ? Math.max(titleStart, copy.start - 1) : rowWidth - 1;
      const maxCells = Math.max(0, titleEnd - titleStart);
      if (maxCells <= 0) return null;

      const text = sliceCells(` ${title} `, maxCells);
      const cells = segmentCells(text);
      if (!text || cells <= 0) return null;

      return {
        text,
        start: titleStart,
        cells,
      };
    }

    const copyHitRect = computed<Rect>(() => {
      const full = fullRect.value;
      if (!visible.value || !props.copyButton || !canDrawBox(full.w, full.h)) {
        return { x: 0, y: 0, w: 0, h: 0 };
      }

      const copy = headerCopySegment(Math.max(0, Math.floor(full.w)));
      if (!copy) return { x: 0, y: 0, w: 0, h: 0 };

      const raw = {
        x: Math.floor(full.x) + copy.start,
        y: Math.floor(full.y),
        w: copy.cells,
        h: 1,
      };

      if (!layout.clipRect) return raw;
      return intersectRect(raw, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    async function writeClipboardText(text: string): Promise<void> {
      const contextClipboard = terminalContext.clipboard;

      if (contextClipboard) {
        if (!contextClipboard.supported) {
          throw new Error("Clipboard not available in this runtime");
        }
        await contextClipboard.writeText(text);
        return;
      }

      const navClipboard = (globalThis as any).navigator?.clipboard;
      if (navClipboard && typeof navClipboard.writeText === "function") {
        await navClipboard.writeText(text);
        return;
      }

      throw new Error("Clipboard not available");
    }

    async function copySource(): Promise<void> {
      const text = source.value;
      const requestVersion = ++copyRequestVersion;
      let ok = false;
      let copyError: unknown;

      try {
        await writeClipboardText(text);
        ok = true;
      } catch (err) {
        copyError = err;
      }

      if (!alive) return;
      const isLatestForCurrentSource =
        requestVersion === copyRequestVersion && source.value === text;
      if (isLatestForCurrentSource) {
        if (ok) showCopiedFeedback();
        else setCopied(false);
      }
      emit("copy", ok ? { text, ok } : { text, ok, error: copyError });
    }

    function onCopyClick(event: TerminalPointerEvent): void {
      event.preventDefault();
      event.stopPropagation();
      void copySource();
    }

    function onCopyKeydown(event: TerminalKeyboardEvent): void {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      void copySource();
    }

    const copyNodeActive = computed(
      () => visible.value && props.copyButton && copyHitRect.value.w > 0 && copyHitRect.value.h > 0,
    );

    useTerminalNode(() => ({
      rect: copyHitRect.value,
      zIndex: (parentEventZ.value ?? 0) + props.zIndex + 1,
      visible: copyNodeActive.value,
      focusable: copyNodeActive.value,
      selectable: false,
      handlers: copyNodeActive.value
        ? {
            click: onCopyClick,
            keydown: onCopyKeydown,
          }
        : {},
    }));

    function overlayCells(row: string, segment: HeaderSegment, width: number): string {
      const rowWidth = Math.max(0, Math.floor(width));
      const start = Math.max(0, Math.floor(segment.start));
      if (rowWidth <= 1 || start >= rowWidth - 1 || segment.cells <= 0) return row;

      const maxCells = Math.max(0, rowWidth - 1 - start);
      const text = sliceCells(segment.text, maxCells);
      const cells = segmentCells(text);
      if (!text || cells <= 0) return row;

      return `${sliceCells(row, start)}${text}${sliceCellsRange(row, start + cells, rowWidth)}`;
    }

    function contentLine(rowIndex: number, width: number, pad: boolean): string {
      const src = displayLines.value[rowIndex] ?? "";
      const clipped = sliceCells(src, width);
      return pad ? padCells(clipped, width) : clipped;
    }

    function boxRow(rowIndex: number, width: number, height: number): string {
      const rowWidth = Math.max(0, Math.floor(width));
      const rowHeight = Math.max(0, Math.floor(height));

      if (!canDrawBox(rowWidth, rowHeight)) {
        return contentLine(rowIndex, rowWidth, props.clear);
      }

      const innerW = Math.max(0, rowWidth - 2);
      if (rowIndex === 0) {
        let row = `┌${repeatChar("─", innerW)}┐`;
        const copy = headerCopySegment(rowWidth);
        const title = headerTitleSegment(rowWidth, copy);

        if (title) row = overlayCells(row, title, rowWidth);
        if (copy) row = overlayCells(row, copy, rowWidth);

        return row;
      }

      if (rowIndex === rowHeight - 1) return `└${repeatChar("─", innerW)}┘`;

      return `│${contentLine(rowIndex - 1, innerW, true)}│`;
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
            const clipped = dx > 0 ? sliceCellsRange(src, dx, dx + r.w) : sliceCells(src, r.w);
            const value = props.clear ? padCells(clipped, r.w) : clipped;
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
