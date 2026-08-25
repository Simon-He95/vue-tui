import type { ExtractPublicPropTypes, PropType } from "vue";
import type { Style } from "../../core/types.js";
import type {
  TerminalInputEvent,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import type {
  TBrowserInputEvent,
  TBrowserModifiers,
  TBrowserSession,
  TBrowserSessionFactory,
} from "../browser/types.js";
import type { TVideoFrameEvent, TVideoFrameSource } from "../video/types.js";
import { computed, defineComponent, h, onBeforeUnmount, watch, watchEffect } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { TVideo } from "./TVideo.js";

const EMPTY_RECT = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });

export const tBrowserProps = {
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  w: { type: Number, required: true },
  h: { type: Number, required: true },
  zIndex: { type: Number, default: 0 },
  url: { type: String, required: true },
  sessionFactory: {
    type: Function as PropType<TBrowserSessionFactory>,
    required: true,
  },
  autoFocus: { type: Boolean, default: false },
  maxFps: { type: Number, default: 60 },
  pixelWidth: { type: Number, default: undefined },
  pixelHeight: { type: Number, default: undefined },
  fallback: { type: String, default: "[browser requires terminal graphics]" },
  style: { type: Object as PropType<Style>, default: undefined },
  clear: { type: Boolean, default: true },
} as const;

export type TBrowserProps = ExtractPublicPropTypes<typeof tBrowserProps>;

function modifiers(event: TerminalKeyboardEvent | TerminalPointerEvent): TBrowserModifiers {
  return {
    ctrl: Boolean(event.ctrlKey),
    shift: Boolean(event.shiftKey),
    alt: Boolean(event.altKey),
    meta: Boolean(event.metaKey),
  };
}

function eventText(event: TerminalInputEvent): string {
  return String(event.text ?? event.data ?? "");
}

