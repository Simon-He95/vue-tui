import type { ExtractPublicPropTypes, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect } from "../../events/manager/types.js";
import type {
  TerminalGraphicsCapabilities,
  TerminalGraphicsOutput,
  TerminalGraphicsProtocol,
  TerminalGraphicsResolvedProtocol,
} from "../../renderer/terminal-graphics.js";
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
import {
  getTerminalGraphicsOutput,
  getTerminalGraphicsOutputVersion,
  subscribeTerminalGraphicsOutput,
} from "../../renderer/terminal-graphics.js";
import {
  createKittyDeleteGraphicsSequence,
  stableTerminalGraphicNumericId,
  isTerminalGraphicsProtocol,
  isSafeTerminalGraphicsSequence,
  normalizeTerminalGraphicSize,
  sanitizeTerminalFallbackText,
} from "../../renderer/terminal-graphics.js";
import {
  nowTerminalGraphicTraceTime,
  recordTerminalGraphicTrace,
} from "../../renderer/terminal-graphics-trace.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { TerminalGraphicsActivityKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  padEndByCells,
  sanitizeTextBlock,
  sliceByCells,
  sliceByCellsRange,
  spaces,
  withTextWidthProvider,
} from "../utils/text.js";

export type TAgentTerminalGraphicKind = "image" | "math";

export type TAgentTerminalGraphicRendererContext = Readonly<{
  kind: TAgentTerminalGraphicKind;
  width: number;
  height?: number;
  final: boolean;
  streaming: boolean;
  protocol: TerminalGraphicsResolvedProtocol;
  capabilities: TerminalGraphicsCapabilities;
  signal: AbortSignal;
  imageId: number;
  placementId: number;
  visible: boolean;
  rawVisible: boolean;
  scrolling: boolean;
  cacheKey?: string;
  viewport: Readonly<{
    visible: boolean;
    rawVisible: boolean;
    scrolling: boolean;
    rect: Rect;
    fullRect: Rect;
  }>;
}>;

export type TAgentTerminalGraphicTraceEvent = Readonly<{
  type:
    | "render-start"
    | "render-end"
    | "render-abort"
    | "defer"
    | "raw-draw"
    | "raw-clear"
    | "raw-skip-scroll";
  id: string;
  kind: TAgentTerminalGraphicKind;
  protocol: TerminalGraphicsResolvedProtocol;
  contentHash: string;
  durationMs?: number;
  sequenceChars?: number;
  sequenceBytes?: number;
  reason?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}>;

export type TAgentTerminalGraphicRenderResult =
  | Readonly<{
      type: "sequence";
      sequence: string;
      protocol: TerminalGraphicsProtocol;
      fallback?: string;
      clearSequence?: string;
      cols?: number;
      rows?: number;
    }>
  | Readonly<{
      type: "text";
      text: string;
    }>
  | null
  | undefined
  | string
  | Readonly<{
      sequence: string;
      protocol: TerminalGraphicsProtocol;
      fallback?: string;
      clearSequence?: string;
      cols?: number;
      rows?: number;
    }>
  | Readonly<{
      text: string;
    }>;

export type TAgentTerminalGraphicRenderer = (
  content: string,
  context: TAgentTerminalGraphicRendererContext,
) => TAgentTerminalGraphicRenderResult | Promise<TAgentTerminalGraphicRenderResult>;

type TAgentTerminalGraphicStatus = "idle" | "loading" | "ready";

const NO_GRAPHICS_CAPABILITIES: TerminalGraphicsCapabilities = Object.freeze({
  supported: false,
  kitty: false,
  iterm2: false,
  sixel: false,
  preferredProtocol: null,
  protocol: "unicode",
  candidates: [],
  stdoutIsTTY: false,
  insideTmux: false,
  insideScreen: false,
  insideZellij: false,
  multiplexer: null,
  passthrough: false,
  forced: false,
  reason: "no-terminal-graphics-output",
});

function splitTextOutput(value: string): readonly string[] {
  const normalized = sanitizeTextBlock(sanitizeTerminalFallbackText(value).replace(/\r\n?/g, "\n"));
  const lines = normalized.split("\n");
  return lines.length ? lines : [""];
}

