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
import type {
  TMermaidAsciiOptions,
  TMermaidRenderEligibility,
  TMermaidRenderer,
  TMermaidResolvedAsciiOptions,
} from "./TMermaidText.js";
import { getPlaneTerminal, getRootTerminal } from "../../core/terminal/create-terminal.js";
import { EventZIndexContextKey } from "../context.js";
import {
  createTerminalGraphicPngSequence,
  getTerminalGraphicsOutput,
  getTerminalGraphicsOutputVersion,
  stableTerminalGraphicNumericId,
  subscribeTerminalGraphicsOutput,
  suspendTerminalGraphics,
} from "../../renderer/terminal-graphics.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useRenderStack } from "../composables/use-render-stack.js";
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
import {
  getCachedMermaidImage,
  getMermaidImage,
  isMermaidImageRendererReady,
  loadMermaidImageRenderer,
  normalizeMermaidImageOptions,
  resolveMermaidImageColor,
  subscribeMermaidImage,
  type TuiMermaidImageCells,
  type TuiMermaidImageOptions,
  type TuiMermaidImageRasterizer,
} from "../mermaid/mermaid-image.js";

export type TMermaidImageCopyPayload = Readonly<{
  text: string;
  ok: boolean;
  error?: unknown;
}>;

export type TMermaidImagePreviewPayload = Readonly<{
  text: string;
  open: boolean;
}>;

type TMermaidImageBoxChars = Readonly<{
  tl: string;
  tr: string;
  bl: string;
  br: string;
  h: string;
  v: string;
}>;

type TMermaidImageFit = Readonly<{
  displayW: number;
  displayH: number;
}>;

/** Accepted ANSI text output for a specific source + renderer signature. */
type TMermaidImageTextSnapshot = Readonly<{
  source: string;
  signature: string;
  lines: readonly string[];
}>;

const UNICODE_MERMAID_IMAGE_BOX_CHARS: TMermaidImageBoxChars = Object.freeze({
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  h: "─",
  v: "│",
});

const ASCII_MERMAID_IMAGE_BOX_CHARS: TMermaidImageBoxChars = Object.freeze({
  tl: "+",
  tr: "+",
  bl: "+",
  br: "+",
  h: "-",
  v: "|",
});

const DEFAULT_MERMAID_IMAGE_COPIED_DURATION_MS = 1200;
const DEFAULT_MERMAID_IMAGE_MAX_RENDER_SOURCE_CHARS = 20_000;
const DEFAULT_MERMAID_IMAGE_MAX_RENDER_SOURCE_LINES = 400;
const MERMAID_PREVIEW_Z = 50_000;
const MERMAID_PREVIEW_TITLE = "mermaid preview";
const MERMAID_PREVIEW_HINT = "esc / click close";
// Only one mermaid lightbox may own a terminal at a time. Other instances use
// this to clear their inline image and skip re-queueing it behind the overlay.
const activeMermaidPreviewOwners = new WeakMap<object, symbol>();

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

function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function countLinesUpTo(value: string, max: number): number {
  if (max <= 0) return 0;

  let lines = 1;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code !== 10 && code !== 13) continue;

    lines++;

    if (code === 13 && value.charCodeAt(index + 1) === 10) {
      index++;
    }

    if (lines > max) return lines;
  }

  return lines;
}

function splitRenderedOutput(value: string): readonly string[] {
  const normalized = sanitizeTextBlock(
    stripTerminalEscapes(String(value ?? "")).replace(/\r\n?/g, "\n"),
  );
  const lines = normalized.split("\n");
  return lines.length ? lines : [""];
}

function fitImageCells(
  cells: TuiMermaidImageCells,
  maxW: number,
  maxH: number,
): TMermaidImageFit | null {
  if (maxW <= 0 || maxH <= 0) return null;
  let w = Math.max(1, Math.floor(cells.widthCells));
  let h = Math.max(1, Math.floor(cells.heightCells));
  if (w > maxW) {
    h = Math.max(1, Math.round((h * maxW) / w));
    w = maxW;
  }
  if (h > maxH) {
    w = Math.max(1, Math.round((w * maxH) / h));
    h = maxH;
  }
  return { displayW: Math.max(1, w), displayH: Math.max(1, h) };
}

/**
 * Preview fit scales the image up as well as down, so a diagram that was
 * clamped to the message column still fills the lightbox viewport.
 */
function fitPreviewImageCells(
  cells: TuiMermaidImageCells,
  maxW: number,
  maxH: number,
): TMermaidImageFit | null {
  if (maxW <= 0 || maxH <= 0) return null;
  const baseW = Math.max(1, Math.floor(cells.widthCells));
  const baseH = Math.max(1, Math.floor(cells.heightCells));
  const scale = Math.min(maxW / baseW, maxH / baseH);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return {
    displayW: Math.max(1, Math.min(maxW, Math.floor(baseW * scale))),
    displayH: Math.max(1, Math.min(maxH, Math.floor(baseH * scale))),
  };
}

