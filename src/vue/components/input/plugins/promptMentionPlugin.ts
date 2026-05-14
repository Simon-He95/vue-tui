import type { Style } from "../../../../core/types.js";
import type {
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../../../events/manager/types.js";
import type { MentionPathProvider, MentionSuggestionProvider } from "./promptMentionState.js";
import type { TInputPlugin, TInputPluginContext } from "./types.js";
import { reactive, watch, watchEffect } from "vue";
import { charCellWidth } from "../../../../core/buffer/width.js";
import { getCliLatencyProfiler } from "../../../../observability/cli-latency.js";
import { useRenderNode } from "../../../composables/use-render-node.js";
import { useTerminalNode } from "../../../composables/use-terminal-node.js";
import { repeatChar, sanitizeInlineText, spaces } from "../../../utils/text.js";
import { padEndByCells, sliceByCellsWindow, textCellWidth } from "../utils/inlineText.js";
import { clamp } from "../utils/primitives.js";
import { mentionChipStyle } from "./mentionUtils.js";
import { usePromptMentionState } from "./promptMentionState.js";

export type { MentionPathProvider, MentionSuggestionProvider } from "./promptMentionState.js";

type HighlightRange = Readonly<{ start: number; end: number }>;

function omitInverse(style?: Style): Style {
  if (!style) return {};
  const { inverse: _inverse, ...rest } = style;
  void _inverse;
  return rest;
}

function resolveSelectedPromptStyle(
  popupBase: Style | undefined,
  selectedOverride: Style | undefined,
): Style {
  if (!selectedOverride) return { ...popupBase, inverse: true, bold: true, dim: false };

  if (selectedOverride.bg == null) {
    return {
      ...omitInverse(popupBase),
      ...omitInverse(selectedOverride),
      inverse: true,
      bold: true,
      dim: false,
    };
  }

  return {
    ...popupBase,
    ...selectedOverride,
    dim: false,
  };
}

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
    baseStyle: any;
    highlightStyle: any;
    terminal: {
      write: (text: string, opts?: { x?: number; y?: number; style?: any }) => void;
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
  let currentStyle = baseStyle;

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

function buildPromptMatchHighlightStyle(baseStyle: any, overrideStyle?: any): any {
  return {
    ...baseStyle,
    ...(overrideStyle ?? { fg: "yellow", bold: true, dim: false }),
  };
}

function countMentionTokens(value: string, mentionToken: string, endIndex = value.length): number {
  let count = 0;
  const limit = clamp(endIndex, 0, value.length);
  for (let i = 0; i < limit; i++) {
    if (value[i] === mentionToken) count++;
  }
  return count;
}

function mentionIndexAt(value: string, mentionToken: string, index: number): number {
  return countMentionTokens(value, mentionToken, index);
}

export type PromptMentionPluginOptions = Readonly<{
  mentionSuggestionProviders?: readonly MentionSuggestionProvider[];
  mentionPathProvider?: MentionPathProvider;
}>;

export function createPromptMentionPlugin(options: PromptMentionPluginOptions = {}): TInputPlugin {
  const latency = getCliLatencyProfiler();
  return {
    name: "promptMention",
    install: (ctx: TInputPluginContext) => {
      const getProps = () => ctx.getProps();
      // Popup should render above all content, even if it overlaps siblings with higher stacks.
      const promptOverlayStack = ctx.render.createStack(ctx.render.rootStack, 10_000);
      let lastTopClampedRect: { x: number; w: number } | null = null;
      let lastPromptRect: { y: number; h: number } | null = null;
      const derivedStyleCache = new WeakMap<
        object,
        {
          borderStyle: any;
          itemStyle: any;
          selectedStyle: any;
          detailStyle: any;
          selectedDetailStyle: any;
          emptyStyle: any;
        }
      >();

      const reactiveProps = reactive({
        promptSuggestions: getProps().promptSuggestions,
        promptTrigger: getProps().promptTrigger,
        promptTriggers: getProps().promptTriggers,
        promptMaxItems: getProps().promptMaxItems,
        promptAlign: getProps().promptAlign,
        mentionTrigger: getProps().mentionTrigger,
        mentionWorkspace: getProps().mentionWorkspace,
        mentionMode: getProps().mentionMode,
        mentionShowHidden: getProps().mentionShowHidden,
        mentionSuggestions: getProps().mentionSuggestions,
        mentionMaxItems: getProps().mentionMaxItems,
        mentions: getProps().mentions,
        skillTrigger: getProps().skillTrigger,
        skillSuggestions: getProps().skillSuggestions,
      });

      watchEffect(() => {
        const p = getProps();
        reactiveProps.promptSuggestions = p.promptSuggestions;
        reactiveProps.promptTrigger = p.promptTrigger;
        reactiveProps.promptTriggers = p.promptTriggers;
        reactiveProps.promptMaxItems = p.promptMaxItems;
        reactiveProps.promptAlign = p.promptAlign;
        reactiveProps.mentionTrigger = p.mentionTrigger;
        reactiveProps.mentionWorkspace = p.mentionWorkspace;
        reactiveProps.mentionMode = p.mentionMode;
        reactiveProps.mentionShowHidden = p.mentionShowHidden;
        reactiveProps.mentionSuggestions = p.mentionSuggestions;
        reactiveProps.mentionMaxItems = p.mentionMaxItems;
        reactiveProps.mentions = p.mentions;
        reactiveProps.skillTrigger = p.skillTrigger;
        reactiveProps.skillSuggestions = p.skillSuggestions;
      });

      const promptMention = usePromptMentionState({
        props: reactiveProps,
        mentionSuggestionProviders: options.mentionSuggestionProviders,
        mentionPathProvider: options.mentionPathProvider,
        focused: ctx.focused,
        cursor: ctx.cursor,
        getValue: ctx.getValue,
        rawAbsRect: ctx.rawAbsRect,
        terminal: ctx.terminal,
        scheduler: ctx.scheduler,
        multilineToken: "\uFFFC",
        mentionToken: ctx.mentionToken,
      });

      watch(
        () => {
          if (!ctx.visible.value || !promptMention.promptVisible.value) return null;
          const rect = promptMention.promptRect.value;
          return [
            Math.floor(rect.x),
            Math.floor(rect.y),
            Math.floor(rect.w),
            Math.floor(rect.h),
          ].join(":");
        },
        (nextRectKey, prevRectKey) => {
          if (!prevRectKey || nextRectKey === prevRectKey) return;
          ctx.render.invalidatePlane("default");
          ctx.scheduler.invalidate({ priority: "high" });
        },
      );

      ctx.registerChipStyleProvider({
        getStyle: (baseStyle, chip) => {
          if (chip.kind !== "mention") return null;
          const absPath = String(chip.absPath ?? "");
          if (!absPath) return null;
          const fsKind = promptMention.mentionKindByPath.get(absPath);
          return {
            ...mentionChipStyle(baseStyle, absPath, fsKind),
            ...(getProps().mentionChipStyle ?? {}),
          };
        },
        version: promptMention.mentionKindVersion,
      });

      function replaceMentionInContext(
        absPath: string,
        tokenStart: number,
        tokenEnd: number,
      ): void {
        const cleaned = String(absPath || "").trim();
        if (!cleaned) return;

        const value = ctx.getValue();
        const start = clamp(tokenStart, 0, value.length);
        const end = clamp(tokenEnd, start, value.length);

        const currentMentions = getProps().mentions ?? [];
        const nextMentions = [...currentMentions];

        let before = value.slice(0, start);
        let after = value.slice(end);

        const closeMatch = after.match(/^[\s\u200B]*\]+/u);
        if (closeMatch) {
          after = after.slice(closeMatch[0].length);
          let i = before.length - 1;
          while (i >= 0 && /[\s\u200B]/u.test(before[i]!)) i--;
          if (i >= 0 && before[i] === "[") before = before.slice(0, i) + before.slice(i + 1);
        }

        const insertIndex = mentionIndexAt(value, ctx.mentionToken, start);
        nextMentions.splice(insertIndex, 0, cleaned);
        ctx.emit("update:mentions", nextMentions);

        let nextAfter = after;
        if (nextAfter.startsWith(" ")) nextAfter = nextAfter.slice(1);
        const nextValue = `${before}${ctx.mentionToken} ${nextAfter}`;
        const nextCursor = before.length + 2;
        ctx.pushUndoSnapshot(nextValue);
        ctx.applyEdit(nextValue, nextCursor);
      }

      function acceptPrompt(index: number): void {
        const ctx0 = promptMention.activeContext.value;
        if (!ctx0) return;
        const list = promptMention.promptMatches.value;
        const match = list[clamp(index, 0, Math.max(0, list.length - 1))];
        if (!match) return;

        const suggestion = match.item;
        const mentionTrigger = getProps().mentionTrigger || "@";
        const isMention = ctx0.tokenText.startsWith(mentionTrigger);

        if (isMention) {
          if (!getProps().collectMentions || suggestion.mentionBehavior === "inline") {
            const insert =
              suggestion.insert ??
              (suggestion.value.endsWith(" ") ? suggestion.value : `${suggestion.value} `);
            const before = ctx.getValue().slice(0, ctx0.tokenStart);
            let after = ctx.getValue().slice(ctx0.tokenEnd);
            if (insert.endsWith(" ") && after.startsWith(" ")) after = after.slice(1);
            const nextValue = `${before}${insert}${after}`;
            const nextCursor = ctx0.tokenStart + insert.length;
            promptMention.promptSuppressedKey.value = null;
            ctx.pushUndoSnapshot(nextValue);
            ctx.applyEdit(nextValue, nextCursor);
            return;
          }

          const mentionValue =
            typeof suggestion.mentionValue === "string" ? String(suggestion.mentionValue) : "";
          const raw =
            mentionValue ||
            (String(suggestion.value || "").startsWith(mentionTrigger)
              ? String(suggestion.value).slice(mentionTrigger.length)
              : String(suggestion.value));
          const absPath = mentionValue
            ? raw
            : getProps().mentionWorkspace
              ? ctx.resolvePath(raw)
              : raw;
          if (!absPath) {
            promptMention.promptSuppressedKey.value = null;
            return;
          }
          // Replace the "@..." token under cursor with the mention token, so we don't
          // leave the leading "@" (or partial query) in the input.
          replaceMentionInContext(absPath, ctx0.tokenStart, ctx0.tokenEnd);
          promptMention.promptSuppressedKey.value = null;
          ctx.scheduler.invalidate();
          return;
        }

        if (typeof suggestion.onSelect === "function") {
          const handled = suggestion.onSelect({
            value: suggestion.value,
            query: ctx0.query,
          });
          if (handled !== false) {
            const value = ctx.getValue();
            const before = value.slice(0, ctx0.tokenStart);
            const after = value.slice(ctx0.tokenEnd);
            const nextValue = `${before}${after}`;
            ctx.pushUndoSnapshot(nextValue);
            ctx.applyEdit(nextValue, ctx0.tokenStart);
            promptMention.promptSuppressedKey.value = ctx0.key;
            ctx.scheduler.invalidate();
            return;
          }
        }

        const insert =
          suggestion.insert ??
          (suggestion.value.endsWith(" ") ? suggestion.value : `${suggestion.value} `);
        const before = ctx.getValue().slice(0, ctx0.tokenStart);
        let after = ctx.getValue().slice(ctx0.tokenEnd);
        if (insert.endsWith(" ") && after.startsWith(" ")) after = after.slice(1);

        const nextValue = `${before}${insert}${after}`;
        const nextCursor = ctx0.tokenStart + insert.length;
        promptMention.promptSuppressedKey.value = null;
        ctx.pushUndoSnapshot(nextValue);
        ctx.applyEdit(nextValue, nextCursor);
      }

      function completeMentionDirectory(
        suggestion: { value?: string; detail?: string },
        ctx0: { tokenStart: number; tokenEnd: number; tokenText: string },
      ): boolean {
        const mentionTrigger = getProps().mentionTrigger || "@";
        if (!ctx0.tokenText.startsWith(mentionTrigger)) return false;
        if (String(suggestion.detail ?? "") !== "directory") return false;

        let insert = String(suggestion.value ?? "");
        if (!insert.startsWith(mentionTrigger)) return false;
        if (!insert.endsWith("/") && !insert.endsWith("\\")) insert = `${insert}/`;

        const value = ctx.getValue();
        const before = value.slice(0, clamp(ctx0.tokenStart, 0, value.length));
        const after = value.slice(clamp(ctx0.tokenEnd, 0, value.length));

        const nextValue = `${before}${insert}${after}`;
        const nextCursor = before.length + insert.length;
        promptMention.promptSuppressedKey.value = null;
        promptMention.promptActive.value = 0;
        ctx.pushUndoSnapshot(nextValue);
        ctx.applyEdit(nextValue, nextCursor);
        ctx.scheduler.invalidate();
        return true;
      }

      function handlePromptKeydown(e: TerminalKeyboardEvent): boolean {
        if (!promptMention.promptVisible.value) return false;
        const markPromptOperation = (suffix: string): void => {
          const ctx0 = promptMention.activeContext.value;
          const mentionTrigger = getProps().mentionTrigger || "@";
          const skillTrigger = getProps().skillTrigger || "";
          const tokenText = String(ctx0?.tokenText ?? "");
          const scope = tokenText.startsWith(mentionTrigger)
            ? "prompt.mention"
            : skillTrigger && tokenText.startsWith(skillTrigger)
              ? "prompt.skill"
              : "prompt.command";
          latency?.markOperation(`${scope}.${suffix}`);
        };
        const len = promptMention.promptMatches.value.length;
        if (e.key === "ArrowDown") {
          markPromptOperation("navigate.next");
          e.preventDefault();
          if (len <= 0) {
            promptMention.promptActive.value = 0;
          } else if (promptMention.promptActive.value >= len - 1) {
            promptMention.promptActive.value = 0;
          } else {
            promptMention.promptActive.value = clamp(
              promptMention.promptActive.value + 1,
              0,
              len - 1,
            );
          }
          ctx.scheduler.invalidate();
          return true;
        }
        if (e.key === "ArrowUp") {
          markPromptOperation("navigate.prev");
          e.preventDefault();
          if (len <= 0) {
            promptMention.promptActive.value = 0;
          } else if (promptMention.promptActive.value <= 0) {
            promptMention.promptActive.value = len - 1;
          } else {
            promptMention.promptActive.value = clamp(
              promptMention.promptActive.value - 1,
              0,
              len - 1,
            );
          }
          ctx.scheduler.invalidate();
          return true;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          const ctx0 = promptMention.activeContext.value;
          const mentionTrigger = getProps().mentionTrigger || "@";
          const skillTrigger = getProps().skillTrigger || "";
          const isMention = Boolean(ctx0?.tokenText?.startsWith(mentionTrigger));
          const isSkill = Boolean(
            skillTrigger && ctx0?.tokenText?.startsWith(skillTrigger) && !isMention,
          );

          // For slash prompts, only accept the suggestion on Enter when the typed token is a prefix
          // of the selected suggestion. This avoids surprising fuzzy matches (e.g. typing an unknown
          // command and accidentally triggering a different one).
          // For skill/mention context, Enter submits the message (Tab is used to accept).
          if (e.key === "Enter" && !e.shiftKey && !isMention && !isSkill) {
            if (len === 0) return false;
            const match =
              promptMention.promptMatches.value[
                clamp(
                  promptMention.promptActive.value,
                  0,
                  Math.max(0, promptMention.promptMatches.value.length - 1),
                )
              ];
            const typed = String(ctx0?.tokenText ?? "");
            const candidate = String(match?.item?.value ?? "");
            if (!typed || !candidate.startsWith(typed)) return false;
            markPromptOperation("accept");
            e.preventDefault();
            acceptPrompt(promptMention.promptActive.value);
            return true;
          }

          if (e.key === "Tab" && (isMention || isSkill)) {
            // Tab completes mention/skill selections without intercepting Enter (which submits).
            markPromptOperation("accept");
            e.preventDefault();
            if (len === 0) return true;
            const list = promptMention.promptMatches.value;
            const match =
              list[clamp(promptMention.promptActive.value, 0, Math.max(0, list.length - 1))];
            if (isMention && match && ctx0 && completeMentionDirectory(match.item, ctx0))
              return true;
            acceptPrompt(promptMention.promptActive.value);
            return true;
          }

          if (len === 0) return false;
          markPromptOperation("accept");
          e.preventDefault();
          acceptPrompt(promptMention.promptActive.value);
          return true;
        }
        if (e.key === "Escape") {
          markPromptOperation("dismiss");
          e.preventDefault();
          promptMention.promptSuppressedKey.value = promptMention.activeContext.value?.key ?? null;
          ctx.scheduler.invalidate();
          return true;
        }
        return false;
      }

      ctx.registerKeydownInterceptor(handlePromptKeydown);

      // Menu paint + click handling.
      useRenderNode(() => ({
        zIndex: getProps().zIndex + 5,
        stack: promptOverlayStack,
        dirtyRowsHint: (() => {
          const currentRect =
            ctx.visible.value && promptMention.promptVisible.value
              ? {
                  y: Math.floor(promptMention.promptRect.value.y),
                  h: Math.max(0, Math.floor(promptMention.promptRect.value.h)),
                }
              : null;
          const rects = [lastPromptRect, currentRect].filter(Boolean) as Array<{
            y: number;
            h: number;
          }>;
          if (!rects.length) return undefined;
          const maxRows = ctx.terminal.size().rows;
          const start = Math.max(0, Math.min(...rects.map((rect) => rect.y)) - 1);
          const end = Math.min(maxRows, Math.max(...rects.map((rect) => rect.y + rect.h)) + 1);
          if (end <= start) return undefined;
          return Array.from({ length: end - start }, (_, index) => start + index);
        })(),
        priority: "high",
        rect:
          ctx.visible.value && promptMention.promptVisible.value
            ? promptMention.promptRect.value
            : { x: 0, y: 0, w: 0, h: 0 },
        deps: [
          ctx.visible.value,
          promptMention.promptVisible.value,
          promptMention.promptRect.value,
          promptMention.promptMatches.value,
          promptMention.promptMatchesVisible.value,
          promptMention.promptWindowStart.value,
          promptMention.promptActive.value,
          promptMention.promptActiveVisible.value,
          getProps().style,
          getProps().promptPopupStyle,
          getProps().promptPopupBorderStyle,
          getProps().promptPopupMatchStyle,
          getProps().promptSelectedStyle,
          getProps().zIndex,
          ctx.defaultStyle.value,
          promptMention.mentionKindVersion.value,
        ],
        paint: () => {
          if (!ctx.visible.value || !promptMention.promptVisible.value) return;
          const r = promptMention.promptRect.value;
          if (r.w < 3 || r.h < 3) return;
          lastPromptRect = {
            y: Math.floor(r.y),
            h: Math.max(0, Math.floor(r.h)),
          };

          const popupBase =
            getProps().promptPopupStyle ?? getProps().style ?? ctx.defaultStyle.value;
          const popupBorderStyle = getProps().promptPopupBorderStyle;
          const popupMatchStyle = getProps().promptPopupMatchStyle;
          const selectedOverride = getProps().promptSelectedStyle;
          const styleKey = popupBase ?? null;
          const cacheKey = selectedOverride ? null : styleKey;
          let derived = cacheKey ? derivedStyleCache.get(cacheKey) : null;
          if (!derived) {
            const borderStyle: typeof popupBase = popupBorderStyle
              ? { ...popupBase, ...popupBorderStyle }
              : { ...popupBase, dim: true };
            const itemStyle: typeof popupBase = { ...popupBase, dim: false };
            const selectedStyle: typeof popupBase = resolveSelectedPromptStyle(
              popupBase,
              selectedOverride,
            );
            const detailStyle: typeof popupBase = { ...popupBase, dim: true };
            const selectedDetailStyle: typeof popupBase = {
              ...selectedStyle,
              dim: true,
            };
            const emptyStyle: typeof popupBase = { ...popupBase, dim: true };
            derived = {
              borderStyle,
              itemStyle,
              selectedStyle,
              detailStyle,
              selectedDetailStyle,
              emptyStyle,
            };
            if (cacheKey) derivedStyleCache.set(cacheKey, derived);
          }
          const x0 = Math.floor(r.x);
          const y0 = Math.floor(r.y);
          const w = Math.max(0, Math.floor(r.w));
          const h = Math.max(0, Math.floor(r.h));
          const innerW = Math.max(0, w - 2);
          const sidePad = innerW >= 4 ? 1 : 0;
          const contentW = Math.max(0, innerW - sidePad * 2);
          const contentX = x0 + 1 + sidePad;

          const borderStyle = derived.borderStyle;
          if (lastTopClampedRect && y0 > 0) {
            ctx.terminal.write(spaces(lastTopClampedRect.w), {
              x: lastTopClampedRect.x,
              y: 0,
              style: popupBase,
            });
            lastTopClampedRect = null;
          }
          if (y0 === 0) lastTopClampedRect = { x: x0, w };
          else lastTopClampedRect = null;
          ctx.terminal.write(`┌${repeatChar("─", innerW)}┐`, {
            x: x0,
            y: y0,
            style: borderStyle,
          });
          ctx.terminal.write(`└${repeatChar("─", innerW)}┘`, {
            x: x0,
            y: y0 + h - 1,
            style: borderStyle,
          });

          const totalList = promptMention.promptMatches.value;
          const start = promptMention.promptWindowStart.value;
          const list = promptMention.promptMatchesVisible.value;
          const query = promptMention.activeContext.value?.query ?? "";
          const total = totalList.length;
          const visible = list.length;
          const hasAbove = start > 0;
          const hasBelow = start + visible < total;
          const contentH = Math.max(0, h - 2);
          for (let row = 0; row < contentH; row++) {
            const y = y0 + 1 + row;
            ctx.terminal.put(x0, y, "│", borderStyle);
            const rightBorderChar =
              row === 0 && hasAbove ? "▲" : row === contentH - 1 && hasBelow ? "▼" : "│";
            ctx.terminal.put(x0 + w - 1, y, rightBorderChar, borderStyle);

            if (row >= list.length) {
              ctx.terminal.write(spaces(innerW), {
                x: x0 + 1,
                y,
                style: borderStyle,
              });
              continue;
            }

            const match = list[row]!;
            const isSelected = row === promptMention.promptActiveVisible.value;
            const rawValue = sanitizeInlineText(match.item.value);
            const rawDetail = match.item.detail ? sanitizeInlineText(match.item.detail) : "";
            const highlightRanges = query ? computeHighlightRanges(rawValue, query) : [];

            const valueCells = textCellWidth(rawValue);
            const detailCells = rawDetail ? textCellWidth(rawDetail) : 0;
            const minGap = 2;
            const availableForDetail = contentW - valueCells - minGap;

            if (rawDetail && availableForDetail >= 4) {
              const valueStyle = isSelected ? derived.selectedStyle : derived.itemStyle;
              const highlightStyle = buildPromptMatchHighlightStyle(valueStyle, popupMatchStyle);
              const rowStyle = valueStyle;
              if (sidePad > 0) {
                ctx.terminal.write(spaces(sidePad), {
                  x: x0 + 1,
                  y,
                  style: rowStyle,
                });
              }
              writeHighlightedText({
                text: rawValue,
                ranges: highlightRanges,
                x: contentX,
                y,
                maxCells: valueCells,
                baseStyle: valueStyle,
                highlightStyle,
                terminal: ctx.terminal,
              });

              const gapWidth = contentW - valueCells - Math.min(detailCells, availableForDetail);
              const gapStyle = isSelected ? derived.selectedStyle : derived.itemStyle;
              ctx.terminal.write(spaces(gapWidth), {
                x: contentX + valueCells,
                y,
                style: gapStyle,
              });

              const detailText = sliceByCellsWindow(rawDetail, 0, availableForDetail);
              const dStyle = isSelected ? derived.selectedDetailStyle : derived.detailStyle;
              ctx.terminal.write(detailText, {
                x: contentX + valueCells + gapWidth,
                y,
                style: dStyle,
              });
              if (sidePad > 0) {
                ctx.terminal.write(spaces(sidePad), {
                  x: contentX + contentW,
                  y,
                  style: rowStyle,
                });
              }
            } else {
              const style = isSelected ? derived.selectedStyle : derived.itemStyle;
              const highlightStyle = buildPromptMatchHighlightStyle(style, popupMatchStyle);
              if (sidePad > 0) {
                ctx.terminal.write(spaces(sidePad), {
                  x: x0 + 1,
                  y,
                  style,
                });
              }
              const clippedValue = sliceByCellsWindow(rawValue, 0, contentW);
              const usedCells = writeHighlightedText({
                text: clippedValue,
                ranges: highlightRanges,
                x: contentX,
                y,
                maxCells: contentW,
                baseStyle: style,
                highlightStyle,
                terminal: ctx.terminal,
              });
              if (usedCells < contentW) {
                ctx.terminal.write(spaces(contentW - usedCells), {
                  x: contentX + usedCells,
                  y,
                  style,
                });
              }
              if (sidePad > 0) {
                ctx.terminal.write(spaces(sidePad), {
                  x: contentX + contentW,
                  y,
                  style,
                });
              }
            }
          }

          if (list.length === 0 && contentH > 0) {
            const y = y0 + 1;
            ctx.terminal.put(x0, y, "│", borderStyle);
            ctx.terminal.put(x0 + w - 1, y, "│", borderStyle);
            const msg = padEndByCells(sliceByCellsWindow("(no matches)", 0, contentW), contentW);
            if (sidePad > 0) {
              ctx.terminal.write(spaces(sidePad), {
                x: x0 + 1,
                y,
                style: derived.emptyStyle,
              });
            }
            ctx.terminal.write(msg, {
              x: contentX,
              y,
              style: derived.emptyStyle,
            });
            if (sidePad > 0) {
              ctx.terminal.write(spaces(sidePad), {
                x: contentX + contentW,
                y,
                style: derived.emptyStyle,
              });
            }
          }
        },
      }));

      useTerminalNode(() => ({
        rect: promptMention.promptVisible.value
          ? promptMention.promptRect.value
          : { x: 0, y: 0, w: 0, h: 0 },
        zIndex: ctx.eventZ.value + 10_000,
        visible: ctx.visible.value && promptMention.promptVisible.value,
        focusable: false,
        handlers: {
          click: (e: TerminalPointerEvent) => {
            const r = promptMention.promptRect.value;
            const y = e.cellY - r.y;
            if (y <= 0 || y >= r.h - 1) return;
            const idx = y - 1;
            const start = promptMention.promptWindowStart.value;
            const globalIdx = start + idx;
            promptMention.promptActive.value = clamp(
              globalIdx,
              0,
              Math.max(0, promptMention.promptMatches.value.length - 1),
            );
            acceptPrompt(promptMention.promptActive.value);
          },
        },
      }));

      // Ensure prompt selection doesn't get stale if parent mutates mentions externally.
      watchEffect(() => {
        void getProps().mentions;
        void promptMention.mentionKindVersion.value;
      });
    },
  };
}