function hasVisibleOutput(value: readonly string[]): boolean {
  return value.some((line) => line.trim().length > 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function positiveInt(value: unknown): number | undefined {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseKittyClearControls(sequence: string): Map<string, string> | null {
  const prefix = "\x1B_G";
  const terminator = "\x1B\\";
  if (!sequence.startsWith(prefix) || !sequence.endsWith(terminator)) return null;

  const body = sequence.slice(prefix.length, -terminator.length);
  if (body.includes(terminator) || body.includes("\x1B") || body.includes("\x07")) return null;

  const semicolon = body.indexOf(";");
  const rawControls = semicolon >= 0 ? body.slice(0, semicolon) : body;
  const controls = new Map<string, string>();

  for (const part of rawControls.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    controls.set(part.slice(0, eq), part.slice(eq + 1));
  }

  return controls;
}

function kittyClearTargetsComponent(
  sequence: string,
  imageId: number,
  placementId: number,
): boolean {
  const controls = parseKittyClearControls(sequence);
  if (!controls) return false;

  const mode = controls.get("d");
  if (mode !== "i" && mode !== "I") return false;

  return controls.get("i") === String(imageId) && controls.get("p") === String(placementId);
}

function isSafeComponentClearSequence(
  sequence: string,
  protocol: TerminalGraphicsProtocol,
  imageId: number,
  placementId: number,
): boolean {
  if (!isSafeTerminalGraphicsSequence(sequence, protocol, "clear")) return false;
  return protocol !== "kitty" || kittyClearTargetsComponent(sequence, imageId, placementId);
}

let textEncoder: TextEncoder | null = null;

function stringByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    textEncoder ??= new TextEncoder();
    return textEncoder.encode(value).length;
  }

  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

function smallHash(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export const tAgentTerminalGraphicProps = {
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  w: { type: Number, required: true },
  h: { type: Number, default: undefined },
  zIndex: { type: Number, default: 0 },
  content: { type: String, required: true },
  kind: {
    type: String as PropType<TAgentTerminalGraphicKind>,
    default: "image",
  },
  fallback: { type: String, default: undefined },
  style: { type: Object as PropType<Style>, default: undefined },
  loadingStyle: { type: Object as PropType<Style>, default: undefined },
  errorStyle: { type: Object as PropType<Style>, default: undefined },
  clear: { type: Boolean, default: true },
  final: { type: Boolean, default: true },
  streaming: { type: Boolean, default: false },
  renderer: {
    type: Function as PropType<TAgentTerminalGraphicRenderer>,
    default: undefined,
  },
  loadingText: {
    type: String,
    default: "Rendering terminal graphic...",
  },
  deferRenderUntilVisible: { type: Boolean, default: true },
  suspendRawWhileScrolling: { type: Boolean, default: true },
  suspendRenderWhileScrolling: { type: Boolean, default: true },
  scrolling: { type: Boolean, default: false },
  suspended: { type: Boolean, default: false },
  cacheKey: { type: String, default: undefined },
  trace: {
    type: Function as PropType<(event: TAgentTerminalGraphicTraceEvent) => void>,
    default: undefined,
  },
} as const;

export type TAgentTerminalGraphicProps = ExtractPublicPropTypes<typeof tAgentTerminalGraphicProps>;

type ResolvedTerminalGraphic = Readonly<{
  type: "terminal";
  protocol: TerminalGraphicsProtocol;
  sequence: string;
  sequenceHash: string;
  sequenceBytes: number;
  fallback: string;
  fallbackFromProps: boolean;
  clearSequence?: string;
  clearSequenceHash?: string;
  cols?: number;
  rows?: number;
}>;

type ResolvedGraphic =
  | ResolvedTerminalGraphic
  | Readonly<{
      type: "text";
      text: string;
    }>;

type LastDrawnGraphic = Readonly<{
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  protocol: TerminalGraphicsProtocol;
  clearSequence?: string;
  drawKey: string;
}>;

type ReservedTerminalGraphicSize = Readonly<{
  key: string;
  rows: number;
}>;

function terminalDrawKey(
  current: ResolvedTerminalGraphic,
  rect: Rect,
  clearSequence: string | undefined,
): string {
  return [
    current.protocol,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    current.sequenceHash,
    clearSequence === current.clearSequence
      ? (current.clearSequenceHash ?? "")
      : smallHash(clearSequence ?? ""),
  ].join(":");
}

export const TAgentTerminalGraphic = defineComponent({
  name: "TAgentTerminalGraphic",
  props: tAgentTerminalGraphicProps,
  setup(props) {
    const instance = getCurrentInstance();
    const { terminal, defaultStyle, scheduler, widthProvider } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const graphicsActivity = inject(TerminalGraphicsActivityKey, null);

    const status = shallowRef<TAgentTerminalGraphicStatus>("idle");
    const error = shallowRef("");
    const graphic = shallowRef<ResolvedGraphic | null>(null);
    const documentVersion = shallowRef(0);

    let builtOnce = false;
    let renderVersion = 0;
    let renderAbort: AbortController | null = null;
    let alive = true;
    let lastRenderedContent = "";
    let lastRenderRawVisible = false;
    let lastRenderProtocol: TerminalGraphicsResolvedProtocol | null = null;
    let lastRenderGraphicsOutputVersion = 0;
    const rawId = `TAgentTerminalGraphic:${instance?.uid ?? "unknown"}`;
    const frameTaskId = `${rawId}:render`;
    const lastDrawnGraphic = shallowRef<LastDrawnGraphic | null>(null);
    const rawClearPendingRepaint = shallowRef<LastDrawnGraphic | null>(null);
    const rawDrawRejectedKey = shallowRef<string | null>(null);
    const reservedTerminalGraphicSize = shallowRef<ReservedTerminalGraphicSize | null>(null);
    let lastRawSkipScrollKey = "";
    let lastDeferTraceKey = "";

    const isParentScrolling = computed(
      () => props.scrolling || Boolean(graphicsActivity?.scrolling.value),
    );
    const graphicsActivityVersion = computed(() => graphicsActivity?.version.value ?? 0);
    const graphicsOutput = () => getTerminalGraphicsOutput(terminal);
    const graphicsOutputVersion = shallowRef(getTerminalGraphicsOutputVersion(terminal));
    const unsubscribeGraphicsOutput = subscribeTerminalGraphicsOutput(terminal, () => {
      graphicsOutputVersion.value = getTerminalGraphicsOutputVersion(terminal);
    });
    const fallbackText = () => props.fallback ?? props.content;
    const contentIdentity = computed(() => `${props.content.length}:${smallHash(props.content)}`);
    const stableGraphicKey = computed(() =>
      [
        props.cacheKey ?? "",
        props.kind,
        contentIdentity.value,
        props.w,
        props.h ?? "",
        props.final ? "final" : "draft",
      ].join("\x1F"),
    );
    const imageId = computed(() =>
      stableTerminalGraphicNumericId(`image:${rawId}:${stableGraphicKey.value}`),
    );
    const placementId = computed(() =>
      stableTerminalGraphicNumericId(`placement:${rawId}:${stableGraphicKey.value}`),
    );

    function rememberTerminalGraphicSize(current: ResolvedGraphic): void {
      if (current.type !== "terminal") return;

      const rows = positiveInt(current.rows);
      if (!rows) return;

      reservedTerminalGraphicSize.value = {
        key: stableGraphicKey.value,
        rows,
      };
    }

    function bump(): void {
      documentVersion.value++;
    }

    function currentCapabilities(): TerminalGraphicsCapabilities {
      return graphicsOutput()?.capabilities ?? NO_GRAPHICS_CAPABILITIES;
    }

    function trace(
      type: TAgentTerminalGraphicTraceEvent["type"],
      extra: Partial<
        Pick<
          TAgentTerminalGraphicTraceEvent,
          "durationMs" | "sequenceChars" | "sequenceBytes" | "reason" | "x" | "y" | "w" | "h"
        >
      > = {},
    ): void {
      const capabilities = currentCapabilities();
      try {
        props.trace?.({
          type,
          id: rawId,
          kind: props.kind,
          protocol: capabilities.protocol,
          contentHash: smallHash(props.content),
          ...extra,
        });
      } catch {
        // Per-component tracing is observational; it must not affect rendering.
      }

      const protocol = isTerminalGraphicsProtocol(capabilities.protocol)
        ? capabilities.protocol
        : undefined;
      const key = props.cacheKey ?? smallHash(props.content);

      if (type === "render-start") {
        recordTerminalGraphicTrace({ type: "renderer-start", id: rawId, key, protocol });
      } else if (type === "render-end") {
        recordTerminalGraphicTrace({
          type: extra.reason ? "renderer-error" : "renderer-end",
          id: rawId,
          key,
          protocol,
          durationMs: extra.durationMs,
          bytes: extra.sequenceBytes,
          error: extra.reason,
        });
      } else if (type === "defer") {
        recordTerminalGraphicTrace({
          type: extra.reason === "scrolling" ? "skip-scrolling" : "skip-hidden",
          id: rawId,
          key,
          protocol,
          reason: extra.reason,
        });
      } else if (type === "raw-draw") {
        // The stdout renderer owns queue/bytes metrics after payload validation.
      } else if (type === "render-abort") {
        recordTerminalGraphicTrace({
          type: "renderer-abort",
          id: rawId,
          key,
          protocol,
          reason: extra.reason,
        });
      } else if (type === "raw-clear") {
        recordTerminalGraphicTrace({ type: "clear", id: rawId, key, protocol });
      } else if (type === "raw-skip-scroll") {
        recordTerminalGraphicTrace({
          type: "skip-scrolling",
          id: rawId,
          key,
          protocol,
          reason: extra.reason,
        });
      }
    }

    function traceDeferOnce(reason: string): void {
      const key = [reason, graphicsActivityVersion.value, stableGraphicKey.value].join(":");

      if (lastDeferTraceKey === key) return;
      lastDeferTraceKey = key;
      trace("defer", { reason });
    }

    function abortCurrentRender(reason: string): void {
      if (!renderAbort) return;
      renderAbort.abort();
      renderAbort = null;
      trace("render-abort", { reason });
    }

    function normalizeResult(result: TAgentTerminalGraphicRenderResult): ResolvedGraphic {
      if (result == null) {
        return {
          type: "text",
          text: fallbackText(),
        };
      }
      if (typeof result === "string") {
        return {
          type: "text",
          text: result,
        };
      }
      if (typeof result !== "object") {
        return {
          type: "text",
          text: fallbackText(),
        };
      }
      if ("type" in result && result.type === "text") {
        return {
          type: "text",
          text: result.text,
        };
      }

      const maybeRaw = result as Readonly<{
        type?: unknown;
        sequence?: unknown;
        protocol?: unknown;
        fallback?: unknown;
        clearSequence?: unknown;
        cols?: unknown;
        rows?: unknown;
      }>;
      const isRawCandidate =
        maybeRaw.type === "sequence" || "sequence" in result || "protocol" in result;
      if (!isRawCandidate && "text" in result) {
        return {
          type: "text",
          text: result.text,
        };
      }

      const sequence = typeof maybeRaw.sequence === "string" ? maybeRaw.sequence : "";
      const protocol = isTerminalGraphicsProtocol(maybeRaw.protocol) ? maybeRaw.protocol : null;
      const fallback =
        typeof maybeRaw.fallback === "string"
          ? sanitizeTerminalFallbackText(maybeRaw.fallback)
          : fallbackText();
      const fallbackFromProps = typeof maybeRaw.fallback !== "string";

      if (!sequence || !protocol || !isSafeTerminalGraphicsSequence(sequence, protocol, "draw")) {
        return {
          type: "text",
          text: fallback,
        };
      }

      const rawClear =
        typeof maybeRaw.clearSequence === "string" ? maybeRaw.clearSequence : undefined;
      const clearSequence =
        rawClear &&
        isSafeComponentClearSequence(rawClear, protocol, imageId.value, placementId.value)
          ? rawClear
          : undefined;
      const declaredRows = positiveInt(maybeRaw.rows);
      const declaredCols = positiveInt(maybeRaw.cols);
      const declaredSize =
        declaredRows == null
          ? null
          : normalizeTerminalGraphicSize(declaredCols ?? props.w, declaredRows);

      return {
        type: "terminal",
        protocol,
        sequence,
        sequenceHash: smallHash(sequence),
        sequenceBytes: stringByteLength(sequence),
        fallback,
        fallbackFromProps,
        clearSequence,
        clearSequenceHash: clearSequence ? smallHash(clearSequence) : undefined,
        cols: declaredRows == null ? declaredCols : declaredSize?.width,
        rows: declaredSize?.height,
      };
    }

    function defaultClearSequence(protocol: TerminalGraphicsProtocol): string {
      return protocol === "kitty"
        ? createKittyDeleteGraphicsSequence({
            imageId: imageId.value,
            placementId: placementId.value,
          })
        : "";
    }

    function resolveClearSequence(current: ResolvedTerminalGraphic): string | undefined {
      if (current.clearSequence) return current.clearSequence;

      const candidate = defaultClearSequence(current.protocol);
      if (!candidate) return undefined;
      return isSafeComponentClearSequence(
        candidate,
        current.protocol,
        imageId.value,
        placementId.value,
      )
        ? candidate
        : undefined;
    }

    function queueClearLastGraphic(
      options: Readonly<{ markPendingRepaint?: boolean }> = {},
    ): boolean {
      const previous = lastDrawnGraphic.value;
      if (!previous) return false;

      const output = graphicsOutput();
      let accepted = false;

      if (output?.clear) {
        try {
          accepted = Boolean(output.clear(previous.id));
        } catch {
          accepted = false;
        }
      }

      if (!accepted && output && previous.clearSequence) {
        try {
          accepted = output.queue({
            id: previous.id,
            x: previous.x,
            y: previous.y,
            w: previous.w,
            h: previous.h,
            protocol: previous.protocol,
            sequence: previous.clearSequence,
            op: "clear",
          });
        } catch {
          accepted = false;
        }
      }

      if (accepted) {
        if (options.markPendingRepaint ?? true) rawClearPendingRepaint.value = previous;
        lastDrawnGraphic.value = null;
        trace("raw-clear", {
          x: previous.x,
          y: previous.y,
          w: previous.w,
          h: previous.h,
        });
      }

      return accepted;
    }

    function queueDrawGraphic(
      output: TerminalGraphicsOutput,
      current: ResolvedTerminalGraphic,
      rect: Rect,
    ): boolean {
      const clearSequence = resolveClearSequence(current);
      const drawKey = terminalDrawKey(current, rect, clearSequence);
      const previous = lastDrawnGraphic.value;

      const previousStillActive = previous
        ? typeof output.isActive === "function"
          ? output.isActive(previous.id)
          : true
        : false;

      if (previous?.drawKey === drawKey && previousStillActive) return false;
      if (previousStillActive) {
        if (!queueClearLastGraphic({ markPendingRepaint: false })) return false;
      } else if (previous) {
        lastDrawnGraphic.value = null;
        rawClearPendingRepaint.value = null;
      }

      let accepted = false;
      try {
        accepted = output.queue({
          id: rawId,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
          protocol: current.protocol,
          sequence: current.sequence,
          clearSequence,
          fallbackText: current.fallback,
        });
      } catch {
        accepted = false;
      }

      if (!accepted) {
        lastDrawnGraphic.value = null;
        if (rawDrawRejectedKey.value !== drawKey) {
          rawDrawRejectedKey.value = drawKey;
          scheduler.invalidate({ priority: "low", reason: "data" });
        }
        return false;
      }

      rawDrawRejectedKey.value = null;
      rawClearPendingRepaint.value = null;
      lastDrawnGraphic.value = {
        id: rawId,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        protocol: current.protocol,
        clearSequence,
        drawKey,
      };
      lastRawSkipScrollKey = "";
      return true;
    }

    const showingInitialLoadingText = computed(() => status.value === "loading" && !graphic.value);

    const fullRect = computed<Rect>(() => {
      const current = graphic.value;
      const reserved = reservedTerminalGraphicSize.value;
      const reservedRows =
        current?.type === "terminal"
          ? undefined
          : status.value === "idle" && reserved?.key === stableGraphicKey.value
            ? reserved.rows
            : undefined;
      const textLines =
        current?.type === "text" ? splitTextOutput(current.text) : splitTextOutput(fallbackText());
      const height =
        props.h ??
        (current?.type === "terminal" ? current.rows : undefined) ??
        reservedRows ??
        Math.max(1, textLines.length);
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

    const rawCanRender = computed(() => {
      void graphicsOutputVersion.value;
      const current = graphic.value;
      const output = graphicsOutput();
      const full = fullRect.value;
      const abs = absRect.value;
      const size = normalizeTerminalGraphicSize(full.w, full.h);
      return (
        current?.type === "terminal" &&
        size != null &&
        Boolean(output?.capabilities.supported) &&
        output?.capabilities.preferredProtocol === current.protocol &&
        abs.x === full.x &&
        abs.y === full.y &&
        abs.w === full.w &&
        abs.h === full.h
      );
    });

    const rawOutputCanRenderValue = computed(() => {
      void graphicsOutputVersion.value;
      return rawOutputCanRender();
    });

    const rawSuppressedByScroll = computed(
      () => props.suspended || (props.suspendRawWhileScrolling && isParentScrolling.value),
    );

    const rawCanQueue = computed(() => rawCanRender.value && !rawSuppressedByScroll.value);

    function traceRawSkipScrollOnce(reason: string): void {
      const r = absRect.value;
      const key = [
        reason,
        graphicsActivityVersion.value,
        stableGraphicKey.value,
        r.x,
        r.y,
        r.w,
        r.h,
      ].join(":");

      if (lastRawSkipScrollKey === key) return;
      lastRawSkipScrollKey = key;
      trace("raw-skip-scroll", { reason });
    }

    function hasPaintableRect(): boolean {
      const r = absRect.value;
      return visible.value && r.w > 0 && r.h > 0;
    }

    function rawOutputCanRender(): boolean {
      const output = graphicsOutput();
      const full = fullRect.value;
      const abs = absRect.value;
      const size = normalizeTerminalGraphicSize(full.w, full.h);
      return (
        size != null &&
        hasPaintableRect() &&
        Boolean(output?.capabilities.supported) &&
        abs.x === full.x &&
        abs.y === full.y &&
        abs.w === full.w &&
        abs.h === full.h
      );
    }

    function renderDeferReason(): string | null {
      if (props.suspended) return "suspended";
      if (props.deferRenderUntilVisible && !hasPaintableRect()) return "not-visible";
      if (props.suspendRenderWhileScrolling && isParentScrolling.value) return "scrolling";
      return null;
    }

    function shouldDeferRender(): boolean {
      return renderDeferReason() != null;
    }

    function shouldRerenderForGraphicsOutputChange(): boolean {
      if (!props.renderer) return false;
      if (!props.content.trim()) return false;
      if (shouldDeferRender()) return false;
      if (rawSuppressedByScroll.value) return false;

      const protocol = currentCapabilities().protocol;
      return (
        lastRenderProtocol != null &&
        (lastRenderProtocol !== protocol ||
          lastRenderGraphicsOutputVersion !== graphicsOutputVersion.value)
      );
    }

    function setDeferredFallback(content: string): void {
      graphic.value = { type: "text", text: content.trim() ? fallbackText() : "" };
      lastRenderedContent = content;
      status.value = "idle";
      error.value = "";
      bump();
    }

    function resolveRendererContext(signal: AbortSignal): TAgentTerminalGraphicRendererContext {
      const capabilities = currentCapabilities();
      const visibleNow = hasPaintableRect();
      const rawVisible = rawOutputCanRenderValue.value && !rawSuppressedByScroll.value;
      return {
        kind: props.kind,
        width: props.w,
        height: props.h,
        final: props.final,
        streaming: props.streaming,
        protocol: capabilities.protocol,
        capabilities,
        signal,
        imageId: imageId.value,
        placementId: placementId.value,
        visible: visibleNow,
        rawVisible,
        scrolling: isParentScrolling.value,
        cacheKey: props.cacheKey,
        viewport: {
          visible: visibleNow,
          rawVisible,
          scrolling: isParentScrolling.value,
          rect: absRect.value,
          fullRect: fullRect.value,
        },
      };
    }

    async function renderNow(version: number): Promise<void> {
      const protocol = currentCapabilities().protocol;
      recordTerminalGraphicTrace({
        type: "request",
        id: rawId,
        key: props.cacheKey ?? smallHash(props.content),
        protocol: isTerminalGraphicsProtocol(protocol) ? protocol : undefined,
      });

      const content = props.content;
      if (!content.trim()) {
        abortCurrentRender("superseded");
        if (!alive || version !== renderVersion) return;
        graphic.value = { type: "text", text: "" };
        lastRenderedContent = content;
        status.value = "ready";
        error.value = "";
        bump();
        return;
      }

      const renderer = props.renderer;
      if (!renderer) {
        abortCurrentRender("superseded");
        if (!alive || version !== renderVersion) return;
        graphic.value = { type: "text", text: fallbackText() };
        lastRenderedContent = content;
        status.value = "ready";
        error.value = "";
        bump();
        return;
      }

      const deferred = renderDeferReason();
      if (deferred) {
        abortCurrentRender(deferred);
        if (!alive || version !== renderVersion) return;
        setDeferredFallback(content);
        traceDeferOnce(deferred);
        return;
      }

      abortCurrentRender("superseded");
      lastDeferTraceKey = "";
      const abort = new AbortController();
      renderAbort = abort;
      const startedAt = nowTerminalGraphicTraceTime();

      status.value = "loading";
      error.value = "";
      trace("render-start");
      bump();

      try {
        const contextGraphicsOutputVersion = graphicsOutputVersion.value;
        const context = resolveRendererContext(abort.signal);
        lastRenderRawVisible = context.rawVisible;
        lastRenderProtocol = context.protocol;
        lastRenderGraphicsOutputVersion = contextGraphicsOutputVersion;
        const result = await renderer(content, context);
        if (abort.signal.aborted) return;
        if (!alive || version !== renderVersion) return;
        const normalized = normalizeResult(result);
        rememberTerminalGraphicSize(normalized);
        graphic.value = normalized;
        lastRenderedContent = content;
        status.value = "ready";
        error.value = "";
        trace("render-end", {
          durationMs: nowTerminalGraphicTraceTime() - startedAt,
          sequenceChars: normalized.type === "terminal" ? normalized.sequence.length : 0,
          sequenceBytes: normalized.type === "terminal" ? normalized.sequenceBytes : 0,
        });
        bump();
      } catch (err) {
        if (abort.signal.aborted) return;
        if (!alive || version !== renderVersion) return;
        graphic.value = { type: "text", text: fallbackText() };
        lastRenderedContent = content;
        status.value = "ready";
        error.value = errorMessage(err);
        trace("render-end", {
          durationMs: nowTerminalGraphicTraceTime() - startedAt,
          reason: error.value,
        });
        bump();
      } finally {
        if (renderAbort === abort) renderAbort = null;
      }
    }

    function scheduleRender(options: Readonly<{ clearLastGraphic?: boolean }> = {}): void {
      const version = ++renderVersion;
      if (options.clearLastGraphic ?? true) queueClearLastGraphic();

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
      if (accepted === false) void renderNow(version);
    }

    watch(
      [
        () => props.content,
        () => props.kind,
        () => props.renderer,
        () => props.w,
        () => props.h,
        () => props.streaming,
        () => props.final,
        () => props.deferRenderUntilVisible,
        () => props.suspendRawWhileScrolling,
        () => props.suspendRenderWhileScrolling,
        () => props.scrolling,
        () => props.suspended,
        () => props.cacheKey,
      ],
      () => {
        scheduleRender();
      },
      { immediate: true },
    );

    watch(
      () => props.fallback,
      () => {
        const current = graphic.value;
        if (current?.type === "terminal") {
          if (current.fallbackFromProps) {
            graphic.value = { ...current, fallback: fallbackText() };
            bump();
            scheduler.invalidate({ priority: "low", reason: "data" });
            return;
          }
          scheduleRender({ clearLastGraphic: false });
          return;
        }
        scheduleRender();
      },
    );

    onBeforeUnmount(() => {
      alive = false;
      renderVersion++;
      unsubscribeGraphicsOutput();
      abortCurrentRender("unmount");
      scheduler.cancelFrameTask?.(frameTaskId);
      queueClearLastGraphic();
    });

    const displayLines = computed<readonly string[]>(() => {
      if (showingInitialLoadingText.value) return splitTextOutput(props.loadingText);
      const current = graphic.value;
      if (!current) return splitTextOutput(fallbackText());
      if (current.type === "terminal" && rawCanQueue.value) {
        const clearSequence = resolveClearSequence(current);
        const drawKey = terminalDrawKey(current, fullRect.value, clearSequence);
        if (rawDrawRejectedKey.value !== drawKey) return markRaw([""]);
      }
      const text = current.type === "terminal" ? current.fallback : current.text;
      const lines = splitTextOutput(text);
      return text.trim().length > 0 && !hasVisibleOutput(lines)
        ? splitTextOutput(fallbackText())
        : lines;
    });

    const currentStyle = computed<Style>(() => {
      if (error.value) return props.errorStyle ?? props.style ?? defaultStyle.value;
      if (showingInitialLoadingText.value) {
        return props.loadingStyle ?? props.style ?? defaultStyle.value;
      }
      return props.style ?? defaultStyle.value;
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
        rawOutputCanRenderValue.value,
        rawCanRender.value,
        rawCanQueue.value,
        rawClearPendingRepaint.value,
        rawDrawRejectedKey.value,
        rawSuppressedByScroll.value,
        isParentScrolling.value,
        graphicsActivityVersion.value,
        graphicsOutputVersion.value,
      ],
      paint: (dirtyRows) => {
        withTextWidthProvider(widthProvider, () => {
          if (!visible.value) {
            queueClearLastGraphic();
            return;
          }

          const r = absRect.value;
          const full = fullRect.value;
          if (r.w <= 0 || r.h <= 0) {
            queueClearLastGraphic();
            return;
          }

          const style = currentStyle.value;
          const out = displayLines.value;
          const dx = Math.max(0, Math.floor(r.x - full.x));
          const fullY = Math.floor(full.y);
          const current = graphic.value;
          const output = graphicsOutput();
          const clearingRawGraphic =
            rawClearPendingRepaint.value != null || lastDrawnGraphic.value != null;
          const clearOwnedRegion =
            props.clear ||
            clearingRawGraphic ||
            (current?.type === "terminal" && rawCanQueue.value);
          const blank = clearOwnedRegion ? spaces(r.w) : "";

          const paintRow = (y: number) => {
            if (y < r.y || y >= r.y + r.h) return;

            const rowIndex = y - fullY;
            if (rowIndex < 0 || rowIndex >= out.length) {
              if (clearOwnedRegion) terminal.write(blank, { x: r.x, y, style });
              return;
            }

            const src = out[rowIndex] ?? "";
            const clipped = dx > 0 ? sliceByCellsRange(src, dx, dx + r.w) : sliceByCells(src, r.w);
            const value = clearOwnedRegion ? padEndByCells(clipped, r.w) : clipped;
            if (value || clearOwnedRegion) terminal.write(value, { x: r.x, y, style });
          };

          if (dirtyRows?.length) {
            for (const y of dirtyRows) paintRow(y);
          } else {
            for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
          }

          if (
            current?.type === "terminal" &&
            output?.capabilities.supported &&
            output.capabilities.preferredProtocol === current.protocol &&
            rawCanQueue.value
          ) {
            if (queueDrawGraphic(output, current, full)) {
              trace("raw-draw", {
                sequenceChars: current.sequence.length,
                sequenceBytes: current.sequenceBytes,
                x: full.x,
                y: full.y,
                w: full.w,
                h: full.h,
              });
            }
          } else {
            if (current?.type === "terminal" && rawSuppressedByScroll.value) {
              traceRawSkipScrollOnce(isParentScrolling.value ? "scrolling" : "suspended");
            }
            queueClearLastGraphic({ markPendingRepaint: false });
          }
          if (clearingRawGraphic) rawClearPendingRepaint.value = null;
        });
      },
    }));

    watch(
      [
        visible,
        rawOutputCanRenderValue,
        rawCanRender,
        rawCanQueue,
        rawSuppressedByScroll,
        isParentScrolling,
        graphicsActivityVersion,
        graphicsOutputVersion,
        () => absRect.value.x,
        () => absRect.value.y,
        () => absRect.value.w,
        () => absRect.value.h,
        () => fullRect.value.x,
        () => fullRect.value.y,
        () => fullRect.value.w,
        () => fullRect.value.h,
      ],
      () => {
        if (!alive) return;

        const deferred = renderDeferReason();
        if (deferred) {
          abortCurrentRender(deferred);
          if (status.value === "loading" || !graphic.value || lastRenderedContent !== props.content)
            setDeferredFallback(props.content);
          traceDeferOnce(deferred);
        }

        if (!visible.value || !rawCanQueue.value) queueClearLastGraphic();

        const shouldRetryTemporaryFallback =
          Boolean(props.renderer) &&
          props.content.trim().length > 0 &&
          graphic.value?.type === "text" &&
          !lastRenderRawVisible &&
          rawOutputCanRenderValue.value &&
          !rawSuppressedByScroll.value;
        const shouldRerenderForOutputChange = shouldRerenderForGraphicsOutputChange();

        if (
          !shouldDeferRender() &&
          (!graphic.value ||
            status.value === "idle" ||
            shouldRetryTemporaryFallback ||
            shouldRerenderForOutputChange)
        ) {
          scheduleRender();
          return;
        }

        scheduler.invalidate({ priority: "low", reason: "data" });
      },
      { flush: "post" },
    );

    return () => h("span", rootProps);
  },
});
