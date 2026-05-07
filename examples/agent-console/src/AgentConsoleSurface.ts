import type {
  FramePerfSample,
  TerminalKeyboardEvent,
  TerminalRenderPlane,
} from "@simon_he/vue-tui";
import type {
  TLogViewHandle,
  TLogViewLinkActivatePayload,
  TLogViewLinkClickPayload,
  TLogViewLinkFocusPayload,
  TLogViewScrollMetrics,
  TLogViewScrollPayload,
  TLogViewSearchPayload,
  TLogViewSearchState,
  TLogViewVisibleLink,
} from "@simon_he/vue-tui/experimental";
import type { PropType, Ref } from "vue";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  watchEffect,
} from "vue";
import {
  TBox,
  TDialog,
  TInputBox,
  TRenderPlane,
  TText,
  TView,
  useTerminal,
} from "@simon_he/vue-tui";
import { TVirtualMarkdown } from "@simon_he/vue-tui/markdown";
import { TLogView } from "@simon_he/vue-tui/experimental";
import { handleAgentConsoleKeymap } from "./keymap";
import { createMockAgentStream, type AgentEvent } from "./mock-agent-stream";
import {
  createAgentTranscriptStore,
  type AgentReplayLog,
  type TranscriptLink,
  type TranscriptMode,
} from "./transcript-store";
import { logViewTheme, markdownTheme, styles } from "./theme";

export const AGENT_CONSOLE_LAYOUT = Object.freeze({
  cols: 118,
  rows: 36,
  status: { x: 0, y: 0, w: 118, h: 1 },
  transcript: { x: 0, y: 1, w: 118, h: 24 },
  chrome: { x: 0, y: 25, w: 118, h: 5 },
  input: { x: 0, y: 30, w: 118, h: 5 },
  footer: { x: 0, y: 35, w: 118, h: 1 },
  searchDialog: { w: 70, h: 9 },
  paletteDialog: { w: 72, h: 12 },
  linksDialog: { w: 84, h: 14 },
});

type OverlayName = "search" | "palette" | "links";

export type AgentConsoleApi = Readonly<{
  mode: Ref<TranscriptMode>;
  input: Ref<string>;
  searchQuery: Ref<string>;
  replayCursor: Ref<number>;
  replayTotal: Ref<number>;
  metrics: Ref<TLogViewScrollMetrics | null>;
  searchState: Ref<TLogViewSearchState>;
  seed: (count?: number) => void;
  appendSyntheticChunk: (index: number) => void;
  appendBurst: (count: number) => Promise<void>;
  captureReplayLog: () => AgentReplayLog;
  loadReplayLog: (log: AgentReplayLog, eventIndex?: number) => void;
  seekReplay: (eventIndex: number) => void;
  jumpToBottom: () => void;
  openSearch: (query?: string) => void;
  openLinks: () => void;
  openPalette: () => void;
  closeOverlay: () => void;
  toggleThinking: () => void;
  toggleToolCall: () => void;
  focusNextLink: () => boolean;
  getVisibleLinks: () => readonly TLogViewVisibleLink[];
  getFramePerfSamples: () => readonly FramePerfSample[];
  clearFramePerf: () => void;
  getInputValue: () => string;
  getTranscriptRows: () => readonly string[];
  getChromeRows: () => readonly string[];
  getTerminalSnapshot: () => readonly string[];
}>;

function fit(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width, " ");
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function searchStateFor(query: string): TLogViewSearchState {
  return {
    query,
    status: query ? "idle" : "idle",
    matchCount: 0,
    currentMatchIndex: -1,
    error: null,
  };
}

