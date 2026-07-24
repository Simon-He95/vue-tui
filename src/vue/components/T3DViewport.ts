import type { TerminalPointerEvent } from "../../events/manager/types.js";
import type { Style } from "../../core/types.js";
import type {
  TVideoFrame,
  TVideoFrameEvent,
  TVideoFrameFormat,
  TVideoFrameSource,
} from "../video/types.js";
import type { ExtractPublicPropTypes, PropType } from "vue";
import { defineComponent, h, onBeforeUnmount, onUnmounted, watch } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { TVideo } from "./TVideo.js";
import { TView } from "./TView.js";

const DEFAULT_MAX_FPS = 24;
const DEFAULT_AUTO_ROTATE_SPEED = 0.35;
const DEFAULT_POINTER_SENSITIVITY = 0.055;
const VELOCITY_DAMPING_PER_SECOND = 5.5;
const ZOOM_DAMPING_PER_SECOND = 7;
const MAX_ZOOM_VELOCITY = 3;
const DEFAULT_MIN_ZOOM = 0.65;
const DEFAULT_MAX_ZOOM = 1.65;
const DEFAULT_ZOOM_SENSITIVITY = 0.1;
const MAX_PITCH = Math.PI * 0.42;

/** Motion state supplied to every {@link T3DRenderer.render} call. */
export type T3DViewportMotion = Readonly<{
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  pointerX: number;
  pointerY: number;
  pointerSpeed: number;
  hovering: boolean;
  zoom: number;
  zoomVelocity: number;
  hoveredObjectId: number | null;
  selectedObjectId: number | null;
}>;

/** Object metadata returned by an optional {@link T3DRenderer.hitTest}. */
export type T3DHitResult = Readonly<{
  objectId: number;
  label?: string;
  href?: string;
}>;

/** Synchronous pointer context supplied to an optional {@link T3DRenderer.hitTest}. */
export type T3DHitTestContext = Readonly<{
  pointerX: number;
  pointerY: number;
  pixelWidth: number;
  pixelHeight: number;
  cellWidth: number;
  cellHeight: number;
  motion: T3DViewportMotion;
}>;

/** Pull-render context for a single terminal 3D frame. */
export type T3DRenderContext = Readonly<{
  timeMs: number;
  deltaMs: number;
  frame: number;
  pixelWidth: number;
  pixelHeight: number;
  format: TVideoFrameFormat;
  signal: AbortSignal;
  motion: T3DViewportMotion;
}>;

/** Renderer contract used by {@link T3DViewport}. */
export type T3DRenderer = Readonly<{
  render: (context: T3DRenderContext) => TVideoFrame | Promise<TVideoFrame>;
  /** Optional synchronous object picking for hover and click selection. */
  hitTest?: (context: T3DHitTestContext) => T3DHitResult | null;
  dispose?: () => void;
}>;

/** Public methods exposed by {@link T3DViewport}. */
export type T3DViewportHandle = Readonly<{ resetMotion: () => void }>;

