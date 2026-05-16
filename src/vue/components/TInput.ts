import type { PropType, Ref, ShallowRef } from "vue";
import type { PathPickMode } from "../../core/path-suggest.js";
import type { Cell, Style } from "../../core/types.js";
import type {
  Rect,
  TerminalInputEvent,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import type { ImeAnchor } from "../context.js";
import type { TInputHostAdapter } from "./input/host.js";
import type { PromptSuggestion, TInputPlugin } from "./input/plugins/types.js";
import type { InlineHit, LineInfo, WrappedLineInfo } from "./input/utils/inlineText.js";
import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  watchEffect,
} from "vue";
import { normalizeNewlines } from "../../utils/newlines.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import {
  DialogContextKey,
  EventZIndexContextKey,
  ImeAnchorContextKey,
  TInputPluginsContextKey,
} from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  graphemeRangeAt,
  sanitizeTextBlock,
  spaces,
  withTextWidthProvider,
} from "../utils/text.js";
import {
  fileUrlToPathLike,
  pathToTerminalFileHref,
  resolveDefaultTInputPath,
} from "./input/host.js";
import {
  createPasteImagePlaceholderPath,
  isPasteImagePlaceholderPath,
  mentionChipStyle,
} from "./input/plugins/mentionUtils.js";
import { computeLines as computeLinesCore, textCellWidth } from "./input/utils/inlineText.js";
import {
  buildInlineRow,
  buildInlineSelectionSegments,
  countMentionTokens,
  countMultilineTokens,
  indexToLineCellColInline,
  indexToWrappedCellColFirstWidthInline,
  isMentionToken,
  isMultilineToken,
  lineCellColToIndexInline,
  MENTION_TOKEN,
  mentionIndexAt,
  MULTILINE_TOKEN,
  tokenIndexAt,
  wrappedCellColToIndexInline,
  wrapToLinesFirstWidthInline,
} from "./input/utils/inlineTextTokens.js";
import { clamp } from "./input/utils/primitives.js";
import { findWordLeft, findWordRight, tokenRangeAt } from "./input/utils/wordNavigation.js";

// Inline text measurements are handled by `./input/utils/inlineText.ts`.

function warnDev(message: string): void {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
  if (nodeEnv === "production") return;
  console.warn(message);
}

function isPrintableKey(e: TerminalKeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.key.length === 1;
}

function computeLines(value: string): LineInfo[] {
  return computeLinesCore(value);
}

function indexToLineCellCol(
  value: string,
  index: number,
): { line: number; col: number; lines: LineInfo[] } {
  const safe = clamp(index, 0, value.length);
  const lines = computeLines(value);
  for (let i = 0; i < lines.length; i++) {
    const info = lines[i]!;
    // Cursor can be at end of a line (before '\n') or end of value.
    if (safe <= info.end) {
      const prefix = value.slice(info.start, safe);
      return { line: i, col: textCellWidth(prefix), lines };
    }
  }
  const last = lines[lines.length - 1]!;
  return {
    line: lines.length - 1,
    col: textCellWidth(value.slice(last.start, last.end)),
    lines,
  };
}

function normalizeMacHfsPath(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (raw.includes("/") || raw.includes("\\")) return null;
  if (!raw.includes(":")) return null;

  // Keep this fairly strict so diagnostics like "155:17  error: ..." do not get
  // mistaken for legacy HFS paths during multiline paste detection.
  const parts = raw.split(":");
  if (parts.length < 3) return null;
  if (parts.some((part) => !part.trim())) return null;

  const volume = parts[0]!.trim();
  if (!volume || /^\d+$/.test(volume)) return null;

  const firstNested = String(parts[1] ?? "").trim();
  if (/^\d+\s/u.test(firstNested)) return null;

  const rest = parts
    .slice(1)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!rest.length) return null;

  if (volume === "Macintosh HD") return `/${rest.join("/")}`;
  return `/Volumes/${volume}/${rest.join("/")}`;
}

let nextImeOwnerId = 0;
let nextPasteImageId = 0;