export const tMermaidImageProps = {
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  w: { type: Number, required: true },
  h: { type: Number, default: undefined },
  zIndex: { type: Number, default: 0 },
  content: { type: String, default: "" },
  code: { type: String, default: undefined },
  style: { type: Object as PropType<Style>, default: undefined },
  clear: { type: Boolean, default: true },
  final: { type: Boolean, default: true },
  streaming: { type: Boolean, default: false },
  // Image pipeline. Without a renderer the built-in lazy rasterizer
  // (beautiful-mermaid SVG + @resvg/resvg-js) is used; when graphics are
  // unsupported or the rasterizer is missing, the raw source is shown.
  renderer: {
    type: Function as PropType<TuiMermaidImageRasterizer>,
    default: undefined,
  },
  cellWidthPx: { type: Number, default: undefined },
  cellHeightPx: { type: Number, default: undefined },
  scale: { type: Number, default: undefined },
  bg: { type: String, default: undefined },
  fg: { type: String, default: undefined },
  maxWidthCells: { type: Number, default: undefined },
  maxHeightCells: { type: Number, default: undefined },
  padding: { type: Number, default: undefined },
  // Adaptive ANSI fallback. When the terminal has no graphics protocol (or the
  // image rasterizer fails for this source), the component renders the diagram
  // as ASCII text through a text renderer before falling back to the raw
  // source. Without a textRenderer the component stays image-or-raw.
  textRenderer: {
    type: Function as PropType<TMermaidRenderer>,
    default: undefined,
  },
  // Eligibility guard for the ANSI fallback; returning false keeps the raw
  // source visible (e.g. only render simple flowcharts as ASCII).
  shouldRenderSource: {
    type: Function as PropType<TMermaidRenderEligibility>,
    default: undefined,
  },
  // Spacing/theme options forwarded to the ANSI text renderer.
  textOptions: {
    type: Object as PropType<TMermaidAsciiOptions>,
    default: undefined,
  },
  // Box chrome (mirrors TMermaidText).
  box: { type: Boolean, default: true },
  title: { type: String, default: "mermaid" },
  copyButton: { type: Boolean, default: true },
  copyText: { type: String, default: "copy" },
  copiedText: { type: String, default: "copied" },
  copiedDurationMs: { type: Number, default: DEFAULT_MERMAID_IMAGE_COPIED_DURATION_MS },
  renderTimeoutMs: { type: Number, default: 0 },
  maxRenderSourceChars: { type: Number, default: DEFAULT_MERMAID_IMAGE_MAX_RENDER_SOURCE_CHARS },
  maxRenderSourceLines: { type: Number, default: DEFAULT_MERMAID_IMAGE_MAX_RENDER_SOURCE_LINES },
  // Clicking the diagram copies the raw source when no preview is available
  // (text fallback, or `previewOnClick: false`). When an image can preview,
  // `previewOnClick` takes precedence; the header copy button always copies.
  copyOnClick: { type: Boolean, default: true },
  // Image-mode click opens a terminal-wide lightbox. When the diagram is shown
  // as text (no graphics protocol), click keeps its copy-on-click behavior.
  previewOnClick: { type: Boolean, default: true },
  previewTitle: { type: String, default: MERMAID_PREVIEW_TITLE },
  previewHint: { type: String, default: MERMAID_PREVIEW_HINT },
  ascii: { type: Boolean, default: false },
  // Wheel zoom (Kitty graphics only): with the zoom modifier held, wheel over
  // the image zooms centered on the mouse, clamped to the container area.
  // Without the modifier the wheel passes through to the surrounding scroll
  // container (historical-message scrolling is never blocked). iTerm2 has no
  // in-place resize sequence, so zoom stays disabled there.
  zoomOnWheel: { type: Boolean, default: true },
  zoomModifier: {
    type: String as PropType<"meta" | "ctrl" | "metaCtrl" | "none">,
    default: "metaCtrl",
  },
  minZoom: { type: Number, default: 1 },
  maxZoom: { type: Number, default: 6 },
  zoomSensitivity: { type: Number, default: 0.002 },
} as const;

export type TMermaidImageProps = ExtractPublicPropTypes<typeof tMermaidImageProps>;

