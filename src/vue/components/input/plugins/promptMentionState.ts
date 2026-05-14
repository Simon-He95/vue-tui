import type { ComputedRef, Ref } from "vue";
import type { FsEntryKind } from "../../../../cli/path-provider-types.js";
import type { PathPickMode, PathSuggestion } from "../../../../cli/path-suggest-core.js";
import type { Terminal } from "../../../../core/types.js";
import type { Rect } from "../../../../events/manager/types.js";
import { computed, ref, watch, watchEffect } from "vue";
import { clamp, isWhitespace } from "../utils/primitives.js";
import { isCommitMention } from "./mentionUtils.js";

const MENTION_SUGGEST_DEBOUNCE_MS = 80;

export type PromptSuggestion = Readonly<{
  value: string;
  insert?: string;
  label?: string;
  detail?: string;
  keywords?: readonly string[];
  mentionValue?: string;
  mentionBehavior?: "collect" | "inline";
  onSelect?: (info: Readonly<{ value: string; query: string }>) => void | boolean;
}>;

export type MentionSuggestionProvider = (
  info: Readonly<{
    query: string;
    tokenText: string;
    trigger: string;
    workspace: string;
    maxItems: number;
  }>,
) => readonly PromptSuggestion[] | Promise<readonly PromptSuggestion[]>;

export type MentionPathProvider = Readonly<{
  stat?: (
    absPath: string,
  ) => FsEntryKind | null | undefined | Promise<FsEntryKind | null | undefined>;
  suggest?: (
    info: Readonly<{
      workspaceAbs: string;
      input: string;
      mode: PathPickMode;
      max: number;
      showHidden: boolean;
      maxDepth: number;
    }>,
  ) => readonly PathSuggestion[] | Promise<readonly PathSuggestion[]>;
}>;

export type PromptContext = Readonly<{
  tokenStart: number;
  tokenEnd: number;
  tokenText: string;
  query: string;
  key: string;
  trigger: string;
}>;

type PromptMatch = Readonly<{
  item: PromptSuggestion;
  score: number;
  order: number;
}>;

export function fuzzyScore(query: string, candidate: string): number | null {
  const q = query.trim().toLowerCase();
  const c = candidate.toLowerCase();
  if (!q) return 0;
  if (c === q) return 10_000;

  let score = 0;
  if (c.startsWith(q)) score += 1_000;

  let qi = 0;
  let streak = 0;
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) {
      qi++;
      streak++;
      score += 10 + streak * 5;
    } else {
      streak = 0;
    }
  }

  if (qi < q.length) return null;

  score += Math.max(0, 40 - c.length);
  return score;
}

function isMentionBoundary(ch: string, multilineToken: string, mentionToken: string): boolean {
  if (ch === multilineToken || ch === mentionToken) return true;
  if (isWhitespace(ch)) return true;
  return /[,;:!?，。！？、()[\]{}<>]/.test(ch);
}

function isMentionStart(
  text: string,
  index: number,
  trigger: string,
  multilineToken: string,
  mentionToken: string,
): boolean {
  if (!trigger || text[index] !== trigger) return false;
  if (index <= 0) return true;
  const prev = text[index - 1]!;
  return isMentionBoundary(prev, multilineToken, mentionToken) || !/\w/.test(prev);
}

function isMentionChar(ch: string): boolean {
  return /^[\p{L}\p{M}\p{N}_./~\\:-]$/u.test(ch);
}