export const TBrowser = defineComponent({
  name: "TBrowser",
  props: tBrowserProps,
  emits: {
    ready: (_session: TBrowserSession) => true,
    frame: (_event: TVideoFrameEvent) => true,
    navigate: (_url: string) => true,
    titleChange: (_title: string) => true,
    requestAddress: () => true,
    close: () => true,
    error: (_error: unknown) => true,
  },
  setup(props, { emit }) {
    const layout = useLayout();
    const { events } = useTerminal();
    const { visible } = useVisibility();
    let activeSession: TBrowserSession | null = null;
    let activePixelWidth = Math.max(1, Math.floor(props.pixelWidth ?? props.w * 8));
    let activePixelHeight = Math.max(1, Math.floor(props.pixelHeight ?? props.h * 16));
    let alive = true;
    let skipNextInput = false;
    let requestedUrl = props.url;
    let sessionQueue = Promise.resolve();
    let continuousInputScheduled = false;
    const pendingContinuousInput: TBrowserInputEvent[] = [];
    const initialUrl = props.url;
    const sourcePixelWidth = Math.max(2, Math.floor(props.pixelWidth ?? props.w * 8));
    const sourcePixelHeight = Math.max(2, Math.floor(props.pixelHeight ?? props.h * 16));

    const rawRect = computed(() =>
      translateRect(
        {
          x: Math.floor(props.x),
          y: Math.floor(props.y),
          w: Math.max(0, Math.floor(props.w)),
          h: Math.max(0, Math.floor(props.h)),
        },
        layout.originX,
        layout.originY,
      ),
    );
    const rect = computed(() => {
      const value = rawRect.value;
      return layout.clipRect ? (intersectRect(value, layout.clipRect) ?? EMPTY_RECT) : value;
    });

    const frameSource: TVideoFrameSource = async function* (context) {
      activePixelWidth = context.pixelWidth;
      activePixelHeight = context.pixelHeight;
      const session = await props.sessionFactory({
        url: context.src,
        signal: context.signal,
        maxFps: context.maxFps,
        pixelWidth: context.pixelWidth,
        pixelHeight: context.pixelHeight,
        preferredFormat: context.preferredFormat,
        onNavigate: (url) => emit("navigate", url),
        onTitleChange: (title) => emit("titleChange", title),
      });
      if (context.signal.aborted || !alive) {
        await session.close();
        return;
      }

      pendingContinuousInput.length = 0;
      activeSession = session;
      if (requestedUrl !== context.src && session.navigate) await session.navigate(requestedUrl);
      emit("ready", session);
      try {
        for await (const frame of session.frames) {
          if (context.signal.aborted || !alive) return;
          yield frame;
        }
      } finally {
        if (activeSession === session) {
          activeSession = null;
          pendingContinuousInput.length = 0;
        }
        await session.close();
      }
    };

    function reportError(error: unknown): void {
      if (alive) emit("error", error);
    }

    function scheduleContinuousInput(session: TBrowserSession): void {
      if (continuousInputScheduled || pendingContinuousInput.length === 0) return;
      continuousInputScheduled = true;
      const pending = sessionQueue.then(() => {
        const event = pendingContinuousInput.shift();
        if (!event || activeSession !== session) return;
        return session.dispatch(event);
      });
      sessionQueue = pending.catch(reportError);
      const finish = () => {
        continuousInputScheduled = false;
        if (activeSession) scheduleContinuousInput(activeSession);
      };
      void pending.then(finish, finish);
    }

    function queueContinuousInput(session: TBrowserSession, event: TBrowserInputEvent): void {
      const index = pendingContinuousInput.findIndex((pending) => pending.type === event.type);
      if (index < 0) {
        pendingContinuousInput.push(event);
      } else if (event.type === "wheel") {
        const previous = pendingContinuousInput[index];
        const deltaY = (previous?.type === "wheel" ? previous.deltaY : 0) + event.deltaY;
        if (deltaY === 0) pendingContinuousInput.splice(index, 1);
        else pendingContinuousInput[index] = { ...event, deltaY };
      } else {
        pendingContinuousInput[index] = event;
      }
      scheduleContinuousInput(session);
    }

    function dispatch(event: TBrowserInputEvent): void {
      const session = activeSession;
      if (!session) return;
      if (event.type === "wheel" || event.type === "pointermove") {
        queueContinuousInput(session, event);
        return;
      }
      pendingContinuousInput.length = 0;
      const pending = sessionQueue.then(() => {
        if (activeSession !== session) return;
        return session.dispatch(event);
      });
      sessionQueue = pending.catch(reportError);
    }

    function invoke(action: (() => void | Promise<void>) | undefined): void {
      if (!action) return;
      pendingContinuousInput.length = 0;
      const pending = sessionQueue.then(action);
      sessionQueue = pending.catch(reportError);
    }

    function closeCurrentPage(): void {
      pendingContinuousInput.length = 0;
      const action = activeSession?.closePage;
      if (!action) {
        emit("close");
        return;
      }
      const pending = sessionQueue.then(action).then((closed) => {
        if (closed === false) emit("close");
      });
      sessionQueue = pending.catch(reportError);
    }

    function point(event: TerminalPointerEvent): Readonly<{ x: number; y: number }> {
      const bounds = rawRect.value;
      const cellX = Math.max(0, Math.min(bounds.w - 1, Math.floor(event.cellX - bounds.x)));
      const cellY = Math.max(0, Math.min(bounds.h - 1, Math.floor(event.cellY - bounds.y)));
      return {
        x: Math.max(
          0,
          Math.min(activePixelWidth - 1, ((cellX + 0.5) / bounds.w) * activePixelWidth),
        ),
        y: Math.max(
          0,
          Math.min(activePixelHeight - 1, ((cellY + 0.5) / bounds.h) * activePixelHeight),
        ),
      };
    }

    function capture(event: TerminalPointerEvent | TerminalKeyboardEvent | TerminalInputEvent) {
      event.preventDefault();
      event.stopPropagation();
    }

    function pointer(
      type: "pointermove" | "pointerdown" | "pointerup",
      event: TerminalPointerEvent,
    ) {
      if (type === "pointerdown" && id.value) events.value?.focus(id.value);
      capture(event);
      dispatch({
        type,
        ...point(event),
        button: event.button,
        buttons: event.buttons,
        modifiers: modifiers(event),
      });
    }

    const { id } = useTerminalNode(() => ({
      rect: rect.value,
      zIndex: props.zIndex,
      visible: visible.value,
      focusable: true,
      selectable: false,
      handlers: {
        pointerdown: (event) => pointer("pointerdown", event),
        pointerup: (event) => pointer("pointerup", event),
        pointermove: (event) => pointer("pointermove", event),
        wheel: (event) => {
          capture(event);
          dispatch({
            type: "wheel",
            ...point(event),
            deltaY: Number(event.deltaY ?? 0),
            modifiers: modifiers(event),
          });
        },
        keydown: (event) => {
          capture(event);
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
            emit("requestAddress");
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
            invoke(activeSession?.reload);
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") {
            invoke(activeSession?.newPage);
            emit("requestAddress");
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
            closeCurrentPage();
            return;
          }
          if (event.altKey && event.key === "ArrowLeft") {
            invoke(activeSession?.back);
            return;
          }
          if (event.altKey && event.key === "ArrowRight") {
            invoke(activeSession?.forward);
            return;
          }
          if (event.ctrlKey && ["c", "q"].includes(event.key.toLowerCase())) {
            emit("close");
            return;
          }
          dispatch({
            type: "keydown",
            key: event.key,
            code: event.code,
            repeat: Boolean(event.repeat),
            modifiers: modifiers(event),
          });
        },
        keyup: (event) => {
          capture(event);
          dispatch({
            type: "keyup",
            key: event.key,
            code: event.code,
            repeat: Boolean(event.repeat),
            modifiers: modifiers(event),
          });
        },
        paste: (event) => {
          capture(event);
          const text = eventText(event);
          if (text) dispatch({ type: "paste", text });
        },
        compositionend: (event) => {
          capture(event);
          const text = eventText(event);
          if (text) dispatch({ type: "text", text });
          skipNextInput = true;
          queueMicrotask(() => {
            skipNextInput = false;
          });
        },
        input: (event) => {
          capture(event);
          if (skipNextInput) return;
          const text = eventText(event);
          if (text) dispatch({ type: "text", text });
        },
      },
    }));

    watchEffect(() => {
      if (!props.autoFocus || !visible.value || !id.value) return;
      if (events.value?.getFocused() !== id.value) events.value?.focus(id.value);
    });

    watch(
      () => props.url,
      (url) => {
        requestedUrl = url;
        if (activeSession?.navigate) invoke(() => activeSession?.navigate?.(url));
      },
    );

    onBeforeUnmount(() => {
      alive = false;
      activeSession = null;
      pendingContinuousInput.length = 0;
    });

    return () =>
      h(TVideo, {
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        src: initialUrl,
        frameSource,
        maxFps: props.maxFps,
        pixelWidth: sourcePixelWidth,
        pixelHeight: sourcePixelHeight,
        fallback: props.fallback,
        style: props.style,
        clear: props.clear,
        onFrame: (event: TVideoFrameEvent) => emit("frame", event),
        onError: (error: unknown) => emit("error", error),
      });
  },
});
