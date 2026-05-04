import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  markRaw,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import { buildMarkdownVisualRows } from "../markdown/document.js";
import { createTuiMarkdownParser } from "../markdown/parser.js";
import { paintMarkdownVisualRow } from "../markdown/render.js";
import type { TuiMarkdownThemeOverrides } from "../markdown/theme.js";
import type { TuiMarkdownVisualRow } from "../markdown/types.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeRect(r: Rect): Rect {
  return {
    x: Math.floor(r.x),
    y: Math.floor(r.y),
    w: Math.max(0, Math.floor(r.w)),
    h: Math.max(0, Math.floor(r.h)),
  };
}

export const TVirtualMarkdown = defineComponent({
  name: "TVirtualMarkdown",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    content: { type: String, required: true },
    scrollTop: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
    final: { type: Boolean, default: true },
    streaming: { type: Boolean, default: false },
    autoFocus: { type: Boolean, default: false },
    customHtmlTags: {
      type: Array as PropType<readonly string[]>,
      default: undefined,
    },
    theme: {
      type: Object as PropType<TuiMarkdownThemeOverrides>,
      default: undefined,
    },
  },
  emits: ["update:scrollTop", "scroll", "focus", "blur", "keydown"],
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    const { terminal, defaultStyle, events, scheduler } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const focused = ref(false);
    const internalScrollTop = ref(0);
    const documentVersion = ref(0);
    const rows = shallowRef<readonly TuiMarkdownVisualRow[]>(markRaw([]));
    let builtOnce = false;
    let rebuildVersion = 0;
    let alive = true;
    const parser = shallowRef(
      markRaw(
        createTuiMarkdownParser({
          streaming: props.streaming,
          customHtmlTags: props.customHtmlTags,
        }),
      ),
    );

    watch(
      () => `${props.streaming ? 1 : 0}:${(props.customHtmlTags ?? []).join("\u0000")}`,
      () => {
        parser.value = markRaw(
          createTuiMarkdownParser({
            streaming: props.streaming,
            customHtmlTags: props.customHtmlTags,
          }),
        );
      },
    );

    function rebuildRows(): void {
      const nextRows = buildMarkdownVisualRows(props.content, props.w, parser.value, {
        final: props.final,
        theme: props.theme,
      });
      rows.value = markRaw(nextRows);
      reconcileScrollTop();
      documentVersion.value++;
    }

    function scheduleRebuild(): void {
      const currentVersion = ++rebuildVersion;
      if (!builtOnce) {
        builtOnce = true;
        rebuildRows();
        return;
      }
      scheduler.queueFrameTask({
        id: `TVirtualMarkdown:${instance?.uid ?? "unknown"}:markdown`,
        reason: props.streaming ? "stream" : "data",
        priority: props.streaming ? "low" : "normal",
        sync: false,
        run: () => {
          if (!alive) return;
          if (currentVersion !== rebuildVersion) return;
          rebuildRows();
        },
      });
    }

    const fullRect = computed<Rect>(() =>
      translateRect(
        { x: props.x, y: props.y, w: props.w, h: props.h },
        layout.originX,
        layout.originY,
      ),
    );

    const absRect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    function normalizedRect(): Rect {
      return normalizeRect(absRect.value);
    }

    function normalizedFullRect(): Rect {
      return normalizeRect(fullRect.value);
    }

    function clipOffsets(): { x: number; y: number } {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      return {
        x: Math.max(0, clip.x - full.x),
        y: Math.max(0, clip.y - full.y),
      };
    }

    function maxScrollTop(): number {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      return Math.max(0, rows.value.length - (clipY + clip.h));
    }

    function hasControlledScrollTop(): boolean {
      return Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, "scrollTop");
    }

    function setScrollTop(next: number, emitChange = true): void {
      const clamped = clamp(Math.floor(Number(next) || 0), 0, maxScrollTop());
      if (internalScrollTop.value === clamped) return;
      internalScrollTop.value = clamped;
      if (emitChange) {
        emit("update:scrollTop", clamped);
        emit("scroll", clamped);
      }
    }

    function reconcileScrollTop(): void {
      const desired = hasControlledScrollTop()
        ? Math.floor(Number(props.scrollTop) || 0)
        : internalScrollTop.value;
      const clamped = clamp(desired, 0, maxScrollTop());
      if (internalScrollTop.value === clamped) return;
      internalScrollTop.value = clamped;
      if (desired !== clamped) {
        emit("update:scrollTop", clamped);
        emit("scroll", clamped);
      }
    }

    watch(
      () => props.scrollTop,
      () => {
        if (!hasControlledScrollTop()) return;
        setScrollTop(props.scrollTop, false);
      },
    );

    watch(
      [
        () => props.content,
        () => props.w,
        () => parser.value,
        () => props.final,
        () => props.theme,
      ],
      () => {
        scheduleRebuild();
      },
      { immediate: true },
    );

    watch(
      [
        () => props.h,
        () => absRect.value.y,
        () => absRect.value.h,
        () => fullRect.value.y,
        () => fullRect.value.h,
      ],
      () => {
        reconcileScrollTop();
      },
      { immediate: true },
    );

    function onKeydown(event: TerminalKeyboardEvent): void {
      emit("keydown", event);
      const page = Math.max(1, normalizedRect().h);
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value - 1);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value + 1);
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value - page);
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value + page);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setScrollTop(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setScrollTop(maxScrollTop());
      }
    }

    const eventNode = useTerminalNode(() => ({
      rect: normalizedRect(),
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (_event: TerminalPointerEvent) => {},
        wheel: (event: any) => {
          const deltaY = Number(event.deltaY ?? 0);
          if (!deltaY) return;
          event.preventDefault?.();
          setScrollTop(internalScrollTop.value + Math.sign(deltaY));
        },
        focus: () => {
          focused.value = true;
          emit("focus");
        },
        blur: () => {
          focused.value = false;
          emit("blur");
        },
        keydown: onKeydown,
      },
    }));

    watchEffect(() => {
      if (!props.autoFocus || !visible.value) return;
      const manager = events.value;
      const nodeId = eventNode.id.value;
      if (!nodeId) return;
      if (!manager) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });

    onBeforeUnmount(() => {
      alive = false;
      rebuildVersion++;
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? normalizedRect() : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        internalScrollTop.value,
        focused.value,
        props.style,
        defaultStyle.value,
        documentVersion.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = normalizedRect();
        if (r.w <= 0 || r.h <= 0) return;
        const baseStyle = props.style ?? defaultStyle.value;
        const { x: clipX, y: clipY } = clipOffsets();
        const paintRow = (y: number) => {
          if (y < r.y || y >= r.y + r.h) return;
          const visualIndex = internalScrollTop.value + clipY + (y - r.y);
          paintMarkdownVisualRow(terminal, rows.value[visualIndex], {
            x: r.x,
            y,
            w: r.w,
            clipStart: clipX,
            baseStyle,
            clear: true,
          });
        };
        if (dirtyRows?.length) {
          for (const y of dirtyRows) paintRow(y);
          return;
        }
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
      },
    }));

    return () => h("span", rootProps);
  },
});
