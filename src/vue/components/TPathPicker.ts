import type { PropType } from "vue";
import type { PathPickerProvider } from "../../cli/path-provider.js";
import type { PathPickMode, PathSuggestion } from "../../cli/path-suggest-core.js";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/index.js";
import { computed, defineComponent, h, inject, ref, watch, watchEffect } from "vue";
import { parsePathQuery, resolveUserPath, suggestPaths } from "../../cli/path-suggest-core.js";
import { charCellWidth } from "../../core/buffer/width.js";
import { normalizePath, stripTrailingSlash } from "../../utils/path.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey, TPathPickerProviderContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  padEndByCells,
  sanitizeInlineText,
  sliceByCells,
  spaces,
  textCellWidth,
} from "../utils/text.js";
import { applyWheelScroll, createWheelScrollState } from "../utils/wheel-scroll.js";
import { TInput } from "./TInput.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getWheelScrollInput(e: { deltaY?: number; deltaMode?: number }): {
  deltaY: number;
  mode: "auto" | "line" | "pixel";
} {
  const deltaY = Number(e.deltaY ?? 0);
  const deltaMode = typeof e.deltaMode === "number" ? e.deltaMode : undefined;
  if (
    Number.isInteger(deltaY) &&
    deltaY !== 0 &&
    Math.abs(deltaY) >= 100 &&
    Math.abs(deltaY) % 100 === 0 &&
    (deltaMode == null || deltaMode === 0)
  ) {
    return { deltaY: deltaY / 100, mode: "line" };
  }
  if (deltaMode === 1) return { deltaY, mode: "line" };
  if (deltaMode === 0) return { deltaY, mode: "pixel" };
  return { deltaY, mode: "auto" };
}

function isCtrlLike(e: TerminalKeyboardEvent): boolean {
  return Boolean(e.ctrlKey || e.metaKey);
}

type HighlightRange = Readonly<{ start: number; end: number }>;

function computeHighlightRanges(text: string, query: string): HighlightRange[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return [{ start: idx, end: idx + q.length }];

  const positions: number[] = [];
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      positions.push(i);
      qi++;
    }
  }
  if (qi < q.length) return [];

  const ranges: HighlightRange[] = [];
  let start = positions[0]!;
  let prev = positions[0]!;
  for (let i = 1; i < positions.length; i++) {
    const pos = positions[i]!;
    if (pos === prev + 1) {
      prev = pos;
      continue;
    }
    ranges.push({ start, end: prev + 1 });
    start = pos;
    prev = pos;
  }
  ranges.push({ start, end: prev + 1 });
  return ranges;
}

function writeHighlightedText(
  opts: Readonly<{
    text: string;
    ranges: readonly HighlightRange[];
    x: number;
    y: number;
    maxCells: number;
    baseStyle: Style;
    highlightStyle: Style;
    terminal: {
      write: (text: string, opts?: { x?: number; y?: number; style?: Style }) => void;
    };
  }>,
): number {
  const { text, ranges, x, y, maxCells, baseStyle, highlightStyle, terminal } = opts;
  const safeMax = Math.max(0, Math.floor(maxCells));
  if (!text || safeMax <= 0) return 0;

  let rangeIndex = 0;
  let activeRange = ranges[rangeIndex];
  let cellPos = 0;
  let cursorX = x;
  let buffer = "";
  let currentStyle: Style = baseStyle;

  const flush = () => {
    if (!buffer) return;
    terminal.write(buffer, { x: cursorX, y, style: currentStyle });
    cursorX += textCellWidth(buffer);
    buffer = "";
  };

  for (let i = 0; i < text.length && cellPos < safeMax; ) {
    const code = text.charCodeAt(i);
    const seg = code <= 0x7f ? text[i]! : String.fromCodePoint(text.codePointAt(i) ?? 0);
    const segLen = seg.length;
    const segWidth = charCellWidth(seg);
    if (cellPos + segWidth > safeMax) break;

    while (activeRange && activeRange.end <= i) {
      rangeIndex++;
      activeRange = ranges[rangeIndex];
    }
    const isHighlighted = Boolean(
      activeRange && i < activeRange.end && i + segLen > activeRange.start,
    );
    const nextStyle = isHighlighted ? highlightStyle : baseStyle;
    if (nextStyle !== currentStyle) {
      flush();
      currentStyle = nextStyle;
    }
    buffer += seg;
    cellPos += segWidth;
    i += segLen;
  }

  flush();
  return cellPos;
}

