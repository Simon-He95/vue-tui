import type { ExtractPublicPropTypes, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type {
  TAgentTerminalGraphicRenderer,
  TAgentTerminalGraphicRendererContext,
} from "./TAgentTerminalGraphic.js";
import type { TVideoFrame, TVideoFrameEvent, TVideoFrameSource } from "../video/types.js";
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
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  createKittyPlacementSequence,
  getTerminalGraphicsOutput,
  getTerminalGraphicsOutputVersion,
  subscribeTerminalGraphicsOutput,
} from "../../renderer/terminal-graphics.js";
import { TerminalGraphicsActivityKey } from "../context.js";
import { useLayout } from "../composables/use-layout.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { createFrameMailbox } from "../scheduler/frame-mailbox.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { TAgentTerminalGraphic } from "./TAgentTerminalGraphic.js";

const DEFAULT_MAX_FPS = 12;
const DEFAULT_MAX_PIXEL_WIDTH = 640;
const DEFAULT_MAX_PIXEL_HEIGHT = 360;
const MAX_PIXEL_DIMENSION = 4096;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_GRAY8_FPS = 10;
const MAX_GRAY8_WIDTH = 512;
const MAX_GRAY8_HEIGHT = 256;
const ASCII_RAMP = " .:-=+*#%@";

type NormalizedPngFrame = Readonly<{
  format: "png";
  png: Uint8Array;
  timestampMs: number;
  pixelWidth: number;
  pixelHeight: number;
  fingerprint?: string | number;
}>;

type NormalizedGray8Frame = Readonly<{
  format: "gray8";
  pixels: Uint8Array;
  timestampMs: number;
  pixelWidth: number;
  pixelHeight: number;
  fingerprint?: string | number;
}>;

type NormalizedVideoFrame = NormalizedPngFrame | NormalizedGray8Frame;

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(max, fallback);
  return Math.min(max, parsed);
}

function positiveNumber(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! * 0x1000000 +
      (bytes[offset + 1]! << 16) +
      (bytes[offset + 2]! << 8) +
      bytes[offset + 3]!) >>>
    0
  );
}

function normalizeFrame(frame: TVideoFrame): NormalizedVideoFrame {
  if (frame.format === "gray8") {
    const pixelWidth = Math.floor(Number(frame.pixelWidth));
    const pixelHeight = Math.floor(Number(frame.pixelHeight));
    const pixels = frame.pixels;
    if (
      !Number.isFinite(pixelWidth) ||
      !Number.isFinite(pixelHeight) ||
      pixelWidth <= 0 ||
      pixelHeight <= 0 ||
      pixelWidth > MAX_GRAY8_WIDTH ||
      pixelHeight > MAX_GRAY8_HEIGHT ||
      !(pixels instanceof Uint8Array) ||
      pixels.length !== pixelWidth * pixelHeight ||
      pixels.length > MAX_FRAME_BYTES
    ) {
      throw new Error("TVideo gray8 frame must match its bounded pixel dimensions");
    }

    return {
      format: "gray8",
      pixels,
      timestampMs: Math.max(0, Number(frame.timestampMs) || 0),
      pixelWidth,
      pixelHeight,
      fingerprint: frame.fingerprint,
    };
  }

  const png = frame.png;
  if (!(png instanceof Uint8Array) || png.length < 24 || png.length > MAX_FRAME_BYTES) {
    throw new Error("TVideo frame must contain a bounded PNG Uint8Array");
  }
  if (
    png[0] !== 0x89 ||
    png[1] !== 0x50 ||
    png[2] !== 0x4e ||
    png[3] !== 0x47 ||
    png[4] !== 0x0d ||
    png[5] !== 0x0a ||
    png[6] !== 0x1a ||
    png[7] !== 0x0a
  ) {
    throw new Error("TVideo frame source emitted invalid PNG data");
  }

  const pixelWidth = readUint32(png, 16);
  const pixelHeight = readUint32(png, 20);
  if (
    pixelWidth <= 0 ||
    pixelHeight <= 0 ||
    pixelWidth > MAX_PIXEL_DIMENSION ||
    pixelHeight > MAX_PIXEL_DIMENSION
  ) {
    throw new Error(`TVideo frame has an unsupported size: ${pixelWidth}x${pixelHeight}`);
  }

  return {
    format: "png",
    png,
    timestampMs: Math.max(0, Number(frame.timestampMs) || 0),
    pixelWidth,
    pixelHeight,
    fingerprint: frame.fingerprint,
  };
}

