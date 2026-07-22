import type { TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/manager/types.js";
import type { ExtractPublicPropTypes, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type {
  TAgentTerminalGraphicRenderer,
  TAgentTerminalGraphicRendererContext,
} from "./TAgentTerminalGraphic.js";
import type {
  TVideoFrame,
  TVideoFrameEvent,
  TVideoFrameSource,
  TVideoPlaybackRate,
} from "../video/types.js";
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
import { TText } from "./TText.js";
import { TView } from "./TView.js";

const DEFAULT_MAX_FPS = 12;
const DEFAULT_MAX_PIXEL_WIDTH = 640;
const DEFAULT_MAX_PIXEL_HEIGHT = 360;
const MAX_PIXEL_DIMENSION = 4096;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_GRAY8_FPS = 10;
const MAX_GRAY8_WIDTH = 512;
const MAX_GRAY8_HEIGHT = 256;
const ASCII_RAMP = " .:-=+*#%@";
const CONTROL_REFRESH_MS = 250;
const PLAYBACK_RATES = [1, 2, 3] as const;

type NormalizedPngFrame = Readonly<{
  format: "png";
  png: Uint8Array;
  timestampMs: number;
  pixelWidth: number;
  pixelHeight: number;
  fingerprint?: string | number;
  durationMs?: number;
}>;

type NormalizedGray8Frame = Readonly<{
  format: "gray8";
  pixels: Uint8Array;
  timestampMs: number;
  pixelWidth: number;
  pixelHeight: number;
  fingerprint?: string | number;
  durationMs?: number;
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

function playbackRate(value: unknown): TVideoPlaybackRate {
  return value === 2 || value === 3 ? value : 1;
}

function optionalDuration(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
      durationMs: optionalDuration(frame.durationMs),
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
    durationMs: optionalDuration(frame.durationMs),
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
  paused: { type: Boolean, default: undefined },
  playbackRate: { type: Number as PropType<TVideoPlaybackRate>, default: undefined },
  controls: { type: Boolean, default: false },
  durationMs: { type: Number, default: undefined },
  loop: { type: Boolean, default: false },
  maxFps: { type: Number, default: DEFAULT_MAX_FPS },
  pixelWidth: { type: Number, default: undefined },
  pixelHeight: { type: Number, default: undefined },
  fallback: { type: String, default: "[video]" },
  style: { type: Object as PropType<Style>, default: undefined },
  clear: { type: Boolean, default: true },
} as const;

export type TVideoProps = ExtractPublicPropTypes<typeof tVideoProps>;

export type TVideoSeekEvent = Readonly<{
  timestampMs: number;
  durationMs?: number;
}>;

export const TVideo = defineComponent({
  name: "TVideo",
  props: tVideoProps,
  emits: {
    frame: (_event: TVideoFrameEvent) => true,
    ended: () => true,
    error: (_error: unknown) => true,
    seek: (_event: TVideoSeekEvent) => true,
    "update:paused": (_paused: boolean) => true,
    "update:playbackRate": (_rate: TVideoPlaybackRate) => true,
  },
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    const { terminal, scheduler } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility({ provide: true });
    const graphicsActivity = inject(TerminalGraphicsActivityKey, null);
    const frameRenderer = shallowRef<TAgentTerminalGraphicRenderer>();
    const playbackError = shallowRef("");
    const internalPaused = shallowRef(props.paused ?? false);
    const internalPlaybackRate = shallowRef<TVideoPlaybackRate>(playbackRate(props.playbackRate));
    const discoveredDurationMs = shallowRef<number>();
    const displayedTimestampMs = shallowRef(0);
    const seekPreviewMs = shallowRef<number>();
    const seeking = shallowRef(false);
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
    let controlPointerCapture: Readonly<{
      pointerId: number;
      target: {
        releasePointerCapture?: (pointerId: number) => void;
      };
    }> | null = null;

    const unsubscribeTerminalResize = terminal.on("resize", () => {
      terminalSizeVersion.value++;
    });
    const unsubscribeGraphicsOutput = subscribeTerminalGraphicsOutput(terminal, () => {
      graphicsOutputVersion.value = getTerminalGraphicsOutputVersion(terminal);
    });

    const showControls = computed(
      () => props.controls && Math.floor(props.w) >= 14 && Math.floor(props.h) >= 2,
    );
    const videoHeight = computed(() =>
      Math.max(1, Math.floor(props.h) - Number(showControls.value)),
    );
    const resolvedMaxFps = computed(() => positiveNumber(props.maxFps, DEFAULT_MAX_FPS, 60));
    const resolvedPixelSize = computed(() => {
      const desiredWidth = Math.max(2, Math.floor(props.w) * 8);
      const desiredHeight = Math.max(2, videoHeight.value * 16);
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
        { x: props.x, y: props.y, w: props.w, h: videoHeight.value },
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
        ? positiveInt(videoHeight.value, 1, MAX_GRAY8_HEIGHT)
        : resolvedPixelHeight.value,
    );
    const resolvedDurationMs = computed(
      () => optionalDuration(props.durationMs) ?? discoveredDurationMs.value,
    );
    const controlLayout = computed(() => {
      const width = Math.max(1, Math.floor(props.w));
      const ratesX = Math.max(5, width - 8);
      const progressX = 3;
      return {
        width,
        ratesX,
        progressX,
        progressWidth: Math.max(1, ratesX - progressX - 1),
      };
    });
    const effectivePaused = computed(() => props.paused ?? internalPaused.value);
    const effectivePlaybackRate = computed(() =>
      props.playbackRate == null ? internalPlaybackRate.value : playbackRate(props.playbackRate),
    );
    const rateStyles = computed(() =>
      PLAYBACK_RATES.map((rate) =>
        rate === effectivePlaybackRate.value ? { ...props.style, inverse: true } : props.style,
      ),
    );
    const progressText = computed(() => {
      const { progressWidth } = controlLayout.value;
      const duration = resolvedDurationMs.value;
      if (!duration) return "-".repeat(progressWidth);
      const timestamp = seekPreviewMs.value ?? displayedTimestampMs.value;
      const ratio = Math.max(0, Math.min(1, timestamp / duration));
      const marker = Math.round(ratio * Math.max(0, progressWidth - 1));
      let text = "";
      for (let index = 0; index < progressWidth; index++) {
        text += index < marker ? "=" : index === marker ? ">" : "-";
      }
      return text;
    });
    const playbackEnabled = computed(
      () =>
        alive &&
        !effectivePaused.value &&
        !graphicsActivity?.scrolling.value &&
        props.src.trim().length > 0 &&
        paintable.value,
    );
    const shouldPlay = computed(() => playbackEnabled.value && !seeking.value);
    const visibleFallback = computed(() =>
      playbackError.value ? `${props.fallback}: ${playbackError.value}` : props.fallback,
    );

    function timelineTimestamp(timestampMs: number): number {
      const duration = resolvedDurationMs.value;
      if (!duration) return Math.max(0, timestampMs);
      if (props.loop) return Math.max(0, timestampMs) % duration;
      return Math.max(0, Math.min(duration, timestampMs));
    }

    function seekTimestamp(timestampMs: number): number {
      const duration = resolvedDurationMs.value;
      if (!duration) return Math.max(0, timestampMs);
      const end = props.loop ? Math.max(0, duration - 1) : duration;
      return Math.max(0, Math.min(end, timestampMs));
    }

    function updateTimestamp(timestampMs: number, force = false): void {
      const next = timelineTimestamp(timestampMs);
      lastTimestampMs = next;
      if (!showControls.value) return;
      const threshold = CONTROL_REFRESH_MS * effectivePlaybackRate.value;
      if (
        force ||
        next < displayedTimestampMs.value ||
        Math.abs(next - displayedTimestampMs.value) >= threshold
      ) {
        displayedTimestampMs.value = next;
      }
    }

    function commitFrame(frame: NormalizedVideoFrame, dropped: number): void {
      if (!alive) return;
      droppedFrames += dropped;
      frameRenderer.value = markRaw(createFrameRenderer(frame, props.w));
      updateTimestamp(frame.timestampMs);
      const durationMs = resolvedDurationMs.value;
      emit("frame", {
        timestampMs: frame.timestampMs,
        pixelWidth: frame.pixelWidth,
        pixelHeight: frame.pixelHeight,
        droppedFrames,
        ...(durationMs ? { durationMs } : {}),
        playbackRate: effectivePlaybackRate.value,
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

    function resetQueuedFrameIdentity(): void {
      lastSourceBytes = null;
      lastQueuedBytes = null;
      lastQueuedFormat = null;
      lastQueuedFingerprint = undefined;
    }

    function setPaused(paused: boolean): void {
      if (effectivePaused.value === paused) return;
      if (props.paused == null) internalPaused.value = paused;
      emit("update:paused", paused);
    }

    function setPlaybackRate(rate: TVideoPlaybackRate): void {
      const next = playbackRate(rate);
      if (effectivePlaybackRate.value === next) return;
      if (props.playbackRate == null) internalPlaybackRate.value = next;
      emit("update:playbackRate", next);
    }

    function applySeek(timestampMs: number, restart: boolean): void {
      const parsed = Number(timestampMs);
      if (!Number.isFinite(parsed)) return;
      stopPlayback();
      resetQueuedFrameIdentity();
      const next = seekTimestamp(parsed);
      updateTimestamp(next, true);
      seekPreviewMs.value = undefined;
      const durationMs = resolvedDurationMs.value;
      emit("seek", {
        timestampMs: next,
        ...(durationMs ? { durationMs } : {}),
      });
      if (restart) startPlayback(effectivePaused.value);
    }

    function controlCellX(event: TerminalPointerEvent): number {
      return Math.floor(event.cellX - (event.currentTarget?.rect.x ?? 0));
    }

    function previewSeekAt(cellX: number): void {
      const duration = resolvedDurationMs.value;
      if (!duration) return;
      const { progressX, progressWidth } = controlLayout.value;
      const offset = Math.max(0, Math.min(progressWidth - 1, cellX - progressX));
      seekPreviewMs.value =
        progressWidth <= 1 ? 0 : (offset / Math.max(1, progressWidth - 1)) * duration;
    }

    function captureControlPointer(event: TerminalPointerEvent): void {
      const native = event.nativeEvent as
        | (Event & {
            pointerId?: number;
            target?: EventTarget | null;
          })
        | undefined;
      const pointerId = native?.pointerId;
      const target = native?.target as
        | {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
          }
        | undefined;
      if (pointerId == null || !target?.setPointerCapture) return;
      target.setPointerCapture(pointerId);
      controlPointerCapture = { pointerId, target };
    }

    function releaseControlPointer(): void {
      if (!controlPointerCapture) return;
      controlPointerCapture.target.releasePointerCapture?.(controlPointerCapture.pointerId);
      controlPointerCapture = null;
    }

    function rateAt(cellX: number): TVideoPlaybackRate | undefined {
      const offset = cellX - controlLayout.value.ratesX;
      if (offset < 0 || offset % 3 >= 2) return undefined;
      return PLAYBACK_RATES[Math.floor(offset / 3)];
    }

    function onControlPointerDown(event: TerminalPointerEvent): void {
      if (event.button != null && event.button !== 0) return;
      const cellX = controlCellX(event);
      const rate = rateAt(cellX);
      if (cellX <= 1) {
        event.preventDefault();
        event.stopPropagation();
        setPaused(!effectivePaused.value);
        return;
      }
      if (rate) {
        event.preventDefault();
        event.stopPropagation();
        setPlaybackRate(rate);
        return;
      }
      const { progressX, progressWidth } = controlLayout.value;
      if (!resolvedDurationMs.value || cellX < progressX || cellX >= progressX + progressWidth) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      seeking.value = true;
      stopPlayback();
      previewSeekAt(cellX);
      captureControlPointer(event);
    }

    function onControlPointerMove(event: TerminalPointerEvent): void {
      if (!seeking.value) return;
      if (event.buttons === 0) {
        onControlPointerUp(event);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      previewSeekAt(controlCellX(event));
    }

    function onControlPointerUp(event: TerminalPointerEvent): void {
      if (!seeking.value) return;
      event.preventDefault();
      event.stopPropagation();
      previewSeekAt(controlCellX(event));
      const timestampMs = seekPreviewMs.value ?? lastTimestampMs;
      applySeek(timestampMs, false);
      seeking.value = false;
      releaseControlPointer();
      startPlayback(effectivePaused.value);
    }

    function finishControlSeek(): void {
      if (!seeking.value) return;
      const timestampMs = seekPreviewMs.value ?? lastTimestampMs;
      applySeek(timestampMs, false);
      seeking.value = false;
      releaseControlPointer();
      startPlayback(effectivePaused.value);
    }

    function onControlKeydown(event: TerminalKeyboardEvent): void {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        event.stopPropagation();
        setPaused(!effectivePaused.value);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        const index = PLAYBACK_RATES.indexOf(effectivePlaybackRate.value);
        const offset = event.key === "ArrowUp" ? 1 : -1;
        setPlaybackRate(PLAYBACK_RATES[Math.max(0, Math.min(2, index + offset))]!);
        return;
      }
      if (
        !event.repeat &&
        (event.key === "Home" || event.key === "End") &&
        resolvedDurationMs.value
      ) {
        event.preventDefault();
        event.stopPropagation();
        applySeek(event.key === "Home" ? 0 : resolvedDurationMs.value, true);
        return;
      }
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        event.preventDefault();
        event.stopPropagation();
        setPlaybackRate(Number(event.key) as TVideoPlaybackRate);
      }
    }

    function queueFrame(frame: TVideoFrame, expectedFormat: "png" | "gray8"): void {
      let normalized = normalizeFrame(frame);
      if (normalized.format !== expectedFormat) {
        throw new Error(`TVideo frame source did not provide requested ${expectedFormat} frames`);
      }
      if (normalized.durationMs != null && normalized.durationMs !== discoveredDurationMs.value) {
        discoveredDurationMs.value = normalized.durationMs;
      }
      normalized = { ...normalized, timestampMs: timelineTimestamp(normalized.timestampMs) };
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
        updateTimestamp(normalized.timestampMs);
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

    function startPlayback(oneFrame = false): void {
      stopPlayback();
      if (
        !shouldPlay.value &&
        !(
          oneFrame &&
          alive &&
          props.src.trim().length > 0 &&
          paintable.value &&
          !graphicsActivity?.scrolling.value
        )
      ) {
        return;
      }

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
        playbackRate: effectivePlaybackRate.value,
        loop: props.loop,
      };

      void (async () => {
        try {
          const frames = await source(context);
          for await (const frame of frames) {
            if (!alive || abort.signal.aborted || currentGeneration !== generation) return;
            queueFrame(frame, format);
            if (oneFrame) return;
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
      () => props.paused,
      (paused) => {
        if (paused != null) internalPaused.value = paused;
      },
    );

    watch(
      () => props.playbackRate,
      (rate) => {
        if (rate != null) internalPlaybackRate.value = playbackRate(rate);
      },
    );

    watch(
      [
        () => props.src,
        () => props.frameSource,
        playbackEnabled,
        resolvedDecodeFps,
        resolvedDecodeWidth,
        resolvedDecodeHeight,
        preferredFormat,
        effectivePlaybackRate,
        () => props.loop,
      ],
      (next, previous) => {
        const sourceChanged = !previous || next[0] !== previous[0] || next[1] !== previous[1];
        const formatChanged = !previous || next[6] !== previous[6];
        if (sourceChanged || formatChanged) {
          resetQueuedFrameIdentity();
          if (sourceChanged) {
            lastTimestampMs = 0;
            displayedTimestampMs.value = 0;
            discoveredDurationMs.value = undefined;
            seekPreviewMs.value = undefined;
            seeking.value = false;
            releaseControlPointer();
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
      releaseControlPointer();
      mailbox.dispose();
      unsubscribeTerminalResize();
      unsubscribeGraphicsOutput();
    });

    return () => {
      const children = [
        h(TAgentTerminalGraphic, {
          x: props.x,
          y: props.y,
          w: props.w,
          h: videoHeight.value,
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
      ];

      if (showControls.value) {
        const { width, progressX, progressWidth, ratesX } = controlLayout.value;
        children.push(
          h(
            TView,
            {
              x: props.x,
              y: props.y + videoHeight.value,
              w: width,
              h: 1,
              zIndex: props.zIndex,
              focusable: true,
              selectable: false,
              onPointerdown: onControlPointerDown,
              onPointermove: onControlPointerMove,
              onPointerup: onControlPointerUp,
              onKeydown: onControlKeydown,
              onBlur: finishControlSeek,
            },
            () => [
              h(TText, {
                x: 0,
                y: 0,
                w: width,
                value: " ".repeat(width),
                style: props.style,
              }),
              h(TText, {
                x: 0,
                y: 0,
                w: 2,
                value: effectivePaused.value ? "> " : "||",
                style: props.style,
              }),
              h(TText, {
                x: progressX,
                y: 0,
                w: progressWidth,
                value: progressText.value,
                style: props.style,
              }),
              ...PLAYBACK_RATES.map((rate, index) =>
                h(TText, {
                  x: ratesX + index * 3,
                  y: 0,
                  w: 2,
                  value: `${rate}x`,
                  style: rateStyles.value[index],
                }),
              ),
            ],
          ),
        );
      }

      return h("span", rootProps, children);
    };
  },
});