function computePromptContext(
  value: string,
  cursorIndex: number,
  triggers: readonly string[],
): PromptContext | null {
  if (!triggers.length) return null;
  const idx = clamp(cursorIndex, 0, value.length);
  const lineStart = value.lastIndexOf("\n", Math.max(0, idx - 1)) + 1;

  let matchedTrigger: string | null = null;
  for (const t of triggers) {
    if (t && value.slice(lineStart, lineStart + t.length) === t) {
      matchedTrigger = t;
      break;
    }
  }
  if (!matchedTrigger) return null;

  let tokenEnd = value.length;
  for (let i = lineStart; i < value.length; i++) {
    if (isWhitespace(value[i]!)) {
      tokenEnd = i;
      break;
    }
  }

  if (idx < lineStart || idx > tokenEnd) return null;

  const tokenText = value.slice(lineStart, tokenEnd);
  const query = tokenText.slice(matchedTrigger.length);
  const key = `${lineStart}:${tokenText}`;
  return { tokenStart: lineStart, tokenEnd, tokenText, query, key, trigger: matchedTrigger };
}

function computeMentionContext(
  value: string,
  cursorIndex: number,
  trigger: string,
  multilineToken: string,
  mentionToken: string,
): PromptContext | null {
  if (!trigger) return null;

  const idx = clamp(cursorIndex, 0, value.length);
  let start = -1;
  for (let i = idx - 1; i >= 0; i--) {
    const ch = value[i]!;
    if (isMentionStart(value, i, trigger, multilineToken, mentionToken)) {
      start = i;
      break;
    }
    if (isMentionBoundary(ch, multilineToken, mentionToken)) break;
  }
  if (start < 0) return null;

  let end = start + trigger.length;
  const next = value[end];
  if (next === '"' || next === "'") {
    const quote = next;
    end += 1;
    while (end < value.length && value[end] !== quote) end++;
    if (end < value.length && value[end] === quote) end++;
  } else {
    while (end < value.length && isMentionChar(value[end]!)) end++;
  }

  if (idx < start || idx > end) return null;

  const tokenText = value.slice(start, end);
  const queryEnd = clamp(idx, start + trigger.length, end);
  const query = value.slice(start + trigger.length, queryEnd);
  const key = `${start}:${tokenText}`;
  return { tokenStart: start, tokenEnd: end, tokenText, query, key, trigger };
}

export type UsePromptMentionStateOptions = Readonly<{
  props: Readonly<{
    promptSuggestions: readonly PromptSuggestion[];
    promptTrigger: string;
    promptTriggers?: readonly string[];
    promptMaxItems: number;
    promptAlign: "input" | "center";
    mentionTrigger: string;
    mentionWorkspace: string;
    mentionMode: PathPickMode;
    mentionShowHidden: boolean;
    mentionSuggestions: readonly PromptSuggestion[];
    mentionMaxItems: number;
    mentions: readonly string[];
    skillTrigger?: string;
    skillSuggestions?: readonly PromptSuggestion[];
  }>;
  mentionSuggestionProviders?: readonly MentionSuggestionProvider[];
  mentionPathProvider?: MentionPathProvider;
  focused: Ref<boolean>;
  cursor: Ref<number>;
  getValue: () => string;
  rawAbsRect: ComputedRef<Rect>;
  terminal: Terminal;
  scheduler: Readonly<{ invalidate: () => void }>;
  multilineToken: string;
  mentionToken: string;
}>;