function rowTextFromTerminal(
  terminal: ReturnType<typeof useTerminal>["terminal"],
  y: number,
): string {
  return terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

export const AgentConsoleSurface = defineComponent({
  name: "AgentConsoleSurface",
  props: {
    autoStart: { type: Boolean, default: false },
    onReady: {
      type: Function as PropType<(api: AgentConsoleApi) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const terminalContext = useTerminal();
    const transcript = createAgentTranscriptStore();
    const logView = ref<TLogViewHandle | null>(null);
    const mode = ref<TranscriptMode>("log");
    const overlay = ref<OverlayName | null>(null);
    const input = ref("");
    const inputFocused = ref(false);
    const searchQuery = ref("");
    const searchDraft = ref("ERROR");
    const markdownScrollTop = ref(1_000_000);
    const markdownStickToBottom = ref(true);
    const metrics = ref<TLogViewScrollMetrics | null>(null);
    const searchState = ref<TLogViewSearchState>(searchStateFor(""));
    const visibleLinks = ref<readonly TLogViewVisibleLink[]>([]);
    const focusedLink = ref<TLogViewVisibleLink | null>(null);
    const lastActivatedLink = ref("");
    const thinkingExpanded = ref(true);
    const toolCallExpanded = ref(true);
    const streamState = ref<"connected" | "paused">("paused");
    const replayCursor = ref(0);
    const replayTotal = ref(0);
    const stream = createMockAgentStream(260);
    const streamIndex = ref(0);
    let replaySource: readonly AgentEvent[] | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let ready = false;

    terminalContext.observability.framePerf.enabled.value = true;

    const tokenRate = computed(() => {
      const chunks = transcript.stats.value.chunks;
      return `${Math.max(0, Math.round(chunks / 6))}/s`;
    });

    const scrollLabel = computed(() => {
      if (mode.value === "markdown") return markdownStickToBottom.value ? "bottom" : "detached";
      const current = metrics.value;
      if (!current) return "pending";
      return current.atBottom ? "bottom" : `detached:${current.scrollTop}`;
    });

    const activePlaneLabel = computed<TerminalRenderPlane>(() =>
      overlay.value ? "overlay" : inputFocused.value ? "default" : "transcript",
    );

    function syncReplayCursor(): void {
      replaySource = null;
      replayCursor.value = transcript.eventLog.value.length;
      replayTotal.value = transcript.eventLog.value.length;
    }

    function statusFrom(events: readonly AgentEvent[]): "connected" | "paused" {
      let state: "connected" | "paused" = "paused";
      for (const event of events) {
        if (event.type === "status") state = event.state;
      }
      return state;
    }

    function refreshMetrics(): void {
      const handle = logView.value;
      if (!handle) return;
      metrics.value = handle.getScrollMetrics();
    }

    function refreshLinks(): void {
      visibleLinks.value = logView.value?.getVisibleLinks() ?? [];
    }

    function refreshSearchState(): void {
      searchState.value = logView.value?.getSearchState() ?? searchStateFor(searchQuery.value);
    }

    function closeOverlay(): void {
      overlay.value = null;
    }

    function openSearch(query = searchQuery.value || searchDraft.value): void {
      searchDraft.value = query;
      searchQuery.value = query;
      overlay.value = "search";
      void nextTick(refreshSearchState);
    }

    function openPalette(): void {
      overlay.value = "palette";
    }

    function openLinks(): void {
      refreshLinks();
      overlay.value = "links";
    }

    function jumpToBottom(): void {
      if (mode.value === "markdown") {
        markdownStickToBottom.value = true;
        markdownScrollTop.value = 1_000_000;
        return;
      }
      logView.value?.scrollToBottom();
      refreshMetrics();
    }

    function toggleThinking(): void {
      thinkingExpanded.value = !thinkingExpanded.value;
    }

    function toggleToolCall(): void {
      toolCallExpanded.value = !toolCallExpanded.value;
    }

    function toggleMode(): void {
      mode.value = mode.value === "log" ? "markdown" : "log";
      if (mode.value === "markdown") markdownScrollTop.value = 1_000_000;
      void nextTick(() => {
        refreshMetrics();
        refreshLinks();
      });
    }

    function applyNextEvent(): void {
      transcript.apply(stream.next());
      streamIndex.value++;
      syncReplayCursor();
      if (mode.value === "markdown" && markdownStickToBottom.value) {
        markdownScrollTop.value = 1_000_000;
      }
      void nextTick(() => {
        refreshMetrics();
        refreshLinks();
      });
    }

    function startStream(): void {
      if (timer) return;
      streamState.value = "connected";
      transcript.apply({ type: "status", state: "connected" });
      syncReplayCursor();
      timer = setInterval(applyNextEvent, 12);
    }

    function stopStream(): void {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      streamState.value = "paused";
      transcript.apply({ type: "status", state: "paused" });
      syncReplayCursor();
    }

    function seed(count = 36): void {
      stopStream();
      stream.reset();
      streamIndex.value = 0;
      transcript.seed(count);
      syncReplayCursor();
      markdownScrollTop.value = 1_000_000;
      markdownStickToBottom.value = true;
      void nextTick(() => {
        jumpToBottom();
        refreshSearchState();
        refreshLinks();
      });
    }

    function appendSyntheticChunk(index: number): void {
      transcript.appendSyntheticChunk(index);
      syncReplayCursor();
      if (mode.value === "markdown" && markdownStickToBottom.value) {
        markdownScrollTop.value = 1_000_000;
      }
    }

    async function appendBurst(count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        appendSyntheticChunk(i);
        await nextTick();
      }
    }

    function loadReplayLog(log: AgentReplayLog, eventIndex = log.events.length): void {
      stopStream();
      replaySource = log.events.slice();
      const cursor = Math.max(0, Math.min(eventIndex, replaySource.length));
      transcript.loadReplayLog(log, cursor);
      streamState.value = statusFrom(replaySource.slice(0, cursor));
      replayCursor.value = cursor;
      replayTotal.value = replaySource.length;
      markdownScrollTop.value = 1_000_000;
      markdownStickToBottom.value = true;
      void nextTick(() => {
        jumpToBottom();
        refreshSearchState();
        refreshLinks();
      });
    }

    function seekReplay(eventIndex: number): void {
      loadReplayLog({ version: 1, events: replaySource ?? transcript.eventLog.value }, eventIndex);
    }

    function focusNextLink(): boolean {
      const focused = logView.value?.focusNextLink() ?? false;
      if (focused) {
        refreshLinks();
        focusedLink.value = logView.value?.getVisibleLinks().find((link) => link.focused) ?? null;
      }
      return focused;
    }

    function handleRootKeydown(event: TerminalKeyboardEvent): void {
      handleAgentConsoleKeymap(event, {
        inputFocused: () => inputFocused.value,
        overlayOpen: () => overlay.value != null,
        closeOverlay,
        openSearch,
        openPalette,
        openLinks,
        jumpToBottom,
        toggleMode,
        focusNextLink,
      });
    }

    function handleLogScroll(_payload: TLogViewScrollPayload): void {
      refreshMetrics();
    }

    function handleSearch(payload: TLogViewSearchPayload): void {
      searchState.value = {
        query: payload.query,
        status: payload.status,
        matchCount: payload.matchCount,
        currentMatchIndex: logView.value?.getSearchState().currentMatchIndex ?? -1,
        error: payload.error ?? null,
      };
    }

    function handleLinkFocus(payload: TLogViewLinkFocusPayload): void {
      focusedLink.value = payload.link;
      refreshLinks();
    }

    function handleLinkActivate(payload: TLogViewLinkActivatePayload): void {
      lastActivatedLink.value = payload.link.href;
      refreshLinks();
    }

    function handleLinkClick(payload: TLogViewLinkClickPayload): void {
      lastActivatedLink.value = payload.href;
      refreshLinks();
    }

    function handleMarkdownScroll(scrollTop: number): void {
      if (scrollTop < markdownScrollTop.value) markdownStickToBottom.value = false;
      markdownScrollTop.value = scrollTop;
    }

    function submitInput(value: string): void {
      const text = value.trim();
      if (!text) return;
      transcript.apply({ type: "user", text });
      input.value = "";
      syncReplayCursor();
      jumpToBottom();
    }

    function renderButton(
      key: string,
      x: number,
      y: number,
      w: number,
      label: string,
      onClick: () => void,
      selected = false,
    ) {
      const style = selected ? styles.button : styles.buttonMuted;
      return h(TView, { key, x, y, w, h: 1, focusable: true, onClick }, () =>
        h(TText, { x: 0, y: 0, w, value: fit(label, w), style }),
      );
    }

    function renderTranscript() {
      if (mode.value === "markdown") {
        return h(TVirtualMarkdown, {
          ...AGENT_CONSOLE_LAYOUT.transcript,
          content: transcript.markdown.value,
          blocks: transcript.markdownBlocks.value,
          scrollTop: markdownScrollTop.value,
          streaming: streamState.value === "connected",
          final: streamState.value !== "connected",
          theme: markdownTheme,
          style: styles.panel,
          autoFocus: !inputFocused.value && overlay.value == null,
          "onUpdate:scrollTop": (value: number) => {
            markdownScrollTop.value = value;
          },
          onScroll: handleMarkdownScroll,
        });
      }

      return h(TLogView, {
        ref: logView,
        ...AGENT_CONSOLE_LAYOUT.transcript,
        source: transcript.logStore.source,
        version: transcript.logStore.version.value,
        ...logViewTheme,
        wrap: true,
        ansi: true,
        links: true,
        keyboardLinks: true,
        visualIndexMode: "estimated",
        searchQuery: searchQuery.value,
        searchOptions: { mode: "text", caseSensitive: false, wholeWord: false },
        autoFocus: !inputFocused.value && overlay.value == null,
        autoStickToBottom: true,
        rowScrollMode: "off",
        onScroll: handleLogScroll,
        onSearch: handleSearch,
        onSearchMatch: refreshSearchState,
        onLinkFocus: handleLinkFocus,
        onLinkActivate: handleLinkActivate,
        onLinkClick: handleLinkClick,
        onVisualIndex: refreshMetrics,
      });
    }

    function renderChrome() {
      const stats = transcript.stats.value;
      const status = [
        `Agent Console`,
        `model=gpt-5.3-codex`,
        `state=${streamState.value}`,
        `mode=${mode.value}`,
        `replay=${replayCursor.value}/${replayTotal.value}`,
        `rate=${tokenRate.value}`,
        `scroll=${scrollLabel.value}`,
        `plane=${activePlaneLabel.value}`,
      ].join("  ");
      const search = searchState.value;
      const link = focusedLink.value?.href || lastActivatedLink.value || "none";
      const thinking = thinkingExpanded.value
        ? "▾ Thinking │ dirty background rows stay isolated"
        : "▸ Thinking";
      const toolCall = toolCallExpanded.value
        ? "▾ ● Run 3 commands  in:/out:/code-bg"
        : "▸ ● Run 3 commands";
      return [
        h(TText, {
          key: "status",
          ...AGENT_CONSOLE_LAYOUT.status,
          value: fit(status, AGENT_CONSOLE_LAYOUT.status.w),
          style: styles.status,
        }),
        h(TBox, {
          key: "chrome-box",
          ...AGENT_CONSOLE_LAYOUT.chrome,
          title: "Runtime",
          style: styles.panelBorder,
          clear: true,
        }),
        h(TText, {
          key: "metrics-1",
          x: 2,
          y: 26,
          w: 62,
          value: fit(
            `chunks=${stats.chunks} tokens=${stats.approxTokens} tools=${stats.toolRuns} errors=${stats.toolErrors}`,
            62,
          ),
          style: styles.muted,
        }),
        h(TText, {
          key: "metrics-2",
          x: 2,
          y: 27,
          w: 62,
          value: fit(
            `search="${search.query}" matches=${search.matchCount} status=${search.status}`,
            62,
          ),
          style: search.matchCount ? styles.ok : styles.muted,
        }),
        h(TText, {
          key: "metrics-3",
          x: 2,
          y: 28,
          w: 62,
          value: fit(`link=${link}`, 62),
          style: link === "none" ? styles.muted : styles.warn,
        }),
        renderButton(
          "mode",
          68,
          26,
          13,
          mode.value === "log" ? "Log" : "Markdown",
          toggleMode,
          true,
        ),
        renderButton("bottom", 83, 26, 16, "Jump bottom", jumpToBottom),
        renderButton("search", 101, 26, 8, "Search", () => openSearch()),
        renderButton("links", 111, 26, 7, "Links", openLinks),
        renderButton(
          "thinking",
          68,
          27,
          13,
          thinkingExpanded.value ? "▾ Thinking" : "▸ Thinking",
          toggleThinking,
          thinkingExpanded.value,
        ),
        renderButton(
          "tool-call",
          83,
          27,
          13,
          toolCallExpanded.value ? "▾ Run 3" : "▸ Run 3",
          toggleToolCall,
          toolCallExpanded.value,
        ),
        h(TText, {
          key: "thinking-state",
          x: 68,
          y: 28,
          w: 48,
          value: fit(thinking, 48),
          style: thinkingExpanded.value ? styles.thinking : styles.muted,
        }),
        h(TText, {
          key: "tool-call-state",
          x: 68,
          y: 29,
          w: 48,
          value: fit(toolCall, 48),
          style: toolCallExpanded.value ? styles.toolCall : styles.muted,
        }),
        h(TText, {
          key: "footer",
          ...AGENT_CONSOLE_LAYOUT.footer,
          value: fit(
            `last=${lastActivatedLink.value || "none"} input=${inputFocused.value ? "focus" : "idle"}`,
            118,
          ),
          style: styles.muted,
        }),
      ];
    }

    function renderInput() {
      return h(TInputBox, {
        ...AGENT_CONSOLE_LAYOUT.input,
        title: "Input",
        modelValue: input.value,
        placeholder: "Message the agent while streaming...",
        style: styles.input,
        autoFocus: true,
        cursorShape: "bar",
        "onUpdate:modelValue": (value: string) => {
          input.value = value;
        },
        onChange: submitInput,
        onFocus: () => {
          inputFocused.value = true;
        },
        onBlur: () => {
          inputFocused.value = false;
        },
      });
    }

    function renderSearchOverlay() {
      return h(
        TDialog,
        {
          modelValue: overlay.value === "search",
          "onUpdate:modelValue": (value: boolean) => {
            if (!value) closeOverlay();
          },
          ...AGENT_CONSOLE_LAYOUT.searchDialog,
          title: "Search Transcript",
          style: styles.dialog,
          titleStyle: styles.dialogTitle,
          backdropStyle: styles.backdrop,
          closeOnEsc: true,
        },
        {
          default: () => [
            h(TInputBox, {
              x: 0,
              y: 0,
              w: 64,
              h: 3,
              title: "Query",
              modelValue: searchDraft.value,
              autoFocus: true,
              style: styles.input,
              cursorShape: "bar",
              "onUpdate:modelValue": (value: string) => {
                searchDraft.value = value;
                searchQuery.value = value;
              },
              onChange: (value: string) => {
                searchQuery.value = value;
                refreshSearchState();
              },
            }),
            h(TText, {
              x: 0,
              y: 4,
              w: 64,
              value: fit(
                `matches=${searchState.value.matchCount} current=${searchState.value.currentMatchIndex}`,
                64,
              ),
              style: styles.muted,
            }),
            h(TText, {
              x: 0,
              y: 5,
              w: 64,
              value: fit(`mode=${mode.value} scroll=${scrollLabel.value}`, 64),
              style: styles.muted,
            }),
          ],
        },
      );
    }

    function renderPaletteOverlay() {
      const rows = [
        ["Switch transcript mode", toggleMode],
        [
          streamState.value === "connected" ? "Pause stream" : "Resume stream",
          () => (timer ? stopStream() : startStream()),
        ],
        ["Jump to bottom", jumpToBottom],
        ["Open search", () => openSearch()],
        ["Open links", openLinks],
        ["Toggle thinking", toggleThinking],
        ["Toggle tool_call", toggleToolCall],
        ["Append 1000 chunks", () => void appendBurst(1_000)],
      ] as const;
      return h(
        TDialog,
        {
          modelValue: overlay.value === "palette",
          "onUpdate:modelValue": (value: boolean) => {
            if (!value) closeOverlay();
          },
          ...AGENT_CONSOLE_LAYOUT.paletteDialog,
          title: "Command Palette",
          style: styles.dialog,
          titleStyle: styles.dialogTitle,
          backdropStyle: styles.backdrop,
          closeOnEsc: true,
        },
        {
          default: () =>
            rows.map(([label, action], index) =>
              h(
                TView,
                {
                  key: label,
                  x: 0,
                  y: index,
                  w: 66,
                  h: 1,
                  focusable: true,
                  onClick: () => {
                    action();
                    if (label !== "Open search" && label !== "Open links") closeOverlay();
                  },
                  onKeydown: (event: TerminalKeyboardEvent) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    action();
                    if (label !== "Open search" && label !== "Open links") closeOverlay();
                  },
                },
                () =>
                  h(TText, {
                    x: 0,
                    y: 0,
                    w: 66,
                    value: fit(label, 66),
                    style: index === 0 ? styles.button : styles.buttonMuted,
                  }),
              ),
            ),
        },
      );
    }

    function linkRows(): readonly TranscriptLink[] {
      const visible = visibleLinks.value.map((link) => ({
        label: link.text || link.href,
        href: link.href,
        source: "log" as const,
      }));
      return visible.length ? visible : transcript.links.value;
    }

    function renderLinksOverlay() {
      const rows = linkRows().slice(0, 9);
      return h(
        TDialog,
        {
          modelValue: overlay.value === "links",
          "onUpdate:modelValue": (value: boolean) => {
            if (!value) closeOverlay();
          },
          ...AGENT_CONSOLE_LAYOUT.linksDialog,
          title: "Links",
          style: styles.dialog,
          titleStyle: styles.dialogTitle,
          backdropStyle: styles.backdrop,
          closeOnEsc: true,
        },
        {
          default: () =>
            rows.length
              ? rows.map((link, index) =>
                  h(TText, {
                    key: `${link.href}:${index}`,
                    x: 0,
                    y: index,
                    w: 78,
                    value: fit(`${index + 1}. [${link.source}] ${link.label} -> ${link.href}`, 78),
                    style: styles.buttonMuted,
                  }),
                )
              : [
                  h(TText, {
                    x: 0,
                    y: 0,
                    w: 78,
                    value: "No visible links yet.",
                    style: styles.muted,
                  }),
                ],
        },
      );
    }

    const api: AgentConsoleApi = {
      mode,
      input,
      searchQuery,
      replayCursor,
      replayTotal,
      metrics,
      searchState,
      seed,
      appendSyntheticChunk,
      appendBurst,
      captureReplayLog: transcript.captureReplayLog,
      loadReplayLog,
      seekReplay,
      jumpToBottom,
      openSearch,
      openLinks,
      openPalette,
      closeOverlay,
      toggleThinking,
      toggleToolCall,
      focusNextLink,
      getVisibleLinks: () => logView.value?.getVisibleLinks() ?? [],
      getFramePerfSamples: () => terminalContext.observability.framePerf.list(),
      clearFramePerf: () => terminalContext.observability.framePerf.clear(),
      getInputValue: () => input.value,
      getTranscriptRows: () =>
        Array.from({ length: AGENT_CONSOLE_LAYOUT.transcript.h }, (_, index) =>
          rowTextFromTerminal(terminalContext.terminal, AGENT_CONSOLE_LAYOUT.transcript.y + index),
        ),
      getChromeRows: () =>
        Array.from({ length: AGENT_CONSOLE_LAYOUT.chrome.h }, (_, index) =>
          rowTextFromTerminal(terminalContext.terminal, AGENT_CONSOLE_LAYOUT.chrome.y + index),
        ),
      getTerminalSnapshot: () => terminalContext.terminal.snapshot().lines,
    };

    watch(
      () => transcript.markdownBlocks.value,
      () => {
        if (mode.value !== "markdown" || !markdownStickToBottom.value) return;
        markdownScrollTop.value = 1_000_000;
      },
    );

    watchEffect(() => {
      if (ready) return;
      ready = true;
      props.onReady?.(api);
    });

    seed(60);
    if (props.autoStart) startStream();

    onBeforeUnmount(() => {
      stopStream();
    });

    return () =>
      h(
        TView,
        {
          x: 0,
          y: 0,
          w: AGENT_CONSOLE_LAYOUT.cols,
          h: AGENT_CONSOLE_LAYOUT.rows,
          onKeydownCapture: handleRootKeydown,
        },
        () => [
          h(TRenderPlane, { plane: "transcript" }, () => renderTranscript()),
          h(TRenderPlane, { plane: "chrome" }, () => renderChrome()),
          h(TRenderPlane, { plane: "default" }, () => renderInput()),
          h(TRenderPlane, { plane: "overlay" }, () => [
            renderSearchOverlay(),
            renderPaletteOverlay(),
            renderLinksOverlay(),
          ]),
        ],
      );
  },
});