function frameBytes(frame: NormalizedVideoFrame): Uint8Array {
  return frame.format === "gray8" ? frame.pixels : frame.png;
}

function gray8ToAscii(frame: NormalizedGray8Frame, cellWidth: number): string {
  const lines: string[] = [];
  const width = Math.max(1, Math.floor(cellWidth));
  for (let y = 0; y < frame.pixelHeight; y++) {
    let line = "";
    const rowStart = y * frame.pixelWidth;
    for (let x = 0; x < frame.pixelWidth; x++) {
      const value = frame.pixels[rowStart + x]!;
      const glyph = ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, (value * ASCII_RAMP.length) >> 8)];
      line += `${glyph}${glyph}`;
    }
    lines.push(line.slice(0, width));
  }
  return lines.join("\n");
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks: string[] = [];
  let chunk = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1]! : 0;
    const c = hasC ? bytes[index + 2]! : 0;
    chunk +=
      alphabet[a >> 2] +
      alphabet[((a & 0x03) << 4) | (b >> 4)] +
      (hasB ? alphabet[((b & 0x0f) << 2) | (c >> 6)] : "=") +
      (hasC ? alphabet[c & 0x3f] : "=");

    if (chunk.length >= 16_384) {
      chunks.push(chunk);
      chunk = "";
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks.join("");
}

function resolveKittyPlacement(
  frame: NormalizedVideoFrame,
  context: TAgentTerminalGraphicRendererContext,
) {
  const rect = context.viewport.rect;
  const full = context.viewport.fullRect;
  const columns = Math.max(1, Math.floor(rect.w));
  const rows = Math.max(1, Math.floor(rect.h));
  if (full.w <= 0 || full.h <= 0) return { columns, rows };

  const offsetX = Math.max(0, rect.x - full.x);
  const offsetY = Math.max(0, rect.y - full.y);
  const visibleW = Math.max(0, Math.min(rect.w, full.w - offsetX));
  const visibleH = Math.max(0, Math.min(rect.h, full.h - offsetY));
  if (offsetX <= 0 && offsetY <= 0 && visibleW >= full.w && visibleH >= full.h) {
    return { columns, rows };
  }

  const sourceX = Math.max(
    0,
    Math.min(frame.pixelWidth - 1, Math.floor((offsetX * frame.pixelWidth) / full.w)),
  );
  const sourceY = Math.max(
    0,
    Math.min(frame.pixelHeight - 1, Math.floor((offsetY * frame.pixelHeight) / full.h)),
  );
  const sourceRight = Math.max(
    sourceX + 1,
    Math.min(frame.pixelWidth, Math.ceil(((offsetX + visibleW) * frame.pixelWidth) / full.w)),
  );
  const sourceBottom = Math.max(
    sourceY + 1,
    Math.min(frame.pixelHeight, Math.ceil(((offsetY + visibleH) * frame.pixelHeight) / full.h)),
  );

  return {
    columns,
    rows,
    sourceX,
    sourceY,
    sourceWidth: sourceRight - sourceX,
    sourceHeight: sourceBottom - sourceY,
  };
}