export const TMermaidImage = defineComponent({
  name: "TMermaidImage",
  props: tMermaidImageProps,
  emits: {
    copy: (_payload: TMermaidImageCopyPayload) => true,
    preview: (_payload: TMermaidImagePreviewPayload) => true,
  },
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    const terminalContext = useTerminal();
    const { terminal, defaultStyle, scheduler, widthProvider, render } = terminalContext;
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const renderStack = useRenderStack();
    let rootRenderStack = renderStack.value;
    while (rootRenderStack.parent) rootRenderStack = rootRenderStack.parent;
    // The lightbox must outrank every page stack, not only its own message
    // subtree: register it as a high-z child of the render root.
    const previewRenderStack = render.createStack(rootRenderStack, MERMAID_PREVIEW_Z);
    const previewTerminal = getPlaneTerminal(getRootTerminal(terminal), "overlay");
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const previewOwner = Symbol(`TMermaidImagePreview:${instance?.uid ?? "unknown"}`);

    const imageCells = shallowRef<TuiMermaidImageCells | null>(null);
    const textSnapshot = shallowRef<TMermaidImageTextSnapshot | null>(null);
    const zoomScale = shallowRef(1);
    const panX = shallowRef(0);
    const panY = shallowRef(0);
    const documentVersion = shallowRef(0);
    const copied = shallowRef(false);
    const previewOpen = shallowRef(false);
    const viewportVersion = shallowRef(0);

    type MermaidDragState = Readonly<{
      startX: number;
      startY: number;
      panStartX: number;
      panStartY: number;
    }>;
    let dragState: MermaidDragState | null = null;
    let dragMoved = false;
    let lastDragAt = 0;
    const DRAG_CLICK_SUPPRESS_MS = 250;

    let builtOnce = false;
    let renderVersion = 0;
    let alive = true;
    const frameTaskId = `TMermaidImage:${instance?.uid ?? "unknown"}:mermaid-image`;
    const uid = instance?.uid ?? 0;
    let copiedTimer: ReturnType<typeof setTimeout> | null = null;
    let copyRequestVersion = 0;
    let activeGraphicId: string | null = null;
    let activePreviewGraphicId: string | null = null;
    let releasePreviewGraphicsSuspension: (() => void) | null = null;
    let activeImageSignature = "";

    const source = computed(() => props.code ?? props.content ?? "");

    const waitingForStreamingSourceToFinish = computed(() => props.streaming && !props.final);

    const graphicsOutputVersion = shallowRef(getTerminalGraphicsOutputVersion(terminal));
    const graphicsOutput = computed(() => {
      // `getTerminalGraphicsOutput` reads a plain registry (not reactive);
      // depend on the version ref so this computed invalidates when a
      // graphics output is (un)registered.
      void graphicsOutputVersion.value;
      return getTerminalGraphicsOutput(terminal);
    });

    const graphicsProtocol = computed(() => {
      const output = graphicsOutput.value;
      if (!output?.capabilities.supported) return null;
      const protocol = output.capabilities.preferredProtocol;
      if (protocol === "kitty" || protocol === "iterm2") return protocol;
      return null;
    });

    function bump(): void {
      documentVersion.value++;
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
        DEFAULT_MERMAID_IMAGE_COPIED_DURATION_MS,
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

    function queueClearGraphic(): void {
      if (activeGraphicId == null) return;
      const id = activeGraphicId;
      activeGraphicId = null;
      try {
        graphicsOutput.value?.clear?.(id);
      } catch {
        // Best-effort cleanup; raw graphics must not affect text rendering.
      }
    }

    function clampZoom(zoom: number): number {
      const min = Number.isFinite(Number(props.minZoom))
        ? Math.max(0.05, Number(props.minZoom))
        : 1;
      const max = Number.isFinite(Number(props.maxZoom))
        ? Math.max(min, Number(props.maxZoom))
        : Math.max(min, 6);
      return Math.min(max, Math.max(min, zoom));
    }

    function zoomSensitivity(): number {
      const value = Number(props.zoomSensitivity);
      return Number.isFinite(value) && value > 0 ? value : 0.002;
    }

    /**
     * Wheel delta -> multiplicative zoom factor. Discrete notches (CLI wheel
     * reporting and browser line-mode deltas) map to one step each; trackpad
     * pixel deltas use a continuous exponential so small movements stay smooth.
     */
    function wheelZoomFactor(deltaY: number, deltaMode: number | undefined): number {
      const sign = deltaY > 0 ? -1 : 1;
      const sensitivity = zoomSensitivity();
      const abs = Math.abs(deltaY);
      const mode = deltaMode ?? 0;
      const isNotch = mode === 1 || (abs > 0 && abs <= 3 && Number.isInteger(deltaY));
      const magnitude = isNotch ? 100 : abs;
      return Math.exp(sign * magnitude * sensitivity);
    }

    function resetZoomState(): void {
      if (zoomScale.value === 1 && panX.value === 0 && panY.value === 0) return;
      zoomScale.value = 1;
      panX.value = 0;
      panY.value = 0;
      dragState = null;
    }

    function hasZoomModifier(event: TerminalPointerEvent): boolean {
      const modifier = props.zoomModifier ?? "metaCtrl";
      if (modifier === "none") return true;
      if (modifier === "meta") return event.metaKey === true;
      if (modifier === "ctrl") return event.ctrlKey === true;
      return event.ctrlKey === true || event.metaKey === true;
    }

    /**
     * Clamp the pan so the zoomed image always covers the container area
     * (no empty gaps, no over-scroll beyond the image edges).
     */
    function clampPan(): void {
      const inner = innerRectFrom(fullRect.value);
      const fit = displayFit.value;
      if (!fit || inner.w <= 0 || inner.h <= 0) return;

      const zoom = clampZoom(zoomScale.value);
      const fullW = fit.displayW * zoom;
      const fullH = fit.displayH * zoom;
      const fitOriginX =
        inner.x + (inner.w > fit.displayW ? Math.floor((inner.w - fit.displayW) / 2) : 0);

      let nextX = panX.value;
      let nextY = panY.value;
      if (fullW <= inner.w) {
        nextX = 0;
      } else {
        nextX = Math.min(
          inner.x - fitOriginX,
          Math.max(inner.x + inner.w - fullW - fitOriginX, nextX),
        );
      }
      if (fullH <= inner.h) {
        nextY = 0;
      } else {
        nextY = Math.min(0, Math.max(inner.h - fullH, nextY));
      }
      if (nextX !== panX.value) panX.value = nextX;
      if (nextY !== panY.value) panY.value = nextY;
    }

    /** Set the current image, resetting wheel zoom whenever the PNG changes. */
    function setImageCells(cells: TuiMermaidImageCells | null): void {
      const signature = cells ? cells.base64 : "";
      if (signature !== activeImageSignature) {
        activeImageSignature = signature;
        resetZoomState();
      }
      imageCells.value = cells;
    }

    const hasBox = computed(() => props.box !== false);

    const normalizedWidth = computed(() => {
      const width = Math.floor(Number(props.w));
      return Number.isFinite(width) ? Math.max(0, width) : 0;
    });

    const reservesBoxRows = computed(() => hasBox.value && normalizedWidth.value >= 2);

    const boxChars = computed<TMermaidImageBoxChars>(() =>
      props.ascii ? ASCII_MERMAID_IMAGE_BOX_CHARS : UNICODE_MERMAID_IMAGE_BOX_CHARS,
    );

    const sourceLines = computed<readonly string[]>(() => splitRenderedOutput(source.value));

    const displayLines = computed<readonly string[]>(() => {
      const snapshot = textSnapshot.value;
      if (snapshot && snapshot.source === source.value && hasVisibleTextOutput(snapshot.lines)) {
        return snapshot.lines;
      }
      return sourceLines.value;
    });

    const currentStyle = computed<Style>(() => props.style ?? defaultStyle.value);

    const innerWidth = computed(() => {
      const w = normalizedWidth.value;
      return reservesBoxRows.value ? Math.max(0, w - 2) : w;
    });

    const fixedInnerHeight = computed(() => {
      if (props.h == null) return 0;
      const h = Math.floor(Number(props.h));
      if (!Number.isFinite(h)) return 0;
      const value = Math.max(0, h);
      return reservesBoxRows.value ? Math.max(0, value - 2) : value;
    });

    const autoHeight = computed(() => props.h == null);

    const displayFit = computed<TMermaidImageFit | null>(() => {
      const cells = imageCells.value;
      if (!cells) return null;
      if (autoHeight.value) {
        return fitImageCells(cells, innerWidth.value, Number.MAX_SAFE_INTEGER);
      }
      return fitImageCells(cells, innerWidth.value, fixedInnerHeight.value);
    });

    const contentHeight = computed(() => {
      if (!autoHeight.value) return fixedInnerHeight.value;
      return displayFit.value?.displayH ?? Math.max(1, displayLines.value.length);
    });

    const fullHeight = computed(() => {
      if (props.h != null) {
        const h = Math.floor(Number(props.h));
        return Number.isFinite(h) ? Math.max(0, h) : 0;
      }
      return reservesBoxRows.value ? contentHeight.value + 2 : contentHeight.value;
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

    const previewViewport = computed<Rect>(() => {
      void viewportVersion.value;
      const size = terminal.size();
      return {
        x: 0,
        y: 0,
        w: Math.max(0, Math.floor(size.cols)),
        h: Math.max(0, Math.floor(size.rows)),
      };
    });

    const previewFrame = computed<Rect>(() => {
      const viewport = previewViewport.value;
      return { x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h };
    });

    const previewContentRect = computed<Rect>(() => {
      const frame = previewFrame.value;
      if (frame.w < 4 || frame.h < 3) return frame;
      const border = 1;
      return {
        x: frame.x + border,
        y: frame.y + border,
        w: Math.max(0, frame.w - border * 2),
        h: Math.max(0, frame.h - border * 2),
      };
    });

    const previewImageFit = computed<TMermaidImageFit | null>(() => {
      const cells = imageCells.value;
      if (!cells) return null;
      return fitPreviewImageCells(cells, previewContentRect.value.w, previewContentRect.value.h);
    });

    const previewAvailable = computed(
      () =>
        props.previewOnClick !== false &&
        imageCells.value != null &&
        displayFit.value != null &&
        graphicsProtocol.value != null,
    );

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

    function resolveImageOptions(): ReturnType<typeof normalizeMermaidImageOptions> {
      const resolvedFg = props.fg ?? resolveMermaidImageColor(currentStyle.value.fg) ?? undefined;
      return normalizeMermaidImageOptions({
        cellWidthPx: props.cellWidthPx,
        cellHeightPx: props.cellHeightPx,
        scale: props.scale,
        bg: props.bg,
        fg: resolvedFg,
        maxWidthCells: props.maxWidthCells,
        maxHeightCells: props.maxHeightCells,
        padding: props.padding,
      });
    }

    function hasVisibleTextOutput(lines: readonly string[]): boolean {
      return lines.some((line) => line.trim().length > 0);
    }

    function resolveTextOptions(): TMermaidResolvedAsciiOptions {
      const base = props.textOptions ?? {};
      return {
        ...base,
        useAscii: props.ascii,
        colorMode: "none",
      };
    }

    function textRenderSignature(code: string): string {
      return [
        code,
        props.ascii ? "a" : "",
        JSON.stringify(props.textOptions ?? null),
        props.textRenderer != null ? "r" : "",
        props.shouldRenderSource != null ? "g" : "",
      ].join("\x1F");
    }

    async function renderTextWithTimeout(
      renderer: TMermaidRenderer,
      code: string,
      options: TMermaidResolvedAsciiOptions,
    ): Promise<string> {
      const timeoutMs = normalizeNonNegativeInt(props.renderTimeoutMs, 0);
      if (timeoutMs <= 0) return await renderer(code, options);

      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          Promise.resolve().then(() => renderer(code, options)),
          new Promise<string>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Mermaid text render timeout")), timeoutMs);
          }),
        ]);
      } finally {
        if (timer != null) clearTimeout(timer);
      }
    }

    async function runCustomRasterizer(
      code: string,
      options: Required<TuiMermaidImageOptions>,
    ): Promise<TuiMermaidImageCells | null> {
      const renderer = props.renderer;
      if (!renderer) return null;
      const timeoutMs = normalizeNonNegativeInt(props.renderTimeoutMs, 0);
      const run = () => renderer(code, options);
      if (timeoutMs <= 0) return (await run()) ?? null;

      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return (
          (await Promise.race([
            run(),
            new Promise<TuiMermaidImageCells | null>((resolve) => {
              timer = setTimeout(() => resolve(null), timeoutMs);
            }),
          ])) ?? null
        );
      } finally {
        if (timer != null) clearTimeout(timer);
      }
    }

    function shouldSkipRenderForSize(code: string): boolean {
      const maxChars = normalizeNonNegativeInt(
        props.maxRenderSourceChars,
        DEFAULT_MERMAID_IMAGE_MAX_RENDER_SOURCE_CHARS,
      );
      if (maxChars > 0 && code.length > maxChars) return true;

      const maxLines = normalizeNonNegativeInt(
        props.maxRenderSourceLines,
        DEFAULT_MERMAID_IMAGE_MAX_RENDER_SOURCE_LINES,
      );
      if (maxLines > 0 && countLinesUpTo(code, maxLines) > maxLines) return true;

      return false;
    }

    async function rasterizeWithTimeout(
      code: string,
      options: TuiMermaidImageOptions,
    ): Promise<TuiMermaidImageCells | null> {
      const timeoutMs = normalizeNonNegativeInt(props.renderTimeoutMs, 0);
      if (timeoutMs <= 0) return await getMermaidImage(code, options);

      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          getMermaidImage(code, options),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), timeoutMs);
          }),
        ]);
      } finally {
        if (timer != null) clearTimeout(timer);
      }
    }

    async function renderTextFallback(version: number): Promise<void> {
      const code = source.value;
      const renderer = props.textRenderer;
      if (!renderer) return;

      const guard = props.shouldRenderSource;
      if (guard) {
        let eligible = false;
        try {
          eligible = guard(code, { final: props.final, streaming: props.streaming });
        } catch {
          eligible = false;
        }
        if (!eligible) return;
      }

      try {
        const rendered = await renderTextWithTimeout(renderer, code, resolveTextOptions());
        if (!alive || version !== renderVersion) return;
        const lines = splitRenderedOutput(rendered);
        if (!hasVisibleTextOutput(lines)) return;
        textSnapshot.value = markRaw({
          source: code,
          signature: textRenderSignature(code),
          lines: markRaw(lines),
        });
        bump();
      } catch {
        // Renderer failed or timed out: keep the raw source visible.
      }
    }

    /**
     * Adaptive presentation state machine:
     *
     *   raw source
     *     -> image (terminal supports Kitty/iTerm2 graphics and the PNG
     *        rasterizer succeeds), else
     *     -> ANSI text (a textRenderer is available and the source passes the
     *        eligibility guard), else
     *     -> raw source
     *
     * While any pipeline is pending the raw source stays visible (source-first).
     */
    async function renderPresentation(version: number): Promise<void> {
      const code = source.value;
      if (!code.trim()) {
        if (!alive || version !== renderVersion) return;
        setImageCells(null);
        textSnapshot.value = null;
        bump();
        return;
      }

      if (waitingForStreamingSourceToFinish.value || shouldSkipRenderForSize(code)) {
        if (!alive || version !== renderVersion) return;
        setImageCells(null);
        textSnapshot.value = null;
        bump();
        return;
      }

      const protocol = graphicsProtocol.value;
      const options = resolveImageOptions();
      const cached = protocol && !props.renderer ? getCachedMermaidImage(code, options) : null;
      if (cached) {
        if (!alive || version !== renderVersion) return;
        setImageCells(cached);
        textSnapshot.value = null;
        bump();
        return;
      }

      // Source-first invariant: while a presentation is pending, keep the raw
      // source visible so the cell area is never blank. A text snapshot that is
      // still valid for the exact same source + renderer signature is kept so
      // unrelated re-schedules (e.g. another instance's image completing) do not
      // re-render the ANSI diagram needlessly.
      const currentSignature = textRenderSignature(code);
      const keepText =
        textSnapshot.value != null &&
        textSnapshot.value.source === code &&
        textSnapshot.value.signature === currentSignature;
      if (!keepText) {
        setImageCells(null);
        textSnapshot.value = null;
        bump();
      }

      if (protocol) {
        let result: TuiMermaidImageCells | null = null;
        if (props.renderer) {
          result = await runCustomRasterizer(code, options);
        } else if (isMermaidImageRendererReady()) {
          result = await rasterizeWithTimeout(code, options);
        } else {
          void loadMermaidImageRenderer().then((ready) => {
            if (!alive || version !== renderVersion || !ready) return;
            void renderPresentation(version);
          });
          return;
        }
        if (!alive || version !== renderVersion) return;
        if (result) {
          setImageCells(result);
          textSnapshot.value = null;
          bump();
          return;
        }
        // Image unavailable for this source: fall through to the ANSI renderer.
      }

      if (keepText) return;
      await renderTextFallback(version);
    }

    function scheduleRender(): void {
      const version = ++renderVersion;

      resetCopyFeedback(false);
      setImageCells(null);

      if (waitingForStreamingSourceToFinish.value) {
        builtOnce = true;
        scheduler.cancelFrameTask?.(frameTaskId);
        bump();
        return;
      }

      if (!builtOnce || !props.streaming) {
        builtOnce = true;
        void renderPresentation(version);
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
          void renderPresentation(version);
        },
      });
      if (accepted === false) {
        void renderPresentation(version);
      }
    }

    watch(
      [
        source,
        () => props.renderer,
        () => props.cellWidthPx,
        () => props.cellHeightPx,
        () => props.scale,
        () => props.bg,
        () => props.fg,
        () => props.maxWidthCells,
        () => props.maxHeightCells,
        () => props.padding,
        () => props.streaming,
        () => props.final,
        () => props.maxRenderSourceChars,
        () => props.maxRenderSourceLines,
        () => props.textRenderer,
        () => props.shouldRenderSource,
        () => props.textOptions,
        () => props.ascii,
        () => props.zoomModifier,
      ],
      () => {
        scheduleRender();
      },
      { immediate: true, deep: true },
    );

    watch(source, () => {
      if (previewOpen.value) closePreview();
    });
    watch(visible, (next) => {
      if (!next && previewOpen.value) closePreview();
    });
    watch(graphicsProtocol, (next) => {
      if (!next && previewOpen.value) closePreview();
    });
    watch(imageCells, (next) => {
      if (!next && previewOpen.value) closePreview();
    });

    const unsubscribeMermaidImage = subscribeMermaidImage(() => {
      if (!alive) return;
      // Another instance may have rasterized the same source; promote a newly
      // cached image without re-running the ANSI fallback pipeline.
      if (!graphicsProtocol.value || props.renderer) return;
      const cached = getCachedMermaidImage(source.value, resolveImageOptions());
      if (!cached) return;
      if (!alive) return;
      setImageCells(cached);
      textSnapshot.value = null;
      bump();
    });

    const unsubscribeGraphicsOutput = subscribeTerminalGraphicsOutput(terminal, () => {
      if (!alive) return;
      graphicsOutputVersion.value = getTerminalGraphicsOutputVersion(terminal);
      scheduleRender();
    });

    const unsubscribeResize = terminal.on("resize", () => {
      if (!alive) return;
      viewportVersion.value++;
      if (previewOpen.value) bump();
    });

    onBeforeUnmount(() => {
      alive = false;
      renderVersion++;
      clearCopiedTimer();
      if (activeMermaidPreviewOwners.get(terminal) === previewOwner) {
        activeMermaidPreviewOwners.delete(terminal);
      }
      releasePreviewGraphicsSuspension?.();
      releasePreviewGraphicsSuspension = null;
      queuePreviewClearGraphic();
      queueClearGraphic();
      unsubscribeMermaidImage();
      unsubscribeGraphicsOutput();
      unsubscribeResize();
      scheduler.cancelFrameTask?.(frameTaskId);
    });

    type HeaderSegment = Readonly<{
      text: string;
      start: number;
      cells: number;
    }>;

    function canDrawBox(width: number, height: number): boolean {
      return hasBox.value && Math.floor(width) >= 2 && Math.floor(height) >= 2;
    }

    function headerCopySegment(width: number): HeaderSegment | null {
      if (!hasBox.value || !props.copyButton) return null;

      const rowWidth = Math.max(0, Math.floor(width));
      if (rowWidth < 4) return null;

      const label = sanitizeInlineText(copyLabel.value);
      if (!label) return null;

      const maxCells = Math.max(0, rowWidth - 2);
      const text = sliceCells(` ${label} `, maxCells);
      const cells = cellWidth(text);
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
      const cells = cellWidth(text);
      if (!text || cells <= 0) return null;

      return {
        text,
        start: titleStart,
        cells,
      };
    }

    function overlayCells(row: string, segment: HeaderSegment, width: number): string {
      const rowWidth = Math.max(0, Math.floor(width));
      const start = Math.max(0, Math.floor(segment.start));
      if (rowWidth <= 1 || start >= rowWidth - 1 || segment.cells <= 0) return row;

      const maxCells = Math.max(0, rowWidth - 1 - start);
      const text = sliceCells(segment.text, maxCells);
      const cells = cellWidth(text);
      if (!text || cells <= 0) return row;

      return `${sliceCells(row, start)}${text}${sliceCellsRange(row, start + cells, rowWidth)}`;
    }

    function boxRow(rowIndex: number, width: number, height: number): string {
      const rowWidth = Math.max(0, Math.floor(width));
      const rowHeight = Math.max(0, Math.floor(height));

      if (!canDrawBox(rowWidth, rowHeight)) {
        return contentLine(rowIndex, rowWidth, props.clear);
      }

      const chars = boxChars.value;
      const innerW = Math.max(0, rowWidth - 2);

      if (rowIndex === 0) {
        let row = `${chars.tl}${repeatChar(chars.h, innerW)}${chars.tr}`;
        const copy = headerCopySegment(rowWidth);
        const title = headerTitleSegment(rowWidth, copy);

        if (title) row = overlayCells(row, title, rowWidth);
        if (copy) row = overlayCells(row, copy, rowWidth);

        return row;
      }

      if (rowIndex === rowHeight - 1) {
        return `${chars.bl}${repeatChar(chars.h, innerW)}${chars.br}`;
      }

      return `${chars.v}${contentLine(rowIndex - 1, innerW, true)}${chars.v}`;
    }

    function contentLine(rowIndex: number, width: number, pad: boolean): string {
      const showImage =
        imageCells.value != null && displayFit.value != null && graphicsProtocol.value != null;
      const src = showImage ? spaces(width) : (displayLines.value[rowIndex] ?? "");
      const clipped = sliceCells(src, width);
      return pad ? padCells(clipped, width) : clipped;
    }

    function innerRectFrom(full: Rect): Rect {
      const x = Math.floor(full.x) + (reservesBoxRows.value ? 1 : 0);
      const y = Math.floor(full.y) + (reservesBoxRows.value ? 1 : 0);
      const w = Math.max(0, Math.floor(full.w) - (reservesBoxRows.value ? 2 : 0));
      const h = Math.max(0, Math.floor(full.h) - (reservesBoxRows.value ? 2 : 0));
      return { x, y, w, h };
    }

    function queueImageGraphic(full: Rect, fit: TMermaidImageFit): void {
      const protocol = graphicsProtocol.value;
      const cells = imageCells.value;
      if (activeMermaidPreviewOwners.has(terminal)) {
        queueClearGraphic();
        return;
      }
      if (!protocol || !cells) {
        queueClearGraphic();
        return;
      }

      const inner = innerRectFrom(full);
      if (inner.w <= 0 || inner.h <= 0) {
        queueClearGraphic();
        return;
      }

      // Wheel zoom viewport: the full zoomed image rect may exceed the
      // container; the visible rect is the intersection, which the kitty
      // placement crops to (source crop controls). At zoom 1 the full rect
      // equals the fit rect and no crop is emitted (backward compatible).
      const zoom = clampZoom(zoomScale.value);
      const fitW = fit.displayW;
      const fitH = fit.displayH;
      const fitOriginX = inner.x + (inner.w > fitW ? Math.floor((inner.w - fitW) / 2) : 0);
      const fullRect: Rect = {
        x: fitOriginX + panX.value,
        y: inner.y + panY.value,
        w: fitW * zoom,
        h: fitH * zoom,
      };
      const visible = intersectRect(fullRect, inner);
      if (!visible || visible.w < 1 || visible.h < 1) {
        queueClearGraphic();
        return;
      }

      // Round to integer cells for the placement while keeping sub-cell pan
      // smoothing inside the zoom/pan state.
      const rectX = Math.max(inner.x, Math.round(visible.x));
      const rectY = Math.max(inner.y, Math.round(visible.y));
      const rect: Rect = {
        x: rectX,
        y: rectY,
        w: Math.max(1, Math.min(inner.x + inner.w, rectX + Math.round(visible.w)) - rectX),
        h: Math.max(1, Math.min(inner.y + inner.h, rectY + Math.round(visible.h)) - rectY),
      };

      const imageId = stableTerminalGraphicNumericId(`mermaid-image:${uid}:${renderVersion}:img`);
      const placementId = stableTerminalGraphicNumericId(
        `mermaid-image:${uid}:${renderVersion}:plc`,
      );
      const built = createTerminalGraphicPngSequence({
        protocol,
        base64: cells.base64,
        imageId,
        placementId,
        cols: cells.widthCells,
        rows: cells.heightCells,
        sourceWidth: cells.naturalWidth,
        sourceHeight: cells.naturalHeight,
        placementColumns: rect.w,
        placementRows: rect.h,
        // Keep the initial transmission stable at the fit size without a
        // source crop so wheel zoom can replace the placement (a=p) without
        // re-sending the PNG, and every placement references the full image.
        transmissionColumns: fitW,
        transmissionRows: fitH,
        cropTransmission: false,
        rect,
        fullRect,
        zIndex: -1,
        fallback: source.value,
      });
      if (!built) {
        queueClearGraphic();
        return;
      }

      const id = `mermaid-image:${uid}:${renderVersion}`;
      const output = graphicsOutput.value;
      if (!output) {
        queueClearGraphic();
        return;
      }

      if (activeGraphicId != null && activeGraphicId !== id) {
        try {
          output.clear?.(activeGraphicId);
        } catch {
          // Best-effort cleanup.
        }
        activeGraphicId = null;
      }

      const accepted = output.queue({
        id,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        protocol,
        sequence: built.sequence,
        resizeSequence: built.resizeSequence,
        clearSequence: built.clearSequence,
        fallbackText: source.value,
        // Same image data + placement id: let the stdout renderer replace the
        // placement with the resize sequence instead of re-sending the PNG.
        placementMoveWithoutClear: protocol === "kitty",
      });
      if (accepted) {
        activeGraphicId = id;
      } else {
        queueClearGraphic();
      }
    }

    function queuePreviewClearGraphic(): void {
      if (activePreviewGraphicId == null) return;
      const id = activePreviewGraphicId;
      activePreviewGraphicId = null;
      try {
        graphicsOutput.value?.clear?.(id);
      } catch {
        // Best-effort cleanup; the preview must never affect text rendering.
      }
    }

    function queuePreviewImageGraphic(): void {
      const protocol = graphicsProtocol.value;
      const cells = imageCells.value;
      const fit = previewImageFit.value;
      const content = previewContentRect.value;
      if (activeMermaidPreviewOwners.get(terminal) !== previewOwner) {
        queuePreviewClearGraphic();
        return;
      }
      if (!protocol || !cells || !fit || content.w <= 0 || content.h <= 0) {
        queuePreviewClearGraphic();
        return;
      }

      const rect: Rect = {
        x: content.x + Math.floor((content.w - fit.displayW) / 2),
        y: content.y + Math.floor((content.h - fit.displayH) / 2),
        w: fit.displayW,
        h: fit.displayH,
      };
      const imageId = stableTerminalGraphicNumericId(`mermaid-preview:${uid}:${renderVersion}:img`);
      const placementId = stableTerminalGraphicNumericId(
        `mermaid-preview:${uid}:${renderVersion}:plc`,
      );
      const built = createTerminalGraphicPngSequence({
        protocol,
        base64: cells.base64,
        imageId,
        placementId,
        // iTerm2 reads display size from cols/rows; Kitty uses the placement
        // controls below. Both get the enlarged preview rect.
        cols: rect.w,
        rows: rect.h,
        sourceWidth: cells.naturalWidth,
        sourceHeight: cells.naturalHeight,
        placementColumns: rect.w,
        placementRows: rect.h,
        transmissionColumns: fit.displayW,
        transmissionRows: fit.displayH,
        cropTransmission: false,
        rect,
        fullRect: rect,
        zIndex: 0,
        fallback: source.value,
      });
      if (!built) {
        queuePreviewClearGraphic();
        return;
      }

      const id = `mermaid-preview:${uid}:${renderVersion}`;
      const output = graphicsOutput.value;
      if (!output) {
        queuePreviewClearGraphic();
        return;
      }

      if (activePreviewGraphicId != null && activePreviewGraphicId !== id) {
        try {
          output.clear?.(activePreviewGraphicId);
        } catch {
          // Best-effort cleanup.
        }
        activePreviewGraphicId = null;
      }

      const accepted = output.queue({
        id,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        protocol,
        sequence: built.sequence,
        resizeSequence: built.resizeSequence,
        clearSequence: built.clearSequence,
        fallbackText: source.value,
        bypassSuspension: true,
        placementMoveWithoutClear: protocol === "kitty",
      });
      if (accepted) {
        activePreviewGraphicId = id;
      } else {
        queuePreviewClearGraphic();
      }
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

    const contentHitRect = computed<Rect>(() => {
      if (!visible.value) return { x: 0, y: 0, w: 0, h: 0 };
      const full = fullRect.value;
      if (full.w <= 0 || full.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
      const inner = innerRectFrom(full);
      if (inner.w <= 0 || inner.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
      if (!layout.clipRect) return inner;
      return intersectRect(inner, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    function clipboardCanWrite(api: { supported: boolean; canWrite?: boolean }): boolean {
      return api.canWrite ?? api.supported;
    }

    async function writeClipboardText(text: string): Promise<void> {
      const contextClipboard = terminalContext.clipboard;

      if (contextClipboard) {
        if (!clipboardCanWrite(contextClipboard)) {
          throw new Error("Clipboard write not available in this runtime");
        }
        await contextClipboard.writeText(text);
        return;
      }

      const navClipboard = (globalThis as any).navigator?.clipboard;
      if (navClipboard && typeof navClipboard.writeText === "function") {
        await navClipboard.writeText(text);
        return;
      }

      throw new Error("Clipboard write not available in this runtime");
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
      // Suppress copy when the click is the tail of a drag-to-pan gesture.
      if (Date.now() - lastDragAt < DRAG_CLICK_SUPPRESS_MS) return;
      void copySource();
    }

    function onCopyKeydown(event: TerminalKeyboardEvent): void {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      void copySource();
    }

    function openPreview(event?: TerminalPointerEvent): void {
      if (previewOpen.value || !previewAvailable.value) return;
      if (activeMermaidPreviewOwners.has(terminal)) return;
      if (previewViewport.value.w <= 0 || previewViewport.value.h <= 0) return;
      event?.preventDefault();
      event?.stopPropagation();
      activeMermaidPreviewOwners.set(terminal, previewOwner);
      releasePreviewGraphicsSuspension?.();
      releasePreviewGraphicsSuspension = suspendTerminalGraphics(
        terminal,
        `mermaid-preview:${uid}`,
      );
      previewOpen.value = true;
      try {
        graphicsOutput.value?.clearAll?.();
      } catch {
        // Best-effort: the text backdrop and preview placement still render.
      }
      queueClearGraphic();
      queuePreviewClearGraphic();
      bump();
      emit("preview", { text: source.value, open: true });
    }

    function closePreview(event?: TerminalPointerEvent): void {
      if (!previewOpen.value) return;
      event?.preventDefault();
      event?.stopPropagation();
      if (activeMermaidPreviewOwners.get(terminal) === previewOwner) {
        activeMermaidPreviewOwners.delete(terminal);
      }
      releasePreviewGraphicsSuspension?.();
      releasePreviewGraphicsSuspension = null;
      previewOpen.value = false;
      queuePreviewClearGraphic();
      bump();
      emit("preview", { text: source.value, open: false });
    }

    function onContentClick(event: TerminalPointerEvent): void {
      event.preventDefault();
      event.stopPropagation();
      // Suppress activation when the click is the tail of a drag-to-pan gesture.
      if (Date.now() - lastDragAt < DRAG_CLICK_SUPPRESS_MS) return;
      if (previewAvailable.value) {
        openPreview();
        return;
      }
      if (props.copyOnClick) void copySource();
    }

    function onPreviewClick(event: TerminalPointerEvent): void {
      closePreview(event);
    }

    function onPreviewKeydown(event: TerminalKeyboardEvent): void {
      if (event.key !== "Escape" && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      closePreview();
    }

    const zoomEnabled = computed(
      () =>
        props.zoomOnWheel !== false &&
        imageCells.value != null &&
        displayFit.value != null &&
        graphicsProtocol.value === "kitty" &&
        contentHitRect.value.w > 0 &&
        contentHitRect.value.h > 0,
    );

    const dragEnabled = computed(
      () =>
        props.zoomOnWheel !== false &&
        imageCells.value != null &&
        displayFit.value != null &&
        graphicsProtocol.value === "kitty" &&
        zoomScale.value > 1 &&
        contentHitRect.value.w > 0 &&
        contentHitRect.value.h > 0,
    );

    function onWheel(event: TerminalPointerEvent): void {
      if (!zoomEnabled.value) return;
      // Without the zoom modifier the wheel must pass through so surrounding
      // scroll containers (historical messages) scroll normally.
      if (!hasZoomModifier(event)) return;
      event.preventDefault();
      event.stopPropagation();

      const deltaY = event.deltaY ?? 0;
      if (!Number.isFinite(deltaY) || deltaY === 0) return;

      const inner = innerRectFrom(fullRect.value);
      const fit = displayFit.value;
      if (!fit || inner.w <= 0 || inner.h <= 0) return;

      const currentZoom = clampZoom(zoomScale.value);
      const fitW = fit.displayW;
      const fitH = fit.displayH;
      const fitOriginX = inner.x + (inner.w > fitW ? Math.floor((inner.w - fitW) / 2) : 0);
      const fullX = fitOriginX + panX.value;
      const fullY = inner.y + panY.value;

      const mouseX = event.cellX;
      const mouseY = event.cellY;
      const fx = currentZoom > 0 ? (mouseX - fullX) / (fitW * currentZoom) : 0.5;
      const fy = currentZoom > 0 ? (mouseY - fullY) / (fitH * currentZoom) : 0.5;

      const nextZoom = clampZoom(currentZoom * wheelZoomFactor(deltaY, event.deltaMode));
      if (nextZoom === currentZoom) return;

      const nextW = fitW * nextZoom;
      const nextH = fitH * nextZoom;
      let nextX = mouseX - fx * nextW;
      let nextY = mouseY - fy * nextH;

      // Clamp the zoomed image so it always covers the container area.
      if (nextW <= inner.w) nextX = inner.x + (inner.w - nextW) / 2;
      else nextX = Math.min(inner.x, Math.max(inner.x + inner.w - nextW, nextX));
      if (nextH <= inner.h) nextY = inner.y + (inner.h - nextH) / 2;
      else nextY = Math.min(inner.y, Math.max(inner.y + inner.h - nextH, nextY));

      zoomScale.value = nextZoom;
      panX.value = nextX - fitOriginX;
      panY.value = nextY - inner.y;
      clampPan();
      bump();
    }

    function onPointerDown(event: TerminalPointerEvent): void {
      if (!dragEnabled.value) return;
      event.preventDefault();
      event.stopPropagation();
      dragState = {
        startX: event.cellX,
        startY: event.cellY,
        panStartX: panX.value,
        panStartY: panY.value,
      };
      dragMoved = false;
    }

    function onPointerMove(event: TerminalPointerEvent): void {
      const drag = dragState;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();

      const dx = event.cellX - drag.startX;
      const dy = event.cellY - drag.startY;
      if (!dragMoved && Math.abs(dx) + Math.abs(dy) >= 1) dragMoved = true;
      if (!dragMoved) return;

      panX.value = drag.panStartX + dx;
      panY.value = drag.panStartY + dy;
      clampPan();
      bump();
    }

    function onPointerUp(event: TerminalPointerEvent): void {
      const drag = dragState;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      dragState = null;
      if (dragMoved) lastDragAt = Date.now();
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

    const contentNodeActive = computed(
      () =>
        visible.value &&
        (previewAvailable.value ||
          previewOpen.value ||
          props.copyOnClick ||
          zoomEnabled.value ||
          dragEnabled.value) &&
        contentHitRect.value.w > 0 &&
        contentHitRect.value.h > 0,
    );

    useTerminalNode(() => ({
      rect: contentHitRect.value,
      zIndex: (parentEventZ.value ?? 0) + props.zIndex,
      visible: contentNodeActive.value,
      focusable: false,
      selectable: false,
      handlers: contentNodeActive.value
        ? {
            click: onContentClick,
            wheel: zoomEnabled.value ? onWheel : undefined,
            pointerdown: dragEnabled.value ? onPointerDown : undefined,
            pointermove: dragEnabled.value ? onPointerMove : undefined,
            pointerup: dragEnabled.value ? onPointerUp : undefined,
          }
        : {},
    }));

    const previewNodeActive = computed(
      () =>
        previewOpen.value &&
        visible.value &&
        previewViewport.value.w > 0 &&
        previewViewport.value.h > 0,
    );

    useTerminalNode(() => ({
      rect: previewNodeActive.value ? previewViewport.value : { x: 0, y: 0, w: 0, h: 0 },
      zIndex: MERMAID_PREVIEW_Z + (parentEventZ.value ?? 0),
      visible: previewNodeActive.value,
      focusable: previewNodeActive.value,
      selectable: false,
      handlers: previewNodeActive.value
        ? {
            click: onPreviewClick,
            keydown: onPreviewKeydown,
          }
        : {},
    }));

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        imageCells.value,
        displayFit.value,
        zoomScale.value,
        panX.value,
        panY.value,
        textSnapshot.value,
        displayLines.value,
        sourceLines.value,
        currentStyle.value,
        props.clear,
        hasBox.value,
        boxChars.value,
        props.title,
        props.copyButton,
        copyLabel.value,
        graphicsOutputVersion.value,
        documentVersion.value,
        previewOpen.value,
      ],
      paint: (dirtyRows) => {
        withTextWidthProvider(widthProvider, () => {
          if (!visible.value) {
            queueClearGraphic();
            return;
          }

          const r = absRect.value;
          const full = fullRect.value;
          if (r.w <= 0 || r.h <= 0) {
            queueClearGraphic();
            return;
          }

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

          if (imageCells.value && displayFit.value && !previewOpen.value) {
            queueImageGraphic(full, displayFit.value);
          } else {
            queueClearGraphic();
          }

          if (dirtyRows?.length) {
            for (const y of dirtyRows) paintRow(y);
            return;
          }

          for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
        });
      },
    }));

    function paintPreview(rows: readonly number[]): void {
      const viewport = previewViewport.value;
      if (viewport.w <= 0 || viewport.h <= 0) {
        queuePreviewClearGraphic();
        return;
      }

      const frame = previewFrame.value;
      const chars = boxChars.value;
      const style = currentStyle.value;
      const backdropStyle: Style = {
        ...style,
        bg: style.bg ?? defaultStyle.value.bg,
        dim: true,
      };
      const borderStyle: Style = { ...style, dim: true };
      const titleStyle: Style = { ...style, bold: true };
      const hintStyle: Style = { ...style, dim: true };
      const blank = spaces(viewport.w);
      const frameTop = frame.y;
      const frameBottom = frame.y + frame.h - 1;
      const frameRight = frame.x + frame.w - 1;
      const frameDrawable = frame.w >= 4 && frame.h >= 3;

      for (const y of rows) {
        if (y < viewport.y || y >= viewport.y + viewport.h) continue;
        previewTerminal.write(blank, { x: viewport.x, y, style: backdropStyle });
        if (!frameDrawable || y < frameTop || y > frameBottom) continue;

        if (y === frameTop) {
          previewTerminal.write(`${chars.tl}${repeatChar(chars.h, frame.w - 2)}${chars.tr}`, {
            x: frame.x,
            y,
            style: borderStyle,
          });

          const innerW = Math.max(0, frame.w - 2);
          const title = sliceCells(` ${sanitizeInlineText(props.previewTitle)} `, innerW);
          if (title) previewTerminal.write(title, { x: frame.x + 1, y, style: titleStyle });

          const hint = sliceCells(` ${sanitizeInlineText(props.previewHint)} `, innerW);
          if (hint) {
            const hintW = cellWidth(hint);
            const titleW = cellWidth(title);
            const hintX = frameRight - hintW;
            if (hintX > frame.x + 1 + titleW) {
              previewTerminal.write(hint, { x: hintX, y, style: hintStyle });
            }
          }
        } else if (y === frameBottom) {
          previewTerminal.write(`${chars.bl}${repeatChar(chars.h, frame.w - 2)}${chars.br}`, {
            x: frame.x,
            y,
            style: borderStyle,
          });
        } else {
          previewTerminal.put(frame.x, y, chars.v, borderStyle);
          previewTerminal.put(frameRight, y, chars.v, borderStyle);
        }
      }

      queuePreviewImageGraphic();
    }

    useRenderNode(() => ({
      stack: previewRenderStack,
      plane: "overlay",
      zIndex: 0,
      priority: "high",
      rect: previewOpen.value ? previewViewport.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        previewOpen.value,
        visible.value,
        previewViewport.value,
        previewFrame.value,
        previewContentRect.value,
        previewImageFit.value,
        imageCells.value,
        source.value,
        currentStyle.value,
        defaultStyle.value,
        boxChars.value,
        props.previewTitle,
        props.previewHint,
        documentVersion.value,
        graphicsOutputVersion.value,
      ],
      paint: (dirtyRows) => {
        if (!previewOpen.value || !visible.value) {
          queuePreviewClearGraphic();
          return;
        }
        withTextWidthProvider(widthProvider, () => {
          const viewport = previewViewport.value;
          const rows = dirtyRows?.length
            ? dirtyRows
            : Array.from({ length: viewport.h }, (_, index) => viewport.y + index);
          paintPreview(rows);
        });
      },
    }));

    return () => h("span", rootProps);
  },
});

export const TMermaidImageText = TMermaidImage;