export function usePromptMentionState(options: UsePromptMentionStateOptions): Readonly<{
  promptActive: Ref<number>;
  promptSuppressedKey: Ref<string | null>;
  mentionKindByPath: Map<string, "file" | "directory" | "other">;
  mentionKindVersion: Ref<number>;
  promptContext: ComputedRef<PromptContext | null>;
  mentionContext: ComputedRef<PromptContext | null>;
  activeContext: ComputedRef<PromptContext | null>;
  /** Full match list (not windowed). */
  promptMatches: ComputedRef<readonly PromptMatch[]>;
  /** Windowed list used for rendering and click mapping. */
  promptMatchesVisible: ComputedRef<readonly PromptMatch[]>;
  promptWindowStart: ComputedRef<number>;
  promptActiveVisible: ComputedRef<number>;
  promptVisible: ComputedRef<boolean>;
  promptRect: ComputedRef<Rect>;
}> {
  const {
    props,
    mentionSuggestionProviders,
    mentionPathProvider,
    focused,
    cursor,
    getValue,
    rawAbsRect,
    terminal,
    scheduler,
    multilineToken,
    mentionToken,
  } = options;

  const promptActive = ref(0);
  const promptSuppressedKey = ref<string | null>(null);
  const providerList = mentionSuggestionProviders ?? [];

  const mentionKindVersion = ref(0);
  const mentionKindByPath = new Map<string, "file" | "directory" | "other">();
  let mentionKindSeq = 0;

  function clearMentionKinds(): void {
    if (mentionKindByPath.size === 0) return;
    mentionKindByPath.clear();
    mentionKindVersion.value++;
    scheduler.invalidate();
  }

  watchEffect(() => {
    const list = (props.mentions ?? [])
      .map((p) => String(p ?? ""))
      .filter(Boolean)
      .filter((p) => !isCommitMention(p));
    const statPath = mentionPathProvider?.stat;
    if (!statPath || list.length === 0) {
      clearMentionKinds();
      return;
    }

    const seq = ++mentionKindSeq;
    void Promise.allSettled(
      list.map(async (absPath) => {
        const kind = await Promise.resolve(statPath(absPath));
        return { absPath, kind };
      }),
    )
      .then((results) => {
        if (seq !== mentionKindSeq) return;
        mentionKindByPath.clear();
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          if (!r.value.kind) continue;
          mentionKindByPath.set(r.value.absPath, r.value.kind);
        }
        mentionKindVersion.value++;
        scheduler.invalidate();
      })
      .catch(() => {
        if (seq !== mentionKindSeq) return;
        clearMentionKinds();
      });
  });

  const promptContext = computed(() => {
    if (!focused.value) return null;
    if (!props.promptSuggestions?.length) return null;
    const triggers = props.promptTriggers?.length
      ? props.promptTriggers
      : [props.promptTrigger || "/"];
    return computePromptContext(getValue(), cursor.value, triggers);
  });

  const mentionContext = computed(() => {
    if (!focused.value) return null;
    const hasStatic = props.mentionSuggestions?.length > 0;
    const hasDynamic = providerList.length > 0 || Boolean(mentionPathProvider?.suggest);
    if (!hasStatic && !hasDynamic) return null;
    return computeMentionContext(
      getValue(),
      cursor.value,
      props.mentionTrigger || "@",
      multilineToken,
      mentionToken,
    );
  });

  const skillContext = computed(() => {
    if (!focused.value) return null;
    const trigger = props.skillTrigger;
    if (!trigger || !props.skillSuggestions?.length) return null;
    return computeMentionContext(getValue(), cursor.value, trigger, multilineToken, mentionToken);
  });

  const activeContext = computed(
    () => mentionContext.value ?? skillContext.value ?? promptContext.value,
  );

  watch(
    () => activeContext.value?.key ?? null,
    (next, prev) => {
      if (prev && next !== prev) promptSuppressedKey.value = null;
    },
  );

  const mentionPathItems = ref<readonly PromptSuggestion[]>([]);
  let mentionSeq = 0;
  watchEffect((onCleanup) => {
    const ctx = mentionContext.value;
    const suggestPathsForMention = mentionPathProvider?.suggest;
    if (!ctx || !suggestPathsForMention) {
      mentionPathItems.value = [];
      return;
    }

    const seq = ++mentionSeq;
    const max = Math.max(0, Math.floor(props.mentionMaxItems));
    const q = ctx.query.trim();
    const maxDepth = q.length <= 1 ? 2 : q.length === 2 ? 4 : 8;
    let done = false;
    const timer = setTimeout(() => {
      void Promise.resolve(
        suggestPathsForMention({
          workspaceAbs: props.mentionWorkspace,
          input: ctx.query,
          mode: props.mentionMode,
          max,
          showHidden: props.mentionShowHidden,
          maxDepth,
        }),
      )
        .then((res) => {
          if (done || seq !== mentionSeq) return;
          mentionPathItems.value = (res ?? []).map((s) => ({
            value: `${props.mentionTrigger}${s.completion}`,
            insert: `${props.mentionTrigger}${s.completion} `,
            detail: s.kind,
            mentionValue: s.absPath,
          }));
          scheduler.invalidate();
        })
        .catch(() => {
          if (done || seq !== mentionSeq) return;
          mentionPathItems.value = [];
          scheduler.invalidate();
        });
    }, MENTION_SUGGEST_DEBOUNCE_MS);

    onCleanup(() => {
      done = true;
      clearTimeout(timer);
    });
  });

  const mentionProviderItems = ref<readonly PromptSuggestion[]>([]);
  let mentionProviderSeq = 0;
  watchEffect((onCleanup) => {
    const ctx = mentionContext.value;
    if (!ctx || providerList.length === 0) {
      mentionProviderItems.value = [];
      return;
    }

    const seq = ++mentionProviderSeq;
    const max = Math.max(0, Math.floor(props.mentionMaxItems));
    const trigger = props.mentionTrigger || "@";
    let done = false;
    const timer = setTimeout(() => {
      void Promise.all(
        providerList.map((provider) =>
          Promise.resolve(
            provider({
              query: ctx.query,
              tokenText: ctx.tokenText,
              trigger,
              workspace: props.mentionWorkspace,
              maxItems: max,
            }),
          ).catch(() => [] as const),
        ),
      )
        .then((results) => {
          if (done || seq !== mentionProviderSeq) return;
          const merged: PromptSuggestion[] = [];
          for (const list of results) {
            if (!list?.length) continue;
            merged.push(...list);
          }
          mentionProviderItems.value = merged;
          scheduler.invalidate();
        })
        .catch(() => {
          if (done || seq !== mentionProviderSeq) return;
          mentionProviderItems.value = [];
          scheduler.invalidate();
        });
    }, MENTION_SUGGEST_DEBOUNCE_MS);

    onCleanup(() => {
      done = true;
      clearTimeout(timer);
    });
  });

  const promptMatches = computed<readonly PromptMatch[]>(() => {
    const ctx = activeContext.value;
    if (!ctx) return [];

    const mentionTrigger = props.mentionTrigger || "@";
    const skillTrigger = props.skillTrigger || "";
    const isMention = ctx.tokenText.startsWith(mentionTrigger);
    const isSkill = !isMention && Boolean(skillTrigger && ctx.tokenText.startsWith(skillTrigger));
    const trigger = isMention ? mentionTrigger : isSkill ? skillTrigger : ctx.trigger;
    const pathItems = isMention ? (mentionPathItems.value as readonly PromptSuggestion[]) : [];
    const candidates = isMention
      ? [...(props.mentionSuggestions ?? []), ...mentionProviderItems.value]
      : isSkill
        ? (props.skillSuggestions ?? [])
        : (props.promptSuggestions ?? []);

    const q = ctx.query.trim();
    const pathMatches: PromptMatch[] = [];
    for (let i = 0; i < pathItems.length; i++) {
      const s = pathItems[i]!;
      const value = s.value || "";
      if (!value.startsWith(trigger)) continue;
      pathMatches.push({ item: s, score: 0, order: i });
    }

    const otherMatches: PromptMatch[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const s = candidates[i]!;
      const value = s.value || "";
      if (!value.startsWith(trigger)) continue;

      if (!q) {
        otherMatches.push({ item: s, score: 0, order: i });
        continue;
      }

      const commandText = value.slice(trigger.length);
      const valueScore = fuzzyScore(q, commandText);
      if (valueScore != null) {
        otherMatches.push({ item: s, score: valueScore + 1000, order: i });
        continue;
      }

      // Only fall back to label/detail/keywords for non-ASCII queries (e.g. localized labels).
      // eslint-disable-next-line no-control-regex
      if (!/[^\u0000-\u007F]/.test(q)) continue;

      const metaText = [s.label ?? "", s.detail ?? "", ...(s.keywords ?? [])].join(" ");
      const metaScore = fuzzyScore(q, metaText);
      if (metaScore != null) otherMatches.push({ item: s, score: metaScore, order: i });
    }

    if (!q) return [...pathMatches, ...otherMatches];

    otherMatches.sort((a, b) => b.score - a.score || a.order - b.order);
    return [...pathMatches, ...otherMatches];
  });

  watch(
    () => promptMatches.value.length,
    (len) => {
      promptActive.value = clamp(promptActive.value, 0, Math.max(0, len - 1));
    },
  );

  const promptMaxVisible = computed(() => {
    const ctx = activeContext.value;
    if (!ctx) return 0;
    const mentionTrigger = props.mentionTrigger || "@";
    const isMention = ctx.tokenText.startsWith(mentionTrigger);
    return Math.max(0, Math.floor(isMention ? props.mentionMaxItems : props.promptMaxItems));
  });

  const promptWindowStart = computed(() => {
    const total = promptMatches.value.length;
    const maxVisible = promptMaxVisible.value;
    if (total <= 0 || maxVisible <= 0) return 0;
    const visible = Math.min(maxVisible, total);
    const maxStart = Math.max(0, total - visible);
    return clamp(promptActive.value - (visible - 1), 0, maxStart);
  });

  const promptMatchesVisible = computed<readonly PromptMatch[]>(() => {
    const total = promptMatches.value.length;
    const maxVisible = promptMaxVisible.value;
    if (total <= 0 || maxVisible <= 0) return [];
    const visible = Math.min(maxVisible, total);
    const start = promptWindowStart.value;
    return promptMatches.value.slice(start, start + visible);
  });

  const promptActiveVisible = computed(() => {
    const start = promptWindowStart.value;
    const rel = promptActive.value - start;
    return clamp(rel, 0, Math.max(0, promptMatchesVisible.value.length - 1));
  });

  const promptVisible = computed(() => {
    const ctx = activeContext.value;
    if (!ctx) return false;
    if (promptSuppressedKey.value && promptSuppressedKey.value === ctx.key) return false;
    return true;
  });

  const promptRect = computed<Rect>(() => {
    const base = rawAbsRect.value;
    const s = terminal.size();
    const clip = { x: 0, y: 0, w: s.cols, h: s.rows };
    const listH = Math.max(1, promptMatchesVisible.value.length || 1);
    const h = clamp(2 + listH, 3, Math.max(3, Math.floor(clip.h)));
    const w = clamp(Math.floor(base.w), 0, Math.max(0, Math.floor(clip.w)));

    const preferAboveY = Math.floor(base.y) - h;
    const preferBelowY = Math.floor(base.y) + Math.floor(base.h);
    const aboveFits = preferAboveY >= Math.floor(clip.y);
    const belowFits = preferBelowY + h <= Math.floor(clip.y) + Math.floor(clip.h);
    const yPref = aboveFits ? preferAboveY : belowFits ? preferBelowY : preferAboveY;
    const y = clamp(yPref, Math.floor(clip.y), Math.floor(clip.y) + Math.floor(clip.h) - h);
    const align = props.promptAlign || "input";
    const baseX = Math.floor(base.x);
    const centeredX = Math.floor(Math.floor(clip.x) + Math.floor((Math.floor(clip.w) - w) / 2));
    const preferX = align === "center" ? centeredX : baseX;
    const x = clamp(preferX, Math.floor(clip.x), Math.floor(clip.x) + Math.floor(clip.w) - w);

    return { x, y, w, h };
  });

  return {
    promptActive,
    promptSuppressedKey,
    mentionKindByPath,
    mentionKindVersion,
    promptContext,
    mentionContext,
    activeContext,
    promptMatches,
    promptMatchesVisible,
    promptWindowStart,
    promptActiveVisible,
    promptVisible,
    promptRect,
  };
}