function createFrameRenderer(
  frame: NormalizedVideoFrame,
  cellWidth: number,
): TAgentTerminalGraphicRenderer {
  if (frame.format === "gray8") {
    const text = gray8ToAscii(frame, cellWidth);
    return () => ({ type: "text", text });
  }

  let base64: string | undefined;

  return (_content, context) => {
    if (!context.visible || !context.rawVisible) return null;
    base64 ??= bytesToBase64(frame.png);

    if (context.protocol === "kitty") {
      const placement = resolveKittyPlacement(frame, context);
      return {
        type: "sequence",
        protocol: "kitty",
        sequence: createKittyGraphicsSequence(base64, {
          imageId: context.imageId,
          placementId: context.placementId,
          ...placement,
        }),
        resizeSequence: createKittyPlacementSequence({
          imageId: context.imageId,
          placementId: context.placementId,
          ...placement,
        }),
        clearSequence: createKittyDeleteGraphicsSequence({
          imageId: context.imageId,
          placementId: context.placementId,
          freeImageData: true,
        }),
        cols: context.width,
        rows: context.height,
        sourceWidth: frame.pixelWidth,
        sourceHeight: frame.pixelHeight,
      };
    }

    if (context.protocol === "iterm2") {
      return {
        type: "sequence",
        protocol: "iterm2",
        sequence: createIterm2InlineImageSequence(base64, {
          width: context.width,
          height: context.height,
          preserveAspectRatio: true,
          doNotMoveCursor: true,
        }),
        cols: context.width,
        rows: context.height,
        sourceWidth: frame.pixelWidth,
        sourceHeight: frame.pixelHeight,
      };
    }

    return null;
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const tVideoProps = {
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  w: { type: Number, required: true },
  h: { type: Number, required: true },
  zIndex: { type: Number, default: 0 },
  src: { type: String, required: true },
  frameSource: {
    type: Function as PropType<TVideoFrameSource>,
    required: true,
  },
  paused: { type: Boolean, default: false },
  maxFps: { type: Number, default: DEFAULT_MAX_FPS },
  pixelWidth: { type: Number, default: undefined },
  pixelHeight: { type: Number, default: undefined },
  fallback: { type: String, default: "[video]" },
  style: { type: Object as PropType<Style>, default: undefined },
  clear: { type: Boolean, default: true },
} as const;

export type TVideoProps = ExtractPublicPropTypes<typeof tVideoProps>;

export const TVideo = defineComponent({
  name: "TVideo",
  props: tVideoProps,
  emits: {
    frame: (_event: TVideoFrameEvent) => true,
    ended: () => true,
    error: (_error: unknown) => true,
  },
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    const { terminal, scheduler } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility({ provide: true });
    const graphicsActivity = inject(TerminalGraphicsActivityKey, null);
    const frameRenderer = shallowRef<TAgentTerminalGraphicRenderer>();
    const playbackError = shallowRef("");
    const terminalSizeVersion = shallowRef(0);
    const graphicsOutputVersion = shallowRef(getTerminalGraphicsOutputVersion(terminal));
    const placementKey = `TVideo:${instance?.uid ?? "unknown"}`;
    const mailboxId = `${placementKey}:frame`;

    let alive = true;
    let generation = 0;
    let activeAbort: AbortController | null = null;
    let lastSourceBytes: Uint8Array | null = null;
    let lastQueuedBytes: Uint8Array | null = null;
    let lastQueuedFormat: NormalizedVideoFrame["format"] | null = null;
    let lastQueuedFingerprint: string | number | undefined;
    let lastTimestampMs = 0;
    let droppedFrames = 0;
    let pendingEndedGeneration: number | null = null;

    const unsubscribeTerminalResize = terminal.on("resize", () => {
      terminalSizeVersion.value++;
    });
    const unsubscribeGraphicsOutput = subscribeTerminalGraphicsOutput(terminal, () => {
      graphicsOutputVersion.value = getTerminalGraphicsOutputVersion(terminal);
    });

    const resolvedMaxFps = computed(() => positiveNumber(props.maxFps, DEFAULT_MAX_FPS, 60));
    const resolvedPixelSize = computed(() => {
      const desiredWidth = Math.max(2, Math.floor(props.w) * 8);
      const desiredHeight = Math.max(2, Math.floor(props.h) * 16);
      if (props.pixelWidth == null && props.pixelHeight == null) {
        const scale = Math.min(
          1,
          DEFAULT_MAX_PIXEL_WIDTH / desiredWidth,
          DEFAULT_MAX_PIXEL_HEIGHT / desiredHeight,
        );
        return {
          width: Math.max(2, Math.floor(desiredWidth * scale)),
          height: Math.max(2, Math.floor(desiredHeight * scale)),
        };
      }

      if (props.pixelWidth != null && props.pixelHeight == null) {
        const width = positiveInt(props.pixelWidth, desiredWidth, MAX_PIXEL_DIMENSION);
        const inferredHeight = (width * desiredHeight) / desiredWidth;
        const scale = Math.min(1, MAX_PIXEL_DIMENSION / inferredHeight);
        return {
          width: Math.max(2, Math.floor(width * scale)),
          height: Math.max(2, Math.floor(inferredHeight * scale)),
        };
      }

      if (props.pixelWidth == null && props.pixelHeight != null) {
        const height = positiveInt(props.pixelHeight, desiredHeight, MAX_PIXEL_DIMENSION);
        const inferredWidth = (height * desiredWidth) / desiredHeight;
        const scale = Math.min(1, MAX_PIXEL_DIMENSION / inferredWidth);
        return {
          width: Math.max(2, Math.floor(inferredWidth * scale)),
          height: Math.max(2, Math.floor(height * scale)),
        };
      }

      return {
        width: positiveInt(props.pixelWidth, desiredWidth, MAX_PIXEL_DIMENSION),
        height: positiveInt(props.pixelHeight, desiredHeight, MAX_PIXEL_DIMENSION),
      };
    });
    const resolvedPixelWidth = computed(() => resolvedPixelSize.value.width);
    const resolvedPixelHeight = computed(() => resolvedPixelSize.value.height);
    const paintable = computed(() => {
      void terminalSizeVersion.value;
      if (!visible.value) return false;
      const size = terminal.size();
      const terminalRect = {
        x: 0,
        y: 0,
        w: Math.max(0, Math.floor(size.cols)),
        h: Math.max(0, Math.floor(size.rows)),
      };
      const clip = layout.clipRect ? intersectRect(layout.clipRect, terminalRect) : terminalRect;
      if (!clip) return false;
      const rect = translateRect(
        { x: props.x, y: props.y, w: props.w, h: props.h },
        layout.originX,
        layout.originY,
      );
      const visibleRect = intersectRect(rect, clip);
      return Boolean(visibleRect && visibleRect.w > 0 && visibleRect.h > 0);
    });
    const graphicsProtocol = computed(() => {
      void graphicsOutputVersion.value;
      return getTerminalGraphicsOutput(terminal)?.capabilities.preferredProtocol ?? null;
    });
    const preferredFormat = computed<"png" | "gray8">(() =>
      graphicsProtocol.value === "kitty" || graphicsProtocol.value === "iterm2" ? "png" : "gray8",
    );
    const resolvedDecodeFps = computed(() =>
      preferredFormat.value === "gray8"
        ? Math.min(MAX_GRAY8_FPS, resolvedMaxFps.value)
        : resolvedMaxFps.value,
    );
    const resolvedDecodeWidth = computed(() =>
      preferredFormat.value === "gray8"
        ? positiveInt(Math.ceil(props.w / 2), 1, MAX_GRAY8_WIDTH)
        : resolvedPixelWidth.value,
    );
    const resolvedDecodeHeight = computed(() =>
      preferredFormat.value === "gray8"
        ? positiveInt(props.h, 1, MAX_GRAY8_HEIGHT)
        : resolvedPixelHeight.value,
    );
    const shouldPlay = computed(
      () =>
        alive &&
        !props.paused &&
        !graphicsActivity?.scrolling.value &&
        props.src.trim().length > 0 &&
        paintable.value,
    );
    const visibleFallback = computed(() =>
      playbackError.value ? `${props.fallback}: ${playbackError.value}` : props.fallback,
    );

    function commitFrame(frame: NormalizedVideoFrame, dropped: number): void {
      if (!alive) return;
      droppedFrames += dropped;
      frameRenderer.value = markRaw(createFrameRenderer(frame, props.w));
      lastTimestampMs = frame.timestampMs;
      emit("frame", {
        timestampMs: frame.timestampMs,
        pixelWidth: frame.pixelWidth,
        pixelHeight: frame.pixelHeight,
        droppedFrames,
      });
    }

    const mailbox = createFrameMailbox<NormalizedVideoFrame>({
      scheduler,
      id: mailboxId,
      reason: "stream",
      priority: "low",
      apply(frame, _context, meta) {
        commitFrame(frame, meta.dropped);
        if (pendingEndedGeneration === generation) {
          pendingEndedGeneration = null;
          emit("ended");
        }
      },
    });

    function stopPlayback(): void {
      generation++;
      pendingEndedGeneration = null;
      const discardedPendingFrame = mailbox.hasPending();
      mailbox.cancel();
      if (discardedPendingFrame) {
        lastQueuedBytes = null;
        lastQueuedFormat = null;
        lastQueuedFingerprint = undefined;
      }
      activeAbort?.abort();
      activeAbort = null;
    }

    function queueFrame(frame: TVideoFrame, expectedFormat: "png" | "gray8"): void {
      const normalized = normalizeFrame(frame);
      if (normalized.format !== expectedFormat) {
        throw new Error(`TVideo frame source did not provide requested ${expectedFormat} frames`);
      }
      const sourceBytes = frameBytes(normalized);
      const reusesSourceBuffer = sourceBytes === lastSourceBytes;
      lastSourceBytes = sourceBytes;
      const stableFrame: NormalizedVideoFrame = reusesSourceBuffer
        ? normalized.format === "gray8"
          ? { ...normalized, pixels: new Uint8Array(normalized.pixels) }
          : { ...normalized, png: new Uint8Array(normalized.png) }
        : normalized;
      const bytes = frameBytes(stableFrame);
      const sameFingerprint =
        normalized.format === lastQueuedFormat &&
        normalized.fingerprint != null &&
        lastQueuedFingerprint != null &&
        normalized.fingerprint === lastQueuedFingerprint;
      const canCompareBytes =
        normalized.fingerprint == null && lastQueuedFingerprint == null && !reusesSourceBuffer;
      if (
        sameFingerprint ||
        (canCompareBytes &&
          normalized.format === lastQueuedFormat &&
          lastQueuedBytes &&
          sameBytes(lastQueuedBytes, sourceBytes))
      ) {
        lastQueuedBytes = bytes;
        lastQueuedFormat = normalized.format;
        lastQueuedFingerprint = normalized.fingerprint;
        lastTimestampMs = Math.max(lastTimestampMs, normalized.timestampMs);
        if (mailbox.hasPending()) mailbox.replacePending(stableFrame);
        return;
      }

      lastQueuedBytes = bytes;
      lastQueuedFormat = normalized.format;
      lastQueuedFingerprint = normalized.fingerprint;
      if (!mailbox.queue(stableFrame)) {
        commitFrame(stableFrame, 0);
        scheduler.invalidate({ priority: "low", reason: "stream" });
      }
    }

    function startPlayback(): void {
      stopPlayback();
      if (!shouldPlay.value) return;

      const currentGeneration = generation;
      const abort = new AbortController();
      activeAbort = abort;
      playbackError.value = "";

      const source = props.frameSource;
      const format = preferredFormat.value;
      const context = {
        src: props.src,
        signal: abort.signal,
        maxFps: resolvedDecodeFps.value,
        pixelWidth: resolvedDecodeWidth.value,
        pixelHeight: resolvedDecodeHeight.value,
        startAtMs: lastTimestampMs,
        preferredFormat: format,
      };

      void (async () => {
        try {
          const frames = await source(context);
          for await (const frame of frames) {
            if (!alive || abort.signal.aborted || currentGeneration !== generation) return;
            queueFrame(frame, format);
          }
          if (!alive || abort.signal.aborted || currentGeneration !== generation) return;
          if (mailbox.hasPending()) pendingEndedGeneration = currentGeneration;
          else emit("ended");
        } catch (error) {
          if (!alive || abort.signal.aborted || currentGeneration !== generation) return;
          playbackError.value = errorMessage(error);
          emit("error", error);
          scheduler.invalidate({ priority: "low", reason: "data" });
        } finally {
          if (activeAbort === abort) activeAbort = null;
        }
      })();
    }

    watch(
      [
        () => props.src,
        () => props.frameSource,
        shouldPlay,
        resolvedDecodeFps,
        resolvedDecodeWidth,
        resolvedDecodeHeight,
        preferredFormat,
      ],
      (next, previous) => {
        const sourceChanged = !previous || next[0] !== previous[0] || next[1] !== previous[1];
        const formatChanged = !previous || next[6] !== previous[6];
        if (sourceChanged || formatChanged) {
          lastSourceBytes = null;
          lastQueuedBytes = null;
          lastQueuedFormat = null;
          lastQueuedFingerprint = undefined;
          if (sourceChanged) {
            lastTimestampMs = 0;
            droppedFrames = 0;
          }
          playbackError.value = "";
          frameRenderer.value = undefined;
        }
        startPlayback();
      },
      { immediate: true, flush: "post" },
    );

    onBeforeUnmount(() => {
      alive = false;
      stopPlayback();
      mailbox.dispose();
      unsubscribeTerminalResize();
      unsubscribeGraphicsOutput();
    });

    return () =>
      h("span", rootProps, [
        h(TAgentTerminalGraphic, {
          x: props.x,
          y: props.y,
          w: props.w,
          h: props.h,
          zIndex: props.zIndex,
          content: props.src.trim() ? props.src : "video",
          fallback: visibleFallback.value,
          style: props.style,
          clear: props.clear,
          final: false,
          streaming: true,
          renderer: frameRenderer.value,
          placementKey,
          preserveRawWhileRendering: true,
          ignoreSamePlaneRawCoverage: true,
          suspended: !paintable.value,
        }),
      ]);
  },
});