export const t3DViewportProps = {
  /** Horizontal position in terminal cells. */
  x: { type: Number, required: true },
  /** Vertical position in terminal cells. */
  y: { type: Number, required: true },
  /** Width in terminal cells. */
  w: { type: Number, required: true },
  /** Height in terminal cells. */
  h: { type: Number, required: true },
  /** Paint and pointer hit-test stacking order. */
  zIndex: { type: Number, default: 0 },
  /** Pull renderer captured at mount; remount the component to replace it. */
  renderer: { type: Object as PropType<T3DRenderer>, required: true },
  /** Stops frame pulling while true. */
  paused: { type: Boolean, default: false },
  /** Maximum requested frames per second. */
  maxFps: { type: Number, default: DEFAULT_MAX_FPS },
  /** Requested source width in pixels; TVideo may adapt it for ASCII output. */
  pixelWidth: { type: Number, default: undefined },
  /** Requested source height in pixels; TVideo may adapt it for ASCII output. */
  pixelHeight: { type: Number, default: undefined },
  /** Text displayed before a frame is available or after rendering fails. */
  fallback: { type: String, default: "[3D viewport]" },
  /** Terminal style applied to fallback and ASCII output. */
  style: { type: Object as PropType<Style>, default: undefined },
  /** Clears cells underneath each video frame. */
  clear: { type: Boolean, default: true },
  /** Enables pointer orbit, wheel zoom, and hover motion tracking. */
  interactive: { type: Boolean, default: true },
  /** Initial yaw angle in radians, also restored by resetMotion(). */
  initialYaw: { type: Number, default: 0 },
  /** Initial pitch angle in radians, also restored by resetMotion(). */
  initialPitch: { type: Number, default: 0 },
  /** Enables continuous yaw rotation when not dragging. */
  autoRotate: { type: Boolean, default: true },
  /** Automatic yaw rotation speed in radians per second. */
  autoRotateSpeed: { type: Number, default: DEFAULT_AUTO_ROTATE_SPEED },
  /** Drag sensitivity in radians per terminal cell. */
  pointerSensitivity: { type: Number, default: DEFAULT_POINTER_SENSITIVITY },
  /** Initial camera zoom, also restored by resetMotion(). */
  initialZoom: { type: Number, default: 1 },
  /** Minimum camera zoom accepted from wheel and trackpad gestures. */
  minZoom: { type: Number, default: DEFAULT_MIN_ZOOM },
  /** Maximum camera zoom accepted from wheel and trackpad gestures. */
  maxZoom: { type: Number, default: DEFAULT_MAX_ZOOM },
  /** Zoom impulse per normalized wheel or trackpad unit. */
  zoomSensitivity: { type: Number, default: DEFAULT_ZOOM_SENSITIVITY },
} as const;

export type T3DViewportProps = ExtractPublicPropTypes<typeof t3DViewportProps>;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
function clampPitch(value: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, value));
}
function zoomBounds(minZoom: number, maxZoom: number): Readonly<{ min: number; max: number }> {
  const first = Math.max(0.01, finite(minZoom, DEFAULT_MIN_ZOOM));
  const second = Math.max(0.01, finite(maxZoom, DEFAULT_MAX_ZOOM));
  return first <= second ? { min: first, max: second } : { min: second, max: first };
}
function clampZoom(value: number, minZoom: number, maxZoom: number): number {
  const { min, max } = zoomBounds(minZoom, maxZoom);
  return Math.max(min, Math.min(max, finite(value, 1)));
}
function normalizedWheelDelta(event: TerminalPointerEvent): number {
  const deltaY = Number(event.deltaY ?? 0);
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  if (event.deltaMode === 1) return deltaY;
  if (event.deltaMode === 2) return Math.max(-3, Math.min(3, deltaY * 3));
  if (event.deltaMode === 0) return deltaY / 100;
  return Number.isInteger(deltaY) && Math.abs(deltaY) <= 3 ? deltaY : deltaY / 100;
}
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function abortError(): Error {
  const error = new Error("T3D viewport render aborted");
  error.name = "AbortError";
  return error;
}
function warnDev(message: string): void {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
  if (nodeEnv !== "production") console.warn(message);
}
function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Browser-safe interactive 3D viewport. Frames are pulled from a renderer and
 * delegated directly to TVideo, which owns frame coalescing and terminal output.
 *
 * @event frame Emitted after TVideo commits a rendered frame.
 * @event error Emitted when the renderer or TVideo frame handling fails.
 */