export const TInput = defineComponent({
  name: "TInput",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: 1 },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: String, required: true },
    cursorToEndOnExternalUpdate: { type: Boolean, default: false },
    cursorToEndOnFirstFocus: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    placeholderWhenFocused: { type: Boolean, default: false },
    style: { type: Object as PropType<Style>, default: undefined },
    autoFocus: { type: Boolean, default: false },
    cursorBlink: { type: Boolean, default: true },
    cursorShape: {
      type: String as PropType<"block" | "underline" | "bar">,
      default: "block",
    },
    blinkInterval: { type: Number, default: 500 },
    promptSuggestions: {
      type: Array as PropType<readonly PromptSuggestion[]>,
      default: () => [],
    },
    promptTrigger: { type: String, default: "/" },
    promptTriggers: {
      type: Array as PropType<readonly string[]>,
      default: undefined,
    },
    promptMaxItems: { type: Number, default: 6 },
    promptAlign: {
      type: String as PropType<"input" | "center">,
      default: "input",
    },
    promptSelectedStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    promptPopupStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    promptPopupBorderStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    promptPopupMatchStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    skillTrigger: { type: String, default: "" },
    skillSuggestions: {
      type: Array as PropType<readonly PromptSuggestion[]>,
      default: undefined,
    },
    skillHighlightStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    mentionTrigger: { type: String, default: "@" },
    mentionWorkspace: { type: String, default: "" },
    mentionMode: { type: String as PropType<PathPickMode>, default: "file" },
    mentionShowHidden: { type: Boolean, default: false },
    mentionSuggestions: {
      type: Array as PropType<readonly PromptSuggestion[]>,
      default: () => [],
    },
    mentionMaxItems: { type: Number, default: 8 },
    mentionChipStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    multilineChipStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    dedupeMentions: { type: Boolean, default: true },
    collectMentions: { type: Boolean, default: false },
    mentions: { type: Array as PropType<readonly string[]>, default: () => [] },
    collapseMultiline: { type: Boolean, default: false },
    multilineTexts: {
      type: Array as PropType<readonly string[]>,
      default: () => [],
    },
    secret: { type: Boolean, default: false },
    maskChar: { type: String, default: "•" },
    submitOnEnter: { type: Boolean, default: true },
    clearOnEscape: { type: Boolean, default: false },
    plugins: {
      type: Array as PropType<readonly TInputPlugin[]>,
      default: () => [],
    },
    pasteImageHandler: {
      type: Function as PropType<() => Promise<string | null> | string | null>,
      default: undefined,
    },
    filePasteHandler: {
      type: Function as PropType<(absPath: string) => Promise<string | null> | string | null>,
      default: undefined,
    },
  },
  emits: [
    "update:modelValue",
    "input",
    "change",
    "keydown",
    "focus",
    "blur",
    "pointerenter",
    "pointerleave",
    "update:mentions",
    "mentionClick",
    "update:multilineTexts",
    "multilineClick",
    "validationError",
  ],
  setup(props, { emit }) {
    const { terminal, scheduler, defaultStyle, events, render, widthProvider } = useTerminal();
    const withInputWidth = <T>(fn: () => T): T => withTextWidthProvider(widthProvider, fn);
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const injectedPlugins = inject(TInputPluginsContextKey, null) as Readonly<
      Ref<readonly TInputPlugin[]>
    > | null;
    const imeAnchor = inject(ImeAnchorContextKey, null) as ShallowRef<ImeAnchor | null> | null;

    const inDialog = inject(DialogContextKey, false) as boolean;

    const imeOwnerId = `TInput:${nextImeOwnerId++}`;

    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const installedPlugins = [
      ...((injectedPlugins?.value ?? []) as readonly TInputPlugin[]),
      ...(props.plugins ?? []),
    ];
    const initialLocalPlugins = props.plugins;
    watch(
      () => props.plugins,
      (next) => {
        if (next === initialLocalPlugins) return;
        warnDev("[vue-tui] TInput plugins is init-only. Remount TInput to apply plugin changes.");
      },
    );
    let hostAdapter: TInputHostAdapter = {};

    const PADDING_X = 1;
    function measureContent(r: Rect): {
      wAll: number;
      hAll: number;
      padX: number;
      w: number;
    } {
      const wAll = Math.max(0, Math.floor(r.w));
      const hAll = Math.max(0, Math.floor(r.h));
      const padX = clamp(PADDING_X, 0, Math.floor(wAll / 2));
      const w = Math.max(0, wAll - padX * 2);
      return { wAll, hAll, padX, w };
    }

    const focused = ref(false);
    const cursor = ref(0);
    const anchor = ref<number | null>(null);
    const hasFocusedOnce = ref(false);
    const skipCursorToEndOnNextFocus = ref(false);
    const scrollX = ref(0);
    const scrollY = ref(0);
    const composing = ref(false);
    const compositionText = ref("");
    const compositionBlocked = ref(false);
    let suppressEnterUntil = 0;
    const skipNextInput = ref(false);
    const blinkOn = ref(true);
    let blinkTimer: ReturnType<typeof setInterval> | null = null;
    const desiredCol = ref<number | null>(null);

    let mouseDownCell: { cellX: number; cellY: number } | null = null;
    let mouseDownShift = false;
    let mouseDragSelecting = false;
    let suppressNextClick = false;

    let lastClick: {
      time: number;
      cellX: number;
      cellY: number;
      count: number;
    } | null = null;
    const DOUBLE_CLICK_MS = 450;

    // Internal value cache to handle rapid keystrokes before props.modelValue updates.
    // This ensures that consecutive keydown events use the most recent value,
    // even if Vue's reactive system hasn't propagated the update yet.
    const pendingValue = ref<string | null>(null);
    const pendingMentions = ref<readonly string[] | null>(null);
    function getValue(): string {
      return pendingValue.value ?? props.modelValue;
    }

    type HistoryEntry = Readonly<{ value: string; cursor: number }>;
    const MAX_HISTORY = 200;
    const undoStack: HistoryEntry[] = [];
    const redoStack: HistoryEntry[] = [];
    let applyingHistory = false;

    function pushUndoSnapshot(nextValue: string): void {
      if (applyingHistory) return;
      const current: HistoryEntry = { value: getValue(), cursor: cursor.value };
      if (current.value === nextValue) return;
      const last = undoStack[undoStack.length - 1];
      if (last && last.value === current.value && last.cursor === current.cursor) {
        return;
      }
      undoStack.push(current);
      if (undoStack.length > MAX_HISTORY) undoStack.splice(0, undoStack.length - MAX_HISTORY);
      redoStack.length = 0;
    }

    function applyHistory(entry: HistoryEntry): void {
      applyingHistory = true;
      try {
        applyEdit(entry.value, entry.cursor);
      } finally {
        applyingHistory = false;
      }
    }

    function undo(): void {
      const prev = undoStack.pop();
      if (!prev) return;
      const cur: HistoryEntry = { value: getValue(), cursor: cursor.value };
      redoStack.push(cur);
      applyHistory(prev);
    }

    function redo(): void {
      const next = redoStack.pop();
      if (!next) return;
      const cur: HistoryEntry = { value: getValue(), cursor: cursor.value };
      undoStack.push(cur);
      applyHistory(next);
    }

    const wrapMode = computed(() => Math.max(1, Math.floor(props.h)) > 1);

    const rawAbsRect = computed<Rect>(() => {
      const raw = {
        x: props.x,
        y: props.y,
        w: props.w,
        h: Math.max(1, Math.floor(props.h)),
      };
      return translateRect(raw, layout.originX, layout.originY);
    });

    watch(
      () => props.modelValue,
      (next, prev) => {
        const wasInternal = pendingValue.value != null;
        // When the prop updates, clear the pending cache.
        pendingValue.value = null;
        if (!wasInternal) {
          undoStack.length = 0;
          redoStack.length = 0;
        }
        const nextLen = next.length;
        if (!wasInternal && props.cursorToEndOnExternalUpdate && !composing.value) {
          cursor.value = nextLen;
          anchor.value = null;
        } else {
          cursor.value = clamp(cursor.value, 0, nextLen);
          if (anchor.value != null) anchor.value = clamp(anchor.value, 0, nextLen);
        }
        if (composing.value && next !== prev) {
          compositionBlocked.value = true;
          composing.value = false;
          compositionText.value = "";
        }
        const tokenCount = countMultilineTokens(next);
        const currentMultiline = props.multilineTexts ?? [];
        if (currentMultiline.length > tokenCount) {
          emit("update:multilineTexts", currentMultiline.slice(0, tokenCount));
        }
        ensureCursorVisible();
        syncImeAnchorNow();
        scheduler.invalidate();
      },
    );

    type KeydownInterceptor = (e: TerminalKeyboardEvent) => boolean;
    const keydownInterceptors: KeydownInterceptor[] = [];
    function registerKeydownInterceptor(fn: KeydownInterceptor): void {
      keydownInterceptors.push(fn);
    }

    type TextFilter = (
      info: Readonly<{
        text: string;
        value: string;
        cursor: number;
        selection: null | Readonly<{ start: number; end: number }>;
      }>,
    ) => string;
    const textFilters: TextFilter[] = [];
    function registerTextFilter(fn: TextFilter): void {
      textFilters.push(fn);
    }

    const chipStyleProvider = ref<null | Readonly<{
      getStyle: (
        baseStyle: Style,
        chip: Readonly<{ kind: "multiline" | "mention"; absPath?: string }>,
      ) => Style | null | undefined;
      version: { value: number };
    }>>(null);

    function registerChipStyleProvider(provider: typeof chipStyleProvider.value): void {
      chipStyleProvider.value = provider;
    }

    function registerHostAdapter(adapter: TInputHostAdapter | null): void {
      if (!adapter) return;
      hostAdapter = { ...hostAdapter, ...adapter };
    }

    function isTerminalHost(): boolean {
      return Boolean(hostAdapter.isTerminalLike);
    }

    function resolveInputPath(
      input: string,
      opts?: Readonly<{ preserveBackslash?: boolean }>,
    ): string {
      if (hostAdapter.resolvePath) {
        return hostAdapter.resolvePath({
          workspace: props.mentionWorkspace,
          input,
          preserveBackslash: opts?.preserveBackslash,
        });
      }
      return resolveDefaultTInputPath({
        workspace: props.mentionWorkspace,
        input,
        preserveBackslash: opts?.preserveBackslash,
      });
    }

    function toTerminalHref(pathLike: string): string | undefined {
      return hostAdapter.pathToHref?.(pathLike) ?? pathToTerminalFileHref(pathLike);
    }

    function maskText(text: string): string {
      const ch = String(props.maskChar || "•");
      // Keep the same UTF-16 code unit length so cursor indices stay consistent.
      return ch.repeat(Math.max(0, text.length));
    }

    function stopBlink(): void {
      if (blinkTimer != null) {
        clearInterval(blinkTimer);
        blinkTimer = null;
      }
      blinkOn.value = true;
    }

    function startBlink(): void {
      stopBlink();
      if (!props.cursorBlink) return;
      const interval = Math.max(120, Math.floor(props.blinkInterval));
      blinkTimer = globalThis.setInterval(() => {
        blinkOn.value = !blinkOn.value;
        scheduler.invalidate();
      }, interval);
    }

    const absRect = computed<Rect>(() => {
      const raw = {
        x: props.x,
        y: props.y,
        w: props.w,
        h: Math.max(1, Math.floor(props.h)),
      };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    const selection = computed(() => {
      if (anchor.value == null || anchor.value === cursor.value) return null;
      const start = Math.min(anchor.value, cursor.value);
      const end = Math.max(anchor.value, cursor.value);
      return { start, end };
    });

    function selectTokenAtCursor(): void {
      const value = getValue();
      const range = tokenRangeAt(value, cursor.value);
      if (!range) return;
      anchor.value = range.start;
      cursor.value = range.end;
      ensureCursorVisible();
      syncImeAnchorNow();
      scheduler.invalidate();
    }

    function selectAll(): void {
      const value = getValue();
      anchor.value = 0;
      cursor.value = value.length;
      ensureCursorVisible();
      syncImeAnchorNow();
      scheduler.invalidate();
    }

    const shouldShowPlaceholder = computed(() => {
      if (getValue()) return false;
      if (!props.placeholder) return false;
      if (focused.value && composing.value && compositionText.value) return false;
      return !focused.value || props.placeholderWhenFocused;
    });

    const useCompositionEnd = typeof document !== "undefined";

    function getComposedTextAndCursor(value: string): {
      text: string;
      cursor: number;
    } {
      const baseCursor = clamp(cursor.value, 0, value.length);
      if (composing.value && compositionText.value) {
        const text = `${value.slice(0, baseCursor)}${compositionText.value}${value.slice(baseCursor)}`;
        const cursorIndex = useCompositionEnd
          ? clamp(baseCursor + compositionText.value.length, 0, text.length)
          : baseCursor;
        return { text, cursor: cursorIndex };
      }
      return { text: value, cursor: baseCursor };
    }

    function ensureCursorVisible(): void {
      withInputWidth(() => {
        const r = absRect.value;
        const { hAll, w: contentW } = measureContent(r);
        const width = Math.max(1, contentW);
        const height = Math.max(1, hAll);
        const value = getValue();
        const composed = getComposedTextAndCursor(value);
        const wrap = wrapMode.value;
        const firstWidth = width;
        const { line, col, lines } = wrap
          ? indexToWrappedCellColFirstWidthInline(
              composed.text,
              props.multilineTexts,
              props.mentions,
              composed.cursor,
              firstWidth,
              width,
            )
          : indexToLineCellColInline(
              composed.text,
              props.multilineTexts,
              props.mentions,
              composed.cursor,
            );

        if (wrap) {
          scrollX.value = 0;
        } else if (width <= 0) {
          scrollX.value = 0;
        } else {
          const viewW = line === 0 ? firstWidth : width;
          if (col < scrollX.value) scrollX.value = col;
          else if (col > scrollX.value + viewW - 1) scrollX.value = Math.max(0, col - (viewW - 1));
        }

        const maxTop = Math.max(0, lines.length - height);
        scrollY.value = clamp(scrollY.value, 0, maxTop);
        if (line < scrollY.value) scrollY.value = line;
        else if (line > scrollY.value + height - 1)
          scrollY.value = clamp(line - (height - 1), 0, maxTop);
      });
    }

    function computeImeAnchorCell(): { cellX: number; cellY: number } | null {
      return withInputWidth(() => {
        if (!visible.value) return null;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return null;

        const placeholderVisible = shouldShowPlaceholder.value;
        const offX = placeholderVisible ? 0 : scrollX.value;
        const offY = placeholderVisible ? 0 : scrollY.value;
        const wrap = wrapMode.value && !placeholderVisible;

        const valueTextRaw = getValue();
        const composed = getComposedTextAndCursor(valueTextRaw);
        const cursorTextRaw = placeholderVisible ? "" : composed.text;
        const cursorText =
          props.secret && !placeholderVisible ? maskText(cursorTextRaw) : cursorTextRaw;

        const { padX, w: contentW } = measureContent(r);
        const width = Math.max(1, contentW);
        const firstWidth = width;
        const pos = wrap
          ? indexToWrappedCellColFirstWidthInline(
              cursorText,
              props.multilineTexts,
              props.mentions,
              composed.cursor,
              firstWidth,
              width,
            )
          : indexToLineCellColInline(
              cursorText,
              props.multilineTexts,
              props.mentions,
              composed.cursor,
            );

        const cx0 = pos.col - offX;
        const cy = pos.line - offY;
        const cx = clamp(cx0, 0, Math.max(0, width - 1));
        const cyClamped = clamp(cy, 0, Math.max(0, r.h - 1));
        return {
          cellX: r.x + padX + cx,
          cellY: r.y + cyClamped,
        };
      });
    }

    function syncImeAnchorNow(): void {
      // CLI raw TTY IME UIs use the native terminal cursor as the anchor; keep it updated
      // even when the full renderer frame hasn't flushed yet.
      if (useCompositionEnd) return;
      if (!imeAnchor) return;
      if (!focused.value) {
        if (imeAnchor.value?.ownerId === imeOwnerId) imeAnchor.value = null;
        return;
      }
      const next = computeImeAnchorCell();
      if (!next) return;
      const prev = imeAnchor.value;
      if (
        prev &&
        prev.ownerId === imeOwnerId &&
        prev.cellX === next.cellX &&
        prev.cellY === next.cellY
      ) {
        return;
      }
      imeAnchor.value = { ...next, ownerId: imeOwnerId };
    }

    function setCursorByCell2D(
      cellX: number,
      cellY: number,
      extendSelection = false,
      e?: TerminalPointerEvent,
      allowInlineAction = true,
    ): void {
      withInputWidth(() => {
        const r = absRect.value;
        const { w: contentW, padX } = measureContent(r);
        const width = Math.max(1, contentW);
        const localX = clamp(cellX - (r.x + padX), 0, Math.max(0, contentW - 1));
        const localY = clamp(cellY - r.y, 0, Math.max(0, r.h - 1));

        const value = getValue();
        const wrap = wrapMode.value;
        const xText = localX;
        const firstWidth = width;

        let next = 0;
        let hit: InlineHit | null = null;
        if (wrap) {
          const lines = wrapToLinesFirstWidthInline(
            value,
            props.multilineTexts,
            props.mentions,
            firstWidth,
            width,
          );
          const line = clamp(scrollY.value + localY, 0, lines.length - 1);
          const col = xText;
          const hit2 = wrappedCellColToIndexInline(
            value,
            props.multilineTexts,
            props.mentions,
            lines[line]!,
            col,
          );
          next = hit2.index;
          hit = hit2.hit;
        } else {
          const lines = computeLines(value);
          const line = clamp(scrollY.value + localY, 0, lines.length - 1);
          const col = scrollX.value + xText;
          const info = lines[line]!;
          const hit2 = lineCellColToIndexInline(
            value,
            props.multilineTexts,
            props.mentions,
            info.start,
            info.end,
            col,
          );
          next = hit2.index;
          hit = hit2.hit;
        }

        if (hit && allowInlineAction && !extendSelection) {
          cursor.value = next;
          anchor.value = null;
          ensureCursorVisible();
          if (hit.kind === "multiline") {
            emit("multilineClick", hit.index);
          } else {
            const absPath = String(props.mentions?.[hit.index] ?? "");
            if (absPath) emit("mentionClick", absPath, e);
          }
          e?.preventDefault?.();
          scheduler.invalidate();
          return;
        }

        if (!extendSelection) anchor.value = null;
        else if (anchor.value == null) anchor.value = cursor.value;

        cursor.value = next;
        desiredCol.value = wrap
          ? indexToWrappedCellColFirstWidthInline(
              value,
              props.multilineTexts,
              props.mentions,
              cursor.value,
              firstWidth,
              width,
            ).col
          : indexToLineCellColInline(value, props.multilineTexts, props.mentions, cursor.value).col;
        ensureCursorVisible();
        syncImeAnchorNow();
      });
    }

    function applyEdit(nextValue: string, nextCursor: number, commit = false): void {
      withInputWidth(() => {
        const c = clamp(nextCursor, 0, nextValue.length);
        cursor.value = c;
        anchor.value = null;
        composing.value = false;
        compositionText.value = "";
        // Cache the new value to handle rapid keystrokes before props update.
        pendingValue.value = nextValue;
        if (wrapMode.value) {
          const { w: contentW } = measureContent(absRect.value);
          const w = Math.max(1, contentW);
          const firstW = w;
          desiredCol.value = indexToWrappedCellColFirstWidthInline(
            nextValue,
            props.multilineTexts,
            props.mentions,
            c,
            firstW,
            w,
          ).col;
        } else {
          desiredCol.value = indexToLineCellColInline(
            nextValue,
            props.multilineTexts,
            props.mentions,
            c,
          ).col;
        }
        ensureCursorVisible();
        syncImeAnchorNow();
        emit("update:modelValue", nextValue);
        emit("input", nextValue);
        if (commit) emit("change", nextValue);
        scheduler.flushNow();
      });
      void nextTick(() => {
        scheduler.flushNow();
      });
    }

    function applyMove(nextCursor: number, extend: boolean): void {
      withInputWidth(() => {
        const prev = cursor.value;
        const value = getValue();
        if (extend) {
          if (anchor.value == null) anchor.value = prev;
        } else {
          anchor.value = null;
        }
        cursor.value = clamp(nextCursor, 0, value.length);
        if (wrapMode.value) {
          const { w: contentW } = measureContent(absRect.value);
          const w = Math.max(1, contentW);
          const firstW = w;
          desiredCol.value = indexToWrappedCellColFirstWidthInline(
            value,
            props.multilineTexts,
            props.mentions,
            cursor.value,
            firstW,
            w,
          ).col;
        } else {
          desiredCol.value = indexToLineCellColInline(
            value,
            props.multilineTexts,
            props.mentions,
            cursor.value,
          ).col;
        }
        ensureCursorVisible();
        syncImeAnchorNow();
        scheduler.flushNow();
      });
    }

    watch([() => absRect.value.w, () => absRect.value.h, () => wrapMode.value], () => {
      ensureCursorVisible();
      syncImeAnchorNow();
      scheduler.invalidate();
    });

    watch([() => props.mentions, () => props.multilineTexts], () => {
      pendingMentions.value = props.mentions ?? [];
      ensureCursorVisible();
      syncImeAnchorNow();
      scheduler.invalidate();
    });

    function emitMentions(nextMentions: readonly string[]): void {
      pendingMentions.value = nextMentions;
      emit("update:mentions", nextMentions);
    }

    function clearAll(): void {
      const value = getValue();
      const hasValue = value.length > 0;
      const hasMentions = (props.mentions?.length ?? 0) > 0;
      const hasMultiline = (props.multilineTexts?.length ?? 0) > 0;
      if (!hasValue && !hasMentions && !hasMultiline) return;
      anchor.value = null;
      if (hasMentions) emitMentions([]);
      if (hasMultiline) emit("update:multilineTexts", []);
      if (hasValue || cursor.value !== 0) {
        pushUndoSnapshot("");
        applyEdit("", 0);
      } else {
        ensureCursorVisible();
        syncImeAnchorNow();
        scheduler.invalidate();
      }
    }

    function deleteSelectionIfAny(value: string): {
      value: string;
      cursor: number;
      deleted: boolean;
    } {
      const sel = selection.value;
      if (!sel) return { value, cursor: cursor.value, deleted: false };
      const tokenStart = countMultilineTokens(value, sel.start);
      const tokenEnd = countMultilineTokens(value, sel.end);
      if (tokenEnd > tokenStart) {
        const current = props.multilineTexts ?? [];
        const nextMultiline = [...current.slice(0, tokenStart), ...current.slice(tokenEnd)];
        emit("update:multilineTexts", nextMultiline);
      }
      const mentionStart = countMentionTokens(value, sel.start);
      const mentionEnd = countMentionTokens(value, sel.end);
      if (mentionEnd > mentionStart) {
        const current = pendingMentions.value ?? props.mentions ?? [];
        const nextMentions = [...current.slice(0, mentionStart), ...current.slice(mentionEnd)];
        emitMentions(nextMentions);
      }
      const next = value.slice(0, sel.start) + value.slice(sel.end);
      return { value: next, cursor: sel.start, deleted: true };
    }

    function insertText(rawText: string): void {
      let text = rawText || "";
      if (!text) return;
      const valueForFilter = getValue();
      const selectionForFilter = selection.value;
      for (const filter of textFilters) {
        try {
          text = filter({
            text,
            value: valueForFilter,
            cursor: cursor.value,
            selection: selectionForFilter,
          });
        } catch {
          // Ignore filter failures; base input should still work.
        }
        if (!text) return;
      }
      const value = getValue();
      const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
      const baseValue = deleted ? afterDelete : value;
      const baseCursor = deleted ? nextCursor : cursor.value;
      const next = baseValue.slice(0, baseCursor) + text + baseValue.slice(baseCursor);
      pushUndoSnapshot(next);
      applyEdit(next, baseCursor + text.length);
      if (text.length === 1 && (text === "'" || text === '"')) {
        void tryConvertQuotedPathAfterInsert(next, baseCursor + text.length, text);
      }
    }

    for (const plugin of installedPlugins) {
      try {
        plugin.install({
          getProps: () => ({
            zIndex: props.zIndex,
            style: props.style,
            promptSuggestions: props.promptSuggestions,
            promptTrigger: props.promptTrigger,
            promptTriggers: props.promptTriggers,
            skillTrigger: props.skillTrigger,
            skillSuggestions: props.skillSuggestions,
            promptMaxItems: props.promptMaxItems,
            promptAlign: props.promptAlign,
            promptSelectedStyle: props.promptSelectedStyle,
            promptPopupStyle: props.promptPopupStyle,
            promptPopupBorderStyle: props.promptPopupBorderStyle,
            promptPopupMatchStyle: props.promptPopupMatchStyle,
            mentionTrigger: props.mentionTrigger,
            mentionWorkspace: props.mentionWorkspace,
            mentionMode: props.mentionMode,
            mentionShowHidden: props.mentionShowHidden,
            mentionSuggestions: props.mentionSuggestions,
            mentionMaxItems: props.mentionMaxItems,
            mentionChipStyle: props.mentionChipStyle,
            collectMentions: props.collectMentions,
            mentions: props.mentions,
          }),
          emit: emit as unknown as (event: string, ...args: any[]) => void,
          terminal,
          scheduler,
          defaultStyle,
          render: {
            rootStack: render.rootStack,
            createStack: render.createStack,
            invalidatePlane: render.invalidatePlane,
          },
          visible,
          rawAbsRect,
          eventZ,
          focused,
          cursor,
          getValue,
          insertText,
          pushUndoSnapshot,
          applyEdit: (nextValue, nextCursor) => applyEdit(nextValue, nextCursor),
          registerKeydownInterceptor,
          registerTextFilter,
          registerChipStyleProvider,
          registerHostAdapter,
          resolvePath: resolveInputPath,
          mentionToken: MENTION_TOKEN,
        });
      } catch {
        // Ignore plugin failures; base input should still work.
      }
    }

    function insertMultilineToken(text: string): void {
      const value = getValue();
      const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
      const baseValue = deleted ? afterDelete : value;
      const baseCursor = deleted ? nextCursor : cursor.value;
      const insertIndex = tokenIndexAt(baseValue, baseCursor);
      const current = props.multilineTexts ?? [];
      const nextMultiline = [...current.slice(0, insertIndex), text, ...current.slice(insertIndex)];
      emit("update:multilineTexts", nextMultiline);
      const nextValue = `${baseValue.slice(0, baseCursor)}${MULTILINE_TOKEN}${baseValue.slice(baseCursor)}`;
      applyEdit(nextValue, baseCursor + 1);
    }

    function removeMentionTokenByIndex(
      value: string,
      mentionIdx: number,
    ): { value: string; removedCharIndex: number | null } {
      const target = Math.max(0, Math.floor(mentionIdx));
      let seen = 0;
      for (let i = 0; i < value.length; i++) {
        if (value[i] !== MENTION_TOKEN) continue;
        if (seen === target) {
          return {
            value: value.slice(0, i) + value.slice(i + 1),
            removedCharIndex: i,
          };
        }
        seen++;
      }
      return { value, removedCharIndex: null };
    }

    function insertMentionToken(absPath: string): void {
      const cleaned = String(absPath || "").trim();
      if (!cleaned) return;
      if (!props.collectMentions) {
        const mentionTrigger = props.mentionTrigger || "@";
        insertText(`${mentionTrigger}${cleaned} `);
        return;
      }

      const value = getValue();
      const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
      let baseValue = deleted ? afterDelete : value;
      let baseCursor = deleted ? nextCursor : cursor.value;

      const currentMentions = pendingMentions.value ?? props.mentions ?? [];
      const nextMentions = [...currentMentions];
      if (props.dedupeMentions) {
        const existingIdx = nextMentions.indexOf(cleaned);
        if (existingIdx >= 0) {
          const removed = removeMentionTokenByIndex(baseValue, existingIdx);
          if (removed.removedCharIndex != null && removed.removedCharIndex < baseCursor) {
            baseCursor = Math.max(0, baseCursor - 1);
          }
          baseValue = removed.value;
          nextMentions.splice(existingIdx, 1);
        }
      }

      const insertIndex = mentionIndexAt(baseValue, baseCursor);
      nextMentions.splice(insertIndex, 0, cleaned);
      emitMentions(nextMentions);

      let after = baseValue.slice(baseCursor);
      if (after.startsWith(" ")) after = after.slice(1);
      const nextValue = `${baseValue.slice(0, baseCursor)}${MENTION_TOKEN} ${after}`;
      pushUndoSnapshot(nextValue);
      applyEdit(nextValue, baseCursor + 2);
    }

    function getCurrentMentions(): readonly string[] {
      return pendingMentions.value ?? props.mentions ?? [];
    }

    function hasPendingPasteImages(): boolean {
      return getCurrentMentions().some((mention) => isPasteImagePlaceholderPath(mention));
    }

    function replacePendingPasteImage(placeholderPath: string, resolvedPath: string): void {
      const current = getCurrentMentions();
      const idx = current.indexOf(placeholderPath);
      if (idx < 0) return;
      const nextMentions = [...current];
      nextMentions[idx] = resolvedPath;
      emitMentions(nextMentions);
      ensureCursorVisible();
      syncImeAnchorNow();
      scheduler.flushNow();
    }

    function removePendingPasteImage(placeholderPath: string): void {
      const current = getCurrentMentions();
      const idx = current.indexOf(placeholderPath);
      if (idx < 0) return;
      const nextMentions = [...current.slice(0, idx), ...current.slice(idx + 1)];
      const value = getValue();
      const removed = removeMentionTokenByIndex(value, idx);
      emitMentions(nextMentions);
      if (removed.removedCharIndex != null) {
        let nextCursor = cursor.value;
        if (removed.removedCharIndex < nextCursor) nextCursor = Math.max(0, nextCursor - 1);
        applyEdit(removed.value, nextCursor);
      } else {
        ensureCursorVisible();
        syncImeAnchorNow();
        scheduler.invalidate();
      }
    }

    function normalizePastedFilePath(
      rawText: string,
      opts?: Readonly<{ preserveBackslash?: boolean }>,
    ): string | null {
      let value = String(rawText ?? "").trim();
      if (!value) return null;
      if (value.includes("\n")) return null;
      if (value.includes("\0")) return null;
      if (/[;&|`]/.test(value)) return null;

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!value) return null;

      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !value.startsWith("file://")) {
        return null;
      }

      if (value.startsWith("file://")) {
        const filePath = fileUrlToPathLike(value);
        if (!filePath) return null;
        value = filePath;
      }

      if (!value.includes("/") && !value.includes("\\")) {
        const hfs = normalizeMacHfsPath(value);
        if (hfs) value = hfs;
      }

      const hasSeparator = value.includes("/") || value.includes("\\");
      if (!hasSeparator) return null;

      const workspace = props.mentionWorkspace;
      if (workspace) {
        return resolveInputPath(value, opts);
      }
      return value;
    }

    function normalizedPathCandidates(rawText: string): string[] {
      const out: string[] = [];
      const add = (candidate: string | null) => {
        if (!candidate) return;
        if (!out.includes(candidate)) out.push(candidate);
      };
      const addVariants = (candidate: string): void => {
        add(normalizePastedFilePath(candidate));
        if (candidate.includes("\\"))
          add(normalizePastedFilePath(candidate, { preserveBackslash: true }));
      };
      const unescapeShellLikePath = (value: string): string => value.replace(/\\([\\ ])/g, "$1");
      const base = String(rawText ?? "").trim();
      if (!base) return out;
      addVariants(base);
      const isWindowsLike = /^[A-Z]:[\\/]/i.test(base) || base.startsWith("\\\\");
      const isPosixLike = base.startsWith("/") || base.startsWith("~/");
      if (isPosixLike && !isWindowsLike && base.includes("\\")) {
        const unescaped = unescapeShellLikePath(base);
        if (unescaped !== base) addVariants(unescaped);
      }
      return out;
    }

    function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
      return !!value && typeof (value as PromiseLike<T>).then === "function";
    }

    function looksLikeAbsolutePath(value: string): boolean {
      const v = String(value ?? "").trim();
      if (!v) return false;
      if (v.startsWith("file://")) return true;
      if (v === "~" || v.startsWith("~/")) return true;
      if (v.startsWith("/") || v.startsWith("\\\\")) return true;
      return /^[A-Z]:[\\/]/i.test(v);
    }

    function findQuotedPathRange(
      value: string,
      cursorIndex: number,
      quoteChar: string,
    ): { start: number; end: number; inner: string; quoted: string } | null {
      if (!value || cursorIndex <= 0) return null;
      if (value[cursorIndex - 1] !== quoteChar) return null;
      const start = value.lastIndexOf(quoteChar, cursorIndex - 2);
      if (start < 0) return null;
      const inner = value.slice(start + 1, cursorIndex - 1);
      if (!inner) return null;
      if (inner.includes("\n") || inner.includes("\r")) return null;
      return {
        start,
        end: cursorIndex,
        inner,
        quoted: value.slice(start, cursorIndex),
      };
    }

    async function tryConvertQuotedPathAfterInsert(
      snapshotValue: string,
      snapshotCursor: number,
      quoteChar: string,
    ): Promise<void> {
      if (!props.collectMentions || typeof props.filePasteHandler !== "function") {
        return;
      }
      const range = findQuotedPathRange(snapshotValue, snapshotCursor, quoteChar);
      if (!range) return;
      if (!looksLikeAbsolutePath(range.inner)) return;
      const normalizedPath = normalizePastedFilePath(range.inner);
      if (!normalizedPath) return;
      let handled: string | null = null;
      try {
        handled = await props.filePasteHandler(normalizedPath);
      } catch {
        return;
      }
      if (!handled) return;
      const current = getValue();
      const currentIndex = current.lastIndexOf(range.quoted);
      if (currentIndex < 0) return;
      const endIndex = currentIndex + range.quoted.length;
      const nextValue = current.slice(0, currentIndex) + current.slice(endIndex);
      applyEdit(nextValue, currentIndex);
      insertMentionToken(handled);
    }

    function splitAbsolutePathRuns(value: string): string[] | null {
      const starts: number[] = [];
      const re = /(^|\s)(~\/|\/|\\\\|[A-Z]:[\\/])/gi;
      let match: RegExpExecArray | null = re.exec(value);
      while (match) {
        const lead = match[1] ?? "";
        starts.push(match.index + lead.length);
        match = re.exec(value);
      }
      if (starts.length <= 1) return null;
      const out: string[] = [];
      for (let i = 0; i < starts.length; i++) {
        const start = starts[i] ?? 0;
        const end = starts[i + 1] ?? value.length;
        const chunk = value.slice(start, end).trim();
        if (chunk) out.push(chunk);
      }
      return out.length ? out : null;
    }

    function extractPastedFilePaths(rawText: string): string[] {
      const value = String(rawText ?? "").trim();
      if (!value) return [];

      if (/[\r\n]/.test(value)) {
        const out: string[] = [];
        for (const line of value.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          out.push(...extractPastedFilePaths(trimmed));
        }
        return out;
      }

      const quoted: string[] = [];
      const quoteRe = /"([^"]+)"|'([^']+)'/g;
      let match: RegExpExecArray | null = quoteRe.exec(value);
      while (match) {
        const inner = match[1] ?? match[2] ?? "";
        if (inner) quoted.push(inner);
        match = quoteRe.exec(value);
      }
      if (quoted.length) return quoted;

      const fileUrls = value.match(/file:\/\/[^\s'"]+/g) ?? [];
      if (fileUrls.length) return fileUrls;

      if (normalizeMacHfsPath(value)) return [value];

      if (/\s/.test(value)) {
        const absRuns = splitAbsolutePathRuns(value);
        if (absRuns?.length) return absRuns;
        if (value.includes("/") || value.includes("\\")) return [value];
        return value.split(/\s+/).filter(Boolean);
      }

      return [value];
    }

    async function handlePasteText(rawText: string): Promise<void> {
      const normalized = normalizeNewlines(rawText || "");
      if (!normalized) return;
      const cleanText = sanitizeTextBlock(normalized);
      const text = cleanText || normalized;

      // 1. 文件路径检测（保持原逻辑）
      const trimmed = normalized.trim();
      const mentionTrigger = props.mentionTrigger || "@";
      const looksLikeFilePath =
        trimmed.startsWith(mentionTrigger) &&
        !/\s/.test(trimmed) &&
        (trimmed.slice(mentionTrigger.length).includes("/") ||
          trimmed.slice(mentionTrigger.length).includes("\\"));
      if (looksLikeFilePath && props.collectMentions) {
        // 提取 @ 后的路径
        const normalizedPath = trimmed.slice(mentionTrigger.length).trim();
        const absPath = props.mentionWorkspace ? resolveInputPath(normalizedPath) : normalizedPath;
        if (absPath) insertMentionToken(absPath);
        return;
      }

      if (props.collectMentions && typeof props.filePasteHandler === "function") {
        const looksLikeSinglePathCandidate = (candidate: string): boolean => {
          const v = String(candidate ?? "").trim();
          if (!v) return false;
          if (v.includes("\0")) return false;
          if (/[;&|`]/.test(v)) return false;
          if (normalizePastedFilePath(v)) return true;
          if (v.startsWith("file://")) return true;
          if (looksLikeAbsolutePath(v)) return true;
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            const inner = v.slice(1, -1).trim();
            return looksLikeAbsolutePath(inner);
          }
          const absRuns = splitAbsolutePathRuns(v);
          return Boolean(absRuns?.length);
        };
        const candidateLines = trimmed
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const looksLikeFilePaste = (() => {
          if (!trimmed) return false;
          if (candidateLines.length > 1) return candidateLines.every(looksLikeSinglePathCandidate);
          return looksLikeSinglePathCandidate(trimmed);
        })();
        const candidates = looksLikeFilePaste ? extractPastedFilePaths(trimmed) : [];
        const requiresCompleteMatch = candidateLines.length > 1 || candidates.length > 1;
        const handledPaths: string[] = [];
        let handledAll = candidates.length > 0;
        for (const candidate of candidates) {
          const normalizedPaths = normalizedPathCandidates(candidate);
          if (!normalizedPaths.length) {
            handledAll = false;
            if (requiresCompleteMatch) break;
            continue;
          }
          let handledPath: string | null = null;
          for (const normalizedPath of normalizedPaths) {
            try {
              const maybeHandled = props.filePasteHandler(normalizedPath);
              if (isPromiseLike<string | null>(maybeHandled)) {
                const handled = await maybeHandled;
                if (handled) {
                  handledPath = handled;
                  break;
                }
              } else if (maybeHandled) {
                handledPath = maybeHandled;
                break;
              }
            } catch {
              // ignore
            }
          }
          if (!handledPath) {
            handledAll = false;
            if (requiresCompleteMatch) break;
            continue;
          }
          handledPaths.push(handledPath);
        }
        if (handledAll && handledPaths.length > 0) {
          for (const handledPath of handledPaths) insertMentionToken(handledPath);
          return;
        }
      }

      // 2. 多行文本检测 — 仅当行数 >3 或字符数 >200 时折叠，否则直接粘贴
      if (props.collapseMultiline) {
        const lineCount = (text.match(/\n/g) || []).length + 1;
        if (lineCount > 3 || text.length > 200) {
          insertMultilineToken(text);
          return;
        }
      }

      // 3. 单行文本直接插入
      insertText(normalized);
    }

    async function tryPasteImageFromHandler(): Promise<void> {
      if (!props.collectMentions || typeof props.pasteImageHandler !== "function") {
        return;
      }
      const placeholderPath = createPasteImagePlaceholderPath(nextPasteImageId++);
      insertMentionToken(placeholderPath);
      scheduler.invalidate();
      try {
        const imagePath = await props.pasteImageHandler();
        const cleaned = String(imagePath ?? "").trim();
        if (cleaned) {
          replacePendingPasteImage(placeholderPath, cleaned);
        } else {
          removePendingPasteImage(placeholderPath);
        }
      } catch {
        removePendingPasteImage(placeholderPath);
      }
    }

    function readEventText(e: TerminalInputEvent): string {
      if (typeof e.text === "string") return e.text;
      if (typeof e.data === "string" && e.data) return e.data;
      const ne: any = e.nativeEvent as any;
      const clipboard = ne?.clipboardData;
      if (clipboard?.getData) {
        const v = clipboard.getData("text/plain") || clipboard.getData("text");
        if (typeof v === "string" && v) return v;
      }
      const target = ne?.target;
      if (target && typeof target.value === "string" && target.value) return target.value;
      return "";
    }

    const readClipboardText = async (): Promise<string> => {
      try {
        return (await hostAdapter.readClipboardText?.()) ?? "";
      } catch {
        return "";
      }
    };

    const copyText = async (text: string): Promise<boolean> => {
      if (!text) return false;

      if (hostAdapter.writeClipboardText) {
        try {
          if (await hostAdapter.writeClipboardText(text)) return true;
        } catch {
          // Fallback below.
        }
      }

      // Try browser clipboard API
      const nav: any = (globalThis as any).navigator;
      if (nav?.clipboard?.writeText) {
        try {
          await nav.clipboard.writeText(text);
          return true;
        } catch {
          // Fallback below.
        }
      }

      // Try document.execCommand fallback for older browsers
      const doc: any = (globalThis as any).document;
      if (!doc?.createElement || !doc?.body?.appendChild || typeof doc.execCommand !== "function") {
        return false;
      }
      try {
        const prevActive = doc.activeElement as HTMLElement | null;
        const ta = doc.createElement("textarea") as HTMLTextAreaElement;
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.setAttribute("aria-hidden", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "-9999px";
        ta.style.opacity = "0";
        doc.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = Boolean(doc.execCommand("copy"));
        ta.remove();
        try {
          prevActive?.focus?.({ preventScroll: true } as any);
        } catch {
          prevActive?.focus?.();
        }
        return ok;
      } catch {
        return false;
      }
    };

    function copySelectionText(text: string): void {
      void copyText(text)
        .then((ok) => {
          if (!isTerminalHost()) return;
          hostAdapter.showToast?.(ok ? "Copied" : "Copy failed");
        })
        .catch(() => {
          if (!isTerminalHost()) return;
          hostAdapter.showToast?.("Copy failed");
        });
    }

    function onKeydown(e: TerminalKeyboardEvent): void {
      if (e.key === "Enter") {
        const ts = typeof e.timeStamp === "number" ? e.timeStamp : Date.now();
        if (ts <= suppressEnterUntil) {
          suppressEnterUntil = 0;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      if (composing.value) {
        emit("keydown", e);
        return;
      }

      for (const interceptor of keydownInterceptors) {
        if (interceptor(e)) {
          emit("keydown", e);
          return;
        }
      }

      emit("keydown", e);
      if (e.defaultPrevented) return;

      const value = getValue();
      const extend = Boolean(e.shiftKey);
      const byWord = Boolean(e.altKey || (e.ctrlKey && !e.metaKey && !e.altKey));
      const toBoundaryArrows = Boolean(e.metaKey);
      const toBoundaryHomeEnd = Boolean(e.metaKey || (e.ctrlKey && !e.altKey));

      const isClipboardShortcut = Boolean((e.metaKey || e.ctrlKey) && !e.altKey);
      const isC = e.key === "c" || e.key === "C";
      const isX = e.key === "x" || e.key === "X";
      const isA = e.key === "a" || e.key === "A";
      const isE = e.key === "e" || e.key === "E";
      const isV = e.key === "v" || e.key === "V";
      const isZ = e.key === "z" || e.key === "Z";
      const isY = e.key === "y" || e.key === "Y";
      const sel = selection.value;
      const terminalLike = isTerminalHost();

      // In CLI mode, treat Ctrl+C as "clear input" when there is content.
      // If input is already empty, do not prevent it so the stdin driver can
      // fall back to terminal/app exit behavior.
      if (terminalLike && isC && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const hasValue = value.length > 0;
        const hasMentions = (props.mentions?.length ?? 0) > 0;
        const hasMultiline = (props.multilineTexts?.length ?? 0) > 0;
        if (hasValue || hasMentions || hasMultiline) {
          e.preventDefault();
          e.stopPropagation();
          clearAll();
          return;
        }
      }

      if (isClipboardShortcut && isZ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (isClipboardShortcut && isY) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }

      // Terminal-style navigation fallbacks (macOS Terminal often encodes Option+←/→ as Alt+B/F
      // and Cmd+←/→ as Ctrl+A/E, which we prefer to interpret as navigation in CLI mode).
      if (terminalLike && e.ctrlKey && !e.metaKey && !e.altKey && (isA || isE)) {
        e.preventDefault();
        const { line, lines } = indexToLineCellCol(value, cursor.value);
        const next = isA ? lines[line]!.start : lines[line]!.end;
        applyMove(next, extend);
        return;
      }
      // Ctrl+J: insert newline (alternative to Shift+Enter).
      // With enhanced keyboard protocols (Kitty), Ctrl+J arrives as a keydown
      // for 'j' with ctrlKey instead of the legacy 0x0A (LF) byte, so we must
      // handle it explicitly here.
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        insertText("\n");
        return;
      }

      if (terminalLike && e.altKey && !e.ctrlKey && !e.metaKey) {
        const isB = e.key === "b" || e.key === "B";
        const isF = e.key === "f" || e.key === "F";
        if (isB || isF) {
          e.preventDefault();
          const next = isB ? findWordLeft(value, cursor.value) : findWordRight(value, cursor.value);
          applyMove(next, extend);
          return;
        }
      }

      if (isClipboardShortcut && isA) {
        e.preventDefault();
        e.stopPropagation();
        anchor.value = 0;
        cursor.value = value.length;
        ensureCursorVisible();
        scheduler.invalidate();
        return;
      }

      if (!terminalLike && isClipboardShortcut && (isC || isX) && sel) {
        e.preventDefault();
        e.stopPropagation();
        const text = value.slice(sel.start, sel.end);
        copySelectionText(text);
        if (isX) {
          const next = value.slice(0, sel.start) + value.slice(sel.end);
          pushUndoSnapshot(next);
          applyEdit(next, sel.start);
        }
        return;
      }

      if (terminalLike && isClipboardShortcut && isV) {
        e.preventDefault();
        e.stopPropagation();
        void readClipboardText().then(async (text) => {
          if (text) {
            await handlePasteText(text);
            return;
          }
          await tryPasteImageFromHandler();
        });
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = toBoundaryArrows
          ? 0
          : byWord
            ? findWordLeft(value, cursor.value)
            : (() => {
                if (cursor.value <= 0) return 0;
                const range = graphemeRangeAt(value, cursor.value - 1);
                return range ? range.start : cursor.value - 1;
              })();
        applyMove(next, extend);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = toBoundaryArrows
          ? value.length
          : byWord
            ? findWordRight(value, cursor.value)
            : (() => {
                if (cursor.value >= value.length) return value.length;
                const range = graphemeRangeAt(value, cursor.value);
                return range ? range.end : cursor.value + 1;
              })();
        applyMove(next, extend);
        return;
      }

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const wrap = wrapMode.value;
        const { w: contentW } = measureContent(absRect.value);
        const width = Math.max(1, contentW);
        const firstW = width;
        const { line, col, lines } = wrap
          ? indexToWrappedCellColFirstWidthInline(
              value,
              props.multilineTexts,
              props.mentions,
              cursor.value,
              firstW,
              width,
            )
          : indexToLineCellColInline(value, props.multilineTexts, props.mentions, cursor.value);
        const targetLine = e.key === "ArrowUp" ? line - 1 : line + 1;

        // Handle boundary cases: move to start/end of current line when at first/last line
        if (targetLine < 0) {
          // At first line, move to start of line
          const next = lines[line]!.start;
          applyMove(next, extend);
          return;
        }
        if (targetLine >= lines.length) {
          // At last line, move to end of line
          const next = lines[line]!.end;
          applyMove(next, extend);
          return;
        }

        const nextLine = targetLine;
        const wantCol = desiredCol.value ?? col;
        const next = wrap
          ? wrappedCellColToIndexInline(
              value,
              props.multilineTexts,
              props.mentions,
              (lines as any)[nextLine]!,
              wantCol,
            ).index
          : lineCellColToIndexInline(
              value,
              props.multilineTexts,
              props.mentions,
              (lines as any)[nextLine]!.start,
              (lines as any)[nextLine]!.end,
              wantCol,
            ).index;
        applyMove(next, extend);
        desiredCol.value = wantCol;
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        if (toBoundaryHomeEnd) {
          applyMove(0, extend);
        } else {
          const { line, lines } = indexToLineCellCol(value, cursor.value);
          const next = lines[line]!.start;
          applyMove(next, extend);
        }
        return;
      }

      if (e.key === "End") {
        e.preventDefault();
        if (toBoundaryHomeEnd) {
          applyMove(value.length, extend);
        } else {
          const { line, lines } = indexToLineCellCol(value, cursor.value);
          const next = lines[line]!.end;
          applyMove(next, extend);
        }
        return;
      }

      // In Node/CLI terminals (especially macOS Terminal.app), Cmd is often not forwarded.
      // Keep Ctrl bindings as the reliable path and also support Meta when available
      // (DOM renderers or terminals that emit Meta via keyboard protocols).
      const clearWithDeleteOrBackspace = Boolean(
        !e.altKey && ((e.ctrlKey && !e.metaKey) || (e.metaKey && !e.ctrlKey)),
      );

      if (e.key === "Delete" && clearWithDeleteOrBackspace) {
        e.preventDefault();
        e.stopPropagation();
        clearAll();
        return;
      }

      if (e.key === "Backspace" && clearWithDeleteOrBackspace) {
        e.preventDefault();
        e.stopPropagation();
        clearAll();
        return;
      }

      if ((e.key === "u" || e.key === "U") && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        clearAll();
        return;
      }

      if ((e.key === "w" || e.key === "W") && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        clearAll();
        return;
      }

      if (e.key === "Backspace") {
        const mentions = props.mentions ?? [];
        if (!value && cursor.value <= 0 && mentions.length > 0) {
          e.preventDefault();
          emit("update:mentions", mentions.slice(0, -1));
          scheduler.invalidate();
          return;
        }
        e.preventDefault();
        const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
        if (deleted) {
          pushUndoSnapshot(afterDelete);
          applyEdit(afterDelete, nextCursor);
          return;
        }
        if (cursor.value <= 0) return;
        if (
          cursor.value >= 2 &&
          value[cursor.value - 1] === " " &&
          isMentionToken(value, cursor.value - 2)
        ) {
          const mentionIdx = mentionIndexAt(value, cursor.value - 2);
          const current = props.mentions ?? [];
          if (mentionIdx >= 0 && mentionIdx < current.length) {
            const nextMentions = [
              ...current.slice(0, mentionIdx),
              ...current.slice(mentionIdx + 1),
            ];
            emit("update:mentions", nextMentions);
          }
          const next = value.slice(0, cursor.value - 2) + value.slice(cursor.value);
          pushUndoSnapshot(next);
          applyEdit(next, cursor.value - 2);
          return;
        }
        if (isMentionToken(value, cursor.value - 1)) {
          const mentionIdx = mentionIndexAt(value, cursor.value - 1);
          const current = props.mentions ?? [];
          if (mentionIdx >= 0 && mentionIdx < current.length) {
            const nextMentions = [
              ...current.slice(0, mentionIdx),
              ...current.slice(mentionIdx + 1),
            ];
            emit("update:mentions", nextMentions);
          }
          const next = value.slice(0, cursor.value - 1) + value.slice(cursor.value);
          pushUndoSnapshot(next);
          applyEdit(next, cursor.value - 1);
          return;
        }
        if (isMultilineToken(value, cursor.value - 1)) {
          const tokenIdx = tokenIndexAt(value, cursor.value - 1);
          const current = props.multilineTexts ?? [];
          if (tokenIdx >= 0 && tokenIdx < current.length) {
            const nextMultiline = [...current.slice(0, tokenIdx), ...current.slice(tokenIdx + 1)];
            emit("update:multilineTexts", nextMultiline);
          }
        }
        const range = graphemeRangeAt(value, cursor.value - 1);
        if (!range) return;
        const next = value.slice(0, range.start) + value.slice(range.end);
        pushUndoSnapshot(next);
        applyEdit(next, range.start);
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
        if (deleted) {
          pushUndoSnapshot(afterDelete);
          applyEdit(afterDelete, nextCursor);
          return;
        }
        if (cursor.value >= value.length) return;
        if (isMentionToken(value, cursor.value) && value[cursor.value + 1] === " ") {
          const mentionIdx = mentionIndexAt(value, cursor.value);
          const current = props.mentions ?? [];
          if (mentionIdx >= 0 && mentionIdx < current.length) {
            const nextMentions = [
              ...current.slice(0, mentionIdx),
              ...current.slice(mentionIdx + 1),
            ];
            emit("update:mentions", nextMentions);
          }
          const next = value.slice(0, cursor.value) + value.slice(cursor.value + 2);
          pushUndoSnapshot(next);
          applyEdit(next, cursor.value);
          return;
        }
        if (isMentionToken(value, cursor.value)) {
          const mentionIdx = mentionIndexAt(value, cursor.value);
          const current = props.mentions ?? [];
          if (mentionIdx >= 0 && mentionIdx < current.length) {
            const nextMentions = [
              ...current.slice(0, mentionIdx),
              ...current.slice(mentionIdx + 1),
            ];
            emit("update:mentions", nextMentions);
          }
          const next = value.slice(0, cursor.value) + value.slice(cursor.value + 1);
          pushUndoSnapshot(next);
          applyEdit(next, cursor.value);
          return;
        }
        if (isMultilineToken(value, cursor.value)) {
          const tokenIdx = tokenIndexAt(value, cursor.value);
          const current = props.multilineTexts ?? [];
          if (tokenIdx >= 0 && tokenIdx < current.length) {
            const nextMultiline = [...current.slice(0, tokenIdx), ...current.slice(tokenIdx + 1)];
            emit("update:multilineTexts", nextMultiline);
          }
        }
        const range = graphemeRangeAt(value, cursor.value);
        if (!range) return;
        const next = value.slice(0, range.start) + value.slice(range.end);
        pushUndoSnapshot(next);
        applyEdit(next, range.start);
        return;
      }

      if (e.key === "Enter") {
        const submitOnEnter = props.submitOnEnter !== false;
        // Shift+Enter or Alt+Enter → insert newline (textarea semantics).
        // Alt+Enter covers terminals like Ghostty that encode Shift+Enter
        // as ESC CR (\x1B\x0D), which is dispatched with altKey.
        const isNewlineEnter = e.shiftKey || e.altKey;
        const isSubmitEnter = submitOnEnter && !isNewlineEnter;
        if (isSubmitEnter && hasPendingPasteImages()) {
          e.preventDefault();
          e.stopPropagation();
          emit("validationError", { reason: "paste_image_pending" });
          return;
        }
        e.preventDefault();
        if (!submitOnEnter || isNewlineEnter) {
          // Behave like textarea: insert newline.
          insertText("\n");
        } else {
          // Some container components (e.g. dialogs) treat Enter as "confirm".
          // TInput prevents default to manage its own editing semantics, but we still
          // want a plain Enter (no modifiers) to be eligible for dialog confirmation.
          if (inDialog) {
            (e as any).__tuiDialogConfirm = !e.ctrlKey && !e.metaKey && !e.altKey;
          }
          emit("change", value);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (props.clearOnEscape) {
          clearAll();
          return;
        }
        const manager = events.value;
        if (manager && manager.getFocused()) {
          manager.focus(null);
          return;
        }
        applyBlur();
        return;
      }

      if (isPrintableKey(e)) {
        e.preventDefault();
        insertText(e.key);
      }
    }

    function applyFocus(): void {
      withInputWidth(() => {
        focused.value = true;
        emit("focus");
        const valueLen = getValue().length;
        const shouldCursorToEnd =
          props.cursorToEndOnFirstFocus &&
          !hasFocusedOnce.value &&
          !skipCursorToEndOnNextFocus.value;
        skipCursorToEndOnNextFocus.value = false;
        if (shouldCursorToEnd) {
          cursor.value = valueLen;
          anchor.value = null;
        }
        hasFocusedOnce.value = true;
        cursor.value = clamp(cursor.value, 0, valueLen);
        ensureCursorVisible();
        syncImeAnchorNow();
        startBlink();
        scheduler.invalidate();
      });
    }

    function applyBlur(): void {
      focused.value = false;
      anchor.value = null;
      compositionBlocked.value = false;
      composing.value = false;
      compositionText.value = "";
      if (imeAnchor?.value?.ownerId === imeOwnerId) imeAnchor.value = null;
      stopBlink();
      emit("blur");
      scheduler.invalidate();
    }

    const { id } = useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        pointerenter: (e: TerminalPointerEvent) => {
          emit("pointerenter", e);
        },
        pointerleave: (e: TerminalPointerEvent) => {
          emit("pointerleave", e);
        },
        pointerdown: (e: TerminalPointerEvent) => {
          if (e.button !== 0) return;
          mouseDownCell = { cellX: e.cellX, cellY: e.cellY };
          mouseDownShift = Boolean(e.shiftKey);
          mouseDragSelecting = false;
          suppressNextClick = false;
        },
        pointermove: (e: TerminalPointerEvent) => {
          if (!mouseDownCell) return;

          const moved = mouseDownCell.cellX !== e.cellX || mouseDownCell.cellY !== e.cellY;
          if (!mouseDragSelecting && !moved) return;

          if (!mouseDragSelecting) {
            mouseDragSelecting = true;
            suppressNextClick = true;

            if (mouseDownShift) {
              setCursorByCell2D(e.cellX, e.cellY, true, e, false);
              scheduler.invalidate();
              return;
            }

            setCursorByCell2D(mouseDownCell.cellX, mouseDownCell.cellY, false, e, false);
            if (e.defaultPrevented) return;
            anchor.value = cursor.value;
          }

          setCursorByCell2D(e.cellX, e.cellY, true, e, false);
          scheduler.invalidate();
        },
        pointerup: () => {
          if (isTerminalHost() && mouseDragSelecting) {
            const sel = selection.value;
            if (sel) {
              const value = getValue();
              const text = value.slice(sel.start, sel.end);
              if (text) copySelectionText(text);
            }
          }
          if (mouseDragSelecting) suppressNextClick = true;
          mouseDownCell = null;
          mouseDownShift = false;
          mouseDragSelecting = false;
        },
        beforeinput: (e: TerminalInputEvent) => {
          // Some environments primarily use beforeinput/input with isComposing instead of composition events.
          if (compositionBlocked.value) return;
          if (e.isComposing || e.inputType === "insertCompositionText") {
            composing.value = true;
            compositionText.value = readEventText(e);
            ensureCursorVisible();
            scheduler.invalidate();
          }
        },
        click: (e: TerminalPointerEvent) => {
          if (suppressNextClick) {
            suppressNextClick = false;
            return;
          }
          const t = typeof e.timeStamp === "number" ? e.timeStamp : Date.now();
          const sameSpot = Boolean(
            lastClick && lastClick.cellX === e.cellX && lastClick.cellY === e.cellY,
          );
          const withinWindow = Boolean(lastClick && t - lastClick.time <= DOUBLE_CLICK_MS);
          const count = sameSpot && withinWindow ? lastClick!.count + 1 : 1;
          const isDoubleClick = count === 2;
          const isTripleClick = count >= 3;
          lastClick = { time: t, cellX: e.cellX, cellY: e.cellY, count };

          focused.value = true;
          skipCursorToEndOnNextFocus.value = true;
          // 更新事件管理器的全局焦点状态，这样 paste 事件才能正确分发
          const manager = events.value;
          if (manager && id.value) {
            manager.focus(id.value);
          }
          emit("focus");
          const extend = !isDoubleClick && !isTripleClick && Boolean(e.shiftKey);
          setCursorByCell2D(e.cellX, e.cellY, extend, e, true);
          if (e.defaultPrevented) return;
          if (isTripleClick) {
            selectAll();
            lastClick = null;
            return;
          }
          if (isDoubleClick) {
            selectTokenAtCursor();
          }
          scheduler.invalidate();
        },
        paste: (e: TerminalInputEvent) => {
          e.preventDefault();
          const text = readEventText(e);
          if (text) {
            void handlePasteText(text);
            return;
          }
          void tryPasteImageFromHandler();
        },
        compositionstart: (e: TerminalInputEvent) => {
          compositionBlocked.value = false;
          composing.value = true;
          compositionText.value = readEventText(e);
          ensureCursorVisible();
          scheduler.invalidate();
        },
        compositionupdate: (e: TerminalInputEvent) => {
          if (compositionBlocked.value) return;
          composing.value = true;
          compositionText.value = readEventText(e);
          ensureCursorVisible();
          scheduler.invalidate();
        },
        compositionend: (e: TerminalInputEvent) => {
          if (compositionBlocked.value) return;
          const text = readEventText(e) || compositionText.value;
          composing.value = false;
          compositionText.value = "";
          compositionBlocked.value = false;
          if (text) {
            suppressEnterUntil = (typeof e.timeStamp === "number" ? e.timeStamp : Date.now()) + 32;
            insertText(text);
          }
          // Many browsers will also fire a follow-up `input` event after `compositionend`.
          // Prevent double-commit by skipping the next input (only within this tick).
          skipNextInput.value = true;
          queueMicrotask(() => {
            skipNextInput.value = false;
          });
          scheduler.invalidate();
        },
        input: (e: TerminalInputEvent) => {
          if (skipNextInput.value) return;
          if (compositionBlocked.value) return;

          // Fallback IME path: some browsers only provide `input` with isComposing toggles.
          if (e.isComposing) {
            composing.value = true;
            compositionText.value = readEventText(e);
            ensureCursorVisible();
            scheduler.invalidate();
            return;
          }

          if (composing.value) {
            const text = readEventText(e) || compositionText.value;
            composing.value = false;
            compositionText.value = "";
            if (text) {
              suppressEnterUntil =
                (typeof e.timeStamp === "number" ? e.timeStamp : Date.now()) + 32;
              insertText(text);
            }
            scheduler.invalidate();
            return;
          }

          const text = readEventText(e);
          if (text) insertText(text);
        },
        focus: () => {
          applyFocus();
        },
        blur: () => {
          applyBlur();
        },
        keydown: onKeydown,
      },
    }));

    const autoFocusArmed = ref(true);
    watchEffect(() => {
      if (!props.autoFocus || !visible.value) {
        autoFocusArmed.value = true;
        return;
      }
      const manager = events.value;
      const nodeId = id.value;
      if (!manager || !nodeId) return;
      if (manager.getFocused() === nodeId) {
        autoFocusArmed.value = false;
        return;
      }
      if (!autoFocusArmed.value) return;
      manager.focus(nodeId);
      autoFocusArmed.value = false;
    });

    watchEffect(() => {
      const manager = events.value;
      const nodeId = id.value;
      if (!manager || !nodeId) return;
      const isFocused = manager.getFocused() === nodeId;
      if (isFocused && !focused.value) {
        applyFocus();
        return;
      }
      if (!isFocused && focused.value) {
        applyBlur();
      }
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      priority: pendingValue.value != null ? "high" : "normal",
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.w,
        props.h,
        props.zIndex,
        props.modelValue,
        props.mentions,
        props.multilineTexts,
        props.placeholder,
        props.placeholderWhenFocused,
        props.style,
        props.autoFocus,
        props.cursorBlink,
        props.cursorShape,
        props.blinkInterval,
        focused.value,
        cursor.value,
        anchor.value,
        scrollX.value,
        scrollY.value,
        composing.value,
        compositionText.value,
        blinkOn.value,
        defaultStyle.value,
        chipStyleProvider.value?.version.value ?? 0,
        pendingValue.value,
        props.skillHighlightStyle,
        props.skillTrigger,
      ],
      paint: () => {
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;

        const style = props.style ?? defaultStyle.value;
        const placeholderVisible = shouldShowPlaceholder.value;
        const offX = placeholderVisible ? 0 : scrollX.value;
        const offY = placeholderVisible ? 0 : scrollY.value;
        const wrap = wrapMode.value && !placeholderVisible;

        const valueTextRaw = getValue();
        const composed = getComposedTextAndCursor(valueTextRaw);
        const textRaw = placeholderVisible
          ? props.placeholderWhenFocused
            ? ` ${props.placeholder}`
            : props.placeholder
          : composed.text;
        const text = props.secret && !placeholderVisible ? maskText(textRaw) : textRaw;

        const baseStyle: Style = placeholderVisible
          ? {
              ...style,
              fg: style.fg ?? defaultStyle.value.fg,
              dim: true,
              bold: false,
            }
          : style;
        const { wAll, padX, w: contentW } = measureContent(r);
        const x0 = r.x + padX;
        const width = Math.max(1, contentW);
        const firstWidth = width;
        const lines: readonly (LineInfo | WrappedLineInfo)[] = wrap
          ? wrapToLinesFirstWidthInline(
              text,
              props.multilineTexts,
              props.mentions,
              firstWidth,
              width,
            )
          : computeLines(text);

        for (let row = 0; row < r.h; row++) {
          const lineIndex = offY + row;
          const info = lines[lineIndex] as any;
          const rowTextW = width;
          const rowRender = info
            ? buildInlineRow(
                textRaw,
                text,
                props.multilineTexts,
                props.mentions,
                info.start,
                info.end,
                rowTextW,
                wrap ? 0 : offX,
              )
            : { text: spaces(rowTextW), chips: [] };
          const visible = rowRender.text;

          terminal.write(spaces(wAll), {
            x: r.x,
            y: r.y + row,
            style: baseStyle,
          });
          if (contentW <= 0) continue;

          const textX = x0;
          terminal.write(visible, { x: textX, y: r.y + row, style: baseStyle });

          if (rowRender.chips.length > 0) {
            for (const chip of rowRender.chips) {
              let chipStyle: Style;
              if (chip.kind === "multiline") {
                chipStyle = props.multilineChipStyle
                  ? { ...style, ...props.multilineChipStyle }
                  : { ...style, underline: true, bold: true };
              } else {
                const absPath = String(chip.absPath ?? "");
                chipStyle = chipStyleProvider.value?.getStyle(style, {
                  kind: "mention",
                  absPath,
                }) ?? {
                  ...mentionChipStyle(style, absPath),
                  ...(props.mentionChipStyle ?? {}),
                };
                const href = toTerminalHref(absPath);
                if (href) chipStyle = { ...chipStyle, href };
              }
              terminal.write(chip.label, {
                x: textX + chip.startCell,
                y: r.y + row,
                style: chipStyle,
              });
            }
          }

          const shlStyle = props.skillHighlightStyle;
          if (shlStyle && props.skillTrigger && !placeholderVisible) {
            const trigger = props.skillTrigger;
            const vis = visible;
            let searchFrom = 0;
            while (searchFrom < vis.length) {
              const idx = vis.indexOf(trigger, searchFrom);
              if (idx < 0) break;
              let end = idx + trigger.length;
              while (end < vis.length && vis[end] !== " " && vis[end] !== "\n") end++;
              if (end > idx + trigger.length) {
                const label = vis.slice(idx, end);
                const cellStart = textCellWidth(vis.slice(0, idx));
                terminal.write(label, {
                  x: textX + cellStart,
                  y: r.y + row,
                  style: { ...style, ...shlStyle },
                });
              }
              searchFrom = end;
            }
          }
        }

        const sel = selection.value;
        if (sel && !placeholderVisible) {
          const selStyle: Style = { ...style, inverse: true };
          for (let row = 0; row < r.h; row++) {
            const lineIndex = offY + row;
            const info = lines[lineIndex] as any;
            if (!info) continue;
            const rowTextW = width;
            const xBase = x0;
            const y = r.y + row;
            const rowOffX = wrap ? 0 : offX;
            const segments = buildInlineSelectionSegments(
              composed.text,
              text,
              props.multilineTexts,
              props.mentions,
              info.start,
              info.end,
              sel,
              rowTextW,
              rowOffX,
            );
            for (const seg of segments) {
              if (!seg.text) continue;
              terminal.write(seg.text, {
                x: xBase + seg.startCell,
                y,
                style: selStyle,
              });
            }
          }
        }

        // Hide the cursor while a selection is active, otherwise the "block" cursor can
        // obscure selected glyphs (especially noticeable for wide/CJK characters).
        if (focused.value && blinkOn.value && !(selection.value && !placeholderVisible)) {
          const wAll = width;
          const firstW = wAll;
          const cursorTextRaw = placeholderVisible ? "" : composed.text;
          const cursorText =
            props.secret && !placeholderVisible ? maskText(cursorTextRaw) : cursorTextRaw;
          const pos = wrap
            ? indexToWrappedCellColFirstWidthInline(
                cursorText,
                props.multilineTexts,
                props.mentions,
                composed.cursor,
                firstW,
                wAll,
              )
            : indexToLineCellColInline(
                cursorText,
                props.multilineTexts,
                props.mentions,
                composed.cursor,
              );
          const cx0 = pos.col - offX;
          const cy = pos.line - offY;
          if (imeAnchor && focused.value) {
            const cx = clamp(cx0, 0, Math.max(0, width - 1));
            const cyClamped = clamp(cy, 0, Math.max(0, r.h - 1));
            imeAnchor.value = {
              cellX: r.x + padX + cx,
              cellY: r.y + cyClamped,
              ownerId: imeOwnerId,
            };
          }
          if (cx0 >= 0 && cx0 < width && cy >= 0 && cy < r.h) {
            const y = r.y + cy;
            let x = x0 + cx0;
            let cell: Cell | null = null;

            try {
              cell = terminal.getCell(x, y);
              if (cell.continuation && x > 0) {
                x -= 1;
                cell = terminal.getCell(x, y);
              }
            } catch {
              cell = null;
            }

            const cellStyle = cell?.style ?? style;
            const baseCursorStyle: Style = {
              ...cellStyle,
              inverse: true,
              // Cursor should stay visible even when the underlying cell (e.g. placeholder)
              // is rendered dim.
              dim: false,
            };
            const ch = cell && !cell.continuation ? cell.ch || " " : " ";

            if (props.cursorShape === "underline") {
              terminal.put(x, y, ch, { ...baseCursorStyle, underline: true });
            } else {
              // Both 'bar' and 'block' use inverse on the character under the cursor.
              // A true bar requires overlay support; inverse is the reliable TUI fallback.
              terminal.put(x, y, ch, baseCursorStyle);
            }
          }
        }
      },
    }));

    onBeforeUnmount(() => {
      stopBlink();
    });

    return () => h("span", rootProps);
  },
});