export const TPathPicker = defineComponent({
  name: "TPathPicker",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    workspace: { type: String, required: true },
    mode: { type: String as PropType<PathPickMode>, default: "any" },
    modelValue: { type: String, required: true },
    placeholder: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: undefined },
    inputStyle: { type: Object as PropType<Style>, default: undefined },
    activeStyle: { type: Object as PropType<Style>, default: undefined },
    matchStyle: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    showHidden: { type: Boolean, default: false },
    maxSuggestions: { type: Number, default: 50 },
    provider: {
      type: Object as PropType<PathPickerProvider>,
      default: undefined,
    },
  },
  emits: ["update:modelValue", "select", "invalid", "keydown", "focus", "blur"],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const injectedProvider = inject(TPathPickerProviderContextKey, null) as Readonly<{
      value: PathPickerProvider | undefined;
    }> | null;
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const provider = computed<PathPickerProvider | null>(
      () => props.provider ?? injectedProvider?.value ?? null,
    );
    const suggestions = ref<PathSuggestion[]>([]);
    const active = ref(0);
    const scrollTop = ref(0);
    const error = ref<string | null>(null);

    const inputH = 1;
    const listH = computed(() => Math.max(0, Math.floor(props.h) - inputH));

    const absListRect = computed<Rect>(() => {
      const raw = {
        x: props.x,
        y: props.y + inputH,
        w: props.w,
        h: listH.value,
      };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    function ensureActiveVisible(): void {
      const h = Math.max(0, listH.value);
      if (h <= 0) {
        scrollTop.value = 0;
        return;
      }
      const maxTop = Math.max(0, suggestions.value.length - h);
      scrollTop.value = clamp(scrollTop.value, 0, maxTop);
      if (active.value < scrollTop.value) scrollTop.value = active.value;
      else if (active.value >= scrollTop.value + h)
        scrollTop.value = clamp(active.value - (h - 1), 0, maxTop);
    }

    watch([() => active.value, () => suggestions.value.length, () => listH.value], () => {
      ensureActiveVisible();
    });

    let refreshSeq = 0;

    async function refresh(seq: number): Promise<void> {
      const currentProvider = provider.value;
      if (!currentProvider) {
        if (seq !== refreshSeq) return;
        suggestions.value = [];
        active.value = 0;
        scheduler.invalidate();
        return;
      }
      const limit = Math.max(0, Math.floor(props.maxSuggestions));
      const res = currentProvider.suggest
        ? await currentProvider.suggest({
            workspaceAbs: props.workspace,
            input: props.modelValue,
            mode: props.mode,
            max: limit,
            showHidden: props.showHidden,
            gitignore: "nonBlocking",
          })
        : await suggestPaths({
            workspaceAbs: props.workspace,
            input: props.modelValue,
            mode: props.mode,
            max: limit,
            showHidden: props.showHidden,
            listDir: currentProvider.listDir,
          });
      if (seq !== refreshSeq) return;
      suggestions.value = res.suggestions;
      active.value = clamp(active.value, 0, Math.max(0, suggestions.value.length - 1));
      ensureActiveVisible();
      scheduler.invalidate();
    }
    watchEffect(() => {
      if (!visible.value) return;
      // Reactive deps.
      void props.workspace;
      void props.mode;
      void props.showHidden;
      void props.modelValue;
      void listH.value;

      error.value = null;
      const seq = ++refreshSeq;
      refresh(seq).catch((e) => {
        if (seq !== refreshSeq) return;
        suggestions.value = [];
        error.value = e instanceof Error ? e.message : String(e);
        scheduler.invalidate();
      });
    });

    function setValue(next: string): void {
      const cleaned = next.replace(/\r/g, "").replace(/\n/g, " ");
      emit("update:modelValue", cleaned);
    }

    function moveActive(delta: number): void {
      const len = suggestions.value.length;
      if (len <= 0) return;
      const next = clamp(active.value + delta, 0, len - 1);
      if (next !== active.value) {
        active.value = next;
        ensureActiveVisible();
        scheduler.invalidate();
      }
    }

    function applyCompletion(): void {
      const s = suggestions.value[active.value];
      if (!s) return;
      setValue(s.completion);
    }

    async function trySelect(absPath: string): Promise<void> {
      const currentProvider = provider.value;
      if (!currentProvider) {
        error.value = "Path provider unavailable";
        emit("invalid", { reason: "provider_missing", absPath });
        scheduler.invalidate();
        return;
      }
      const stat = await currentProvider.stat(absPath);
      if (!stat.exists) {
        error.value = "Not found";
        emit("invalid", { reason: "not_found", absPath });
        scheduler.invalidate();
        return;
      }
      if (props.mode === "file" && stat.kind === "directory") {
        // In file-picking mode, treat directory selection as navigation.
        const abs = normalizePath(absPath);
        const workspaceAbs = normalizePath(props.workspace);
        const rel =
          abs === workspaceAbs
            ? ""
            : abs.startsWith(`${workspaceAbs}/`)
              ? abs.slice(workspaceAbs.length + 1)
              : abs;
        setValue(rel ? `${rel}/` : "");
        error.value = null;
        scheduler.invalidate();
        return;
      }
      if (props.mode === "file" && stat.kind !== "file") {
        error.value = "Not a file";
        emit("invalid", { reason: "not_file", absPath });
        scheduler.invalidate();
        return;
      }
      if (props.mode === "directory" && stat.kind !== "directory") {
        error.value = "Not a directory";
        emit("invalid", { reason: "not_directory", absPath });
        scheduler.invalidate();
        return;
      }
      emit("select", stripTrailingSlash(absPath));
    }

    async function onCommit(): Promise<void> {
      const currentProvider = provider.value;
      const typedAbs = currentProvider?.resolvePath
        ? await currentProvider.resolvePath(props.workspace, props.modelValue)
        : resolveUserPath(props.workspace, props.modelValue);
      if (!currentProvider) {
        error.value = "Path provider unavailable";
        emit("invalid", { reason: "provider_missing", absPath: typedAbs });
        scheduler.invalidate();
        return;
      }
      const typedStat = await currentProvider.stat(typedAbs);
      if (typedStat.exists) {
        if (props.mode === "file" && typedStat.kind === "directory") {
          const base = props.modelValue.replace(/\r/g, "").replace(/\\/g, "/");
          const next = base.endsWith("/") ? base : `${base}/`;
          setValue(next);
          error.value = null;
          scheduler.invalidate();
          return;
        }
        await trySelect(typedAbs);
        return;
      }

      const s = suggestions.value[active.value];
      if (s) {
        if (props.mode === "file" && s.kind === "directory") {
          setValue(s.completion);
          error.value = null;
          scheduler.invalidate();
          return;
        }
        await trySelect(s.absPath);
        return;
      }

      error.value = "Not found";
      emit("invalid", { reason: "not_found", absPath: typedAbs });
      scheduler.invalidate();
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (e.key === "Tab") {
        e.preventDefault();
        applyCompletion();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(1);
        return;
      }
      if (isCtrlLike(e) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        moveActive(-1);
        return;
      }
      if (isCtrlLike(e) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        moveActive(1);
      }
    }

    const wheelState = createWheelScrollState();

    useTerminalNode(() => ({
      rect: absListRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: false,
      handlers: {
        click: (e: TerminalPointerEvent) => {
          const r = absListRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          if (idx >= 0 && idx < suggestions.value.length) {
            active.value = idx;
            ensureActiveVisible();
            scheduler.invalidate();
          }
        },
        dblclick: async (e: TerminalPointerEvent) => {
          const r = absListRect.value;
          const idx = scrollTop.value + (e.cellY - r.y);
          const s = suggestions.value[idx];
          if (!s) return;
          if (props.mode === "file" && s.kind === "directory") {
            setValue(s.completion);
            error.value = null;
            scheduler.invalidate();
            return;
          }
          await trySelect(s.absPath);
        },
        wheel: (e: any) => {
          const { deltaY, mode } = getWheelScrollInput(e);
          const delta = deltaY;
          if (!delta) return;
          const h = Math.max(0, listH.value);
          const maxTop = Math.max(0, suggestions.value.length - h);
          const { nextTop, dir } = applyWheelScroll(
            wheelState,
            delta,
            scrollTop.value,
            maxTop,
            Date.now(),
            mode,
          );
          if (!dir || nextTop === scrollTop.value) return;
          scrollTop.value = nextTop;
          // Keep active within visible range to prevent ensureActiveVisible from
          // resetting scrollTop when watch triggers (e.g., on height change)
          const visibleStart = nextTop;
          const visibleEnd = nextTop + h - 1;
          if (active.value < visibleStart || active.value > visibleEnd) {
            // Move active to follow scroll direction
            const newActive = dir > 0 ? visibleEnd : visibleStart;
            active.value = clamp(newActive, 0, Math.max(0, suggestions.value.length - 1));
          }
          scheduler.invalidate();
        },
      },
    }));

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absListRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absListRect.value,
        props.w,
        listH.value,
        props.style,
        props.activeStyle,
        props.matchStyle,
        defaultStyle.value,
        suggestions.value,
        active.value,
        scrollTop.value,
        error.value,
      ],
      paint: () => {
        if (!visible.value) return;
        const r = absListRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const query = parsePathQuery(String(props.modelValue ?? "")).query;
        const top = clamp(scrollTop.value, 0, Math.max(0, suggestions.value.length - r.h));

        for (let i = 0; i < r.h; i++) {
          const idx = top + i;
          const s = suggestions.value[idx];
          const raw = s ? sanitizeInlineText(s.display) : "";
          const clipped = sliceByCells(raw, r.w);
          const rowStyle: Style =
            idx === active.value ? { ...base, ...(props.activeStyle ?? { inverse: true }) } : base;
          const rowMatchStyle: Style = {
            ...rowStyle,
            ...(props.matchStyle ?? { bold: true, dim: false, underline: true }),
          };
          const ranges = query ? computeHighlightRanges(raw, query) : [];
          const used = writeHighlightedText({
            text: clipped,
            ranges,
            x: r.x,
            y: r.y + i,
            maxCells: r.w,
            baseStyle: rowStyle,
            highlightStyle: rowMatchStyle,
            terminal,
          });
          if (used < r.w) {
            terminal.write(spaces(r.w - used), {
              x: r.x + used,
              y: r.y + i,
              style: rowStyle,
            });
          }
        }

        if (suggestions.value.length === 0 && r.h > 0) {
          const msg = error.value ? `(${sanitizeInlineText(error.value)})` : "(no matches)";
          terminal.write(padEndByCells(sliceByCells(msg, r.w), r.w), {
            x: r.x,
            y: r.y,
            style: { ...base, dim: true },
          });
        }
      },
    }));

    return () =>
      h("span", rootProps, [
        h(TInput, {
          x: props.x,
          y: props.y,
          w: props.w,
          h: inputH,
          zIndex: props.zIndex,
          modelValue: props.modelValue,
          "onUpdate:modelValue": (v: string) => setValue(v),
          // PathPicker often updates the input value programmatically (Tab completion / directory navigation);
          // in those cases we want the caret to land at the end of the inserted text.
          cursorToEndOnExternalUpdate: true,
          placeholder: props.placeholder,
          style: props.inputStyle ?? props.style,
          autoFocus: props.autoFocus,
          onKeydown: (e: any) => onKeydown(e),
          onChange: () => void onCommit(),
          onFocus: () => emit("focus"),
          onBlur: () => emit("blur"),
        }),
      ]);
  },
});