export const T3DViewport = defineComponent({
  name: "T3DViewport",
  props: t3DViewportProps,
  emits: {
    /** A frame was committed by TVideo. */
    frame: (_event: TVideoFrameEvent) => true,
    /** Rendering or frame processing failed. */
    error: (_error: unknown) => true,
    /** Hovered renderer object changed, or cleared to null. */
    objecthover: (_hit: T3DHitResult | null) => true,
    /** Click-locked renderer object changed, or cleared to null. */
    objectselect: (_hit: T3DHitResult | null) => true,
  },
  setup(props, { emit, expose }) {
    const layout = useLayout();
    const renderer = props.renderer;
    let alive = true;
    let yaw = finite(props.initialYaw, 0);
    let pitch = clampPitch(finite(props.initialPitch, 0));
    let yawVelocity = 0;
    let pitchVelocity = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerSpeed = 0;
    let hovering = false;
    let zoom = clampZoom(props.initialZoom, props.minZoom, props.maxZoom);
    let zoomVelocity = 0;
    let hoveredObject: T3DHitResult | null = null;
    let selectedObject: T3DHitResult | null = null;
    let actualPixelWidth = Math.max(1, Math.floor(props.pixelWidth ?? props.w));
    let actualPixelHeight = Math.max(1, Math.floor(props.pixelHeight ?? props.h));
    let pointer: Readonly<{ x: number; y: number; timeMs: number }> | null = null;
    let drag: Readonly<{ x: number; y: number; timeMs: number; moved: boolean }> | null = null;
    let renderTail = Promise.resolve();

    function motionSnapshot(): T3DViewportMotion {
      return {
        yaw,
        pitch,
        yawVelocity,
        pitchVelocity,
        pointerX,
        pointerY,
        pointerSpeed,
        hovering,
        zoom,
        zoomVelocity,
        hoveredObjectId: hoveredObject?.objectId ?? null,
        selectedObjectId: selectedObject?.objectId ?? null,
      };
    }

    async function renderFrame(context: T3DRenderContext): Promise<TVideoFrame> {
      const previous = renderTail;
      let release = () => {};
      renderTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        if (!alive || context.signal.aborted) throw abortError();
        return await renderer.render(context);
      } finally {
        release();
      }
    }

    function sameHit(left: T3DHitResult | null, right: T3DHitResult | null): boolean {
      return left?.objectId === right?.objectId;
    }
    function setHoveredObject(hit: T3DHitResult | null): void {
      if (sameHit(hoveredObject, hit)) return;
      hoveredObject = hit;
      emit("objecthover", hit);
    }
    function setSelectedObject(hit: T3DHitResult | null): void {
      if (sameHit(selectedObject, hit)) return;
      selectedObject = hit;
      emit("objectselect", hit);
    }
    function resetMotion(): void {
      yaw = finite(props.initialYaw, 0);
      pitch = clampPitch(finite(props.initialPitch, 0));
      yawVelocity = 0;
      pitchVelocity = 0;
      pointerX = 0;
      pointerY = 0;
      pointerSpeed = 0;
      zoom = clampZoom(props.initialZoom, props.minZoom, props.maxZoom);
      zoomVelocity = 0;
      setHoveredObject(null);
      setSelectedObject(null);
      pointer = null;
      drag = null;
    }
    expose<T3DViewportHandle>({ resetMotion });

    function localCell(event: TerminalPointerEvent): Readonly<{ x: number; y: number }> {
      return {
        x: Math.floor(event.cellX - layout.originX - props.x),
        y: Math.floor(event.cellY - layout.originY - props.y),
      };
    }
    function eventTime(event: TerminalPointerEvent): number {
      return Number.isFinite(event.timeStamp) ? event.timeStamp : nowMs();
    }
    function updatePointerPosition(point: Readonly<{ x: number; y: number }>): void {
      const width = Math.max(1, Math.floor(props.w));
      const height = Math.max(1, Math.floor(props.h));
      pointerX = Math.max(-1, Math.min(1, ((point.x + 0.5) / width) * 2 - 1));
      pointerY = Math.max(-1, Math.min(1, ((point.y + 0.5) / height) * 2 - 1));
    }
    function hitTest(): T3DHitResult | null {
      if (!renderer.hitTest) return null;
      try {
        return renderer.hitTest({
          pointerX,
          pointerY,
          pixelWidth: actualPixelWidth,
          pixelHeight: actualPixelHeight,
          cellWidth: Math.max(1, Math.floor(props.w)),
          cellHeight: Math.max(1, Math.floor(props.h)),
          motion: motionSnapshot(),
        });
      } catch (error) {
        emit("error", error);
        return null;
      }
    }
    function updateHoveredObject(): void {
      if (renderer.hitTest) setHoveredObject(hitTest());
    }
    function onPointerEnter(event: TerminalPointerEvent): void {
      if (!props.interactive) return;
      const point = localCell(event);
      hovering = true;
      updatePointerPosition(point);
      pointer = { ...point, timeMs: eventTime(event) };
      updateHoveredObject();
    }
    function onPointerDown(event: TerminalPointerEvent): void {
      if (!props.interactive || (event.button != null && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      const point = localCell(event);
      const timeMs = eventTime(event);
      hovering = true;
      updatePointerPosition(point);
      yawVelocity = 0;
      pitchVelocity = 0;
      pointerSpeed = 0;
      pointer = { ...point, timeMs };
      drag = { ...point, timeMs, moved: false };
      updateHoveredObject();
    }
    function onPointerMove(event: TerminalPointerEvent): void {
      if (!props.interactive) return;
      hovering = true;
      const point = localCell(event);
      updatePointerPosition(point);
      const timeMs = eventTime(event);
      const previous = drag ?? pointer;
      pointer = { ...point, timeMs };
      if (!previous) return;
      const dtMs = Math.max(1, timeMs - previous.timeMs);
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const sensitivity = finite(props.pointerSensitivity, DEFAULT_POINTER_SENSITIVITY);
      const deltaYaw = dx * sensitivity;
      const deltaPitch = dy * sensitivity;
      pointerSpeed = (Math.hypot(dx, dy) * 1000) / dtMs;
      if (!drag) {
        if (renderer.hitTest) {
          yawVelocity = 0;
          pitchVelocity = 0;
          updateHoveredObject();
          return;
        }
        yawVelocity = (deltaYaw * 650) / dtMs;
        pitchVelocity = (deltaPitch * 450) / dtMs;
        return;
      }
      if (event.buttons === 0) {
        drag = null;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      yaw += deltaYaw;
      pitch = clampPitch(pitch + deltaPitch);
      yawVelocity = (deltaYaw * 1000) / dtMs;
      pitchVelocity = (deltaPitch * 1000) / dtMs;
      setHoveredObject(null);
      drag = { ...point, timeMs, moved: drag.moved || dx !== 0 || dy !== 0 };
    }
    function onPointerUp(event: TerminalPointerEvent): void {
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const moved = drag.moved;
      drag = null;
      if (!moved && renderer.hitTest) {
        const hit = hitTest();
        setHoveredObject(hit);
        setSelectedObject(hit);
      } else {
        updateHoveredObject();
      }
    }
    function onPointerLeave(event: TerminalPointerEvent): void {
      if (drag) {
        event.preventDefault();
        event.stopPropagation();
        drag = null;
      }
      hovering = false;
      pointer = null;
      setHoveredObject(null);
    }
    function onWheel(event: TerminalPointerEvent): void {
      if (!props.interactive) return;
      const delta = normalizedWheelDelta(event);
      const sensitivity = Math.max(0, finite(props.zoomSensitivity, DEFAULT_ZOOM_SENSITIVITY));
      if (delta === 0 || sensitivity === 0) return;
      event.preventDefault();
      event.stopPropagation();
      zoomVelocity = Math.max(
        -MAX_ZOOM_VELOCITY,
        Math.min(MAX_ZOOM_VELOCITY, zoomVelocity - delta * sensitivity * 6),
      );
    }
    function advanceZoom(deltaMs: number): void {
      if (deltaMs <= 0 || zoomVelocity === 0) return;
      const dt = Math.min(deltaMs, 100) / 1000;
      const next = zoom + zoomVelocity * dt;
      zoom = clampZoom(next, props.minZoom, props.maxZoom);
      if (zoom !== next) {
        zoomVelocity = 0;
        return;
      }
      zoomVelocity *= Math.exp(-ZOOM_DAMPING_PER_SECOND * dt);
      if (Math.abs(zoomVelocity) < 0.001) zoomVelocity = 0;
    }
    function advanceMotion(deltaMs: number): void {
      if (deltaMs <= 0) return;
      advanceZoom(deltaMs);
      if (drag) return;
      const dt = Math.min(deltaMs, 100) / 1000;
      if (hovering && !renderer.hitTest) {
        const targetPitch = clampPitch(-pointerY * 0.36);
        pitchVelocity += (targetPitch - pitch) * 4.5 * dt;
      } else if (!hovering) {
        pointerX *= Math.exp(-7 * dt);
        pointerY *= Math.exp(-7 * dt);
      }
      yaw += yawVelocity * dt;
      pitch = clampPitch(pitch + pitchVelocity * dt);
      const inspectingObject = Boolean(renderer.hitTest && (hoveredObject || selectedObject));
      if (props.autoRotate && !inspectingObject) {
        const baseSpeed = finite(props.autoRotateSpeed, DEFAULT_AUTO_ROTATE_SPEED);
        const steering = hovering ? 0.85 + pointerX * 1.75 : 1;
        yaw += baseSpeed * steering * dt;
      }
      const decay = Math.exp(-VELOCITY_DAMPING_PER_SECOND * dt);
      yawVelocity *= decay;
      pitchVelocity *= decay;
      pointerSpeed *= decay;
    }

    const frameSource: TVideoFrameSource = async function* (videoContext) {
      const startedAt = nowMs();
      let previousAt = startedAt;
      let frame = 0;
      const frameIntervalMs = 1000 / Math.max(1, finite(videoContext.maxFps, DEFAULT_MAX_FPS));
      while (alive && !videoContext.signal.aborted) {
        const pulledAt = nowMs();
        const deltaMs = frame === 0 ? 0 : Math.max(0, pulledAt - previousAt);
        advanceMotion(deltaMs);
        actualPixelWidth = videoContext.pixelWidth;
        actualPixelHeight = videoContext.pixelHeight;
        const result = await renderFrame({
          timeMs: Math.max(0, pulledAt - startedAt),
          deltaMs,
          frame,
          pixelWidth: videoContext.pixelWidth,
          pixelHeight: videoContext.pixelHeight,
          format: videoContext.preferredFormat,
          signal: videoContext.signal,
          motion: motionSnapshot(),
        });
        if (!alive || videoContext.signal.aborted) return;
        yield result;
        frame++;
        previousAt = pulledAt;
        await waitFor(frameIntervalMs - (nowMs() - pulledAt), videoContext.signal);
      }
    };

    watch(
      () => props.renderer,
      (next) => {
        if (next === renderer) return;
        warnDev("[vue-tui] T3DViewport renderer is init-only. Remount T3DViewport to replace it.");
      },
    );
    watch(
      () => props.interactive,
      (interactive) => {
        if (!interactive) {
          hovering = false;
          pointer = null;
          drag = null;
          setHoveredObject(null);
          setSelectedObject(null);
        }
      },
    );
    onBeforeUnmount(() => {
      alive = false;
      pointer = null;
      drag = null;
    });
    onUnmounted(() => renderer.dispose?.());

    return () =>
      h("span", [
        h(TVideo, {
          x: props.x,
          y: props.y,
          w: props.w,
          h: props.h,
          zIndex: props.zIndex,
          src: "t3d://viewport",
          frameSource,
          paused: props.paused,
          maxFps: props.maxFps,
          pixelWidth: props.pixelWidth,
          pixelHeight: props.pixelHeight,
          fallback: props.fallback,
          style: props.style,
          clear: props.clear,
          onFrame: (event: TVideoFrameEvent) => emit("frame", event),
          onError: (error: unknown) => emit("error", error),
        }),
        props.interactive
          ? h(TView, {
              x: props.x,
              y: props.y,
              w: Math.max(0, Math.floor(props.w)),
              h: Math.max(0, Math.floor(props.h)),
              zIndex: props.zIndex + 1,
              selectable: false,
              onPointerenter: onPointerEnter,
              onPointermove: onPointerMove,
              onPointerleave: onPointerLeave,
              onPointerdown: onPointerDown,
              onPointerup: onPointerUp,
              onWheel,
            })
          : null,
      ]);
  },
});
