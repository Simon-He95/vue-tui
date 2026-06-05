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
  markRaw,
  onBeforeUnmount,
  shallowRef,
  watch,
} from "vue";
import { getTerminalGraphicsOutput } from "../../renderer/terminal-graphics.js";
import {
  createKittyDeleteGraphicsSequence,
  isSafeTerminalGraphicsSequence,
  sanitizeTerminalFallbackText,
  validateTerminalGraphicFrame,
} from "../../renderer/terminal-graphics.js";
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

export type TAgentTerminalGraphicKind = "image" | "math";

export type TAgentTerminalGraphicRendererContext = Readonly<{
  kind: TAgentTerminalGraphicKind;
  width: number;
  height?: number;
  final: boolean;
  streaming: boolean;
  protocol: TerminalGraphicsResolvedProtocol;
  capabilities: TerminalGraphicsCapabilities;
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
      protocol?: TerminalGraphicsProtocol;
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
  fallback: { type: String, default: "" },
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
} as const;

export type TAgentTerminalGraphicProps = ExtractPublicPropTypes<typeof tAgentTerminalGraphicProps>;

type ResolvedTerminalGraphic = Readonly<{
  type: "terminal";
  protocol: TerminalGraphicsProtocol;
  sequence: string;
  fallback: string;
  clearSequence?: string;
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
    smallHash(current.sequence),
    smallHash(clearSequence ?? ""),
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

    const status = shallowRef<TAgentTerminalGraphicStatus>("idle");
    const error = shallowRef("");
    const graphic = shallowRef<ResolvedGraphic | null>(null);
    const documentVersion = shallowRef(0);

    let builtOnce = false;
    let renderVersion = 0;
    let alive = true;
    const rawId = `TAgentTerminalGraphic:${instance?.uid ?? "unknown"}`;
    const frameTaskId = `${rawId}:render`;
    const lastDrawnGraphic = shallowRef<LastDrawnGraphic | null>(null);

    const graphicsOutput = () => getTerminalGraphicsOutput(terminal);
    const fallbackText = () => props.fallback || props.content;

    function bump(): void {
      documentVersion.value++;
    }

    function resolveRendererContext(): TAgentTerminalGraphicRendererContext {
      const capabilities = graphicsOutput()?.capabilities ?? NO_GRAPHICS_CAPABILITIES;
      return {
        kind: props.kind,
        width: props.w,
        height: props.h,
        final: props.final,
        streaming: props.streaming,
        protocol: capabilities.protocol,
        capabilities,
      };
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
      if ("type" in result && result.type === "text") {
        return {
          type: "text",
          text: result.text,
        };
      }
      if ("text" in result) {
        return {
          type: "text",
          text: result.text,
        };
      }

      const maybeRaw = result as Readonly<{
        sequence?: unknown;
        protocol?: TerminalGraphicsProtocol;
        fallback?: unknown;
        clearSequence?: unknown;
        cols?: unknown;
        rows?: unknown;
      }>;
      const sequence = typeof maybeRaw.sequence === "string" ? maybeRaw.sequence : "";
      const protocol = maybeRaw.protocol;

      if (!sequence || !protocol) {
        return {
          type: "text",
          text: typeof maybeRaw.fallback === "string" ? maybeRaw.fallback : fallbackText(),
        };
      }

      return {
        type: "terminal",
        protocol,
        sequence,
        fallback: typeof maybeRaw.fallback === "string" ? maybeRaw.fallback : fallbackText(),
        clearSequence:
          typeof maybeRaw.clearSequence === "string" ? maybeRaw.clearSequence : undefined,
        cols: positiveInt(maybeRaw.cols),
        rows: positiveInt(maybeRaw.rows),
      };
    }

    function defaultClearSequence(protocol: TerminalGraphicsProtocol): string {
      return protocol === "kitty" ? createKittyDeleteGraphicsSequence({ currentCell: true }) : "";
    }

    function resolveClearSequence(current: ResolvedTerminalGraphic): string | undefined {
      const candidate = current.clearSequence ?? defaultClearSequence(current.protocol);
      if (!candidate) return undefined;
      return isSafeTerminalGraphicsSequence(candidate, current.protocol, "clear")
        ? candidate
        : undefined;
    }

    function queueClearLastGraphic(): void {
      const previous = lastDrawnGraphic.value;
      if (!previous) return;

      const output = graphicsOutput();
      if (output) {
        if (previous.clearSequence) {
          output.queue({
            id: previous.id,
            x: previous.x,
            y: previous.y,
            w: previous.w,
            h: previous.h,
            protocol: previous.protocol,
            sequence: previous.clearSequence,
            op: "clear",
          });
        } else {
          output.clear?.(previous.id);
        }
      }

      lastDrawnGraphic.value = null;
    }

    function queueDrawGraphic(
      output: TerminalGraphicsOutput,
      current: ResolvedTerminalGraphic,
      rect: Rect,
    ): void {
      const clearSequence = resolveClearSequence(current);
      const drawKey = terminalDrawKey(current, rect, clearSequence);
      const previous = lastDrawnGraphic.value;

      if (previous?.drawKey === drawKey) return;
      if (previous) queueClearLastGraphic();

      output.queue({
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
    }

    async function renderNow(version: number): Promise<void> {
      const content = props.content;
      if (!content.trim()) {
        if (!alive || version !== renderVersion) return;
        graphic.value = { type: "text", text: "" };
        status.value = "ready";
        error.value = "";
        bump();
        return;
      }

      const renderer = props.renderer;
      if (!renderer) {
        if (!alive || version !== renderVersion) return;
        graphic.value = { type: "text", text: fallbackText() };
        status.value = "ready";
        error.value = "";
        bump();
        return;
      }

      status.value = "loading";
      error.value = "";
      bump();

      try {
        const result = await renderer(content, resolveRendererContext());
        if (!alive || version !== renderVersion) return;
        graphic.value = normalizeResult(result);
        status.value = "ready";
        error.value = "";
        bump();
      } catch (err) {
        if (!alive || version !== renderVersion) return;
        graphic.value = { type: "text", text: fallbackText() };
        status.value = "ready";
        error.value = errorMessage(err);
        bump();
      }
    }

    function scheduleRender(): void {
      const version = ++renderVersion;
      queueClearLastGraphic();

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
        () => props.fallback,
        () => props.renderer,
        () => props.w,
        () => props.h,
        () => props.streaming,
        () => props.final,
      ],
      () => {
        scheduleRender();
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      alive = false;
      renderVersion++;
      scheduler.cancelFrameTask?.(frameTaskId);
      queueClearLastGraphic();
    });

    const showingInitialLoadingText = computed(() => status.value === "loading" && !graphic.value);

    const fullRect = computed<Rect>(() => {
      const current = graphic.value;
      const textLines =
        current?.type === "text" ? splitTextOutput(current.text) : splitTextOutput(fallbackText());
      const height =
        props.h ??
        (current?.type === "terminal" ? current.rows : undefined) ??
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
      const current = graphic.value;
      const output = graphicsOutput();
      const full = fullRect.value;
      const abs = absRect.value;
      return (
        current?.type === "terminal" &&
        Boolean(output?.capabilities.supported) &&
        (output?.capabilities.preferredProtocol === current.protocol ||
          Boolean(output?.capabilities[current.protocol])) &&
        validateTerminalGraphicFrame({
          id: rawId,
          protocol: current.protocol,
          sequence: current.sequence,
          fallbackText: current.fallback,
          width: full.w,
          height: full.h,
        }) != null &&
        abs.x === full.x &&
        abs.y === full.y &&
        abs.w === full.w &&
        abs.h === full.h
      );
    });

    const displayLines = computed<readonly string[]>(() => {
      if (showingInitialLoadingText.value) return splitTextOutput(props.loadingText);
      const current = graphic.value;
      if (!current) return splitTextOutput(fallbackText());
      if (current.type === "terminal" && rawCanRender.value) return markRaw([""]);
      const text = current.type === "terminal" ? current.fallback : current.text;
      const lines = splitTextOutput(text);
      return hasVisibleOutput(lines) ? lines : splitTextOutput(fallbackText());
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
        rawCanRender.value,
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
          const clearOwnedRegion =
            props.clear || (current?.type === "terminal" && rawCanRender.value);
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
            (output.capabilities.preferredProtocol === current.protocol ||
              output.capabilities[current.protocol]) &&
            rawCanRender.value
          ) {
            queueDrawGraphic(output, current, full);
          } else {
            queueClearLastGraphic();
          }
        });
      },
    }));

    watch(
      [
        visible,
        rawCanRender,
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
        if (!lastDrawnGraphic.value) return;
        if (!visible.value || !rawCanRender.value) queueClearLastGraphic();
      },
      { flush: "post" },
    );

    return () => h("span", rootProps);
  },
});
